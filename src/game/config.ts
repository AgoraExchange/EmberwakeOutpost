import type { EnemyConfig, SaveData, Settings, UpgradeCategory, UpgradeConfig, UpgradeId } from './types';

export const BRAND = {
  title: 'Emberwake Outpost',
  shortTitle: 'Emberwake',
  tagline: 'Keep the fire. Feed the frontier.',
  saveFilename: 'emberwake-outpost-save.json',
  colors: {
    snow: 0xd7edf5,
    snowShadow: 0x7faabe,
    ice: 0x4f9fc7,
    ink: 0x123246,
    wood: 0x8b5537,
    ember: 0xff8d47,
    gold: 0xffd166,
    meat: 0xe75b4b,
    fish: 0x55d7d7,
    danger: 0xd84c52,
    safe: 0x78dfad,
    outline: 0x123a4d,
    outlineSoft: 0x2c5468,
    snowHighlight: 0xf4fdff,
    ao: 0x0a2331,
    // Warm packed earth separates the working yard from the surrounding ice.
    yard: 0xbda17e,
    yardEdge: 0x85715a,
    yardPath: 0xd1b998,
    fieldSnow: 0xbcdce8,
    timber: 0x8a5637,
    timberDark: 0x5d3826
  }
} as const;

export const CATEGORY_COLORS: Record<UpgradeCategory, number> = {
  combat: 0xe2574c,
  survival: 0x5fae7a,
  carrying: 0xd9a441,
  production: 0xdb7b3f,
  hospitality: 0xd6608a,
  defense: 0x4d7fae
};

export const UPGRADE_CATEGORY: Record<UpgradeId, UpgradeCategory> = {
  weaponDamage: 'combat',
  attackSpeed: 'combat',
  weaponTier: 'combat',
  maxHealth: 'survival',
  moveSpeed: 'survival',
  furnace: 'survival',
  infirmary: 'survival',
  capacity: 'carrying',
  magnet: 'carrying',
  butcherSpeed: 'production',
  rawStorage: 'production',
  worker: 'production',
  counterCapacity: 'hospitality',
  customerFlow: 'hospitality',
  saleValue: 'hospitality',
  defense: 'defense'
};

export const WORLD = {
  // Roughly eight times the original explorable area (59.5m vs 7.5m world units).
  width: 9600,
  height: 6200,
  playerRadius: 24,
  // A large walled compound divided into working districts. The only ways through the
  // palisade are the east gateway (y 780-960) and the south shoreline gap (x 920-1100).
  camp: { x: 300, y: 300, width: 1450, height: 1150 },
  furnace: { x: 980, y: 1150 },
  // Set well clear of the shoreline plate so a fresh respawn never lands on it.
  respawn: { x: 830, y: 1250 },
  campGate: { x: 1738, y: 870 },
  zoneGate: { x: 2550, y: 900 },
  glacierGate: { x: 4400, y: 2200 },
  whiteoutGate: { x: 6800, y: 3800 },
  // Mess hall district: guests queue south of the counter, the Trailwarden works the
  // north side, and the strongbox sits off in the corner so it is never clipped.
  counter: { x: 720, y: 620 },
  servePad: { x: 720, y: 500 },
  cashZone: { x: 420, y: 420 },
  // Cookout district: the drop pad sits behind the grill.
  butcher: { x: 1200, y: 570 },
  butcherInput: { x: 1200, y: 430 },
  butcherOutput: { x: 1360, y: 670 },
  // Shoreline district, beyond the south wall.
  fishDock: { x: 620, y: 1900 },
  fishStation: { x: 980, y: 1760 },
  fishCounter: { x: 1120, y: 1860 },
  // Timber post in the gate yard: the opening income, before any hunting.
  timberPost: { x: 1480, y: 1010 },
  safeRadiusBase: 265,
  fixedStep: 1 / 60,
  maxFrameDelta: 0.2
} as const;

/**
 * Working districts inside the palisade. Purely a presentation and layout aid — each
 * is painted as a subtly distinct floor patch with a sign, so the compound reads as
 * managed areas rather than one open yard. None of them affect collision.
 */
export const ZONES = [
  { label: 'MESS HALL', x: 470, y: 360, width: 520, height: 460, tint: 0x8aa2aa },
  { label: 'COOKOUT', x: 1030, y: 350, width: 420, height: 420, tint: 0x907f78 },
  { label: 'STORES', x: 360, y: 900, width: 420, height: 330, tint: 0x76929e },
  { label: 'GATE YARD', x: 1410, y: 620, width: 320, height: 500, tint: 0x7f99a3 },
  { label: 'HEARTH', x: 810, y: 1010, width: 470, height: 400, tint: 0xa58f7b }
] as const;

export const DEFAULT_SETTINGS: Settings = {
  masterVolume: 0.72,
  musicVolume: 0.38,
  sfxVolume: 0.72,
  haptics: true,
  reducedMotion: false,
  quality: 'high',
  joystick: 'floating'
};

export const ENEMIES: Record<'rimeback' | 'icehorn' | 'raider', EnemyConfig> = {
  rimeback: {
    name: 'Rimeback', health: 52, damage: 19, speed: 88, aggroRange: 245, leashRange: 470,
    attackRange: 57, windup: 0.58, attackCooldown: 1.38, meatYield: 4, respawn: 16,
    color: 0xf2f4ed, accent: 0x7895aa, scale: 1
  },
  icehorn: {
    name: 'Icehorn', health: 112, damage: 28, speed: 96, aggroRange: 280, leashRange: 540,
    attackRange: 66, windup: 0.52, attackCooldown: 1.22, meatYield: 8, respawn: 22,
    color: 0xa6d7e5, accent: 0x365c82, scale: 1.16
  },
  raider: {
    name: 'Frenzied Rimeback', health: 72, damage: 16, speed: 105, aggroRange: 999, leashRange: 999,
    attackRange: 60, windup: 0.7, attackCooldown: 1.5, meatYield: 2, respawn: 999,
    color: 0xd6e9e6, accent: 0xb34f50, scale: 1.04
  }
};

/** The Armory chain. Each plate purchase advances the Trailwarden one rung. */
export const WEAPON_NAMES = ['Frost blade', 'Trail axe', 'Ember pike', 'Arc brand', 'Bolt gun'] as const;
export const WEAPON_ICONS = ['†', '⚒', '⇑', '⚡', '➤'] as const;
/** The rung at which the weapon starts firing projectiles instead of swinging. */
export const WEAPON_RANGED_TIER = 4;

/** Existing defense save levels map directly onto the new compound defenses. */
export const DEFENSE_TIERS = [
  { name: 'No defenses', kind: 'spear', count: 0, damage: 0, range: 0, cadence: 1 },
  { name: 'Spear watch', kind: 'spear', count: 2, damage: 15, range: 190, cadence: 1.2 },
  { name: 'Archer tower', kind: 'archer', count: 1, damage: 25, range: 480, cadence: .9 },
  { name: 'Twin archer towers', kind: 'archer', count: 2, damage: 29, range: 540, cadence: .8 },
  { name: 'Auto turrets', kind: 'turret', count: 2, damage: 19, range: 620, cadence: .32 },
  { name: 'Ember batteries', kind: 'turret', count: 2, damage: 28, range: 720, cadence: .24 }
] as const;

export function defenseTierFor(level: number) {
  return DEFENSE_TIERS[Math.max(0, Math.min(DEFENSE_TIERS.length - 1, Math.floor(level)))]!;
}

export const UPGRADES: UpgradeConfig[] = [
  { id: 'weaponDamage', label: 'Edge', icon: '✦', description: 'Sharper hits', baseCost: 26, costScale: 1.72, maxLevel: 8, effectText: l => `${8 + l * 3} damage` },
  { id: 'attackSpeed', label: 'Tempo', icon: '»', description: 'Faster attacks', baseCost: 42, costScale: 1.76, maxLevel: 6, effectText: l => `${(0.78 * Math.pow(0.9, l)).toFixed(2)}s cadence` },
  { id: 'weaponTier', label: 'Armory', icon: '⚒', description: 'Stronger, longer, slightly faster attacks', baseCost: 72, costScale: 2.05, maxLevel: 4, effectText: l => `${WEAPON_NAMES[l] ?? WEAPON_NAMES[WEAPON_NAMES.length - 1]!} · damage + speed`, iconForLevel: l => WEAPON_ICONS[Math.min(l + 1, WEAPON_ICONS.length - 1)]! },
  { id: 'maxHealth', label: 'Vigor', icon: '♥', description: 'More max health', baseCost: 38, costScale: 1.7, maxLevel: 7, effectText: l => `${100 + l * 22} health` },
  { id: 'moveSpeed', label: 'Boots', icon: '↟', description: 'Responsive movement', baseCost: 48, costScale: 1.78, maxLevel: 5, effectText: l => `${210 + l * 14} speed` },
  { id: 'capacity', label: 'Pack', icon: '▰', description: 'Carry more cargo', baseCost: 24, costScale: 1.63, maxLevel: 8, effectText: l => `${4 + l * 3} cargo` },
  { id: 'magnet', label: 'Gather', icon: '◎', description: 'Wider pickup pull', baseCost: 34, costScale: 1.68, maxLevel: 6, effectText: l => `${95 + l * 22} radius` },
  { id: 'butcherSpeed', label: 'Grill', icon: '♨', description: 'Faster meat meals', baseCost: 44, costScale: 1.8, maxLevel: 7, effectText: l => `${(2.15 * Math.pow(0.84, l)).toFixed(1)}s cook` },
  { id: 'rawStorage', label: 'Cold store', icon: '▣', description: 'More raw storage', baseCost: 47, costScale: 1.66, maxLevel: 6, effectText: l => `${10 + l * 6} storage` },
  { id: 'counterCapacity', label: 'Counter', icon: '▤', description: 'More ready meals', baseCost: 52, costScale: 1.7, maxLevel: 6, effectText: l => `${4 + l * 3} meals` },
  { id: 'customerFlow', label: 'Beacon', icon: '⌁', description: 'Faster arrivals for an eight-villager queue', baseCost: 58, costScale: 1.76, maxLevel: 6, effectText: l => `8 guests · ${Math.max(.18, .62 - l * .065).toFixed(2)}s arrival stagger` },
  { id: 'saleValue', label: 'Recipes', icon: '◆', description: 'Better meal value', baseCost: 76, costScale: 1.84, maxLevel: 6, effectText: l => `$${4 + l * 2} / meal` },
  { id: 'worker', label: 'Cook', icon: '♟', description: 'Hire a cook to carry meals to villagers; upgrade for faster four-meal deliveries', baseCost: 108, costScale: 2.25, maxLevel: 2, effectText: l => l === 0 ? 'Manual meal delivery' : l === 1 ? 'Cook delivers 2 meals per trip' : 'Fast cook delivers 4 meals per trip' },
  { id: 'defense', label: 'Defense', icon: '⌾', description: 'Spear guards → archer towers → automatic turrets', baseCost: 96, costScale: 1.92, maxLevel: 5, effectText: l => `${defenseTierFor(l).name} · ${220 + l * 70} gate HP`, iconForLevel: l => l < 1 ? '⚔' : l < 3 ? '➶' : '⌾' },
  { id: 'furnace', label: 'Furnace', icon: '♨', description: 'Expand warm safety', baseCost: 102, costScale: 1.88, maxLevel: 5, effectText: l => `${265 + l * 40} warm radius` },
  { id: 'infirmary', label: 'Infirmary', icon: '+', description: 'Faster healing and respawn', baseCost: 84, costScale: 1.85, maxLevel: 4, effectText: l => `${4 + l * 2} HP/s · ${Math.max(0.85, 2 - l * 0.28).toFixed(1)}s respawn` }
];

export const UPGRADE_BY_ID = Object.fromEntries(UPGRADES.map(item => [item.id, item])) as Record<UpgradeId, UpgradeConfig>;

export interface UpgradeGate {
  /** Shown to the player when the plate is still dormant. */
  hint: string;
  met: (save: SaveData) => boolean;
}

function totalUpgrades(save: SaveData): number {
  return UPGRADES.reduce((sum, upgrade) => sum + save.upgrades[upgrade.id], 0);
}

/**
 * Plates stay dormant until the run has earned them, so the yard opens with a
 * couple of obvious choices instead of sixteen competing ones. Every condition is
 * derived from existing save data, so no schema change and no migration is needed.
 * An upgrade with no entry here is available from the first second.
 */
export const UPGRADE_GATES: Partial<Record<UpgradeId, UpgradeGate>> = {
  // Edge, Grill and Counter are open from the first minute alongside the pinned Armory,
  // so the compound starts with a small live set rather than a single lonely plate.
  attackSpeed: { hint: 'Buy any upgrade', met: save => totalUpgrades(save) >= 1 },
  moveSpeed: { hint: 'Buy 2 upgrades', met: save => totalUpgrades(save) >= 2 },
  magnet: { hint: 'Defeat 4 Rimebacks', met: save => save.stats.bearsDefeated >= 4 },
  rawStorage: { hint: 'Sell 6 meals', met: save => save.stats.mealsSold >= 6 },
  saleValue: { hint: 'Sell 12 meals', met: save => save.stats.mealsSold >= 12 },
  maxHealth: { hint: 'Defeat 8 frostwild', met: save => save.stats.bearsDefeated >= 8 },
  customerFlow: { hint: 'Sell 18 meals', met: save => save.stats.mealsSold >= 18 },
  infirmary: { hint: 'Buy 2 upgrades', met: save => totalUpgrades(save) >= 2 || save.stats.deaths >= 1 },
  // The Armory has its own permanent plate in the gate yard and is open from the start.
  furnace: { hint: 'Open the Eastern Frontier', met: save => save.unlocks.zone2 },
};

export function isUpgradeAvailable(id: UpgradeId, save: SaveData): boolean {
  const gate = UPGRADE_GATES[id];
  return gate ? gate.met(save) : true;
}

/** The timber chain: fell a tree, haul the logs, sell them at the post. */
export const TIMBER = {
  /** Chops needed to fell one tree. */
  treeHealth: 4,
  /** Seconds between chops. */
  chopCadence: 0.42,
  /** Logs a felled tree yields. */
  logYield: 3,
  /** Seconds before a felled tree grows back. */
  regrowSeconds: 14,
  /** Cash per log at the timber post. */
  logValue: 8,
  /** Seconds between each log sold, so the sale visibly streams. */
  sellCadence: 0.09
} as const;

export const ECONOMY = {
  bearCashDrop: 6,
  zone2Cost: 140,
  dockCost: 285,
  glacierCost: 650,
  whiteoutCost: 1600,
  // Hospitality pays, but timber remains the dependable core income. Food also
  // requires hunting, cooking, hauling, a live guest, and a final cash pickup.
  baseMealValue: 4,
  fishMealValue: 9,
  fishCatchSeconds: 3.2,
  fishProcessSeconds: 4.2,
  autosaveSeconds: 8,
  raidFirstEarnedCash: 180,
  raidCooldown: 155,
  raidWarning: 11,
  // A breached pack attacks the Cookout's profit stock. Difficulty rises with
  // completed surges but caps so recovery always remains possible.
  raidPillageBase: 6,
  raidPillagePerWin: 2,
  raidPillageCap: 14
} as const;
