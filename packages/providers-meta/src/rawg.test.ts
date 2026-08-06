import { describe, expect, it } from 'vitest';
import {
  normalizeGameTitle,
  pickBestRawgMatch,
  titleMatchScore,
  type RAWGGame,
} from './rawg';

function fakeGame(name: string, id = 1): RAWGGame {
  return {
    id,
    slug: name.toLowerCase().replace(/\s+/g, '-'),
    name,
    released: '2020-01-01',
    tba: false,
    background_image: '',
    rating: 4,
    rating_top: 5,
    ratings_count: 10,
    reviews_text_count: 0,
    metacritic: null,
    playtime: 0,
    suggestions_count: 0,
    updated: '',
  };
}

describe('normalizeGameTitle', () => {
  it('passa para minúsculas e remove acentos e marcas registradas', () => {
    expect(normalizeGameTitle('Pokémon™')).toBe('pokemon');
    expect(normalizeGameTitle('Café®')).toBe('cafe');
  });

  it('colapsa pontuação em espaços', () => {
    expect(normalizeGameTitle('Game: Subtitle!')).toBe('game subtitle');
  });
});

describe('titleMatchScore', () => {
  it('pontua match exato com 1000', () => {
    expect(titleMatchScore('DREDGE', 'Dredge')).toBe(1000);
  });

  it('pontua match por prefixo com 800', () => {
    expect(titleMatchScore('Hades', 'Hades II')).toBe(800);
  });

  it('pontua match por substring com 600', () => {
    expect(titleMatchScore('Witcher 3', 'The Witcher 3 Wild Hunt')).toBe(600);
  });

  it('pontua sobreposição de tokens e retorna 0 sem sobreposição', () => {
    expect(titleMatchScore('Celeste', 'Hollow Knight')).toBe(0);
    expect(titleMatchScore('DREDGE', 'Judge Dredd')).toBe(0);
  });
});

describe('pickBestRawgMatch', () => {
  it('retorna null para resultados vazios', () => {
    expect(pickBestRawgMatch('Celeste', [])).toBeNull();
  });

  it('escolhe o candidato com melhor pontuação', () => {
    const best = pickBestRawgMatch('Celeste', [
      fakeGame('Celestia Online', 1),
      fakeGame('Celeste', 2),
      fakeGame('Celeste Classic', 3),
    ]);
    expect(best?.id).toBe(2);
  });

  it('rejeita matches fracos abaixo da pontuação 100', () => {
    expect(pickBestRawgMatch('DREDGE', [fakeGame('Judge Dredd', 99)])).toBeNull();
  });
});
