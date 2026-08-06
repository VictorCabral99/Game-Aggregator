import axios from 'axios';
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { SteamAPI, steamSearchTerms } from '@/lib/steam-api';

vi.mock('axios');

const axiosGet = axios.get as unknown as Mock;

describe('steamSearchTerms', () => {
  it('remove marcas registradas dos termos', () => {
    const terms = steamSearchTerms('Game™ Deluxe Edition');
    expect(terms.every((t) => !t.includes('™'))).toBe(true);
  });

  it('adiciona prefixos por dois-pontos/traço, termo sem edição e limita a 5', () => {
    const terms = steamSearchTerms(
      'The Witcher 3: Wild Hunt — Complete Edition'
    );
    expect(terms.length).toBeGreaterThan(0);
    expect(terms.length).toBeLessThanOrEqual(5);
    expect(terms.some((t) => t.toLowerCase().includes('witcher'))).toBe(true);
    expect(
      terms.some(
        (t) => /witcher/i.test(t) && !/\b(complete|edition)\b/i.test(t)
      )
    ).toBe(true);
  });
});

describe('SteamAPI.findAppIdByTitle', () => {
  const api = new SteamAPI('test-key');

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('retorna null quando a melhor pontuação fica abaixo de 300', async () => {
    axiosGet.mockResolvedValue({
      data: [{ appid: 1, name: 'Completely Unrelated Title' }],
    });

    const result = await api.findAppIdByTitle('Celeste');
    expect(result.appid).toBeNull();
    expect(result.score === undefined || result.score < 300).toBe(true);
  });

  it('retorna o appid quando a pontuação é pelo menos 300', async () => {
    axiosGet.mockResolvedValue({
      data: [{ appid: 504230, name: 'Celeste' }],
    });

    const result = await api.findAppIdByTitle('Celeste');
    expect(result.appid).toBe(504230);
    expect(result.matchedName).toBe('Celeste');
    expect(result.score).toBeGreaterThanOrEqual(300);
  });

  it('para cedo após match exato/prefixo (>=800)', async () => {
    axiosGet.mockResolvedValue({
      data: [{ appid: 504230, name: 'Celeste' }],
    });

    await api.findAppIdByTitle('Celeste');

    // SearchApps com score 1000 → break antes do storesearch e dos demais termos
    const urls = axiosGet.mock.calls.map((c: unknown[]) => String(c[0]));
    expect(urls.some((u: string) => u.includes('SearchApps'))).toBe(true);
    expect(urls.some((u: string) => u.includes('storesearch'))).toBe(false);
  });
});
