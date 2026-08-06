import { describe, expect, it } from 'vitest';
import {
  isDealEligible,
  isFreshUseful,
  ratingOf,
  resolveSteamAppId,
} from '@/lib/sync-eligibility';

describe('resolveSteamAppId', () => {
  it('parseia o externalId da plataforma steam', () => {
    expect(resolveSteamAppId('steam', '570', {})).toBe(570);
  });

  it('ignora externalId não-steam e usa gameData.appid', () => {
    expect(resolveSteamAppId('gog', 'abc', { appid: 12345 })).toBe(12345);
    expect(resolveSteamAppId('epic', 'x', { steam_appid: '730' })).toBe(730);
  });

  it('retorna null para ids inválidos', () => {
    expect(resolveSteamAppId('steam', '0', {})).toBeNull();
    expect(resolveSteamAppId('steam', 'nope', {})).toBeNull();
    expect(resolveSteamAppId('gog', 'x', {})).toBeNull();
    expect(resolveSteamAppId('gog', 'x', { appid: '' })).toBeNull();
  });
});

describe('ratingOf', () => {
  it('encontra a linha da fonte ou retorna null', () => {
    const now = new Date();
    const ratings = [
      { source: 'steam', rating: 90, lastUpdated: now },
      { source: 'rawg', rating: null, lastUpdated: now },
    ];
    expect(ratingOf(ratings, 'steam')).toEqual({
      rating: 90,
      lastUpdated: now,
    });
    expect(ratingOf(ratings, 'metacritic')).toBeNull();
  });
});

describe('isFreshUseful', () => {
  const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;

  it('é falso para nota ausente, null ou não positiva', () => {
    expect(isFreshUseful(null, cutoff)).toBe(false);
    expect(
      isFreshUseful({ rating: null, lastUpdated: new Date() }, cutoff)
    ).toBe(false);
    expect(
      isFreshUseful({ rating: 0, lastUpdated: new Date() }, cutoff)
    ).toBe(false);
  });

  it('é verdadeiro só quando rating > 0 e lastUpdated >= cutoff', () => {
    expect(
      isFreshUseful({ rating: 85, lastUpdated: new Date() }, cutoff)
    ).toBe(true);
    expect(
      isFreshUseful(
        {
          rating: 85,
          lastUpdated: new Date(cutoff - 1000),
        },
        cutoff
      )
    ).toBe(false);
  });
});

describe('isDealEligible', () => {
  const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;

  it('é sempre elegível quando force=true', () => {
    expect(
      isDealEligible(
        [
          {
            source: 'itad',
            currentPrice: 10,
            lastUpdated: new Date(),
          },
        ],
        true,
        cutoff
      )
    ).toBe(true);
  });

  it('é elegível quando não há deal itad ou o preço é null', () => {
    expect(isDealEligible([], false, cutoff)).toBe(true);
    expect(
      isDealEligible(
        [{ source: 'itad', currentPrice: null, lastUpdated: new Date() }],
        false,
        cutoff
      )
    ).toBe(true);
  });

  it('é elegível quando o deal está velho, e não quando está fresco', () => {
    expect(
      isDealEligible(
        [
          {
            source: 'itad',
            currentPrice: 19.9,
            lastUpdated: new Date(cutoff - 1000),
          },
        ],
        false,
        cutoff
      )
    ).toBe(true);
    expect(
      isDealEligible(
        [
          {
            source: 'itad',
            currentPrice: 19.9,
            lastUpdated: new Date(),
          },
        ],
        false,
        cutoff
      )
    ).toBe(false);
  });
});
