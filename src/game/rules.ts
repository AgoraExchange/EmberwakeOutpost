import { DEFAULT_SETTINGS, ECONOMY, UPGRADES, UPGRADE_BY_ID } from './config';
import type { SaveData, UpgradeId } from './types';
import { createRobotState } from './robotRules';

export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function distanceSquared(ax: number, ay: number, bx: number, by: number): number {
  const dx = ax - bx;
  const dy = ay - by;
  return dx * dx + dy * dy;
}

export function normalize(x: number, y: number): { x: number; y: number; magnitude: number } {
  const magnitude = Math.hypot(x, y);
  if (magnitude < 0.0001) return { x: 0, y: 0, magnitude: 0 };
  return { x: x / magnitude, y: y / magnitude, magnitude };
}

export function upgradeCost(id: UpgradeId, currentLevel: number): number {
  const config = UPGRADE_BY_ID[id];
  return Math.round(config.baseCost * Math.pow(config.costScale, currentLevel));
}

export function capacityFor(level: number): number { return 4 + level * 3; }
export function maxHealthFor(level: number): number { return 100 + level * 22; }
export function healingPerSecondFor(infirmaryLevel: number): number { return 4 + Math.max(0, infirmaryLevel) * 2; }
export function moveSpeedFor(level: number): number { return Math.min(280, 210 + level * 14); }
export function weaponDamageFor(level: number, tier: number): number {
  const tierBonus = [0, 5, 10, 15, 20, 48, 82, 28, 36][tier] ?? 36;
  return 8 + level * 3 + tierBonus;
}
export function attackCadenceFor(level: number, weaponTier = 0): number {
  if (weaponTier === 7) return .25;
  if (weaponTier >= 8) return .2;
  return Math.max(0.34, 0.78 * Math.pow(0.9, level) * Math.pow(0.96, weaponTier));
}
export function attackRangeFor(tier: number): number { return [92, 122, 158, 215, 320, 700, 820, 450, 500][tier] ?? 500; }
export function weaponMagazineFor(tier: number): number { return tier === 7 ? 26 : tier >= 8 ? 36 : 0; }
export function weaponReloadSecondsFor(tier: number): number { return tier >= 7 ? 2 : 0; }
export function magnetRadiusFor(level: number): number { return 95 + level * 22; }
export function butcherSecondsFor(level: number, workers: number): number { return Math.max(0.25, 2.15 * Math.pow(0.84, level) / (1 + workers * 0.55)); }
export function storageCapacityFor(level: number): number { return 10 + level * 6; }
export function counterCapacityFor(level: number): number { return 4 + level * 3; }
export function queueCapacityFor(_level: number): number { return 8; }
export function customerIntervalFor(level: number): number { return Math.max(1.6, 3.8 * Math.pow(0.88, level)); }
export function mealValueFor(level: number): number { return ECONOMY.baseMealValue + level * 2; }
export function gateHealthFor(defenseLevel: number, armorLevel = 0, compoundLevel = 0): number {
  return 220 + defenseLevel * 70 + armorLevel * 180 + compoundLevel * 120;
}

export interface RaidProfile {
  wave: number;
  count: number;
  healthMultiplier: number;
  damageMultiplier: number;
  speedMultiplier: number;
  reward: number;
}

/** Endless but capped raid scaling keeps later waves dangerous without becoming impossible. */
export function raidProfileFor(waveNumber: number): RaidProfile {
  const wave = Math.max(1, Math.floor(waveNumber));
  const steps = wave - 1;
  return {
    wave,
    count: 4 + Math.min(12, Math.ceil(steps * 1.5)),
    healthMultiplier: Math.min(3.5, 1 + steps * 0.14),
    damageMultiplier: Math.min(2.25, 1 + steps * 0.07),
    speedMultiplier: Math.min(1.35, 1 + steps * 0.015),
    reward: 34 + wave * 8
  };
}
export function raidKillCashForWave(waveNumber: number): number {
  return Math.min(60, 6 + Math.max(0, Math.floor(waveNumber) - 1) * 2);
}
export function roamingBearCash(kind: 'rimeback' | 'icehorn', regionTier = 0): number {
  return (kind === 'icehorn' ? 12 : 6) + Math.max(0, Math.floor(regionTier)) * 6;
}
export function warmRadiusFor(level: number): number { return 265 + level * 40; }
export function respawnSecondsFor(level: number): number { return Math.max(0.85, 2 - level * 0.28); }

export function addCargo(current: number, amount: number, capacity: number): { carried: number; accepted: number; remainder: number } {
  const accepted = clamp(amount, 0, Math.max(0, capacity - current));
  return { carried: current + accepted, accepted, remainder: amount - accepted };
}

export function applyDamage(health: number, amount: number, spawnProtected: boolean): number {
  if (spawnProtected || amount <= 0) return health;
  return Math.max(0, health - amount);
}

export function applyRaidProfitDamage(cash: number, raidsWon: number): { cash: number; lost: number } {
  const available = Math.max(0, Math.floor(cash));
  const hit = Math.min(ECONOMY.raidPillageCap, ECONOMY.raidPillageBase + Math.max(0, Math.floor(raidsWon)) * ECONOMY.raidPillagePerWin);
  const lost = Math.min(available, hit);
  return { cash: available - lost, lost };
}

export function cooldownReady(timer: number): boolean { return timer <= 0; }

export function convertStation(raw: number, ready: number, readyCapacity: number): { raw: number; ready: number; converted: boolean } {
  if (raw <= 0 || ready >= readyCapacity) return { raw, ready, converted: false };
  return { raw: raw - 1, ready: ready + 1, converted: true };
}

export function purchaseMeal(ready: number, unitValue: number): { ready: number; cashDrop: number; sold: boolean } {
  if (ready <= 0) return { ready, cashDrop: 0, sold: false };
  return { ready: ready - 1, cashDrop: unitValue, sold: true };
}

export interface DeathLoss {
  lostMeat: number;
  lostFish: number;
  lostMeals: number;
  lostFishMeals: number;
  lostWood: number;
  meat: number;
  fish: number;
  meals: number;
  fishMeals: number;
  wood: number;
}

export function applyDeathLoss(meat: number, fish: number, meals: number, fishMeals: number, wood: number): DeathLoss {
  return {
    lostMeat: meat,
    lostFish: fish,
    lostMeals: meals,
    lostFishMeals: fishMeals,
    lostWood: wood,
    meat: 0,
    fish: 0,
    meals: 0,
    fishMeals: 0,
    wood: 0
  };
}

export function createUpgradeLevels(): Record<UpgradeId, number> {
  return Object.fromEntries(UPGRADES.map(upgrade => [upgrade.id, 0])) as Record<UpgradeId, number>;
}

export function createDefaultSave(): SaveData {
  return {
    version: 10,
    updatedAt: Date.now(),
    trailwardenName: '',
    cash: 0,
    contributions: {},
    upgrades: createUpgradeLevels(),
    unlocks: { zone2: false, dock: false, glacier: false, whiteout: false, raidSeen: false },
    station: { cookMeals: 0, cookFishMeals: 0, rawMeat: 0, meals: 0, rawFish: 0, fishMeals: 0, butcherProgress: 0, fishProgress: 0, fisherProgress: 0, oreProgress: 0, lumber: 0, lumberProgress: 0, hunterProgress: 0, passiveCash: 0, robotOreCash: 0 },
    robots: Array.from({ length: 6 }, (_, i) => createRobotState(i)),
    tutorial: 'move',
    stats: { bearsDefeated: 0, totalCashEarned: 0, mealsSold: 0, fishCaught: 0, deaths: 0, raidsWon: 0, raidsFaced: 0, playSeconds: 0, woodChopped: 0, woodSold: 0 },
    settings: { ...DEFAULT_SETTINGS }
  };
}
