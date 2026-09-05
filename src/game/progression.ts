import { ECONOMY } from './config';
import { butcherSecondsFor, clamp, counterCapacityFor } from './rules';
import type { SaveData } from './types';

/** Only stocked stations work while away. No automatic hunting, sales, or raids. */
export function finishOfflineCooking(save: SaveData, now = Date.now()): { meals: number; fishMeals: number } {
  const elapsed = clamp((now - save.updatedAt) / 1000, 0, 8 * 60 * 60);
  // Consume this interval even if the output shelf is full, preventing time banking.
  save.updatedAt = now;
  const capacity = counterCapacityFor(save.upgrades.counterCapacity);
  function cook(raw: number, ready: number, progress: number, seconds: number) {
    const possible = Math.max(0, Math.min(raw, capacity - ready));
    if (possible === 0 || elapsed === 0) return { made: 0, progress };
    const work = progress + elapsed / seconds;
    const made = Math.min(possible, Math.floor(work));
    return { made, progress: made === possible ? 0 : work - made };
  }
  const meat = cook(save.station.rawMeat, save.station.meals, save.station.butcherProgress,
    butcherSecondsFor(save.upgrades.butcherSpeed, save.upgrades.worker));
  const fish = save.unlocks.dock ? cook(save.station.rawFish, save.station.fishMeals, save.station.fishProgress,
    Math.max(1.4, ECONOMY.fishProcessSeconds * Math.pow(.88, save.upgrades.butcherSpeed))) : { made: 0, progress: save.station.fishProgress };
  save.station.rawMeat -= meat.made;
  save.station.meals += meat.made;
  save.station.butcherProgress = meat.progress;
  save.station.rawFish -= fish.made;
  save.station.fishMeals += fish.made;
  save.station.fishProgress = fish.progress;
  return { meals: meat.made, fishMeals: fish.made };
}
