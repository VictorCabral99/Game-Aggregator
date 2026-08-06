import { describe, expect, it } from 'vitest';
import { isNonGameSteam, NON_GAME_STEAM_APPIDS } from './steam-filters';

describe('isNonGameSteam', () => {
  it('exclui SteamVR pelos AppIDs oficiais', () => {
    expect(isNonGameSteam('250820', 'SteamVR')).toBe(true);
    expect(isNonGameSteam('330050', 'SteamVR')).toBe(true);
    expect(NON_GAME_STEAM_APPIDS.has('250820')).toBe(true);
  });

  it('exclui pelo título mesmo sem AppID', () => {
    expect(isNonGameSteam(null, 'SteamVR')).toBe(true);
    expect(isNonGameSteam('', 'Steam VR')).toBe(true);
    expect(isNonGameSteam(undefined, 'steamvr')).toBe(true);
  });

  it('não exclui jogos VR reais', () => {
    expect(isNonGameSteam('546560', 'Half-Life: Alyx')).toBe(false);
    expect(isNonGameSteam('719950', 'Beat Saber')).toBe(false);
    expect(isNonGameSteam('620980', 'VRChat')).toBe(false);
  });
});
