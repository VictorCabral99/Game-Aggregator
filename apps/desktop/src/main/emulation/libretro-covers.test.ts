import { describe, expect, it } from 'vitest';
import {
  libretroCoverCandidates,
  libretroTitleVariants,
  pickBestBoxartName,
  romBasenameForCover,
  stripDiscTags,
  stripYearTags,
} from './libretro-covers';

describe('stripYearTags', () => {
  it('remove ano entre parênteses', () => {
    expect(stripYearTags('Donkey Kong Country (1994)')).toBe('Donkey Kong Country');
    expect(stripYearTags("Donkey Kong Country 2: Diddy's Kong Quest (1995)")).toBe(
      "Donkey Kong Country 2: Diddy's Kong Quest"
    );
  });
});

describe('romBasenameForCover', () => {
  it('mantém região No-Intro e remove tags de dump', () => {
    expect(romBasenameForCover('D:/roms/nes/Metroid (USA) [!].nes')).toBe('Metroid (USA)');
    expect(romBasenameForCover('Pokemon - Emerald Version (USA, Europe).gba')).toBe(
      'Pokemon - Emerald Version (USA, Europe)'
    );
  });

  it('troca underscore por espaço', () => {
    expect(romBasenameForCover('Super_Mario_Bros (USA).nes')).toBe('Super Mario Bros (USA)');
  });
});

describe('stripDiscTags', () => {
  it('remove Disc/CD do título', () => {
    expect(stripDiscTags('Final Fantasy VII (USA) (Disc 1)')).toBe('Final Fantasy VII (USA)');
    expect(stripDiscTags('Game (Europe) (CD2)')).toBe('Game (Europe)');
  });
});

describe('libretroTitleVariants', () => {
  it('adiciona sufixos de região quando o título não tem', () => {
    const variants = libretroTitleVariants('Metroid');
    expect(variants).toContain('Metroid');
    expect(variants).toContain('Metroid (USA)');
    expect(variants).toContain('Metroid (Europe)');
  });

  it('não duplica região se o título já tem', () => {
    const variants = libretroTitleVariants('Metroid (USA)');
    expect(variants).toContain('Metroid (USA)');
    expect(variants.every((v) => !v.includes('(USA) (USA)'))).toBe(true);
  });
});

describe('pickBestBoxartName', () => {
  const index = [
    'Metroid (USA)',
    'Metroid (Europe)',
    'Super Mario Bros. (World)',
    'Pokemon - Emerald Version (USA, Europe)',
    'Final Fantasy VII (USA)',
  ];

  const dkcIndex = [
    'Donkey Kong Country (Europe) (En,Fr,De)',
    'Donkey Kong Country (USA)',
    "Donkey Kong Country 2 - Diddy's Kong Quest (USA) (En,Fr)",
    "Donkey Kong Country 2 - Diddy's Kong Quest (Europe) (En,Fr)",
    "Donkey Kong Country 3 - Dixie Kong's Double Trouble! (USA) (En,Fr)",
    "Donkey Kong Country 3 - Dixie Kong's Double Trouble! (Europe) (En,Fr,De)",
    'Donkey Kong Country - Competition Cartridge (USA)',
  ];

  it('casa título limpo com boxart regional', () => {
    const best = pickBestBoxartName(['Metroid'], index);
    expect(best?.name).toMatch(/Metroid/);
    expect(best!.score).toBeGreaterThanOrEqual(450);
  });

  it('casa Pokemon Emerald abreviado', () => {
    const best = pickBestBoxartName(['Pokemon Emerald'], index);
    expect(best?.name).toBe('Pokemon - Emerald Version (USA, Europe)');
  });

  it('casa ROM com Disc removido', () => {
    const best = pickBestBoxartName(['Final Fantasy VII (USA) (Disc 1)'], index);
    expect(best?.name).toBe('Final Fantasy VII (USA)');
  });

  it('retorna null se nada passa o threshold', () => {
    expect(pickBestBoxartName(['Completely Unrelated Zzz'], index)).toBeNull();
  });

  it('não confunde sequências Donkey Kong Country (com ano no título)', () => {
    expect(pickBestBoxartName(['Donkey Kong Country (1994)'], dkcIndex)?.name).toMatch(
      /^Donkey Kong Country \(/
    );
    expect(pickBestBoxartName(["Donkey Kong Country 2: Diddy's Kong Quest (1995)"], dkcIndex)?.name).toMatch(
      /^Donkey Kong Country 2/
    );
    expect(
      pickBestBoxartName(["Donkey Kong Country 3: Dixie Kong's Double Trouble! (1996)"], dkcIndex)?.name
    ).toMatch(/^Donkey Kong Country 3/);
  });

  it('não confunde sequências com título curto (só o número)', () => {
    expect(pickBestBoxartName(['Donkey Kong Country 2'], dkcIndex)?.name).toMatch(
      /^Donkey Kong Country 2/
    );
    expect(pickBestBoxartName(['Donkey Kong Country 3'], dkcIndex)?.name).toMatch(
      /^Donkey Kong Country 3/
    );
  });

  it('Donkey Kong Country 1 não pega capa do 2 nem Competition', () => {
    const best = pickBestBoxartName(['Donkey Kong Country'], dkcIndex);
    expect(best?.name).toMatch(/^Donkey Kong Country \(/);
    expect(best?.name).not.toMatch(/Country 2|Competition/);
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
    const decoded = urls.map((u) => decodeURIComponent(u));
    expect(decoded.some((u) => u.includes('Metroid (USA)'))).toBe(true);
  });

  it('para GBC também tenta o sistema Game Boy clássico', () => {
    const urls = libretroCoverCandidates('Tetris', 'gbc');
    const decoded = urls.map((u) => decodeURIComponent(u));
    expect(decoded.some((u) => u.includes('Game Boy Color'))).toBe(true);
    expect(decoded.some((u) => u.includes('Nintendo - Game Boy/'))).toBe(true);
  });
});
