import type { ProfileId, ProfileTokens } from './api';

/** Tokens de layout por perfil (P8-01/02). Fonte única main + renderer. */
export const PROFILE_TOKENS: Record<ProfileId, ProfileTokens> = {
  desk: {
    cardWidth: 180,
    cardGap: 12,
    padding: 24,
    fontScale: 1.0,
    maxColumns: 8,
    safeMarginPct: 0,
    hideCursorAfterMs: 0,
  },
  tv: {
    cardWidth: 260,
    cardGap: 20,
    padding: 48,
    fontScale: 1.3,
    maxColumns: 5,
    safeMarginPct: 5,
    hideCursorAfterMs: 3000,
  },
  handheld: {
    cardWidth: 160,
    cardGap: 10,
    padding: 16,
    fontScale: 0.9,
    maxColumns: 4,
    safeMarginPct: 2,
    hideCursorAfterMs: 0,
  },
};

export const PROFILE_IDS: ProfileId[] = ['desk', 'tv', 'handheld'];

export function isProfileId(value: unknown): value is ProfileId {
  return typeof value === 'string' && PROFILE_IDS.includes(value as ProfileId);
}

export function getProfileTokens(profile: ProfileId): ProfileTokens {
  return PROFILE_TOKENS[profile];
}

/** Settings derivados ao trocar o perfil (boot + UX). */
export function profileBootSettings(profile: ProfileId): Record<string, string> {
  if (profile === 'tv') {
    return { 'ui.tvMode': '1', 'ui.fullscreen': '1' };
  }
  if (profile === 'handheld') {
    return { 'ui.tvMode': '0', 'ui.fullscreen': '1' };
  }
  return { 'ui.tvMode': '0', 'ui.fullscreen': '0' };
}
