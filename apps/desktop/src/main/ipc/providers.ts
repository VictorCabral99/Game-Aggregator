import { ipcMain } from 'electron';
import type { ProviderStatus, StoreScanResult, SyncAllResult } from '../../shared/api';
import type { GamePlatform, ProviderGameRow } from '../db/games';
import { getLibraryRepository, getSetting, setSetting } from '../db';
import {
  getAmazonProvider,
  getEpicProvider,
  getGogProvider,
  getSteamProvider,
} from '../providers';
import type { SidecarProvider } from '../providers/sidecar';
import type { ProviderGame } from '@gagg/core';

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

/** Scan de um provider específico. */
export function scanSteam() {
  return runScan('steam', () => getSteamProvider().scan());
}

export function scanStore(id: GamePlatform) {
  const factory = STORE_FACTORIES.find((f) => f().platform === id);
  if (!factory) throw new Error(`Provider não suportado: ${id}`);
  const provider = factory();
  return runScan(id, () => provider.scan());
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
