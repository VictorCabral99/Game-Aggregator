import './load-env';
import { app, BrowserWindow, net, protocol } from 'electron';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { registerLaunchHandlers } from './ipc/launch';
import { initDatabase, registerDbHandlers } from './db';
import { registerLibraryHandlers } from './ipc/library';
import { registerCoverHandlers } from './ipc/cover';
import { registerSteamHandlers } from './ipc/steam';
import { registerStoreHandlers } from './ipc/store';
import { registerProviderHandlers } from './ipc/providers';
import { registerEmulationHandlers } from './ipc/emulation';
import { registerRatingsHandlers } from './ipc/ratings';
import { registerWishlistHandlers } from './ipc/wishlist';
import { registerAuthHandlers } from './auth';
import { registerPlatformAuthHandlers } from './platform-auth';
import { registerMoonlightHandlers } from './ipc/moonlight';
import { initTelemetry, registerSystemHandlers } from './ipc/system';
import { syncWishlistPrices } from './wishlist';
import { getSetting } from './db';

protocol.registerSchemesAsPrivileged([
  { scheme: 'cover', privileges: { secure: true, supportFetchAPI: true, stream: true } },
]);

function createWindow(): void {
  const startFullscreen = getSetting('ui.fullscreen') === '1';
  const win = new BrowserWindow({
    width: 1920,
    height: 1080,
    fullscreen: startFullscreen,
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

  // cover://img/<absolute-path-encoded> → arquivo local (capas da biblioteca)
  protocol.handle('cover', (req) => {
    try {
      const url = new URL(req.url);
      const filePath = decodeURIComponent(url.pathname.replace(/^\//, ''));
      return net.fetch(pathToFileURL(filePath).toString());
    } catch {
      return new Response('not found', { status: 404 });
    }
  });

  initDatabase();
  initTelemetry();
  registerLaunchHandlers();
  registerDbHandlers();
  registerLibraryHandlers();
  registerCoverHandlers();
  registerSteamHandlers();
  registerStoreHandlers();
  registerProviderHandlers();
  registerEmulationHandlers();
  registerRatingsHandlers();
  registerWishlistHandlers();
  registerAuthHandlers();
  registerPlatformAuthHandlers();
  registerMoonlightHandlers();
  registerSystemHandlers();

  // P7-10: sync periódico de preços enquanto o app está aberto (6h).
  const priceSyncMs = 6 * 3600 * 1000;
  setInterval(() => {
    void syncWishlistPrices().catch(() => undefined);
  }, priceSyncMs);

  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
