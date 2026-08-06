import { describe, expect, it } from 'vitest';
import {
  getProfileTokens,
  isProfileId,
  PROFILE_IDS,
  profileBootSettings,
} from './profiles';

describe('isProfileId', () => {
  it('aceita apenas desk, tv e handheld', () => {
    expect(isProfileId('desk')).toBe(true);
    expect(isProfileId('tv')).toBe(true);
    expect(isProfileId('handheld')).toBe(true);
    expect(isProfileId('mobile')).toBe(false);
    expect(isProfileId(1)).toBe(false);
    expect(isProfileId(null)).toBe(false);
  });

  it('lista os três perfis conhecidos', () => {
    expect(PROFILE_IDS).toEqual(['desk', 'tv', 'handheld']);
  });
});

describe('getProfileTokens', () => {
  it('retorna tokens com cardWidth maior no perfil TV', () => {
    expect(getProfileTokens('tv').cardWidth).toBeGreaterThan(
      getProfileTokens('desk').cardWidth
    );
    expect(getProfileTokens('handheld').fontScale).toBeLessThan(
      getProfileTokens('desk').fontScale
    );
  });
});

describe('profileBootSettings', () => {
  it('liga TV mode e fullscreen no perfil tv', () => {
    expect(profileBootSettings('tv')).toEqual({
      'ui.tvMode': '1',
      'ui.fullscreen': '1',
    });
  });

  it('liga fullscreen sem TV mode no handheld', () => {
    expect(profileBootSettings('handheld')).toEqual({
      'ui.tvMode': '0',
      'ui.fullscreen': '1',
    });
  });

  it('desliga TV mode e fullscreen no desk', () => {
    expect(profileBootSettings('desk')).toEqual({
      'ui.tvMode': '0',
      'ui.fullscreen': '0',
    });
  });
});
