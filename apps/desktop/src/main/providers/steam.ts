import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { GameProvider, LaunchResult, PlatformId, ProviderGame } from '@gagg/core';
import { libraryFoldersFromVdf, parseVdf, vdfGet, type VdfNode } from './vdf.ts';
import { isNonGameSteam } from './steam-filters.ts';

type SettingsApi = {
  get: (key: string) => string | null;
  set: (key: string, value: string) => void;
};

function registrySteamPath(): string | null {
  const keys = [
    'HKCU\\Software\\Valve\\Steam',
    'HKLM\\SOFTWARE\\WOW6432Node\\Valve\\Steam',
    'HKLM\\SOFTWARE\\Valve\\Steam',
  ];
  for (const key of keys) {
    const res = spawnSync('reg', ['query', key, '/v', 'SteamPath'], {
      encoding: 'utf8',
      windowsHide: true,
    });
    if (res.status !== 0) continue;
    const m = res.stdout.match(/SteamPath\s+REG_\w+\s+(.+)/i);
    if (m && m[1].trim()) return m[1].trim();
  }
  return null;
}

const COMMON_PATHS = () => [
  process.env['ProgramFiles(x86)'] ? join(process.env['ProgramFiles(x86)'], 'Steam') : null,
  process.env.ProgramFiles ? join(process.env.ProgramFiles, 'Steam') : null,
  'C:\\Steam',
  'D:\\Steam',
  'E:\\Steam',
];

export class SteamProvider implements GameProvider {
  id = 'steam' as PlatformId;
  displayName = 'Steam';
  capabilities = {
    scanLibrary: true,
    launch: true,
    install: true,
    playtime: true,
    uninstall: false,
  };

  private readonly settings: SettingsApi;

  constructor(settings: SettingsApi) {
    this.settings = settings;
  }

  setPathOverride(path: string): void {
    this.settings.set('steam.path', path);
  }

  clearPathOverride(): void {
    this.settings.set('steam.path', '');
  }

  detectPath(): string | null {
    const override = this.settings.get('steam.path');
    if (override && existsSync(join(override, 'steam.exe'))) return override;

    const candidates = [registrySteamPath(), ...COMMON_PATHS()];
    const found = candidates.find((p) => p && existsSync(join(p, 'steam.exe')));
    return found ?? null;
  }

  async isAvailable(): Promise<boolean> {
    const p = this.detectPath();
    return p !== null && existsSync(join(p, 'steam.exe'));
  }

  private libraryFolders(root: string): string[] {
    const folders = [root];
    const vdfPath = join(root, 'steamapps', 'libraryfolders.vdf');
    if (!existsSync(vdfPath)) return folders;
    try {
      const rootNode = parseVdf(readFileSync(vdfPath, 'utf8'));
      const libNode = rootNode.libraryfolders as VdfNode | undefined;
      if (libNode) folders.push(...libraryFoldersFromVdf(libNode));
    } catch {
      // VDF corrompido → usa apenas o root
    }
    return [...new Set(folders)];
  }

  async scan(): Promise<ProviderGame[]> {
    const root = this.detectPath();
    if (!root) throw new Error('Steam não encontrado');

    const games: ProviderGame[] = [];
    for (const folder of this.libraryFolders(root)) {
      const steamApps = join(folder, 'steamapps');
      if (!existsSync(steamApps)) continue;
      for (const file of readdirSync(steamApps)) {
        if (!/^appmanifest_\d+\.acf$/i.test(file)) continue;
        try {
          const manifest = parseVdf(readFileSync(join(steamApps, file), 'utf8'));
          const state = manifest.AppState as VdfNode | undefined;
          const appid = vdfGet(state, 'appid');
          const name = vdfGet(state, 'name');
          const installdir = vdfGet(state, 'installdir');
          if (!appid || !name) continue;
          if (isNonGameSteam(appid, name)) continue;
          const sizeBytes = Number(vdfGet(state, 'SizeOnDisk')) || undefined;
          games.push({
            providerId: 'steam',
            externalId: appid,
            title: name,
            installPath: installdir ? join(steamApps, 'common', installdir) : undefined,
            sizeBytes,
            coverUrl: `https://cdn.cloudflare.steamstatic.com/steam/apps/${appid}/library_600x900.jpg`,
            raw: { libraryFolder: folder },
          });
        } catch {
          // manifest ilegível → ignora
        }
      }
    }
    return games.sort((a, b) => a.title.localeCompare(b.title));
  }

  async launch(game: ProviderGame): Promise<LaunchResult> {
    try {
      const { shell } = await import('electron');
      await shell.openExternal(`steam://rungameid/${game.externalId}`);
      return { ok: true };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  }

  async install(game: ProviderGame): Promise<LaunchResult> {
    try {
      const { shell } = await import('electron');
      await shell.openExternal(`steam://install/${game.externalId}`);
      return { ok: true };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  }
}
