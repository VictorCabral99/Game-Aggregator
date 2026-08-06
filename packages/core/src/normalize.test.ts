import { describe, expect, it } from 'vitest';
import { normalizeTitle } from './normalize';

describe('normalizeTitle', () => {
  it('retorna string vazia para título vazio', () => {
    expect(normalizeTitle('')).toBe('');
  });

  it('passa para minúsculas e remove marcas ™ ® ©', () => {
    expect(normalizeTitle('Celeste™')).toBe('celeste');
    expect(normalizeTitle('Game®')).toBe('game');
  });

  it('remove apóstrofos tipográficos e ASCII', () => {
    expect(normalizeTitle("Baldur's Gate")).toBe('baldurs gate');
    expect(normalizeTitle('Baldur\u2019s Gate')).toBe('baldurs gate');
  });

  it('remove sufixos de edição no final', () => {
    expect(normalizeTitle('The Witcher 3 Game of the Year Edition')).toBe(
      'the witcher 3'
    );
    expect(normalizeTitle('Hades Remastered')).toBe('hades');
    expect(normalizeTitle('Celeste Definitive Edition')).toBe('celeste');
  });

  it('remove edições entre parênteses ou colchetes', () => {
    expect(normalizeTitle('Celeste (GOTY)')).toBe('celeste');
    expect(normalizeTitle('Game [Deluxe Edition]')).toBe('game');
  });

  it('colapsa pontuação e espaços extras', () => {
    expect(normalizeTitle('Game:  Subtitle!')).toBe('game subtitle');
    expect(normalizeTitle('A  —  B')).toBe('a b');
  });
});
