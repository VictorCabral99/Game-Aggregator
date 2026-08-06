import { copyFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import type { OrganizeGame, OrganizeStorePlatform } from './types';
import { isAlreadyStandard, platformFolder, suggestedInstallPath } from './root';

export interface HeroicPaths {
  legendaryInstalled: string;
  gogInstalled: string;
  nileInstalled: string;
  gamesConfigDir: string;
}

export function defaultHeroicPaths(appData?: string): HeroicPaths {
  const base = appData ?? process.env.APPDATA ?? '';
  const heroic = path.join(base, 'heroic');
  return {
    legendaryInstalled: path.join(heroic, 'legendaryConfig', 'legendary', 'installed.json'),
    gogInstalled: path.join(heroic, 'gog_store', 'installed.json'),
    nileInstalled: path.join(heroic, 'nile_config', 'nile', 'installed.json'),
    gamesConfigDir: path.join(heroic, 'GamesConfig'),
  };
}

function readJson(file: string): unknown {
  return JSON.parse(readFileSync(file, 'utf8'));
}

function asRecord(v: unknown): Record<string, unknown> | null {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}

function str(v: unknown): string | null {
  return typeof v === 'string' && v.trim() ? v.trim() : null;
}

function num(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string' && v.trim() && !Number.isNaN(Number(v))) return Number(v);
  return null;
}

/** Heroic GOG/Nile muitas vezes não traz title — usa o nome da pasta de install. */
export function titleFromInstallPath(installPath: string, fallback: string): string {
  const base = path.basename(installPath.replace(/[/\\]+$/, '')).trim();
  if (!base) return fallback;
  // IDs numéricos / amazon product ids não são bons títulos
  if (/^\d+$/.test(fallback) || /^amzn1\./i.test(fallback)) return base;
  if (fallback === base) return base;
  // Se o fallback parece um id (sem espaço e muito “código”), preferir pasta
  if (!/\s/.test(fallback) && fallback.length > 20 && /[0-9a-f]{8,}/i.test(fallback)) return base;
  return fallback;
}

function makeItem(
  gamesRoot: string,
  platform: OrganizeStorePlatform,
  externalId: string,
  title: string,
  currentPath: string,
  sizeBytes: number | null
): OrganizeGame {
  const suggestedPath = suggestedInstallPath(gamesRoot, platform, title);
  return {
    id: `heroic:${platform}:${externalId}`,
    title,
    platform,
    folder: platformFolder(platform),
    currentPath,
    suggestedPath,
    sizeBytes,
    alreadyStandard: isAlreadyStandard(gamesRoot, platform, currentPath),
    source: 'heroic',
    externalId,
    canMove: !isAlreadyStandard(gamesRoot, platform, currentPath),
  };
}

/** Parse Legendary installed.json (mapa app_name → item). */
export function parseLegendaryInstalled(data: unknown, gamesRoot: string): OrganizeGame[] {
  const root = asRecord(data);
  if (!root) return [];
  const out: OrganizeGame[] = [];
  for (const [key, raw] of Object.entries(root)) {
    const item = asRecord(raw);
    if (!item) continue;
    const externalId = str(item.app_name) ?? key;
    const title = str(item.title) ?? externalId;
    const installPath = str(item.install_path);
    if (!installPath) continue;
    if (item.is_dlc === true) continue;
    out.push(
      makeItem(gamesRoot, 'epic', externalId, title, installPath, num(item.install_size) ?? num(item.size))
    );
  }
  return out;
}

/** Parse GOG installed.json (lista ou { installed: [] } ou mapa). */
export function parseGogInstalled(data: unknown, gamesRoot: string): OrganizeGame[] {
  let items: unknown[] = [];
  if (Array.isArray(data)) {
    items = data;
  } else {
    const root = asRecord(data);
    if (!root) return [];
    if (Array.isArray(root.installed)) items = root.installed;
    else if (Array.isArray(root.library)) items = root.library;
    else {
      // mapa id → item
      for (const [key, raw] of Object.entries(root)) {
        if (key === 'installed' || key === 'library') continue;
        const item = asRecord(raw);
        if (!item) continue;
        items.push({ ...item, appName: item.appName ?? item.app_name ?? key });
      }
    }
  }

  const out: OrganizeGame[] = [];
  for (const raw of items) {
    const item = asRecord(raw);
    if (!item) continue;
    if (item.is_dlc === true) continue;
    const externalId = str(item.appName) ?? str(item.app_name) ?? str(item.id) ?? null;
    if (!externalId) continue;
    const installPath = str(item.install_path) ?? str(item.installPath);
    if (!installPath) continue;
    const rawTitle = str(item.title) ?? str(item.name) ?? externalId;
    const title = titleFromInstallPath(installPath, rawTitle);
    out.push(
      makeItem(
        gamesRoot,
        'gog',
        externalId,
        title,
        installPath,
        num(item.install_size) ?? num(item.size)
      )
    );
  }
  return out;
}

/** Parse Nile installed.json (lista ou mapa). */
export function parseNileInstalled(data: unknown, gamesRoot: string): OrganizeGame[] {
  let items: unknown[] = [];
  if (Array.isArray(data)) {
    items = data;
  } else {
    const root = asRecord(data);
    if (!root) return [];
    if (Array.isArray(root.installed)) items = root.installed;
    else {
      for (const [key, raw] of Object.entries(root)) {
        const item = asRecord(raw);
        if (!item) continue;
        items.push({ ...item, id: item.id ?? key });
      }
    }
  }

  const out: OrganizeGame[] = [];
  for (const raw of items) {
    const item = asRecord(raw);
    if (!item) continue;
    const externalId = str(item.id) ?? str(item.appName) ?? null;
    if (!externalId) continue;
    const installPath = str(item.install_path) ?? str(item.path) ?? str(item.installPath);
    if (!installPath) continue;
    const rawTitle = str(item.title) ?? str(item.name) ?? externalId;
    const title = titleFromInstallPath(installPath, rawTitle);
    out.push(
      makeItem(
        gamesRoot,
        'amazon',
        externalId,
        title,
        installPath,
        num(item.install_size) ?? num(item.size)
      )
    );
  }
  return out;
}

export function discoverHeroicGames(
  gamesRoot: string,
  paths: HeroicPaths = defaultHeroicPaths()
): OrganizeGame[] {
  const out: OrganizeGame[] = [];
  if (existsSync(paths.legendaryInstalled)) {
    try {
      out.push(...parseLegendaryInstalled(readJson(paths.legendaryInstalled), gamesRoot));
    } catch {
      // ignore
    }
  }
  if (existsSync(paths.gogInstalled)) {
    try {
      out.push(...parseGogInstalled(readJson(paths.gogInstalled), gamesRoot));
    } catch {
      // ignore
    }
  }
  if (existsSync(paths.nileInstalled)) {
    try {
      out.push(...parseNileInstalled(readJson(paths.nileInstalled), gamesRoot));
    } catch {
      // ignore
    }
  }
  return out;
}

/**
 * Atualiza install_path no JSON do Heroic. Retorna true se alterou.
 * Faz backup `.bak` uma vez por arquivo nesta chamada.
 */
export function patchHeroicInstallPath(
  paths: HeroicPaths,
  platform: 'epic' | 'gog' | 'amazon',
  externalId: string,
  newPath: string
): boolean {
  const file =
    platform === 'epic'
      ? paths.legendaryInstalled
      : platform === 'gog'
        ? paths.gogInstalled
        : paths.nileInstalled;
  if (!existsSync(file)) return false;

  const raw = readFileSync(file, 'utf8');
  const data = JSON.parse(raw) as unknown;
  let changed = false;

  const setPath = (item: Record<string, unknown>) => {
    if ('install_path' in item) {
      item.install_path = newPath;
      changed = true;
    } else if ('path' in item) {
      item.path = newPath;
      changed = true;
    } else {
      item.install_path = newPath;
      changed = true;
    }
  };

  if (platform === 'epic') {
    const root = asRecord(data);
    if (!root) return false;
    for (const [key, rawItem] of Object.entries(root)) {
      const item = asRecord(rawItem);
      if (!item) continue;
      const id = str(item.app_name) ?? key;
      if (id !== externalId) continue;
      setPath(item);
    }
  } else if (Array.isArray(data)) {
    for (const rawItem of data) {
      const item = asRecord(rawItem);
      if (!item) continue;
      const id =
        str(item.appName) ?? str(item.app_name) ?? str(item.id) ?? null;
      if (id !== externalId) continue;
      setPath(item);
    }
  } else {
    const root = asRecord(data);
    if (!root) return false;
    const listKey = Array.isArray(root.installed)
      ? 'installed'
      : Array.isArray(root.library)
        ? 'library'
        : null;
    if (listKey) {
      for (const rawItem of root[listKey] as unknown[]) {
        const item = asRecord(rawItem);
        if (!item) continue;
        const id = str(item.appName) ?? str(item.app_name) ?? str(item.id) ?? null;
        if (id !== externalId) continue;
        setPath(item);
      }
    } else if (asRecord(root[externalId])) {
      setPath(root[externalId] as Record<string, unknown>);
    } else {
      for (const [key, rawItem] of Object.entries(root)) {
        const item = asRecord(rawItem);
        if (!item) continue;
        const id = str(item.appName) ?? str(item.app_name) ?? str(item.id) ?? key;
        if (id !== externalId) continue;
        setPath(item);
      }
    }
  }

  if (!changed) return false;

  const bak = `${file}.bak`;
  if (!existsSync(bak)) copyFileSync(file, bak);
  writeFileSync(file, JSON.stringify(data, null, 2), 'utf8');

  // GamesConfig/{id}.json — melhor esforço
  try {
    const cfg = path.join(paths.gamesConfigDir, `${externalId}.json`);
    if (existsSync(cfg)) {
      const cfgData = JSON.parse(readFileSync(cfg, 'utf8')) as unknown;
      const cfgRoot = asRecord(cfgData);
      if (cfgRoot) {
        let cfgChanged = false;
        for (const val of Object.values(cfgRoot)) {
          const entry = asRecord(val);
          if (!entry) continue;
          if ('install_path' in entry || 'installPath' in entry) {
            if ('install_path' in entry) entry.install_path = newPath;
            if ('installPath' in entry) entry.installPath = newPath;
            cfgChanged = true;
          }
        }
        if (cfgChanged) {
          writeFileSync(cfg, JSON.stringify(cfgData, null, 2), 'utf8');
        }
      }
    }
  } catch {
    // ignore GamesConfig
  }

  return true;
}
