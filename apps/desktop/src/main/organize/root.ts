import { existsSync, promises as fs } from 'node:fs';
import path from 'node:path';
import { getSetting, setSetting } from '../db';
import type { OrganizeFolder, OrganizeRootStatus, OrganizeStorePlatform } from './types';

export const DEFAULT_GAMES_ROOT = 'C:\\Games';

export const ORGANIZE_FOLDERS: OrganizeFolder[] = ['Epic', 'GOG', 'Luna', 'Steam', 'Outros'];

const PLATFORM_FOLDER: Record<OrganizeStorePlatform, OrganizeFolder> = {
  epic: 'Epic',
  gog: 'GOG',
  amazon: 'Luna',
  steam: 'Steam',
  local: 'Outros',
};

/** Nome de pasta seguro no Windows a partir do título. */
export function folderNameFromTitle(title: string): string {
  const cleaned = title
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return cleaned || 'Game';
}

export function platformFolder(platform: OrganizeStorePlatform): OrganizeFolder {
  return PLATFORM_FOLDER[platform];
}

/** Pasta da loja sob a raiz (ex.: C:\Games\Epic). */
export function platformDir(gamesRoot: string, platform: OrganizeStorePlatform): string {
  return path.join(gamesRoot, platformFolder(platform));
}

/**
 * Destino sugerido do jogo.
 * Steam → `<root>\Steam\steamapps\common\<installdir>`
 * Demais → `<root>\<Loja>\<folderName>`
 */
export function suggestedInstallPath(
  gamesRoot: string,
  platform: OrganizeStorePlatform,
  titleOrInstallDir: string,
  opts?: { steamInstallDir?: string }
): string {
  if (platform === 'steam') {
    const installdir = opts?.steamInstallDir?.trim() || folderNameFromTitle(titleOrInstallDir);
    return path.join(gamesRoot, 'Steam', 'steamapps', 'common', installdir);
  }
  return path.join(platformDir(gamesRoot, platform), folderNameFromTitle(titleOrInstallDir));
}

export function normalizePathKey(p: string): string {
  return path
    .normalize(p)
    .replace(/[/\\]+$/, '')
    .replace(/\//g, '\\')
    .toLowerCase();
}

/** Paths gerenciados pela Microsoft Store / Xbox — mover quebra o registro. */
export function isProtectedInstallPath(p: string): boolean {
  const n = normalizePathKey(p);
  return (
    n.includes('\\xboxgames\\') ||
    n.includes('\\windowsapps\\') ||
    /(^|\\)program files( \(x86\))?\\windowsapps(\\|$)/.test(n)
  );
}

/** True se `currentPath` já está sob a pasta padrão da loja. */
export function isAlreadyStandard(
  gamesRoot: string,
  platform: OrganizeStorePlatform,
  currentPath: string
): boolean {
  if (!currentPath?.trim()) return false;
  const root = normalizePathKey(platformDir(gamesRoot, platform));
  const cur = normalizePathKey(currentPath);
  return cur === root || cur.startsWith(`${root}\\`);
}

export function getGamesRoot(): string {
  const fromSetting = getSetting('local.gamesRoot')?.trim();
  return fromSetting || DEFAULT_GAMES_ROOT;
}

export function setGamesRoot(folder: string): OrganizeRootStatus {
  const trimmed = folder.trim();
  setSetting('local.gamesRoot', trimmed);
  return getOrganizeRootStatus();
}

export function getOrganizeRootStatus(): OrganizeRootStatus {
  const gamesRoot = getGamesRoot();
  const configured = Boolean(getSetting('local.gamesRoot')?.trim());
  const dirsReady = ORGANIZE_FOLDERS.every((name) => {
    const dir = path.join(gamesRoot, name);
    if (name === 'Steam') {
      return existsSync(path.join(dir, 'steamapps'));
    }
    return existsSync(dir);
  });
  return { gamesRoot, configured, dirsReady };
}

/** Cria Epic/GOG/Luna/Outros e Steam/steamapps/{common,downloading}. */
export async function ensureOrganizeDirs(gamesRoot?: string): Promise<OrganizeRootStatus> {
  const root = (gamesRoot ?? getGamesRoot()).trim() || DEFAULT_GAMES_ROOT;
  if (!getSetting('local.gamesRoot')?.trim()) {
    setSetting('local.gamesRoot', root);
  }
  await fs.mkdir(root, { recursive: true });
  for (const name of ORGANIZE_FOLDERS) {
    if (name === 'Steam') {
      await fs.mkdir(path.join(root, 'Steam', 'steamapps', 'common'), { recursive: true });
      await fs.mkdir(path.join(root, 'Steam', 'steamapps', 'downloading'), { recursive: true });
    } else {
      await fs.mkdir(path.join(root, name), { recursive: true });
    }
  }
  return getOrganizeRootStatus();
}
