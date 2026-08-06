import { describe, expect, it } from 'vitest';
import { steamDbInfoUrl } from '../shared/api';
import {
  resolveSteamAppIdForGame,
  steamAppIdFromSources,
  steamAppIdSettingKey,
} from './steam-appid';
import type { GameSource } from '../shared/api';

function source(partial: Partial<GameSource> & Pick<GameSource, 'platform'>): GameSource {
  return {
    id: partial.id ?? 's1',
    platform: partial.platform,
    externalId: partial.externalId ?? null,
    title: partial.title ?? 'Game',
    installPath: null,
    executable: null,
    cwd: null,
    isInstalled: true,
    sizeBytes: null,
    lastPlayedAt: null,
    scannedAt: '2026-01-01',
    consoleId: null,
  };
}

describe('steam AppID / SteamDB', () => {
  it('steamDbInfoUrl monta URL correta', () => {
    expect(steamDbInfoUrl('730')).toBe('https://steamdb.info/app/730/');
    expect(steamDbInfoUrl(' 570 ')).toBe('https://steamdb.info/app/570/');
  });

  it('steamAppIdFromSources pega externalId da fonte Steam', () => {
    expect(
      steamAppIdFromSources([
        source({ platform: 'epic', externalId: 'abc' }),
        source({ platform: 'steam', externalId: '730' }),
      ])
    ).toBe('730');
    expect(steamAppIdFromSources([source({ platform: 'gog', externalId: '1' })])).toBeNull();
  });

  it('resolveSteamAppIdForGame prefere fonte Steam ao cache', () => {
    const cached = new Map([[steamAppIdSettingKey('g1'), '999']]);
    const appid = resolveSteamAppIdForGame(
      {
        id: 'g1',
        sources: [source({ platform: 'steam', externalId: '730' })],
      },
      cached
    );
    expect(appid).toBe('730');
  });

  it('resolveSteamAppIdForGame usa cache quando não há fonte Steam', () => {
    const cached = new Map([[steamAppIdSettingKey('g2'), '570']]);
    const appid = resolveSteamAppIdForGame(
      {
        id: 'g2',
        sources: [source({ platform: 'epic', externalId: 'foo' })],
      },
      cached
    );
    expect(appid).toBe('570');
  });
});
