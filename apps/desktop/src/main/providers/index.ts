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

/** Dispara o launch do jogo pela plataforma correta (steam://, sidecar ou protocolo). */
export async function launchPlatformGame(
  platform: GamePlatform,
  externalId: string,
  opts?: { rawJson?: string | null }
): Promise<LaunchResult> {
  switch (platform) {
    case 'steam':
      return openStoreProtocol(steamLaunchUri(externalId));
    case 'epic': {
      if (getEpicProvider().isAvailable()) {
        const meta = parseEpicMeta(opts?.rawJson);
        const appName = meta.appId || externalId;
        return getEpicProvider().launchApp(appName);
      }
      return openStoreProtocol(epicAppUri(externalId, 'launch', parseEpicMeta(opts?.rawJson)));
    }
    case 'gog': {
      if (getGogProvider().isAvailable()) {
        return getGogProvider().launchApp(externalId);
      }
      return openStoreProtocol(gogOpenUri(externalId));
    }
    case 'amazon': {
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
 * Abre o fluxo de instalação no cliente oficial da loja (não baixa o jogo aqui).
 * Steam: steam://install · Epic: installer · GOG: Galaxy · Amazon: cliente / Nile.
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
      const steam = getSteamProvider();
      const steamRoot = steam.detectPath();
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
      if (getEpicProvider().isAvailable()) {
        const meta = parseEpicMeta(opts?.rawJson);
        const appName = meta.appId || externalId;
        return getEpicProvider().installApp(appName, platformDir(root, 'epic'));
      }
      return openStoreProtocol(epicAppUri(externalId, 'installer', parseEpicMeta(opts?.rawJson)));
    }
    case 'gog': {
      if (getGogProvider().isAvailable()) {
        const dest = suggestedInstallPath(root, 'gog', opts?.title || externalId);
        return getGogProvider().installApp(externalId, dest);
      }
      // Galaxy abre a página do jogo — o usuário confirma a instalação lá.
      return openStoreProtocol(gogOpenUri(externalId));
    }
    case 'amazon': {
      if (getAmazonProvider().isAvailable()) {
        const dest = suggestedInstallPath(root, 'amazon', opts?.title || externalId);
        return getAmazonProvider().installApp(externalId, dest);
      }
      const exe = findAmazonGamesExe();
      if (exe) return spawnDetached(exe);
      return {
        ok: false,
        error: 'Amazon Games não encontrado. Abra o cliente Amazon Games para instalar.',
      };
    }
    default:
      return { ok: false, error: `Plataforma sem instalação remota: ${platform}` };
  }
}
