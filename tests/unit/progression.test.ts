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
    expect(finishOfflineCooking(save, 61_000)).toMatchObject({ meals: 3, fishMeals: 0, mealsSold: 0, cashEarned: 0, lumber: 0 });
    expect(save.station.rawMeat).toBe(27);
    expect(save.station.meals).toBe(4);
    expect(save.cash).toBe(42);
    expect(finishOfflineCooking(save, 61_000)).toMatchObject({ meals: 0, fishMeals: 0 });
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

  it('turns stocked meals into saved collectible cash for a hired runner', () => {
    const save = createDefaultSave();
    save.updatedAt = 0;
    save.upgrades.worker = 1;
    save.upgrades.saleValue = 2;
    save.station.rawMeat = 20;
    const report = finishOfflineCooking(save, 70_000);
    expect(report.mealsSold).toBeGreaterThan(0);
    expect(report.cashEarned).toBe(report.mealsSold * 8);
    expect(save.station.passiveCash).toBe(report.cashEarned);
    expect(save.cash).toBe(0);
  });

  it('fills three lumber piles while away and caps saved stock at 300', () => {
    const save = createDefaultSave();
    save.updatedAt = 0;
    save.upgrades.lumberjack = 3;
    expect(finishOfflineCooking(save, 1_000_000).lumber).toBe(200);
    expect(save.station.lumber).toBe(200);
    save.updatedAt = 0;
    expect(finishOfflineCooking(save, 10_000_000).lumber).toBe(100);
    expect(save.station.lumber).toBe(300);
  });

  it('lets upgraded hunters supply the full offline cook and delivery chain', () => {
    const save = createDefaultSave();
    save.updatedAt = 0;
    save.upgrades.hunters = 1;
    save.upgrades.worker = 1;
    const report = finishOfflineCooking(save, 90_000);
    expect(report.huntedMeat).toBe(4);
    expect(report.mealsSold).toBe(4);
    expect(save.station.rawMeat).toBe(0);
    expect(save.station.passiveCash).toBe(16);

    const capped = createDefaultSave();
    capped.updatedAt = 0;
    capped.upgrades.hunters = 3;
    capped.station.rawMeat = 79;
    capped.station.meals = 4;
    expect(finishOfflineCooking(capped, 22_000).huntedMeat).toBe(1);
    expect(capped.station.rawMeat).toBe(80);
  });
});
