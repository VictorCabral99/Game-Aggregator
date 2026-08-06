import { describe, expect, it } from 'vitest';
import {
  gameSearchTerms,
  normalizeGameTitle,
  pickBestRawgMatch,
  titleMatchScore,
  type RAWGGame,
} from '@/lib/rawg-api';

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

  it('converte numerais romanos em dígitos', () => {
    expect(normalizeGameTitle('Final Fantasy VII')).toBe('final fantasy 7');
    expect(normalizeGameTitle('Halo III')).toBe('halo 3');
    expect(normalizeGameTitle('Part II')).toBe('part 2');
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
    // "dredd" vs dredge — sem tokens em comum após normalizar
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
    expect(
      pickBestRawgMatch('DREDGE', [fakeGame('Judge Dredd', 99)])
    ).toBeNull();
  });
});

describe('gameSearchTerms', () => {
  it('deduplica sem diferenciar maiúsculas, limita a 5 e inclui termo sem edição', () => {
    const terms = gameSearchTerms(
      'The Witcher 3: Wild Hunt — Game of the Year Edition'
    );
    expect(terms.length).toBeGreaterThan(0);
    expect(terms.length).toBeLessThanOrEqual(5);
    // Título original permanece; também aparece variante limpa sem ruído de edição
    expect(
      terms.some(
        (t) =>
          /witcher/i.test(t) && !/game of the year|goty|edition/i.test(t)
      )
    ).toBe(true);
  });

  it('ignora títulos vazios e limita a no máximo 5 termos', () => {
    expect(gameSearchTerms('', '  ')).toEqual([]);
    const many = gameSearchTerms(
      'Alpha: One',
      'Alpha - Two',
      'Alpha (Deluxe)',
      'Alpha [Windows]',
      'Alpha Ultimate Edition',
      'Alpha Extra'
    );
    expect(many.length).toBeLessThanOrEqual(5);
  });
});
