import { contextBridge, ipcRenderer } from 'electron';
import type {
  CreateGameInput,
  DesktopApi,
  LaunchRequest,
  StoreId,
  UpdateGameInput,
  WishlistAddInput,
  User,
  Account,
  PlatformAccount,
  GoogleAuthStartResult,
  GoogleAuthCallbackResult,
  PlatformOAuthStartResult,
  ProfileId,
  ProfileTokens,
  MoonlightSettings,
} from '../shared/api';

const api: DesktopApi = {
  launchExe: (req: LaunchRequest) => ipcRenderer.invoke('launch:exe', req),
  dbHealth: () => ipcRenderer.invoke('db:health'),
  openPath: (path: string) => ipcRenderer.invoke('shell:open-path', path),
  openExternal: (url: string) => ipcRenderer.invoke('shell:open-external', url),
  libraryList: () => ipcRenderer.invoke('library:list'),
  libraryAdd: (input: CreateGameInput) => ipcRenderer.invoke('library:add', input),
  libraryUpdate: (args: { id: string; patch: UpdateGameInput }) =>
    ipcRenderer.invoke('library:update', args),
  libraryRemove: (id: string) => ipcRenderer.invoke('library:remove', id),
  libraryLaunch: (id: string) => ipcRenderer.invoke('library:launch', id),
  libraryLaunchSource: (sourceId: string) => ipcRenderer.invoke('library:launch-source', sourceId),
  libraryInstall: (id: string) => ipcRenderer.invoke('library:install', id),
  libraryInstallSource: (sourceId: string) => ipcRenderer.invoke('library:install-source', sourceId),
  libraryMergeSources: (args: { targetGameId: string; sourceIds: string[] }) =>
    ipcRenderer.invoke('library:merge-sources', args),
  librarySeparateSource: (sourceId: string) => ipcRenderer.invoke('library:separate-source', sourceId),
  libraryPossibleDuplicates: () => ipcRenderer.invoke('library:possible-duplicates'),
  libraryExport: () => ipcRenderer.invoke('library:export'),
  libraryImport: () => ipcRenderer.invoke('library:import'),
  libraryLocalSetupGet: () => ipcRenderer.invoke('library:local-setup-get'),
  libraryPickGamesRoot: () => ipcRenderer.invoke('library:pick-games-root'),
  libraryScanLocalGames: () => ipcRenderer.invoke('library:scan-local-games'),
  organizeGetRoot: () => ipcRenderer.invoke('organize:get-root'),
  organizeSetRoot: (folder: string) => ipcRenderer.invoke('organize:set-root', folder),
  organizeEnsureDirs: () => ipcRenderer.invoke('organize:ensure-dirs'),
  organizePickRoot: () => ipcRenderer.invoke('organize:pick-root'),
  organizeDiscover: (opts?: { includeSteam?: boolean; extraFolders?: string[] }) =>
    ipcRenderer.invoke('organize:discover', opts),
  organizePickScanFolder: () => ipcRenderer.invoke('organize:pick-scan-folder'),
  organizeTransfer: (ids: string[]) => ipcRenderer.invoke('organize:transfer', ids),
  onOrganizeTransferProgress: (cb) => {
    const listener = (_e: Electron.IpcRendererEvent, data: import('../shared/api').OrganizeTransferEvent) =>
      cb(data);
    ipcRenderer.on('organize:transfer-progress', listener);
    return () => ipcRenderer.removeListener('organize:transfer-progress', listener);
  },
  pickExe: () => ipcRenderer.invoke('pick-exe'),
  pickCover: () => ipcRenderer.invoke('pick-cover'),
  coverFromUrl: (url: string) => ipcRenderer.invoke('cover-from-url', url),
  coversDownloadMissing: () => ipcRenderer.invoke('covers:download-missing'),
  steamStatus: () => ipcRenderer.invoke('steam:status'),
  steamScan: () => ipcRenderer.invoke('steam:scan'),
  steamSetPath: (path: string) => ipcRenderer.invoke('steam:set-path', path),
  storeStatus: (id: StoreId) => ipcRenderer.invoke(`${id}:status`),
  storeScan: (id: StoreId) => ipcRenderer.invoke(`${id}:scan`),
  providersList: () => ipcRenderer.invoke('providers:list'),
  providersSyncAll: () => ipcRenderer.invoke('providers:sync-all'),
  emulationListConsoles: () => ipcRenderer.invoke('emulation:list-consoles'),
  emulationGames: (consoleId: string) => ipcRenderer.invoke('emulation:games', consoleId),
  emulationSetEmulator: (args: { consoleId: string; emulatorId: string }) =>
    ipcRenderer.invoke('emulation:set-emulator', args),
  emulationSetFolder: (args: { consoleId: string; folder: string }) =>
    ipcRenderer.invoke('emulation:set-folder', args),
  emulationScan: (consoleId: string) => ipcRenderer.invoke('emulation:scan', consoleId),
  emulationPickFolder: (consoleId: string) => ipcRenderer.invoke('emulation:pick-folder', consoleId),
  emulationMapRom: (consoleId: string) => ipcRenderer.invoke('emulation:map-rom', { consoleId }),
  emulationRemoveRom: (sourceId: string) => ipcRenderer.invoke('emulation:remove-rom', sourceId),
  emulationLaunch: (sourceId: string) => ipcRenderer.invoke('emulation:launch', sourceId),
  emulationSetupGet: () => ipcRenderer.invoke('emulation:setup-get'),
  emulationPickRomsRoot: () => ipcRenderer.invoke('emulation:pick-roms-root'),
  emulationPickEmulatorsRoot: () => ipcRenderer.invoke('emulation:pick-emulators-root'),
  emulationScanAll: () => ipcRenderer.invoke('emulation:scan-all'),
  onEmulationScanProgress: (cb) => {
    const listener = (_e: Electron.IpcRendererEvent, data: { consoleId?: string; scanned: number; total: number }) =>
      cb(data);
    ipcRenderer.on('emulation:scan-progress', listener);
    return () => ipcRenderer.removeListener('emulation:scan-progress', listener);
  },
  settingsGet: (key: string) => ipcRenderer.invoke('settings:get', key),
  settingsSet: (key: string, value: string) => ipcRenderer.invoke('settings:set', { key, value }),
  ratingsForGame: (gameId: string) => ipcRenderer.invoke('ratings:for-game', gameId),
  ratingsForLibrary: () => ipcRenderer.invoke('ratings:for-library'),
  ratingsSyncAll: () => ipcRenderer.invoke('ratings:sync-all'),
  ratingsEnrichStream: (opts?: { gameIds?: string[]; force?: boolean; maxGames?: number }) =>
    ipcRenderer.invoke('ratings:enrich-stream', opts),
  onLibraryEnrichProgress: (cb) => {
    const listener = (_e: Electron.IpcRendererEvent, data: import('../shared/api').EnrichEvent) =>
      cb(data);
    ipcRenderer.on('library:enrich-progress', listener);
    return () => ipcRenderer.removeListener('library:enrich-progress', listener);
  },
  ratingsSettings: () => ipcRenderer.invoke('ratings:settings'),
  wishlistList: () => ipcRenderer.invoke('wishlist:list'),
  wishlistAdd: (input: WishlistAddInput) => ipcRenderer.invoke('wishlist:add', input),
  wishlistUpdate: (args: { id: string; patch: Partial<WishlistAddInput> }) =>
    ipcRenderer.invoke('wishlist:update', args),
  wishlistRemove: (id: string) => ipcRenderer.invoke('wishlist:remove', id),
  wishlistSearch: (query: string) => ipcRenderer.invoke('wishlist:search', query),
  wishlistSyncPrices: () => ipcRenderer.invoke('wishlist:sync-prices'),
  wishlistImportSteam: () => ipcRenderer.invoke('wishlist:import-steam'),
  wishlistSettings: () => ipcRenderer.invoke('wishlist:settings'),
  // Profiles (P8-01)
  profileGet: () => ipcRenderer.invoke('profile:get'),
  profileSet: (profile: ProfileId) => ipcRenderer.invoke('profile:set', profile),
  profileGetTokens: (profile: ProfileId) => ipcRenderer.invoke('profile:get-tokens', profile),
  // Moonlight (P8-03)
  moonlightStatus: () => ipcRenderer.invoke('moonlight:status'),
  moonlightSettings: () => ipcRenderer.invoke('moonlight:settings'),
  moonlightSetSettings: (patch: Partial<MoonlightSettings>) =>
    ipcRenderer.invoke('moonlight:set-settings', patch),
  moonlightPickExe: () => ipcRenderer.invoke('moonlight:pick-exe'),
  moonlightLaunch: () => ipcRenderer.invoke('moonlight:launch'),
  // System (P9)
  appVersion: () => ipcRenderer.invoke('app:version'),
  appChangelog: () => ipcRenderer.invoke('app:changelog'),
  cacheClear: () => ipcRenderer.invoke('cache:clear'),
  telemetryStatus: () => ipcRenderer.invoke('telemetry:status'),
  telemetrySet: (enabled: boolean) => ipcRenderer.invoke('telemetry:set', enabled),
  updaterCheck: () => ipcRenderer.invoke('updater:check'),
  updaterDownload: () => ipcRenderer.invoke('updater:download'),
  windowIsFullscreen: () => ipcRenderer.invoke('window:is-fullscreen'),
  windowSetFullscreen: (on: boolean) => ipcRenderer.invoke('window:set-fullscreen', on),
  windowToggleFullscreen: () => ipcRenderer.invoke('window:toggle-fullscreen'),
  // Auth
  authGetCurrentUser: () => ipcRenderer.invoke('auth:get-current-user'),
  authGetGoogleAuthUrl: () => ipcRenderer.invoke('auth:get-google-auth-url'),
  authLoginWithGoogle: () => ipcRenderer.invoke('auth:login-with-google'),
  authGoogleCallback: (params: { code: string; state: string }) =>
    ipcRenderer.invoke('auth:google-callback', params),
  authGetPlatformAuthUrl: (platform: 'steam' | 'gog' | 'epic' | 'amazon') =>
    ipcRenderer.invoke('auth:get-platform-auth-url', platform),
  authConnectPlatform: (platform: 'steam' | 'gog' | 'epic' | 'amazon') =>
    ipcRenderer.invoke('auth:connect-platform', platform),
  authPlatformCallback: (params: { platform: string; code: string; state: string }) =>
    ipcRenderer.invoke('auth:platform-callback', params),
  authListPlatformAccounts: () => ipcRenderer.invoke('auth:list-platform-accounts'),
  authUnlinkPlatform: (platform: string) => ipcRenderer.invoke('auth:unlink-platform', platform),
  authLogout: () => ipcRenderer.invoke('auth:logout'),
};

contextBridge.exposeInMainWorld('api', api);
