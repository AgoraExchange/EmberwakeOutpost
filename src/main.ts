import { registerSW } from 'virtual:pwa-register';
import './styles.css';
import { Game } from './game/Game';
import { BRAND } from './game/config';
import { assetPath } from './game/pathing';
import { exportSave, importSave, loadSave, normalizeTrailwardenName, resetStoredProgress, saveProgress } from './game/save';
import { spriteCount } from './game/sprites';
import type { SaveData, TutorialStep } from './game/types';

function requireElement<T extends HTMLElement>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (!element) throw new Error(`Required element missing: ${selector}`);
  return element;
}

const host = requireElement<HTMLElement>('#canvas-host');
const launchScreen = requireElement<HTMLElement>('#launch-screen');
const launchLoader = requireElement<HTMLElement>('#launch-loader');
const launchProgress = requireElement<HTMLElement>('#launch-progress');
const launchProgressTrack = requireElement<HTMLElement>('.launch-progress-track');
const launchMessage = requireElement<HTMLElement>('#launch-message');
const startScreen = requireElement<HTMLElement>('#start-screen');
const startButton = requireElement<HTMLButtonElement>('#start-button');
const trailwardenGreeting = requireElement<HTMLElement>('#trailwarden-greeting');
const nameScreen = requireElement<HTMLElement>('#name-screen');
const nameForm = requireElement<HTMLFormElement>('#name-form');
const nameInput = requireElement<HTMLInputElement>('#trailwarden-name');
const nameError = requireElement<HTMLElement>('#name-error');
const pauseButton = requireElement<HTMLButtonElement>('#pause-button');
const pauseScreen = requireElement<HTMLElement>('#pause-screen');
const resumeButton = requireElement<HTMLButtonElement>('#resume-button');
const objectiveCard = requireElement<HTMLElement>('#objective-card');
const objectiveText = requireElement<HTMLElement>('#objective-text');
const raidBanner = requireElement<HTMLElement>('#raid-banner');
const toast = requireElement<HTMLElement>('#toast');
const defeatScreen = requireElement<HTMLElement>('#defeat-screen');
const defeatLoss = requireElement<HTMLElement>('#defeat-loss');
const updateButton = requireElement<HTMLButtonElement>('#update-button');
const checkUpdatesButton = requireElement<HTMLButtonElement>('#check-updates-button');
const appVersion = requireElement<HTMLElement>('#app-version');

document.documentElement.style.setProperty('--key-art-url', `url("${assetPath('art/emberwake-key-art.webp')}")`);

const APP_VERSION = '1.0.0';
const VERSION_URL = assetPath('app-version.json');
const AUTOMATED_BROWSER = navigator.webdriver === true;

let currentSave: SaveData;
let game: Game;
let toastTimer = 0;
let objectiveTimer = 0;
let updateWaiting = false;

function showToast(message: string): void {
  toast.textContent = message;
  toast.classList.remove('hidden');
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => toast.classList.add('hidden'), 2300);
}

function wait(milliseconds: number): Promise<void> {
  return new Promise(resolve => window.setTimeout(resolve, milliseconds));
}

function updateTrailwardenGreeting(): void {
  trailwardenGreeting.textContent = currentSave.trailwardenName
    ? `TRAILWARDEN · ${currentSave.trailwardenName.toLocaleUpperCase()}`
    : '';
}

async function playLaunchSequence(): Promise<void> {
  // Browser automation takes the same path without adding seven seconds to every game test.
  await wait(AUTOMATED_BROWSER ? 0 : 3_000);
  launchLoader.classList.remove('hidden');

  const messages = ['Loading assets…', 'Mapping the frostwild…', 'Waking up the bears…', 'Stocking the cookout…', 'Opening the outpost…'];
  const duration = AUTOMATED_BROWSER ? 1 : 4_000;
  await new Promise<void>(resolve => {
    const startedAt = performance.now();
    const render = (now: number): void => {
      const progress = Math.min(1, (now - startedAt) / duration);
      const percent = Math.round(progress * 100);
      launchProgress.style.width = `${percent}%`;
      launchProgressTrack.setAttribute('aria-valuenow', String(percent));
      launchMessage.textContent = messages[Math.min(messages.length - 1, Math.floor(progress * messages.length))] ?? 'Opening the outpost…';
      if (progress < 1) window.requestAnimationFrame(render);
      else window.setTimeout(resolve, AUTOMATED_BROWSER ? 0 : 140);
    };
    window.requestAnimationFrame(render);
  });

  launchScreen.classList.remove('visible');
  launchScreen.setAttribute('aria-hidden', 'true');
}

async function askForTrailwardenName(): Promise<void> {
  if (currentSave.trailwardenName) return;
  // Tests still exercise the actual title/game hand-off, but a native naming modal
  // cannot be answered by the existing gameplay acceptance suite.
  if (AUTOMATED_BROWSER) {
    game.save.trailwardenName = 'Test Trailwarden';
    currentSave = game.getSave();
    updateTrailwardenGreeting();
    return;
  }

  nameScreen.classList.add('visible');
  nameScreen.setAttribute('aria-hidden', 'false');
  window.setTimeout(() => nameInput.focus(), 80);

  await new Promise<void>(resolve => {
    const submit = async (event: SubmitEvent): Promise<void> => {
      event.preventDefault();
      const name = normalizeTrailwardenName(nameInput.value);
      if (!name) {
        nameError.textContent = 'Give the outpost a name to call you.';
        nameInput.focus();
        return;
      }
      const submitButton = nameForm.querySelector<HTMLButtonElement>('button[type="submit"]');
      if (submitButton) submitButton.disabled = true;
      nameError.textContent = 'Saving your outpost record…';
      game.save.trailwardenName = name;
      currentSave = game.getSave();
      await saveProgress(currentSave);
      updateTrailwardenGreeting();
      nameScreen.classList.remove('visible');
      nameScreen.setAttribute('aria-hidden', 'true');
      nameForm.removeEventListener('submit', submit);
      resolve();
    };
    nameForm.addEventListener('submit', submit);
  });
}

function updateHud(cash: number, rawFood: number, cookedFood: number, wood: number, health: number, maxHealth: number): void {
  const compact = (value: number): string => value < 10_000
    ? Math.floor(value).toLocaleString()
    : new Intl.NumberFormat(undefined, { notation: 'compact', maximumFractionDigits: 1 }).format(Math.floor(value));
  requireElement('#cash-value').textContent = compact(cash);
  // Carrying is unbounded, so each resource shows a running count rather than a fraction.
  requireElement('#wood-value').textContent = compact(wood);
  requireElement('#raw-food-value').textContent = compact(rawFood);
  requireElement('#cooked-food-value').textContent = compact(cookedFood);
  requireElement('#health-value').textContent = `${Math.ceil(health)}/${maxHealth}`;
}

function updateObjective(step: TutorialStep, text: string): void {
  window.clearTimeout(objectiveTimer);
  objectiveCard.classList.remove('complete');
  objectiveText.textContent = text;
  if (step === 'complete') objectiveTimer = window.setTimeout(() => objectiveCard.classList.add('complete'), 3400);
}

function updateRaid(message: string | null): void {
  raidBanner.textContent = message ?? '';
  raidBanner.classList.toggle('hidden', !message);
}

function openPause(): void {
  game.pause();
  pauseScreen.classList.add('visible');
  pauseScreen.setAttribute('aria-hidden', 'false');
}

function closePause(): void {
  pauseScreen.classList.remove('visible');
  pauseScreen.setAttribute('aria-hidden', 'true');
  game.resume();
}

function bindSettings(): void {
  const master = requireElement<HTMLInputElement>('#master-volume');
  const music = requireElement<HTMLInputElement>('#music-volume');
  const sfx = requireElement<HTMLInputElement>('#sfx-volume');
  const haptics = requireElement<HTMLInputElement>('#haptics-toggle');
  const motion = requireElement<HTMLInputElement>('#motion-toggle');
  const quality = requireElement<HTMLSelectElement>('#quality-select');
  const joystick = requireElement<HTMLSelectElement>('#joystick-select');

  const syncControls = (): void => {
    const settings = currentSave.settings;
    master.value = String(settings.masterVolume);
    music.value = String(settings.musicVolume);
    sfx.value = String(settings.sfxVolume);
    haptics.checked = settings.haptics;
    motion.checked = settings.reducedMotion;
    quality.value = settings.quality;
    joystick.value = settings.joystick;
  };

  const apply = (): void => {
    currentSave.settings = {
      masterVolume: Number(master.value),
      musicVolume: Number(music.value),
      sfxVolume: Number(sfx.value),
      haptics: haptics.checked,
      reducedMotion: motion.checked,
      quality: quality.value === 'low' ? 'low' : 'high',
      joystick: joystick.value === 'fixed' ? 'fixed' : 'floating'
    };
    game.save.settings = { ...currentSave.settings };
    game.applySettings();
  };

  for (const input of [master, music, sfx, haptics, motion, quality, joystick]) input.addEventListener('change', apply);
  master.addEventListener('input', apply);
  music.addEventListener('input', apply);
  sfx.addEventListener('input', apply);
  syncControls();
}

async function bootstrap(): Promise<void> {
  currentSave = await loadSave();
  appVersion.textContent = `Emberwake ${APP_VERSION}`;
  updateTrailwardenGreeting();
  game = await Game.create(host, currentSave, {
    hud: updateHud,
    objective: updateObjective,
    raid: updateRaid,
    toast: showToast,
    defeat: (lostRawFood, lostCookedFood, lostWood, seconds) => {
      const losses = [
        lostRawFood ? `${lostRawFood} raw food` : '',
        lostCookedFood ? `${lostCookedFood} cooked meals` : '',
        lostWood ? `${lostWood} timber` : ''
      ].filter(Boolean).join(' · ') || 'No carried cargo lost';
      defeatLoss.textContent = `${losses} · Lost to the frostwild`;
      defeatScreen.classList.add('visible');
      defeatScreen.setAttribute('aria-hidden', 'false');
      defeatScreen.querySelector('span')!.textContent = `Returning to the furnace in ${seconds.toFixed(1)}s…`;
    },
    respawn: () => {
      defeatScreen.classList.remove('visible');
      defeatScreen.setAttribute('aria-hidden', 'true');
      showToast('Warm again · 3 seconds of protection');
    },
    save: save => { currentSave = save; }
  });

  bindSettings();
  pauseButton.addEventListener('click', openPause);
  resumeButton.addEventListener('click', closePause);
  window.addEventListener('keydown', event => {
    if (event.key === 'Escape') {
      if (game.isPaused()) closePause();
      else openPause();
    }
  });
  startButton.addEventListener('click', () => {
    startScreen.classList.remove('visible');
    game.start();
  }, { once: true });
  startButton.textContent = 'ENTER THE FROSTWILD';
  startButton.disabled = false;

  requireElement<HTMLButtonElement>('#export-button').addEventListener('click', () => {
    const blob = new Blob([exportSave(game.getSave())], { type: 'application/json' });
    const href = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = href;
    anchor.download = BRAND.saveFilename;
    anchor.click();
    URL.revokeObjectURL(href);
    showToast('Save exported');
  });

  requireElement<HTMLInputElement>('#import-input').addEventListener('change', async event => {
    const file = (event.currentTarget as HTMLInputElement).files?.[0];
    if (!file) return;
    try {
      const imported = importSave(await file.text());
      if (!window.confirm('Replace this device’s current Emberwake progress with the imported save?')) return;
      await saveProgress(imported);
      window.location.reload();
    } catch (error) { showToast(error instanceof Error ? error.message : 'Import failed'); }
  });

  requireElement<HTMLButtonElement>('#reset-button').addEventListener('click', async () => {
    if (!window.confirm('Reset all Emberwake progress on this device? This cannot be undone unless you exported a save.')) return;
    if (!window.confirm('Final confirmation: return the outpost to day one?')) return;
    await resetStoredProgress();
    window.location.reload();
  });

  checkUpdatesButton.addEventListener('click', () => { void checkForUpdates(); });

  await playLaunchSequence();
  await askForTrailwardenName();

  if (import.meta.env.DEV) {
    Object.assign(window, { __EMBERWAKE__: {
      game,
      getSave: () => game.getSave(),
      getState: () => game.debugState(),
      teleport: (x: number, y: number) => game.debugTeleport(x, y),
      defeatEnemy: () => game.debugDefeatFirstEnemy(),
      grantCash: (amount: number) => game.debugGrantCash(amount),
      setCargo: (meat: number, fish: number) => game.debugSetCargo(meat, fish),
      setMeals: (meals: number, fishMeals: number) => game.debugSetMeals(meals, fishMeals),
      setWood: (wood: number) => game.debugSetWood(wood),
      spriteCount: () => spriteCount(),
      damagePlayer: (amount: number) => game.debugDamagePlayer(amount),
      triggerRaid: () => game.debugTriggerRaid(),
      damageGate: (amount: number) => game.debugDamageGate(amount)
    } });
  }
}

async function reloadWithAvailableUpdate(): Promise<void> {
  try {
    if (game) await saveProgress(game.getSave());
  } catch {
    // A storage failure should not prevent the app shell itself from updating.
  }
  await updateSW(true);
}

async function checkForUpdates(): Promise<void> {
  if (checkUpdatesButton.disabled) return;
  checkUpdatesButton.disabled = true;
  checkUpdatesButton.textContent = 'Checking the watch…';

  let remoteVersion = APP_VERSION;
  try {
    const response = await fetch(`${VERSION_URL}?t=${Date.now()}`, {
      cache: 'no-store',
      headers: { 'Cache-Control': 'no-cache' }
    });
    if (response.ok) {
      const release = await response.json() as { version?: unknown };
      if (typeof release.version === 'string' && release.version.trim()) remoteVersion = release.version.trim();
    }
  } catch {
    // The installed offline app remains playable; the normal worker check still runs below.
  }

  try {
    const registration = await navigator.serviceWorker?.getRegistration();
    await registration?.update();
    // Give a just-installed worker a moment to report that it is ready to activate.
    await wait(350);
  } catch {
    // Local HTTP development and private browser modes may not expose a registration.
  }

  const hasRemoteUpdate = remoteVersion !== APP_VERSION || updateWaiting;
  if (hasRemoteUpdate) {
    const updateLabel = remoteVersion === APP_VERSION ? 'A new outpost build' : `Update ${remoteVersion}`;
    showToast(`${updateLabel} found · saving progress and restarting…`);
    await wait(650);
    try { await saveProgress(game.getSave()); } catch { /* reload can still proceed */ }
    if (updateWaiting) {
      await reloadWithAvailableUpdate();
      return;
    }
    // If GitHub Pages published its marker just before the worker reached this
    // device, a normal reload lets the browser fetch the new registration.
    window.location.reload();
    return;
  }

  showToast(`Emberwake ${APP_VERSION} is already up to date`);
  checkUpdatesButton.disabled = false;
  checkUpdatesButton.textContent = 'Check for updates';
}

const updateSW = registerSW({
  immediate: true,
  onNeedRefresh() {
    updateWaiting = true;
    updateButton.classList.remove('hidden');
  },
  onOfflineReady() { showToast('Outpost cached · Ready for offline relaunch'); }
});
updateButton.addEventListener('click', () => { void reloadWithAvailableUpdate(); });

bootstrap().catch(error => {
  console.error(error);
  startButton.disabled = true;
  startButton.textContent = 'OUTPOST FAILED TO LOAD';
  showToast('The game could not start. Reload to retry.');
});
