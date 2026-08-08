import { describe, expect, it } from 'vitest';
import {
  DEFAULT_COLLAPSED_BANDS,
  MIN_REVIEWS_FOR_BAND,
  RATING_BAND_ORDER,
  groupByRatingBands,
  ratingBandId,
} from '@/lib/rating-bands';

describe('ratingBandId', () => {
  it('manda nota útil com poucas reviews para few-reviews', () => {
    expect(ratingBandId(99, 50)).toBe('few-reviews');
    expect(ratingBandId(99, MIN_REVIEWS_FOR_BAND - 1)).toBe('few-reviews');
  });

  it('mantém nota com reviews suficientes na faixa correta', () => {
    expect(ratingBandId(99, 500)).toBe('95-100');
    expect(ratingBandId(95, 100)).toBe('95-100');
    expect(ratingBandId(92, 200)).toBe('90-94');
    expect(ratingBandId(85, 200)).toBe('80-89');
    expect(ratingBandId(75, 200)).toBe('70-79');
    expect(ratingBandId(60, 200)).toBe('50-69');
    expect(ratingBandId(40, 200)).toBe('below-50');
  });

  it('com reviewCount null (legado) fica na faixa da nota', () => {
    expect(ratingBandId(99, null)).toBe('95-100');
    expect(ratingBandId(72, null)).toBe('70-79');
  });

  it('sem nota útil vai para unrated', () => {
    expect(ratingBandId(null, 500)).toBe('unrated');
    expect(ratingBandId(0, 500)).toBe('unrated');
    expect(ratingBandId(-1, null)).toBe('unrated');
  });
});

describe('groupByRatingBands', () => {
  const sample = [
    { id: 'a', title: 'Zebra', steamRating: 99, reviewCount: 500 },
    { id: 'b', title: 'Alpha', steamRating: 99, reviewCount: 500 },
    { id: 'c', title: 'FewHits', steamRating: 99, reviewCount: 50 },
    { id: 'd', title: 'Mid', steamRating: 82, reviewCount: 200 },
    { id: 'e', title: 'NoScore', steamRating: null, reviewCount: null },
    { id: 'f', title: 'LegacyHigh', steamRating: 96, reviewCount: null },
  ];

  it('ordena faixas e omite vazias; Poucas reviews no final', () => {
    const groups = groupByRatingBands(sample, -1);
    expect(groups.map((g) => g.id)).toEqual([
      '95-100',
      '80-89',
      'unrated',
      'few-reviews',
    ]);
    expect(groups[groups.length - 1].id).toBe('few-reviews');
    expect(RATING_BAND_ORDER.indexOf('few-reviews')).toBe(
      RATING_BAND_ORDER.length - 1
    );
  });

  it('ordena dentro da faixa por % e desempata por nome', () => {
    const groups = groupByRatingBands(sample, -1);
    const top = groups.find((g) => g.id === '95-100')!;
    // 99% primeiro; empate Alpha antes de Zebra; depois 96% LegacyHigh
    expect(top.games.map((g) => g.title)).toEqual([
      'Alpha',
      'Zebra',
      'LegacyHigh',
    ]);
  });

  it('agrupa few-reviews e unrated corretamente', () => {
    const groups = groupByRatingBands(sample, -1);
    const few = groups.find((g) => g.id === 'few-reviews')!;
    expect(few.games.map((g) => g.id)).toEqual(['c']);
    const unrated = groups.find((g) => g.id === 'unrated')!;
    expect(unrated.games.map((g) => g.id)).toEqual(['e']);
  });

  it('respeita direção ascendente dentro da faixa', () => {
    const groups = groupByRatingBands(
      [
        { id: 'lo', title: 'Lo', steamRating: 70, reviewCount: 200 },
        { id: 'hi', title: 'Hi', steamRating: 79, reviewCount: 200 },
      ],
      1
    );
    expect(groups[0].games.map((g) => g.id)).toEqual(['lo', 'hi']);
  });

  it('defaults de colapso incluem Sem nota e Poucas reviews', () => {
    expect(DEFAULT_COLLAPSED_BANDS).toEqual(['unrated', 'few-reviews']);
  });
});
