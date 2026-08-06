import { existsSync, readdirSync, readFileSync, renameSync, writeFileSync, mkdirSync, copyFileSync } from 'node:fs';
import path from 'node:path';
import { libraryFoldersFromVdf, parseVdf, type VdfNode, vdfGet } from '../providers/vdf';
import { normalizePathKey } from './root';

/**
 * Garante que `libraryPath` (ex.: C:\Games\Steam) está em libraryfolders.vdf do Steam.
 * Preserva o restante do arquivo via append de bloco.
 */
export function ensureSteamLibraryInVdf(vdfText: string, libraryPath: string): {
  text: string;
  changed: boolean;
} {
  const root = parseVdf(vdfText);
  const lib = root.libraryfolders as VdfNode | undefined;
  const existing = lib ? libraryFoldersFromVdf(lib) : [];
  const target = normalizePathKey(libraryPath);
  if (existing.some((p) => normalizePathKey(p) === target)) {
    return { text: vdfText, changed: false };
  }

  let maxIdx = -1;
  if (lib) {
    for (const key of Object.keys(lib)) {
      const n = Number(key);
      if (Number.isFinite(n) && n > maxIdx) maxIdx = n;
    }
  }
  const next = String(maxIdx + 1);
  const escaped = libraryPath.replace(/\\/g, '\\\\');
  const block =
    `\t"${next}"\n` +
    `\t{\n` +
    `\t\t"path"\t\t"${escaped}"\n` +
    `\t\t"label"\t\t""\n` +
    `\t\t"contentid"\t\t""\n` +
    `\t\t"totalsize"\t\t"0"\n` +
    `\t\t"apps"\n` +
    `\t\t{\n` +
    `\t\t}\n` +
    `\t}\n`;

  // Insere antes do último '}' do arquivo (fecha libraryfolders / root).
  const lastBrace = vdfText.lastIndexOf('}');
  if (lastBrace < 0) {
    const fresh =
      `"libraryfolders"\n{\n${block}}\n`;
    return { text: fresh, changed: true };
  }
  const text = vdfText.slice(0, lastBrace) + block + vdfText.slice(lastBrace);
  return { text, changed: true };
}

export function ensureSteamLibraryFolder(steamRoot: string, libraryPath: string): boolean {
  const vdfPath = path.join(steamRoot, 'steamapps', 'libraryfolders.vdf');
  mkdirSync(path.join(libraryPath, 'steamapps', 'common'), { recursive: true });
  mkdirSync(path.join(libraryPath, 'steamapps', 'downloading'), { recursive: true });
  if (!existsSync(vdfPath)) return false;
  const raw = readFileSync(vdfPath, 'utf8');
  const { text, changed } = ensureSteamLibraryInVdf(raw, libraryPath);
  if (!changed) return false;
  if (!existsSync(`${vdfPath}.bak`)) copyFileSync(vdfPath, `${vdfPath}.bak`);
  writeFileSync(vdfPath, text, 'utf8');
  return true;
}

/**
 * Move um jogo Steam (pasta em common + appmanifest) para outra library.
 * `fromInstallPath` = .../steamapps/common/GameDir
 * `toLibraryRoot` = C:\Games\Steam
 */
export function planSteamMove(
  fromInstallPath: string,
  toLibraryRoot: string,
  appId: string
): {
  fromCommon: string;
  toCommon: string;
  fromManifest: string;
  toManifest: string;
  installDir: string;
} {
  const installDir = path.basename(fromInstallPath);
  const fromSteamApps = path.dirname(path.dirname(fromInstallPath)); // .../steamapps
  const fromManifest = path.join(fromSteamApps, `appmanifest_${appId}.acf`);
  const toSteamApps = path.join(toLibraryRoot, 'steamapps');
  return {
    fromCommon: fromInstallPath,
    toCommon: path.join(toSteamApps, 'common', installDir),
    fromManifest,
    toManifest: path.join(toSteamApps, `appmanifest_${appId}.acf`),
    installDir,
  };
}

/** Move manifesto se existir (rename; EXDEV tratado pelo caller via movePath). */
export function findAppManifest(steamAppsDir: string, appId: string): string | null {
  const exact = path.join(steamAppsDir, `appmanifest_${appId}.acf`);
  if (existsSync(exact)) return exact;
  try {
    const hit = readdirSync(steamAppsDir).find(
      (f) => f.toLowerCase() === `appmanifest_${appId}.acf`.toLowerCase()
    );
    return hit ? path.join(steamAppsDir, hit) : null;
  } catch {
    return null;
  }
}

export function readManifestInstallDir(manifestPath: string): string | null {
  try {
    const node = parseVdf(readFileSync(manifestPath, 'utf8'));
    const state = node.AppState as VdfNode | undefined;
    return vdfGet(state, 'installdir');
  } catch {
    return null;
  }
}

export { renameSync };
