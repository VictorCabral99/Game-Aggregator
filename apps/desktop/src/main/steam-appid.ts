import { getSetting, initDatabase } from './db';
import type { Game, GameSource } from '../shared/api';
import { steamDbInfoUrl } from '../shared/api';

export { steamDbInfoUrl };

const APPID_PREFIX = 'steam.appid.';

export function steamAppIdSettingKey(gameId: string): string {
  return `${APPID_PREFIX}${gameId}`;
}

export function steamLookupSettingKey(gameId: string): string {
  return `steam.lookup.${gameId}`;
}

export function steamAppIdFromSources(sources: GameSource[]): string | null {
  return sources.find((s) => s.platform === 'steam' && s.externalId)?.externalId?.trim() || null;
}

/** Resolve AppID: fonte Steam → cache em settings. */
export function resolveSteamAppIdForGame(
  game: Pick<Game, 'id' | 'sources'>,
  cached?: Map<string, string>
): string | null {
  const fromSteam = steamAppIdFromSources(game.sources);
  if (fromSteam) return fromSteam;
  if (cached) {
    const v = cached.get(steamAppIdSettingKey(game.id))?.trim();
    if (v) return v;
  }
  return getSetting(steamAppIdSettingKey(game.id))?.trim() || null;
}

/** Carrega todos os `steam.appid.*` de uma vez (evita N+1 no list). */
export function loadSteamAppIdSettings(): Map<string, string> {
  const rows = initDatabase()
    .prepare(`SELECT key, value FROM app_settings WHERE key LIKE ?`)
    .all(`${APPID_PREFIX}%`) as Array<{ key: string; value: string }>;
  const map = new Map<string, string>();
  for (const row of rows) {
    if (row.value?.trim()) map.set(row.key, row.value.trim());
  }
  return map;
}

export function withSteamAppId(game: Game, cached?: Map<string, string>): Game {
  return {
    ...game,
    steamAppId: resolveSteamAppIdForGame(game, cached),
  };
}

export function withSteamAppIds(games: Game[]): Game[] {
  const cached = loadSteamAppIdSettings();
  return games.map((g) => withSteamAppId(g, cached));
}
