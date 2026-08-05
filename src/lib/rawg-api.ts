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
    .replace(/\bviii\b/g, '8')
    .replace(/\bvii\b/g, '7')
    .replace(/\bvi\b/g, '6')
    .replace(/\biv\b/g, '4')
    .replace(/\biii\b/g, '3')
    .replace(/\bii\b/g, '2')
    .replace(/\bv\b/g, '5')
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

/**
 * Variantes de título pra busca (edições, subtítulos, etc.).
 * Ordem: preferir o nome “canônico” primeiro.
 */
export function gameSearchTerms(...titles: string[]): string[] {
  const terms: string[] = [];
  const push = (raw: string) => {
    const s = raw
      .replace(/™|®|©/g, '')
      .replace(/[_/]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (
      s.length >= 2 &&
      !terms.some((t) => t.toLowerCase() === s.toLowerCase())
    ) {
      terms.push(s);
    }
  };

  for (const title of titles) {
    if (!title?.trim()) continue;
    push(title);
    push(title.replace(/\([^)]*\)/g, ' ').replace(/\[[^\]]*\]/g, ' '));
    const colon = title.split(':')[0];
    if (colon && colon.trim().length >= 3) push(colon);
    const dash = title.split(/\s+[—–|-]\s+/)[0];
    if (dash && dash.trim().length >= 3) push(dash);
    push(
      title.replace(
        /\b(game of the year|goty|deluxe|ultimate|definitive|complete|gold|premium|legendary|enhanced|remastered|hd|standard|edition|director'?s cut|anniversary|playtest)\b/gi,
        ' '
      )
    );
  }

  return terms.slice(0, 5);
}

export class RAWGAPI {
  private apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  async searchGames(
    query: string,
    page = 1
  ): Promise<RAWGSearchResponse> {
    // Sem search_precise e sem timeout curto — era assim que funcionava.
    // Timeout só como rede de segurança (RAWG às vezes demora >8s).
    const response = await axios.get(`${RAWG_API_BASE}/games`, {
      params: {
        key: this.apiKey,
        search: query,
        page,
        page_size: 20,
      },
      timeout: 30000,
    });
    return response.data;
  }

  async getGameDetails(id: number): Promise<RAWGGame> {
    const response = await axios.get(`${RAWG_API_BASE}/games/${id}`, {
      params: {
        key: this.apiKey,
      },
      timeout: 30000,
    });
    return response.data;
  }

  async getGameBySlug(slug: string): Promise<RAWGGame> {
    const response = await axios.get(`${RAWG_API_BASE}/games/${slug}`, {
      params: {
        key: this.apiKey,
      },
      timeout: 30000,
    });
    return response.data;
  }

  /**
   * Busca (como na versão inicial) + match + details.
   * alsoTry: nomes extras (ex. steam_matched_name) — tenta até achar.
   */
  async resolveRatingsForTitle(
    title: string,
    opts?: { alsoTry?: string[] }
  ): Promise<{
    rawg: number | null;
    metacritic: number | null;
    matchedName: string | null;
    slug: string | null;
    rawgUrl: string | null;
    metacriticUrl: string | null;
  }> {
    const empty = {
      rawg: null as number | null,
      metacritic: null as number | null,
      matchedName: null as string | null,
      slug: null as string | null,
      rawgUrl: null as string | null,
      metacriticUrl: null as string | null,
    };

    try {
      const terms = gameSearchTerms(title, ...(opts?.alsoTry || []));
      let match: RAWGGame | null = null;
      let matchedAgainst = title;

      for (const term of terms) {
        const search = await this.searchGames(term);
        // Pontua contra o título original e o termo buscado
        const fromOriginal = pickBestRawgMatch(title, search.results || []);
        const fromTerm =
          term === title
            ? fromOriginal
            : pickBestRawgMatch(term, search.results || []);
        const scoreOrig = fromOriginal
          ? titleMatchScore(title, fromOriginal.name)
          : -1;
        const scoreTerm = fromTerm
          ? titleMatchScore(title, fromTerm.name)
          : -1;
        const candidate =
          scoreOrig >= scoreTerm ? fromOriginal : fromTerm || fromOriginal;

        if (candidate) {
          match = candidate;
          matchedAgainst = term;
          break;
        }
      }

      if (!match) return empty;

      let details: RAWGGame = match;
      try {
        details = await this.getGameDetails(match.id);
      } catch {
        // fall back to search hit
      }

      const rawg =
        typeof details.rating === 'number' && details.rating > 0
          ? details.rating
          : typeof match.rating === 'number' && match.rating > 0
            ? match.rating
            : null;
      const metacritic =
        typeof details.metacritic === 'number' && details.metacritic > 0
          ? details.metacritic
          : typeof match.metacritic === 'number' && match.metacritic > 0
            ? match.metacritic
            : null;

      const slug = details.slug || match.slug || null;
      const matchedName = details.name || match.name;
      const rawgUrl = slug ? `https://rawg.io/games/${slug}` : null;
      // Metacritic via RAWG não traz slug MC; busca pelo nome no site
      const metacriticUrl = matchedName
        ? `https://www.metacritic.com/search/${encodeURIComponent(matchedName)}/`
        : null;

      void matchedAgainst;
      return {
        rawg,
        metacritic,
        matchedName,
        slug,
        rawgUrl,
        metacriticUrl,
      };
    } catch (error) {
      console.error('RAWG resolveRatingsForTitle error:', error);
      return empty;
    }
  }
}
