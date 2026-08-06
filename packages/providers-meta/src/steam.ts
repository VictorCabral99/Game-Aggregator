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

/** Fetch que não lança em HTTP 4xx/5xx (SearchApps às vezes responde vazio). */
async function getJsonLoose<T>(url: string, timeoutMs = 8000): Promise<T | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { 'Accept-Language': 'en' },
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
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

export interface SteamFindAppResult {
  appid: number | null;
  matchedName: string | null;
  score?: number;
  query?: string;
}

/** Gera termos de busca mais limpos a partir do título da loja. */
export function steamSearchTerms(title: string): string[] {
  const terms: string[] = [];
  const push = (raw: string) => {
    const s = raw
      .replace(/™|®|©/g, '')
      .replace(/[_/]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (s.length >= 2 && !terms.some((t) => t.toLowerCase() === s.toLowerCase())) {
      terms.push(s);
    }
  };

  push(title);
  push(title.replace(/\([^)]*\)/g, ' ').replace(/\[[^\]]*\]/g, ' '));
  const colon = title.split(':')[0];
  if (colon && colon.trim().length >= 3) push(colon);
  const dash = title.split(/\s+[—–|-]\s+/)[0];
  if (dash && dash.trim().length >= 3) push(dash);
  push(
    title.replace(
      /\b(game of the year|goty|deluxe|ultimate|definitive|complete|gold|premium|legendary|enhanced|remastered|hd|standard|edition|director'?s cut|anniversary)\b/gi,
      ' '
    )
  );

  return terms.slice(0, 5);
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

  /**
   * Resolve Steam appid pelo título.
   * Tenta variantes + SearchApps (community) e storesearch. Threshold 300.
   */
  async findAppIdByTitle(title: string): Promise<SteamFindAppResult> {
    const terms = steamSearchTerms(title);
    if (terms.length === 0) return { appid: null, matchedName: null };

    const state: {
      best: { id: number; name: string; score: number; query: string } | null;
    } = { best: null };

    const consider = (candidateName: string, candidateId: number, query: string) => {
      const score = Math.max(
        titleMatchScore(title, candidateName),
        titleMatchScore(query, candidateName)
      );
      if (!state.best || score > state.best.score) {
        state.best = { id: candidateId, name: candidateName, score, query };
      }
    };

    for (const term of terms) {
      const community = await getJsonLoose<Array<{ appid?: number; id?: number; name?: string }>>(
        `https://steamcommunity.com/actions/SearchApps/${encodeURIComponent(term)}`
      );
      if (Array.isArray(community)) {
        for (const row of community) {
          const id = Number(row?.appid ?? row?.id);
          const name = String(row?.name || '').trim();
          if (!id || !name) continue;
          consider(name, id, term);
        }
      }

      if (state.best && state.best.score >= 800) break;

      const store = await getJsonLoose<{
        items?: Array<{ type?: string; name?: string; id?: number }>;
      }>(
        `${STEAM_STORE_BASE}/api/storesearch/?${new URLSearchParams({
          term,
          l: 'english',
          cc: 'US',
        }).toString()}`
      );
      for (const item of store?.items || []) {
        if (item.type && item.type !== 'app') continue;
        const id = Number(item.id);
        const name = String(item.name || '').trim();
        if (!id || !name) continue;
        consider(name, id, term);
      }

      if (state.best && state.best.score >= 800) break;
    }

    const best = state.best;
    // 300 ≈ overlap forte; 600 = substring; 800+ = prefix/exato
    if (!best || best.score < 300) {
      return {
        appid: null,
        matchedName: best?.name ?? null,
        score: best?.score,
        query: best?.query ?? terms[0],
      };
    }

    return {
      appid: best.id,
      matchedName: best.name,
      score: best.score,
      query: best.query,
    };
  }

  /**
   * Wishlist Steam via IWishlistService/GetWishlist (só steamid; key opcional).
   * Enriquecimento de nomes via Store appdetails em blocos de 5 (rate limit).
   */
  async getWishlist(
    steamId: string,
    apiKey?: string
  ): Promise<{ games: SteamWishlistGame[]; error?: string; warning?: string }> {
    const params = new URLSearchParams({ steamid: steamId });
    if (apiKey?.trim()) params.set('key', apiKey.trim());
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
        warning:
          'Steam wishlist vazia ou privada — em Privacidade do perfil, a wishlist deve ser pública',
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
