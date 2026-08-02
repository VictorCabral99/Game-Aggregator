const STEAM_STORE_BASE = 'https://store.steampowered.com';

import { titleMatchScore } from './rawg';

async function getJson<T>(url: string, timeoutMs = 10000): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status} para ${url}`);
    return (await res.json()) as T;
  } finally {
    clearTimeout(timer);
  }
}

export interface SteamReviewScore {
  percent: number | null;
  totalReviews: number;
  description: string | null;
}

export interface SteamWishlistGame {
  appid: number;
  name: string;
  priority: number;
  added: number;
}

export class SteamAPI {
  /** % de reviews positivas da store (endpoint público, sem API key). */
  async getReviewScore(appid: number | string): Promise<SteamReviewScore> {
    const id = typeof appid === 'string' ? parseInt(appid, 10) : appid;
    if (!id || Number.isNaN(id)) {
      return { percent: null, totalReviews: 0, description: null };
    }

    try {
      const params = new URLSearchParams({
        json: '1',
        language: 'all',
        purchase_type: 'all',
        num_per_page: '0',
      });
      const data = await getJson<{
        query_summary?: {
          total_reviews?: number;
          total_positive?: number;
          review_score_desc?: string;
        };
      }>(`${STEAM_STORE_BASE}/appreviews/${id}?${params.toString()}`);

      const summary = data?.query_summary;
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
    } catch {
      return { percent: null, totalReviews: 0, description: null };
    }
  }

  async findAppIdByTitle(title: string): Promise<{ appid: number | null; matchedName: string | null }> {
    const q = title.trim();
    if (!q) return { appid: null, matchedName: null };

    try {
      const params = new URLSearchParams({ term: q, l: 'english', cc: 'US' });
      const data = await getJson<{ items?: Array<{ type?: string; name?: string; id?: number }> }>(
        `${STEAM_STORE_BASE}/api/storesearch/?${params.toString()}`
      );

      const items = data?.items || [];
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
    } catch {
      return { appid: null, matchedName: null };
    }
  }

  /**
   * Wishlist Steam via IWishlistService/GetWishlist (precisa de API key).
   * Enriquecimento de nomes via Store appdetails em blocos de 5 (rate limit).
   */
  async getWishlist(
    steamId: string,
    apiKey: string
  ): Promise<{ games: SteamWishlistGame[]; error?: string; warning?: string }> {
    const params = new URLSearchParams({ key: apiKey, steamid: steamId });
    let data: { response?: { items?: Array<{ appid: number; priority?: number; date_added?: number }> } };
    try {
      data = await getJson<{
        response?: { items?: Array<{ appid: number; priority?: number; date_added?: number }> };
      }>(`https://api.steampowered.com/IWishlistService/GetWishlist/v1/?${params.toString()}`, 15000);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'falha de rede';
      return { games: [], error: `Steam wishlist: ${msg}` };
    }

    const items = data?.response?.items || [];
    if (!Array.isArray(items) || items.length === 0) {
      return {
        games: [],
        warning: 'Steam wishlist vazia ou privada — em Privacidade do perfil, a wishlist deve ser pública',
      };
    }

    const base: SteamWishlistGame[] = items.map((item) => ({
      appid: Number(item.appid),
      name: `App ${item.appid}`,
      priority: item.priority ?? 0,
      added: item.date_added ?? 0,
    }));

    const byId = new Map(base.map((g) => [g.appid, g]));
    const ids = base.map((g) => g.appid);
    for (let i = 0; i < ids.length; i += 5) {
      const chunk = ids.slice(i, i + 5);
      await Promise.all(
        chunk.map(async (appid) => {
          try {
            const detail = await getJson<Record<string, { success?: boolean; data?: { name?: string } }>>(
              `${STEAM_STORE_BASE}/api/appdetails?${new URLSearchParams({ appids: String(appid), filters: 'basic' }).toString()}`,
              10000
            );
            const entry = detail?.[String(appid)];
            if (entry?.success && entry.data?.name) {
              const game = byId.get(appid);
              if (game) game.name = entry.data.name;
            }
          } catch {
            // mantém nome placeholder
          }
        })
      );
      if (i + 5 < ids.length) {
        await new Promise((r) => setTimeout(r, 200));
      }
    }

    return { games: Array.from(byId.values()) };
  }
}
