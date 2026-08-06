import { ipcMain } from 'electron';
import type { ProviderStatus, StoreScanResult, SyncAllResult } from '../../shared/api';
import type { GamePlatform, ProviderGameRow } from '../db/games';
import { getAuthRepository, getLibraryRepository, getSetting, setSetting } from '../db';
import { getCurrentUserId } from '../auth';
import {
  getAmazonProvider,
  getEpicProvider,
  getGogProvider,
  getSteamProvider,
} from '../providers';
import type { SidecarProvider } from '../providers/sidecar';
import type { ProviderGame } from '@gagg/core';
import { fetchGogOwnedGames } from '../providers/gog-library';
import { fetchEpicOwnedGames } from '../providers/epic-library';
import { fetchAmazonOwnedGames } from '../providers/amazon-library';
import {
  fetchSteamOwnedGames,
  resolveSteamApiKey,
  resolveSteamId,
} from '../providers/steam-library';
import { isNonGameSteam } from '../providers/steam-filters';

const STORE_FACTORIES: Array<() => SidecarProvider> = [
  () => getEpicProvider(),
  () => getGogProvider(),
  () => getAmazonProvider(),
];

function scanKey(id: GamePlatform): string {
  return `last_scan.${id}`;
}

function errorKey(id: GamePlatform): string {
  return `last_error.${id}`;
}

function providerStatus(
  id: GamePlatform,
  displayName: string,
  gamesCount: number
): ProviderStatus {
  const lastScanAt = getSetting(scanKey(id));
  const error = getSetting(errorKey(id));
  return {
    id,
    displayName,
    available: false,
    version: null,
    gamesCount,
    path: null,
    lastScanAt,
    error,
  };
}

export async function steamStatus(): Promise<ProviderStatus> {
  const provider = getSteamProvider();
  const status = providerStatus('steam', provider.displayName, getLibraryRepository().countByPlatform('steam'));
  status.available = await provider.isAvailable();
  status.path = provider.detectPath();
  return status;
}

export function sidecarStatus(provider: SidecarProvider): ProviderStatus {
  const status = providerStatus(
    provider.platform,
    provider.displayName,
    getLibraryRepository().countByPlatform(provider.platform)
  );
  status.available = provider.isAvailable();
  status.version = provider.version();
  status.path = provider.binPath();

  // OAuth conectado conta como disponível mesmo sem sidecar
  if (!status.available && (provider.platform === 'gog' || provider.platform === 'epic' || provider.platform === 'amazon')) {
    const account = platformAccount(provider.platform);
    if (account?.accessToken) status.available = true;
  }
  return status;
}

/** Status de todos os providers (Steam + sidecars). */
export async function providersList(): Promise<ProviderStatus[]> {
  const statuses: ProviderStatus[] = [await steamStatus()];
  for (const factory of STORE_FACTORIES) statuses.push(sidecarStatus(factory()));
  return statuses;
}

function toRows(games: ProviderGame[]): ProviderGameRow[] {
  return games.map((g) => ({
    externalId: g.externalId,
    title: g.title,
    sizeBytes: g.sizeBytes,
    coverUrl: g.coverUrl,
    installPath: g.installPath,
    isInstalled: Boolean(g.installPath),
    rawJson: g.raw ? JSON.stringify(g.raw) : null,
  }));
}

async function runScan(
  id: GamePlatform,
  scan: () => Promise<ProviderGame[]> | ProviderGame[]
): Promise<StoreScanResult> {
  try {
    const games = await scan();
    const { inserted } = getLibraryRepository().upsertMany(id, toRows(games));
    setSetting(scanKey(id), new Date().toISOString());
    setSetting(errorKey(id), '');
    return { total: games.length, inserted };
  } catch (err) {
    setSetting(errorKey(id), err instanceof Error ? err.message : String(err));
    throw err;
  }
}

function mergeInstallPaths(owned: ProviderGame[], installed: ProviderGame[]): ProviderGame[] {
  const byId = new Map(installed.map((g) => [g.externalId, g]));
  const merged = owned.map((g) => {
    const local = byId.get(g.externalId);
    if (!local) return g;
    return {
      ...g,
      installPath: local.installPath ?? g.installPath,
      sizeBytes: local.sizeBytes ?? g.sizeBytes,
    };
  });
  for (const g of installed) {
    if (!merged.some((m) => m.externalId === g.externalId)) merged.push(g);
  }
  return merged;
}

/** Steam: owned (Web API) + instalados locais (manifests). */
export function scanSteam() {
  return runScan('steam', async () => {
    let installed: ProviderGame[] = [];
    try {
      installed = await getSteamProvider().scan();
    } catch {
      installed = [];
    }

    const steamId = resolveSteamId();
    const apiKey = resolveSteamApiKey();
    let merged: ProviderGame[];
    if (steamId && apiKey) {
      const owned = await fetchSteamOwnedGames(steamId, apiKey);
      merged = mergeInstallPaths(owned, installed);
    } else if (installed.length > 0) {
      merged = installed;
    } else if (!steamId) {
      throw new Error('Steam conectada sem SteamID — reconecte a Steam ou defina STEAM_ID');
    } else {
      throw new Error('STEAM_API_KEY ausente — não dá para listar a biblioteca owned');
    }

    const games = merged.filter((g) => !isNonGameSteam(g.externalId, g.title));
    purgeNonGameSteamEntries();
    return games;
  });
}

/** Remove SteamVR / runtimes já gravados (só entradas 100% steam não-jogo). */
export function purgeNonGameSteamEntries(): number {
  const repo = getLibraryRepository();
  let removed = 0;
  for (const game of repo.list()) {
    if (game.sources.length === 0) continue;
    if (!game.sources.every((s) => s.platform === 'steam')) continue;
    const hit = game.sources.some((s) =>
      isNonGameSteam(s.externalId, s.title || game.title)
    );
    if (!hit) continue;
    repo.remove(game.id);
    removed += 1;
  }
  return removed;
}

function gogAccessToken(): string | null {
  try {
    const userId = getCurrentUserId() ?? getAuthRepository().getFirstUserId();
    if (!userId) return null;
    return getAuthRepository().getPlatformAccount(userId, 'gog')?.accessToken ?? null;
  } catch {
    return null;
  }
}

function platformAccount(platform: 'epic' | 'gog' | 'amazon') {
  try {
    const userId = getCurrentUserId() ?? getAuthRepository().getFirstUserId();
    if (!userId) return null;
    return getAuthRepository().getPlatformAccount(userId, platform);
  } catch {
    return null;
  }
}

/** GOG/Epic/Amazon: owned via API OAuth; fallback sidecar list-installed se houver binário. */
export function scanStore(id: GamePlatform) {
  if (id === 'gog') {
    return runScan('gog', async () => {
      const token = gogAccessToken();
      if (token) {
        let installed: ProviderGame[] = [];
        try {
          if (getGogProvider().isAvailable()) installed = getGogProvider().scan();
        } catch {
          installed = [];
        }
        const owned = await fetchGogOwnedGames(token);
        return mergeInstallPaths(owned, installed);
      }
      const provider = getGogProvider();
      if (!provider.isAvailable()) {
        throw new Error('GOG não conectada (OAuth) e gogdl.exe ausente');
      }
      return provider.scan();
    });
  }

  if (id === 'epic') {
    return runScan('epic', async () => {
      const account = platformAccount('epic');
      const token = account?.accessToken;
      let installed: ProviderGame[] = [];
      try {
        if (getEpicProvider().isAvailable()) installed = getEpicProvider().scan();
      } catch {
        installed = [];
      }
      if (token) {
        const owned = await fetchEpicOwnedGames(token);
        return mergeInstallPaths(owned, installed);
      }
      if (installed.length > 0) return installed;
      throw new Error('Epic não conectada — use Lojas → Epic → Conectar');
    });
  }

  if (id === 'amazon') {
    return runScan('amazon', async () => {
      const account = platformAccount('amazon');
      const token = account?.accessToken;
      const serial =
        typeof account?.metadata === 'object' && account.metadata && 'serial' in account.metadata
          ? String((account.metadata as { serial?: string }).serial ?? '')
          : '';
      let installed: ProviderGame[] = [];
      try {
        if (getAmazonProvider().isAvailable()) installed = getAmazonProvider().scan();
      } catch {
        installed = [];
      }
      if (token && serial) {
        const owned = await fetchAmazonOwnedGames(token, serial);
        return mergeInstallPaths(owned, installed);
      }
      if (installed.length > 0) return installed;
      if (token && !serial) {
        throw new Error('Amazon conectada sem serial — reconecte a Amazon');
      }
      throw new Error('Amazon não conectada — use Lojas → Amazon → Conectar');
    });
  }

  const factory = STORE_FACTORIES.find((f) => f().platform === id);
  if (!factory) throw new Error(`Provider não suportado: ${id}`);
  const provider = factory();
  return runScan(id, () => provider.scan());
}

/** Após OAuth: importa jogos da loja conectada. */
export async function syncAfterPlatformConnect(
  platform: 'steam' | 'gog' | 'epic' | 'amazon'
): Promise<StoreScanResult> {
  if (platform === 'steam') return scanSteam();
  return scanStore(platform);
}

/** Sync all: roda todos os providers com Promise.allSettled (falha não derruba os outros). */
export async function providersSyncAll(): Promise<SyncAllResult> {
  const tasks: Array<{ id: GamePlatform; run: () => Promise<StoreScanResult> | StoreScanResult }> = [
    { id: 'steam', run: () => scanSteam() },
    ...STORE_FACTORIES.map((f) => {
      const provider = f();
      return { id: provider.platform as GamePlatform, run: () => scanStore(provider.platform) };
    }),
  ];

  const settled = await Promise.allSettled(tasks.map((t) => t.run()));

  const results = settled.map((res, i) => {
    const task = tasks[i];
    if (res.status === 'fulfilled') {
      return { id: task.id, ok: true, ...res.value };
    }
    return {
      id: task.id,
      ok: false,
      total: 0,
      inserted: 0,
      error: res.reason instanceof Error ? res.reason.message : String(res.reason),
    };
  });

  const totalScanned = results.reduce((acc, r) => acc + (r.ok ? r.total : 0), 0);
  const totalInserted = results.reduce((acc, r) => acc + (r.ok ? r.inserted : 0), 0);
  return { totalScanned, totalInserted, results };
}

export function registerProviderHandlers(): void {
  ipcMain.handle('providers:list', () => providersList());
  ipcMain.handle('providers:sync-all', () => providersSyncAll());
}
