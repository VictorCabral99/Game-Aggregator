import { describe, expect, it } from 'vitest';
import { cleanRomTitle, isHiddenEntry, isValidRom } from './rom';

describe('cleanRomTitle', () => {
  it('remove extensão e tags No-Intro/TOSEC', () => {
    expect(cleanRomTitle('Super Mario Bros. (USA).nes')).toBe('Super Mario Bros.');
    expect(cleanRomTitle('Sonic [!].md')).toBe('Sonic');
    expect(cleanRomTitle('Game (Europe) (En,Fr).iso')).toBe('Game');
  });

  it('remove revisão e artigo The no início', () => {
    expect(cleanRomTitle('Legend of Zelda v1.1.z64')).toBe('Legend of Zelda');
    expect(cleanRomTitle('The Legend of Zelda.nes')).toBe('Legend of Zelda');
  });
});

describe('isValidRom', () => {
  it('aceita extensão na lista (case-insensitive)', () => {
    expect(isValidRom('game.NES', ['.nes', '.fds'])).toBe(true);
    expect(isValidRom('game.iso', ['.nes'])).toBe(false);
  });
});

describe('isHiddenEntry', () => {
  it('marca entradas ocultas do sistema', () => {
    expect(isHiddenEntry('.git')).toBe(true);
    expect(isHiddenEntry('$RECYCLE.BIN')).toBe(true);
    expect(isHiddenEntry('System Volume Information')).toBe(true);
    expect(isHiddenEntry('nes')).toBe(false);
  });
});
