import { describe, expect, it } from 'vitest';
import {
  libretroCoverCandidates,
  libretroTitleVariants,
  romBasenameForCover,
} from './libretro-covers';

describe('romBasenameForCover', () => {
  it('mantém região No-Intro e remove tags de dump', () => {
    expect(romBasenameForCover('D:/roms/nes/Metroid (USA) [!].nes')).toBe('Metroid (USA)');
    expect(romBasenameForCover('Pokemon - Emerald Version (USA, Europe).gba')).toBe(
      'Pokemon - Emerald Version (USA, Europe)'
    );
  });
});

describe('libretroTitleVariants', () => {
  it('adiciona sufixos de região quando o título não tem', () => {
    const variants = libretroTitleVariants('Metroid');
    expect(variants).toContain('Metroid');
    expect(variants).toContain('Metroid (USA)');
    expect(variants).toContain('Metroid (Europe)');
    expect(variants.some((v) => v.includes('(USA, Europe)'))).toBe(true);
  });

  it('não duplica região se o título já tem', () => {
    const variants = libretroTitleVariants('Metroid (USA)');
    expect(variants).toContain('Metroid (USA)');
    expect(variants.every((v) => !v.includes('(USA) (USA)'))).toBe(true);
  });
});

describe('libretroCoverCandidates', () => {
  it('retorna vazio para console desconhecido ou título vazio', () => {
    expect(libretroCoverCandidates('Sonic', 'unknown-console')).toEqual([]);
    expect(libretroCoverCandidates('  ', 'nes')).toEqual([]);
  });

  it('gera URLs Named_Boxarts com variantes de título e região', () => {
    const urls = libretroCoverCandidates('Metroid', 'nes');
    expect(urls.length).toBeGreaterThan(0);
    expect(urls.every((u) => u.includes('thumbnails.libretro.com'))).toBe(true);
    expect(urls.some((u) => u.includes('Named_Boxarts'))).toBe(true);
    const decoded = urls.map((u) => decodeURIComponent(u));
    expect(decoded.some((u) => u.includes('Metroid (USA)'))).toBe(true);
  });

  it('prioriza nome do ROM com região via extraTitles', () => {
    const urls = libretroCoverCandidates('Metroid', 'nes', ['Metroid (USA)']);
    const decoded = urls.map((u) => decodeURIComponent(u));
    expect(decoded.some((u) => /Named_Boxarts\/Metroid \(USA\)\.png$/.test(u))).toBe(true);
  });

  it('para GBC também tenta o sistema Game Boy clássico', () => {
    const urls = libretroCoverCandidates('Tetris', 'gbc');
    const decoded = urls.map((u) => decodeURIComponent(u));
    expect(decoded.some((u) => u.includes('Game Boy Color'))).toBe(true);
    expect(decoded.some((u) => u.includes('Nintendo - Game Boy/'))).toBe(true);
  });
});
