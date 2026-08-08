import type { GamePlatform } from '../db/games';
import { getSetting, setSetting } from '../db';
import { SteamProvider } from './steam';
import { EpicProvider } from './epic';
import { GogProvider } from './gog';
import { AmazonProvider } from './amazon';
import type { LaunchResult } from '@gagg/core';
import {
  amazonOpenUri,
  epicAppUri,
  gogOpenUri,
  openStoreProtocol,
  steamInstallUri,
  steamLaunchUri,
} from './store-protocols';
import {
  heroicActionUri,
  heroicRunnerFor,
  isHeroicAvailable,
} from './heroic-installed';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { spawn } from 'node:child_process';

let steam: SteamProvider | null = null;
let epic: EpicProvider | null = null;
let gog: GogProvider | null = null;
let amazon: AmazonProvider | null = null;

export function getSteamProvider(): SteamProvider {
  if (!steam) {
    steam = new SteamProvider({ get: getSetting, set: setSetting });
  }
  return steam;
}

export function getEpicProvider(): EpicProvider {
  if (!epic) epic = new EpicProvider();
  return epic;
}

export function getGogProvider(): GogProvider {
  if (!gog) gog = new GogProvider();
  return gog;
}

export function getAmazonProvider(): AmazonProvider {
  if (!amazon) amazon = new AmazonProvider();
  return amazon;
}

function parseEpicMeta(rawJson: string | null | undefined): {
  namespace?: string;
  appId?: string;
  catalogItemId?: string;
} {
  if (!rawJson) return {};
  try {
    const raw = JSON.parse(rawJson) as {
      namespace?: string;
      appId?: string;
      catalogItemId?: string;
    };
    return {
      namespace: typeof raw.namespace === 'string' ? raw.namespace : undefined,
      appId: typeof raw.appId === 'string' ? raw.appId : undefined,
      catalogItemId: typeof raw.catalogItemId === 'string' ? raw.catalogItemId : undefined,
    };
  } catch {
    return {};
  }
}

function epicLaunchId(externalId: string, rawJson?: string | null): string {
  const meta = parseEpicMeta(rawJson);
  return meta.appId || externalId;
}

function findAmazonGamesExe(): string | null {
  const local = process.env.LOCALAPPDATA;
  if (!local) return null;
  const candidate = join(local, 'Amazon Games', 'App', 'Amazon Games.exe');
  return existsSync(candidate) ? candidate : null;
}

function spawnDetached(exe: string, args: string[] = []): Promise<LaunchResult> {
  return new Promise((resolve) => {
    const child = spawn(exe, args, { detached: true, stdio: 'ignore', windowsHide: false });
    const fail = (err: Error) => resolve({ ok: false, error: err.message });
    child.once('error', fail);
    child.once('spawn', () => {
      child.removeListener('error', fail);
      child.unref();
      resolve({ ok: true, pid: child.pid });
    });
  });
}

/** Prefer Heroic quando instalado (sem Epic Launcher / Galaxy / Amazon Games). */
async function viaHeroic(
  platform: 'epic' | 'gog' | 'amazon',
  action: 'launch' | 'install',
  appName: string,
  installPath?: string
): Promise<LaunchResult | null> {
  if (!isHeroicAvailable()) return null;
  return openStoreProtocol(
    heroicActionUri(action, heroicRunnerFor(platform), appName, {
      path: installPath,
    })
  );
}

/** Dispara o launch do jogo pela plataforma correta (Heroic, steam://, sidecar ou protocolo). */
export async function launchPlatformGame(
  platform: GamePlatform,
  externalId: string,
  opts?: { rawJson?: string | null }
): Promise<LaunchResult> {
  switch (platform) {
    case 'steam':
      return openStoreProtocol(steamLaunchUri(externalId));
    case 'epic': {
      const appName = epicLaunchId(externalId, opts?.rawJson);
      const heroic = await viaHeroic('epic', 'launch', appName);
      if (heroic) return heroic;
      if (getEpicProvider().isAvailable()) {
        return getEpicProvider().launchApp(appName);
      }
      return openStoreProtocol(epicAppUri(externalId, 'launch', parseEpicMeta(opts?.rawJson)));
    }
    case 'gog': {
      const heroic = await viaHeroic('gog', 'launch', externalId);
      if (heroic) return heroic;
      if (getGogProvider().isAvailable()) {
        return getGogProvider().launchApp(externalId);
      }
      return openStoreProtocol(gogOpenUri(externalId));
    }
    case 'amazon': {
      const heroic = await viaHeroic('amazon', 'launch', externalId);
      if (heroic) return heroic;
      if (getAmazonProvider().isAvailable()) {
        return getAmazonProvider().launchApp(externalId);
      }
      const exe = findAmazonGamesExe();
      if (exe) return spawnDetached(exe);
      return openStoreProtocol(amazonOpenUri(externalId));
    }
    default:
      return { ok: false, error: `Plataforma sem launch remoto: ${platform}` };
  }
}

/**
 * Abre o fluxo de instalação (Heroic preferencial; senão cliente oficial / sidecar).
 * Com sidecar: instala preferencialmente sob local.gamesRoot (C:\Games\{Loja}).
 */
export async function installPlatformGame(
  platform: GamePlatform,
  externalId: string,
  opts?: { rawJson?: string | null; title?: string }
): Promise<LaunchResult> {
  const { ensureOrganizeDirs, getGamesRoot, platformDir, suggestedInstallPath } = await import(
    '../organize'
  );
  try {
    await ensureOrganizeDirs();
  } catch {
    // pasta padrão é best-effort
  }
  const root = getGamesRoot();

  switch (platform) {
    case 'steam': {
      const steamProv = getSteamProvider();
      const steamRoot = steamProv.detectPath();
      if (steamRoot) {
        try {
          const { ensureSteamLibraryFolder } = await import('../organize');
          ensureSteamLibraryFolder(steamRoot, platformDir(root, 'steam'));
        } catch {
          // ignore
        }
      }
      return openStoreProtocol(steamInstallUri(externalId));
    }
    case 'epic': {
      const appName = epicLaunchId(externalId, opts?.rawJson);
      const dest = platformDir(root, 'epic');
      const heroic = await viaHeroic('epic', 'install', appName, dest);
      if (heroic) return heroic;
      if (getEpicProvider().isAvailable()) {
        return getEpicProvider().installApp(appName, dest);
      }
      return openStoreProtocol(epicAppUri(externalId, 'installer', parseEpicMeta(opts?.rawJson)));
    }
    case 'gog': {
      const dest = suggestedInstallPath(root, 'gog', opts?.title || externalId);
      const heroic = await viaHeroic('gog', 'install', externalId, dest);
      if (heroic) return heroic;
      if (getGogProvider().isAvailable()) {
        return getGogProvider().installApp(externalId, dest);
      }
      return openStoreProtocol(gogOpenUri(externalId));
    }
    case 'amazon': {
      const dest = suggestedInstallPath(root, 'amazon', opts?.title || externalId);
      const heroic = await viaHeroic('amazon', 'install', externalId, dest);
      if (heroic) return heroic;
      if (getAmazonProvider().isAvailable()) {
        return getAmazonProvider().installApp(externalId, dest);
      }
      const exe = findAmazonGamesExe();
      if (exe) return spawnDetached(exe);
      return {
        ok: false,
        error:
          'Amazon Games / Heroic não encontrados. Instale o Heroic ou o cliente Amazon Games.',
      };
    }
    default:
      return { ok: false, error: `Plataforma sem instalação remota: ${platform}` };
  }
}
