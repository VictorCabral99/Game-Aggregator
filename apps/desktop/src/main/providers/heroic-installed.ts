import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { ProviderGame } from '@gagg/core';
import {
  defaultHeroicPaths,
  parseGogInstalled,
  parseLegendaryInstalled,
  parseNileInstalled,
  type HeroicPaths,
} from '../organize/heroic';

export type HeroicRunner = 'legendary' | 'gog' | 'nile';

const PLATFORM_RUNNER: Record<'epic' | 'gog' | 'amazon', HeroicRunner> = {
  epic: 'legendary',
  gog: 'gog',
  amazon: 'nile',
};

function readJson(file: string): unknown {
  return JSON.parse(readFileSync(file, 'utf8'));
}

/** Caminhos comuns do Heroic.exe no Windows. */
export function findHeroicExe(): string | null {
  const candidates = [
    join(process.env['ProgramFiles'] ?? 'C:\\Program Files', 'Heroic', 'Heroic.exe'),
    join(process.env['ProgramFiles(x86)'] ?? 'C:\\Program Files (x86)', 'Heroic', 'Heroic.exe'),
    join(process.env.LOCALAPPDATA ?? '', 'Programs', 'Heroic', 'Heroic.exe'),
  ];
  return candidates.find((p) => p && existsSync(p)) ?? null;
}

export function isHeroicAvailable(): boolean {
  return findHeroicExe() !== null;
}

export function heroicRunnerFor(platform: 'epic' | 'gog' | 'amazon'): HeroicRunner {
  return PLATFORM_RUNNER[platform];
}

/**
 * URI Heroic (query-style). Launch/install usam a conta e runners já configurados no Heroic.
 * @see https://github.com/Heroic-Games-Launcher/HeroicGamesLauncher
 */
export function heroicActionUri(
  action: 'launch' | 'install',
  runner: HeroicRunner,
  appName: string,
  opts?: { path?: string }
): string {
  const params = new URLSearchParams({
    appName,
    runner,
  });
  if (opts?.path) params.set('path', opts.path);
  return `heroic://${action}?${params.toString()}`;
}

/**
 * Jogos instalados via Heroic (installed.json Legendary/GOG/Nile) — sem precisar de sidecar.
 */
export function scanHeroicInstalled(
  platform: 'epic' | 'gog' | 'amazon',
  paths: HeroicPaths = defaultHeroicPaths()
): ProviderGame[] {
  // gamesRoot só alimenta suggestedPath nos parsers; path real vem do JSON
  const gamesRoot = 'C:\\Games';
  let items: ReturnType<typeof parseLegendaryInstalled> = [];
  try {
    if (platform === 'epic' && existsSync(paths.legendaryInstalled)) {
      items = parseLegendaryInstalled(readJson(paths.legendaryInstalled), gamesRoot);
    } else if (platform === 'gog' && existsSync(paths.gogInstalled)) {
      items = parseGogInstalled(readJson(paths.gogInstalled), gamesRoot);
    } else if (platform === 'amazon' && existsSync(paths.nileInstalled)) {
      items = parseNileInstalled(readJson(paths.nileInstalled), gamesRoot);
    }
  } catch {
    return [];
  }

  return items
    .filter((g) => g.externalId && existsSync(g.currentPath))
    .map((g) => ({
      providerId: platform,
      externalId: g.externalId as string,
      title: g.title,
      installPath: g.currentPath,
      sizeBytes: g.sizeBytes ?? undefined,
      raw: { heroic: true, runner: heroicRunnerFor(platform) },
    }))
    .sort((a, b) => a.title.localeCompare(b.title));
}
