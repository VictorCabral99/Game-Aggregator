import axios from 'axios';
import { titleMatchScore } from '@/lib/rawg-api';

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
    try {
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
    } catch (error) {
      if (axios.isAxiosError(error) && (error.response?.status === 401 || error.response?.status === 403)) {
        throw new Error(
          'STEAM_API_KEY inválida ou rejeitada pela Steam (gere em https://steamcommunity.com/dev/apikey)'
        );
      }
      throw error;
    }
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

  async getWishlist(steamId: string): Promise<{
    games: SteamWishlistGame[];
    error?: string;
    warning?: string;
  }> {
    try {
      // Old store wishlistdata endpoint is dead; use IWishlistService
      const response = await axios.get(
        `${STEAM_API_BASE}/IWishlistService/GetWishlist/v1/`,
        {
          params: {
            key: this.apiKey,
            steamid: steamId,
          },
          validateStatus: () => true,
        }
      );

      if (response.status >= 400) {
        console.error('Steam GetWishlist HTTP', response.status);
        return {
          games: [],
          error:
            response.status === 401 || response.status === 403
              ? 'Steam wishlist: API key inválida ou sem permissão'
              : `Steam wishlist: erro HTTP ${response.status}`,
        };
      }

      const items = response.data?.response?.items || [];
      if (!Array.isArray(items) || items.length === 0) {
        return {
          games: [],
          warning:
            'Steam wishlist vazia ou privada — em Privacidade do perfil, wishlist deve ser pública',
        };
      }

      const base: SteamWishlistGame[] = items.map(
        (item: { appid: number; priority?: number; date_added?: number }) => ({
          appid: Number(item.appid),
          name: `App ${item.appid}`,
          priority: item.priority ?? 0,
          added: item.date_added ?? 0,
        })
      );

      // Enrich names via Store appdetails (chunks of 5 — Steam rate-limits)
      const byId = new Map(base.map((g) => [g.appid, g]));
      const ids = base.map((g) => g.appid);
      for (let i = 0; i < ids.length; i += 5) {
        const chunk = ids.slice(i, i + 5);
        await Promise.all(
          chunk.map(async (appid) => {
            try {
              const detail = await axios.get(
                `${STEAM_STORE_BASE}/api/appdetails`,
                {
                  params: { appids: appid, filters: 'basic' },
                  timeout: 10000,
                  validateStatus: () => true,
                }
              );
              const entry = detail.data?.[String(appid)];
              if (entry?.success && entry.data?.name) {
                const game = byId.get(appid);
                if (game) game.name = entry.data.name;
              }
            } catch {
              // keep placeholder name
            }
          })
        );
        if (i + 5 < ids.length) {
          await new Promise((r) => setTimeout(r, 200));
        }
      }

      return { games: Array.from(byId.values()) };
    } catch (error) {
      console.error('Steam wishlist fetch error:', error);
      return { games: [], error: 'Steam wishlist: falha de rede' };
    }
  }

  /**
   * % de reviews positivas (0–100), mesma base do store / SteamDB.
   * Não precisa de API key.
   */
  async getReviewScore(appid: number | string): Promise<{
    percent: number | null;
    totalReviews: number;
    description: string | null;
  }> {
    const id = typeof appid === 'string' ? parseInt(appid, 10) : appid;
    if (!id || Number.isNaN(id)) {
      return { percent: null, totalReviews: 0, description: null };
    }

    try {
      const response = await axios.get(
        `${STEAM_STORE_BASE}/appreviews/${id}`,
        {
          params: {
            json: 1,
            language: 'all',
            purchase_type: 'all',
            num_per_page: 0,
          },
          timeout: 10000,
          validateStatus: () => true,
        }
      );

      const summary = response.data?.query_summary;
      const total = Number(summary?.total_reviews) || 0;
      const positive = Number(summary?.total_positive) || 0;
      if (total <= 0) {
        return {
          percent: null,
          totalReviews: 0,
          description: summary?.review_score_desc || null,
        };
      }

      return {
        percent: Math.round((positive / total) * 1000) / 10,
        totalReviews: total,
        description: summary?.review_score_desc || null,
      };
    } catch (error) {
      console.error('Steam review score error:', error);
      return { percent: null, totalReviews: 0, description: null };
    }
  }

  /**
   * Resolve Steam appid by title via Store search (for links / reviews).
   */
  async findAppIdByTitle(title: string): Promise<{
    appid: number | null;
    matchedName: string | null;
  }> {
    const q = title.trim();
    if (!q) return { appid: null, matchedName: null };

    try {
      const response = await axios.get(`${STEAM_STORE_BASE}/api/storesearch/`, {
        params: { term: q, l: 'english', cc: 'US' },
        timeout: 5000,
        validateStatus: () => true,
      });

      const items = (response.data?.items || []) as {
        type?: string;
        name?: string;
        id?: number;
      }[];

      let best: { id: number; name: string; score: number } | null = null;
      for (const item of items) {
        if (item.type && item.type !== 'app') continue;
        if (!item.id || !item.name) continue;
        const score = titleMatchScore(q, item.name);
        if (!best || score > best.score) {
          best = { id: item.id, name: item.name, score };
        }
      }

      if (!best || best.score < 100) {
        return { appid: null, matchedName: null };
      }

      return { appid: best.id, matchedName: best.name };
    } catch (error) {
      console.error('Steam store search error:', error);
      return { appid: null, matchedName: null };
    }
  }
}
