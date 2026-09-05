import { ECONOMY, hunterTierFor } from './config';
import { butcherSecondsFor, clamp, counterCapacityFor, mealValueFor } from './rules';
import type { SaveData } from './types';

export interface OfflineReport {
  meals: number;
  fishMeals: number;
  mealsSold: number;
  fishMealsSold: number;
  cashEarned: number;
  lumber: number;
  huntedMeat: number;
  demandDelta: number;
}

/** Simulates only purchased workers and stocked stations, capped to eight hours. */
export function finishOfflineCooking(save: SaveData, now = Date.now()): OfflineReport {
  const elapsed = clamp((now - save.updatedAt) / 1000, 0, 8 * 60 * 60);
  // Consume this interval even if the output shelf is full, preventing time banking.
  save.updatedAt = now;
  let huntedMeat = 0;
  const hunter = hunterTierFor(save.upgrades.hunters);
  if (hunter.crew > 0 && save.station.rawMeat < hunter.stockCap) {
    const work = save.station.hunterProgress + elapsed / hunter.interval;
    const trips = Math.floor(work);
    huntedMeat = Math.min(hunter.stockCap - save.station.rawMeat, trips * hunter.batch);
    save.station.rawMeat += huntedMeat;
    save.station.hunterProgress = save.station.rawMeat >= hunter.stockCap ? 0 : work - trips;
  }
  const capacity = counterCapacityFor(save.upgrades.counterCapacity);
  function cook(raw: number, ready: number, progress: number, seconds: number) {
    const possible = Math.max(0, Math.min(raw, capacity - ready));
    if (possible === 0 || elapsed === 0) return { made: 0, progress };
    const work = progress + elapsed / seconds;
    const made = Math.min(possible, Math.floor(work));
    return { made, progress: made === possible ? 0 : work - made };
  }
  let mealsSold = 0;
  let fishMealsSold = 0;
  let deliveryUnits = 0;
  let meat: { made: number; progress: number };
  if (save.upgrades.worker > 0) {
    const batch = save.upgrades.worker * 2;
    const deliverySeconds = save.upgrades.worker === 1 ? 7 : 4.5;
    deliveryUnits = Math.floor(elapsed / deliverySeconds) * batch;
    const cookSeconds = butcherSecondsFor(save.upgrades.butcherSpeed, save.upgrades.worker);
    const work = save.station.butcherProgress + elapsed / cookSeconds;
    const productionRoom = Math.max(0, capacity - save.station.meals + Math.max(0, deliveryUnits - save.station.cookMeals));
    const made = Math.min(save.station.rawMeat, productionRoom, Math.floor(work));
    meat = { made, progress: made === save.station.rawMeat || made === productionRoom ? 0 : work - made };
    const available = save.station.cookMeals + save.station.meals + made;
    mealsSold = Math.min(available, deliveryUnits);
    const remainingCook = Math.max(0, save.station.cookMeals - mealsSold);
    save.station.cookMeals = remainingCook;
    save.station.meals = available - mealsSold - remainingCook;
  } else {
    meat = cook(save.station.rawMeat, save.station.meals, save.station.butcherProgress,
      butcherSecondsFor(save.upgrades.butcherSpeed, 0));
    save.station.meals += meat.made;
  }
  const fish = save.unlocks.dock ? cook(save.station.rawFish, save.station.fishMeals, save.station.fishProgress,
    Math.max(.75, ECONOMY.fishProcessSeconds * Math.pow(.88, save.upgrades.butcherSpeed) / (1 + save.upgrades.fishery * .2))) : { made: 0, progress: save.station.fishProgress };
  save.station.rawMeat -= meat.made;
  save.station.butcherProgress = meat.progress;
  save.station.rawFish -= fish.made;
  save.station.fishMeals += fish.made;
  save.station.fishProgress = fish.progress;
  if (save.upgrades.worker > 0 && deliveryUnits > mealsSold) {
    const availableFish = save.station.cookFishMeals + save.station.fishMeals;
    fishMealsSold = Math.min(availableFish, deliveryUnits - mealsSold);
    const carriedSold = Math.min(save.station.cookFishMeals, fishMealsSold);
    save.station.cookFishMeals -= carriedSold;
    save.station.fishMeals -= fishMealsSold - carriedSold;
  }
  const cashEarned = mealsSold * mealValueFor(save.upgrades.saleValue)
    + fishMealsSold * (ECONOMY.fishMealValue + save.upgrades.saleValue * 2);
  save.station.passiveCash += cashEarned;
  save.stats.mealsSold += mealsSold + fishMealsSold;

  let lumber = 0;
  const lumberjack = save.upgrades.lumberjack;
  if (lumberjack > 0 && save.station.lumber < 300) {
    const interval = [0, 10, 7, 5][lumberjack]!;
    const work = save.station.lumberProgress + elapsed / interval;
    lumber = Math.min(300 - save.station.lumber, Math.floor(work));
    save.station.lumber += lumber;
    save.station.lumberProgress = save.station.lumber >= 300 ? 0 : work - lumber;
  }
  return { meals: meat.made, fishMeals: fish.made, mealsSold, fishMealsSold, cashEarned, lumber, huntedMeat,
    demandDelta: meat.made - mealsSold };
}
