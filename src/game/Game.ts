import { Application, Container, CullerPlugin, Graphics, Matrix, Rectangle, Text, Ticker, extensions } from 'pixi.js';
import { AudioEngine } from './AudioEngine';
import { BRAND, CATEGORY_COLORS, ECONOMY, ENEMIES, TIMBER, UPGRADE_CATEGORY, UPGRADES, UPGRADE_BY_ID, WEAPON_RANGED_TIER, WORLD, ZONES, defenseTierFor, hunterTierFor, isUpgradeAvailable } from './config';
import { createDefenseVisual } from './defenseVisuals';
import { InputController } from './InputController';
import { Pool } from './Pool';
import { ISO_BOUNDS, depth, facesLeft, footprint, inputToWorld, isoX, isoY, traceFootprint } from './iso';
import {
  contactShadow,
  drawBarrel,
  drawCrateStack,
  drawCreatureBody,
  drawSnowdrift,
  drawTrailwardenBody,
  drawWeapon,
  isoBuilding,
  paintResourceBadge,
  paintUpgradePlate,
  spriteFor,
  shade,
  snowCap,
  worldText
} from './visuals';
import {
  addCargo,
  applyDamage,
  applyDeathLoss,
  applyRaidProfitDamage,
  attackCadenceFor,
  attackRangeFor,
  butcherSecondsFor,
  clamp,
  convertStation,
  counterCapacityFor,
  distanceSquared,
  gateHealthFor,
  healingPerSecondFor,
  magnetRadiusFor,
  maxHealthFor,
  mealValueFor,
  moveSpeedFor,
  normalize,
  purchaseMeal,
  queueCapacityFor,
  raidKillCashForWave,
  raidProfileFor,
  roamingBearCash,
  respawnSecondsFor,
  upgradeCost,
  warmRadiusFor,
  weaponDamageFor,
  weaponMagazineFor,
  weaponReloadSecondsFor
} from './rules';
import { saveProgress } from './save';
import { finishOfflineCooking } from './progression';
import { loadSprites } from './sprites';
import type { CargoKind, EnemyConfig, EnemyKind, EnemyState, Rect, SaveData, TutorialStep, UpgradeId, Vec2 } from './types';

extensions.add(CullerPlugin);

export interface InteractionHint {
  title: string;
  detail: string;
  action: string;
  progress: number;
  healing?: boolean;
}

interface GameCallbacks {
  hud: (cash: number, rawFood: number, cookedFood: number, wood: number, health: number, maxHealth: number) => void;
  objective: (step: TutorialStep, text: string) => void;
  raid: (text: string | null) => void;
  toast: (text: string) => void;
  defeat: (lostRawFood: number, lostCookedFood: number, lostWood: number, seconds: number) => void;
  respawn: () => void;
  save: (save: SaveData) => void;
  hint: (hint: InteractionHint | null, healing: boolean) => void;
}

interface PlayerEntity {
  x: number; y: number; vx: number; vy: number; facing: number;
  health: number; meat: number; fish: number; meals: number; fishMeals: number; wood: number; spawnProtection: number;
  attackCooldown: number; attackVisual: number; chopVisual: number; hurtVisual: number; defeatVisual: number;
  pendingHitTimer: number; pendingTarget: EnemyEntity | null; alive: boolean; respawnTimer: number;
  ammo: number; reloadTimer: number;
  container: Container; body: Graphics; pack: Graphics; weapon: Graphics; chopAxe: Graphics; ammoText: Text; healthBar: Graphics; shadow: Graphics; protectionAura: Graphics;
  /** Cached appearance keys so unchanged cargo/health geometry is not rebuilt each frame. */
  cargoKey: string; healthKey: string;
}

interface EnemyEntity {
  id: number; kind: EnemyKind; config: EnemyConfig; spawn: Vec2; x: number; y: number; vx: number; vy: number;
  facing: number; health: number; state: EnemyState; stateTimer: number; attackCooldown: number; wanderAngle: number;
  dropped: boolean; isRaid: boolean; alive: boolean; container: Container; body: Graphics; shadow: Graphics; healthBar: Graphics;
  targetRing: Graphics; alert: Text; healthKey: string;
  cashReward: number; defenderTarget: DefenderPost | null;
  /** Raiders first converge on the outside approach, then advance on the gate. */
  raidApproachedGate: boolean;
}

interface CargoDrop {
  kind: CargoKind; amount: number; x: number; y: number; vx: number; vy: number; life: number; container: Container;
}

interface CashDrop { value: number; x: number; y: number; life: number; container: Container }

type CustomerState = 'arriving' | 'waiting' | 'taking' | 'happy' | 'leaving';
interface CustomerEntity {
  id: number; x: number; y: number; state: CustomerState; timer: number; wantsFish: boolean;
  container: Container; body: Graphics; shadow: Graphics; bubble: Container; bubbleText: Text;
  moving: boolean; walkPhase: number;
  /** False until the guest has walked in through the gate; they never cross the palisade. */
  entered: boolean;
  /** True after an arriving guest reaches the trail immediately outside the gate. */
  approachedGate: boolean;
  /** Off-camera trail point used for both arrival and departure. */
  trailEnd: Vec2;
}

interface GateVisual {
  container: Container;
  leftDoor: Graphics;
  rightDoor: Graphics;
  leftArmor: Graphics;
  rightArmor: Graphics;
  /** Projected direction from the gate centre to the right-hand post. */
  slide: Vec2;
  open: number;
  heldOpen: boolean;
}

interface UpgradePad {
  /** Which upgrade this slot currently offers; rotates as the run progresses. */
  id: UpgradeId;
  /** Set when the slot is pinned to one line (the gate-yard Armory) and never rotates. */
  fixed?: UpgradeId;
  x: number; y: number; paid: number; lockedUntilExit: boolean; container: Container;
  plate: Graphics; icon: Text; title: Text; detail: Text; progress: Graphics;
  /** Last painted appearance, so unchanged pads skip geometry rebuilds each frame. */
  paintKey: string;
  /** Seconds the player has stood still on this plate, so walking across never buys. */
  dwell: number;
}

interface UnlockPad {
  kind: 'zone2' | 'dock' | 'glacier' | 'whiteout'; payment: 'wood' | 'cash';
  x: number; y: number; cost: number; paid: number; lockedUntilExit: boolean;
  container: Container; plate: Graphics; title: Text; detail: Text; progress: Graphics;
  paintKey: string; dwell: number;
  /** Build plates are paid in hauled timber rather than cash. */
  requires: number;
  delivered: number;
  badge: Graphics;
  badgeCount: Text;
}

/**
 * A plate only charges once the player has settled on it. Crossing a plate at walking
 * pace takes longer than any reasonable timer, so presence alone cannot tell walking
 * from stopping — the player must actually slow down, then hold briefly.
 */
const PAD_DWELL_SECONDS = 0.22;
const PAD_SETTLE_SPEED = 55;

/**
 * The Trailwarden's haul is unbounded — the pack stack simply grows taller. The Pack
 * and Cold store upgrade lines are retired from the offer rotation as a result.
 */
const CARGO_CAPACITY = Number.POSITIVE_INFINITY;

/**
 * Guests walk in and out through the compound's east gateway rather than clipping
 * through the palisade. The gap in the east wall runs y 720-920 at x ~1178.
 */
const ENTRY_OUTSIDE = { x: 1900, y: 870 };
const ENTRY_INSIDE = { x: 1650, y: 870 };
const WILD_EAST_EDGE = WORLD.camp.x + WORLD.camp.width + 120;
const TREE_EDGE_INSET = 145;

interface TreeEntity {
  x: number; y: number; scale: number; health: number; alive: boolean; regrow: number;
  container: Container; crown: Graphics; shakeUntil: number;
  /** The collision rect this tree contributes while standing. */
  blocker: Rect;
}

interface Particle { graphic: Graphics; x: number; y: number; vx: number; vy: number; life: number; maxLife: number; worldSpace: boolean }
interface DamageLabel { text: Text; x: number; y: number; life: number; maxLife: number }
type DefenderPost = ReturnType<typeof createDefenseVisual> & Vec2 & {
  cooldown: number; lastShot: number; mobile: boolean; home: Vec2;
  damage: number; range: number; cadence: number; projectile: 'spear' | 'archer' | 'turret';
  health: number; maxHealth: number; speed: number; alive: boolean; healthBar: Graphics;
};
type LumberjackState = 'idle' | 'to-inside-gate' | 'to-outside-gate' | 'to-tree' | 'chopping' | 'return-outside-gate' | 'return-inside-gate' | 'return-yard';
interface LumberjackWorker {
  container: Container; cargo: Graphics; x: number; y: number; state: LumberjackState;
  target: TreeEntity | null; chopTimer: number; carried: number;
}
interface StationVisuals {
  furnaceGlow: Graphics; furnaceFlame: Graphics; warmRing: Graphics; butcherProgress: Graphics; butcherStock: Text;
  mealOutput: Container; mealPile: Graphics; mealOutputStock: Text; cashStock: Text;
  fishProgress: Graphics; fishStock: Text; fishOutput: Container; fishPile: Graphics; fishOutputStock: Text; dockProgress: Graphics;
  fishBuilding: Container; fishDropZone: Container; zoneGate: Container; glacierGate: Container; whiteoutGate: Container;
  southGate: Container; compoundGate: GateVisual; gateBar: Graphics;
  lumberZone: Container; lumberPile: Graphics; lumberStock: Text;
  workerVisuals: Container[]; serveHint: Text;
}

const TUTORIAL_TEXT: Record<TutorialStep, string> = {
  move: 'Drag anywhere below to move · WASD also works',
  hunt: 'Walk into a tree to start chopping it down',
  collect: 'Gather the logs it drops',
  deliver: 'Sell the logs at the timber post in the gate yard',
  cash: 'Spend your takings on a plate',
  upgrade: 'Hunt → cook raw meat → collect meals → feed the Mess Hall line',
  complete: 'Grow the outpost · Open the eastern frontier'
};

/**
 * A small, fixed bank of purchase plates laid along the open south of the yard.
 * The plates never move; what they *offer* rotates as the run progresses, so the
 * player learns one place to spend and is never faced with a wall of choices.
 */
// Spread through the open south-east of the yard, clear of the shoreline gate's
// span (world x 590-770) and of the furnace, respawn point and infirmary.
interface PadSlot extends Vec2 {
  /** A slot pinned to one upgrade line rather than drawing from the rotating queue. */
  fixed?: UpgradeId;
}

const PAD_SLOTS: PadSlot[] = [
  // The Armory keeps a permanent plate in the gate yard, on the way out to the hunt.
  { x: 1560, y: 870, fixed: 'weaponTier' },
  { x: 1460, y: 680, fixed: 'defense' },
  { x: 1580, y: 1040, fixed: 'gateArmor' },
  { x: 350, y: 1040, fixed: 'compound' },
  { x: 1380, y: 1040, fixed: 'warriors' },
  // Each remote district has its own permanent production and staffing investments.
  { x: 790, y: 1840, fixed: 'fishery' },
  { x: 640, y: 1740, fixed: 'fisher' },
  { x: 5050, y: 2610, fixed: 'oreRig' },
  { x: 7060, y: 3970, fixed: 'robots' },
  { x: 1640, y: 1260, fixed: 'lumberjack' },
  { x: 1560, y: 1340, fixed: 'hunters' },
  { x: 1080, y: 850, fixed: 'worker' },
  { x: 1250, y: 850, fixed: 'butcherSpeed' },
  // The rest form an upgrade row along the south of the hearth district.
  { x: 520, y: 1220 },
  { x: 700, y: 1220 },
  { x: 1340, y: 1200 }
];

/**
 * The order plates are offered in. The first few teach the core loop — carry more,
 * hit harder, cook faster, serve more — and the deeper lines surface later.
 */
/**
 * Pack and Cold store are deliberately absent: the Trailwarden now carries an
 * unlimited haul and dumps all of it at once, so neither line has anything to buy.
 * Their config entries and any saved levels remain valid and simply go unused.
 */
const PAD_PRIORITY: UpgradeId[] = [
  'weaponDamage', 'counterCapacity', 'saleValue',
  'attackSpeed', 'moveSpeed', 'magnet', 'customerFlow',
  'maxHealth', 'furnace', 'infirmary'
];

type ExpeditionUnlock = 'zone2' | 'glacier' | 'whiteout';
const ENEMY_SPAWNS: Array<{ kind: EnemyKind; x: number; y: number; unlock?: ExpeditionUnlock }> = [
  { kind: 'rimeback', x: 2060, y: 600 }, { kind: 'rimeback', x: 2320, y: 950 },
  { kind: 'rimeback', x: 2120, y: 1320 }, { kind: 'rimeback', x: 2450, y: 1620 },
  { kind: 'icehorn', x: 2900, y: 620, unlock: 'zone2' }, { kind: 'icehorn', x: 3120, y: 1080, unlock: 'zone2' },
  { kind: 'icehorn', x: 2860, y: 1500, unlock: 'zone2' }, { kind: 'rimeback', x: 3650, y: 3100, unlock: 'zone2' },
  { kind: 'icehorn', x: 4860, y: 1700, unlock: 'glacier' }, { kind: 'icehorn', x: 5420, y: 2800, unlock: 'glacier' },
  { kind: 'rimeback', x: 6150, y: 900, unlock: 'glacier' }, { kind: 'icehorn', x: 6250, y: 4700, unlock: 'glacier' },
  { kind: 'icehorn', x: 7350, y: 2200, unlock: 'whiteout' }, { kind: 'icehorn', x: 8100, y: 4300, unlock: 'whiteout' },
  { kind: 'rimeback', x: 8750, y: 1350, unlock: 'whiteout' }, { kind: 'icehorn', x: 9200, y: 5400, unlock: 'whiteout' }
];

function circleRectCollision(x: number, y: number, radius: number, rect: Rect): boolean {
  const closestX = clamp(x, rect.x, rect.x + rect.width);
  const closestY = clamp(y, rect.y, rect.y + rect.height);
  return distanceSquared(x, y, closestX, closestY) < radius * radius;
}

function moveToward(current: number, target: number, maxDelta: number): number {
  if (Math.abs(target - current) <= maxDelta) return target;
  return current + Math.sign(target - current) * maxDelta;
}

export class Game {
  readonly app = new Application();
  readonly audio: AudioEngine;
  input!: InputController;
  save: SaveData;

  private readonly world = new Container();
  private readonly effects = new Container();
  private readonly snowfall = new Container();
  private readonly tutorialArrow = new Container();
  private player!: PlayerEntity;
  private readonly enemies: EnemyEntity[] = [];
  private readonly cargoDrops: CargoDrop[] = [];
  private readonly cashDrops: CashDrop[] = [];
  private readonly customers: CustomerEntity[] = [];
  private readonly upgradePads: UpgradePad[] = [];
  private readonly unlockPads: UnlockPad[] = [];
  private readonly trees: TreeEntity[] = [];
  private readonly fisherVisuals: Container[] = [];
  private readonly lumberjackVisuals: LumberjackWorker[] = [];
  private readonly hunterVisuals: Container[] = [];
  private readonly robotVisuals: Container[] = [];
  private oreRigBuilding!: Container;
  private robotFoundry!: Container;
  private oreCashZone!: Container;
  private chopCooldown = 0;
  private sellTimer = 0;
  private lumberPickupTimer = 0;
  private lumberPileKey = -1;
  private deliverTimer = 0;
  /** Bumped whenever a tree is felled or regrows, so the blocker cache rebuilds. */
  private treeVersion = 0;
  private readonly particles: Particle[] = [];
  private readonly damageLabels: DamageLabel[] = [];
  private readonly particlePool: Pool<Graphics>;
  private readonly damagePool: Pool<Text>;
  private station!: StationVisuals;
  private readonly blockers: Rect[] = [];
  private dockBobber!: Graphics;
  private dockLine!: Graphics;
  private dockAnchor: Vec2 = { x: 0, y: 0 };
  private warmRingRadius = -1;
  private healing = false;
  private healingLabelTimer = 0;
  private healedSinceLabel = 0;
  private objectiveKey = '';
  private gateBarKey = '';
  private gateArmorVisualLevel = -1;
  private blockerCache: Rect[] = [];
  private blockerCacheKey = '';
  private readonly revealedPads = new Set<UpgradeId>();
  private padGateSignature = '';
  private readonly snowflakes: Array<{ graphic: Graphics; speed: number; drift: number }> = [];
  private accumulator = 0;
  private skipNextFrame = false;
  private simulationTime = 0;
  private lastSaveTime = 0;
  private paused = true;
  private hidden = false;
  private camera = { x: WORLD.respawn.x, y: WORLD.respawn.y, shake: 0 };
  private viewScale = 1;
  private selectedTarget: EnemyEntity | null = null;
  private targetLockTimer = 0;
  private hitStop = 0;
  private nextEnemyId = 1;
  private nextCustomerId = 1;
  private customerSpawnTimer = 0;
  /** One outstanding order is created for every plate that finishes cooking. */
  private customerBearDemand = 0;
  private cookPosition = { x: 1360, y: 670 };
  private cookWaypoint = 0;
  private cookDelivering = false;
  private cookSource: 'meat' | 'fish' = 'meat';
  private cookTray = new Graphics();
  private customerFishDemand = 0;
  private depositTimer = 0;
  private mealPickupTimer = 0;
  private mealPileKey = -1;
  private fishPileKey = -1;
  private fishCatchProgress = 0;
  private footstepTimer = 0;
  private footprintSide = 1;
  private insufficientToastTimer = 0;
  private raidState: 'idle' | 'warning' | 'active' | 'cooldown' = 'idle';
  private raidTimer = 28;
  private gateHealth: number;
  private raidBreached = false;
  private raidCashLost = 0;
  private raidFoodHitVisual = 0;
  private raidBankEmptyShown = false;
  private readonly defenders: DefenderPost[] = [];
  private defenseVisualLevel = '';
  private readonly fortificationVisuals: Container[] = [];
  private readonly compoundBlockers: Rect[] = [];
  private compoundVisualLevel = -1;
  private defenseShots = 0;
  private raidWave = 1;
  private defeatTimer = 0;

  static async create(host: HTMLElement, save: SaveData, callbacks: GameCallbacks): Promise<Game> {
    const game = new Game(save, callbacks);
    await game.initialize(host);
    return game;
  }

  private constructor(save: SaveData, callbacks: GameCallbacks) {
    this.save = save;
    this.callbacks = callbacks;
    this.audio = new AudioEngine(save.settings);
    this.gateHealth = this.gateMaxHealth();
    this.raidWave = Math.max(1, save.stats.raidsFaced + 1);
    // Saved ready stock has no saved visitors, so recreate one order per plate.
    this.customerBearDemand = save.station.meals + save.station.cookMeals;
    this.cookSource = save.station.cookFishMeals > 0 ? 'fish' : 'meat';
    this.cookDelivering = save.station.cookMeals + save.station.cookFishMeals > 0;
    this.customerFishDemand = save.station.fishMeals;
    this.particlePool = new Pool(() => new Graphics(), graphic => { graphic.clear(); graphic.removeFromParent(); }, 40);
    this.damagePool = new Pool(() => worldText('', 25, 0xffffff, '800'), text => { text.text = ''; text.removeFromParent(); }, 14);
  }

  private async initialize(host: HTMLElement): Promise<void> {
    await this.app.init({
      resizeTo: host,
      background: BRAND.colors.snow,
      antialias: true,
      autoDensity: true,
      resolution: this.preferredResolution(),
      powerPreference: 'high-performance',
      culler: { updateTransform: false }
    });
    host.appendChild(this.app.canvas);
    this.app.canvas.tabIndex = 0;
    // Any supplied art loads before the world is built, so each factory can pick
    // sprite or procedural once. A missing manifest simply leaves everything drawn.
    await loadSprites();
    this.world.sortableChildren = true;
    this.effects.sortableChildren = true;
    this.app.stage.addChild(this.world, this.effects, this.snowfall);

    this.buildGround();
    this.station = this.buildCamp();
    this.refreshCompoundVisuals();
    this.player = this.createPlayer();
    this.buildUpgradePads();
    this.buildUnlockPads();
    this.buildDistrictBusinesses();
    this.buildDecorations();
    for (const spawn of ENEMY_SPAWNS) {
      if (spawn.unlock && !this.save.unlocks[spawn.unlock]) continue;
      this.enemies.push(this.createEnemy(spawn.kind, spawn.x, spawn.y, false));
    }
    this.buildSnowfall();
    this.buildTutorialArrow();

    const joystick = document.querySelector<HTMLElement>('#joystick');
    const knob = document.querySelector<HTMLElement>('#joystick-knob');
    if (!joystick || !knob) throw new Error('Joystick UI missing');
    this.input = new InputController(host, joystick, knob, this.save.settings.joystick, () => { void this.audio.unlock(); });
    this.gateHealth = this.gateMaxHealth();
    this.app.ticker.maxFPS = this.save.settings.quality === 'low' ? 30 : 60;
    this.app.ticker.add(this.onFrame, this);
    window.addEventListener('resize', this.onResize);
    window.addEventListener('pagehide', this.onPageHide);
    document.addEventListener('visibilitychange', this.onVisibility);
    this.onResize();
    this.refreshPadVisuals();
    this.refreshWorldState();
    this.updateHud();
    this.callbacks.objective(this.save.tutorial, TUTORIAL_TEXT[this.save.tutorial]);
  }

  private readonly callbacks: GameCallbacks;

  start(): void { this.resume(); void this.audio.unlock(); }
  pause(): void { this.paused = true; this.accumulator = 0; this.app.stop(); }
  resume(): void { this.paused = false; this.skipNextFrame = true; this.app.start(); this.app.canvas.focus(); }
  isPaused(): boolean { return this.paused; }

  applySettings(): void {
    this.audio.updateSettings(this.save.settings);
    this.input.setMode(this.save.settings.joystick);
    this.app.ticker.maxFPS = this.save.settings.quality === 'low' ? 30 : 60;
    this.app.renderer.resolution = this.preferredResolution();
    this.onResize();
    this.requestSave();
  }

  replaceSave(save: SaveData): void {
    this.save = save;
    this.audio.updateSettings(save.settings);
    window.location.reload();
  }

  getSave(): SaveData { return structuredClone(this.save); }

  debugState() {
    return {
      player: { x: this.player.x, y: this.player.y, health: this.player.health, meat: this.player.meat, fish: this.player.fish, meals: this.player.meals, fishMeals: this.player.fishMeals, wood: this.player.wood, alive: this.player.alive, ammo: this.player.ammo, reloadTimer: this.player.reloadTimer },
      enemies: this.enemies.map(enemy => ({ kind: enemy.kind, state: enemy.state, health: enemy.health, damage: enemy.config.damage, cashReward: enemy.cashReward, x: enemy.x, y: enemy.y, isRaid: enemy.isRaid })),
      cash: this.save.cash,
      cashDrops: this.cashDrops.length,
      cashLoot: this.cashDrops.map(({ x, y, value }) => ({ x, y, value })),
      rawLoot: this.cargoDrops.filter(drop => drop.kind === 'meat').map(({ x, y, amount }) => ({ x, y, amount })),
      defense: { level: this.save.upgrades.defense, kind: defenseTierFor(this.save.upgrades.defense).kind, name: defenseTierFor(this.save.upgrades.defense).name, posts: this.defenders.length, warriors: this.defenders.filter(post => post.mobile && post.alive).length, warriorHealth: this.defenders.filter(post => post.mobile).map(post => post.health), shots: this.defenseShots },
      wardenPositions: this.defenders.filter(post => post.mobile && post.alive).map(post => ({ x: post.x, y: post.y, health: post.health })),
      lumberjacks: this.lumberjackVisuals.filter(worker => worker.container.visible).map(worker => ({ x: worker.x, y: worker.y, state: worker.state, carried: worker.carried, target: worker.target ? { x: worker.target.x, y: worker.target.y } : null })),
      cargoAnchor: { x: this.player.pack.x, y: this.player.pack.y, bottom: this.player.pack.getLocalBounds().maxY + this.player.pack.y },
      customers: this.customers.length,
      customerDemand: this.customerBearDemand + this.customerFishDemand,
      waitingCustomers: this.customers.filter(customer => customer.entered && (customer.state === 'arriving' || customer.state === 'waiting')).length,
      cook: { ...this.cookPosition, carrying: this.save.station.cookMeals + this.save.station.cookFishMeals,
        carryingFish: this.save.station.cookFishMeals, delivering: this.cookDelivering },
      station: { ...this.save.station },
      upgrades: { ...this.save.upgrades },
      unlocks: { ...this.save.unlocks },
      raidState: this.raidState,
      raidWave: this.raidWave,
      raidBreached: this.raidBreached,
      raidCashLost: this.raidCashLost,
      gateHealth: this.gateHealth,
      campGateOpen: this.station.compoundGate.open,
      simulationTime: this.simulationTime,
      paused: this.paused,
      hidden: this.hidden,
      input: { ...this.input.move }
    };
  }

  debugTeleport(x: number, y: number): void { this.player.x = clamp(x, 30, WORLD.width - 30); this.player.y = clamp(y, 30, WORLD.height - 30); this.player.vx = 0; this.player.vy = 0; }
  debugDefeatFirstEnemy(): void { const enemy = this.enemies.find(item => item.alive && !item.isRaid); if (enemy) this.damageEnemy(enemy, enemy.health + 1); }
  debugGrantCash(amount: number): void { this.save.cash += Math.max(0, Math.floor(amount)); }
  debugSetCargo(meat: number, fish: number): void { this.player.meat = Math.max(0, Math.floor(meat)); this.player.fish = Math.max(0, Math.floor(fish)); }
  debugSetMeals(meals: number, fishMeals: number): void { this.player.meals = Math.max(0, Math.floor(meals)); this.player.fishMeals = Math.max(0, Math.floor(fishMeals)); }
  debugSetWood(wood: number): void { this.player.wood = Math.max(0, Math.floor(wood)); }
  debugSetAmmo(ammo: number): void { this.player.ammo = Math.max(0, Math.floor(ammo)); this.player.reloadTimer = 0; }
  debugDamagePlayer(amount: number): void { this.player.spawnProtection = 0; this.player.health = Math.max(0, this.player.health - Math.max(0, amount)); if (this.player.health <= 0) this.defeatPlayer(); }
  debugTriggerRaid(): void { if (this.raidState !== 'active') this.startRaid(); }
  debugDamageGate(amount: number): void { if (this.raidState === 'active' && !this.raidBreached) this.gateHealth = Math.max(0, this.gateHealth - Math.max(0, amount)); }

  private preferredResolution(): number {
    const mobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
    const cap = this.save?.settings.quality === 'low' ? 1.25 : mobile ? 2 : 2.25;
    return Math.min(window.devicePixelRatio || 1, cap);
  }

  private readonly onFrame = (ticker: Ticker): void => {
    if (this.hidden || this.paused) return;
    if (this.skipNextFrame) { this.skipNextFrame = false; this.accumulator = 0; return; }
    // Pixi caps deltaMS at 100 ms: using it for game time slowed the entire
    // simulation below 10 FPS. Keep fixed steps driven by actual elapsed time.
    const frameDelta = Math.min(WORLD.maxFrameDelta, Math.max(0, ticker.elapsedMS / 1000));
    this.accumulator += frameDelta;
    while (this.accumulator >= WORLD.fixedStep) {
      this.fixedUpdate(WORLD.fixedStep);
      this.accumulator -= WORLD.fixedStep;
    }
    this.render(frameDelta);
  };

  private readonly onVisibility = (): void => {
    const wasHidden = this.hidden;
    this.hidden = document.hidden;
    this.accumulator = 0;
    if (this.hidden) { this.app.stop(); this.requestSave(); }
    else if (wasHidden) {
      this.skipNextFrame = true;
      if (!this.paused) this.app.start();
      const away = finishOfflineCooking(this.save);
      this.customerBearDemand = Math.max(0, this.customerBearDemand + away.demandDelta);
      this.customerFishDemand = Math.max(0, this.customerFishDemand + away.fishMeals - away.fishMealsSold);
      let completedBearOrders = away.mealsSold;
      let completedFishOrders = away.fishMealsSold;
      for (let index = this.customers.length - 1; index >= 0 && completedBearOrders + completedFishOrders > 0; index -= 1) {
        const customer = this.customers[index]!;
        if (customer.wantsFish ? completedFishOrders <= 0 : completedBearOrders <= 0) continue;
        customer.container.destroy({ children: true });
        this.customers.splice(index, 1);
        if (customer.wantsFish) completedFishOrders -= 1;
        else completedBearOrders -= 1;
      }
      if (away.meals + away.fishMeals + away.mealsSold + away.fishMealsSold + away.lumber + away.huntedMeat > 0) {
        const results = [away.meals + away.fishMeals > 0 ? `${away.meals + away.fishMeals} cooked` : '',
          away.cashEarned > 0 ? `$${away.cashEarned} waiting` : '', away.lumber > 0 ? `${away.lumber} logs stacked` : '',
          away.huntedMeat > 0 ? `${away.huntedMeat} meat hunted` : ''].filter(Boolean).join(' · ');
        this.callbacks.toast(`Welcome back · ${results}`);
      }
      this.requestSave();
    }
  };

  private readonly onPageHide = (): void => { this.requestSave(); };

  private readonly onResize = (): void => {
    const width = this.app.screen.width;
    const height = this.app.screen.height;
    // Framed so the yard fills the shot rather than floating in open snow.
    // Pulled back for the larger compound so a whole district fits in frame.
    const desiredWorldWidth = height > width ? 680 : 1200;
    this.viewScale = clamp(width / desiredWorldWidth, 0.5, 1.4);
    this.updateCamera(true);
  };

  /** Positions a display object at a world coordinate, projected, with painter's-order depth. */
  private place(target: Container, x: number, y: number, bias = 0): void {
    target.position.set(isoX(x, y), isoY(x, y));
    target.zIndex = depth(x, y, bias);
  }

  /** Traces an axis-aligned world-space rectangle as a projected ground diamond. */
  private traceWorldRect(g: Graphics, x: number, y: number, width: number, height: number): void {
    g.moveTo(isoX(x, y), isoY(x, y))
      .lineTo(isoX(x + width, y), isoY(x + width, y))
      .lineTo(isoX(x + width, y + height), isoY(x + width, y + height))
      .lineTo(isoX(x, y + height), isoY(x, y + height))
      .closePath();
  }

  /**
   * Draws a world-space rectangle as a raised platform: a top face plus the two
   * camera-facing side walls, so the ground reads as a solid slab rather than a decal.
   */
  private raisedSlab(g: Graphics, x: number, y: number, width: number, height: number, thickness: number, top: number, side: number): void {
    const corners = {
      north: { x: isoX(x, y), y: isoY(x, y) },
      east: { x: isoX(x + width, y), y: isoY(x + width, y) },
      south: { x: isoX(x + width, y + height), y: isoY(x + width, y + height) },
      west: { x: isoX(x, y + height), y: isoY(x, y + height) }
    };
    // left wall (west -> south) then right wall (south -> east)
    g.moveTo(corners.west.x, corners.west.y).lineTo(corners.south.x, corners.south.y)
      .lineTo(corners.south.x, corners.south.y + thickness).lineTo(corners.west.x, corners.west.y + thickness).closePath()
      .fill(side);
    g.moveTo(corners.south.x, corners.south.y).lineTo(corners.east.x, corners.east.y)
      .lineTo(corners.east.x, corners.east.y + thickness).lineTo(corners.south.x, corners.south.y + thickness).closePath()
      .fill(shade(side, -0.16));
    g.moveTo(corners.west.x, corners.west.y + thickness).lineTo(corners.south.x, corners.south.y + thickness).lineTo(corners.east.x, corners.east.y + thickness)
      .stroke({ color: BRAND.colors.outline, width: 3, alpha: 0.9 });
    this.traceWorldRect(g, x, y, width, height);
    g.fill(top);
    this.traceWorldRect(g, x, y, width, height);
    g.stroke({ color: BRAND.colors.outline, width: 3, alpha: 0.85 });
  }

  private buildGround(): void {
    const ground = new Graphics();
    this.traceWorldRect(ground, 0, 0, WORLD.width, WORLD.height);
    ground.fill(BRAND.colors.fieldSnow);
    this.traceWorldRect(ground, 0, 0, WORLD.width, WORLD.height);
    ground.stroke({ color: BRAND.colors.snowShadow, width: 6, alpha: 0.5 });

    // broad snowbank swells for terrain relief
    for (const [bx, by, rx, ry, alpha] of [
      [1500, 500, 620, 240, 0.16], [2150, 1000, 560, 260, 0.14], [1050, 1250, 420, 200, 0.12],
      [3300, 2600, 760, 340, 0.12], [3900, 4700, 680, 310, 0.1],
      [5200, 1200, 900, 380, 0.13], [5900, 4200, 760, 330, 0.12],
      [7600, 2100, 980, 420, 0.14], [8350, 5000, 820, 360, 0.12], [9150, 900, 620, 280, 0.1]
    ]) {
      const bank = new Graphics();
      bank.ellipse(0, 0, rx! * 0.92, ry! * 0.5).fill({ color: BRAND.colors.snowShadow, alpha: alpha! });
      this.place(bank, bx!, by!, -960);
      this.world.addChild(bank);
    }

    const water = new Graphics();
    // The frozen shoreline sits south of the compound's south wall.
    this.traceWorldRect(water, 0, 1650, 1560, 550);
    water.fill({ color: BRAND.colors.ice, alpha: 0.9 });
    this.traceWorldRect(water, 0, 1650, 1560, 60);
    water.fill({ color: 0xe8fbff, alpha: 0.92 });
    water.moveTo(isoX(0, 1710), isoY(0, 1710)).lineTo(isoX(1560, 1710), isoY(1560, 1710)).stroke({ color: 0xeffdff, width: 7, alpha: 0.85 });
    water.zIndex = -980;
    ground.zIndex = -1000;
    this.world.addChild(ground, water);

    const trails = new Graphics();
    const trail = (points: Array<[number, number]>, width: number, alpha: number): void => {
      const [first, ...rest] = points;
      trails.moveTo(isoX(first![0], first![1]), isoY(first![0], first![1]));
      for (const [px, py] of rest) trails.lineTo(isoX(px, py), isoY(px, py));
      trails.stroke({ color: 0xeefbfc, width, alpha, cap: 'round', join: 'round' });
    };
    trail([[1050, 850], [1400, 780], [1750, 930], [2140, 830]], 92, 0.6);
    trail([[700, 1160], [650, 1300], [530, 1360], [500, 1500]], 66, 0.48);
    trail([[2140, 830], [2550, 900], [3300, 1300], [4050, 2050], [4400, 2200]], 86, 0.5);
    trail([[4400, 2200], [5200, 2700], [6100, 3300], [6800, 3800]], 82, 0.46);
    trail([[6800, 3800], [7600, 3500], [8500, 4300], [9350, 5200]], 78, 0.42);
    trails.zIndex = -900;
    this.world.addChild(trails);

    // Three icefall ridges divide the larger map into sequential expeditions. Each
    // ridge is solid except for its guarded pass, so its purchase pad cannot be bypassed.
    const ridges = new Graphics();
    const ridgeSpecs = [WORLD.zoneGate, WORLD.glacierGate, WORLD.whiteoutGate];
    for (const gate of ridgeSpecs) {
      const gap = 150;
      for (const [fromY, toY] of [[0, gate.y - gap], [gate.y + gap, WORLD.height]] as Array<[number, number]>) {
        if (toY <= fromY) continue;
        ridges.moveTo(isoX(gate.x, fromY), isoY(gate.x, fromY))
          .lineTo(isoX(gate.x, toY), isoY(gate.x, toY))
          .stroke({ color: 0x527f98, width: 52, alpha: .78, cap: 'round' });
        ridges.moveTo(isoX(gate.x - 8, fromY), isoY(gate.x - 8, fromY))
          .lineTo(isoX(gate.x - 8, toY), isoY(gate.x - 8, toY))
          .stroke({ color: 0xe9faff, width: 24, alpha: .92, cap: 'round' });
        this.blockers.push({ x: gate.x - 30, y: fromY, width: 60, height: toY - fromY });
      }
    }
    ridges.zIndex = -860;
    this.world.addChild(ridges);
  }

  private buildCamp(): StationVisuals {
    // The yard is a raised platform of warm trodden earth — the strongest read against
    // the cold field, and what separates "inside the walls" from "out there" at a glance.
    const campFloor = new Graphics();
    this.raisedSlab(campFloor, WORLD.camp.x + 8, WORLD.camp.y + 8, WORLD.camp.width - 16, WORLD.camp.height - 16, 22, BRAND.colors.yard, BRAND.colors.yardEdge);
    // lighter trodden route linking furnace, grill, counter, and cash plate
    const route: Array<[number, number]> = [
      [WORLD.furnace.x, WORLD.furnace.y + 60],
      [WORLD.butcherInput.x, WORLD.butcherInput.y],
      [WORLD.counter.x, WORLD.counter.y + 55],
      [WORLD.cashZone.x, WORLD.cashZone.y + 55]
    ];
    campFloor.moveTo(isoX(route[0]![0], route[0]![1]), isoY(route[0]![0], route[0]![1]));
    for (const [px, py] of route.slice(1)) campFloor.lineTo(isoX(px, py), isoY(px, py));
    campFloor.stroke({ color: BRAND.colors.yardPath, width: 40, alpha: 0.75, cap: 'round', join: 'round' });
    // scuffing so the flat fill does not read as plastic
    for (let index = 0; index < 26; index += 1) {
      const sx = WORLD.camp.x + 60 + ((index * 811) % (WORLD.camp.width - 120));
      const sy = WORLD.camp.y + 60 + ((index * 487) % (WORLD.camp.height - 120));
      campFloor.ellipse(isoX(sx, sy), isoY(sx, sy), 26, 11).fill({ color: BRAND.colors.yardEdge, alpha: 0.14 });
    }
    campFloor.zIndex = -799;
    this.world.addChild(campFloor);

    // District floors separate the working areas. Their names live on physical
    // signboards below, where roofs and props cannot cut through the lettering.
    for (const zone of ZONES) {
      const patch = new Graphics();
      this.traceWorldRect(patch, zone.x, zone.y, zone.width, zone.height);
      patch.fill({ color: zone.tint, alpha: 0.12 });
      this.traceWorldRect(patch, zone.x, zone.y, zone.width, zone.height);
      patch.stroke({ color: BRAND.colors.yardEdge, width: 2, alpha: 0.12 });
      patch.zIndex = -798;
      this.world.addChild(patch);

    }

    // Palisade runs, with a gap in the east wall (y 780-960) for the gateway and one
    // in the south wall (x 920-1100) for the shoreline. Walls and blockers share the
    // same rectangles so what you see is exactly what stops you.
    const camp = WORLD.camp;
    const eastX = camp.x + camp.width - 24;
    const southY = camp.y + camp.height - 24;
    const walls: Rect[] = [
      { x: camp.x, y: camp.y, width: camp.width, height: 24 },
      { x: camp.x, y: camp.y, width: 24, height: camp.height },
      // Gaps are 300 wide: because screen-relative movement is a world diagonal, a
      // narrower opening catches the player on its corner as they steer through.
      { x: camp.x, y: southY, width: 560, height: 24 },
      { x: camp.x + 860, y: southY, width: camp.width - 860, height: 24 },
      { x: eastX, y: camp.y, width: 24, height: 420 },
      { x: eastX, y: camp.y + 720, width: 24, height: camp.height - 720 }
    ];
    for (const wall of walls) this.addFence(wall.x, wall.y, wall.width, wall.height);
    this.blockers.push(...walls);

    // Building footprints deliberately match their collision rectangles so the
    // visible box is exactly what the player bumps into.
    const furnaceBuilt = isoBuilding({ halfWidth: 54, halfDepth: 45, height: 92, wallColor: 0x4f5664, roofColor: 0xf08a44, art: 'building/furnace' });
    const furnace = furnaceBuilt.container;
    this.place(furnace, WORLD.furnace.x, WORLD.furnace.y);
    this.world.addChild(furnace);
    const furnaceGlow = new Graphics();
    furnaceGlow.ellipse(0, 0, 290, 145).fill({ color: 0xffb34e, alpha: 0.08 });
    furnaceGlow.zIndex = -2;
    furnace.addChildAt(furnaceGlow, 0);
    const warmRing = new Graphics();
    this.place(warmRing, WORLD.furnace.x, WORLD.furnace.y);
    warmRing.zIndex = -790;
    this.world.addChild(warmRing);
    const furnaceFlame = new Graphics();
    furnaceFlame.moveTo(-15, 20).bezierCurveTo(-30, -12, -6, -36, 0, -56).bezierCurveTo(8, -28, 34, -12, 15, 20).fill(0xffa347);
    furnaceFlame.moveTo(-7, 17).bezierCurveTo(-13, -8, 3, -21, 5, -31).bezierCurveTo(18, -9, 17, 5, 7, 17).fill(0xffe09a);
    furnaceFlame.position.set(0, -48);
    furnaceFlame.visible = !furnaceBuilt.illustrated;
    furnace.addChild(furnaceFlame);
    const furnaceSmoke = new Graphics();
    furnaceSmoke.circle(-4, -128, 8).fill({ color: 0xd7e6ea, alpha: 0.28 }).circle(6, -150, 11).fill({ color: 0xd7e6ea, alpha: 0.2 }).circle(-2, -174, 13).fill({ color: 0xd7e6ea, alpha: 0.14 });
    furnaceSmoke.visible = !furnaceBuilt.illustrated;
    furnace.addChild(furnaceSmoke);
    this.blockers.push({ x: WORLD.furnace.x - 54, y: WORLD.furnace.y - 50, width: 108, height: 90 });

    const grillBuilt = isoBuilding({ halfWidth: 80, halfDepth: 50, height: 106, wallColor: 0x8a5536, roofColor: 0xd86938, art: 'building/cookout' });
    this.place(grillBuilt.container, WORLD.butcher.x, WORLD.butcher.y);
    this.world.addChild(grillBuilt.container);
    this.blockers.push({ x: WORLD.butcher.x - 80, y: WORLD.butcher.y - 55, width: 160, height: 100 });
    const workerVisuals = [
      this.createCampWorker(1090, 660, 0xc56e42),
      this.createCampWorker(1300, 660, 0x3f7386, true),
      this.createCampWorker(1200, 700, 0x65815c)
    ];
    workerVisuals[1]!.addChild(this.cookTray);
    // Stock readouts ride on their building so they sort with it instead of colliding with neighbours.
    const butcherProgress = new Graphics();
    butcherProgress.position.set(0, grillBuilt.peakY - 54);
    grillBuilt.container.addChild(butcherProgress);
    const butcherStock = worldText('RAW 0', 14, 0xfff2c0, '800');
    butcherStock.position.set(0, grillBuilt.peakY - 34);
    grillBuilt.container.addChild(butcherStock);

    this.makeInteractionZone(WORLD.butcherInput.x, WORLD.butcherInput.y, 52, 0xf27a45, '');
    const hopper = new Graphics();
    hopper.ellipse(0, 0, 44, 22).fill(0x50352b);
    hopper.moveTo(-40, 0).lineTo(-34, -30).lineTo(34, -30).lineTo(40, 0).closePath().fill(0x855539);
    hopper.ellipse(0, -30, 34, 17).fill(0x9b6948).stroke({ color: BRAND.colors.outline, width: 2.5 });
    hopper.moveTo(-40, 0).lineTo(-34, -30).moveTo(40, 0).lineTo(34, -30).stroke({ color: BRAND.colors.outline, width: 2.5 });
    this.place(hopper, WORLD.butcherInput.x, WORLD.butcherInput.y, 20);
    this.world.addChild(hopper);

    // Cooked portions stay physically at the grill until the player comes back for
    // them. The graphics are repainted from station stock, so the pile visibly grows.
    const mealOutput = this.makeInteractionZone(WORLD.butcherOutput.x, WORLD.butcherOutput.y, 52, BRAND.colors.gold, '');
    const mealPile = new Graphics();
    mealPile.position.set(0, -18);
    mealOutput.addChild(mealPile);

    const counterBuilt = isoBuilding({ halfWidth: 86, halfDepth: 35, height: 78, wallColor: 0x8a5536, roofColor: 0xe5a14f, art: 'building/mess-hall' });
    this.place(counterBuilt.container, WORLD.counter.x, WORLD.counter.y);
    this.world.addChild(counterBuilt.container);
    this.blockers.push({ x: WORLD.counter.x - 86, y: WORLD.counter.y - 42, width: 172, height: 70 });
    // Timber post: the opening income. A cutting bench with a stack of sawn logs.
    this.makeInteractionZone(WORLD.timberPost.x, WORLD.timberPost.y, 54, 0xd9a441, '');
    const timberArt = spriteFor('building/timber-post');
    const timberBench = new Graphics();
    if (timberArt) timberBench.addChild(timberArt);
    else {
      timberBench.moveTo(-46, 0).lineTo(-40, -26).lineTo(40, -26).lineTo(46, 0).closePath().fill(BRAND.colors.timber);
      timberBench.ellipse(0, -26, 40, 15).fill(shade(BRAND.colors.timber, 0.16)).stroke({ color: BRAND.colors.outline, width: 3 });
      timberBench.moveTo(-46, 0).lineTo(-40, -26).moveTo(46, 0).lineTo(40, -26).stroke({ color: BRAND.colors.outline, width: 3 });
      for (let row = 0; row < 3; row += 1) {
        timberBench.ellipse(-14 + row * 14, -34 - row * 9, 9, 6).fill(0xd9ab74).stroke({ color: BRAND.colors.outline, width: 2 });
      }
    }
    this.place(timberBench, WORLD.timberPost.x, WORLD.timberPost.y, 24);
    this.world.addChild(timberBench);

    this.makeInteractionZone(WORLD.servePad.x, WORLD.servePad.y, 54, 0x6fd39b, '');
    const cashZone = this.makeInteractionZone(WORLD.cashZone.x, WORLD.cashZone.y, 50, 0xffd166, '');
    const cashStock = worldText('$0', 15, 0x5a3b20, '800');
    cashStock.position.set(0, -46);
    cashZone.addChild(cashStock);

    // The tutorial teaches the Cookout and timber loop. Compact live stock labels
    // preserve feedback without large signboards covering the working yard.
    const mealOutputStock = worldText('DROP RAW  →  TAKE MEALS', 13, 0xffedc5, '900');
    mealOutputStock.position.set(0, -58);
    mealOutput.addChild(mealOutputStock);
    const serveHint = this.makeWayfindingSign(470, 835, 'MESS HALL', 'SERVE COOKED  →  GET CASH', 0x6fd39b);

    const lumberZone = this.makeInteractionZone(1500, 1120, 54, BRAND.colors.timber, 'LUMBER YARD');
    const lumberDecor = new Graphics();
    lumberDecor.ellipse(0, 10, 82, 26).fill({ color: BRAND.colors.ao, alpha: .2 });
    // One compact, open rack. The two dividers create three 100-log bays.
    lumberDecor.roundRect(-80, -4, 160, 12, 3).fill(0x553b2b).stroke({ color: BRAND.colors.outline, width: 2 });
    lumberDecor.roundRect(-80, -59, 7, 65, 2).fill(0x70492f).stroke({ color: BRAND.colors.outline, width: 1.5 });
    lumberDecor.roundRect(73, -59, 7, 65, 2).fill(0x70492f).stroke({ color: BRAND.colors.outline, width: 1.5 });
    for (const x of [-27, 27]) {
      lumberDecor.roundRect(x - 3, -55, 6, 61, 2).fill(0x8a5d38).stroke({ color: BRAND.colors.outline, width: 1 });
    }
    lumberDecor.moveTo(-76, -54).lineTo(76, -54).stroke({ color: 0xb27a48, width: 6, cap: 'round' });
    lumberDecor.moveTo(-74, -51).lineTo(74, -51).stroke({ color: BRAND.colors.snowHighlight, width: 3, alpha: .78, cap: 'round' });
    const lumberArt = spriteFor('building/lumber-yard');
    lumberDecor.visible = !lumberArt;
    lumberZone.addChild(lumberDecor);
    if (lumberArt) lumberZone.addChild(lumberArt);
    const lumberPile = new Graphics();
    lumberPile.label = lumberArt ? 'illustrated-rack' : 'fallback-rack';
    lumberPile.position.set(0, lumberArt ? -32 : -18);
    const lumberStock = worldText('LOGS 0 / 300', 14, 0xffedc5, '900');
    lumberStock.position.set(0, lumberArt ? -99 : -72);
    lumberZone.addChild(lumberPile, lumberStock);
    for (let index = 0; index < 3; index += 1) {
      const rest = { x: 1590 + index * 25, y: 1125 + index * 24 };
      const container = this.createCampWorker(rest.x, rest.y, 0x8b633f);
      container.label = 'lumberjack-crew';
      const cargo = new Graphics();
      cargo.position.set(-24, -54);
      container.addChild(cargo);
      this.lumberjackVisuals.push({ container, cargo, x: rest.x, y: rest.y,
        state: 'idle', target: null, chopTimer: 0, carried: 0 });
    }
    for (let index = 0; index < 3; index += 1) {
      const hunter = this.createCampWorker(1880 + index * 55, 760 + index * 38, 0x536f4e);
      hunter.label = 'hunter-crew';
      const spear = new Graphics();
      spear.moveTo(-15, -58).lineTo(19, 18).stroke({ color: 0x68462e, width: 4, cap: 'round' });
      spear.moveTo(-19, -66).lineTo(-10, -56).lineTo(-20, -53).closePath().fill(0xc7d8dc).stroke({ color: BRAND.colors.outline, width: 1.5 });
      hunter.addChild(spear);
      this.hunterVisuals.push(hunter);
    }

    const fishStationBuilt = isoBuilding({ halfWidth: 80, halfDepth: 50, height: 90, wallColor: 0x406d78, roofColor: 0x54c8c5, art: 'building/smokehouse' });
    const fishStation = fishStationBuilt.container;
    this.place(fishStation, WORLD.fishStation.x, WORLD.fishStation.y);
    this.world.addChild(fishStation);
    fishStation.visible = this.save.unlocks.dock;
    const fishProgress = new Graphics();
    fishProgress.position.set(0, fishStationBuilt.peakY - 54);
    fishStation.addChild(fishProgress);
    const fishStock = worldText('FISH 0 · PLATES 0', 14, 0xd6ffff, '800');
    fishStock.position.set(0, fishStationBuilt.peakY - 34);
    fishStation.addChild(fishStock);
    const fishDropZone = this.makeInteractionZone(WORLD.fishStation.x - 118, WORLD.fishStation.y + 10, 48, 0x55d7d7, 'DROP FISH');
    fishDropZone.visible = this.save.unlocks.dock;
    const fishOutput = this.makeInteractionZone(WORLD.fishCounter.x, WORLD.fishCounter.y, 50, 0x79e2c6, 'TAKE PLATES');
    fishOutput.visible = this.save.unlocks.dock;
    const fishPile = new Graphics();
    fishPile.position.set(0, -18);
    const fishOutputStock = worldText('READY 0', 13, 0xd6ffff, '800');
    fishOutputStock.position.set(0, -58);
    fishOutput.addChild(fishPile, fishOutputStock);

    const dockProgress = new Graphics();
    this.place(dockProgress, WORLD.fishDock.x, WORLD.fishDock.y, 300);
    dockProgress.y -= 78;
    dockProgress.visible = this.save.unlocks.dock;
    this.world.addChild(dockProgress);

    // The frontier gate blocks a north-south passage out east, so it spans world y.
    const zoneGate = this.makeGate(WORLD.zoneGate.x, WORLD.zoneGate.y, true, 96).container;
    const glacierGate = this.makeGate(WORLD.glacierGate.x, WORLD.glacierGate.y, true, 106).container;
    const whiteoutGate = this.makeGate(WORLD.whiteoutGate.x, WORLD.whiteoutGate.y, true, 116).container;
    // The shoreline gap is a break in the southern (x-running) palisade, so it spans world x.
    const southGate = this.makeGate(1010, WORLD.camp.y + WORLD.camp.height - 12, false, 92).container;
    // The camp's own east gate — the one raids batter — fills the y-running gap in the wall.
    const compoundGate = this.makeGate(WORLD.camp.x + WORLD.camp.width - 12, WORLD.campGate.y, true, 100);
    const gateBar = new Graphics();
    this.place(gateBar, WORLD.campGate.x, WORLD.campGate.y, 400);
    gateBar.y -= 130;
    this.world.addChild(gateBar);
    this.refreshDefenses();
    this.createInfirmary();

    return { furnaceGlow, furnaceFlame, warmRing, butcherProgress, butcherStock, mealOutput, mealPile, mealOutputStock, cashStock, fishProgress, fishStock, fishOutput, fishPile, fishOutputStock, dockProgress, fishBuilding: fishStation, fishDropZone, zoneGate, glacierGate, whiteoutGate, southGate, compoundGate, gateBar, lumberZone, lumberPile, lumberStock, workerVisuals, serveHint };
  }

  /**
   * A run of fence posts standing along a world-space edge. Each post is drawn as an
   * upright billboard at its projected position so the run recedes along the iso axis.
   */
  private addFence(x: number, y: number, width: number, height: number): void {
    const alongX = width > height;
    const length = alongX ? width : height;
    const spacing = 25;
    const count = Math.max(2, Math.round(length / spacing));
    const postHeight = 46;
    for (let index = 0; index <= count; index += 1) {
      const t = index / count;
      const px = alongX ? x + width * t : x + width / 2;
      const py = alongX ? y + height / 2 : y + height * t;
      const post = new Graphics();
      // rail reaching to the next post, drawn first so posts overlap it
      if (index < count) {
        const nx = alongX ? x + width * ((index + 1) / count) : px;
        const ny = alongX ? py : y + height * ((index + 1) / count);
        const dx = isoX(nx, ny) - isoX(px, py);
        const dy = isoY(nx, ny) - isoY(px, py);
        post.moveTo(0, -postHeight * 0.72).lineTo(dx, dy - postHeight * 0.72).stroke({ color: 0x74462f, width: 7 });
        post.moveTo(0, -postHeight * 0.34).lineTo(dx, dy - postHeight * 0.34).stroke({ color: 0x623a27, width: 6 });
      }
      post.roundRect(-9, -postHeight, 18, postHeight, 3).fill(index % 3 ? 0x98633e : 0xa57148);
      post.roundRect(3, -postHeight + 2, 6, postHeight - 2, 2).fill(0x74472f);
      post.moveTo(-5, -postHeight + 5).lineTo(-5, -5).stroke({ color: 0xd5a472, width: 2, alpha: .6 });
      post.roundRect(-9, -postHeight, 18, postHeight, 3).stroke({ color: 0x563a2c, width: 1.5 });
      post.moveTo(-10, -postHeight + 3).lineTo(-7, -postHeight - 4).lineTo(0, -postHeight - 8)
        .lineTo(8, -postHeight - 3).lineTo(10, -postHeight + 3).closePath().fill(BRAND.colors.snowHighlight);
      post.moveTo(-9, -postHeight + 3).lineTo(0, -postHeight + 5).lineTo(9, -postHeight + 2)
        .stroke({ color: 0xbcdce8, width: 2 });
      this.place(post, px, py, 40);
      this.world.addChild(post);
    }
  }

  /** A world-space circular trigger, projected to a ground-plane ellipse. */
  private makeInteractionZone(x: number, y: number, radius: number, color: number, label: string): Container {
    const container = new Container();
    this.place(container, x, y, -20);
    const zone = new Graphics();
    zone.ellipse(0, 0, radius, radius / 2).fill({ color, alpha: 0.24 });
    zone.ellipse(0, 0, radius, radius / 2).stroke({ color, width: 4, alpha: 0.85 });
    zone.ellipse(0, 0, radius - 9, (radius - 9) / 2).stroke({ color: 0xffffff, width: 2, alpha: 0.35 });
    container.addChild(zone);
    if (label) {
      const text = worldText(label, 12, 0xffffff, '800');
      text.position.set(0, radius / 2 + 14);
      container.addChild(text);
    }
    this.world.addChild(container);
    return container;
  }

  /** A physical two-line signboard, kept in front of nearby roofs by its own post depth. */
  private makeWayfindingSign(x: number, y: number, titleText: string, detailText: string, accent: number): Text {
    const container = new Container();
    this.place(container, x, y, 210);
    const title = worldText(titleText, 15, 0xfff4d4, '900');
    const detail = worldText(detailText, 11, 0xe8f7f8, '800');
    const halfWidth = Math.max(78, title.width / 2 + 18, detail.width / 2 + 15);
    const board = new Graphics();
    board.ellipse(0, 5, 22, 8).fill({ color: BRAND.colors.ao, alpha: .24 });
    board.roundRect(-6, -55, 12, 60, 4).fill(0x5a3929).stroke({ color: BRAND.colors.outline, width: 2.5 });
    board.roundRect(-halfWidth, -112, halfWidth * 2, 64, 9).fill(0x294957).stroke({ color: BRAND.colors.outline, width: 4 });
    board.roundRect(-halfWidth + 5, -107, halfWidth * 2 - 10, 54, 6).fill(0x3b6170);
    board.roundRect(-halfWidth + 5, -107, halfWidth * 2 - 10, 7, 3).fill(accent);
    board.circle(-halfWidth + 12, -80, 3).fill(0xd8b478);
    board.circle(halfWidth - 12, -80, 3).fill(0xd8b478);
    title.position.set(0, -88);
    detail.position.set(0, -67);
    container.addChild(board, title, detail);
    this.world.addChild(container);
    return detail;
  }

  /**
   * A gate filling a gap in the palisade. `alongY` must match the axis the fence run
   * follows at that gap, otherwise the doors sit across the wall instead of in it.
   */
  private makeGate(x: number, y: number, alongY: boolean, span: number): GateVisual {
    const gate = new Container();
    // Sort from the gate's ground contact, just like trees and buildings. The old
    // +140 override forced every door pixel over nearby tree canopies after sliding.
    this.place(gate, x, y);
    // projected offsets to each gate post along the chosen world axis
    const postX = alongY ? isoX(0, span) : isoX(span, 0);
    const postY = alongY ? isoY(0, span) : isoY(span, 0);
    const postHeight = 78;
    const doorHeight = 62;
    const post = (ox: number, oy: number): Graphics => {
      const g = new Graphics();
      g.rect(ox - 10, oy - postHeight, 20, postHeight).fill(0x67412f);
      g.rect(ox - 10, oy - postHeight, 20, postHeight).stroke({ color: BRAND.colors.outline, width: 2.5 });
      g.moveTo(ox - 11, oy - postHeight).lineTo(ox, oy - postHeight - 9).lineTo(ox + 11, oy - postHeight).closePath().fill({ color: BRAND.colors.snowHighlight, alpha: 0.9 });
      return g;
    };
    const leaf = (fromX: number, fromY: number, toX: number, toY: number): Graphics => {
      const door = new Graphics();
      door.moveTo(fromX, fromY - doorHeight).lineTo(toX, toY - doorHeight).lineTo(toX, toY).lineTo(fromX, fromY).closePath().fill(0x9c6440);
      door.moveTo(fromX, fromY - doorHeight).lineTo(toX, toY - doorHeight).lineTo(toX, toY).lineTo(fromX, fromY).closePath().stroke({ color: 0x513528, width: 5 });
      door.moveTo(fromX, fromY - doorHeight + 11).lineTo(toX, toY - 11).stroke({ color: 0x7d4e33, width: 5 });
      return door;
    };
    // Separate leaves let the working entrance slide open along the palisade instead
    // of making actors pass through a single painted slab.
    const leftDoor = leaf(-postX, -postY, 0, 0);
    const rightDoor = leaf(0, 0, postX, postY);
    const leftArmor = new Graphics();
    const rightArmor = new Graphics();
    leftDoor.addChild(leftArmor);
    rightDoor.addChild(rightArmor);
    gate.addChild(leftDoor, rightDoor, post(-postX, -postY), post(postX, postY));
    this.world.addChild(gate);
    return { container: gate, leftDoor, rightDoor, leftArmor, rightArmor, slide: { x: postX, y: postY }, open: 0, heldOpen: false };
  }

  private refreshGateArmor(): void {
    const level = this.save.upgrades.gateArmor;
    if (level === this.gateArmorVisualLevel) return;
    this.gateArmorVisualLevel = level;
    const gate = this.station.compoundGate;
    gate.leftArmor.clear();
    gate.rightArmor.clear();
    if (level <= 0) return;
    const draw = (armor: Graphics, fromX: number, fromY: number, toX: number, toY: number): void => {
      const mx = (fromX + toX) / 2;
      const my = (fromY + toY) / 2;
      armor.moveTo(fromX, fromY - 48).lineTo(toX, toY - 14).stroke({ color: 0xd1a56e, width: 7 });
      armor.moveTo(fromX, fromY - 14).lineTo(toX, toY - 48).stroke({ color: 0x6a7880, width: 6 });
      if (level >= 3) armor.roundRect(mx - 18, my - 43, 36, 29, 5).fill(0x526c78).stroke({ color: 0xc4d6d8, width: 3 });
      if (level >= 5) armor.circle(mx, my - 29, 7).fill(0xffb151).circle(mx, my - 29, 3).fill(0xfff0a5);
    };
    draw(gate.leftArmor, -gate.slide.x, -gate.slide.y, 0, 0);
    draw(gate.rightArmor, 0, 0, gate.slide.x, gate.slide.y);
  }

  private refreshDefenses(): void {
    const level = this.save.upgrades.defense;
    const warriorLevel = this.save.upgrades.warriors;
    const signature = `${level}|${warriorLevel}`;
    if (signature === this.defenseVisualLevel) return;
    this.defenseVisualLevel = signature;
    for (const post of this.defenders) post.container.destroy({ children: true });
    this.defenders.length = 0;
    const tier = defenseTierFor(level);
    for (let index = 0; index < tier.count; index += 1) {
      const outside = tier.kind === 'turret' && index >= 2;
      const x = tier.kind === 'spear' ? 1690 : outside ? 1930 : 1650;
      const y = tier.kind === 'spear' ? (index === 0 ? 785 : 950) : index % 2 === 0 ? (outside ? 775 : 690) : (outside ? 965 : 1050);
      const advanced = level >= 5 && index < 2 || index === 2 && level >= 7 || index === 3 && level >= 9;
      const visual = createDefenseVisual(tier.kind, advanced);
      visual.container.label = `compound-defense-${tier.kind}`;
      if (outside) {
        const emplacement = new Graphics();
        emplacement.ellipse(0, 8, 55, 24).fill(0x405761).stroke({ color: 0xbfd3d2, width: 4 });
        emplacement.ellipse(0, 5, 39, 16).fill(0x263d49).stroke({ color: BRAND.colors.outline, width: 3 });
        for (const angle of [-.75, -.25, .25, .75]) emplacement.moveTo(Math.cos(angle) * 42, 5 + Math.sin(angle) * 17)
          .lineTo(Math.cos(angle) * 57, 7 + Math.sin(angle) * 22).stroke({ color: 0xdce9e5, width: 5 });
        visual.container.addChildAt(emplacement, 0);
        visual.container.scale.set(.78);
        visual.height *= .78;
      }
      this.place(visual.container, x, y, 35);
      this.world.addChild(visual.container);
      const healthBar = new Graphics();
      healthBar.visible = false;
      visual.container.addChild(healthBar);
      this.defenders.push({ ...visual, x, y, home: { x, y }, mobile: false, damage: tier.damage, range: tier.range,
        cadence: tier.cadence, projectile: tier.kind, cooldown: index * .13, lastShot: -100,
        health: Number.POSITIVE_INFINITY, maxHealth: Number.POSITIVE_INFINITY, speed: 0, alive: true, healthBar });
    }
    for (let index = 0; index < warriorLevel * 2; index += 1) {
      const angle = index / Math.max(1, warriorLevel * 2) * Math.PI * 2;
      const x = WORLD.furnace.x + Math.cos(angle) * (360 + (index % 2) * 70);
      const y = WORLD.furnace.y + Math.sin(angle) * (260 + (index % 2) * 55);
      const visual = createDefenseVisual('spear', warriorLevel >= 4);
      visual.container.label = 'roaming-compound-warrior';
      this.place(visual.container, x, y, 35);
      this.world.addChild(visual.container);
      const maxHealth = 125 + Math.max(0, warriorLevel - 1) * 35;
      const healthBar = new Graphics();
      healthBar.position.set(0, -86);
      visual.container.addChild(healthBar);
      this.defenders.push({ ...visual, x, y, home: { x, y }, mobile: true, damage: 12 + warriorLevel * 4,
        range: 175 + warriorLevel * 18, cadence: Math.max(.62, 1.15 - warriorLevel * .1), projectile: 'spear', cooldown: index * .11, lastShot: -100,
        health: maxHealth, maxHealth, speed: 105 + warriorLevel * 18, alive: true, healthBar });
    }
  }

  private gateMaxHealth(): number {
    return gateHealthFor(this.save.upgrades.defense, this.save.upgrades.gateArmor, this.save.upgrades.compound);
  }

  /** Rebuilds the visible construction unlocked by the Compound pad. */
  private refreshCompoundVisuals(): void {
    const level = this.save.upgrades.compound;
    if (level === this.compoundVisualLevel) return;
    this.compoundVisualLevel = level;
    for (const visual of this.fortificationVisuals) visual.destroy({ children: true });
    this.fortificationVisuals.length = 0;
    this.compoundBlockers.length = 0;

    const trackFence = (x: number, y: number, width: number, height: number, blocks = true): void => {
      const before = new Set(this.world.children);
      this.addFence(x, y, width, height);
      for (const child of this.world.children) if (!before.has(child)) this.fortificationVisuals.push(child);
      if (blocks) this.compoundBlockers.push({ x, y, width, height });
    };
    const addFloor = (x: number, y: number, width: number, height: number, top: number): void => {
      const floor = new Graphics();
      this.raisedSlab(floor, x, y, width, height, 18, top, BRAND.colors.yardEdge);
      floor.zIndex = -799;
      floor.label = 'compound-annex-floor';
      this.world.addChild(floor);
      this.fortificationVisuals.push(floor);
    };

    if (level >= 1) {
      // A second timber line, iron braces, and corner watchfires visibly harden the core.
      trackFence(WORLD.camp.x + 28, WORLD.camp.y + 34, WORLD.camp.width - 56, 18, false);
      trackFence(WORLD.camp.x + 28, WORLD.camp.y + 34, 18, WORLD.camp.height - 68, false);
      for (const [x, y] of [[350, 350], [1690, 350], [350, 1390]] as Array<[number, number]>) {
        const brace = new Graphics();
        brace.roundRect(-13, -64, 26, 64, 4).fill(0x52616a).stroke({ color: BRAND.colors.outline, width: 3 });
        brace.moveTo(-18, -52).lineTo(18, -12).moveTo(18, -52).lineTo(-18, -12).stroke({ color: 0xd0a66c, width: 6 });
        brace.circle(0, -73, 13).fill(0xff9c50).circle(0, -73, 6).fill(0xffe19a);
        this.place(brace, x, y, 70);
        brace.label = 'compound-reinforcement';
        this.world.addChild(brace);
        this.fortificationVisuals.push(brace);
      }
    }
    if (level >= 2) {
      // Shoreline annex wraps the fishing economy and leaves a broad south gate.
      addFloor(180, 1430, 1600, 770, 0x9d9b88);
      trackFence(180, 1430, 20, 770);
      trackFence(1760, 1430, 20, 770);
      trackFence(180, 2180, 560, 20);
      trackFence(1100, 2180, 680, 20);
    }
    if (level >= 3) {
      // The eastern stronghold claims the first frontier up to its guarded ice pass.
      addFloor(1730, 300, 810, 1150, 0xae9878);
      trackFence(1730, 300, 810, 20);
      trackFence(1730, 1430, 810, 20);
      trackFence(2520, 300, 20, 410);
      trackFence(2520, 1030, 20, 420);
    }
    this.blockerCacheKey = '';
  }

  private createInfirmary(): void {
    const infirmary = new Container();
    // In the hearth district beside the furnace, clear of the respawn point.
    this.place(infirmary, 1170, 1050, 30);
    const shadow = contactShadow(38, 15, 0.22);
    shadow.position.set(0, 30);
    // A ridge tent pitched along the iso axis: two sloping canvas planes to a ridge line.
    const halfW = 38;
    const halfD = 30;
    const rise = 48;
    const [east, south, west, north] = footprint(halfW, halfD) as [Vec2, Vec2, Vec2, Vec2];
    const ridgeFront = { x: (south.x + east.x) / 2, y: (south.y + east.y) / 2 - rise };
    const ridgeBack = { x: (west.x + north.x) / 2, y: (west.y + north.y) / 2 - rise };
    const canvas = 0xf2f6f7;
    const tent = new Graphics();
    tent.moveTo(west.x, west.y).lineTo(south.x, south.y).lineTo(ridgeFront.x, ridgeFront.y).lineTo(ridgeBack.x, ridgeBack.y).closePath().fill(canvas);
    tent.moveTo(south.x, south.y).lineTo(east.x, east.y).lineTo(ridgeFront.x, ridgeFront.y).closePath().fill(shade(canvas, -0.16));
    tent.moveTo(west.x, west.y).lineTo(south.x, south.y).lineTo(ridgeFront.x, ridgeFront.y).lineTo(ridgeBack.x, ridgeBack.y).closePath().stroke({ color: BRAND.colors.outline, width: 3 });
    tent.moveTo(south.x, south.y).lineTo(ridgeFront.x, ridgeFront.y).lineTo(east.x, east.y).stroke({ color: BRAND.colors.outline, width: 2.5 });
    // Stitched canvas, a warm entrance, and timber footing make the sanctuary a
    // working infirmary instead of a bare triangular marker.
    tent.moveTo(south.x + 4, south.y - 4).lineTo(ridgeFront.x + 1, ridgeFront.y + 11)
      .lineTo(east.x - 8, east.y - 4).closePath().fill(0x475c5a);
    tent.moveTo(south.x + 10, south.y - 5).lineTo(ridgeFront.x + 4, ridgeFront.y + 18)
      .lineTo(east.x - 11, east.y - 5).closePath().fill({ color: 0xffc77a, alpha: .65 });
    tent.moveTo(west.x + 8, west.y - 1).lineTo(ridgeBack.x + 8, ridgeBack.y + 5)
      .moveTo(south.x - 9, south.y - 3).lineTo(ridgeFront.x - 9, ridgeFront.y + 5)
      .stroke({ color: 0x9aaea3, width: 1.8, alpha: .65 });
    tent.moveTo(west.x - 3, west.y + 2).lineTo(south.x, south.y + 3).lineTo(east.x + 3, east.y + 2)
      .stroke({ color: 0x89623e, width: 5, cap: 'round' });
    snowCap(tent, [ridgeBack, ridgeFront], 6);
    const cross = new Graphics();
    cross.roundRect(-4, -40, 8, 20, 2).fill(BRAND.colors.danger).roundRect(-10, -34, 20, 8, 2).fill(BRAND.colors.danger);
    infirmary.addChild(shadow, tent, cross);
    this.world.addChild(infirmary);
  }

  private createCampWorker(x: number, y: number, coatColor: number, cook = false): Container {
    const worker = new Container();
    this.place(worker, x, y, 35);
    const shadow = contactShadow(22, 9, 0.2);
    shadow.position.set(0, 18);
    const art = spriteFor(cook ? 'actor/villager' : 'actor/worker');
    const body = new Graphics();
    if (art) body.addChild(art);
    else {
      body.roundRect(-16, -27, 32, 46, 13).fill(coatColor);
      body.moveTo(9, -27).lineTo(16, -22).lineTo(16, 15).lineTo(9, 19).closePath().fill(shade(coatColor, -0.28));
      body.roundRect(-16, -27, 32, 46, 13).stroke({ color: BRAND.colors.outline, width: 2.5 });
      body.circle(0, -34, 14).fill(0xe1c19b).stroke({ color: BRAND.colors.outline, width: 2.5 });
      body.moveTo(-13, -38).bezierCurveTo(-8, -55, 8, -55, 14, -37).lineTo(10, -29).lineTo(-11, -30).closePath().fill(0x284b5d);
    }
    const tool = new Graphics();
    if (cook && art) {
      tool.moveTo(-10, -65).lineTo(9, -65).lineTo(14, -30).lineTo(-14, -30).closePath().fill(0xf3e8cf).stroke({ color: 0x8a765b, width: 1.5 });
      tool.roundRect(-7, -48, 14, 10, 2).fill(0xd1c4a6);
      tool.ellipse(0, -109, 15, 7).fill(0xfff6df).stroke({ color: 0xb0a58c, width: 1.5 });
      tool.roundRect(-11, -122, 22, 15, 5).fill(0xfff6df);
    }
    if (!art) tool.roundRect(12, -17, 7, 39, 3).fill(0x75482e).stroke({ color: BRAND.colors.outline, width: 1.5 }).ellipse(16, -21, 10, 6).fill(0xb4c4c7).stroke({ color: BRAND.colors.outline, width: 1.5 });
    worker.addChild(shadow, body, tool);
    this.world.addChild(worker);
    return worker;
  }

  private createPlayer(): PlayerEntity {
    const container = new Container();
    this.place(container, WORLD.respawn.x, WORLD.respawn.y, 100);
    const shadow = contactShadow(29, 13, 0.26);
    shadow.position.set(0, 22);
    const protectionAura = new Graphics();
    protectionAura.circle(0, -10, 42).fill({ color: BRAND.colors.safe, alpha: 0.16 }).circle(0, -10, 42).stroke({ color: BRAND.colors.safe, width: 3, alpha: 0.7 });
    protectionAura.visible = false;
    const pack = new Graphics();
    pack.position.set(-30, -74);
    // Illustrated actors remain one poseable display object, just like the
    // procedural body. The fallback keeps development builds playable if an
    // asset is ever omitted from the manifest.
    const art = spriteFor('actor/trailwarden-unarmed');
    const body = new Graphics();
    if (art) body.addChild(art);
    else drawTrailwardenBody(body);
    const weapon = new Graphics();
    drawWeapon(weapon, this.save.upgrades.weaponTier);
    weapon.pivot.set(18, 8);
    // The Armory weapon is code-layered so every unlocked tier is visible even when
    // the illustrated character sprite is active.
    const chopAxe = new Graphics();
    drawWeapon(chopAxe, 1);
    chopAxe.pivot.set(18, 8);
    chopAxe.visible = false;
    const healthBar = new Graphics();
    healthBar.position.set(0, art ? -122 : -82);
    const ammoText = worldText('', 13, 0xffe29a, '900');
    ammoText.position.set(0, art ? -145 : -105);
    ammoText.visible = false;
    container.addChild(shadow, protectionAura, pack, body, weapon, chopAxe, healthBar, ammoText);
    this.world.addChild(container);

    return {
      x: WORLD.respawn.x, y: WORLD.respawn.y, vx: 0, vy: 0, facing: 0, health: maxHealthFor(this.save.upgrades.maxHealth),
      meat: 0, fish: 0, meals: 0, fishMeals: 0, wood: 0, spawnProtection: 2.5, attackCooldown: 0, attackVisual: 0, chopVisual: 0, hurtVisual: 0, defeatVisual: 0,
      pendingHitTimer: 0, pendingTarget: null, alive: true, respawnTimer: 0,
      ammo: weaponMagazineFor(this.save.upgrades.weaponTier), reloadTimer: 0,
      container, body, pack, weapon, chopAxe, ammoText, healthBar, shadow, protectionAura,
      cargoKey: '', healthKey: ''
    };
  }

  private createEnemy(kind: EnemyKind, x: number, y: number, isRaid: boolean): EnemyEntity {
    // Normal wildlife never originates inside the settlement. Raiders are exempt
    // because their explicit job is to attack the gate during a surge.
    if (!isRaid && this.isInsideCompound(x, y, 90)) x = WILD_EAST_EDGE;
    const baseConfig = ENEMIES[kind];
    const regionTier = !isRaid && x >= WORLD.whiteoutGate.x ? 2 : !isRaid && x >= WORLD.glacierGate.x ? 1 : 0;
    const config = isRaid || regionTier === 0 ? baseConfig : {
      ...baseConfig,
      health: Math.round(baseConfig.health * (1 + regionTier * .38)),
      damage: Math.round(baseConfig.damage * (1 + regionTier * .24)),
      speed: Math.round(baseConfig.speed * (1 + regionTier * .05))
    };
    const container = new Container();
    this.place(container, x, y, 40);
    const targetRing = new Graphics().ellipse(0, 26, 48 * config.scale, 24 * config.scale).stroke({ color: 0xffc25b, width: 5, alpha: 0.85 });
    targetRing.visible = false;
    const shadow = contactShadow(45 * config.scale, 21 * config.scale, 0.24);
    shadow.position.set(0, 30);
    // Supplied creature art replaces the drawn body; the animation code below poses
    // whichever one exists, since both are a single display object on the container.
    const artKey = kind === 'icehorn' ? 'creature/icehorn' : 'creature/rimeback';
    const art = spriteFor(artKey);
    const body = new Graphics();
    if (!art) drawCreatureBody(body, kind, config);
    const healthBar = new Graphics();
    healthBar.position.set(8, -90 * config.scale);
    const alert = worldText('!', 33, 0xff835d, '800');
    alert.position.set(0, -125 * config.scale);
    alert.visible = false;
    container.addChild(targetRing, shadow, body);
    if (art) body.addChild(art);
    container.addChild(healthBar, alert);
    this.world.addChild(container);
    return {
      id: this.nextEnemyId++, kind, config, spawn: { x, y }, x, y, vx: 0, vy: 0, facing: Math.random() * Math.PI * 2,
      health: config.health, state: isRaid ? 'raid' : 'idle', stateTimer: 1 + Math.random() * 2, attackCooldown: 0,
      wanderAngle: Math.random() * Math.PI * 2, dropped: false, isRaid, alive: true, container, body, shadow, healthBar, targetRing, alert,
      healthKey: '', raidApproachedGate: false,
      cashReward: isRaid ? ECONOMY.bearCashDrop : roamingBearCash(kind === 'icehorn' ? 'icehorn' : 'rimeback', regionTier), defenderTarget: null
    };
  }

  private buildUpgradePads(): void {
    for (const slot of PAD_SLOTS) {
      const container = new Container();
      this.place(container, slot.x, slot.y, -15);
      container.zIndex = -780;
      container.label = 'upgrade-floor-pad';
      const fixedId = slot.fixed;
      const plate = new Graphics();
      const ink = new Container();
      ink.setFromMatrix(new Matrix(.9, -.45, .9, .45, 0, 0));
      const icon = worldText('', 28, 0xfff8e7, '900');
      icon.position.set(0, -15);
      const title = worldText('', 12, 0xfff0cf, '900');
      title.visible = false;
      const detail = worldText('', 20, 0xffffff, '900');
      detail.position.set(0, 17);
      const progress = new Graphics();
      ink.addChild(icon, title, detail);
      container.addChild(plate, progress, ink);
      this.world.addChild(container);
      this.upgradePads.push({ id: fixedId ?? PAD_PRIORITY[0]!, fixed: fixedId, x: slot.x, y: slot.y, paid: fixedId ? this.save.contributions[fixedId] ?? 0 : 0, lockedUntilExit: false, container, plate, icon, title, detail, progress, paintKey: '', dwell: 0 });
    }
    this.resolvePadSlots();
  }

  /**
   * Assigns the next few worthwhile upgrades to the fixed plate slots. A slot only
   * changes hands when nothing has been paid into it, so partial payments are never lost.
   */
  private resolvePadSlots(): void {
    const queue = PAD_PRIORITY.filter(id =>
      isUpgradeAvailable(id, this.save) && this.save.upgrades[id] < UPGRADE_BY_ID[id].maxLevel)
      .sort((a, b) => {
        // Keep funded projects first, surface the crew milestone, then rotate
        // toward the least-upgraded lines instead of hiding them behind max levels.
        const funded = Number(Boolean(this.save.contributions[b])) - Number(Boolean(this.save.contributions[a]));
        const crew = Number(b === 'worker' && this.save.upgrades.worker === 0) - Number(a === 'worker' && this.save.upgrades.worker === 0);
        return funded || crew || this.save.upgrades[a] - this.save.upgrades[b];
      });
    const taken = new Set<UpgradeId>();
    // Slots mid-payment keep what they have.
    for (const pad of this.upgradePads) if (pad.paid > 0) taken.add(pad.id);
    let cursor = 0;
    for (const pad of this.upgradePads) {
      // A pinned slot always offers its own line, and hides once that line is maxed.
      if (pad.fixed) {
        pad.id = pad.fixed;
        pad.container.visible = isUpgradeAvailable(pad.fixed, this.save)
          && (pad.fixed === 'defense' || this.save.upgrades[pad.fixed] < UPGRADE_BY_ID[pad.fixed].maxLevel);
        continue;
      }
      if (pad.paid > 0) continue;
      while (cursor < queue.length && taken.has(queue[cursor]!)) cursor += 1;
      const next = queue[cursor];
      if (next === undefined) {
        pad.container.visible = false;
        continue;
      }
      cursor += 1;
      taken.add(next);
      pad.paid = this.save.contributions[next] ?? 0;
      if (pad.id !== next) {
        pad.id = next;
        pad.paintKey = '';
        pad.dwell = 0;
      }
      pad.container.visible = true;
    }
  }

  private buildUnlockPads(): void {
    const specs = [
      // Build plates are paid in timber hauled on the player's back, not cash.
      { kind: 'zone2' as const, payment: 'wood' as const, x: 2390, y: 900, cost: ECONOMY.zone2Cost, requires: 30, title: 'OPEN FRONTIER' },
      // Offset into the yard so the closed shoreline gate cannot cover the price.
      { kind: 'dock' as const, payment: 'wood' as const, x: 1180, y: 1210, cost: ECONOMY.dockCost, requires: 45, title: 'THAW SHORELINE' },
      // Later expedition passes use cash and only become reachable in sequence.
      { kind: 'glacier' as const, payment: 'cash' as const, x: 4210, y: 2200, cost: ECONOMY.glacierCost, requires: 0, title: 'GLACIER REACH' },
      { kind: 'whiteout' as const, payment: 'cash' as const, x: 6610, y: 3800, cost: ECONOMY.whiteoutCost, requires: 0, title: 'WHITEOUT EXPANSE' }
    ];
    for (const spec of specs) {
      const container = new Container();
      this.place(container, spec.x, spec.y, -20);
      container.zIndex = -779;
      container.label = 'build-floor-pad';
      const plate = new Graphics();
      const ink = new Container();
      ink.setFromMatrix(new Matrix(.9, -.45, .9, .45, 0, 0));
      const progress = new Graphics();
      const badge = new Graphics();
      badge.position.set(-22, 20);
      badge.scale.set(.75);
      const badgeCount = worldText(`${spec.requires}`, 20, 0xffffff, '900');
      badgeCount.position.set(12, 16);
      const title = worldText(spec.title, 12, 0xffffff, '800');
      title.visible = false;
      const detail = worldText('⚒', 34, 0xfff3d0, '900');
      detail.scale.set(.82);
      detail.position.set(0, -18);
      ink.addChild(badge, badgeCount, detail, title);
      container.addChild(plate, progress, ink);
      this.world.addChild(container);
      const contributed = this.save.contributions[spec.kind] ?? 0;
      this.unlockPads.push({ ...spec, paid: spec.payment === 'cash' ? contributed : 0, delivered: spec.payment === 'wood' ? contributed : 0, lockedUntilExit: false, container, plate, title, detail, badge, badgeCount, progress, paintKey: '', dwell: 0 });
    }
  }

  private buildDistrictBusinesses(): void {
    // A staffed shoreline finally reads as a working business rather than empty ice.
    for (let index = 0; index < 3; index += 1) {
      const fisher = this.createCampWorker(520 + index * 95, 1810 + (index % 2) * 80, 0x3e7886);
      fisher.label = 'fisher-crew';
      this.fisherVisuals.push(fisher);
    }

    const rig = isoBuilding({ halfWidth: 112, halfDepth: 72, height: 132, wallColor: 0x586873, roofColor: 0xe0a14f, label: 'SALVAGE RIG', art: 'building/ore-rig' });
    if (rig.illustrated) {
      rig.shadow.clear().ellipse(0, 8, 110, 38).fill({ color: BRAND.colors.ao, alpha: .18 });
      if (rig.sign) rig.sign.y = -252;
    }
    this.oreRigBuilding = rig.container;
    this.place(this.oreRigBuilding, 5050, 2380);
    this.oreRigBuilding.label = 'glacier-salvage-rig';
    this.world.addChild(this.oreRigBuilding);
    const rigMachinery = new Graphics();
    rigMachinery.roundRect(-92, -116, 26, 104, 7).fill(0x344b58).stroke({ color: BRAND.colors.outline, width: 3 });
    rigMachinery.roundRect(61, -88, 31, 77, 8).fill(0x455e68).stroke({ color: BRAND.colors.outline, width: 3 });
    rigMachinery.circle(76, -78, 10).fill(BRAND.colors.ember).circle(76, -78, 4).fill(0xffe18c);
    rigMachinery.moveTo(-79, -109).lineTo(-26, -158).lineTo(31, -111).stroke({ color: 0x78939a, width: 10, join: 'round' });
    rigMachinery.moveTo(-26, -158).lineTo(-26, -53).stroke({ color: 0xb3c4c6, width: 8 });
    rigMachinery.moveTo(-34, -53).lineTo(-26, -24).lineTo(-18, -53).closePath().fill(0xffad52).stroke({ color: BRAND.colors.outline, width: 2 });
    rigMachinery.moveTo(-64, -28).lineTo(55, 25).stroke({ color: 0x2e4652, width: 20 });
    for (let offset = -52; offset <= 42; offset += 19) rigMachinery.circle(offset, -22 + (offset + 52) * .43, 6).fill(0x9babb0).stroke({ color: BRAND.colors.outline, width: 1.5 });
    rigMachinery.visible = !rig.illustrated;
    this.oreRigBuilding.addChild(rigMachinery);
    this.blockers.push({ x: 4938, y: 2308, width: 224, height: 144 });
    this.oreCashZone = this.makeInteractionZone(5200, 2470, 56, BRAND.colors.gold, 'COLLECT ORE CASH');

    const foundry = isoBuilding({ halfWidth: 130, halfDepth: 84, height: 148, wallColor: 0x394f62, roofColor: 0x62cdd0, label: 'ROBOT FOUNDRY' });
    this.robotFoundry = foundry.container;
    this.place(this.robotFoundry, 7280, 3900);
    this.robotFoundry.label = 'whiteout-robot-foundry';
    this.world.addChild(this.robotFoundry);
    this.blockers.push({ x: 7150, y: 3816, width: 260, height: 168 });
    for (let index = 0; index < 6; index += 1) {
      const robot = new Container();
      const shadow = contactShadow(20, 8, .2);
      shadow.position.set(0, 14);
      const body = new Graphics();
      body.roundRect(-14, -34, 28, 35, 7).fill(0x607d8c).stroke({ color: BRAND.colors.outline, width: 3 });
      body.roundRect(-11, -48, 22, 17, 5).fill(0xa8d9df).stroke({ color: BRAND.colors.outline, width: 2.5 });
      body.circle(-5, -40, 3).fill(0xffd166).circle(5, -40, 3).fill(0xffd166);
      body.moveTo(-9, 1).lineTo(-13, 13).moveTo(9, 1).lineTo(13, 13).stroke({ color: 0x3c5564, width: 6, cap: 'round' });
      robot.addChild(shadow, body);
      this.place(robot, 7110 + (index % 3) * 90, 4060 + Math.floor(index / 3) * 90, 35);
      robot.label = 'utility-robot';
      this.world.addChild(robot);
      this.robotVisuals.push(robot);
    }
  }

  private buildDecorations(): void {
    // A close stand of timber just outside the gate — the opening income is a short
    // walk away — thinning out into the hunting grounds further east.
    const trees: Array<[number, number, number]> = [
      [1900, 700, 1], [1960, 900, .9], [1880, 1060, 1.05], [2020, 1180, .85],
      [1980, 560, .95], [1840, 840, .8], [2100, 760, 1], [2060, 1000, .9],
      [120, 240, 1.1], [140, 700, .85], [120, 1150, 1], [150, 1520, .9],
      [2350, 230, .85], [2650, 300, 1.1], [2980, 250, .9], [3260, 320, 1.05],
      [3280, 780, .85], [3300, 1300, 1], [3180, 1800, .95], [2760, 1900, 1.05],
      [2280, 1980, .85], [1980, 2050, 1], [2500, 1150, .8], [3050, 1600, .95]
    ];
    // Deterministic forest pockets give each paid expedition a resource-rich reason
    // to explore without changing layout between reloads. Keep the guarded passes
    // clear so no tree can hide an unlock plate or physically plug its route.
    const forestBands = [
      // Twenty-four extra trunks in the opening frostwild plus doubled expedition
      // forests brings the full map from 126 authored candidates to 252.
      { minX: 1880, maxX: 2420, minY: 220, maxY: 2080, count: 24, seed: 5 },
      { minX: 2780, maxX: 4160, minY: 260, maxY: 5900, count: 60, seed: 17 },
      { minX: 4680, maxX: 6560, minY: 260, maxY: 5900, count: 68, seed: 41 },
      { minX: 7080, maxX: 9380, minY: 260, maxY: 5900, count: 76, seed: 73 }
    ];
    const passes = [WORLD.zoneGate, WORLD.glacierGate, WORLD.whiteoutGate];
    for (const band of forestBands) {
      const spanX = band.maxX - band.minX;
      const spanY = band.maxY - band.minY;
      for (let index = 0; index < band.count; index += 1) {
        const x = band.minX + ((index * 463 + band.seed * 97) % spanX);
        const y = band.minY + ((index * 887 + band.seed * 53) % spanY);
        if (passes.some(pass => distanceSquared(x, y, pass.x, pass.y) < 285 ** 2)) continue;
        const scale = .78 + ((index * 29 + band.seed) % 34) / 100;
        trees.push([x, y, scale]);
      }
    }
    for (const [x, y, scale] of trees) this.makeTree(x!, y!, scale!);
    const rocks = [
      [1930, 700, 46], [2200, 480, 38], [2480, 1180, 54], [2150, 1600, 42], [2820, 900, 52],
      [3080, 1420, 48], [2650, 1750, 58], [1880, 1420, 40], [3220, 620, 44], [2380, 2020, 50]
    ];
    for (const [x, y, radius] of rocks) this.makeRock(x!, y!, radius!);

    const dock = new Container();
    dock.label = 'dock-visual';
    this.place(dock, WORLD.fishDock.x, WORLD.fishDock.y, 10);
    const deckHalfW = 60;
    const deckHalfD = 120;
    const pier = new Graphics();
    // deck as a raised ground diamond with a plank grain running along the iso axis
    traceFootprint(pier, deckHalfW * 1.06, deckHalfD * 1.06, 10);
    pier.fill({ color: BRAND.colors.ao, alpha: 0.2 });
    traceFootprint(pier, deckHalfW, deckHalfD, -14);
    pier.fill(0x815539);
    traceFootprint(pier, deckHalfW, deckHalfD, -14);
    pier.stroke({ color: BRAND.colors.outline, width: 4 });
    for (let offset = -deckHalfD + 26; offset < deckHalfD; offset += 26) {
      pier.moveTo(isoX(-deckHalfW, offset), isoY(-deckHalfW, offset) - 14)
        .lineTo(isoX(deckHalfW, offset), isoY(deckHalfW, offset) - 14)
        .stroke({ color: 0xb27a4e, width: 3, alpha: 0.8 });
    }
    const crane = new Graphics();
    const craneBase = { x: isoX(deckHalfW - 14, -deckHalfD + 40), y: isoY(deckHalfW - 14, -deckHalfD + 40) - 14 };
    crane.rect(craneBase.x - 6, craneBase.y - 112, 12, 112).fill(0x533b31).stroke({ color: BRAND.colors.outline, width: 2.5 });
    crane.moveTo(craneBase.x, craneBase.y - 108).lineTo(craneBase.x + 74, craneBase.y - 74).stroke({ color: 0x533b31, width: 9 });
    crane.moveTo(craneBase.x, craneBase.y - 108).lineTo(craneBase.x + 74, craneBase.y - 74).stroke({ color: BRAND.colors.outline, width: 2, alpha: 0.6 });
    crane.circle(craneBase.x, craneBase.y - 108, 7).fill(shade(0x533b31, -0.1)).stroke({ color: BRAND.colors.outline, width: 2 });
    const label = worldText('ICE FISHING · HOLD TO CATCH', 17, 0xe4ffff, '800');
    label.position.set(0, isoY(0, deckHalfD) + 40);
    this.dockAnchor = { x: craneBase.x + 74, y: craneBase.y - 74 };
    this.dockLine = new Graphics();
    this.dockBobber = new Graphics().ellipse(0, 0, 8, 5).fill(BRAND.colors.gold).stroke({ color: BRAND.colors.outline, width: 2 });
    dock.addChild(pier, crane, this.dockLine, this.dockBobber, label);
    dock.visible = this.save.unlocks.dock;
    this.world.addChild(dock);

    this.blockers.push(
      // Open water either side of the fishing pier.
      { x: 0, y: 1975, width: 500, height: 225 },
      { x: 745, y: 1975, width: 1560 - 745, height: 225 }
    );

    this.buildProps();

    const zoneSign = worldText('RIME TRAIL', 20, 0x4b7285, '800');
    zoneSign.alpha = 0.7;
    this.place(zoneSign, 2120, 420, 30);
    this.world.addChild(zoneSign);
    const zone2Sign = worldText('ICEHORN RIDGE', 20, 0x4b7285, '800');
    zone2Sign.alpha = 0.7;
    this.place(zone2Sign, 2950, 420, 30);
    this.world.addChild(zone2Sign);
    const glacierSign = worldText('GLACIER REACH', 22, 0x4b7285, '800');
    glacierSign.alpha = 0.72;
    this.place(glacierSign, 5180, 720, 30);
    this.world.addChild(glacierSign);
    const whiteoutSign = worldText('WHITEOUT EXPANSE', 22, 0x4b7285, '800');
    whiteoutSign.alpha = 0.72;
    this.place(whiteoutSign, 7720, 720, 30);
    this.world.addChild(whiteoutSign);
    const auroraSign = worldText('AURORA WASTE', 20, 0x4b7285, '800');
    auroraSign.alpha = 0.64;
    this.place(auroraSign, 8750, 4900, 30);
    this.world.addChild(auroraSign);
  }

  /**
   * Purely decorative yard clutter and field drifts. None of these add blockers —
   * they sit in gaps the player never needs to walk through, so collision is unchanged.
   */
  private buildProps(): void {
    // Clustered in the Stores district, with a few working crates by the cookout.
    const crates: Array<[number, number, number]> = [
      [420, 960, 3], [540, 1010, 2], [390, 1070, 2], [620, 950, 2],
      [1080, 480, 2], [1330, 500, 3], [1500, 450, 2]
    ];
    for (const [x, y, count] of crates) {
      const g = new Graphics();
      drawCrateStack(g, count);
      this.place(g, x, y, 28);
      this.world.addChild(g);
    }

    const barrels: Array<[number, number]> = [[700, 1020], [470, 1050], [1400, 420], [1590, 460], [890, 470]];
    for (const [x, y] of barrels) {
      const g = new Graphics();
      drawBarrel(g);
      this.place(g, x, y, 26);
      this.world.addChild(g);
    }

    // drifts breaking up the open field, biased away from the walking routes
    const drifts: Array<[number, number, number]> = [
      [1950, 500, 76], [2250, 780, 88], [2620, 520, 74], [2900, 1250, 94], [2180, 1150, 66],
      [1880, 1700, 70], [2500, 1450, 82], [3050, 850, 72], [3200, 1650, 78], [2750, 2000, 68],
      [180, 480, 80], [200, 1350, 66], [1700, 1900, 72], [2400, 300, 60]
    ];
    for (const [x, y, width] of drifts) {
      const g = new Graphics();
      drawSnowdrift(g, width);
      this.place(g, x, y, -40);
      this.world.addChild(g);
    }
  }

  private makeTree(x: number, y: number, scale: number): void {
    // Keep trunks far enough inside the playable snow that the player can stand on
    // their inward side, including at the far edges of the expanded ice fields.
    x = clamp(x, TREE_EDGE_INSET, WORLD.width - TREE_EDGE_INSET);
    y = clamp(y, TREE_EDGE_INSET, WORLD.height - TREE_EDGE_INSET);
    const tree = new Container();
    this.place(tree, x, y, 20);
    tree.scale.set(scale);
    tree.cullable = true;
    tree.cullArea = new Rectangle(-78, -155, 156, 190);
    const shadow = contactShadow(45, 22, 0.2);
    shadow.position.set(0, 22);
    const trunk = new Graphics().rect(-8, -28, 16, 55).fill(0x74513a).rect(-8, -28, 16, 55).stroke({ color: BRAND.colors.outline, width: 2.5 });
    const art = spriteFor('prop/tree');
    trunk.visible = !art;
    const crown = new Graphics();
    if (art) crown.addChild(art);
    else {
      crown.moveTo(0, -132).lineTo(-50, -58).lineTo(-24, -61).lineTo(-63, -10).lineTo(63, -10).lineTo(24, -61).lineTo(50, -58).closePath().fill(0x3f7f83);
      crown.moveTo(0, -132).lineTo(0, -10).lineTo(-63, -10).lineTo(-24, -61).lineTo(-50, -58).closePath().fill({ color: 0xffffff, alpha: 0.1 });
      crown.moveTo(0, -132).lineTo(-50, -58).lineTo(-24, -61).lineTo(-63, -10).lineTo(63, -10).lineTo(24, -61).lineTo(50, -58).closePath().stroke({ color: BRAND.colors.outline, width: 4, alpha: 0.65 });
      snowCap(crown, [{ x: -50, y: -58 }, { x: -24, y: -61 }, { x: 0, y: -132 }, { x: 24, y: -61 }, { x: 50, y: -58 }], 8);
    }
    tree.addChild(shadow, trunk, crown);
    this.world.addChild(tree);
    // Trees are fellable, so their collision lives on the entity rather than the
    // static blocker list — a stump must not keep blocking the way.
    this.trees.push({
      x, y, scale, health: TIMBER.treeHealth, alive: true, regrow: 0, container: tree, crown, shakeUntil: 0,
      blocker: { x: x - 18 * scale, y: y - 12 * scale, width: 36 * scale, height: 42 * scale }
    });
  }

  /**
   * Walking up to a standing tree fells it over a few swings. Each felled tree throws
   * logs that magnet in like any other pickup, so hauling timber uses the same feel
   * as hauling provisions.
   */
  private updateChopping(dt: number): void {
    this.chopCooldown = Math.max(0, this.chopCooldown - dt);
    this.player.chopVisual = Math.max(0, this.player.chopVisual - dt);
    for (const tree of this.trees) {
      if (tree.alive) continue;
      tree.regrow -= dt;
      if (tree.regrow <= 0) {
        const spot = this.findTreeRegrowthSpot(tree);
        if (!spot) {
          // Every candidate is still within the current peripheral view. Try again
          // shortly rather than growing a tree visibly in front of the player.
          tree.regrow = 1.5;
          continue;
        }
        tree.x = spot.x;
        tree.y = spot.y;
        tree.blocker.x = spot.x - 18 * tree.scale;
        tree.blocker.y = spot.y - 12 * tree.scale;
        this.place(tree.container, spot.x, spot.y, 20);
        tree.alive = true;
        tree.health = TIMBER.treeHealth;
        tree.container.visible = true;
        tree.container.scale.set(tree.scale);
        this.treeVersion += 1;
        this.spawnBurst(tree.x, tree.y - 30, 0x8fd6a8, 6);
      }
    }
    if (!this.player.alive || this.chopCooldown > 0) return;

    let target: TreeEntity | null = null;
    // A little extra reach guarantees trees near the world boundary can be struck
    // from their playable side without asking the player to cross the map border.
    let best = 112 ** 2;
    for (const tree of this.trees) {
      if (!tree.alive) continue;
      const distance = distanceSquared(this.player.x, this.player.y, tree.x, tree.y);
      if (distance < best) { best = distance; target = tree; }
    }
    if (!target) return;

    this.chopCooldown = TIMBER.chopCadence;
    this.player.facing = Math.atan2(target.y - this.player.y, target.x - this.player.x);
    this.player.chopVisual = 0.3;
    target.health -= 1;
    target.shakeUntil = this.simulationTime + 0.18;
    this.audio.play('impact', 0.8);
    this.audio.haptic(10);
    this.spawnBurst(target.x, target.y - 40, 0xc08a52, 5);
    if (target.health > 0) return;

    target.alive = false;
    target.regrow = TIMBER.regrowSeconds;
    target.container.visible = false;
    this.treeVersion += 1;
    this.save.stats.woodChopped += TIMBER.logYield;
    for (let index = 0; index < TIMBER.logYield; index += 1) {
      const angle = (index / TIMBER.logYield) * Math.PI * 2 + Math.random() * 0.4;
      this.createCargoDrop('wood', target.x + Math.cos(angle) * 34, target.y + Math.sin(angle) * 24);
    }
    this.audio.play('deposit', 0.9);
    this.camera.shake = this.save.settings.reducedMotion ? 0 : 5;
    this.onActualEvent('chop');
  }

  /** Standing at the timber post sells the carried logs one at a time. */
  private updateTimberPost(dt: number): void {
    this.sellTimer = Math.max(0, this.sellTimer - dt);
    this.lumberPickupTimer = Math.max(0, this.lumberPickupTimer - dt);
    if (this.save.station.lumber > 0 && this.lumberPickupTimer <= 0
      && distanceSquared(this.player.x, this.player.y, 1500, 1120) < 78 ** 2) {
      const collected = Math.min(5, this.save.station.lumber);
      this.save.station.lumber -= collected;
      this.player.wood += collected;
      this.lumberPickupTimer = .08;
      this.streamParticle(1500, 1120, this.player.x, this.player.y - 35, BRAND.colors.timber);
      this.audio.play('pickup', .55);
      if (this.save.station.lumber === 0) this.requestSave();
    }
    if (this.player.wood <= 0 || this.sellTimer > 0) return;
    if (distanceSquared(this.player.x, this.player.y, WORLD.timberPost.x, WORLD.timberPost.y) > 70 ** 2) return;
    this.sellTimer = TIMBER.sellCadence;
    const sold = this.player.wood > 100 ? 2 : 1;
    this.player.wood -= sold;
    this.save.stats.woodSold += sold;
    const value = TIMBER.logValue * sold;
    this.save.cash += value;
    this.save.stats.totalCashEarned += value;
    this.streamParticle(this.player.x, this.player.y - 40, WORLD.timberPost.x, WORLD.timberPost.y - 20, 0x72dd8d);
    this.spawnGainLabel(WORLD.timberPost.x, WORLD.timberPost.y, `+$${value}`, 0x8ef0a4, 70);
    this.audio.play('cash', 0.7);
    this.onActualEvent('cash');
    if (this.player.wood === 0) this.requestSave();
  }

  private makeRock(x: number, y: number, radius: number): void {
    const rock = new Graphics();
    this.place(rock, x, y, 15);
    rock.ellipse(0, 15, radius, radius * 0.5).fill({ color: BRAND.colors.ao, alpha: 0.18 });
    rock.moveTo(-radius, 10).lineTo(-radius * .55, -radius * .7).lineTo(radius * .2, -radius).lineTo(radius, -radius * .2).lineTo(radius * .72, radius * .35).lineTo(-radius * .65, radius * .38).closePath().fill(0x7899a9);
    rock.moveTo(radius * .2, -radius).lineTo(radius, -radius * .2).lineTo(radius * .72, radius * .35).lineTo(radius * .1, radius * .1).closePath().fill(shade(0x7899a9, -0.24));
    rock.moveTo(-radius, 10).lineTo(-radius * .55, -radius * .7).lineTo(radius * .2, -radius).lineTo(radius, -radius * .2).lineTo(radius * .72, radius * .35).lineTo(-radius * .65, radius * .38).closePath().stroke({ color: BRAND.colors.outline, width: 3.5 });
    snowCap(rock, [{ x: -radius * .55, y: -radius * .7 }, { x: radius * .2, y: -radius }, { x: radius, y: -radius * .2 }], Math.max(4, radius * 0.14));
    this.world.addChild(rock);
    this.blockers.push({ x: x - radius * .7, y: y - radius * .45, width: radius * 1.4, height: radius * .9 });
  }

  private buildSnowfall(): void {
    const count = this.save.settings.quality === 'low' ? 30 : 65;
    for (let index = 0; index < count; index += 1) {
      const flake = new Graphics().circle(0, 0, 1.5 + Math.random() * 3).fill({ color: 0xffffff, alpha: 0.35 + Math.random() * 0.45 });
      flake.x = Math.random() * this.app.screen.width;
      flake.y = Math.random() * this.app.screen.height;
      // Drift stored numerically; parsing it out of a label string each frame was costly.
      this.snowflakes.push({ graphic: flake, speed: 24 + Math.random() * 48, drift: 6 + Math.random() * 16 });
      this.snowfall.addChild(flake);
    }
  }

  private buildTutorialArrow(): void {
    const glow = new Graphics().circle(0, 0, 34).fill({ color: BRAND.colors.gold, alpha: .18 }).stroke({ color: BRAND.colors.gold, width: 5, alpha: .8 });
    const arrow = new Graphics().moveTo(0, -30).lineTo(25, 5).lineTo(10, 5).lineTo(10, 30).lineTo(-10, 30).lineTo(-10, 5).lineTo(-25, 5).closePath().fill(0xffd66f).stroke({ color: 0xffffff, width: 4 });
    this.tutorialArrow.addChild(glow, arrow);
    this.tutorialArrow.zIndex = 2000;
    this.world.addChild(this.tutorialArrow);
  }

  private fixedUpdate(dt: number): void {
    this.simulationTime += dt;
    this.save.stats.playSeconds += dt;
    this.insufficientToastTimer = Math.max(0, this.insufficientToastTimer - dt);
    this.raidFoodHitVisual = Math.max(0, this.raidFoodHitVisual - dt);
    this.targetLockTimer = Math.max(0, this.targetLockTimer - dt);
    this.player.spawnProtection = Math.max(0, this.player.spawnProtection - dt);
    this.updateCompoundGate(dt);

    if (this.hitStop > 0 && !this.save.settings.reducedMotion) {
      this.hitStop -= dt;
      this.updateParticles(dt * 0.2);
      return;
    }

    if (this.player.alive) {
      this.updatePlayer(dt);
      this.updateHealing(dt);
      this.updateCombat(dt);
      this.updateChopping(dt);
      this.updateTimberPost(dt);
      this.updateDeposits(dt);
      this.updateMealPickups(dt);
      this.updateUpgradePads(dt);
      this.updateFishing(dt);
    } else {
      this.updateChopping(dt);
      this.updateDefeat(dt);
    }
    this.updateEnemies(dt);
    this.updateDrops(dt);
    this.updateProduction(dt);
    this.updateCook(dt);
    this.updateCustomers(dt);
    this.updateCash(dt);
    this.updateRaid(dt);
    this.updateParticles(dt);
    this.updateTutorial();
    this.updateHud();

    if (this.simulationTime - this.lastSaveTime >= ECONOMY.autosaveSeconds) {
      this.lastSaveTime = this.simulationTime;
      this.requestSave();
    }
  }

  private updatePlayer(dt: number): void {
    const rawInput = this.input.update();
    const inputMagnitude = Math.hypot(rawInput.x, rawInput.y);
    // Screen-relative control: pushing right on the stick moves right across the screen,
    // which in projected space is a diagonal through world coordinates.
    const input = inputToWorld(rawInput.x, rawInput.y);
    const speed = moveSpeedFor(this.save.upgrades.moveSpeed);
    const acceleration = inputMagnitude > 0.02 ? 960 : 1180;
    const desiredX = input.x * speed;
    const desiredY = input.y * speed;
    this.player.vx = moveToward(this.player.vx, desiredX, acceleration * dt);
    this.player.vy = moveToward(this.player.vy, desiredY, acceleration * dt);
    if (inputMagnitude > 0.05) this.player.facing = Math.atan2(input.y, input.x);

    const proposedX = this.player.x + this.player.vx * dt;
    const proposedY = this.player.y + this.player.vy * dt;
    const resolved = this.resolvePlayerMovement(proposedX, proposedY);
    if (resolved.x !== proposedX) this.player.vx *= -0.08;
    if (resolved.y !== proposedY) this.player.vy *= -0.08;
    this.player.x = resolved.x;
    this.player.y = resolved.y;

    const movementSpeed = Math.hypot(this.player.vx, this.player.vy);
    if (movementSpeed > 35) {
      this.footstepTimer -= dt;
      if (this.footstepTimer <= 0) {
        this.footstepTimer = 0.22;
        this.audio.play('step', 0.45);
        this.spawnFootprint();
      }
    }
  }

  private resolvePlayerMovement(targetX: number, targetY: number): Vec2 {
    const radius = WORLD.playerRadius;
    let x = clamp(targetX, radius, WORLD.width - radius);
    let y = clamp(this.player.y, radius, WORLD.height - radius);
    for (const blocker of this.getActiveBlockers()) {
      if (circleRectCollision(x, y, radius, blocker)) { x = this.player.x; break; }
    }
    if (this.compoundGateBlocks(x, y, radius)) x = this.player.x;
    y = clamp(targetY, radius, WORLD.height - radius);
    for (const blocker of this.getActiveBlockers()) {
      if (circleRectCollision(x, y, radius, blocker)) { y = this.player.y; break; }
    }
    if (this.compoundGateBlocks(x, y, radius)) y = this.player.y;
    return { x, y };
  }

  /**
   * The outpost entrance opens for the Trailwarden and visiting guests. It closes
   * again only after everyone clears the approach, avoiding jitter at the threshold.
   */
  private updateCompoundGate(dt: number): void {
    const gate = this.station.compoundGate;
    const nearRadius = gate.heldOpen ? 340 : 270;
    const radiusSquared = nearRadius * nearRadius;
    const playerNear = this.player.alive && distanceSquared(this.player.x, this.player.y, WORLD.campGate.x, WORLD.campGate.y) < radiusSquared;
    const guestNear = this.customers.some(customer => distanceSquared(customer.x, customer.y, WORLD.campGate.x, WORLD.campGate.y) < radiusSquared);
    const crewNear = this.lumberjackVisuals.some(worker => worker.container.visible
      && distanceSquared(worker.x, worker.y, WORLD.campGate.x, WORLD.campGate.y) < radiusSquared)
      || this.defenders.some(post => post.mobile && post.alive
        && distanceSquared(post.x, post.y, WORLD.campGate.x, WORLD.campGate.y) < radiusSquared);
    const breached = this.raidState === 'active' && this.raidBreached;
    gate.heldOpen = playerNear || guestNear || crewNear || breached;
    gate.open = moveToward(gate.open, gate.heldOpen ? 1 : 0, dt * (gate.heldOpen ? 4.8 : 2.6));

    // Smooth the leaf travel and slide each half behind its neighbouring palisade.
    const eased = gate.open * gate.open * (3 - 2 * gate.open);
    gate.leftDoor.position.set(-gate.slide.x * eased, -gate.slide.y * eased + (breached ? 13 : 0));
    gate.rightDoor.position.set(gate.slide.x * eased, gate.slide.y * eased + (breached ? 20 : 0));
    gate.leftDoor.rotation = breached ? -.17 : 0;
    gate.rightDoor.rotation = breached ? .21 : 0;
  }

  /** The physical door holds the player briefly, until its leaves clear the opening. */
  private compoundGateBlocks(x: number, y: number, radius: number): boolean {
    if (this.station.compoundGate.open >= 0.72) return false;
    return circleRectCollision(x, y, radius, {
      x: WORLD.campGate.x - 20,
      y: WORLD.campGate.y - 116,
      width: 40,
      height: 232
    });
  }

  /**
   * Collision is queried several times per fixed step, per entity. This used to
   * allocate a fresh array on every call; it now rebuilds only when a gate opens.
   */
  private getActiveBlockers(): Rect[] {
    // Standing trees block; felled ones do not, so the key tracks tree state too.
    const key = `${this.save.unlocks.zone2}|${this.save.unlocks.dock}|${this.save.unlocks.glacier}|${this.save.unlocks.whiteout}|${this.treeVersion}|${this.save.upgrades.defense}|${this.save.upgrades.compound}`;
    if (key !== this.blockerCacheKey) {
      this.blockerCacheKey = key;
      this.blockerCache = [...this.blockers];
      this.blockerCache.push(...this.compoundBlockers);
      if (defenseTierFor(this.save.upgrades.defense).kind !== 'spear') {
        for (const post of this.defenders) if (!post.mobile) this.blockerCache.push({ x: post.x - 30, y: post.y - 25, width: 60, height: 50 });
      }
      for (const tree of this.trees) if (tree.alive) this.blockerCache.push(tree.blocker);
      if (!this.save.unlocks.zone2) this.blockerCache.push({ x: WORLD.zoneGate.x - 30, y: WORLD.zoneGate.y - 150, width: 60, height: 300 });
      if (!this.save.unlocks.glacier) this.blockerCache.push({ x: WORLD.glacierGate.x - 30, y: WORLD.glacierGate.y - 150, width: 60, height: 300 });
      if (!this.save.unlocks.whiteout) this.blockerCache.push({ x: WORLD.whiteoutGate.x - 30, y: WORLD.whiteoutGate.y - 150, width: 60, height: 300 });
      if (!this.save.unlocks.dock) this.blockerCache.push({ x: 860, y: WORLD.camp.y + WORLD.camp.height - 50, width: 300, height: 80 });
    }
    return this.blockerCache;
  }

  /** Uses the actual isometric projection, with a peripheral margin around the view. */
  private isWorldPointOffCamera(x: number, y: number, margin = 170): boolean {
    const screenX = (isoX(x, y) - this.camera.x) * this.viewScale + this.app.screen.width / 2;
    const screenY = (isoY(x, y) - this.camera.y) * this.viewScale + this.app.screen.height / 2;
    return screenX < -margin || screenX > this.app.screen.width + margin
      || screenY < -margin || screenY > this.app.screen.height + margin;
  }

  private isInsideCompound(x: number, y: number, margin = 0): boolean {
    const core = x >= WORLD.camp.x - margin && x <= WORLD.camp.x + WORLD.camp.width + margin
      && y >= WORLD.camp.y - margin && y <= WORLD.camp.y + WORLD.camp.height + margin;
    const shoreline = this.save.upgrades.compound >= 2 && x >= 180 - margin && x <= 1780 + margin && y >= 1430 - margin && y <= 2200 + margin;
    const eastern = this.save.upgrades.compound >= 3 && x >= 1730 - margin && x <= 2540 + margin && y >= 300 - margin && y <= 1450 + margin;
    return core || shoreline || eastern;
  }

  /** The furthest east a respawn may use without appearing behind a locked pass. */
  private accessibleEastBoundary(): number {
    if (!this.save.unlocks.zone2) return WORLD.zoneGate.x - TREE_EDGE_INSET;
    if (!this.save.unlocks.glacier) return WORLD.glacierGate.x - TREE_EDGE_INSET;
    if (!this.save.unlocks.whiteout) return WORLD.whiteoutGate.x - TREE_EDGE_INSET;
    return WORLD.width - TREE_EDGE_INSET;
  }

  /** Selects varied off-camera visitor trails while keeping every route east of the wall. */
  private visitorTrailPoint(): Vec2 {
    const points: Vec2[] = [
      { x: 2300, y: 870 }, { x: 2380, y: 420 }, { x: 2240, y: 1390 },
      { x: 2760, y: 650 }, { x: 2680, y: 1210 }, { x: 2080, y: 1760 }
    ];
    const offset = this.nextCustomerId % points.length;
    for (let index = 0; index < points.length; index += 1) {
      const point = points[(index + offset) % points.length]!;
      if (this.isWorldPointOffCamera(point.x, point.y, 120)) return { ...point };
    }
    return { ...points.reduce((best, point) =>
      distanceSquared(point.x, point.y, this.player.x, this.player.y) > distanceSquared(best.x, best.y, this.player.x, this.player.y) ? point : best) };
  }

  /** Raid groups assemble in the frostwild, never in the gate yard or camera view. */
  private raidTrailPoint(index: number): Vec2 {
    const eastBoundary = this.accessibleEastBoundary();
    const points: Vec2[] = [
      { x: 3060, y: 460 }, { x: 3100, y: 820 }, { x: 3150, y: 1110 },
      { x: 3220, y: 1530 }, { x: 2900, y: 1810 }, { x: 2120, y: 160 },
      { x: 1900, y: 1840 }
    ];
    for (let attempt = 0; attempt < 48; attempt += 1) {
      points.push({
        // Keep surges near enough to reach the compound during the warning's
        // aftermath, while still assembling well outside the current camera.
        x: WILD_EAST_EDGE + Math.random() * Math.max(1, Math.min(eastBoundary, 3340) - WILD_EAST_EDGE),
        y: TREE_EDGE_INSET + Math.random() * (2050 - TREE_EDGE_INSET)
      });
    }
    const offset = index % points.length;
    for (let step = 0; step < points.length; step += 1) {
      const point = points[(offset + step) % points.length]!;
      if (point.x > eastBoundary) continue;
      const blocked = this.blockers.some(blocker => circleRectCollision(point.x, point.y, 52, blocker))
        || this.trees.some(tree => tree.alive && distanceSquared(point.x, point.y, tree.x, tree.y) < 115 ** 2)
        || this.enemies.some(enemy => enemy.alive && distanceSquared(point.x, point.y, enemy.x, enemy.y) < 130 ** 2);
      const hasApproach = distanceSquared(point.x, point.y, WORLD.campGate.x, WORLD.campGate.y) > 700 ** 2;
      if (!blocked && hasApproach && this.isWorldPointOffCamera(point.x, point.y, 190)) return { ...point };
    }
    return { x: Math.min(eastBoundary, 3260), y: 320 + index * 190 };
  }

  /** Finds a reachable, off-camera snow patch for a felled tree to regrow on. */
  private findTreeRegrowthSpot(tree: TreeEntity): Vec2 | null {
    const eastBoundary = this.accessibleEastBoundary();
    for (let attempt = 0; attempt < 72; attempt += 1) {
      const candidate = {
        x: TREE_EDGE_INSET + Math.random() * Math.max(1, eastBoundary - TREE_EDGE_INSET),
        y: TREE_EDGE_INSET + Math.random() * (WORLD.height - TREE_EDGE_INSET * 2)
      };
      if (!this.isWorldPointOffCamera(candidate.x, candidate.y)) continue;
      if (this.isInsideCompound(candidate.x, candidate.y, 90)) continue;
      if (this.blockers.some(blocker => circleRectCollision(candidate.x, candidate.y, 48, blocker))) continue;
      if (this.trees.some(other => other !== tree && other.alive && distanceSquared(candidate.x, candidate.y, other.x, other.y) < 115 ** 2)) continue;
      return candidate;
    }
    return null;
  }

  /** Normal wildlife only returns to open frostwild beyond both the palisade and view. */
  private findWildlifeRespawnSpot(enemy: EnemyEntity): Vec2 | null {
    const eastBoundary = this.accessibleEastBoundary();
    const candidates: Vec2[] = enemy.spawn.x <= eastBoundary ? [{ ...enemy.spawn }] : [];
    for (let attempt = 0; attempt < 72; attempt += 1) {
      candidates.push({
        x: WILD_EAST_EDGE + Math.random() * Math.max(1, eastBoundary - WILD_EAST_EDGE),
        y: TREE_EDGE_INSET + Math.random() * (WORLD.height - TREE_EDGE_INSET * 2)
      });
    }
    for (const candidate of candidates) {
      if (!this.isWorldPointOffCamera(candidate.x, candidate.y)) continue;
      if (this.isInsideCompound(candidate.x, candidate.y, 100)) continue;
      if (this.blockers.some(blocker => circleRectCollision(candidate.x, candidate.y, 52, blocker))) continue;
      if (this.trees.some(tree => tree.alive && distanceSquared(candidate.x, candidate.y, tree.x, tree.y) < 115 ** 2)) continue;
      if (this.enemies.some(other => other !== enemy && other.alive && distanceSquared(candidate.x, candidate.y, other.x, other.y) < 130 ** 2)) continue;
      return candidate;
    }
    return null;
  }

  /** True while the Trailwarden is standing on the serving pad behind the counter. */
  private isPlayerServing(): boolean {
    if (!this.player.alive) return false;
    return distanceSquared(this.player.x, this.player.y, WORLD.servePad.x, WORLD.servePad.y) < 70 ** 2;
  }

  private isPlayerSafe(): boolean {
    const radius = warmRadiusFor(this.save.upgrades.furnace);
    return distanceSquared(this.player.x, this.player.y, WORLD.furnace.x, WORLD.furnace.y) <= radius * radius;
  }

  private updateHealing(dt: number): void {
    const maximum = maxHealthFor(this.save.upgrades.maxHealth);
    this.healing = this.player.alive && this.isPlayerSafe() && this.player.health < maximum;
    if (!this.healing) { this.healingLabelTimer = 0; this.healedSinceLabel = 0; return; }
    const recovered = Math.min(maximum - this.player.health, healingPerSecondFor(this.save.upgrades.infirmary) * dt);
    this.player.health += recovered;
    this.healedSinceLabel += recovered;
    this.healingLabelTimer += dt;
    if (this.healingLabelTimer >= 1 || this.player.health >= maximum) {
      this.spawnGainLabel(this.player.x, this.player.y, `+${Math.round(this.healedSinceLabel)} HP`, BRAND.colors.safe, 105);
      this.healingLabelTimer = 0;
      this.healedSinceLabel = 0;
    }
  }

  private updateCombat(dt: number): void {
    this.player.attackCooldown = Math.max(0, this.player.attackCooldown - dt);
    const weaponTier = this.save.upgrades.weaponTier;
    const magazine = weaponMagazineFor(weaponTier);
    let weaponUnavailable = false;
    if (magazine > 0) {
      if (this.player.reloadTimer > 0) {
        this.player.reloadTimer = Math.max(0, this.player.reloadTimer - dt);
        if (this.player.reloadTimer === 0) this.player.ammo = magazine;
      }
      if (this.player.ammo <= 0 && this.player.reloadTimer <= 0) {
        this.player.reloadTimer = weaponReloadSecondsFor(weaponTier);
      }
      weaponUnavailable = this.player.reloadTimer > 0;
    } else {
      this.player.ammo = 0;
      this.player.reloadTimer = 0;
    }
    this.player.attackVisual = Math.max(0, this.player.attackVisual - dt);
    this.player.hurtVisual = Math.max(0, this.player.hurtVisual - dt);
    if (this.player.pendingTarget) {
      this.player.pendingHitTimer -= dt;
      if (this.player.pendingHitTimer <= 0) {
        const target = this.player.pendingTarget;
        this.player.pendingTarget = null;
        if (target.alive && target.state !== 'defeat' && target.state !== 'respawn') {
          const range = attackRangeFor(this.save.upgrades.weaponTier);
          if (distanceSquared(this.player.x, this.player.y, target.x, target.y) <= (range + 28) ** 2) this.damageEnemy(target);
        }
      }
    }
    if (weaponUnavailable) {
      this.setSelectedTarget(null);
      return;
    }

    if (this.isPlayerSafe()) {
      this.setSelectedTarget(null);
      return;
    }
    const target = this.chooseTarget();
    this.setSelectedTarget(target);
    if (!target) return;
    this.player.facing = Math.atan2(target.y - this.player.y, target.x - this.player.x);
    if (this.player.attackCooldown > 0 || this.player.pendingTarget) return;
    this.player.attackCooldown = attackCadenceFor(this.save.upgrades.attackSpeed, this.save.upgrades.weaponTier);
    this.player.attackVisual = 0.26;
    this.player.pendingHitTimer = this.save.upgrades.weaponTier >= WEAPON_RANGED_TIER ? 0.06 : 0.13;
    this.player.pendingTarget = target;
    if (magazine > 0) {
      this.player.ammo -= 1;
      if (this.player.ammo <= 0) this.player.reloadTimer = weaponReloadSecondsFor(weaponTier);
    }
    if (target.state === 'idle' || target.state === 'wander') {
      target.state = 'alert';
      target.stateTimer = 0.38;
      target.alert.visible = true;
    }
    this.audio.play('swing');
    // The bolt gun and every later Armory tier fire a visible projectile.
    if (this.save.upgrades.weaponTier >= WEAPON_RANGED_TIER) this.spawnProjectileTrail(target);
  }

  private chooseTarget(): EnemyEntity | null {
    const range = attackRangeFor(this.save.upgrades.weaponTier);
    if (this.selectedTarget?.alive && this.selectedTarget.state !== 'defeat' && this.targetLockTimer > 0) {
      if (distanceSquared(this.player.x, this.player.y, this.selectedTarget.x, this.selectedTarget.y) <= (range * 1.22) ** 2) return this.selectedTarget;
    }
    let best: EnemyEntity | null = null;
    let bestDistance = range * range;
    for (const enemy of this.enemies) {
      if (!enemy.alive || enemy.state === 'defeat' || enemy.state === 'respawn') continue;
      const distance = distanceSquared(this.player.x, this.player.y, enemy.x, enemy.y);
      if (distance < bestDistance) { bestDistance = distance; best = enemy; }
    }
    if (best !== this.selectedTarget) this.targetLockTimer = 0.45;
    return best;
  }

  private setSelectedTarget(target: EnemyEntity | null): void {
    if (this.selectedTarget && this.selectedTarget !== target) this.selectedTarget.targetRing.visible = false;
    this.selectedTarget = target;
    if (target) target.targetRing.visible = true;
  }

  private damageEnemy(enemy: EnemyEntity, overrideDamage?: number, defenseHit = false): void {
    const damage = overrideDamage ?? weaponDamageFor(this.save.upgrades.weaponDamage, this.save.upgrades.weaponTier);
    enemy.health = Math.max(0, enemy.health - damage);
    enemy.state = enemy.health <= 0 ? 'defeat' : 'hurt';
    enemy.stateTimer = enemy.health <= 0 ? 0.9 : 0.16;
    enemy.attackCooldown = Math.max(enemy.attackCooldown, 0.18);
    this.spawnDamageLabel(enemy.x, enemy.y, damage, enemy.health <= 0 ? 0xffdf78 : 0xffffff, 78);
    this.spawnBurst(enemy.x, enemy.y - 20, enemy.config.accent, enemy.health <= 0 ? 11 : 6);
    this.audio.play('impact', enemy.health <= 0 ? 1.25 : 1);
    if (!defenseHit) {
      this.audio.haptic(enemy.health <= 0 ? [18, 30, 28] : 12);
      this.camera.shake = this.save.settings.reducedMotion ? 0 : enemy.health <= 0 ? 11 : 6;
      this.hitStop = this.save.settings.reducedMotion ? 0 : enemy.health <= 0 ? 0.055 : 0.028;
    }
    if (enemy.health <= 0) this.defeatEnemy(enemy);
  }

  private defeatEnemy(enemy: EnemyEntity): void {
    if (enemy.dropped) return;
    enemy.dropped = true;
    enemy.targetRing.visible = false;
    enemy.alert.visible = false;
    this.save.stats.bearsDefeated += 1;
    for (let index = 0; index < enemy.config.meatYield; index += 1) {
      const angle = (index / enemy.config.meatYield) * Math.PI * 2 + Math.random() * 0.4;
      this.createCargoDrop('meat', enemy.x + Math.cos(angle) * 35, enemy.y + Math.sin(angle) * 25, 1, enemy.isRaid ? 300 : 45);
    }
    this.createCashDrop(enemy.isRaid ? raidKillCashForWave(this.raidWave) : enemy.cashReward, enemy);
    this.requestSave();
  }

  private updateEnemies(dt: number): void {
    for (const enemy of this.enemies) {
      if (!enemy.alive && enemy.state !== 'respawn') continue;
      enemy.attackCooldown = Math.max(0, enemy.attackCooldown - dt);
      enemy.stateTimer -= dt;
      const distanceToPlayer = Math.sqrt(distanceSquared(enemy.x, enemy.y, this.player.x, this.player.y));
      const playerSafe = this.isPlayerSafe();

      if (enemy.state === 'defeat') {
        enemy.vx *= 0.85;
        enemy.vy *= 0.85;
        if (enemy.stateTimer <= 0) {
          if (enemy.isRaid) {
            enemy.alive = false;
            enemy.container.visible = false;
          } else {
            enemy.state = 'respawn';
            enemy.stateTimer = enemy.config.respawn;
            enemy.container.visible = false;
            enemy.alive = false;
          }
        }
        continue;
      }

      if (enemy.state === 'respawn') {
        if (enemy.stateTimer <= 0) this.respawnEnemy(enemy);
        continue;
      }

      if (!enemy.isRaid && (playerSafe || distanceToPlayer > enemy.config.leashRange)) {
        enemy.alert.visible = false;
        const homeDistance = Math.sqrt(distanceSquared(enemy.x, enemy.y, enemy.spawn.x, enemy.spawn.y));
        if (homeDistance > 30) this.steerEnemy(enemy, enemy.spawn.x, enemy.spawn.y, enemy.config.speed * .7, dt);
        else if (enemy.state !== 'idle' && enemy.state !== 'wander') { enemy.state = 'idle'; enemy.stateTimer = 1; }
        this.moveEnemy(enemy, dt);
        continue;
      }

      switch (enemy.state) {
        case 'idle':
          enemy.vx *= 0.9; enemy.vy *= 0.9;
          if (distanceToPlayer < enemy.config.aggroRange && !playerSafe && this.player.alive) {
            enemy.state = 'alert'; enemy.stateTimer = .42; enemy.alert.visible = true; this.audio.play('warning', .7);
          } else if (enemy.stateTimer <= 0) {
            enemy.state = 'wander'; enemy.stateTimer = 1.5 + Math.random() * 2.3; enemy.wanderAngle = Math.random() * Math.PI * 2;
          }
          break;
        case 'wander':
          enemy.vx = Math.cos(enemy.wanderAngle) * enemy.config.speed * .3;
          enemy.vy = Math.sin(enemy.wanderAngle) * enemy.config.speed * .3;
          if (distanceToPlayer < enemy.config.aggroRange && !playerSafe && this.player.alive) {
            enemy.state = 'alert'; enemy.stateTimer = .42; enemy.alert.visible = true; this.audio.play('warning', .7);
          } else if (enemy.stateTimer <= 0) { enemy.state = 'idle'; enemy.stateTimer = .7 + Math.random() * 1.5; }
          break;
        case 'alert':
          enemy.vx *= .82; enemy.vy *= .82;
          if (enemy.stateTimer <= 0) { enemy.state = enemy.isRaid ? 'raid' : 'chase'; enemy.alert.visible = false; }
          break;
        case 'hurt':
          enemy.vx *= .78; enemy.vy *= .78;
          if (enemy.stateTimer <= 0) enemy.state = enemy.isRaid ? 'raid' : 'chase';
          break;
        case 'chase':
          this.steerEnemy(enemy, this.player.x, this.player.y, enemy.config.speed, dt);
          if (distanceToPlayer <= enemy.config.attackRange && enemy.attackCooldown <= 0) {
            enemy.state = 'windup'; enemy.stateTimer = enemy.config.windup; enemy.vx = 0; enemy.vy = 0; this.audio.play('warning', .6);
          }
          break;
        case 'raid': {
          if (this.raidBreached) {
            enemy.defenderTarget = null;
            const foodDistance = Math.sqrt(distanceSquared(enemy.x, enemy.y, WORLD.butcherOutput.x, WORLD.butcherOutput.y));
            // Once the doors buckle, the pack ignores distractions and pours through
            // the opening toward the Cookout's finished-food profit stock.
            this.steerEnemy(enemy, WORLD.butcherOutput.x, WORLD.butcherOutput.y, enemy.config.speed * 1.12, dt);
            if (foodDistance <= enemy.config.attackRange && enemy.attackCooldown <= 0) {
              enemy.state = 'windup'; enemy.stateTimer = enemy.config.windup; enemy.vx = 0; enemy.vy = 0; this.audio.play('warning', .7);
            }
            break;
          }
          if (!enemy.raidApproachedGate) {
            const approachDistance = Math.sqrt(distanceSquared(enemy.x, enemy.y, ENTRY_OUTSIDE.x, ENTRY_OUTSIDE.y));
            this.steerEnemy(enemy, ENTRY_OUTSIDE.x, ENTRY_OUTSIDE.y, enemy.config.speed * 1.18, dt);
            if (approachDistance < 70) enemy.raidApproachedGate = true;
            break;
          }
          const nearbyDefender = this.defenders.filter(post => post.mobile && post.alive)
            .sort((a, b) => distanceSquared(enemy.x, enemy.y, a.x, a.y) - distanceSquared(enemy.x, enemy.y, b.x, b.y))[0];
          const targetDefender = nearbyDefender && distanceSquared(enemy.x, enemy.y, nearbyDefender.x, nearbyDefender.y) < 210 ** 2
            ? nearbyDefender : null;
          enemy.defenderTarget = targetDefender;
          const targetPlayer = !targetDefender && this.player.alive && !playerSafe && distanceToPlayer < 170;
          const targetX = targetDefender ? targetDefender.x : targetPlayer ? this.player.x : WORLD.campGate.x + 22;
          const targetY = targetDefender ? targetDefender.y : targetPlayer ? this.player.y : WORLD.campGate.y;
          const distance = Math.sqrt(distanceSquared(enemy.x, enemy.y, targetX, targetY));
          this.steerEnemy(enemy, targetX, targetY, enemy.config.speed, dt);
          if (distance <= enemy.config.attackRange && enemy.attackCooldown <= 0) {
            enemy.state = 'windup'; enemy.stateTimer = enemy.config.windup; enemy.vx = 0; enemy.vy = 0; this.audio.play('warning', .55);
          }
          break;
        }
        case 'windup':
          enemy.vx = 0; enemy.vy = 0;
          if (enemy.stateTimer <= 0) {
            enemy.state = 'attack'; enemy.stateTimer = .18; enemy.attackCooldown = enemy.config.attackCooldown;
            this.executeEnemyAttack(enemy);
          }
          break;
        case 'attack':
          if (enemy.stateTimer <= 0) enemy.state = enemy.isRaid ? 'raid' : 'chase';
          break;
        default: break;
      }
      // Raiders follow a deliberate approach lane to the gate. Ignoring incidental
      // tree/rock blockers here prevents an entire surge from snagging off-camera.
      this.moveEnemy(enemy, dt, enemy.isRaid && enemy.state === 'raid');
    }
  }

  private steerEnemy(enemy: EnemyEntity, targetX: number, targetY: number, speed: number, dt: number): void {
    const direction = normalize(targetX - enemy.x, targetY - enemy.y);
    enemy.vx = moveToward(enemy.vx, direction.x * speed, 460 * dt);
    enemy.vy = moveToward(enemy.vy, direction.y * speed, 460 * dt);
    if (direction.magnitude > 1) enemy.facing = Math.atan2(direction.y, direction.x);
    for (const other of this.enemies) {
      if (other === enemy || !other.alive) continue;
      const dx = enemy.x - other.x;
      const dy = enemy.y - other.y;
      const d2 = dx * dx + dy * dy;
      if (d2 > 1 && d2 < 70 * 70) {
        const strength = (70 - Math.sqrt(d2)) * 2.2;
        const n = normalize(dx, dy);
        enemy.vx += n.x * strength;
        enemy.vy += n.y * strength;
      }
    }
  }

  private moveEnemy(enemy: EnemyEntity, dt: number, ignoreBlockers = false): void {
    let nextX = clamp(enemy.x + enemy.vx * dt, 45, WORLD.width - 45);
    let nextY = clamp(enemy.y + enemy.vy * dt, 45, WORLD.height - 45);
    const radius = 34 * enemy.config.scale;
    if (!ignoreBlockers) {
      for (const blocker of this.getActiveBlockers()) {
        if (circleRectCollision(nextX, enemy.y, radius, blocker)) { nextX = enemy.x; enemy.vx *= -.25; enemy.wanderAngle += Math.PI * .65; }
        if (circleRectCollision(nextX, nextY, radius, blocker)) { nextY = enemy.y; enemy.vy *= -.25; enemy.wanderAngle -= Math.PI * .45; }
      }
    }
    enemy.x = nextX; enemy.y = nextY;
  }

  private executeEnemyAttack(enemy: EnemyEntity): void {
    const defender = enemy.defenderTarget;
    if (enemy.isRaid && defender?.alive
      && distanceSquared(enemy.x, enemy.y, defender.x, defender.y) <= (enemy.config.attackRange + 35) ** 2) {
      defender.health = Math.max(0, defender.health - enemy.config.damage);
      this.spawnDamageLabel(defender.x, defender.y, enemy.config.damage, 0xff8f78, 88);
      this.spawnBurst(defender.x, defender.y - 20, BRAND.colors.danger, 7);
      if (defender.health <= 0) {
        defender.alive = false;
        defender.container.visible = false;
        enemy.defenderTarget = null;
        this.callbacks.toast('A roaming warden has fallen · They return next wave');
      }
      this.audio.play('impact', .62);
      return;
    }
    enemy.defenderTarget = null;
    const playerDistance = distanceSquared(enemy.x, enemy.y, this.player.x, this.player.y);
    if (this.player.alive && !this.isPlayerSafe() && playerDistance <= (enemy.config.attackRange + 35) ** 2) {
      this.player.health = applyDamage(this.player.health, enemy.config.damage, this.player.spawnProtection > 0);
      if (this.player.spawnProtection <= 0) {
        const knockback = normalize(this.player.x - enemy.x, this.player.y - enemy.y);
        this.player.vx += knockback.x * 245;
        this.player.vy += knockback.y * 245;
        this.player.hurtVisual = .28;
        this.spawnDamageLabel(this.player.x, this.player.y, enemy.config.damage, 0xff7373, 82);
        this.spawnBurst(this.player.x, this.player.y - 20, 0xff785d, 8);
        this.audio.play('swipe');
        this.audio.haptic([25, 18, 22]);
        this.camera.shake = this.save.settings.reducedMotion ? 0 : 10;
        if (this.player.health <= 0) this.defeatPlayer();
      }
      return;
    }
    if (enemy.isRaid && !this.raidBreached && distanceSquared(enemy.x, enemy.y, WORLD.campGate.x, WORLD.campGate.y) <= (enemy.config.attackRange + 45) ** 2) {
      this.gateHealth = Math.max(0, this.gateHealth - enemy.config.damage);
      this.spawnDamageLabel(WORLD.campGate.x, WORLD.campGate.y, enemy.config.damage, 0xff8a75, 118);
      this.audio.play('impact', .7);
      return;
    }
    if (enemy.isRaid && this.raidBreached && distanceSquared(enemy.x, enemy.y, WORLD.butcherOutput.x, WORLD.butcherOutput.y) <= (enemy.config.attackRange + 35) ** 2) {
      const result = applyRaidProfitDamage(this.save.cash, this.save.stats.raidsWon);
      this.save.cash = result.cash;
      if (result.lost > 0) {
        this.raidCashLost += result.lost;
        this.raidFoodHitVisual = .34;
        this.spawnGainLabel(WORLD.butcherOutput.x, WORLD.butcherOutput.y - 12, `-$${result.lost} PROFIT`, 0xff7770, 96);
        this.spawnBurst(WORLD.butcherOutput.x, WORLD.butcherOutput.y - 18, BRAND.colors.danger, 9);
        this.audio.play('defeat', .3);
        this.audio.haptic([18, 20, 24]);
        this.camera.shake = this.save.settings.reducedMotion ? 0 : 8;
        this.requestSave();
      } else if (!this.raidBankEmptyShown) {
        this.raidBankEmptyShown = true;
        this.spawnGainLabel(WORLD.butcherOutput.x, WORLD.butcherOutput.y, 'BANK EMPTY', 0xff928a, 100);
        this.callbacks.toast('The pantry is overrun · No banked cash remains');
      }
    }
  }

  /**
   * Beasts never pop back in while the player is watching. The herd returns somewhere
   * out beyond the current view, so hunting means going and looking for them.
   */
  private respawnEnemy(enemy: EnemyEntity): void {
    const spot = this.findWildlifeRespawnSpot(enemy);
    if (!spot) {
      enemy.stateTimer = 1.5;
      return;
    }
    enemy.alive = true;
    enemy.container.visible = true;
    enemy.x = spot.x;
    enemy.y = spot.y;
    enemy.spawn = { ...spot };
    enemy.health = enemy.config.health;
    enemy.state = 'idle';
    enemy.stateTimer = 1.2;
    enemy.attackCooldown = 0;
    enemy.dropped = false;
    enemy.container.alpha = 0;
    this.spawnBurst(enemy.x, enemy.y, 0xd9fbff, 9);
  }

  private createCargoDrop(kind: CargoKind, x: number, y: number, amount = 1, lifetime = 45): void {
    const container = new Container();
    this.place(container, x, y, 25);
    const shadow = contactShadow(20, 8, 0.2);
    shadow.position.set(0, 13);
    const bundle = new Graphics();
    if (kind === 'wood') {
      // a short cut log, end-on
      bundle.roundRect(-20, -9, 40, 18, 6).fill(BRAND.colors.timber);
      bundle.roundRect(-20, -9, 40, 18, 6).stroke({ color: BRAND.colors.outline, width: 3 });
      bundle.ellipse(16, 0, 6, 9).fill(0xd9ab74).stroke({ color: BRAND.colors.outline, width: 2 });
      bundle.ellipse(16, 0, 2.5, 4).fill(shade(0xd9ab74, -0.25));
    } else if (kind === 'meat') {
      bundle.roundRect(-17, -13, 34, 26, 9).fill(BRAND.colors.meat);
      bundle.moveTo(9, -13).lineTo(17, -8).lineTo(17, 9).lineTo(9, 13).closePath().fill(shade(BRAND.colors.meat, -0.3));
      bundle.roundRect(-17, -13, 34, 26, 9).stroke({ color: 0x873b39, width: 4 });
      bundle.moveTo(-12, -2).lineTo(12, -2).stroke({ color: 0xffb388, width: 4 });
    } else {
      bundle.ellipse(0, -1, 25, 12).fill(BRAND.colors.fish).stroke({ color: 0x226d7b, width: 4 });
      bundle.moveTo(-20, -2).lineTo(-33, -14).lineTo(-33, 10).closePath().fill(0x5be4d9);
      bundle.circle(14, -3, 2.5).fill(0x143e52);
      bundle.moveTo(-8, -8).lineTo(6, -8).stroke({ color: 0xd7fffc, width: 2, alpha: 0.7 });
    }
    container.addChild(shadow, bundle);
    this.world.addChild(container);
    this.cargoDrops.push({ kind, amount, x, y, vx: 0, vy: 0, life: lifetime, container });
  }

  private updateDrops(dt: number): void {
    const capacity = CARGO_CAPACITY;
    const magnetRadius = magnetRadiusFor(this.save.upgrades.magnet);
    for (let index = this.cargoDrops.length - 1; index >= 0; index -= 1) {
      const drop = this.cargoDrops[index]!;
      drop.life -= dt;
      const carried = this.player.meat + this.player.fish + this.player.wood;
      const distance = Math.sqrt(distanceSquared(drop.x, drop.y, this.player.x, this.player.y));
      if (this.player.alive && carried < capacity && distance < magnetRadius) {
        const direction = normalize(this.player.x - drop.x, this.player.y - drop.y);
        const acceleration = 480 + (magnetRadius - distance) * 3.2;
        drop.vx += direction.x * acceleration * dt;
        drop.vy += direction.y * acceleration * dt;
        drop.vx *= .93; drop.vy *= .93;
        drop.x += drop.vx * dt; drop.y += drop.vy * dt;
        if (distance < 30) {
          const result = addCargo(carried, drop.amount, capacity);
          if (result.accepted > 0) {
            if (drop.kind === 'meat') this.player.meat += result.accepted;
            else if (drop.kind === 'wood') this.player.wood += result.accepted;
            else this.player.fish += result.accepted;
            drop.amount = result.remainder;
            this.audio.play('pickup');
            this.audio.haptic(8);
            const tint = drop.kind === 'meat' ? BRAND.colors.meat : drop.kind === 'wood' ? BRAND.colors.timber : BRAND.colors.fish;
            this.spawnBurst(drop.x, drop.y, tint, 4);
            if (drop.amount <= 0) { this.removeCargoDrop(index); continue; }
          }
        }
      }
      this.place(drop.container, drop.x, drop.y, 25);
      drop.container.y += Math.sin(this.simulationTime * 4 + index) * 3;
      if (drop.life <= 0) this.removeCargoDrop(index);
    }
  }

  private removeCargoDrop(index: number): void {
    const [drop] = this.cargoDrops.splice(index, 1);
    drop?.container.destroy({ children: true });
  }

  /**
   * The whole haul goes in — the cookout pad accepts everything the Trailwarden is
   * carrying, one piece at a time so the stream of provisions stays readable.
   */
  private updateDeposits(dt: number): void {
    this.depositTimer -= dt;
    const nearMeat = distanceSquared(this.player.x, this.player.y, WORLD.butcherInput.x, WORLD.butcherInput.y) < 72 ** 2;
    const nearFish = this.save.unlocks.dock && distanceSquared(this.player.x, this.player.y, WORLD.fishStation.x - 118, WORLD.fishStation.y + 10) < 70 ** 2;
    if (this.depositTimer > 0) return;
    if (nearMeat && this.player.meat > 0) {
      this.depositTimer = .06;
      const deposited = this.player.meat > 100 ? 2 : 1;
      this.player.meat -= deposited;
      this.save.station.rawMeat += deposited;
      this.streamParticle(this.player.x, this.player.y - 20, WORLD.butcherInput.x, WORLD.butcherInput.y - 15, BRAND.colors.meat);
      this.audio.play('deposit', .6);
      this.onActualEvent('deliver');
    } else if (nearFish && this.player.fish > 0) {
      this.depositTimer = .06;
      this.player.fish -= 1;
      this.save.station.rawFish += 1;
      this.streamParticle(this.player.x, this.player.y - 20, WORLD.fishStation.x - 118, WORLD.fishStation.y, BRAND.colors.fish);
      this.audio.play('deposit', .6);
    }
  }

  private updateProduction(dt: number): void {
    const readyCapacity = counterCapacityFor(this.save.upgrades.counterCapacity);
    const butcherSeconds = butcherSecondsFor(this.save.upgrades.butcherSpeed, this.save.upgrades.worker);
    if (this.save.station.rawMeat > 0 && this.save.station.meals < readyCapacity) {
      this.save.station.butcherProgress += dt / butcherSeconds;
      if (this.save.station.butcherProgress >= 1) {
        this.save.station.butcherProgress -= 1;
        const result = convertStation(this.save.station.rawMeat, this.save.station.meals, readyCapacity);
        this.save.station.rawMeat = result.raw;
        this.save.station.meals = result.ready;
        if (result.converted) {
          this.customerBearDemand += 1;
          this.customerSpawnTimer = Math.min(this.customerSpawnTimer, .08);
          this.audio.play('cook', .55);
          this.spawnBurst(WORLD.butcher.x, WORLD.butcher.y - 45, BRAND.colors.ember, 5);
        }
      }
    } else this.save.station.butcherProgress = Math.min(this.save.station.butcherProgress, .98);

    if (this.save.unlocks.dock && this.save.station.rawFish > 0 && this.save.station.fishMeals < readyCapacity) {
      const fishSeconds = Math.max(.75, ECONOMY.fishProcessSeconds * Math.pow(.88, this.save.upgrades.butcherSpeed)
        / (1 + this.save.upgrades.fishery * .2));
      this.save.station.fishProgress += dt / fishSeconds;
      if (this.save.station.fishProgress >= 1) {
        this.save.station.fishProgress -= 1;
        const result = convertStation(this.save.station.rawFish, this.save.station.fishMeals, readyCapacity);
        this.save.station.rawFish = result.raw;
        this.save.station.fishMeals = result.ready;
        if (result.converted) {
          this.customerFishDemand += 1;
          this.customerSpawnTimer = Math.min(this.customerSpawnTimer, .08);
          this.audio.play('cook', .65);
          this.spawnBurst(WORLD.fishStation.x, WORLD.fishStation.y - 35, BRAND.colors.fish, 6);
        }
      }
    } else this.save.station.fishProgress = Math.min(this.save.station.fishProgress, .98);

    const fisherLevel = this.save.upgrades.fisher;
    if (this.save.unlocks.dock && fisherLevel > 0) {
      const interval = Math.max(2.4, 7.2 - fisherLevel * 1.3);
      this.save.station.fisherProgress += dt / interval;
      if (this.save.station.fisherProgress >= 1) {
        this.save.station.fisherProgress -= 1;
        this.save.station.rawFish += fisherLevel;
        this.spawnBurst(WORLD.fishDock.x, WORLD.fishDock.y - 20, BRAND.colors.fish, 5 + fisherLevel);
        this.audio.play('fish', .42);
      }
    } else this.save.station.fisherProgress = 0;

    const rigLevel = this.save.upgrades.oreRig;
    if (this.save.unlocks.glacier && rigLevel > 0) {
      const interval = Math.max(2.8, 10 - rigLevel * .85 - this.save.upgrades.robots * .7);
      this.save.station.oreProgress += dt / interval;
      const uncollected = this.cashDrops.filter(drop => distanceSquared(drop.x, drop.y, 5200, 2470) < 150 ** 2).length;
      if (this.save.station.oreProgress >= 1 && uncollected < 12) {
        this.save.station.oreProgress -= 1;
        this.createCashDrop(12 + rigLevel * 8, { x: 5200, y: 2470 });
        this.spawnBurst(5050, 2380, BRAND.colors.gold, 7);
        this.audio.play('build', .4);
      }
    } else this.save.station.oreProgress = Math.min(this.save.station.oreProgress, .99);

    this.updateLumberjacks(dt);

    const hunter = hunterTierFor(this.save.upgrades.hunters);
    if (hunter.crew > 0 && this.save.station.rawMeat < hunter.stockCap) {
      this.save.station.hunterProgress += dt / hunter.interval;
      if (this.save.station.hunterProgress >= 1) {
        this.save.station.hunterProgress -= 1;
        const delivered = Math.min(hunter.batch, hunter.stockCap - this.save.station.rawMeat);
        this.save.station.rawMeat += delivered;
        this.spawnGainLabel(WORLD.butcherInput.x, WORLD.butcherInput.y, `+${delivered} HUNTED MEAT`, BRAND.colors.meat, 68);
        this.spawnBurst(WORLD.butcherInput.x, WORLD.butcherInput.y, BRAND.colors.meat, 7);
        this.audio.play('deposit', .42);
      }
    } else if (hunter.crew === 0 || this.save.station.rawMeat >= hunter.stockCap) this.save.station.hunterProgress = 0;
    this.hunterVisuals.forEach((worker, index) => {
      const active = index < hunter.crew;
      worker.visible = active;
      if (!active) return;
      const phase = (this.simulationTime / hunter.interval) * Math.PI * 2 + index * 1.45;
      const t = (Math.sin(phase) + 1) / 2;
      const x = WORLD.butcherInput.x + (2120 - WORLD.butcherInput.x) * t;
      const y = WORLD.butcherInput.y + (720 - WORLD.butcherInput.y) * t + index * 24;
      worker.scale.x = Math.cos(phase) < 0 ? -1 : 1;
      this.place(worker, x, y, 36);
    });
  }

  private moveLumberjack(worker: LumberjackWorker, target: Vec2, speed: number, dt: number): boolean {
    const direction = normalize(target.x - worker.x, target.y - worker.y);
    const step = Math.min(direction.magnitude, speed * dt);
    worker.x += direction.x * step;
    worker.y += direction.y * step;
    if (Math.abs(direction.x) > .05) worker.container.scale.x = direction.x < 0 ? -1 : 1;
    this.place(worker.container, worker.x, worker.y, 36);
    return direction.magnitude <= 7;
  }

  private chooseLumberjackTree(worker: LumberjackWorker): TreeEntity | null {
    const claimed = new Set(this.lumberjackVisuals.filter(other => other !== worker && other.target?.alive).map(other => other.target));
    let target: TreeEntity | null = null;
    let best = Number.POSITIVE_INFINITY;
    for (const tree of this.trees) {
      if (!tree.alive || claimed.has(tree) || tree.x < WILD_EAST_EDGE || tree.x >= WORLD.zoneGate.x - 80) continue;
      const distance = distanceSquared(worker.x, worker.y, tree.x, tree.y);
      if (distance < best) { best = distance; target = tree; }
    }
    return target;
  }

  private updateLumberjacks(dt: number): void {
    const level = this.save.upgrades.lumberjack;
    const speed = 105 + level * 20;
    for (let index = 0; index < this.lumberjackVisuals.length; index += 1) {
      const worker = this.lumberjackVisuals[index]!;
      const active = index < level;
      worker.container.visible = active;
      if (!active) continue;
      const yard = { x: 1590 + index * 25, y: 1125 + index * 24 };
      if (worker.state === 'idle' && this.save.station.lumber < 300) worker.state = 'to-inside-gate';
      if (worker.target && !worker.target.alive && worker.state !== 'return-outside-gate') {
        worker.target = null;
        worker.state = 'to-outside-gate';
      }
      switch (worker.state) {
        case 'idle':
          this.moveLumberjack(worker, yard, speed, dt);
          break;
        case 'to-inside-gate':
          if (this.moveLumberjack(worker, { x: ENTRY_INSIDE.x, y: ENTRY_INSIDE.y + index * 22 }, speed, dt)) worker.state = 'to-outside-gate';
          break;
        case 'to-outside-gate':
          if (this.moveLumberjack(worker, { x: ENTRY_OUTSIDE.x, y: ENTRY_OUTSIDE.y + index * 22 }, speed, dt)) {
            worker.target = this.chooseLumberjackTree(worker);
            worker.state = worker.target ? 'to-tree' : 'return-inside-gate';
          }
          break;
        case 'to-tree':
          if (!worker.target) { worker.state = 'to-outside-gate'; break; }
          if (this.moveLumberjack(worker, { x: worker.target.x - 68, y: worker.target.y + index * 9 }, speed, dt)) {
            worker.state = 'chopping';
            worker.chopTimer = .25;
          }
          break;
        case 'chopping': {
          const tree = worker.target;
          if (!tree?.alive) { worker.target = null; worker.state = 'to-outside-gate'; break; }
          worker.chopTimer -= dt;
          worker.container.rotation = Math.sin(this.simulationTime * 18) * .09;
          if (worker.chopTimer > 0) break;
          worker.chopTimer = Math.max(.22, .52 - level * .07);
          tree.health -= 1;
          tree.shakeUntil = this.simulationTime + .18;
          this.spawnBurst(tree.x, tree.y - 38, 0xc08a52, 4);
          if (tree.health > 0) break;
          tree.alive = false;
          tree.regrow = TIMBER.regrowSeconds;
          tree.container.visible = false;
          this.treeVersion += 1;
          this.save.stats.woodChopped += TIMBER.logYield;
          worker.carried = Math.min(TIMBER.logYield, 300 - this.save.station.lumber);
          worker.target = null;
          worker.state = 'return-outside-gate';
          worker.container.rotation = 0;
          this.audio.play('deposit', .55);
          break;
        }
        case 'return-outside-gate':
          if (this.moveLumberjack(worker, { x: ENTRY_OUTSIDE.x, y: ENTRY_OUTSIDE.y + index * 22 }, speed, dt)) worker.state = 'return-inside-gate';
          break;
        case 'return-inside-gate':
          if (this.moveLumberjack(worker, { x: ENTRY_INSIDE.x, y: ENTRY_INSIDE.y + index * 22 }, speed, dt)) worker.state = 'return-yard';
          break;
        case 'return-yard':
          if (this.moveLumberjack(worker, yard, speed, dt)) {
            const delivered = Math.min(worker.carried, 300 - this.save.station.lumber);
            this.save.station.lumber += delivered;
            worker.carried = 0;
            worker.state = this.save.station.lumber < 300 ? 'to-inside-gate' : 'idle';
            if (delivered > 0) {
              this.spawnGainLabel(1500, 1120, `+${delivered} LOGS`, 0xffd58b, 65);
              this.spawnBurst(1500, 1120, BRAND.colors.timber, 7);
              this.requestSave();
            }
          }
          break;
        default: break;
      }
      worker.cargo.clear();
      for (let log = 0; log < worker.carried; log += 1) {
        worker.cargo.roundRect(-13, -log * 7, 26, 7, 3).fill(log % 2 ? BRAND.colors.timber : 0xc28b58)
          .stroke({ color: BRAND.colors.outline, width: 1.3 });
      }
    }
  }

  private updateCook(dt: number): void {
    const level = this.save.upgrades.worker;
    if (level <= 0) return;
    const routes = {
      meat: {
        source: WORLD.butcherOutput,
        outbound: [{ x: 1360, y: 780 }, { x: 900, y: 780 }, { x: 760, y: 700 }],
        inbound: [{ x: 900, y: 780 }, { x: 1360, y: 780 }, WORLD.butcherOutput]
      },
      fish: {
        source: WORLD.fishCounter,
        // Use the shoreline gate instead of cutting through the south palisade.
        outbound: [{ x: 1120, y: 1530 }, { x: 1010, y: 1370 }, { x: 900, y: 980 }, { x: 760, y: 700 }],
        inbound: [{ x: 900, y: 980 }, { x: 1010, y: 1370 }, { x: 1120, y: 1530 }, WORLD.fishCounter]
      }
    } as const;
    const carried = () => this.save.station.cookMeals + this.save.station.cookFishMeals;
    if (this.cookDelivering && carried() === 0) {
      this.cookDelivering = false;
      this.cookWaypoint = 0;
    }

    if (!this.cookDelivering) {
      const meatReady = this.save.station.meals > 0;
      const fishReady = this.save.unlocks.dock && this.save.station.fishMeals > 0;
      const preferred: 'meat' | 'fish' | null = fishReady && (this.customerFishDemand > 0 || !meatReady)
        ? 'fish' : meatReady ? 'meat' : fishReady ? 'fish' : null;
      if (preferred && preferred !== this.cookSource) {
        this.cookSource = preferred;
        this.cookWaypoint = 0;
      }
      const source = routes[this.cookSource].source;
      if (preferred && Math.hypot(this.cookPosition.x - source.x, this.cookPosition.y - source.y) < 5) {
        const batch = level * 2;
        if (this.cookSource === 'fish') {
          this.save.station.cookFishMeals = Math.min(batch, this.save.station.fishMeals);
          this.save.station.fishMeals -= this.save.station.cookFishMeals;
        } else {
          this.save.station.cookMeals = Math.min(batch, this.save.station.meals);
          this.save.station.meals -= this.save.station.cookMeals;
        }
        this.cookDelivering = true;
        this.cookWaypoint = 0;
        this.requestSave();
      }
    }

    const route = routes[this.cookSource];
    const hasPickup = this.cookSource === 'fish' ? this.save.station.fishMeals > 0 : this.save.station.meals > 0;
    const target = this.cookDelivering ? route.outbound[this.cookWaypoint]
      : hasPickup ? route.inbound[this.cookWaypoint] : undefined;
    const visual = this.station.workerVisuals[1]!;
    if (target) {
      const direction = normalize(target.x - this.cookPosition.x, target.y - this.cookPosition.y);
      const step = Math.min(direction.magnitude, (level === 1 ? 190 : 270) * dt);
      this.cookPosition.x += direction.x * step;
      this.cookPosition.y += direction.y * step;
      if (step > 0) visual.scale.x = facesLeft(direction.x, direction.y) ? -1 : 1;
      if (direction.magnitude < 5) this.cookWaypoint += 1;
    }
    this.place(visual, this.cookPosition.x, this.cookPosition.y, 35);
    const key = `${this.save.station.cookMeals}|${this.save.station.cookFishMeals}`;
    if (this.cookTray.label !== key) {
      this.cookTray.label = key;
      this.cookTray.clear();
      for (let i = 0; i < carried(); i += 1) {
        this.cookTray.ellipse(28, -50 - i * 9, 17, 5).fill(0xfff0cf).stroke({ color: 0xd8a75b, width: 2 });
        this.cookTray.ellipse(28, -52 - i * 9, 10, 3)
          .fill(this.save.station.cookFishMeals > 0 ? BRAND.colors.fish : BRAND.colors.ember);
      }
    }
  }

  /** The player can still collect and serve meals alongside the hired cook. */
  private updateMealPickups(dt: number): void {
    this.mealPickupTimer = Math.max(0, this.mealPickupTimer - dt);
    if (this.mealPickupTimer > 0) return;
    const nearMeals = distanceSquared(this.player.x, this.player.y, WORLD.butcherOutput.x, WORLD.butcherOutput.y) < 72 ** 2;
    const nearFishMeals = this.save.unlocks.dock
      && distanceSquared(this.player.x, this.player.y, WORLD.fishCounter.x, WORLD.fishCounter.y) < 68 ** 2;

    if (nearMeals && this.save.station.meals > 0) {
      this.mealPickupTimer = .08;
      this.save.station.meals -= 1;
      this.player.meals += 1;
      this.streamParticle(WORLD.butcherOutput.x, WORLD.butcherOutput.y - 18, this.player.x, this.player.y - 34, BRAND.colors.gold);
      this.spawnBurst(WORLD.butcherOutput.x, WORLD.butcherOutput.y - 15, BRAND.colors.ember, 3);
      this.audio.play('pickup', .72);
      this.audio.haptic(7);
      this.requestSave();
    } else if (nearFishMeals && this.save.station.fishMeals > 0) {
      this.mealPickupTimer = .08;
      this.save.station.fishMeals -= 1;
      this.player.fishMeals += 1;
      this.streamParticle(WORLD.fishCounter.x, WORLD.fishCounter.y - 18, this.player.x, this.player.y - 34, BRAND.colors.fish);
      this.spawnBurst(WORLD.fishCounter.x, WORLD.fishCounter.y - 15, BRAND.colors.fish, 3);
      this.audio.play('pickup', .76);
      this.audio.haptic(7);
      this.requestSave();
    }
  }

  private updateCustomers(dt: number): void {
    const maxQueue = queueCapacityFor(this.save.upgrades.customerFlow);
    this.customerSpawnTimer -= dt;
    const outstanding = this.customerBearDemand + this.customerFishDemand;
    const activeOrders = this.customers.filter(customer => customer.state === 'arriving' || customer.state === 'waiting');
    if (this.customerSpawnTimer <= 0 && activeOrders.length < Math.min(maxQueue, outstanding)) {
      // Orders form quickly enough that the line is established while the player
      // collects the batch. Beacon levels tighten the stagger further.
      this.customerSpawnTimer = Math.max(.18, .62 - this.save.upgrades.customerFlow * .065);
      const assignedFish = activeOrders.filter(customer => customer.wantsFish).length;
      const assignedBear = activeOrders.length - assignedFish;
      const needsFishGuest = assignedFish < this.customerFishDemand;
      const needsBearGuest = assignedBear < this.customerBearDemand;
      this.createCustomer(needsFishGuest && (!needsBearGuest || this.customerFishDemand - assignedFish >= this.customerBearDemand - assignedBear));
    } else if (this.customerSpawnTimer <= 0) {
      this.customerSpawnTimer = .22;
    }

    for (const customer of this.customers) customer.moving = false;
    // Once a guest is taking a plate they have left the queue. Excluding that state
    // prevents the front-slot assignment from changing a fed villager back to waiting.
    const activeQueue = this.customers.filter(customer => customer.state === 'arriving' || customer.state === 'waiting');
    for (let queueIndex = 0; queueIndex < activeQueue.length; queueIndex += 1) {
      const customer = activeQueue[queueIndex]!;
      // Walk in through the gateway first; only then head for a place in the line.
      if (!customer.approachedGate) {
        this.moveCustomerToward(customer, ENTRY_OUTSIDE.x, ENTRY_OUTSIDE.y, dt, 340);
        if (Math.hypot(customer.x - ENTRY_OUTSIDE.x, customer.y - ENTRY_OUTSIDE.y) < 24) customer.approachedGate = true;
        continue;
      } else if (!customer.entered) {
        this.moveCustomerToward(customer, ENTRY_INSIDE.x, ENTRY_INSIDE.y, dt, 320);
        if (Math.hypot(customer.x - ENTRY_INSIDE.x, customer.y - ENTRY_INSIDE.y) < 26) customer.entered = true;
        continue;
      }
      // Two connected rows keep all eight guests inside the yard and off the store crates.
      const slotX = WORLD.counter.x - 20 - (queueIndex < 4 ? queueIndex : 7 - queueIndex) * 58;
      const slotY = WORLD.counter.y + 105 + (queueIndex < 4 ? 0 : 90);
      this.moveCustomerToward(customer, slotX, slotY, dt, 280);
      if (Math.hypot(customer.x - slotX, customer.y - slotY) < 5) customer.state = queueIndex === 0 ? 'waiting' : 'arriving';
      // Nobody gets fed unless the Trailwarden is behind the counter working the line.
      if (queueIndex === 0 && customer.state === 'waiting' && this.isPlayerServing()) this.tryServeCustomer(customer);
      if (queueIndex === 0 && customer.state === 'waiting'
        && this.save.station.cookMeals + this.save.station.cookFishMeals > 0
        && this.save.upgrades.worker > 0 && this.cookDelivering
        && Math.hypot(this.cookPosition.x - 760, this.cookPosition.y - 700) < 12) this.tryServeCustomer(customer, true);
    }

    for (let index = this.customers.length - 1; index >= 0; index -= 1) {
      const customer = this.customers[index]!;
      customer.timer -= dt;
      if (customer.state === 'taking' && customer.timer <= 0) {
        customer.state = 'happy'; customer.timer = .62; customer.bubble.visible = true; customer.bubbleText.text = '♥'; this.audio.play('sale');
      } else if (customer.state === 'happy' && customer.timer <= 0) {
        customer.state = 'leaving'; customer.bubble.visible = false;
      } else if (customer.state === 'leaving') {
        // Continue past the gateway to an off-camera trail instead of vanishing at it.
        if (customer.entered) {
          this.moveCustomerToward(customer, ENTRY_INSIDE.x, ENTRY_INSIDE.y, dt, 128);
          if (Math.hypot(customer.x - ENTRY_INSIDE.x, customer.y - ENTRY_INSIDE.y) < 26) customer.entered = false;
        } else if (customer.approachedGate) {
          this.moveCustomerToward(customer, ENTRY_OUTSIDE.x, ENTRY_OUTSIDE.y, dt, 128);
          if (Math.hypot(customer.x - ENTRY_OUTSIDE.x, customer.y - ENTRY_OUTSIDE.y) < 24) customer.approachedGate = false;
        } else {
          this.moveCustomerToward(customer, customer.trailEnd.x, customer.trailEnd.y, dt, 132);
          if (Math.hypot(customer.x - customer.trailEnd.x, customer.y - customer.trailEnd.y) < 24) {
            customer.container.destroy({ children: true });
            this.customers.splice(index, 1);
            continue;
          }
        }
      }
      this.place(customer.container, customer.x, customer.y, 45);
      const stride = customer.moving && !this.save.settings.reducedMotion ? customer.walkPhase : 0;
      const lift = customer.moving ? Math.abs(Math.sin(stride)) : 0;
      const sway = customer.moving ? Math.sin(stride) : 0;
      customer.body.position.set(sway * 1.25, -lift * 3.2);
      customer.body.rotation = sway * .022;
      customer.body.scale.y = 1 - Math.pow(1 - lift, 5) * .025;
      customer.shadow.scale.set(1 - lift * .065, 1 + lift * .03);
    }
  }

  private createCustomer(wantsFish: boolean): void {
    const container = new Container();
    const color = [0xc55c4b, 0x4f7895, 0xc48a3d, 0x5b8a73][this.nextCustomerId % 4]!;
    const shadow = contactShadow(22, 10, 0.2);
    shadow.position.set(0, 18);
    const art = spriteFor('actor/villager');
    const body = new Graphics();
    if (art) body.addChild(art);
    else {
      body.roundRect(-17, -28, 34, 48, 14).fill(color);
      body.moveTo(8, -28).lineTo(17, -22).lineTo(17, 15).lineTo(8, 20).closePath().fill(shade(color, -0.28));
      body.roundRect(-17, -28, 34, 48, 14).stroke({ color: BRAND.colors.outline, width: 3 });
      body.circle(0, -35, 15).fill(0xe2c29b).stroke({ color: BRAND.colors.outline, width: 3 });
      body.moveTo(-14, -39).bezierCurveTo(-10, -57, 10, -57, 15, -38).lineTo(10, -30).lineTo(-12, -31).closePath().fill(0x284c60);
    }
    const bubble = new Container();
    bubble.position.set(0, art ? -132 : -79);
    const bubbleShape = new Graphics().roundRect(-24, -19, 48, 35, 14).fill(0xffffff).stroke({ color: BRAND.colors.outline, width: 2, alpha: 0.5 }).moveTo(-8, 14).lineTo(0, 26).lineTo(7, 14).fill(0xffffff);
    const bubbleText = worldText(wantsFish ? '≈' : '●', 19, wantsFish ? BRAND.colors.fish : BRAND.colors.meat, '800');
    bubble.addChild(bubbleShape, bubbleText);
    container.addChild(shadow, body, bubble);
    // Guests begin beyond the current camera on one of several approach trails.
    const trailEnd = this.visitorTrailPoint();
    this.place(container, trailEnd.x, trailEnd.y, 45);
    this.world.addChild(container);
    this.customers.push({
      id: this.nextCustomerId++, x: trailEnd.x, y: trailEnd.y,
      state: 'arriving', timer: 0, wantsFish, container, body, shadow, bubble, bubbleText,
      moving: false, walkPhase: 0, entered: false, approachedGate: false, trailEnd
    });
  }

  private moveCustomerToward(customer: CustomerEntity, targetX: number, targetY: number, dt: number, speed = 98): void {
    const direction = normalize(targetX - customer.x, targetY - customer.y);
    const distance = Math.min(direction.magnitude, speed * dt);
    const moveX = direction.x * distance;
    const moveY = direction.y * distance;
    customer.x += moveX;
    customer.y += moveY;
    if (distance > 0.01) {
      customer.moving = true;
      customer.walkPhase += distance * .105;
      customer.body.scale.x = facesLeft(moveX, moveY) ? -1 : 1;
    }
  }

  /** A guest takes one actual carried meal, from either the player or hired cook. */
  private tryServeCustomer(customer: CustomerEntity, servedByCook = false): void {
    // The bubble is a preference, never a queue deadlock. A guest takes the other
    // cooked plate if their preferred dish is unavailable, so batches always clear.
    const servingFish = servedByCook ? this.save.station.cookFishMeals > 0
      : this.player.fishMeals > 0 && (customer.wantsFish || this.player.meals <= 0);
    const carried = servedByCook
      ? servingFish ? this.save.station.cookFishMeals : this.save.station.cookMeals
      : servingFish ? this.player.fishMeals : this.player.meals;
    if (carried <= 0) {
      // Nothing to hand over — the guest keeps waiting and keeps showing what they want.
      customer.bubble.visible = true;
      return;
    }

    const unit = servingFish
      ? ECONOMY.fishMealValue + this.save.upgrades.saleValue * 2
      : mealValueFor(this.save.upgrades.saleValue);
    const result = purchaseMeal(carried, unit);
    if (!result.sold) return;
    if (servedByCook && servingFish) this.save.station.cookFishMeals = result.ready;
    else if (servedByCook) this.save.station.cookMeals = result.ready;
    else if (servingFish) this.player.fishMeals = result.ready;
    else this.player.meals = result.ready;
    const server = servedByCook ? this.cookPosition : this.player;
    this.streamParticle(server.x, server.y - 40, customer.x, customer.y - 30,
      servingFish ? BRAND.colors.fish : BRAND.colors.gold);

    this.createCashDrop(result.cashDrop);
    this.spawnGainLabel(customer.x, customer.y, `+$${result.cashDrop}`, 0x8ef0a4, 78);
    customer.state = 'taking';
    customer.timer = .3;
    customer.bubble.visible = false;
    if (customer.wantsFish) this.customerFishDemand = Math.max(0, this.customerFishDemand - 1);
    else this.customerBearDemand = Math.max(0, this.customerBearDemand - 1);
    this.customerSpawnTimer = Math.min(this.customerSpawnTimer, .08);
    this.save.stats.mealsSold += 1;
    this.requestSave();
  }

  private createCashDrop(value: number, origin: Vec2 = WORLD.cashZone): void {
    const index = this.cashDrops.length;
    const angle = index * 1.9;
    const x = origin.x + Math.cos(angle) * Math.min(35, 8 + index * 3);
    const y = origin.y + Math.sin(angle) * Math.min(28, 7 + index * 2);
    const container = new Container();
    this.place(container, x, y, 25);
    const shadow = contactShadow(19, 9, 0.2);
    shadow.position.set(0, 8);
    const bill = new Graphics().roundRect(-19, -10, 38, 20, 4).fill(0x75d58b);
    bill.roundRect(-19, -10, 38, 20, 4).stroke({ color: 0x397f5a, width: 3 }).circle(0, 0, 5).stroke({ color: 0xe5ffd8, width: 2 });
    const valueText = worldText(`$${value}`, 12, 0xffffff, '800');
    valueText.position.set(0, -19);
    container.addChild(shadow, bill, valueText);
    this.world.addChild(container);
    this.cashDrops.push({ value, x, y, life: 9999, container });
  }

  private updateCash(_dt: number): void {
    if (!this.player.alive) return;
    if (this.save.station.passiveCash > 0
      && distanceSquared(this.player.x, this.player.y, WORLD.cashZone.x, WORLD.cashZone.y) < 62 ** 2) {
      const value = this.save.station.passiveCash;
      this.save.station.passiveCash = 0;
      this.save.cash += value;
      this.save.stats.totalCashEarned += value;
      this.spawnGainLabel(WORLD.cashZone.x, WORLD.cashZone.y, `+$${value} PASSIVE`, 0xffe07a, 72);
      this.spawnBurst(WORLD.cashZone.x, WORLD.cashZone.y, 0x72dd8d, 12);
      this.audio.play('cash');
      this.requestSave();
    }
    for (let index = this.cashDrops.length - 1; index >= 0; index -= 1) {
      const cash = this.cashDrops[index]!;
      if (distanceSquared(this.player.x, this.player.y, cash.x, cash.y) < 55 ** 2) {
        this.save.cash += cash.value;
        this.save.stats.totalCashEarned += cash.value;
        this.streamParticle(cash.x, cash.y, this.player.x, this.player.y - 35, 0x72dd8d);
        this.spawnGainLabel(cash.x, cash.y, `+$${cash.value}`, 0xffe07a, 54);
        this.audio.play('cash');
        this.audio.haptic(14);
        cash.container.destroy({ children: true });
        this.cashDrops.splice(index, 1);
        this.onActualEvent('cash');
        this.requestSave();
      }
    }
  }

  private updateUpgradePads(dt: number): void {
    const settled = Math.hypot(this.player.vx, this.player.vy) < PAD_SETTLE_SPEED;
    for (const pad of this.upgradePads) {
      const near = distanceSquared(this.player.x, this.player.y, pad.x, pad.y) < 35 ** 2;
      if (!near || !isUpgradeAvailable(pad.id, this.save)) {
        pad.lockedUntilExit = false;
        pad.dwell = 0;
        continue;
      }
      const config = UPGRADE_BY_ID[pad.id];
      const level = this.save.upgrades[pad.id];
      if (level >= config.maxLevel || pad.lockedUntilExit) continue;
      // Stopping commits to the purchase; walking through leaves the cash alone.
      pad.dwell = settled ? pad.dwell + dt : 0;
      if (pad.dwell < PAD_DWELL_SECONDS) continue;
      const cost = upgradeCost(pad.id, level);
      this.payTowardPad(pad, cost, dt, () => {
        this.save.upgrades[pad.id] += 1;
        delete this.save.contributions[pad.id];
        pad.paid = 0;
        pad.lockedUntilExit = true;
        if (pad.id === 'maxHealth') this.player.health = maxHealthFor(this.save.upgrades.maxHealth);
        if (pad.id === 'defense' || pad.id === 'gateArmor' || pad.id === 'compound') this.gateHealth = this.gateMaxHealth();
        if (pad.id === 'weaponTier') {
          drawWeapon(this.player.weapon, this.save.upgrades.weaponTier);
          this.player.ammo = weaponMagazineFor(this.save.upgrades.weaponTier);
          this.player.reloadTimer = 0;
        }
        if (pad.id === 'compound') this.refreshCompoundVisuals();
        this.refreshWorldState();
        this.refreshPadVisuals();
        this.audio.play('upgrade');
        this.audio.haptic([18, 30, 36]);
        this.spawnBurst(pad.x, pad.y, BRAND.colors.gold, 18);
        this.callbacks.toast(`${config.label} upgraded · ${config.effectText(this.save.upgrades[config.id])}`);
        this.onActualEvent('upgrade');
        this.requestSave();
      });
    }

    // Build plates take timber off the player's back, one log at a time, so the
    // requirement pin visibly drains while they stand there.
    this.deliverTimer = Math.max(0, this.deliverTimer - dt);
    for (const pad of this.unlockPads) {
      if (!this.unlockPrerequisiteMet(pad.kind)) continue;
      const unlocked = this.save.unlocks[pad.kind];
      const near = distanceSquared(this.player.x, this.player.y, pad.x, pad.y) < 43 ** 2;
      if (!near) { pad.lockedUntilExit = false; pad.dwell = 0; continue; }
      if (unlocked || pad.lockedUntilExit) continue;
      pad.dwell = settled ? pad.dwell + dt : 0;
      if (pad.dwell < PAD_DWELL_SECONDS) continue;
      if (pad.payment === 'cash') {
        this.payTowardPad(pad, pad.cost, dt, () => this.completeUnlock(pad));
        continue;
      }
      if (this.player.wood <= 0) {
        if (this.insufficientToastTimer <= 0) {
          this.callbacks.toast(`Needs ${pad.requires - pad.delivered} more timber`);
          this.insufficientToastTimer = 2.4;
        }
        continue;
      }
      if (this.deliverTimer > 0) continue;
      this.deliverTimer = 0.07;
      const deposited = Math.min(this.player.wood > 100 ? 2 : 1, pad.requires - pad.delivered);
      this.player.wood -= deposited;
      pad.delivered += deposited;
      this.save.contributions[pad.kind] = pad.delivered;
      this.streamParticle(this.player.x, this.player.y - 40, pad.x, pad.y - 30, BRAND.colors.timber);
      this.audio.play('build', .4);
      if (pad.delivered >= pad.requires) this.completeUnlock(pad);
    }
  }

  private unlockPrerequisiteMet(kind: UnlockPad['kind']): boolean {
    if (kind === 'glacier') return this.save.unlocks.zone2;
    if (kind === 'whiteout') return this.save.unlocks.glacier;
    return true;
  }

  private payTowardPad(pad: UpgradePad | UnlockPad, cost: number, dt: number, complete: () => void): void {
    if (this.save.cash <= 0) {
      if (this.insufficientToastTimer <= 0) { this.callbacks.toast(`Need $${Math.max(0, cost - pad.paid)} more`); this.insufficientToastTimer = 2.4; }
      return;
    }
    // Large purchases should celebrate the investment without making the player
    // stand still for ten seconds after already earning the full price.
    const targetPayment = Math.max(1, Math.ceil(dt * Math.max(120, cost / 2)));
    const payment = Math.min(targetPayment, this.save.cash, cost - pad.paid);
    if (payment <= 0) return;
    this.save.cash -= payment;
    pad.paid += payment;
    this.save.contributions['id' in pad ? pad.id : pad.kind] = pad.paid;
    this.streamParticle(this.player.x, this.player.y - 22, pad.x, pad.y, 0x72dd8d);
    this.audio.play('build', .32);
    if (pad.paid >= cost) complete();
  }

  private completeUnlock(pad: UnlockPad): void {
    delete this.save.contributions[pad.kind];
    pad.paid = 0;
    pad.lockedUntilExit = true;
    if (pad.kind === 'zone2') {
      this.save.unlocks.zone2 = true;
      for (const spawn of ENEMY_SPAWNS.filter(item => item.unlock === 'zone2')) this.enemies.push(this.createEnemy(spawn.kind, spawn.x, spawn.y, false));
      this.callbacks.toast('Eastern Frontier opened · Icehorn Ridge discovered');
      this.audio.play('gate');
      this.raidTimer = Math.min(this.raidTimer, 24);
    } else if (pad.kind === 'dock') {
      this.save.unlocks.dock = true;
      this.callbacks.toast('Shoreline thawed · Ice fishing is online');
      this.audio.play('gate');
    } else if (pad.kind === 'glacier') {
      this.save.unlocks.glacier = true;
      for (const spawn of ENEMY_SPAWNS.filter(item => item.unlock === 'glacier')) this.enemies.push(this.createEnemy(spawn.kind, spawn.x, spawn.y, false));
      this.callbacks.toast('Glacier Reach opened · New forest and hunting grounds');
      this.audio.play('gate');
    } else {
      this.save.unlocks.whiteout = true;
      for (const spawn of ENEMY_SPAWNS.filter(item => item.unlock === 'whiteout')) this.enemies.push(this.createEnemy(spawn.kind, spawn.x, spawn.y, false));
      this.callbacks.toast('Whiteout Expanse opened · The deep ice is yours');
      this.audio.play('gate');
    }
    this.spawnBurst(pad.x, pad.y, BRAND.colors.gold, 24);
    this.refreshWorldState();
    this.refreshPadVisuals();
    this.requestSave();
  }

  private updateFishing(dt: number): void {
    if (!this.save.unlocks.dock) { this.fishCatchProgress = 0; return; }
    const nearDock = distanceSquared(this.player.x, this.player.y, WORLD.fishDock.x, WORLD.fishDock.y) < 90 ** 2;
    if (!nearDock) {
      this.fishCatchProgress = Math.max(0, this.fishCatchProgress - dt * .4);
      return;
    }
    const fisheryLevel = this.save.upgrades.fishery;
    this.fishCatchProgress += dt / (ECONOMY.fishCatchSeconds / (1 + fisheryLevel * .25));
    if (this.fishCatchProgress >= 1) {
      this.fishCatchProgress = 0;
      const caught = 1 + Math.floor(fisheryLevel / 3);
      this.player.fish += caught;
      this.save.stats.fishCaught += caught;
      this.audio.play('fish');
      this.audio.haptic(14);
      this.spawnBurst(WORLD.fishDock.x + 80, WORLD.fishDock.y - 20, BRAND.colors.fish, 9);
      this.callbacks.toast(`Fresh frostfin caught${caught > 1 ? ` ×${caught}` : ''}`);
      this.requestSave();
    }
  }

  private updateRaid(dt: number): void {
    // Recruited wardens visibly patrol at all times; during a raid the same loop acquires targets.
    this.updateGuard(dt);
    if (this.raidState === 'idle' && (!this.save.unlocks.zone2 || this.save.stats.totalCashEarned < ECONOMY.raidFirstEarnedCash)) return;
    this.raidTimer -= dt;
    if (this.raidState === 'idle' && this.raidTimer <= 0) {
      this.raidState = 'warning';
      this.raidTimer = ECONOMY.raidWarning;
      const wave = Math.max(1, this.save.stats.raidsFaced + 1);
      this.callbacks.raid(`WAVE ${wave} · RAID IN ${Math.ceil(this.raidTimer)}s`);
      this.audio.play('warning', 1.2);
    } else if (this.raidState === 'warning') {
      const wave = Math.max(1, this.save.stats.raidsFaced + 1);
      this.callbacks.raid(`WAVE ${wave} · RAID IN ${Math.max(0, Math.ceil(this.raidTimer))}s`);
      if (this.raidTimer <= 0) this.startRaid();
    } else if (this.raidState === 'active') {
      const raidersAlive = this.enemies.some(enemy => enemy.isRaid && enemy.alive);
      if (!this.raidBreached && this.gateHealth <= 0) this.beginRaidBreach();
      if (!raidersAlive) this.finishRaid(!this.raidBreached);
      if (this.raidState === 'active') {
        this.callbacks.raid(this.raidBreached
          ? `WAVE ${this.raidWave} · PANTRY BREACH · BANK $${this.save.cash} · LOST $${this.raidCashLost}`
          : `WAVE ${this.raidWave} · ${this.enemies.filter(enemy => enemy.isRaid && enemy.alive).length} RAIDERS · GATE ${Math.ceil(this.gateHealth)} / ${this.gateMaxHealth()}`);
      }
    } else if (this.raidState === 'cooldown' && this.raidTimer <= 0) {
      this.raidState = 'idle';
      this.raidTimer = 12;
    }
  }

  private startRaid(): void {
    this.raidState = 'active';
    this.save.stats.raidsFaced += 1;
    this.raidWave = this.save.stats.raidsFaced;
    const profile = raidProfileFor(this.raidWave);
    this.gateHealth = this.gateMaxHealth();
    this.raidBreached = false;
    this.raidCashLost = 0;
    this.raidBankEmptyShown = false;
    for (const post of this.defenders) {
      if (!post.mobile) continue;
      post.health = post.maxHealth;
      post.alive = true;
      post.container.visible = true;
    }
    for (let index = 0; index < profile.count; index += 1) {
      const spawn = this.raidTrailPoint(index);
      const enemy = this.createEnemy('raider', spawn.x, spawn.y, true);
      enemy.config = {
        ...enemy.config,
        health: Math.round(enemy.config.health * profile.healthMultiplier),
        damage: Math.round(enemy.config.damage * profile.damageMultiplier),
        speed: Math.round(enemy.config.speed * profile.speedMultiplier)
      };
      enemy.health = enemy.config.health;
      enemy.state = 'raid';
      this.enemies.push(enemy);
    }
    this.save.unlocks.raidSeen = true;
    this.callbacks.raid(`WAVE ${profile.wave}: RAID · ${profile.count} Rimebacks · Defend the gate!`);
    this.audio.play('gate');
    this.camera.shake = this.save.settings.reducedMotion ? 0 : 14;
    this.requestSave();
  }

  private beginRaidBreach(): void {
    this.raidBreached = true;
    this.gateHealth = 0;
    this.station.compoundGate.open = Math.max(this.station.compoundGate.open, .28);
    for (const enemy of this.enemies) {
      if (!enemy.isRaid || !enemy.alive) continue;
      enemy.raidApproachedGate = true;
      if (enemy.state !== 'hurt' && enemy.state !== 'defeat') enemy.state = 'raid';
    }
    this.callbacks.raid(`PANTRY BREACH · BANK $${this.save.cash} · Stop the pack!`);
    this.callbacks.toast('THE GATE BUCKLED · Raiders are charging the food profits!');
    this.audio.play('defeat', .85);
    this.audio.haptic([45, 35, 70]);
    this.camera.shake = this.save.settings.reducedMotion ? 0 : 18;
    this.spawnBurst(WORLD.campGate.x, WORLD.campGate.y, BRAND.colors.danger, 24);
    this.requestSave();
  }

  private updateGuard(dt: number): void {
    for (let index = 0; index < this.defenders.length; index += 1) {
      const post = this.defenders[index]!;
      if (post.mobile) {
        post.healthBar.clear();
        const ratio = clamp(post.health / post.maxHealth, 0, 1);
        post.healthBar.roundRect(-30, -3, 60, 7, 3).fill(0x18303a).roundRect(-28, -1, 56 * ratio, 3, 2)
          .fill(ratio > .35 ? BRAND.colors.safe : BRAND.colors.danger);
        post.container.visible = post.alive;
        if (!post.alive) continue;
        if (this.raidState === 'active') {
          let destination: Vec2;
          if (post.x < ENTRY_INSIDE.x - 12) destination = { x: ENTRY_INSIDE.x, y: ENTRY_INSIDE.y + (index % 4 - 1.5) * 28 };
          else if (post.x < ENTRY_OUTSIDE.x - 20) destination = { x: ENTRY_OUTSIDE.x, y: ENTRY_OUTSIDE.y + (index % 4 - 1.5) * 30 };
          else {
            const target = this.enemies.filter(enemy => enemy.isRaid && enemy.alive && enemy.state !== 'defeat')
              .sort((a, b) => distanceSquared(a.x, a.y, post.x, post.y) - distanceSquared(b.x, b.y, post.x, post.y))[0];
            const targetDistance = target ? Math.sqrt(distanceSquared(target.x, target.y, post.x, post.y)) : 0;
            destination = target && targetDistance > post.range * .72 ? { x: target.x, y: target.y } : { x: post.x, y: post.y };
          }
          const direction = normalize(destination.x - post.x, destination.y - post.y);
          const step = Math.min(direction.magnitude, post.speed * dt);
          post.x += direction.x * step;
          post.y += direction.y * step;
          if (Math.abs(direction.x) > .04) post.container.scale.x = direction.x < 0 ? -1 : 1;
        } else {
          const phase = this.simulationTime * (.34 + (index % 3) * .035) + index * 1.7;
          post.x = post.home.x + Math.cos(phase) * 90;
          post.y = post.home.y + Math.sin(phase * .83) * 70;
        }
        this.place(post.container, post.x, post.y, 35);
      }
      post.cooldown = Math.max(0, post.cooldown - dt);
      let target: EnemyEntity | null = null;
      let best = post.range ** 2;
      for (const enemy of this.enemies) {
        if (!enemy.isRaid || !enemy.alive || enemy.state === 'defeat') continue;
        const distance = distanceSquared(enemy.x, enemy.y, post.x, post.y);
        if (distance < best) { best = distance; target = enemy; }
      }
      if (!target) continue;
      const fromX = isoX(post.x, post.y) + post.aim.x;
      const fromY = isoY(post.x, post.y) - post.height;
      const toX = isoX(target.x, target.y);
      const toY = isoY(target.x, target.y) - 25;
      post.aim.rotation = Math.atan2(toY - fromY, toX - fromX);
      if (post.cooldown > 0) continue;
      post.cooldown = post.cadence;
      post.lastShot = this.simulationTime;
      this.defenseShots += 1;
      const shot = this.particlePool.acquire();
      shot.moveTo(-12, 0).lineTo(10, 0).stroke({ color: post.projectile === 'turret' ? 0xffc36b : 0xf7edd0, width: post.projectile === 'turret' ? 4 : 2 });
      if (post.projectile !== 'turret') shot.moveTo(5, -4).lineTo(13, 0).lineTo(5, 4).stroke({ color: 0xe7fcff, width: 2 });
      shot.position.set(fromX, fromY);
      shot.rotation = post.aim.rotation;
      shot.zIndex = depth(post.x, post.y, 320);
      this.effects.addChild(shot);
      const duration = post.projectile === 'turret' ? .07 : .16;
      this.particles.push({ graphic: shot, x: fromX, y: fromY, vx: (toX - fromX) / duration, vy: (toY - fromY) / duration, life: duration, maxLife: duration, worldSpace: true });
      this.damageEnemy(target, post.damage, true);
    }
  }

  private finishRaid(heldAtGate: boolean): void {
    const cashLost = this.raidCashLost;
    for (const enemy of this.enemies) {
      if (enemy.isRaid && enemy.alive) { enemy.alive = false; enemy.container.visible = false; }
    }
    this.raidState = 'cooldown';
    this.raidTimer = ECONOMY.raidCooldown;
    this.gateHealth = this.gateMaxHealth();
    this.callbacks.raid(null);
    if (heldAtGate) {
      this.save.stats.raidsWon += 1;
      const reward = raidProfileFor(this.raidWave).reward;
      for (let index = 0; index < 4; index += 1) this.createCashDrop(Math.floor(reward / 4) + (index < reward % 4 ? 1 : 0));
      this.callbacks.toast(`Wave ${this.raidWave} repelled · $${reward} defense bonus waiting`);
      this.audio.play('upgrade');
    } else {
      this.callbacks.toast(cashLost > 0
        ? `Breach contained · $${cashLost} in banked profit was destroyed`
        : 'Breach contained · The pantry was saved before profit was lost');
      this.audio.play('upgrade', .65);
    }
    this.raidBreached = false;
    this.raidCashLost = 0;
    this.raidFoodHitVisual = 0;
    this.raidBankEmptyShown = false;
    this.requestSave();
  }

  private defeatPlayer(): void {
    if (!this.player.alive) return;
    this.player.alive = false;
    this.player.pendingTarget = null;
    this.setSelectedTarget(null);
    this.player.vx = 0;
    this.player.vy = 0;
    this.player.defeatVisual = 1;
    const loss = applyDeathLoss(this.player.meat, this.player.fish, this.player.meals, this.player.fishMeals, this.player.wood);
    this.player.meat = loss.meat;
    this.player.fish = loss.fish;
    this.player.meals = loss.meals;
    this.player.fishMeals = loss.fishMeals;
    this.player.wood = loss.wood;
    this.save.stats.deaths += 1;
    this.defeatTimer = respawnSecondsFor(this.save.upgrades.infirmary);
    this.player.respawnTimer = this.defeatTimer;
    this.audio.play('defeat');
    this.audio.haptic([45, 50, 70]);
    this.callbacks.defeat(
      loss.lostMeat + loss.lostFish,
      loss.lostMeals + loss.lostFishMeals,
      loss.lostWood,
      this.defeatTimer
    );
    this.requestSave();
  }

  private updateDefeat(dt: number): void {
    this.player.respawnTimer -= dt;
    if (this.player.respawnTimer <= 0) this.respawnPlayer();
  }

  private respawnPlayer(): void {
    this.player.alive = true;
    this.player.x = WORLD.respawn.x;
    this.player.y = WORLD.respawn.y;
    this.player.health = maxHealthFor(this.save.upgrades.maxHealth);
    this.player.spawnProtection = 3;
    this.player.defeatVisual = 0;
    this.player.container.visible = true;
    for (const enemy of this.enemies) {
      if (!enemy.isRaid && enemy.alive) {
        enemy.state = 'idle'; enemy.stateTimer = 1; enemy.alert.visible = false;
        if (distanceSquared(enemy.x, enemy.y, WORLD.respawn.x, WORLD.respawn.y) < 450 ** 2) { enemy.x = enemy.spawn.x; enemy.y = enemy.spawn.y; }
      }
    }
    this.callbacks.respawn();
    this.audio.play('respawn');
    this.spawnBurst(this.player.x, this.player.y, BRAND.colors.safe, 18);
    this.requestSave();
  }

  /**
   * The opening teaches timber, not hunting: move, chop, gather logs, sell them,
   * spend the takings. Only then does it point the player at the frostwild.
   */
  private updateTutorial(): void {
    const step = this.save.tutorial;
    if (step === 'move' && distanceSquared(this.player.x, this.player.y, WORLD.respawn.x, WORLD.respawn.y) > 95 ** 2) this.advanceTutorial('hunt');
    else if (step === 'hunt' && this.save.stats.woodChopped > 0) this.advanceTutorial('collect');
    else if (step === 'collect' && this.player.wood > 0) this.advanceTutorial('deliver');
    else if (step === 'deliver' && this.save.stats.woodSold > 0) this.advanceTutorial('cash');
    else if (step === 'cash' && UPGRADES.some(upgrade => this.save.upgrades[upgrade.id] > 0)) this.advanceTutorial('upgrade');
    else if (step === 'upgrade' && this.save.stats.mealsSold > 0) this.advanceTutorial('complete');
    if (this.save.tutorial === 'complete') {
      const frontier = this.unlockPads.find(pad => pad.kind === 'zone2')!;
      const shoreline = this.unlockPads.find(pad => pad.kind === 'dock')!;
      const text = !this.save.unlocks.zone2 ? `Eastern Frontier · Deliver ${frontier.requires - frontier.delivered} more logs`
        : !this.save.unlocks.dock ? `Open the shoreline · Deliver ${shoreline.requires - shoreline.delivered} more logs`
        : this.save.upgrades.worker === 0 ? 'Hire a meal-delivery cook at the Cook pad'
        : !this.save.unlocks.glacier ? `Glacier Reach · Bank $${ECONOMY.glacierCost} to open the pass`
        : !this.save.unlocks.whiteout ? `Whiteout Expanse · Bank $${ECONOMY.whiteoutCost} to open the pass`
        : 'Master the frontier · Upgrade your crew, weapons and defenses';
      if (text !== this.objectiveKey) {
        this.objectiveKey = text;
        this.callbacks.objective('complete', text);
      }
    }
  }

  private onActualEvent(event: 'deliver' | 'cash' | 'upgrade' | 'chop'): void {
    if (event === 'chop' && this.save.tutorial === 'hunt') this.advanceTutorial('collect');
    if (event === 'cash' && this.save.tutorial === 'deliver') this.advanceTutorial('cash');
    if (event === 'upgrade' && this.save.tutorial === 'cash') this.advanceTutorial('upgrade');
  }

  private advanceTutorial(step: TutorialStep): void {
    this.save.tutorial = step;
    this.callbacks.objective(step, TUTORIAL_TEXT[step]);
    this.audio.play('upgrade', .55);
    this.requestSave();
  }

  private spawnBurst(x: number, y: number, color: number, count: number): void {
    const actualCount = this.save.settings.quality === 'low' ? Math.ceil(count * .55) : count;
    for (let index = 0; index < actualCount; index += 1) {
      const graphic = this.particlePool.acquire();
      const radius = 2 + Math.random() * 4;
      if (Math.random() < 0.4) graphic.moveTo(0, -radius).lineTo(radius, 0).lineTo(0, radius).lineTo(-radius, 0).closePath().fill({ color, alpha: .9 });
      else graphic.circle(0, 0, radius).fill({ color, alpha: .9 });
      // Particles live in projected screen space around the burst origin.
      const origin = { x: isoX(x, y), y: isoY(x, y) };
      graphic.position.set(origin.x, origin.y);
      graphic.zIndex = depth(x, y, 200);
      this.effects.addChild(graphic);
      const angle = Math.random() * Math.PI * 2;
      const speed = 40 + Math.random() * 135;
      this.particles.push({ graphic, x: origin.x, y: origin.y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed - 45, life: .45 + Math.random() * .35, maxLife: .8, worldSpace: true });
    }
  }

  private streamParticle(fromX: number, fromY: number, toX: number, toY: number, color: number): void {
    const graphic = this.particlePool.acquire();
    graphic.roundRect(-6, -4, 12, 8, 2).fill(color);
    const from = { x: isoX(fromX, fromY), y: isoY(fromX, fromY) };
    const to = { x: isoX(toX, toY), y: isoY(toX, toY) };
    graphic.position.set(from.x, from.y);
    graphic.zIndex = Math.max(depth(fromX, fromY), depth(toX, toY)) + 300;
    this.effects.addChild(graphic);
    const duration = .28;
    this.particles.push({ graphic, x: from.x, y: from.y, vx: (to.x - from.x) / duration, vy: (to.y - from.y) / duration, life: duration, maxLife: duration, worldSpace: true });
  }

  private spawnProjectileTrail(target: EnemyEntity): void {
    const graphic = this.particlePool.acquire();
    graphic.roundRect(-12, -3, 24, 6, 3).fill(0xffbc6c);
    const from = { x: isoX(this.player.x, this.player.y), y: isoY(this.player.x, this.player.y) - 30 };
    const to = { x: isoX(target.x, target.y), y: isoY(target.x, target.y) - 25 };
    graphic.position.set(from.x, from.y);
    graphic.rotation = Math.atan2(to.y - from.y, to.x - from.x);
    graphic.zIndex = depth(this.player.x, this.player.y, 320);
    this.effects.addChild(graphic);
    const duration = .08;
    this.particles.push({ graphic, x: from.x, y: from.y, vx: (to.x - from.x) / duration, vy: (to.y - from.y) / duration, life: duration, maxLife: duration, worldSpace: true });
  }

  private spawnFootprint(): void {
    if (this.save.settings.reducedMotion || this.player.y > 1370) return;
    const graphic = this.particlePool.acquire();
    const offsetX = Math.cos(this.player.facing + Math.PI / 2) * 9 * this.footprintSide;
    const offsetY = Math.sin(this.player.facing + Math.PI / 2) * 9 * this.footprintSide;
    const worldX = this.player.x + offsetX;
    const worldY = this.player.y + offsetY;
    graphic.ellipse(0, 0, 7, 3.5).fill({ color: 0x769cab, alpha: .28 });
    graphic.position.set(isoX(worldX, worldY), isoY(worldX, worldY) + 4);
    graphic.zIndex = depth(this.player.x, this.player.y, -2);
    this.effects.addChild(graphic);
    this.particles.push({ graphic, x: graphic.x, y: graphic.y, vx: 0, vy: 0, life: 3.2, maxLife: 3.2, worldSpace: true });
    this.footprintSide *= -1;
  }

  /** A rising "+N" for earnings, so every sale registers as a reward. */
  private spawnGainLabel(x: number, y: number, text: string, color: number, lift = 62): void {
    const label = this.damagePool.acquire();
    label.text = text;
    label.style.fill = color;
    const screen = { x: isoX(x, y), y: isoY(x, y) - lift };
    label.position.set(screen.x, screen.y);
    label.zIndex = depth(x, y, 520);
    this.effects.addChild(label);
    this.damageLabels.push({ text: label, x: screen.x, y: screen.y, life: .62, maxLife: .62 });
  }

  /** `lift` raises the label in screen pixels above the world point it belongs to. */
  private spawnDamageLabel(x: number, y: number, value: number, color: number, lift = 70): void {
    const text = this.damagePool.acquire();
    text.text = `-${Math.round(value)}`;
    text.style.fill = color;
    const screen = { x: isoX(x, y), y: isoY(x, y) - lift };
    text.position.set(screen.x, screen.y);
    text.zIndex = depth(x, y, 500);
    this.effects.addChild(text);
    this.damageLabels.push({ text, x: screen.x, y: screen.y, life: .72, maxLife: .72 });
  }

  private updateParticles(dt: number): void {
    for (let index = this.particles.length - 1; index >= 0; index -= 1) {
      const particle = this.particles[index]!;
      particle.life -= dt;
      particle.x += particle.vx * dt;
      particle.y += particle.vy * dt;
      if (particle.maxLife < 1) particle.vy += 190 * dt;
      particle.graphic.position.set(particle.x, particle.y);
      particle.graphic.alpha = clamp(particle.life / Math.min(.35, particle.maxLife), 0, 1);
      if (particle.life <= 0) { this.particles.splice(index, 1); this.particlePool.release(particle.graphic); }
    }
    for (let index = this.damageLabels.length - 1; index >= 0; index -= 1) {
      const label = this.damageLabels[index]!;
      label.life -= dt;
      label.y -= 52 * dt;
      label.text.position.set(label.x, label.y);
      label.text.alpha = clamp(label.life / .25, 0, 1);
      if (label.life <= 0) { this.damageLabels.splice(index, 1); this.damagePool.release(label.text); }
    }
  }

  private render(frameDelta: number): void {
    this.updateCamera(false);
    this.renderPlayer();
    this.renderEnemies();
    this.renderTrees();
    this.renderStations();
    this.renderDock();
    this.renderSnow(frameDelta);
    this.renderTutorialArrow();
    this.refreshPadVisuals();
  }

  /** Gives every axe impact a short, readable bend without rebuilding geometry. */
  private renderTrees(): void {
    for (const tree of this.trees) {
      if (!tree.alive) continue;
      const struck = this.simulationTime < tree.shakeUntil;
      const kick = struck ? Math.sin((tree.shakeUntil - this.simulationTime) * 95) : 0;
      tree.crown.x = moveToward(tree.crown.x, kick * 5, 1.8);
      tree.crown.rotation = moveToward(tree.crown.rotation, kick * 0.035, 0.016);
    }
  }

  private renderDock(): void {
    if (!this.save.unlocks.dock) return;
    const bobbing = this.fishCatchProgress > 0;
    const bobY = bobbing ? Math.sin(this.simulationTime * 22) * 5 : Math.sin(this.simulationTime * 1.6) * 3;
    const restY = this.dockAnchor.y + 78;
    this.dockBobber.position.set(this.dockAnchor.x, restY + bobY);
    this.dockBobber.scale.set(bobbing ? 1.2 : 1);
    this.dockLine.clear()
      .moveTo(this.dockAnchor.x, this.dockAnchor.y)
      .lineTo(this.dockAnchor.x, restY + bobY)
      .stroke({ color: BRAND.colors.outline, width: 2, alpha: 0.6 });
  }

  /** Closest standing tree to the player, or null when every one nearby is felled. */
  private nearestTree(): Vec2 | null {
    let best: TreeEntity | null = null;
    let bestDistance = Infinity;
    for (const tree of this.trees) {
      if (!tree.alive) continue;
      const distance = distanceSquared(this.player.x, this.player.y, tree.x, tree.y);
      if (distance < bestDistance) { bestDistance = distance; best = tree; }
    }
    return best ? { x: best.x, y: best.y } : null;
  }

  private renderTutorialArrow(): void {
    const step = this.save.tutorial;
    this.tutorialArrow.visible = step !== 'complete';
    if (!this.tutorialArrow.visible) return;
    let target: Vec2;
    if (step === 'move') target = { x: this.player.x + 80, y: this.player.y - 80 };
    else if (step === 'hunt') {
      // Point at the nearest standing tree — timber is the opening income.
      target = this.nearestTree() ?? { x: this.player.x, y: this.player.y };
    } else if (step === 'collect') {
      const drop = this.cargoDrops[0];
      target = drop ? { x: drop.x, y: drop.y } : (this.nearestTree() ?? { x: this.player.x, y: this.player.y });
    } else if (step === 'deliver') target = { x: WORLD.timberPost.x, y: WORLD.timberPost.y };
    else if (step === 'upgrade') {
      // Teach every physical handoff in the hospitality route.
      const enemy = this.enemies.find(item => item.alive && !item.isRaid);
      if (this.player.meat > 0) target = { x: WORLD.butcherInput.x, y: WORLD.butcherInput.y };
      else if (this.save.station.meals > 0) target = { x: WORLD.butcherOutput.x, y: WORLD.butcherOutput.y };
      else if (this.save.station.rawMeat > 0) target = { x: WORLD.butcher.x, y: WORLD.butcher.y };
      else if (this.player.meals > 0) target = { x: WORLD.servePad.x, y: WORLD.servePad.y };
      else target = enemy ? { x: enemy.x, y: enemy.y } : { x: 2060, y: 600 };
    }
    else {
      // Point at whichever plate the player can actually afford right now.
      const affordable = this.upgradePads.find(pad =>
        pad.container.visible && this.save.cash >= upgradeCost(pad.id, this.save.upgrades[pad.id]));
      const plate = affordable ?? this.upgradePads.find(pad => pad.container.visible);
      target = plate ? { x: plate.x, y: plate.y } : { x: PAD_SLOTS[0]!.x, y: PAD_SLOTS[0]!.y };
    }
    this.place(this.tutorialArrow, target.x, target.y, 2000);
    // The arrow hovers above its target in screen space rather than drifting along a world axis.
    this.tutorialArrow.y -= 96 - Math.sin(this.simulationTime * 5) * 10;
    this.tutorialArrow.rotation = 0;
  }

  private updateCamera(immediate: boolean): void {
    const screenWidth = this.app.screen.width;
    const screenHeight = this.app.screen.height;
    const halfWidth = screenWidth / (2 * this.viewScale);
    const halfHeight = screenHeight / (2 * this.viewScale);
    // The camera tracks the player in projected space and clamps to the world diamond's bounds.
    const focusX = isoX(this.player.x, this.player.y);
    const focusY = isoY(this.player.x, this.player.y) - 30;
    const spanX = ISO_BOUNDS.maxX - ISO_BOUNDS.minX;
    const spanY = ISO_BOUNDS.maxY - ISO_BOUNDS.minY;
    const targetX = spanX <= halfWidth * 2
      ? (ISO_BOUNDS.minX + ISO_BOUNDS.maxX) / 2
      : clamp(focusX, ISO_BOUNDS.minX + halfWidth, ISO_BOUNDS.maxX - halfWidth);
    const targetY = spanY <= halfHeight * 2
      ? (ISO_BOUNDS.minY + ISO_BOUNDS.maxY) / 2
      : clamp(focusY, ISO_BOUNDS.minY + halfHeight, ISO_BOUNDS.maxY - halfHeight);
    const smoothing = immediate ? 1 : 1 - Math.exp(-9 * Math.min(.05, WORLD.fixedStep));
    this.camera.x += (targetX - this.camera.x) * smoothing;
    this.camera.y += (targetY - this.camera.y) * smoothing;
    this.camera.shake = Math.max(0, this.camera.shake - 32 * WORLD.fixedStep);
    const shakeX = this.camera.shake > 0 ? (Math.random() * 2 - 1) * this.camera.shake : 0;
    const shakeY = this.camera.shake > 0 ? (Math.random() * 2 - 1) * this.camera.shake : 0;
    const worldX = screenWidth / 2 - (this.camera.x + shakeX) * this.viewScale;
    const worldY = screenHeight / 2 - (this.camera.y + shakeY) * this.viewScale;
    this.world.scale.set(this.viewScale);
    this.effects.scale.set(this.viewScale);
    this.world.position.set(worldX, worldY);
    this.effects.position.set(worldX, worldY);
  }

  private renderPlayer(): void {
    const player = this.player;
    this.place(player.container, player.x, player.y, 120);
    const movement = Math.hypot(player.vx, player.vy);
    const moving = movement > 20 && player.alive;
    const stride = moving && !this.save.settings.reducedMotion ? this.simulationTime * 10.5 : 0;
    const stepLift = moving ? Math.abs(Math.sin(stride)) : 0;
    const stepSway = moving ? Math.sin(stride) : 0;
    const landing = moving ? Math.pow(1 - stepLift, 5) : 0;
    // A step rises from and returns to the contact point; it never dips below the
    // ground plane like the old sine bob, which made the illustrated actor hover.
    player.body.position.set(stepSway * 1.8, -stepLift * 4.5);
    player.pack.y = -74 - stepLift * 4.5;
    player.shadow.scale.set(1 - stepLift * .07, 1 + stepLift * .035);
    const facingLeft = facesLeft(Math.cos(player.facing), Math.sin(player.facing));
    const facingScale = facingLeft ? -1 : 1;
    const idleBreath = !moving && player.alive && !this.save.settings.reducedMotion ? Math.sin(this.simulationTime * 2.4) * .008 : 0;
    player.body.scale.set(facingScale * (1 + landing * .018), 1 - landing * .035 + idleBreath);
    player.pack.scale.x = facingLeft ? -1 : 1;
    const cargoColumns = Number(player.meat + player.fish > 0) + Number(player.meals + player.fishMeals > 0) + Number(player.wood > 0);
    const packOffset = 30 + Math.max(0, cargoColumns - 1) * 17;
    player.pack.x = facingLeft ? packOffset : -packOffset;
    const cargoLoad = clamp((player.meat + player.fish + player.meals + player.fishMeals + player.wood) / 12, 0, 1);
    player.body.rotation = -cargoLoad * 0.1 + stepSway * .026;
    const weaponTier = this.save.upgrades.weaponTier;
    const magazine = weaponMagazineFor(weaponTier);
    player.ammoText.visible = player.alive && magazine > 0;
    if (player.ammoText.visible) player.ammoText.text = player.reloadTimer > 0
      ? `RELOADING ${player.reloadTimer.toFixed(1)}s`
      : `${player.ammo} / ${magazine}`;
    const attackPhase = player.attackVisual > 0 ? 1 - player.attackVisual / .26 : 0;
    const chopPhase = player.chopVisual > 0 ? 1 - player.chopVisual / .3 : 0;
    const mainWeaponIsChopping = weaponTier === 1 && player.chopVisual > 0;
    const mainSwingPhase = mainWeaponIsChopping ? chopPhase : attackPhase;
    if (weaponTier >= WEAPON_RANGED_TIER) {
      // The bolt gun recoils instead of swinging like a blade.
      player.weapon.rotation = -.18 + (player.attackVisual > 0 ? Math.sin(attackPhase * Math.PI) * -.12 : 0);
    } else {
      player.weapon.rotation = player.attackVisual > 0 || mainWeaponIsChopping
        ? -1.85 + Math.sin(mainSwingPhase * Math.PI) * 2.55
        : -.18;
    }
    player.weapon.scale.x = facingLeft ? -1 : 1;
    const recoil = weaponTier >= WEAPON_RANGED_TIER && player.attackVisual > 0 ? Math.sin(attackPhase * Math.PI) * 5 : 0;
    player.weapon.x = (facingLeft ? -12 : 12) + (facingLeft ? recoil : -recoil);
    player.weapon.y = -5;
    // A dedicated work axe occupies the free hand only while chopping. If the
    // Trailwarden's equipped weapon is already the Trail Axe, that same weapon swings.
    player.chopAxe.visible = player.alive && player.chopVisual > 0 && weaponTier !== 1;
    if (player.chopAxe.visible) {
      player.chopAxe.scale.x = facingLeft ? -1 : 1;
      player.chopAxe.x = facingLeft ? 19 : -19;
      player.chopAxe.y = -3;
      player.chopAxe.rotation = -1.75 + Math.sin(chopPhase * Math.PI) * 2.7;
    }
    player.body.tint = player.hurtVisual > 0 && Math.floor(player.hurtVisual * 30) % 2 === 0 ? 0xff7777 : 0xffffff;
    player.protectionAura.visible = player.alive && player.spawnProtection > 0;
    if (player.protectionAura.visible) {
      const pulse = 1 + Math.sin(this.simulationTime * 10) * 0.08;
      player.protectionAura.scale.set(pulse);
      player.protectionAura.alpha = 0.55 + Math.sin(this.simulationTime * 10) * 0.25;
    }
    if (!player.alive) {
      player.container.rotation = moveToward(player.container.rotation, Math.PI / 2, .1);
      player.container.alpha = .75;
    } else {
      player.container.rotation = moveToward(player.container.rotation, 0, .2);
      player.container.alpha = 1;
    }
    this.drawPlayerCargo();
    this.updateHealthBar(player, player.healthBar, player.health, maxHealthFor(this.save.upgrades.maxHealth), player.spawnProtection > 0 ? BRAND.colors.safe : 0x65d18b, 68);
  }

  private drawPlayerCargo(): void {
    // Rebuilding this stack every frame churned geometry and child objects; the
    // silhouette only changes when the carried counts do.
    const key = `${this.player.meat}|${this.player.fish}|${this.player.meals}|${this.player.fishMeals}|${this.player.wood}`;
    if (key === this.player.cargoKey) return;
    this.player.cargoKey = key;
    const graphic = this.player.pack;
    graphic.clear();
    const total = this.player.meat + this.player.fish + this.player.meals + this.player.fishMeals + this.player.wood;
    if (total <= 0) return;
    type CargoSlice = 'meat' | 'fish' | 'meal' | 'fishMeal' | 'wood';
    const raw: CargoSlice[] = [
      ...Array<CargoSlice>(this.player.meat).fill('meat'),
      ...Array<CargoSlice>(this.player.fish).fill('fish')
    ];
    const cooked: CargoSlice[] = [
      ...Array<CargoSlice>(this.player.meals).fill('meal'),
      ...Array<CargoSlice>(this.player.fishMeals).fill('fishMeal')
    ];
    const timber: CargoSlice[] = Array<CargoSlice>(this.player.wood).fill('wood');
    // Raw provisions, plated meals, and logs each get a distinct column. The column
    // centers are derived from the occupied count: one sits dead center, two straddle
    // center evenly, and three resolve to left / center / right.
    const stacks = [raw, cooked, timber].filter(stack => stack.length > 0);
    const spacing = stacks.length === 2 ? 25 : 22;
    const width = stacks.length === 1 ? 19 : stacks.length === 2 ? 14 : 12;
    for (let stackIndex = 0; stackIndex < stacks.length; stackIndex += 1) {
      const stack = stacks[stackIndex]!;
      const centerX = (stackIndex - (stacks.length - 1) / 2) * spacing;
      const step = clamp(12.5 - stack.length * 0.16, 4.5, 12.5);
      const slice = Math.max(4.5, step * .92);
      for (let index = 0; index < stack.length; index += 1) {
        const kind = stack[index]!;
        const y = -index * step;
        const lean = Math.sin(index * .9 + stackIndex * 1.7) * 1.8;
        const x = centerX + lean;
        if (kind === 'wood') {
          graphic.roundRect(x - width, y - slice / 2, width * 2, slice, Math.min(5, slice / 2))
            .fill(index % 2 === 0 ? BRAND.colors.timber : shade(BRAND.colors.timber, .12))
            .stroke({ color: BRAND.colors.outline, width: 1.7 });
          graphic.ellipse(x + width * .72, y, Math.min(4, slice * .48), slice * .4).fill(0xd9ab74);
        } else if (kind === 'fishMeal') {
          graphic.ellipse(x, y, width, slice * .52).fill(0xffedc4).stroke({ color: BRAND.colors.outline, width: 1.7 });
          graphic.ellipse(x, y - 1, width * .58, slice * .25).fill(BRAND.colors.fish);
        } else if (kind === 'meal') {
          graphic.ellipse(x, y, width, slice * .52).fill(0xffedc4).stroke({ color: BRAND.colors.outline, width: 1.7 });
          graphic.roundRect(x - width * .58, y - slice * .35, width * 1.16, slice * .48, 3).fill(BRAND.colors.ember);
        } else if (kind === 'fish') {
          graphic.ellipse(x, y, width, slice * .5).fill(BRAND.colors.fish).stroke({ color: 0x276a77, width: 1.8 });
        } else {
          graphic.roundRect(x - width, y - slice / 2, width * 2, slice, Math.min(6, slice / 2))
            .fill(index % 2 === 0 ? BRAND.colors.meat : shade(BRAND.colors.meat, -.12))
            .stroke({ color: 0x8d3b38, width: 1.7 });
        }
      }
    }
  }

  private renderEnemies(): void {
    for (const enemy of this.enemies) {
      if (!enemy.container.visible) continue;
      this.place(enemy.container, enemy.x, enemy.y, 40);
      const facingLeft = facesLeft(Math.cos(enemy.facing), Math.sin(enemy.facing));
      const facingScale = facingLeft ? -1 : 1;
      const locomoting = Math.hypot(enemy.vx, enemy.vy) > 8 && enemy.state !== 'windup' && enemy.state !== 'attack' && enemy.state !== 'hurt' && enemy.state !== 'defeat';
      const stride = locomoting && !this.save.settings.reducedMotion ? this.simulationTime * (enemy.kind === 'icehorn' ? 8.2 : 9.4) + enemy.id * .7 : 0;
      const lift = locomoting ? Math.abs(Math.sin(stride)) : 0;
      const sway = locomoting ? Math.sin(stride) : 0;
      const landing = locomoting ? Math.pow(1 - lift, 5) : 0;
      enemy.body.position.set(sway * 1.5, -lift * (enemy.kind === 'icehorn' ? 3.4 : 4.2));
      enemy.body.rotation = sway * .018;
      enemy.body.scale.set(facingScale * (1 + landing * .014), 1 - landing * .03);
      enemy.shadow.scale.set(1 - lift * .065, 1 + lift * .035);
      if (enemy.state === 'windup') {
        const windup = 1 - clamp(enemy.stateTimer / enemy.config.windup, 0, 1);
        enemy.body.scale.set(facingScale * (1 + windup * .16), 1 - windup * .18);
        enemy.body.tint = 0xffc08c;
      } else if (enemy.state === 'attack') {
        enemy.body.scale.set(facingScale * 1.18, .92);
        enemy.body.tint = 0xffffff;
      } else if (enemy.state === 'hurt') {
        enemy.body.tint = Math.floor(enemy.stateTimer * 50) % 2 ? 0xff6a63 : 0xffffff;
      } else if (enemy.state === 'defeat') {
        const progress = clamp(enemy.stateTimer / .9, 0, 1);
        enemy.container.rotation = (1 - progress) * (facingLeft ? -.65 : .65);
        enemy.container.alpha = progress;
        enemy.body.tint = 0xb9cfda;
      } else {
        enemy.body.tint = 0xffffff;
        enemy.container.rotation = 0;
        enemy.container.alpha = Math.min(1, enemy.container.alpha + .05);
      }
      this.updateHealthBar(enemy, enemy.healthBar, enemy.health, enemy.config.health, enemy.kind === 'icehorn' ? 0x58c6dc : 0xe66b63, 80 * enemy.config.scale);
    }
  }

  private drawHealthBar(graphic: Graphics, value: number, max: number, color: number, width: number): void {
    graphic.clear();
    graphic.roundRect(-width / 2, -5, width, 11, 5).fill({ color: 0x0c2b3a, alpha: .88 });
    const ratio = clamp(value / max, 0, 1);
    if (ratio > 0) graphic.roundRect(-width / 2 + 2, -3, (width - 4) * ratio, 7, 4).fill(color);
  }

  /** Repaints a health bar only when its displayed state actually changed. */
  private updateHealthBar(owner: { healthKey: string }, graphic: Graphics, value: number, max: number, color: number, width: number): void {
    const key = `${Math.round(value)}|${max}|${color}`;
    if (key === owner.healthKey) return;
    owner.healthKey = key;
    this.drawHealthBar(graphic, value, max, color, width);
  }

  private renderStations(): void {
    for (const post of this.defenders) post.flash.visible = defenseTierFor(this.save.upgrades.defense).kind === 'turret' && this.simulationTime - post.lastShot < .08;
    const level = this.save.upgrades.furnace;
    const radius = warmRadiusFor(level);
    // A world-space circle of radius R projects to an ellipse of R by R/2.
    // Only redrawn when a furnace upgrade actually changes the radius.
    if (radius !== this.warmRingRadius) {
      this.warmRingRadius = radius;
      this.station.warmRing.clear()
        .ellipse(0, 0, radius, radius / 2).fill({ color: BRAND.colors.safe, alpha: .08 })
        .ellipse(0, 0, radius, radius / 2).stroke({ color: BRAND.colors.safe, alpha: .65, width: 3 })
        .ellipse(0, 0, radius - 9, (radius - 9) / 2).stroke({ color: 0xe7ffe9, alpha: .25, width: 1.5 });
      for (const offset of [-1, 1]) {
        this.station.warmRing.roundRect(offset * (radius - 28) - 3, -9, 6, 18, 2)
          .roundRect(offset * (radius - 28) - 9, -3, 18, 6, 2).fill({ color: 0xdaffe4, alpha: .85 });
      }
    }
    this.station.warmRing.alpha = this.healing && !this.save.settings.reducedMotion ? .85 + Math.sin(this.simulationTime * 3) * .15 : .8;
    const flamePulse = 1 + Math.sin(this.simulationTime * 8) * .08;
    this.station.furnaceFlame.scale.set(flamePulse, 1 / flamePulse);
    this.station.furnaceGlow.scale.set(1 + level * .12);
    for (let index = 0; index < this.station.workerVisuals.length; index += 1) {
      const worker = this.station.workerVisuals[index]!;
      worker.visible = index <= this.save.upgrades.worker;
      worker.pivot.y = Math.sin(this.simulationTime * 6 + index) * 2;
      worker.rotation = Math.sin(this.simulationTime * 4 + index) * .025;
    }
    this.drawProgressRing(this.station.butcherProgress, this.save.station.butcherProgress, BRAND.colors.ember, 34);
    this.station.butcherStock.text = `RAW ${this.save.station.rawMeat}`;
    if (this.mealPileKey !== this.save.station.meals) {
      this.mealPileKey = this.save.station.meals;
      this.drawReadyMealPile(this.station.mealPile, this.save.station.meals, false);
    }
    this.station.mealOutputStock.text = this.save.station.meals > 0
      ? `READY ${this.save.station.meals}  ·  COLLECT HERE`
      : this.save.station.rawMeat > 0 ? `COOKING ${this.save.station.rawMeat}` : 'DROP RAW  →  TAKE MEALS';
    // Tell the player why the queue is standing there when nobody is serving.
    const waitingGuests = this.customers.filter(customer => customer.state === 'waiting' || customer.state === 'arriving').length;
    const frontGuest = this.customers.find(customer => customer.state === 'waiting');
    const hasFrontMeal = frontGuest
      ? this.player.meals > 0 || this.player.fishMeals > 0
      : false;
    this.station.serveHint.text = this.isPlayerServing()
      ? (frontGuest ? (hasFrontMeal ? 'SERVING' : frontGuest.wantsFish ? 'NEED FISH PLATE' : 'NEED COOKED MEAL') : 'WAITING FOR GUESTS')
      : waitingGuests > 0 ? `${waitingGuests} WAITING  ·  SERVE HERE` : 'SERVE COOKED  →  GET CASH';
    const waiting = this.save.station.passiveCash + this.cashDrops.reduce((sum, item) => sum + (distanceSquared(item.x, item.y, WORLD.cashZone.x, WORLD.cashZone.y) < 70 ** 2 ? item.value : 0), 0);
    this.station.cashStock.text = waiting > 0 ? `$${waiting}` : '';
    if (this.lumberPileKey !== this.save.station.lumber) {
      this.lumberPileKey = this.save.station.lumber;
      this.station.lumberStock.text = `LOGS ${this.save.station.lumber} / 300`;
      this.drawLumberYard(this.station.lumberPile, this.save.station.lumber);
    }
    this.drawProgressRing(this.station.fishProgress, this.save.station.fishProgress, BRAND.colors.fish, 34);
    this.station.fishStock.text = `FISH ${this.save.station.rawFish} · PLATES ${this.save.station.fishMeals}`;
    if (this.fishPileKey !== this.save.station.fishMeals) {
      this.fishPileKey = this.save.station.fishMeals;
      this.station.fishOutputStock.text = `READY ${this.save.station.fishMeals}`;
      this.drawReadyMealPile(this.station.fishPile, this.save.station.fishMeals, true);
    }
    if (this.raidFoodHitVisual > 0 && !this.save.settings.reducedMotion) {
      this.station.mealPile.position.set((Math.random() * 2 - 1) * 7, -18 + (Math.random() * 2 - 1) * 4);
      this.station.mealPile.tint = 0xff746d;
    } else {
      this.station.mealPile.position.set(0, -18);
      this.station.mealPile.tint = 0xffffff;
    }
    this.drawProgressRing(this.station.dockProgress, this.fishCatchProgress, 0x8af4ea, 37);
    const gateMax = this.gateMaxHealth();
    const gateRatio = clamp(this.gateHealth / gateMax, 0, 1);
    const gateColor = gateRatio <= .42 ? BRAND.colors.danger : gateRatio <= .7 ? 0xf18454 : 0xffaf62;
    const gateKey = `${Math.round(this.gateHealth)}|${gateMax}|${gateColor}|${this.raidBreached}`;
    if (gateKey !== this.gateBarKey) {
      this.gateBarKey = gateKey;
      this.drawHealthBar(this.station.gateBar, this.gateHealth, gateMax, gateColor, 150);
      if (this.raidBreached) {
        this.station.gateBar.moveTo(-72, -9).lineTo(72, 9).moveTo(-72, 9).lineTo(72, -9)
          .stroke({ color: BRAND.colors.danger, width: 5, alpha: .95 });
      }
    }
    if (this.raidState === 'active') {
      this.station.compoundGate.container.tint = this.raidBreached
        ? (Math.floor(this.simulationTime * 7) % 2 === 0 ? 0xff716a : 0xc85852)
        : gateRatio < 0.45 && Math.floor(this.simulationTime * 8) % 2 === 0 ? 0xff9184 : shade(0xffffff, -(1 - gateRatio) * 0.3);
    } else if (this.station.compoundGate.container.tint !== 0xffffff) {
      this.station.compoundGate.container.tint = 0xffffff;
    }
  }

  /** A compact physical stack: additional stock adds rows until the top display cap. */
  private drawReadyMealPile(graphic: Graphics, amount: number, fish: boolean): void {
    graphic.clear();
    // The Cookout keeps a permanent slatted profit crate under its finished food,
    // giving breached raiders a readable physical target even between batches.
    if (!fish) {
      graphic.roundRect(-28, -8, 56, 14, 4).fill(0x76503a).stroke({ color: BRAND.colors.outline, width: 2.2 });
      graphic.moveTo(-16, -8).lineTo(-16, 6).moveTo(0, -8).lineTo(0, 6).moveTo(16, -8).lineTo(16, 6)
        .stroke({ color: 0xb37b50, width: 2, alpha: .8 });
    }
    const visible = Math.min(12, amount);
    for (let index = 0; index < visible; index += 1) {
      const row = Math.floor(index / 4);
      const rowCount = Math.min(4, visible - row * 4);
      const column = index % 4;
      const x = (column - (rowCount - 1) / 2) * 15;
      const y = -row * 9 - Math.abs(column - (rowCount - 1) / 2) * 1.5;
      graphic.ellipse(x, y, 12, 5.5).fill(0xffedc4).stroke({ color: BRAND.colors.outline, width: 1.5 });
      if (fish) {
        graphic.ellipse(x, y - 1.5, 7, 2.8).fill(BRAND.colors.fish);
      } else {
        graphic.roundRect(x - 6, y - 4.5, 12, 6, 2.5).fill(index % 2 ? 0xd77b3e : BRAND.colors.ember);
      }
    }
  }

  /** Three separate stacks fill to 100 in order; every stored log changes the silhouette. */
  private drawLumberYard(graphic: Graphics, amount: number): void {
    graphic.clear();
    const illustrated = graphic.label === 'illustrated-rack';
    const logWidth = illustrated ? 4.1 : 7.4;
    const rowHeight = illustrated ? 2.8 : 4.5;
    for (let pile = 0; pile < 3; pile += 1) {
      const stored = clamp(amount - pile * 100, 0, 100);
      const baseX = (pile - 1) * (illustrated ? 48 : 53);
      for (let index = 0; index < stored; index += 1) {
        const row = Math.floor(index / 10);
        const column = index % 10;
        const x = baseX + (column - 4.5) * (illustrated ? 3.2 : 4.7);
        const y = -row * rowHeight - (column % 2) * .4;
        graphic.roundRect(x - logWidth / 2, y - rowHeight / 2, logWidth, rowHeight, 1.3)
          .fill(index % 2 ? 0xb77943 : 0x956039).stroke({ color: BRAND.colors.outline, width: .45 });
        graphic.circle(x + logWidth * .3, y, illustrated ? .7 : 1.2).fill(0xe0b27b);
      }
      if (stored > 0 && !illustrated) graphic.roundRect(baseX - 20, -Math.ceil(stored / 10) * 4.5 - 8, 40, 5, 2)
        .fill({ color: BRAND.colors.snowHighlight, alpha: .72 });
    }
  }

  private drawProgressRing(graphic: Graphics, progress: number, color: number, radius: number): void {
    graphic.clear();
    if (progress <= 0) return;
    graphic.circle(0, 0, radius).stroke({ color: 0x12384a, width: 8, alpha: .65 });
    graphic.arc(0, 0, radius, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * clamp(progress, 0, 1)).stroke({ color, width: 8 });
  }

  private renderSnow(frameDelta: number): void {
    const width = this.app.screen.width;
    const height = this.app.screen.height;
    for (const item of this.snowflakes) {
      const flake = item.graphic;
      flake.y += item.speed * frameDelta;
      flake.x += Math.sin(this.simulationTime * .6 + flake.y * .01) * item.drift * frameDelta;
      if (flake.y > height + 10) { flake.y = -10; flake.x = Math.random() * width; }
      if (flake.x > width + 10) flake.x = -10;
      if (flake.x < -10) flake.x = width + 10;
    }
  }

  /**
   * Announces plates that have just become available. Gate predicates are only
   * re-evaluated when the underlying progress actually moves.
   */
  private checkPadUnlocks(): void {
    const stats = this.save.stats;
    const levels = UPGRADES.reduce((sum, config) => sum + this.save.upgrades[config.id], 0);
    const signature = `${stats.mealsSold}|${stats.bearsDefeated}|${stats.deaths}|${stats.raidsWon}|${this.save.unlocks.zone2}|${this.save.unlocks.dock}|${this.save.unlocks.glacier}|${this.save.unlocks.whiteout}|${this.save.unlocks.raidSeen}|${levels}`;
    if (signature === this.padGateSignature) return;
    const firstEvaluation = this.padGateSignature === '';
    this.padGateSignature = signature;

    // Announce upgrades whose gate has just opened, then re-stock the slots.
    for (const id of PAD_PRIORITY) {
      if (!isUpgradeAvailable(id, this.save) || this.revealedPads.has(id)) continue;
      this.revealedPads.add(id);
      // On the first frame of an existing save, adopt the state silently.
      if (firstEvaluation) continue;
      const config = UPGRADE_BY_ID[id];
      this.callbacks.toast(`New plate available · ${config.label}`);
      this.audio.play('upgrade', .6);
    }
    this.resolvePadSlots();
  }

  private refreshPadVisuals(): void {
    this.checkPadUnlocks();
    for (const pad of this.upgradePads) {
      if (!pad.container.visible) continue;
      const config = UPGRADE_BY_ID[pad.id];
      const level = this.save.upgrades[pad.id];
      const maxed = level >= config.maxLevel;
      const cost = maxed ? 0 : upgradeCost(pad.id, level);
      const affordable = this.save.cash >= cost - pad.paid;
      const category = CATEGORY_COLORS[UPGRADE_CATEGORY[pad.id]];
      const state = maxed ? 'maxed' : affordable ? 'affordable' : 'locked';
      const price = maxed ? 'MAX' : `$${cost - pad.paid}`;
      const name = `${config.label.toUpperCase()}${level > 0 ? ` ${level}` : ''}`;
      // Plate geometry only rebuilds when the pad's appearance actually changes.
      const key = `${pad.id}|${state}|${price}|${name}|${level}`;
      if (key !== pad.paintKey) {
        pad.paintKey = key;
        // Plates that evolve (the Armory) advertise what the next purchase grants.
        pad.icon.text = config.iconForLevel?.(level) ?? config.icon;
        pad.title.text = name;
        pad.detail.text = price;
        paintUpgradePlate(pad.plate, 40, 37, state, category);
        pad.container.alpha = maxed ? .62 : 1;
      }
      this.drawPadProgress(pad.progress, pad.paid / Math.max(1, cost), 40, 37);
    }
    for (const pad of this.unlockPads) {
      const unlocked = this.save.unlocks[pad.kind];
      const available = this.unlockPrerequisiteMet(pad.kind);
      const target = pad.payment === 'wood' ? pad.requires : pad.cost;
      const progress = pad.payment === 'wood' ? pad.delivered : pad.paid;
      const remaining = Math.max(0, target - progress);
      // A plate glows as soon as the player has the resource it can stream in.
      const hasPayment = pad.payment === 'wood' ? this.player.wood > 0 : this.save.cash > 0;
      const state = unlocked ? 'maxed' : hasPayment ? 'affordable' : 'locked';
      const label = unlocked ? 'OPEN' : pad.payment === 'wood' ? 'BRING LOGS' : 'PAY CASH';
      const key = `${state}|${label}|${remaining}`;
      if (key !== pad.paintKey) {
        pad.paintKey = key;
        pad.detail.text = unlocked ? '✓' : '⚒';
        pad.badgeCount.text = pad.payment === 'wood' ? `${remaining}` : `$${remaining}`;
        paintResourceBadge(pad.badge, 0, pad.payment, 13);
        paintUpgradePlate(pad.plate, 48, 43, state, BRAND.colors.gold);
        this.drawPadProgress(pad.progress, progress / Math.max(1, target), 48, 43);
      }
      pad.container.visible = available && !unlocked;
    }
  }

  private drawPadProgress(graphic: Graphics, progress: number, halfWidth: number, halfDepth: number): void {
    const key = `${Math.round(progress * 1000)}|${halfWidth}|${halfDepth}`;
    if (graphic.label === key) return;
    graphic.label = key;
    graphic.clear();
    if (progress <= 0) return;
    const corners = footprint(halfWidth, halfDepth);
    let remaining = clamp(progress, 0, 1) * 4;
    graphic.moveTo(corners[3]!.x, corners[3]!.y);
    for (let i = 0; i < 4 && remaining > 0; i += 1) {
      const from = corners[(i + 3) % 4]!;
      const to = corners[i]!;
      const amount = Math.min(1, remaining);
      graphic.lineTo(from.x + (to.x - from.x) * amount, from.y + (to.y - from.y) * amount);
      remaining -= 1;
    }
    graphic.stroke({ color: BRAND.colors.gold, width: 4, cap: 'round' });
  }

  private refreshWorldState(): void {
    this.station.zoneGate.visible = !this.save.unlocks.zone2;
    this.station.glacierGate.visible = !this.save.unlocks.glacier;
    this.station.whiteoutGate.visible = !this.save.unlocks.whiteout;
    this.station.southGate.visible = !this.save.unlocks.dock;
    this.refreshDefenses();
    this.refreshCompoundVisuals();
    this.refreshGateArmor();
    this.station.fishBuilding.visible = this.save.unlocks.dock;
    this.station.fishDropZone.visible = this.save.unlocks.dock;
    this.station.fishOutput.visible = this.save.unlocks.dock;
    this.station.fishProgress.visible = this.save.unlocks.dock;
    this.station.fishStock.visible = this.save.unlocks.dock;
    this.station.dockProgress.visible = this.save.unlocks.dock;
    this.fisherVisuals.forEach((fisher, index) => { fisher.visible = this.save.unlocks.dock && index < this.save.upgrades.fisher; });
    this.oreRigBuilding.visible = this.save.unlocks.glacier;
    this.oreRigBuilding.alpha = this.save.upgrades.oreRig > 0 ? 1 : .46;
    this.oreCashZone.visible = this.save.unlocks.glacier && this.save.upgrades.oreRig > 0;
    this.robotFoundry.visible = this.save.unlocks.whiteout;
    this.robotFoundry.alpha = this.save.upgrades.robots > 0 ? 1 : .46;
    this.robotVisuals.forEach((robot, index) => { robot.visible = this.save.unlocks.whiteout && index < this.save.upgrades.robots * 2; });
    this.lumberjackVisuals.forEach((worker, index) => { worker.container.visible = index < this.save.upgrades.lumberjack; });
    this.hunterVisuals.forEach((worker, index) => { worker.visible = index < this.save.upgrades.hunters; });
    for (const child of this.world.children) {
      if (child instanceof Container && child !== this.player.container && child.label === 'dock-visual') child.visible = this.save.unlocks.dock;
    }
  }

  private updateHud(): void {
    this.callbacks.hud(
      this.save.cash,
      this.player.meat + this.player.fish,
      this.player.meals + this.player.fishMeals,
      this.player.wood,
      this.player.health,
      maxHealthFor(this.save.upgrades.maxHealth)
    );
    const healing = this.player.alive && this.isPlayerSafe() && this.player.health < maxHealthFor(this.save.upgrades.maxHealth);
    this.callbacks.hint(this.interactionHint(), healing);
  }

  private interactionHint(): InteractionHint | null {
    if (!this.player.alive) return null;
    const nearby = [...this.upgradePads, ...this.unlockPads]
      .filter(pad => pad.container.visible && distanceSquared(this.player.x, this.player.y, pad.x, pad.y) < 155 ** 2)
      .sort((a, b) => distanceSquared(this.player.x, this.player.y, a.x, a.y) - distanceSquared(this.player.x, this.player.y, b.x, b.y))[0];
    if (nearby && 'id' in nearby) {
      const config = UPGRADE_BY_ID[nearby.id];
      const level = this.save.upgrades[nearby.id];
      const effect = (next: number) => nearby.id === 'butcherSpeed'
        ? `${butcherSecondsFor(next, this.save.upgrades.worker).toFixed(2)}s cook`
        : nearby.id === 'weaponDamage' ? `${weaponDamageFor(next, this.save.upgrades.weaponTier)} damage`
        : nearby.id === 'attackSpeed' ? `${attackCadenceFor(next, this.save.upgrades.weaponTier).toFixed(2)}s cadence`
        : config.effectText(next);
      if (level >= config.maxLevel) return { title: `${config.label} · MAX`, detail: config.effectText(level), action: 'Fully upgraded · Compound defenses ready', progress: 1 };
      const cost = upgradeCost(nearby.id, level);
      const remaining = Math.max(0, cost - nearby.paid);
      const onPad = distanceSquared(this.player.x, this.player.y, nearby.x, nearby.y) < 35 ** 2;
      return { title: `${config.label} · Upgrade ${level + 1}/${config.maxLevel}`, detail: `${effect(level)} → ${effect(level + 1)}`,
        action: nearby.lockedUntilExit ? 'Upgraded! Step off to buy again'
          : this.save.cash <= 0 ? `$${remaining} remaining · Sell timber or serve meals`
          : onPad ? `Stand still to upgrade · $${remaining} remaining` : `Step onto the pad · $${remaining}`,
        progress: nearby.paid / cost };
    }
    if (nearby && 'kind' in nearby) {
      const total = nearby.payment === 'wood' ? nearby.requires : nearby.cost;
      const paid = nearby.payment === 'wood' ? nearby.delivered : nearby.paid;
      const remaining = total - paid;
      const benefit = { zone2: 'New hunting grounds and furnace upgrades', dock: 'Catch frostfin and cook higher-value plates', glacier: 'Explore deeper forests and tougher wildlife', whiteout: 'Reach the final frostwild expedition' }[nearby.kind];
      return { title: nearby.title.text, detail: benefit,
        action: nearby.payment === 'wood' ? `Stand on the pad · ${remaining} logs remaining` : `Stand on the pad · $${remaining} remaining`,
        progress: paid / total };
    }
    if (this.save.station.lumber > 0 && distanceSquared(this.player.x, this.player.y, 1500, 1120) < 150 ** 2) {
      return { title: 'Lumber yard', detail: `${this.save.station.lumber}/300 logs stacked across three 100-log sections`, action: 'Step onto the stand to load logs · Sell them at the Timber Post', progress: this.save.station.lumber / 300 };
    }
    if (this.save.station.passiveCash > 0 && distanceSquared(this.player.x, this.player.y, WORLD.cashZone.x, WORLD.cashZone.y) < 145 ** 2) {
      return { title: 'Passive takings', detail: `$${this.save.station.passiveCash} earned while you were away`, action: 'Step onto the strongbox to collect', progress: 1 };
    }
    if (this.isPlayerSafe()) return { title: 'Hearth sanctuary', detail: this.player.health < maxHealthFor(this.save.upgrades.maxHealth)
      ? `Recovering ${healingPerSecondFor(this.save.upgrades.infirmary)} HP each second` : 'Fully rested · Ready for the frostwild',
      action: 'The green circle restores health', progress: this.player.health / maxHealthFor(this.save.upgrades.maxHealth), healing: true };
    return null;
  }

  private requestSave(): void {
    this.save.updatedAt = Date.now();
    this.callbacks.save(this.getSave());
    void saveProgress(this.save);
  }
}
