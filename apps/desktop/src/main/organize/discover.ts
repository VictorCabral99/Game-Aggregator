import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { getSteamProvider } from '../providers';
import { libraryFoldersFromVdf, parseVdf, type VdfNode, vdfGet } from '../providers/vdf';
import { discoverHeroicGames, type HeroicPaths } from './heroic';
import { scrapeAllGames } from './scrape-games';
import {
  discoverHeroicOrphans,
  discoverKnownLocals,
  scanExtraGamesFolder,
} from './known-locals';
import {
  getGamesRoot,
  isAlreadyStandard,
  normalizePathKey,
  platformFolder,
  suggestedInstallPath,
} from './root';
import type { OrganizeDiscoverResult, OrganizeGame } from './types';

export {
  discoverKnownLocals,
  discoverXboxGames,
  discoverHytale,
  discoverHeroicOrphans,
  discoverNamedLocals,
  scanExtraGamesFolder,
  isProtectedInstallPath,
  findPokemonTcgLivePath,
} from './known-locals';

export {
  scrapeAllGames,
  scrapeFromRoots,
  scrapeFromShortcuts,
  scoreGameDir,
  looksLikeGameDir,
  defaultScrapeRoots,
} from './scrape-games';

export async function discoverSteamGames(gamesRoot: string): Promise<OrganizeGame[]> {
  try {
    const games = await getSteamProvider().scan();
    const byAppId = new Map<string, OrganizeGame>();
    for (const g of games) {
      if (!g.installPath) continue;
      if (byAppId.has(g.externalId)) continue;
      const installdir = path.basename(g.installPath);
      const suggestedPath = suggestedInstallPath(gamesRoot, 'steam', g.title, {
        steamInstallDir: installdir,
      });
      const already = isAlreadyStandard(gamesRoot, 'steam', g.installPath);
      byAppId.set(g.externalId, {
        id: `steam:${g.externalId}`,
        title: g.title,
        platform: 'steam',
        folder: platformFolder('steam'),
        currentPath: g.installPath,
        suggestedPath,
        sizeBytes: g.sizeBytes ?? null,
        alreadyStandard: already,
        source: 'steam',
        externalId: g.externalId,
        canMove: !already,
      });
    }
    return [...byAppId.values()];
  } catch {
    return [];
  }
}

const SOURCE_RANK: Record<OrganizeGame['source'], number> = {
  heroic: 0,
  local: 1,
  steam: 2,
};

/**
 * Remove duplicatas pelo path de install (normalizado).
 * Preferência: heroic > local > steam.
 */
export function dedupeOrganizeGames(items: OrganizeGame[]): OrganizeGame[] {
  const byPath = new Map<string, OrganizeGame>();
  const noPath: OrganizeGame[] = [];

  for (const item of items) {
    if (!item.currentPath?.trim()) {
      noPath.push(item);
      continue;
    }
    const key = normalizePathKey(item.currentPath);
    const prev = byPath.get(key);
    if (!prev) {
      byPath.set(key, item);
      continue;
    }
    if (SOURCE_RANK[item.source] < SOURCE_RANK[prev.source]) {
      byPath.set(key, item);
    }
  }

  const byId = new Map<string, OrganizeGame>();
  for (const item of [...byPath.values(), ...noPath]) {
    if (!byId.has(item.id)) byId.set(item.id, item);
  }
  return [...byId.values()];
}

function withDefaultCanMove(items: OrganizeGame[]): OrganizeGame[] {
  return items.map((g) => ({
    ...g,
    canMove: g.canMove ?? (!g.alreadyStandard),
  }));
}

/**
 * Descobre jogos: Heroic + Xbox/nomeados + órfãos + scrape profundo
 * (Program Files, atalhos, registro Uninstall). Steam só com includeSteam.
 */
export async function discoverOrganizeGames(opts?: {
  gamesRoot?: string;
  heroicPaths?: HeroicPaths;
  includeSteam?: boolean;
  extraFolders?: string[];
  /** default true — varre roots/atalhos/registro */
  deepScrape?: boolean;
}): Promise<OrganizeDiscoverResult> {
  const gamesRoot = opts?.gamesRoot ?? getGamesRoot();
  const items: OrganizeGame[] = [];

  const heroic = discoverHeroicGames(gamesRoot, opts?.heroicPaths);
  items.push(...heroic);

  const knownPaths = new Set(
    heroic.map((g) => normalizePathKey(g.currentPath)).filter(Boolean)
  );

  if (opts?.includeSteam === true) {
    items.push(...(await discoverSteamGames(gamesRoot)));
  }

  items.push(...discoverKnownLocals(gamesRoot));
  items.push(...discoverHeroicOrphans(gamesRoot, knownPaths));

  for (const folder of opts?.extraFolders ?? []) {
    items.push(...scanExtraGamesFolder(gamesRoot, folder));
  }

  if (opts?.deepScrape !== false) {
    items.push(
      ...scrapeAllGames(gamesRoot, {
        includeSteamLibrary: opts?.includeSteam === true,
        extraRoots: opts?.extraFolders,
      })
    );
  }

  const deduped = withDefaultCanMove(dedupeOrganizeGames(items));
  deduped.sort((a, b) => a.title.localeCompare(b.title, 'pt-BR'));
  return { gamesRoot, items: deduped };
}

/** Utilitário de teste: lista library folders do Steam a partir do VDF. */
export function steamLibraryFoldersFromFile(vdfPath: string): string[] {
  if (!existsSync(vdfPath)) return [];
  const root = parseVdf(readFileSync(vdfPath, 'utf8'));
  const lib = root.libraryfolders as VdfNode | undefined;
  return lib ? libraryFoldersFromVdf(lib) : [];
}

export function steamInstallDirFromPath(installPath: string): string {
  return path.basename(installPath);
}

export { vdfGet };
