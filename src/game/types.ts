export interface Vec2 { x: number; y: number }

export type CargoKind = 'meat' | 'fish' | 'wood';
export type EnemyKind = 'rimeback' | 'icehorn' | 'raider';
export type EnemyState = 'idle' | 'wander' | 'alert' | 'chase' | 'windup' | 'attack' | 'hurt' | 'defeat' | 'respawn' | 'raid';
export type TutorialStep = 'move' | 'hunt' | 'collect' | 'deliver' | 'cash' | 'upgrade' | 'complete';
export type GraphicsQuality = 'high' | 'low';
export type JoystickMode = 'floating' | 'fixed';
export type UpgradeCategory = 'combat' | 'survival' | 'carrying' | 'production' | 'hospitality' | 'defense';

export type UpgradeId =
  | 'weaponDamage'
  | 'attackSpeed'
  | 'weaponTier'
  | 'maxHealth'
  | 'moveSpeed'
  | 'capacity'
  | 'magnet'
  | 'butcherSpeed'
  | 'rawStorage'
  | 'counterCapacity'
  | 'customerFlow'
  | 'saleValue'
  | 'worker'
  | 'defense'
  | 'furnace'
  | 'infirmary';

export interface Settings {
  masterVolume: number;
  musicVolume: number;
  sfxVolume: number;
  haptics: boolean;
  reducedMotion: boolean;
  quality: GraphicsQuality;
  joystick: JoystickMode;
}

export interface Unlocks {
  zone2: boolean;
  dock: boolean;
  glacier: boolean;
  whiteout: boolean;
  raidSeen: boolean;
}

export interface StationState {
  rawMeat: number;
  meals: number;
  rawFish: number;
  fishMeals: number;
  butcherProgress: number;
  fishProgress: number;
}

export interface Stats {
  bearsDefeated: number;
  totalCashEarned: number;
  mealsSold: number;
  fishCaught: number;
  deaths: number;
  raidsWon: number;
  playSeconds: number;
  /** Logs felled. Added after v2; old saves migrate in with zero. */
  woodChopped: number;
  /** Logs sold at the timber post. */
  woodSold: number;
}

export interface SaveData {
  version: number;
  updatedAt: number;
  /** The locally saved call-sign shown during the outpost's first-run welcome. */
  trailwardenName: string;
  cash: number;
  upgrades: Record<UpgradeId, number>;
  unlocks: Unlocks;
  station: StationState;
  tutorial: TutorialStep;
  stats: Stats;
  settings: Settings;
}

export interface Rect { x: number; y: number; width: number; height: number }

export interface EnemyConfig {
  name: string;
  health: number;
  damage: number;
  speed: number;
  aggroRange: number;
  leashRange: number;
  attackRange: number;
  windup: number;
  attackCooldown: number;
  meatYield: number;
  respawn: number;
  color: number;
  accent: number;
  scale: number;
}

export interface UpgradeConfig {
  id: UpgradeId;
  label: string;
  icon: string;
  description: string;
  baseCost: number;
  costScale: number;
  maxLevel: number;
  effectText: (level: number) => string;
  /** Optional per-level glyph, so a plate can advertise what the next purchase grants. */
  iconForLevel?: (level: number) => string;
}
