import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SteamAPI, steamSearchTerms } from './steam';

describe('steamSearchTerms', () => {
  it('gera variantes limpas do título', () => {
    const terms = steamSearchTerms('Hades II: Deluxe Edition');
    expect(terms[0]).toMatch(/Hades II/i);
    expect(terms.length).toBeGreaterThan(1);
    expect(terms.length).toBeLessThanOrEqual(5);
  });

  it('remove edições comuns', () => {
    const terms = steamSearchTerms('Celeste Game of the Year Edition');
    expect(terms.some((t) => /celeste/i.test(t) && !/edition/i.test(t))).toBe(true);
  });
});

describe('SteamAPI.getReviewScore', () => {
  const api = new SteamAPI();

  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        json: async () => ({
          query_summary: {
            total_reviews: 100,
            total_positive: 87,
            review_score_desc: 'Very Positive',
          },
        }),
      }))
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('retorna null para appid inválido sem chamar a rede', async () => {
    const result = await api.getReviewScore('abc');
    expect(result.percent).toBeNull();
    expect(fetch).not.toHaveBeenCalled();
  });

  it('calcula o percentual de reviews positivas', async () => {
    const result = await api.getReviewScore(504230);
    expect(result.percent).toBe(87);
    expect(result.totalReviews).toBe(100);
    expect(result.description).toBe('Very Positive');
  });

  it('retorna null quando não há reviews', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        json: async () => ({
          query_summary: { total_reviews: 0, total_positive: 0 },
        }),
      }))
    );
    const result = await api.getReviewScore(1);
    expect(result.percent).toBeNull();
    expect(result.totalReviews).toBe(0);
  });
});

describe('SteamAPI.findAppIdByTitle', () => {
  const api = new SteamAPI();

  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('retorna null para título vazio', async () => {
    const result = await api.findAppIdByTitle('  ');
    expect(result).toEqual({ appid: null, matchedName: null });
    expect(fetch).not.toHaveBeenCalled();
  });

  it('retorna null quando a melhor pontuação fica abaixo de 300', async () => {
    vi.mocked(fetch).mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes('SearchApps')) {
        return {
          ok: true,
          json: async () => [{ appid: 1, name: 'Completely Unrelated Title' }],
        } as Response;
      }
      return {
        ok: true,
        json: async () => ({
          items: [{ type: 'app', id: 1, name: 'Completely Unrelated Title' }],
        }),
      } as Response;
    });

    const result = await api.findAppIdByTitle('Celeste');
    expect(result.appid).toBeNull();
  });

  it('retorna o appid do melhor match via SearchApps', async () => {
    vi.mocked(fetch).mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes('SearchApps')) {
        return {
          ok: true,
          json: async () => [
            { appid: 99, name: 'Celestia' },
            { appid: 504230, name: 'Celeste' },
          ],
        } as Response;
      }
      return { ok: true, json: async () => ({ items: [] }) } as Response;
    });

    const result = await api.findAppIdByTitle('Celeste');
    expect(result.appid).toBe(504230);
    expect(result.matchedName).toBe('Celeste');
    expect(result.score).toBeGreaterThanOrEqual(300);
  });

  it('ignora itens que não são app no storesearch', async () => {
    vi.mocked(fetch).mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes('SearchApps')) {
        return { ok: true, json: async () => [] } as Response;
      }
      return {
        ok: true,
        json: async () => ({
          items: [
            { type: 'bundle', id: 1, name: 'Celeste' },
            { type: 'app', id: 504230, name: 'Celeste' },
          ],
        }),
      } as Response;
    });

    const result = await api.findAppIdByTitle('Celeste');
    expect(result.appid).toBe(504230);
  });
});

describe('SteamAPI.getWishlist', () => {
  const api = new SteamAPI();

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('chama GetWishlist só com steamid quando não há key', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        expect(url).toContain('IWishlistService/GetWishlist');
        expect(url).toContain('steamid=76561198000000000');
        expect(url).not.toContain('key=');
        return {
          ok: true,
          json: async () => ({
            response: { items: [{ appid: 620, priority: 0, date_added: 1 }] },
          }),
        } as Response;
      })
    );

    // appdetails enrichment
    vi.mocked(fetch).mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes('GetWishlist')) {
        return {
          ok: true,
          json: async () => ({
            response: { items: [{ appid: 620, priority: 0, date_added: 1 }] },
          }),
        } as Response;
      }
      return {
        ok: true,
        json: async () => ({
          '620': { success: true, data: { name: 'Portal 2' } },
        }),
      } as Response;
    });

    const res = await api.getWishlist('76561198000000000');
    expect(res.error).toBeUndefined();
    expect(res.games).toHaveLength(1);
    expect(res.games[0]?.name).toBe('Portal 2');
    expect(res.games[0]?.appid).toBe(620);
  });
});
