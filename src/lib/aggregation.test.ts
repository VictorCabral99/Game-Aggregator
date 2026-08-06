import { describe, expect, it } from 'vitest';
import { RatingAggregator } from '@/lib/aggregation';

describe('RatingAggregator.calculateAverage', () => {
  it('retorna 0 quando não há notas válidas', () => {
    expect(RatingAggregator.calculateAverage([])).toBe(0);
    expect(
      RatingAggregator.calculateAverage([
        { source: 'steam', rating: null, reviewCount: null, url: null },
        { source: 'rawg', rating: 0, reviewCount: null, url: null },
      ])
    ).toBe(0);
  });

  it('calcula a média das notas válidas e arredonda para 1 casa decimal', () => {
    expect(
      RatingAggregator.calculateAverage([
        { source: 'metacritic', rating: 80, reviewCount: null, url: null },
        { source: 'steam', rating: 90, reviewCount: null, url: null },
      ])
    ).toBe(85);
    expect(
      RatingAggregator.calculateAverage([
        { source: 'a', rating: 10, reviewCount: null, url: null },
        { source: 'b', rating: 20, reviewCount: null, url: null },
        { source: 'c', rating: 30, reviewCount: null, url: null },
      ])
    ).toBe(20);
  });
});

describe('RatingAggregator.calculateWeighted', () => {
  it('retorna 0 quando a lista está vazia', () => {
    expect(RatingAggregator.calculateWeighted([])).toBe(0);
  });

  it('pondera Metacritic e normaliza RAWG de 0-5 para 0-100', () => {
    // meta 80 * 0.6 + rawg(4*20=80) * 0.4 = 48 + 32 = 80
    expect(
      RatingAggregator.calculateWeighted([
        { source: 'metacritic', rating: 80, reviewCount: null, url: null },
        { source: 'rawg', rating: 4, reviewCount: null, url: null },
      ])
    ).toBe(80);
  });

  it('usa peso padrão 0.25 para fontes desconhecidas', () => {
    expect(
      RatingAggregator.calculateWeighted([
        { source: 'steam', rating: 100, reviewCount: null, url: null },
      ])
    ).toBe(100);
  });
});

describe('RatingAggregator.aggregate', () => {
  it('sempre retorna linhas metacritic, rawg e steam (mantém nulls)', () => {
    const rows = RatingAggregator.aggregate(null, null, null);
    expect(rows.map((r) => r.source)).toEqual(['metacritic', 'rawg', 'steam']);
    expect(rows.every((r) => r.rating === null)).toBe(true);
  });

  it('repassa as notas fornecidas', () => {
    const rows = RatingAggregator.aggregate(85, 4.2, 92);
    expect(rows.find((r) => r.source === 'metacritic')?.rating).toBe(85);
    expect(rows.find((r) => r.source === 'rawg')?.rating).toBe(4.2);
    expect(rows.find((r) => r.source === 'steam')?.rating).toBe(92);
  });
});

describe('RatingAggregator.toDisplayScore', () => {
  it('retorna null quando a nota é null', () => {
    expect(RatingAggregator.toDisplayScore('rawg', null)).toBeNull();
  });

  it('escala notas RAWG <= 5 para 0-100', () => {
    expect(RatingAggregator.toDisplayScore('rawg', 4.5)).toBe(90);
  });

  it('mantém notas não-RAWG ou já escaladas como estão', () => {
    expect(RatingAggregator.toDisplayScore('steam', 87)).toBe(87);
    expect(RatingAggregator.toDisplayScore('rawg', 80)).toBe(80);
  });
});
