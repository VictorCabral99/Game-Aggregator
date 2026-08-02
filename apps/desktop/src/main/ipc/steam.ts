import { ipcMain } from 'electron';
import { getLibraryRepository } from '../db';
import { getSteamProvider } from '../providers';

export function registerSteamHandlers(): void {
  const provider = () => getSteamProvider();

  ipcMain.handle('steam:status', async () => {
    const available = await provider().isAvailable();
    return {
      available,
      path: provider().detectPath(),
      gamesCount: getLibraryRepository().countByPlatform('steam'),
    };
  });

  ipcMain.handle('steam:scan', async () => {
    const games = await provider().scan();
    const { inserted } = getLibraryRepository().upsertMany(
      'steam',
      games.map((g) => ({
        externalId: g.externalId,
        title: g.title,
        sizeBytes: g.sizeBytes,
        coverUrl: g.coverUrl,
      }))
    );
    return { total: games.length, inserted, path: provider().detectPath() };
  });

  ipcMain.handle('steam:set-path', (_event, path: string) => {
    if (path && typeof path === 'string') {
      provider().setPathOverride(path);
    } else {
      provider().clearPathOverride();
    }
    return provider().detectPath();
  });
}
