import { ipcMain } from 'electron';
import { getSteamProvider } from '../providers';
import { scanSteam, steamStatus } from './providers';

export function registerSteamHandlers(): void {
  const provider = () => getSteamProvider();

  ipcMain.handle('steam:status', () => steamStatus());

  ipcMain.handle('steam:scan', async () => {
    const res = await scanSteam();
    return { ...res, path: provider().detectPath() };
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
