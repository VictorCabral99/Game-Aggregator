import { ipcMain } from 'electron';
import { getLibraryRepository } from '../db';
import type { GamePlatform } from '../db/games';
import { getAmazonProvider, getEpicProvider, getGogProvider } from '../providers';
import { SidecarProvider } from '../providers/sidecar';

const STORES: Array<() => SidecarProvider> = [
  () => getEpicProvider(),
  () => getGogProvider(),
  () => getAmazonProvider(),
];

export function registerStoreHandlers(): void {
  for (const factory of STORES) {
    const provider = factory();
    const id = provider.platform as GamePlatform;

    ipcMain.handle(`${id}:status`, () => {
      const repo = getLibraryRepository();
      return {
        id,
        displayName: provider.displayName,
        available: provider.isAvailable(),
        version: provider.version(),
        gamesCount: repo.countByPlatform(id),
      };
    });

    ipcMain.handle(`${id}:scan`, () => {
      const games = provider.scan();
      const { inserted } = getLibraryRepository().upsertMany(
        id,
        games.map((g) => ({
          externalId: g.externalId,
          title: g.title,
          sizeBytes: g.sizeBytes,
          coverUrl: g.coverUrl,
        }))
      );
      return { total: games.length, inserted };
    });
  }
}
