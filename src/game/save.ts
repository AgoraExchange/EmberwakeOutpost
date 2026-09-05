import { createDefaultSave, upgradeCost } from './rules';
import type { SaveData, Settings, UpgradeId } from './types';
import { ECONOMY, UPGRADES } from './config';

const DB_NAME = 'emberwake-outpost';
const STORE_NAME = 'saves';
const SAVE_KEY = 'primary';
const FALLBACK_KEY = 'emberwake-save-v2';

interface LegacySaveV1 {
  version: 1;
  coins?: number;
  cash?: number;
  levels?: Partial<Record<UpgradeId, number>>;
  upgrades?: Partial<Record<UpgradeId, number>>;
  zone2?: boolean;
  tutorial?: SaveData['tutorial'];
  settings?: Partial<Settings>;
}

function finiteNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/** Keeps a saved call-sign compact, readable, and safe to render in UI text. */
export function normalizeTrailwardenName(value: unknown): string {
  if (typeof value !== 'string') return '';
  return [...value]
    .filter(character => {
      const code = character.charCodeAt(0);
      return code >= 32 && code !== 127;
    })
    .join('')
    .trim()
    .replace(/\s+/g, ' ')
    .slice(0, 18);
}

export function migrateSave(input: unknown): SaveData {
  const defaults = createDefaultSave();
  if (!input || typeof input !== 'object') return defaults;
  const source = input as Partial<SaveData> & LegacySaveV1;

  if (source.version === 1) {
    const legacyLevels = source.upgrades ?? source.levels ?? {};
    for (const config of UPGRADES) {
      defaults.upgrades[config.id] = Math.max(0, Math.min(config.maxLevel, Math.floor(finiteNumber(legacyLevels[config.id], 0))));
    }
    defaults.cash = Math.max(0, Math.floor(finiteNumber(source.cash ?? source.coins, 0)));
    defaults.unlocks.zone2 = Boolean(source.zone2);
    defaults.tutorial = source.tutorial ?? defaults.tutorial;
    defaults.settings = { ...defaults.settings, ...source.settings };
    return defaults;
  }

  if (source.version !== 2 && source.version !== 3 && source.version !== 4 && source.version !== 5 && source.version !== 6 && source.version !== 7 && source.version !== 8) return defaults;
  const next = structuredClone(defaults);
  next.updatedAt = finiteNumber(source.updatedAt, Date.now());
  next.trailwardenName = normalizeTrailwardenName(source.trailwardenName);
  next.cash = Math.max(0, Math.floor(finiteNumber(source.cash, 0)));
  for (const config of UPGRADES) {
    next.upgrades[config.id] = Math.max(0, Math.min(config.maxLevel, Math.floor(finiteNumber(source.upgrades?.[config.id], 0))));
  }
  next.unlocks = { ...defaults.unlocks, ...(source.unlocks ?? {}) };
  for (const config of UPGRADES) {
    if (next.upgrades[config.id] >= config.maxLevel) continue;
    const paid = Math.max(0, Math.min(upgradeCost(config.id, next.upgrades[config.id]) - 1,
      Math.floor(finiteNumber(source.contributions?.[config.id], 0))));
    if (paid > 0) next.contributions[config.id] = paid;
  }
  const projects = { zone2: 30, dock: 45, glacier: ECONOMY.glacierCost, whiteout: ECONOMY.whiteoutCost };
  for (const kind of Object.keys(projects) as Array<keyof typeof projects>) {
    if (next.unlocks[kind]) continue;
    const paid = Math.max(0, Math.min(projects[kind] - 1, Math.floor(finiteNumber(source.contributions?.[kind], 0))));
    if (paid > 0) next.contributions[kind] = paid;
  }
  next.station = {
    cookMeals: Math.max(0, Math.min(4, Math.floor(finiteNumber(source.station?.cookMeals, 0)))),
    rawMeat: Math.max(0, Math.floor(finiteNumber(source.station?.rawMeat, 0))),
    meals: Math.max(0, Math.floor(finiteNumber(source.station?.meals, 0))),
    rawFish: Math.max(0, Math.floor(finiteNumber(source.station?.rawFish, 0))),
    fishMeals: Math.max(0, Math.floor(finiteNumber(source.station?.fishMeals, 0))),
    butcherProgress: Math.max(0, finiteNumber(source.station?.butcherProgress, 0)),
    fishProgress: Math.max(0, finiteNumber(source.station?.fishProgress, 0)),
    fisherProgress: Math.max(0, finiteNumber(source.station?.fisherProgress, 0)),
    oreProgress: Math.max(0, finiteNumber(source.station?.oreProgress, 0)),
    lumber: Math.max(0, Math.min(300, Math.floor(finiteNumber(source.station?.lumber, 0)))),
    lumberProgress: Math.max(0, finiteNumber(source.station?.lumberProgress, 0)),
    hunterProgress: Math.max(0, finiteNumber(source.station?.hunterProgress, 0)),
    passiveCash: Math.max(0, Math.floor(finiteNumber(source.station?.passiveCash, 0)))
  };
  next.tutorial = source.tutorial ?? defaults.tutorial;
  next.stats = {
    bearsDefeated: Math.max(0, Math.floor(finiteNumber(source.stats?.bearsDefeated, 0))),
    totalCashEarned: Math.max(0, Math.floor(finiteNumber(source.stats?.totalCashEarned, 0))),
    mealsSold: Math.max(0, Math.floor(finiteNumber(source.stats?.mealsSold, 0))),
    fishCaught: Math.max(0, Math.floor(finiteNumber(source.stats?.fishCaught, 0))),
    deaths: Math.max(0, Math.floor(finiteNumber(source.stats?.deaths, 0))),
    raidsWon: Math.max(0, Math.floor(finiteNumber(source.stats?.raidsWon, 0))),
    raidsFaced: Math.max(0, Math.floor(finiteNumber(source.stats?.raidsFaced, source.stats?.raidsWon ?? 0))),
    playSeconds: Math.max(0, finiteNumber(source.stats?.playSeconds, 0)),
    // Added after v2. Absent in older saves, which migrate in at zero.
    woodChopped: Math.max(0, Math.floor(finiteNumber(source.stats?.woodChopped, 0))),
    woodSold: Math.max(0, Math.floor(finiteNumber(source.stats?.woodSold, 0)))
  };
  next.settings = { ...defaults.settings, ...(source.settings ?? {}) };
  return next;
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (!('indexedDB' in globalThis)) return reject(new Error('IndexedDB unavailable'));
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE_NAME)) request.result.createObjectStore(STORE_NAME);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Unable to open save database'));
  });
}

async function idbRead(): Promise<unknown> {
  const db = await openDatabase();
  try {
    return await new Promise((resolve, reject) => {
      const request = db.transaction(STORE_NAME, 'readonly').objectStore(STORE_NAME).get(SAVE_KEY);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  } finally { db.close(); }
}

async function idbWrite(data: SaveData): Promise<void> {
  const db = await openDatabase();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readwrite');
      transaction.objectStore(STORE_NAME).put(data, SAVE_KEY);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error ?? new Error('Save write aborted'));
    });
  } finally { db.close(); }
}

export async function loadSave(): Promise<SaveData> {
  let databaseRaw: unknown;
  let fallbackRaw: unknown;
  try { databaseRaw = await idbRead(); } catch { /* fallback below */ }
  try {
    const saved = localStorage.getItem(FALLBACK_KEY);
    if (saved) fallbackRaw = JSON.parse(saved);
  } catch { /* private browsing can block storage */ }
  const timestamp = (value: unknown): number => value && typeof value === 'object'
    ? finiteNumber((value as { updatedAt?: unknown }).updatedAt, 0) : 0;
  // A tab may close after the synchronous fallback but before IndexedDB commits.
  // Always resume the newest complete snapshot from either device store.
  return migrateSave(timestamp(fallbackRaw) > timestamp(databaseRaw) ? fallbackRaw : databaseRaw ?? fallbackRaw);
}

export async function saveProgress(data: SaveData): Promise<void> {
  const snapshot = migrateSave({ ...data, updatedAt: Date.now() });
  // Write the synchronous fallback first so pagehide/close cannot interrupt before
  // the current timestamp and production stock reach durable device storage.
  try { localStorage.setItem(FALLBACK_KEY, JSON.stringify(snapshot)); } catch { /* storage may be unavailable */ }
  try { await idbWrite(snapshot); } catch { /* synchronous fallback already written */ }
}

export function exportSave(data: SaveData): string {
  return JSON.stringify(migrateSave(data), null, 2);
}

export function importSave(text: string): SaveData {
  const parsed: unknown = JSON.parse(text);
  if (!parsed || typeof parsed !== 'object' || !('version' in parsed)) throw new Error('This file is not an Emberwake save.');
  const version = (parsed as { version?: unknown }).version;
  if (version !== 1 && version !== 2 && version !== 3 && version !== 4 && version !== 5 && version !== 6 && version !== 7 && version !== 8) throw new Error('This save was created by an unsupported Emberwake version.');
  return migrateSave(parsed);
}

export async function resetStoredProgress(): Promise<SaveData> {
  const clean = createDefaultSave();
  await saveProgress(clean);
  return clean;
}
