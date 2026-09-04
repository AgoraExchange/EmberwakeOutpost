import { describe, expect, it } from 'vitest';
import { UPGRADE_BY_ID } from '../../src/game/config';
import { importSave, migrateSave } from '../../src/game/save';

describe('save migrations', () => {
  it('creates a valid current save from invalid input', () => {
    const save = migrateSave(null);
    expect(save.version).toBe(4);
    expect(save.cash).toBe(0);
    expect(save.upgrades.capacity).toBe(0);
  });

  it('migrates legacy currency, upgrades, zone and settings', () => {
    const save = migrateSave({
      version: 1,
      coins: 73,
      levels: { capacity: 2, weaponDamage: 1 },
      zone2: true,
      settings: { haptics: false }
    });
    expect(save.version).toBe(4);
    expect(save.cash).toBe(73);
    expect(save.upgrades.capacity).toBe(2);
    expect(save.unlocks.zone2).toBe(true);
    expect(save.settings.haptics).toBe(false);
  });

  it('clamps corrupt levels and negative values safely', () => {
    const save = migrateSave({ version: 2, cash: -900, upgrades: { weaponTier: 99 }, station: { rawMeat: -4 } });
    expect(save.cash).toBe(0);
    // Derived from config so extending a chain (as the Armory was) cannot silently drift.
    expect(save.upgrades.weaponTier).toBe(UPGRADE_BY_ID.weaponTier.maxLevel);
    expect(save.station.rawMeat).toBe(0);
  });

  it('adds new expedition unlocks when a v2 save is migrated', () => {
    const save = migrateSave({ version: 2, cash: 41, unlocks: { zone2: true, dock: false, raidSeen: true } });
    expect(save.version).toBe(4);
    expect(save.unlocks).toMatchObject({ zone2: true, dock: false, glacier: false, whiteout: false, raidSeen: true });
  });

  it('rejects unknown future versions during import', () => {
    expect(() => importSave('{"version":99,"cash":1000}')).toThrow(/unsupported/i);
  });

  it('adds a sanitized empty call-sign to existing saves and preserves a new one', () => {
    expect(migrateSave({ version: 3, cash: 4 }).trailwardenName).toBe('');
    expect(migrateSave({ version: 4, trailwardenName: '  Frost   Fox\n', cash: 4 }).trailwardenName).toBe('Frost Fox');
  });
});
