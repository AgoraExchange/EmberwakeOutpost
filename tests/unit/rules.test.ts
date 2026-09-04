import { describe, expect, it } from 'vitest';
import {
  addCargo,
  applyDamage,
  applyDeathLoss,
  applyRaidProfitDamage,
  attackCadenceFor,
  convertStation,
  purchaseMeal,
  upgradeCost,
  weaponDamageFor
} from '../../src/game/rules';

describe('combat and cooldown rules', () => {
  it('applies damage without going below zero and respects spawn protection', () => {
    expect(applyDamage(100, 19, false)).toBe(81);
    expect(applyDamage(12, 19, false)).toBe(0);
    expect(applyDamage(100, 19, true)).toBe(100);
  });

  it('increases damage and shortens cadence with upgrades', () => {
    expect(weaponDamageFor(2, 1)).toBeGreaterThan(weaponDamageFor(0, 0));
    expect(attackCadenceFor(3)).toBeLessThan(attackCadenceFor(0));
    expect(attackCadenceFor(0, 2)).toBeLessThan(attackCadenceFor(0, 0));
    expect(attackCadenceFor(99)).toBeGreaterThanOrEqual(.34);
  });

  it('lets breached raids drain banked profit without making cash negative', () => {
    expect(applyRaidProfitDamage(100, 0)).toEqual({ cash: 94, lost: 6 });
    expect(applyRaidProfitDamage(4, 9)).toEqual({ cash: 0, lost: 4 });
    expect(applyRaidProfitDamage(0, 0)).toEqual({ cash: 0, lost: 0 });
  });
});

describe('inventory and production rules', () => {
  it('never exceeds cargo capacity and returns the remainder', () => {
    expect(addCargo(3, 4, 5)).toEqual({ carried: 5, accepted: 2, remainder: 2 });
    expect(addCargo(5, 1, 5)).toEqual({ carried: 5, accepted: 0, remainder: 1 });
  });

  it('converts only when raw stock and serving room exist', () => {
    expect(convertStation(2, 0, 4)).toEqual({ raw: 1, ready: 1, converted: true });
    expect(convertStation(2, 4, 4)).toEqual({ raw: 2, ready: 4, converted: false });
    expect(convertStation(0, 1, 4).converted).toBe(false);
  });

  it('holds customers when food is absent and pays exact value when served', () => {
    expect(purchaseMeal(0, 8)).toEqual({ ready: 0, cashDrop: 0, sold: false });
    expect(purchaseMeal(2, 11)).toEqual({ ready: 1, cashDrop: 11, sold: true });
  });
});

describe('economy and death rules', () => {
  it('uses deterministic escalating upgrade costs', () => {
    expect(upgradeCost('capacity', 0)).toBe(24);
    expect(upgradeCost('capacity', 1)).toBe(39);
    expect(upgradeCost('capacity', 2)).toBeGreaterThan(upgradeCost('capacity', 1));
  });

  it('permanently removes every carried resource on death', () => {
    expect(applyDeathLoss(4, 2, 3, 1, 7)).toEqual({
      lostMeat: 4, lostFish: 2, lostMeals: 3, lostFishMeals: 1, lostWood: 7,
      meat: 0, fish: 0, meals: 0, fishMeals: 0, wood: 0
    });
  });
});
