import { describe, expect, it } from 'vitest';
import { libretroCoverCandidates } from './libretro-covers';

describe('libretroCoverCandidates', () => {
  it('retorna vazio para console desconhecido ou título vazio', () => {
    expect(libretroCoverCandidates('Sonic', 'unknown-console')).toEqual([]);
    expect(libretroCoverCandidates('  ', 'nes')).toEqual([]);
  });

  it('gera URLs Named_Boxarts com variantes de título', () => {
    const urls = libretroCoverCandidates('Metroid', 'nes');
    expect(urls.length).toBeGreaterThan(0);
    expect(urls.every((u) => u.includes('thumbnails.libretro.com'))).toBe(true);
    expect(urls.some((u) => u.includes('Named_Boxarts'))).toBe(true);
    expect(urls.some((u) => decodeURIComponent(u).includes('Metroid'))).toBe(
      true
    );
    expect(urls.some((u) => decodeURIComponent(u).includes('The Metroid'))).toBe(
      true
    );
  });

  it('para GBC também tenta o sistema Game Boy clássico', () => {
    const urls = libretroCoverCandidates('Tetris', 'gbc');
    const decoded = urls.map((u) => decodeURIComponent(u));
    expect(decoded.some((u) => u.includes('Game Boy Color'))).toBe(true);
    expect(decoded.some((u) => u.includes('Nintendo - Game Boy/'))).toBe(true);
  });
});
