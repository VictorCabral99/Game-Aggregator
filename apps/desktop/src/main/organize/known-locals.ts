import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  folderNameFromTitle,
  isAlreadyStandard,
  isProtectedInstallPath,
  normalizePathKey,
  platformFolder,
  suggestedInstallPath,
} from './root';
import type { OrganizeGame } from './types';

export { isProtectedInstallPath } from './root';

const SKIP_DIR =
  /^(gamesave|prefixes|tools|redist|redistributables|temp|tmp|cache|logs?|\.git|node_modules)$/i;

function dirSizeApprox(dir: string): number | null {
  try {
    let total = 0;
    const walk = (d: string, depth: number) => {
      if (depth > 3) return;
      for (const name of readdirSync(d)) {
        const full = path.join(d, name);
        try {
          const st = statSync(full);
          if (st.isDirectory()) walk(full, depth + 1);
          else total += st.size;
        } catch {
          // skip
        }
      }
    };
    walk(dir, 0);
    return total || null;
  } catch {
    return null;
  }
}

function looksLikeGameDir(dir: string): boolean {
  try {
    const entries = readdirSync(dir);
    if (entries.some((e) => /\.exe$/i.test(e))) return true;
    if (entries.some((e) => e.toLowerCase() === 'content')) return true;
    if (entries.some((e) => e.toLowerCase() === 'game')) return true;
    if (entries.some((e) => /\.(smd|xvi|xvs|xct)$/i.test(e))) return true;
    return false;
  } catch {
    return false;
  }
}

function localItem(
  gamesRoot: string,
  id: string,
  title: string,
  currentPath: string,
  opts?: { canMove?: boolean; hint?: string; externalId?: string }
): OrganizeGame {
  const protectedPath = isProtectedInstallPath(currentPath);
  const suggestedPath = suggestedInstallPath(gamesRoot, 'local', title);
  const already = isAlreadyStandard(gamesRoot, 'local', currentPath);
  return {
    id,
    title,
    platform: 'local',
    folder: platformFolder('local'),
    currentPath,
    suggestedPath,
    sizeBytes: dirSizeApprox(currentPath),
    alreadyStandard: already,
    source: 'local',
    externalId: opts?.externalId ?? id.replace(/^local:/, ''),
    canMove: opts?.canMove ?? (!protectedPath && !already),
    hint:
      opts?.hint ??
      (protectedPath
        ? 'Microsoft Store / Xbox — não mover (quebra o registro da loja)'
        : undefined),
  };
}

const HYTALE_CANDIDATES = () => [
  process.env.ProgramFiles
    ? path.join(process.env.ProgramFiles, 'Hypixel Studios', 'Hytale Launcher')
    : null,
  process.env['ProgramFiles(x86)']
    ? path.join(process.env['ProgramFiles(x86)'], 'Hypixel Studios', 'Hytale Launcher')
    : null,
  path.join('C:\\Program Files', 'Hypixel Studios', 'Hytale Launcher'),
];

const POKEMMO_CANDIDATES = () => [
  process.env.ProgramFiles ? path.join(process.env.ProgramFiles, 'PokeMMO') : null,
  process.env['ProgramFiles(x86)'] ? path.join(process.env['ProgramFiles(x86)'], 'PokeMMO') : null,
  'C:\\Program Files\\PokeMMO',
];

/** Resolve pasta do TCG Live mesmo com variação de acento no nome. */
export function findPokemonTcgLivePath(home = os.homedir()): string | null {
  const exact = path.join(
    home,
    'The Pokémon Company International',
    'Pokémon Trading Card Game Live'
  );
  if (existsSync(exact)) return exact;

  try {
    for (const name of readdirSync(home)) {
      if (!/the\s*pok/i.test(name)) continue;
      const company = path.join(home, name);
      let subs: string[];
      try {
        subs = readdirSync(company);
      } catch {
        continue;
      }
      for (const sub of subs) {
        if (/tcg|trading\s*card/i.test(sub)) {
          const full = path.join(company, sub);
          if (existsSync(full)) return full;
        }
      }
    }
  } catch {
    // ignore
  }
  return null;
}

type KnownNamed = {
  id: string;
  title: string;
  candidates: () => Array<string | null>;
};

const KNOWN_NAMED_GAMES: KnownNamed[] = [
  { id: 'hytale', title: 'Hytale', candidates: HYTALE_CANDIDATES },
  { id: 'pokemmo', title: 'PokeMMO', candidates: POKEMMO_CANDIDATES },
  {
    id: 'pokemon-tcg-live',
    title: 'Pokémon TCG Live',
    candidates: () => [findPokemonTcgLivePath()],
  },
];

/** Um jogo local conhecido por paths fixos (Hytale, PokeMMO, TCG Live…). */
export function discoverNamedLocal(
  gamesRoot: string,
  id: string,
  title: string,
  candidates: Array<string | null | undefined>
): OrganizeGame | null {
  const suggestedPath = suggestedInstallPath(gamesRoot, 'local', title);
  if (existsSync(suggestedPath)) {
    return localItem(gamesRoot, `local:${id}`, title, suggestedPath, {
      canMove: false,
      externalId: id,
    });
  }
  for (const candidate of candidates) {
    if (!candidate || !existsSync(candidate)) continue;
    return localItem(gamesRoot, `local:${id}`, title, candidate, { externalId: id });
  }
  return null;
}

export function discoverHytale(gamesRoot: string): OrganizeGame[] {
  const g = discoverNamedLocal(gamesRoot, 'hytale', 'Hytale', HYTALE_CANDIDATES());
  return g ? [g] : [];
}

export function discoverNamedLocals(gamesRoot: string): OrganizeGame[] {
  const out: OrganizeGame[] = [];
  for (const game of KNOWN_NAMED_GAMES) {
    const found = discoverNamedLocal(gamesRoot, game.id, game.title, game.candidates());
    if (found) out.push(found);
  }
  return out;
}

/** Jogos em C:\XboxGames (Minecraft, Game Pass, etc.). */
export function discoverXboxGames(gamesRoot: string, xboxRoot = 'C:\\XboxGames'): OrganizeGame[] {
  if (!existsSync(xboxRoot)) return [];
  const out: OrganizeGame[] = [];
  let entries;
  try {
    entries = readdirSync(xboxRoot, { withFileTypes: true });
  } catch {
    return [];
  }
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    if (SKIP_DIR.test(entry.name) || entry.name.startsWith('.')) continue;
    const gameDir = path.join(xboxRoot, entry.name);
    if (!looksLikeGameDir(gameDir)) continue;
    const title = folderNameFromTitle(entry.name.replace(/-/g, ' '));
    const slug = entry.name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    out.push(
      localItem(gamesRoot, `local:xbox:${slug}`, title, gameDir, {
        canMove: false,
        hint: 'Microsoft Store / Xbox — listado para referência; não mover',
        externalId: `xbox:${slug}`,
      })
    );
  }
  return out;
}

function heroicDefaultInstallPath(): string | null {
  try {
    const cfg = path.join(process.env.APPDATA ?? '', 'heroic', 'config.json');
    if (!existsSync(cfg)) return null;
    const data = JSON.parse(readFileSync(cfg, 'utf8')) as {
      defaultSettings?: { defaultInstallPath?: string };
    };
    const p = data.defaultSettings?.defaultInstallPath?.trim();
    return p || null;
  } catch {
    return null;
  }
}

/**
 * Pastas sob o install root do Heroic que não estão no installed.json
 * (ex.: Genshin baixado à parte).
 */
export function discoverHeroicOrphans(
  gamesRoot: string,
  knownInstallPaths: Set<string>,
  heroicRoot?: string | null
): OrganizeGame[] {
  const roots = [
    heroicRoot,
    heroicDefaultInstallPath(),
    path.join(os.homedir(), 'Games', 'Heroic'),
  ].filter((p): p is string => Boolean(p && existsSync(p)));

  const seenRoots = new Set<string>();
  const out: OrganizeGame[] = [];

  for (const root of roots) {
    const key = normalizePathKey(root);
    if (seenRoots.has(key)) continue;
    seenRoots.add(key);

    let entries;
    try {
      entries = readdirSync(root, { withFileTypes: true });
    } catch {
      continue;
    }

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      if (SKIP_DIR.test(entry.name) || entry.name.startsWith('.')) continue;
      const gameDir = path.join(root, entry.name);
      if (knownInstallPaths.has(normalizePathKey(gameDir))) continue;
      let covered = false;
      for (const known of knownInstallPaths) {
        if (
          known.startsWith(normalizePathKey(gameDir) + '\\') ||
          normalizePathKey(gameDir).startsWith(known + '\\')
        ) {
          covered = true;
          break;
        }
      }
      if (covered) continue;
      if (!looksLikeGameDir(gameDir)) continue;

      const title = folderNameFromTitle(entry.name);
      const slug = entry.name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
      out.push(
        localItem(gamesRoot, `local:heroic-orphan:${slug}`, title, gameDir, {
          externalId: `heroic-orphan:${slug}`,
          hint: 'Pasta no Heroic sem entrada no installed.json',
        })
      );
    }
  }
  return out;
}

/**
 * Cada subpasta imediata de `folder` = candidato a jogo (scan manual).
 */
export function scanExtraGamesFolder(gamesRoot: string, folder: string): OrganizeGame[] {
  if (!folder?.trim() || !existsSync(folder)) return [];
  let entries;
  try {
    entries = readdirSync(folder, { withFileTypes: true });
  } catch {
    return [];
  }
  const out: OrganizeGame[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    if (SKIP_DIR.test(entry.name) || entry.name.startsWith('.')) continue;
    const gameDir = path.join(folder, entry.name);
    if (!looksLikeGameDir(gameDir)) continue;
    const title = folderNameFromTitle(entry.name);
    const slug = normalizePathKey(gameDir).replace(/[^a-z0-9]+/g, '-').slice(-48);
    out.push(
      localItem(gamesRoot, `local:scan:${slug}`, title, gameDir, {
        externalId: `scan:${slug}`,
        hint: `Encontrado em ${folder}`,
      })
    );
  }
  return out;
}

/** Hytale + PokeMMO + TCG Live + XboxGames. */
export function discoverKnownLocals(gamesRoot: string): OrganizeGame[] {
  return [...discoverNamedLocals(gamesRoot), ...discoverXboxGames(gamesRoot)];
}
