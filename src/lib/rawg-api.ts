import axios from 'axios';

const RAWG_API_BASE = 'https://api.rawg.io/api';

export interface RAWGGame {
  id: number;
  slug: string;
  name: string;
  released: string;
  tba: boolean;
  background_image: string;
  rating: number;
  rating_top: number;
  ratings_count: number;
  reviews_text_count: number;
  metacritic: number | null;
  playtime: number;
  suggestions_count: number;
  updated: string;
}

export interface RAWGSearchResponse {
  count: number;
  next: string | null;
  previous: string | null;
  results: RAWGGame[];
}

export function normalizeGameTitle(title: string): string {
  return title
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/™|®|©/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

/** Score how well a candidate name matches the query (higher is better). */
export function titleMatchScore(query: string, candidate: string): number {
  const q = normalizeGameTitle(query);
  const c = normalizeGameTitle(candidate);
  if (!q || !c) return 0;
  if (q === c) return 1000;
  if (c.startsWith(q) || q.startsWith(c)) return 800;
  if (c.includes(q) || q.includes(c)) return 600;

  const qTokens = q.split(' ').filter(Boolean);
  const cTokens = new Set(c.split(' ').filter(Boolean));
  const overlap = qTokens.filter((t) => cTokens.has(t)).length;
  if (overlap === 0) return 0;
  return 100 + overlap * 50 + (overlap === qTokens.length ? 100 : 0);
}

export function pickBestRawgMatch(
  query: string,
  results: RAWGGame[]
): RAWGGame | null {
  if (!results.length) return null;

  let best: RAWGGame | null = null;
  let bestScore = 0;
  for (const game of results.slice(0, 12)) {
    const score = titleMatchScore(query, game.name);
    if (score > bestScore) {
      bestScore = score;
      best = game;
    }
  }

  // Reject very weak matches (e.g. query "DREDGE" → "Judge Dredd")
  if (!best || bestScore < 100) return null;
  return best;
}

export class RAWGAPI {
  private apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  async searchGames(query: string, page = 1): Promise<RAWGSearchResponse> {
    const response = await axios.get(`${RAWG_API_BASE}/games`, {
      params: {
        key: this.apiKey,
        search: query,
        page,
        page_size: 20,
        search_precise: true,
      },
    });
    return response.data;
  }

  async getGameDetails(id: number): Promise<RAWGGame> {
    const response = await axios.get(`${RAWG_API_BASE}/games/${id}`, {
      params: {
        key: this.apiKey,
      },
    });
    return response.data;
  }

  async getGameBySlug(slug: string): Promise<RAWGGame> {
    const response = await axios.get(`${RAWG_API_BASE}/games/${slug}`, {
      params: {
        key: this.apiKey,
      },
    });
    return response.data;
  }

  /**
   * Search + best title match + details (for community rating + metacritic).
   */
  async resolveRatingsForTitle(title: string): Promise<{
    rawg: number | null;
    metacritic: number | null;
    matchedName: string | null;
  }> {
    const search = await this.searchGames(title);
    const match = pickBestRawgMatch(title, search.results || []);
    if (!match) {
      return { rawg: null, metacritic: null, matchedName: null };
    }

    let details: RAWGGame = match;
    try {
      details = await this.getGameDetails(match.id);
    } catch {
      // fall back to search hit
    }

    const rawg =
      typeof details.rating === 'number' && details.rating > 0
        ? details.rating
        : null;
    const metacritic =
      typeof details.metacritic === 'number' && details.metacritic > 0
        ? details.metacritic
        : typeof match.metacritic === 'number' && match.metacritic > 0
          ? match.metacritic
          : null;

    return {
      rawg,
      metacritic,
      matchedName: details.name || match.name,
    };
  }
}
