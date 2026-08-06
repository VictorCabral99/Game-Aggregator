import { net } from 'electron';
import type { ProviderGame } from '@gagg/core';
import { getSetting } from '../db';
import { getAuthRepository } from '../db';
import { getCurrentUserId } from '../auth';
import { isNonGameSteam } from './steam-filters';

function httpGetJson(url: string): Promise<any> {
  return new Promise((resolve, reject) => {
    const request = net.request({ method: 'GET', url });
    request.setHeader('Accept', 'application/json');
    let body = '';
    request.on('response', (res) => {
      res.on('data', (chunk) => (body += chunk));
      res.on('end', () => {
        if (res.statusCode && res.statusCode >= 400) {
          reject(new Error(`HTTP ${res.statusCode}: ${body.slice(0, 200)}`));
          return;
        }
        try {
          resolve(JSON.parse(body));
        } catch {
          reject(new Error(`JSON inválido: ${body.slice(0, 200)}`));
        }
      });
    });
    request.on('error', reject);
    request.end();
  });
}

export function resolveSteamId(): string | null {
  try {
    const userId = getCurrentUserId() ?? getAuthRepository().getFirstUserId();
    if (userId) {
      const acc = getAuthRepository().getPlatformAccount(userId, 'steam');
      if (acc?.externalUserId) return acc.externalUserId;
    }
  } catch {
    // ignore
  }
  return process.env.STEAM_ID?.trim() || getSetting('steam.id') || null;
}

export function resolveSteamApiKey(): string {
  return (process.env.STEAM_API_KEY ?? getSetting('keys.steam') ?? '').trim();
}

/** Biblioteca owned Steam via Web API (inclui não instalados). */
export async function fetchSteamOwnedGames(
  steamId: string,
  apiKey: string
): Promise<ProviderGame[]> {
  const url =
    `https://api.steampowered.com/IPlayerService/GetOwnedGames/v1/` +
    `?key=${encodeURIComponent(apiKey)}` +
    `&steamid=${encodeURIComponent(steamId)}` +
    `&include_appinfo=1&include_played_free_games=1&format=json`;

  const data = await httpGetJson(url);
  const list = data?.response?.games;
  if (!Array.isArray(list)) {
    throw new Error('Steam API: resposta sem lista de jogos (key/ID inválidos?)');
  }

  const games: ProviderGame[] = [];
  for (const g of list) {
    const appid = g?.appid != null ? String(g.appid) : '';
    const title = typeof g?.name === 'string' ? g.name.trim() : '';
    if (!appid || !title) continue;
    if (isNonGameSteam(appid, title)) continue;
    games.push({
      providerId: 'steam',
      externalId: appid,
      title,
      coverUrl: `https://cdn.cloudflare.steamstatic.com/steam/apps/${appid}/library_600x900.jpg`,
      raw: { playtimeForever: g.playtime_forever },
    });
  }
  return games.sort((a, b) => a.title.localeCompare(b.title));
}
