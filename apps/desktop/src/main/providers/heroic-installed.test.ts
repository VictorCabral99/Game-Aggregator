import { describe, expect, it } from 'vitest';
import {
  heroicActionUri,
  heroicRunnerFor,
  scanHeroicInstalled,
} from './heroic-installed';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import type { HeroicPaths } from '../organize/heroic';

describe('heroic-installed', () => {
  it('mapeia plataforma → runner Heroic', () => {
    expect(heroicRunnerFor('epic')).toBe('legendary');
    expect(heroicRunnerFor('gog')).toBe('gog');
    expect(heroicRunnerFor('amazon')).toBe('nile');
  });

  it('monta URI heroic://launch e install com path', () => {
    expect(heroicActionUri('launch', 'legendary', 'CozyGrove')).toBe(
      'heroic://launch?appName=CozyGrove&runner=legendary'
    );
    const install = heroicActionUri('install', 'gog', '2106173825', {
      path: 'C:\\Games\\GOG\\Moonscars',
    });
    expect(install).toContain('heroic://install?');
    expect(install).toContain('appName=2106173825');
    expect(install).toContain('runner=gog');
    expect(install).toContain('path=C%3A%5CGames%5CGOG%5CMoonscars');
  });

  it('lê installed.json Legendary como ProviderGame', () => {
    const root = mkdtempSync(join(tmpdir(), 'gagg-heroic-'));
    const installDir = join(root, 'BloodWest');
    mkdirSync(installDir);
    const legendaryDir = join(root, 'legendary');
    mkdirSync(legendaryDir, { recursive: true });
    const installedFile = join(legendaryDir, 'installed.json');
    writeFileSync(
      installedFile,
      JSON.stringify({
        BloodWest: {
          app_name: 'BloodWest',
          title: 'Blood West',
          install_path: installDir,
          install_size: 100,
          is_dlc: false,
        },
      })
    );
    const paths: HeroicPaths = {
      legendaryInstalled: installedFile,
      gogInstalled: join(root, 'missing-gog.json'),
      nileInstalled: join(root, 'missing-nile.json'),
      gamesConfigDir: join(root, 'cfg'),
    };
    try {
      const games = scanHeroicInstalled('epic', paths);
      expect(games).toHaveLength(1);
      expect(games[0].externalId).toBe('BloodWest');
      expect(games[0].installPath).toBe(installDir);
      expect(games[0].title).toBe('Blood West');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('ignora pasta de install que não existe', () => {
    const root = mkdtempSync(join(tmpdir(), 'gagg-heroic-'));
    const legendaryDir = join(root, 'legendary');
    mkdirSync(legendaryDir, { recursive: true });
    const installedFile = join(legendaryDir, 'installed.json');
    writeFileSync(
      installedFile,
      JSON.stringify({
        Gone: {
          app_name: 'Gone',
          title: 'Gone',
          install_path: join(root, 'does-not-exist'),
          is_dlc: false,
        },
      })
    );
    const paths: HeroicPaths = {
      legendaryInstalled: installedFile,
      gogInstalled: join(root, 'x'),
      nileInstalled: join(root, 'y'),
      gamesConfigDir: join(root, 'z'),
    };
    try {
      expect(scanHeroicInstalled('epic', paths)).toEqual([]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
