import axios from 'axios';

const STEAM_API_BASE = 'https://api.steampowered.com';
const STEAM_STORE_BASE = 'https://store.steampowered.com';

export interface SteamGame {
  appid: number;
  name: string;
  playtime_forever: number;
  img_icon_url: string;
  img_logo_url: string;
  has_community_visible_stats?: boolean;
}

export interface SteamOwnedGamesResponse {
  response: {
    game_count: number;
    games: SteamGame[];
  };
}

export interface SteamWishlistGame {
  appid: number;
  name: string;
  priority: number;
  added: number;
  price_overview?: {
    currency: string;
    initial: number;
    final: number;
    discount_percent: number;
  };
  capsule?: string;
}

export class SteamAPI {
  private apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  async getOwnedGames(steamId: string): Promise<SteamOwnedGamesResponse> {
    const response = await axios.get(
      `${STEAM_API_BASE}/IPlayerService/GetOwnedGames/v0001/`,
      {
        params: {
          key: this.apiKey,
          steamid: steamId,
          include_appinfo: true,
          include_played_free_games: true,
        },
      }
    );
    return response.data;
  }

  async getPlayerSummaries(steamIds: string[]) {
    const response = await axios.get(
      `${STEAM_API_BASE}/ISteamUser/GetPlayerSummaries/v0002/`,
      {
        params: {
          key: this.apiKey,
          steamids: steamIds.join(','),
        },
      }
    );
    return response.data;
  }

  async resolveVanityUrl(vanityUrl: string): Promise<string | null> {
    const clean = vanityUrl
      .replace(/^https?:\/\/steamcommunity\.com\/(id|profiles)\//, '')
      .replace(/\/$/, '');

    if (/^\d{17}$/.test(clean)) {
      return clean;
    }

    const response = await axios.get(
      `${STEAM_API_BASE}/ISteamUser/ResolveVanityURL/v0001/`,
      {
        params: {
          key: this.apiKey,
          vanityurl: clean,
        },
      }
    );

    if (response.data?.response?.success === 1) {
      return response.data.response.steamid as string;
    }

    return null;
  }

  async getWishlist(steamId: string): Promise<SteamWishlistGame[]> {
    try {
      const response = await axios.get(
        `${STEAM_STORE_BASE}/wishlist/profiles/${steamId}/wishlistdata/`,
        {
          headers: {
            'User-Agent':
              'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            Accept: 'application/json',
          },
          params: { p: 0 },
        }
      );

      const data = response.data;
      if (!data || typeof data !== 'object' || data.success === 2) {
        return [];
      }

      return Object.entries(data).map(([appid, item]: [string, any]) => ({
        appid: Number(appid),
        name: item.name || `App ${appid}`,
        priority: item.priority ?? 0,
        added: item.added ?? 0,
        price_overview: item.subs?.[0]
          ? {
              currency: 'USD',
              initial: item.subs[0].price || 0,
              final: item.subs[0].price || 0,
              discount_percent: item.subs[0].discount_pct || 0,
            }
          : undefined,
        capsule: item.capsule,
      }));
    } catch (error) {
      console.error('Steam wishlist fetch error:', error);
      return [];
    }
  }
}
