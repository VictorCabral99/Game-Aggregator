import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SteamAPI } from './steam';

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

  it('retorna null quando a melhor pontuação fica abaixo de 100', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({
        items: [{ type: 'app', id: 1, name: 'Completely Unrelated Title' }],
      }),
    } as Response);

    const result = await api.findAppIdByTitle('Celeste');
    expect(result.appid).toBeNull();
  });

  it('retorna o appid do melhor match', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({
        items: [
          { type: 'app', id: 99, name: 'Celestia' },
          { type: 'app', id: 504230, name: 'Celeste' },
        ],
      }),
    } as Response);

    const result = await api.findAppIdByTitle('Celeste');
    expect(result.appid).toBe(504230);
    expect(result.matchedName).toBe('Celeste');
  });

  it('ignora itens que não são app', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({
        items: [
          { type: 'bundle', id: 1, name: 'Celeste' },
          { type: 'app', id: 504230, name: 'Celeste' },
        ],
      }),
    } as Response);

    const result = await api.findAppIdByTitle('Celeste');
    expect(result.appid).toBe(504230);
  });
});
