import path from 'node:path';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { describe, expect, it, afterEach } from 'vitest';
import {
  discoverNamedLocal,
  discoverXboxGames,
  findPokemonTcgLivePath,
  isProtectedInstallPath,
  scanExtraGamesFolder,
} from './known-locals';

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

describe('known-locals', () => {
  it('marca XboxGames / WindowsApps como protegidos', () => {
    expect(isProtectedInstallPath('C:\\XboxGames\\Minecraft for Windows')).toBe(true);
    expect(isProtectedInstallPath('C:\\Program Files\\WindowsApps\\Foo')).toBe(true);
    expect(isProtectedInstallPath('C:\\Users\\Victor\\Games\\Heroic\\Genshin')).toBe(false);
  });

  it('descobre pastas em XboxGames e marca canMove false', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'xbox-'));
    temps.push(root);
    const mc = path.join(root, 'Minecraft for Windows');
    mkdirSync(path.join(mc, 'Content'), { recursive: true });
    writeFileSync(path.join(mc, 'Content', 'Minecraft.Windows.exe'), '');
    mkdirSync(path.join(root, 'GameSave'), { recursive: true });

    const items = discoverXboxGames('C:\\Games', root);
    expect(items.some((g) => /minecraft/i.test(g.title))).toBe(true);
    expect(items.every((g) => g.canMove === false)).toBe(true);
    expect(items.every((g) => g.hint)).toBeTruthy();
  });

  it('resolve o path do Pokémon TCG Live por pasta na home', () => {
    const home = mkdtempSync(path.join(tmpdir(), 'home-'));
    temps.push(home);
    const company = path.join(home, 'The Pokémon Company International');
    const game = path.join(company, 'Pokémon Trading Card Game Live');
    mkdirSync(game, { recursive: true });
    writeFileSync(path.join(game, 'Pokemon TCG Live.exe'), '');

    expect(findPokemonTcgLivePath(home)).toBe(game);
  });

  it('descobre PokeMMO em path simulado', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'pf-'));
    temps.push(root);
    const poke = path.join(root, 'PokeMMO');
    mkdirSync(poke, { recursive: true });
    writeFileSync(path.join(poke, 'PokeMMO.exe'), '');

    const item = discoverNamedLocal('C:\\Games', 'pokemmo', 'PokeMMO', [poke]);
    expect(item?.title).toBe('PokeMMO');
    expect(item?.currentPath).toBe(poke);
    expect(item?.suggestedPath).toBe(path.join('C:\\Games', 'Outros', 'PokeMMO'));
  });

  it('scanExtraGamesFolder lista subpastas com exe', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'scan-'));
    temps.push(root);
    const game = path.join(root, 'CoolGame');
    mkdirSync(game, { recursive: true });
    writeFileSync(path.join(game, 'CoolGame.exe'), '');
    mkdirSync(path.join(root, 'cache'), { recursive: true });

    const items = scanExtraGamesFolder('C:\\Games', root);
    expect(items).toHaveLength(1);
    expect(items[0].title).toBe('CoolGame');
    expect(items[0].canMove).toBe(true);
  });
});
