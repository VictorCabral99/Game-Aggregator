import { ipcMain, dialog } from 'electron';
import {
  gamesByConsole,
  getRetroSetup,
  launchRom,
  listConsoles,
  mapRomFile,
  scanConsoleFolder,
  setActiveEmulator,
  setDefaultFolder,
  setEmulatorsRoot,
  setRomsRoot,
} from '../emulation';
import { getLibraryRepository } from '../db';

export function registerEmulationHandlers(): void {
  ipcMain.handle('emulation:list-consoles', () => listConsoles());

  ipcMain.handle('emulation:games', (_event, consoleId: string) => {
    if (!consoleId) throw new Error('consoleId é obrigatório');
    return gamesByConsole(consoleId);
  });

  ipcMain.handle('emulation:set-emulator', (_event, args: { consoleId: string; emulatorId: string }) => {
    if (!args?.consoleId || !args.emulatorId) throw new Error('consoleId e emulatorId são obrigatórios');
    return setActiveEmulator(args.consoleId, args.emulatorId);
  });

  ipcMain.handle('emulation:set-folder', (_event, args: { consoleId: string; folder: string }) => {
    if (!args?.consoleId) throw new Error('consoleId é obrigatório');
    return setDefaultFolder(args.consoleId, args.folder ?? '');
  });

  ipcMain.handle('emulation:setup-get', () => getRetroSetup());

  ipcMain.handle('emulation:pick-roms-root', async () => {
    const result = await dialog.showOpenDialog({
      title: 'Pasta de ROMs',
      properties: ['openDirectory'],
    });
    if (result.canceled || result.filePaths.length === 0) return null;
    return setRomsRoot(result.filePaths[0]);
  });

  ipcMain.handle('emulation:pick-emulators-root', async () => {
    const result = await dialog.showOpenDialog({
      title: 'Pasta de emuladores',
      properties: ['openDirectory'],
    });
    if (result.canceled || result.filePaths.length === 0) return null;
    return setEmulatorsRoot(result.filePaths[0]);
  });

  ipcMain.handle('emulation:scan-all', async (event) => {
    const consoles = await listConsoles();
    let found = 0;
    let added = 0;
    for (const c of consoles) {
      if (!c.defaultFolder) continue;
      const res = await scanConsoleFolder(c.id, (scanned, total) => {
        if (!event.sender.isDestroyed()) {
          event.sender.send('emulation:scan-progress', {
            consoleId: c.id,
            scanned,
            total: total || scanned,
          });
        }
      });
      found += res.found;
      added += res.added;
    }
    return { found, added };
  });

  ipcMain.handle('emulation:scan', async (event, consoleId: string) => {
    if (!consoleId) throw new Error('consoleId é obrigatório');
    const result = await scanConsoleFolder(consoleId, (scanned, total) => {
      if (!event.sender.isDestroyed()) {
        event.sender.send('emulation:scan-progress', {
          consoleId,
          scanned,
          total: total || scanned,
        });
      }
    });
    return result;
  });

  ipcMain.handle('emulation:pick-folder', async (_event, consoleId: string) => {
    if (!consoleId) throw new Error('consoleId é obrigatório');
    const result = await dialog.showOpenDialog({ properties: ['openDirectory'] });
    if (result.canceled || result.filePaths.length === 0) return null;
    const folder = result.filePaths[0];
    await setDefaultFolder(consoleId, folder);
    return { folder, scan: await scanConsoleFolder(consoleId) };
  });

  ipcMain.handle('emulation:map-rom', async (_event, args: { consoleId: string }) => {
    if (!args?.consoleId) throw new Error('consoleId é obrigatório');
    const result = await dialog.showOpenDialog({
      properties: ['openFile'],
      title: 'Selecionar ROM',
    });
    if (result.canceled || result.filePaths.length === 0) return null;
    await mapRomFile(args.consoleId, result.filePaths[0]);
    return { romPath: result.filePaths[0] };
  });

  ipcMain.handle('emulation:remove-rom', (_event, sourceId: string) => {
    if (!sourceId) throw new Error('sourceId é obrigatório');
    getLibraryRepository().removeRom(sourceId);
    return { ok: true };
  });

  ipcMain.handle('emulation:launch', async (_event, sourceId: string) => {
    if (!sourceId) throw new Error('sourceId é obrigatório');
    const source = getLibraryRepository().getSource(sourceId);
    if (!source) throw new Error('Fonte não encontrada');
    const result = await launchRom(source);
    if (result.ok) getLibraryRepository().touchSourcePlayed(source.id);
    return result;
  });
}
