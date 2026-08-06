import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync, statSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { isNonGameLocal } from '../local-games/filters';
import {
  folderNameFromTitle,
  isAlreadyStandard,
  isProtectedInstallPath,
  normalizePathKey,
  platformFolder,
  suggestedInstallPath,
} from './root';
import type { OrganizeGame, OrganizeStorePlatform } from './types';

const SKIP_ROOT_CHILD =
  /^(windows|windowsapps|system32|syswow64|microsoft\.?net|common files|internet explorer|windows defender|windows mail|windows media player|windows nt|windows photo viewer|windows portable devices|windows security|windows sidebar|microsoft office|microsoft visual studio|dotnet|nodejs|git|refassemblies|reference assemblies|msbuild|nuget|powershell|windows powershell|modifiablewindowsapps)$/i;

const SKIP_DIR =
  /^(gamesave|prefixes|tools|redist|redistributables|temp|tmp|cache|logs?|\.git|node_modules|__macosx|crash|crashpad|cef|bin\\debug|obj)$/i;

const SKIP_EXE =
  /^(unins\d*|uninstall|setup|install|update|crash|unitycrash|crashpad|redist|vcredist|dotnet|helper|cefsharp|webview|report|bugreport|dxsetup|directx|repair|launcher_uninstall)/i;

const NON_GAME_PUBLISHER_DIR =
  /^(nvidia corporation|amd|advanced micro devices|intel|realtek|logitech|corsair|razer|microsoft|google|mozilla|dropbox|discord|spotify|zoom|slack|obsidian|notion|docker|vmware|oracle|java|python|jetbrains|epic games launcher)$/i;

/** Markers that bump "is a game" score. */
const GAME_MARKERS =
  /^(unityplayer\.dll|steam_api64?\.dll|steam_api\.dll|eossdk-win.*\.dll|galaxy\.dll|fmod(studio)?(64)?\.dll|gameassembly\.dll|ue4prereqsetup|engine\\binaries)$/i;

export interface ScrapeHit {
  title: string;
  installPath: string;
  score: number;
  via: 'root' | 'shortcut' | 'registry';
  platform: OrganizeStorePlatform;
}

function dirSizeApprox(dir: string, maxDepth = 2): number | null {
  try {
    let total = 0;
    const walk = (d: string, depth: number) => {
      if (depth > maxDepth) return;
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

function listDir(dir: string): string[] {
  try {
    return readdirSync(dir);
  } catch {
    return [];
  }
}

/**
 * Pontuação: quanto mais “cara de jogo”, maior.
 * < 30 = rejeita.
 */
export function scoreGameDir(dir: string): number {
  const base = path.basename(dir);
  if (!base || base.startsWith('.')) return -100;
  if (SKIP_DIR.test(base) || SKIP_ROOT_CHILD.test(base) || NON_GAME_PUBLISHER_DIR.test(base)) {
    return -100;
  }
  if (isNonGameLocal(base)) return -100;

  let score = 0;
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return -100;
  }

  const exes = entries.filter((e) => /\.exe$/i.test(e) && !SKIP_EXE.test(e.replace(/\.exe$/i, '')));
  const goodExes = exes.filter((e) => !isNonGameLocal(e));
  if (goodExes.length === 0) {
    // Xbox Content layout
    if (entries.some((e) => e.toLowerCase() === 'content')) score += 25;
    else if (entries.some((e) => /\.(smd|xvi|xvs)$/i.test(e))) score += 20;
    else return 0;
  } else {
    score += 40;
    const folderNorm = base.toLowerCase().replace(/[\s._-]+/g, '');
    for (const exe of goodExes) {
      const exeNorm = exe.replace(/\.exe$/i, '').toLowerCase().replace(/[\s._-]+/g, '');
      if (exeNorm === folderNorm || exeNorm.includes(folderNorm) || folderNorm.includes(exeNorm)) {
        score += 25;
      }
      if (/launch|game|start|play|client/i.test(exe)) score += 8;
    }
  }

  for (const e of entries) {
    if (GAME_MARKERS.test(e)) score += 20;
    if (/^(data|gamedata|assets|streamingassets|maps|roms)$/i.test(e)) score += 6;
  }

  // Pastas enormes de engine sem exe útil — já cobertas
  return score;
}

export function looksLikeGameDir(dir: string, minScore = 30): boolean {
  return scoreGameDir(dir) >= minScore;
}

function inferPlatform(installPath: string): OrganizeStorePlatform {
  const n = normalizePathKey(installPath);
  if (n.includes('\\steamapps\\common\\') || /\\steam\\steamapps\\/.test(n)) return 'steam';
  if (n.includes('\\epic\\') || n.includes('\\legendary\\')) return 'epic';
  if (n.includes('\\gog\\') || n.includes('\\gog galaxy\\')) return 'gog';
  if (n.includes('\\luna\\') || n.includes('\\amazon games\\')) return 'amazon';
  return 'local';
}

function hitToOrganizeGame(gamesRoot: string, hit: ScrapeHit): OrganizeGame {
  const platform = hit.platform;
  const already = isAlreadyStandard(gamesRoot, platform, hit.installPath);
  const protectedPath = isProtectedInstallPath(hit.installPath);
  const steamInstallDir =
    platform === 'steam' ? path.basename(hit.installPath) : undefined;
  const suggestedPath = suggestedInstallPath(gamesRoot, platform, hit.title, {
    steamInstallDir,
  });
  return {
    id: `scrape:${normalizePathKey(hit.installPath).replace(/[^a-z0-9]+/g, '-').slice(-64)}`,
    title: hit.title,
    platform,
    folder: platformFolder(platform),
    currentPath: hit.installPath,
    suggestedPath,
    sizeBytes: dirSizeApprox(hit.installPath),
    alreadyStandard: already,
    source: 'local',
    externalId: normalizePathKey(hit.installPath),
    canMove: !already && !protectedPath,
    hint: protectedPath
      ? 'Microsoft Store / Xbox — não mover'
      : hit.via === 'shortcut'
        ? `Via atalho (${hit.via})`
        : hit.via === 'registry'
          ? 'Via registro de instalação'
          : `Scrape pastas (score ${hit.score})`,
  };
}

/** Raízes típicas onde jogos aparecem (1 nível de subpastas = candidatos). */
export function defaultScrapeRoots(home = os.homedir()): string[] {
  const roots = [
    path.join(home, 'Games'),
    path.join(home, 'Games', 'Heroic'),
    path.join(home, 'Game'),
    'C:\\Games',
    'D:\\Games',
    'E:\\Games',
    'C:\\XboxGames',
    process.env.ProgramFiles ?? 'C:\\Program Files',
    process.env['ProgramFiles(x86)'] ?? 'C:\\Program Files (x86)',
    path.join(home, 'AppData', 'Local', 'Programs'),
  ];
  // Pastas tipo "The Pokémon Company…"
  try {
    for (const name of readdirSync(home)) {
      if (/pok|game|heroic|epic|gog|steam/i.test(name) && !/documents|downloads|desktop|onedrive/i.test(name)) {
        roots.push(path.join(home, name));
      }
    }
  } catch {
    // ignore
  }
  return [...new Set(roots.filter((r) => r && existsSync(r)))];
}

/**
 * Varre raízes: cada subpasta imediata que parecer jogo.
 * Em Program Files ignora publishers conhecidos.
 */
export function scrapeFromRoots(
  roots: string[],
  opts?: { minScore?: number; maxHits?: number }
): ScrapeHit[] {
  const minScore = opts?.minScore ?? 30;
  const maxHits = opts?.maxHits ?? 400;
  const hits: ScrapeHit[] = [];
  const seen = new Set<string>();

  for (const root of roots) {
    if (hits.length >= maxHits) break;
    const isProgramFiles = /program files/i.test(root);
    let entries;
    try {
      entries = readdirSync(root, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (hits.length >= maxHits) break;
      if (!entry.isDirectory()) continue;
      if (entry.name.startsWith('.')) continue;
      if (SKIP_ROOT_CHILD.test(entry.name) || SKIP_DIR.test(entry.name)) continue;
      if (isProgramFiles && NON_GAME_PUBLISHER_DIR.test(entry.name)) continue;

      const full = path.join(root, entry.name);
      const key = normalizePathKey(full);
      if (seen.has(key)) continue;

      // Steam library: descer para steamapps/common
      const common = path.join(full, 'steamapps', 'common');
      if (existsSync(common)) {
        for (const gameName of listDir(common)) {
          if (hits.length >= maxHits) break;
          const gameDir = path.join(common, gameName);
          try {
            if (!statSync(gameDir).isDirectory()) continue;
          } catch {
            continue;
          }
          const gKey = normalizePathKey(gameDir);
          if (seen.has(gKey)) continue;
          const score = scoreGameDir(gameDir);
          if (score < minScore) continue;
          seen.add(gKey);
          hits.push({
            title: folderNameFromTitle(gameName),
            installPath: gameDir,
            score,
            via: 'root',
            platform: 'steam',
          });
        }
        continue;
      }

      const score = scoreGameDir(full);
      if (score < minScore) {
        // Um nível extra: Epic\Game, GOG\Game, Outros\Game, Heroic\Game
        if (/^(epic|gog|luna|outros|heroic|games)$/i.test(entry.name) || !isProgramFiles) {
          for (const child of listDir(full)) {
            if (hits.length >= maxHits) break;
            if (SKIP_DIR.test(child)) continue;
            const childDir = path.join(full, child);
            try {
              if (!statSync(childDir).isDirectory()) continue;
            } catch {
              continue;
            }
            const cKey = normalizePathKey(childDir);
            if (seen.has(cKey)) continue;
            const cScore = scoreGameDir(childDir);
            if (cScore < minScore) continue;
            seen.add(cKey);
            hits.push({
              title: folderNameFromTitle(child),
              installPath: childDir,
              score: cScore,
              via: 'root',
              platform: inferPlatform(childDir),
            });
          }
        }
        continue;
      }

      seen.add(key);
      hits.push({
        title: folderNameFromTitle(entry.name),
        installPath: full,
        score,
        via: 'root',
        platform: inferPlatform(full),
      });
    }
  }
  return hits;
}

function shortcutSearchRoots(home = os.homedir()): string[] {
  const appData = process.env.APPDATA ?? path.join(home, 'AppData', 'Roaming');
  const programData = process.env.ProgramData ?? 'C:\\ProgramData';
  return [
    path.join(home, 'Desktop'),
    path.join(home, 'OneDrive', 'Desktop'),
    path.join(appData, 'Microsoft', 'Windows', 'Start Menu', 'Programs'),
    path.join(programData, 'Microsoft', 'Windows', 'Start Menu', 'Programs'),
  ].filter((p) => existsSync(p));
}

/**
 * Resolve .lnk do Desktop + Menu Iniciar via WScript.Shell (batch PowerShell).
 */
export function scrapeFromShortcuts(opts?: { maxHits?: number }): ScrapeHit[] {
  const maxHits = opts?.maxHits ?? 200;
  const roots = shortcutSearchRoots();
  if (roots.length === 0) return [];

  const rootsLiteral = roots.map((r) => `'${r.replace(/'/g, "''")}'`).join(',');
  const script = `
$ErrorActionPreference = 'SilentlyContinue'
$sh = New-Object -ComObject WScript.Shell
$roots = @(${rootsLiteral})
foreach ($root in $roots) {
  if (-not (Test-Path -LiteralPath $root)) { continue }
  Get-ChildItem -LiteralPath $root -Filter *.lnk -Recurse -Depth 6 |
    ForEach-Object {
      try {
        $s = $sh.CreateShortcut($_.FullName)
        $t = $s.TargetPath
        if (-not $t) { return }
        if ($t -notmatch '\\.exe$') { return }
        $dir = Split-Path -Parent $t
        $name = [IO.Path]::GetFileNameWithoutExtension($_.Name)
        Write-Output ($name + '||' + $dir + '||' + $t)
      } catch {}
    }
}
`;
  const res = spawnSync(
    'powershell.exe',
    ['-NoProfile', '-NonInteractive', '-Command', script],
    { encoding: 'utf8', windowsHide: true, timeout: 45_000, maxBuffer: 8 * 1024 * 1024 }
  );
  if (res.status !== 0 && !res.stdout) return [];

  const hits: ScrapeHit[] = [];
  const seen = new Set<string>();
  for (const line of (res.stdout || '').split(/\r?\n/)) {
    if (hits.length >= maxHits) break;
    const parts = line.trim().split('||');
    if (parts.length < 2) continue;
    const [titleRaw, installPath, exePath] = parts;
    if (!installPath || !existsSync(installPath)) continue;
    const baseExe = path.basename(exePath || '');
    if (SKIP_EXE.test(baseExe.replace(/\.exe$/i, ''))) continue;
    if (isNonGameLocal(titleRaw) || isNonGameLocal(baseExe)) continue;
    // Atalhos de sistema / installers
    if (/install|setup|uninstall|update|helper|redist/i.test(titleRaw)) continue;

    const key = normalizePathKey(installPath);
    if (seen.has(key)) continue;

    // Prefer pasta do jogo: se o exe está em subpasta (bin/x64), sobe 1 nível se score melhorar
    let gameDir = installPath;
    const parent = path.dirname(installPath);
    const scoreHere = scoreGameDir(installPath);
    const scoreParent = scoreGameDir(parent);
    if (scoreParent >= 30 && scoreParent > scoreHere + 5) {
      gameDir = parent;
    } else if (scoreHere < 25) {
      // atalho fraco: ainda aceita se o exe parece jogo
      if (!exePath || !/\.exe$/i.test(exePath)) continue;
      if (scoreHere < 15 && scoreParent < 15) continue;
    }

    const gKey = normalizePathKey(gameDir);
    if (seen.has(gKey)) continue;
    seen.add(gKey);
    const score = Math.max(scoreGameDir(gameDir), 35);
    hits.push({
      title: folderNameFromTitle(titleRaw),
      installPath: gameDir,
      score,
      via: 'shortcut',
      platform: inferPlatform(gameDir),
    });
  }
  return hits;
}

/**
 * Uninstall registry → InstallLocation com cara de jogo.
 */
export function scrapeFromUninstallRegistry(opts?: { maxHits?: number }): ScrapeHit[] {
  const maxHits = opts?.maxHits ?? 200;
  const keys = [
    'HKLM\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall',
    'HKLM\\SOFTWARE\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall',
    'HKCU\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall',
  ];
  const hits: ScrapeHit[] = [];
  const seen = new Set<string>();

  for (const key of keys) {
    if (hits.length >= maxHits) break;
    const res = spawnSync('reg', ['query', key, '/s'], {
      encoding: 'utf8',
      windowsHide: true,
      timeout: 60_000,
      maxBuffer: 32 * 1024 * 1024,
    });
    if (res.status !== 0 || !res.stdout) continue;

    let displayName: string | null = null;
    let installLocation: string | null = null;
    let publisher: string | null = null;

    const flush = () => {
      if (!displayName || !installLocation) {
        displayName = null;
        installLocation = null;
        publisher = null;
        return;
      }
      const loc = installLocation.replace(/^"+|"+$/g, '').trim();
      if (!loc || !existsSync(loc)) {
        displayName = null;
        installLocation = null;
        publisher = null;
        return;
      }
      if (publisher && /microsoft|nvidia|intel|realtek|adobe|oracle|python/i.test(publisher)) {
        displayName = null;
        installLocation = null;
        publisher = null;
        return;
      }
      if (isNonGameLocal(displayName)) {
        displayName = null;
        installLocation = null;
        publisher = null;
        return;
      }
      const score = scoreGameDir(loc);
      if (score < 28) {
        displayName = null;
        installLocation = null;
        publisher = null;
        return;
      }
      const gKey = normalizePathKey(loc);
      if (!seen.has(gKey)) {
        seen.add(gKey);
        hits.push({
          title: folderNameFromTitle(displayName),
          installPath: loc,
          score,
          via: 'registry',
          platform: inferPlatform(loc),
        });
      }
      displayName = null;
      installLocation = null;
      publisher = null;
    };

    for (const line of res.stdout.split(/\r?\n/)) {
      if (hits.length >= maxHits) break;
      if (/^HKEY_/i.test(line.trim())) {
        flush();
        continue;
      }
      const mName = line.match(/DisplayName\s+REG_\w+\s+(.+)$/i);
      if (mName) displayName = mName[1].trim();
      const mLoc = line.match(/InstallLocation\s+REG_\w+\s+(.+)$/i);
      if (mLoc) installLocation = mLoc[1].trim();
      const mPub = line.match(/Publisher\s+REG_\w+\s+(.+)$/i);
      if (mPub) publisher = mPub[1].trim();
    }
    flush();
  }
  return hits;
}

/** Scrape completo: roots + atalhos + registro. */
export function scrapeAllGames(
  gamesRoot: string,
  opts?: {
    includeSteamLibrary?: boolean;
    extraRoots?: string[];
    minScore?: number;
  }
): OrganizeGame[] {
  const roots = [...defaultScrapeRoots(), ...(opts?.extraRoots ?? [])];
  const hits = [
    ...scrapeFromRoots(roots, { minScore: opts?.minScore }),
    ...scrapeFromShortcuts(),
    ...scrapeFromUninstallRegistry(),
  ];

  let items = hits.map((h) => hitToOrganizeGame(gamesRoot, h));

  if (!opts?.includeSteamLibrary) {
    items = items.filter((g) => g.platform !== 'steam');
  }

  // Preferir maior score ao dedupar por path (feito depois no discover)
  items.sort((a, b) => (b.sizeBytes ?? 0) - (a.sizeBytes ?? 0));
  return items;
}
