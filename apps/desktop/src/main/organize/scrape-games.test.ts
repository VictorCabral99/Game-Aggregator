import path from 'node:path';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { afterEach, describe, expect, it } from 'vitest';
import { scoreGameDir, scrapeFromRoots } from './scrape-games';

const temps: string[] = [];

afterEach(() => {
  for (const t of temps.splice(0)) {
    try {
      rmSync(t, { recursive: true, force: true });
    } catch {
      // ignore
    }
  }
});

describe('scrape-games', () => {
  it('pontua alto pasta com exe do jogo + steam_api', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'game-'));
    temps.push(root);
    writeFileSync(path.join(root, 'CoolGame.exe'), '');
    writeFileSync(path.join(root, 'steam_api64.dll'), '');
    expect(scoreGameDir(root)).toBeGreaterThanOrEqual(50);
  });

  it('rejeita pasta de publisher / utilitário', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'pf-'));
    temps.push(root);
    const nvidia = path.join(root, 'NVIDIA Corporation');
    mkdirSync(nvidia);
    writeFileSync(path.join(nvidia, 'foo.exe'), '');
    expect(scoreGameDir(nvidia)).toBe(-100);
  });

  it('scrapeFromRoots acha subpastas com cara de jogo', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'roots-'));
    temps.push(root);
    const game = path.join(root, 'MyIndie');
    mkdirSync(game);
    writeFileSync(path.join(game, 'MyIndie.exe'), '');
    writeFileSync(path.join(game, 'UnityPlayer.dll'), '');

    const junk = path.join(root, 'cache');
    mkdirSync(junk);

    const hits = scrapeFromRoots([root], { minScore: 30 });
    expect(hits.some((h) => h.installPath === game)).toBe(true);
    expect(hits.every((h) => !/cache/i.test(h.installPath))).toBe(true);
  });
});
