import { app, BrowserWindow } from 'electron';
import { join } from 'node:path';
import { registerLaunchHandlers } from './ipc/launch';
import { initDatabase, registerDbHandlers } from './db';

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1920,
    height: 1080,
    fullscreen: true,
    autoHideMenuBar: true,
    title: 'Game Aggregator Launcher',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  if (process.env.ELECTRON_RENDERER_URL) {
    win.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'));
  }
}

app.whenReady().then(() => {
  app.setAppUserModelId('com.gameaggregator.launcher');

  initDatabase();
  registerLaunchHandlers();
  registerDbHandlers();

  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
