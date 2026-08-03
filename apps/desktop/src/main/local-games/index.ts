import { promises as fs } from 'node:fs';
import path from 'node:path';
import { getLibraryRepository, getSetting, setSetting } from '../db';

export interface LocalGamesSetupStatus {
  gamesRoot: string;
  configured: boolean;
  gamesFound: number;
}

export interface LocalGamesScanResult {
  found: number;
  added: number;
}

const SKIP_EXE =
  /^(unins|uninstall|setup|install|update|crash|unitycrash|crashpad|redist|vcredist|dotnet|helper|cefsharp|webview|report|bugreport|dxsetup|directx)/i;

const SKIP_DIR =
  /^(engine|redist|redistributables|__macosx|\.git|node_modules|temp|tmp|cache|logs?|crash|crashpad|cef)$/i;

/** Utilitários Windows / apps que não são jogo (pasta ou título). */
const NON_GAME_NAME =
  /^(calculadora|calculator|calc|notepad|bloco de notas|paint|mspaint|wordpad|snipping tool|ferramenta de corte|ferramenta de recorte|explorer|file explorer|cmd|command prompt|prompt de comando|powershell|windows terminal|terminal|settings|configurações|configuracoes|photos|fotos|mail|maps|mapas|clock|alarme|relógio|relogio|weather|tempo|camera|câmera|camera|microsoft store|store|edge|microsoft edge|chrome|firefox|brave|opera|spotify|discord|teams|zoom|skype|onedrive|dropbox|winrar|7-?zip|vlc|notepad\+\+|sublime text|visual studio code|code|task manager|gerenciador de tarefas)$/i;

const NON_GAME_EXE =
  /^(calc|calculatorapp|notepad|mspaint|paintstudio|wordpad|SnippingTool|ScreenSketch|explorer|cmd|powershell|WindowsTerminal|msedge|chrome|firefox|spotify|Discord|Teams|Zoom|OneDrive|WinRAR|7zFM|vlc|Code|Taskmgr)$/i;

const MAX_DEPTH = 3;

function normalizeName(name: string): string {
  return name
    .replace(/\.exe$/i, '')
    .replace(/[._-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Pasta/título/exe de utilitário — não entra na biblioteca. */
export function isNonGameLocal(nameOrExe: string): boolean {
  const base = path.basename(nameOrExe);
  const asTitle = normalizeName(base);
  if (NON_GAME_NAME.test(asTitle)) return true;
  if (/\.exe$/i.test(base) && NON_GAME_EXE.test(base.replace(/\.exe$/i, ''))) return true;
  return false;
}

/**
 * Remove da biblioteca entradas locais que são utilitários (Calculadora, Notepad…).
 * Só apaga jogos cuja única fonte é `local`.
 */
export function purgeNonGameLocals(): number {
  const repo = getLibraryRepository();
  let removed = 0;
  for (const game of repo.list()) {
    if (game.sources.length === 0) continue;
    if (!game.sources.every((s) => s.platform === 'local')) continue;
    const exe = game.preferredSource?.executable ?? game.sources[0]?.executable ?? '';
    const folder = game.preferredSource?.installPath
      ? path.basename(game.preferredSource.installPath)
      : '';
    if (
      isNonGameLocal(game.title) ||
      (folder && isNonGameLocal(folder)) ||
      (exe && isNonGameLocal(exe))
    ) {
      repo.remove(game.id);
      removed += 1;
    }
  }
  return removed;
}

export function getLocalGamesSetup(): LocalGamesSetupStatus {
  const gamesRoot = getSetting('local.gamesRoot')?.trim() ?? '';
  const gamesFound = Number(getSetting('local.gamesFound') ?? '0') || 0;
  return {
    gamesRoot,
    configured: Boolean(gamesRoot),
    gamesFound,
  };
}

export function setLocalGamesRoot(folder: string): LocalGamesSetupStatus {
  const trimmed = folder.trim();
  setSetting('local.gamesRoot', trimmed);
  if (!trimmed) setSetting('local.gamesFound', '0');
  return getLocalGamesSetup();
}

function titleFromFolder(dirName: string): string {
  return dirName
    .replace(/[._-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function scoreExe(exePath: string, folderName: string): number {
  const base = path.basename(exePath, '.exe').toLowerCase();
  const folder = folderName.toLowerCase().replace(/[\s._-]+/g, '');
  const normalized = base.replace(/[\s._-]+/g, '');
  let score = 10;
  if (SKIP_EXE.test(base)) return -100;
  if (normalized === folder) score += 50;
  if (normalized.includes(folder) || folder.includes(normalized)) score += 25;
  if (/launcher|client|game|start|play/i.test(base)) score += 8;
  // Prefer shorter paths (closer to game root)
  score -= path.relative(path.dirname(path.dirname(exePath)), exePath).split(path.sep).length;
  return score;
}

async function collectExes(
  root: string,
  depth: number,
  out: string[]
): Promise<void> {
  let entries;
  try {
    entries = await fs.readdir(root, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    const full = path.join(root, entry.name);
    if (entry.isFile() && /\.exe$/i.test(entry.name)) {
      out.push(full);
      continue;
    }
    if (entry.isDirectory() && depth < MAX_DEPTH && !SKIP_DIR.test(entry.name)) {
      await collectExes(full, depth + 1, out);
    }
  }
}

async function pickBestExe(gameDir: string): Promise<string | null> {
  const folderName = path.basename(gameDir);
  const exes: string[] = [];
  await collectExes(gameDir, 0, exes);
  if (exes.length === 0) return null;
  let best: string | null = null;
  let bestScore = -Infinity;
  for (const exe of exes) {
    const s = scoreExe(exe, folderName);
    if (s > bestScore) {
      bestScore = s;
      best = exe;
    }
  }
  return bestScore >= 0 ? best : null;
}

/**
 * Cada subpasta imediata de `gamesRoot` é um jogo (Minecraft, Hytale…).
 * Procura o .exe mais plausível dentro (até 3 níveis).
 */
export async function scanLocalGamesFolder(): Promise<LocalGamesScanResult> {
  const root = getSetting('local.gamesRoot')?.trim() ?? '';
  if (!root) throw new Error('Pasta de jogos externos não configurada');

  let entries;
  try {
    entries = await fs.readdir(root, { withFileTypes: true });
  } catch (err) {
    throw new Error(
      `Não foi possível ler a pasta: ${err instanceof Error ? err.message : String(err)}`
    );
  }

  const items: Array<{
    externalId: string;
    title: string;
    installPath: string;
    executable: string;
    cwd: string;
    isInstalled: true;
  }> = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    if (entry.name.startsWith('.')) continue;
    if (isNonGameLocal(entry.name)) continue;
    const gameDir = path.join(root, entry.name);
    const exe = await pickBestExe(gameDir);
    if (!exe || isNonGameLocal(exe)) continue;
    items.push({
      externalId: `local:${gameDir.toLowerCase()}`,
      title: titleFromFolder(entry.name),
      installPath: gameDir,
      executable: exe,
      cwd: path.dirname(exe),
      isInstalled: true,
    });
  }

  purgeNonGameLocals();
  const { inserted } = getLibraryRepository().upsertMany('local', items);
  setSetting('local.gamesFound', String(items.length));
  return { found: items.length, added: inserted };
}
