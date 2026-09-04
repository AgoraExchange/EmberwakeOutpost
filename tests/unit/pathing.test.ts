import { describe, expect, it } from 'vitest';
import { assetPath, normalizeBasePath } from '../../src/game/pathing';

describe('offline-safe deployment paths', () => {
  it('joins assets under a GitHub Pages repository base', () => {
    expect(assetPath('/icons/icon-192.png', '/Emberwake-Outpost/')).toBe('/Emberwake-Outpost/icons/icon-192.png');
    expect(assetPath('art/key.webp', '/repo')).toBe('/repo/art/key.webp');
  });

  it('normalizes project bases without breaking relative bases', () => {
    expect(normalizeBasePath('Emberwake-Outpost')).toBe('/Emberwake-Outpost/');
    expect(normalizeBasePath('./')).toBe('./');
  });
});
