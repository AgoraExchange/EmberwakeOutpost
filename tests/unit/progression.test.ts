import { describe, expect, it } from 'vitest';
import { finishOfflineCooking } from '../../src/game/progression';
import { createDefaultSave } from '../../src/game/rules';

describe('stocked stations while away', () => {
  it('uses existing ingredients, respects capacity, and never creates cash', () => {
    const save = createDefaultSave();
    save.updatedAt = 1_000;
    save.station.rawMeat = 30;
    save.station.meals = 1;
    save.cash = 42;
    expect(finishOfflineCooking(save, 61_000)).toEqual({ meals: 3, fishMeals: 0 });
    expect(save.station.rawMeat).toBe(27);
    expect(save.station.meals).toBe(4);
    expect(save.cash).toBe(42);
    expect(finishOfflineCooking(save, 61_000)).toEqual({ meals: 0, fishMeals: 0 });
  });

  it('retains fractional cooking progress and never invents ingredients', () => {
    const save = createDefaultSave();
    save.updatedAt = 0;
    save.station.rawMeat = 1;
    save.station.butcherProgress = .5;
    expect(finishOfflineCooking(save, 500).meals).toBe(0);
    expect(save.station.butcherProgress).toBeCloseTo(.5 + .5 / 2.15);
    expect(finishOfflineCooking(save, 1_100).meals).toBe(1);
    expect(save.station.rawMeat).toBe(0);
    expect(finishOfflineCooking(save, 100_000).meals).toBe(0);
  });

  it('only runs the smokehouse after the dock is unlocked', () => {
    const save = createDefaultSave();
    save.updatedAt = 0;
    save.station.rawFish = 10;
    expect(finishOfflineCooking(save, 60_000).fishMeals).toBe(0);
    save.unlocks.dock = true;
    expect(finishOfflineCooking(save, 120_000).fishMeals).toBe(4);
    expect(save.station.rawFish).toBe(6);
  });

  it('does not bank blocked production time or reverse progress after a clock change', () => {
    const save = createDefaultSave();
    save.updatedAt = 1_000;
    save.station.rawMeat = 10;
    save.station.meals = 4;
    finishOfflineCooking(save, 100_000);
    save.station.meals = 0;
    expect(finishOfflineCooking(save, 100_000).meals).toBe(0);
    expect(finishOfflineCooking(save, 99_000).meals).toBe(0);
    expect(save.station.rawMeat).toBe(10);
  });
});
