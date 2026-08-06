/**
 * Contrato IPC entre main, preload e renderer.
 * Fica em src/shared para os três builds importarem (type-only).
 */

export interface LaunchRequest {
  exe: string;
  cwd?: string;
  args?: string[];
}

export interface LaunchResult {
  ok: boolean;
  error?: string;
  pid?: number;
}

export interface DbHealth {
  ok: boolean;
  path?: string;
  appVersion?: string;
  schemaVersion?: number;
  settingsCount?: number;
  error?: string;
}

export type GamePlatform = 'local' | 'steam' | 'epic' | 'gog' | 'amazon' | 'emulator' | 'manual';

export type ProfileId = 'desk' | 'tv' | 'handheld';

export interface ProfileTokens {
  cardWidth: number;
  cardGap: number;
  padding: number;
  fontScale: number;
  maxColumns: number;
  safeMarginPct: number;
  hideCursorAfterMs: number;
}

export interface GameSource {
  id: string;
  platform: GamePlatform;
  externalId: string | null;
  title: string;
  installPath: string | null;
  executable: string | null;
  cwd: string | null;
  isInstalled: boolean;
  sizeBytes: number | null;
  lastPlayedAt: string | null;
  scannedAt: string;
  consoleId: string | null;
}

export interface Game {
  id: string;
  slug: string;
  title: string;
  normalizedTitle: string;
  coverPath: string | null;
  coverUrl: string | null;
  notes: string | null;
  summary: string | null;
  genres: string[];
  /** Args extras no launch local (opt-in, ex.: -fullscreen). P8-05. */
  launchArgs: string | null;
  /** Badge Remote — jogo marcado como stream/remoto. P8-04. */
  isRemote: boolean;
  /**
   * Steam AppID resolvido (fonte Steam ou lookup por título).
   * Retro-only fica null. Usado p/ notas e link SteamDB.
   */
  steamAppId: string | null;
  createdAt: string;
  updatedAt: string;
  preferredSource: GameSource | null;
  sources: GameSource[];
}

/** Link SteamDB.info para um AppID. */
export function steamDbInfoUrl(appId: string): string {
  return `https://steamdb.info/app/${encodeURIComponent(appId.trim())}/`;
}

export interface CreateGameInput {
  title: string;
  executable?: string;
  cwd?: string;
  coverPath?: string;
  coverUrl?: string;
  notes?: string;
  summary?: string;
  genres?: string[];
  platform?: GamePlatform;
  externalId?: string;
  launchArgs?: string;
  isRemote?: boolean;
}

export type UpdateGameInput = Partial<CreateGameInput>;

export interface MoonlightSettings {
  path: string;
  host: string;
  app: string;
  extraArgs: string;
}

export interface MoonlightStatus {
  available: boolean;
  path: string | null;
  host: string | null;
  app: string | null;
  error: string | null;
}

export interface LibraryExportPayload {
  version: 1;
  exportedAt: string;
  profile: ProfileId | null;
  games: Array<{
    title: string;
    coverUrl: string | null;
    notes: string | null;
    summary: string | null;
    genres: string[];
    launchArgs: string | null;
    isRemote: boolean;
    sources: Array<{
      platform: GamePlatform;
      externalId: string | null;
      title: string;
      installPath: string | null;
      executable: string | null;
      cwd: string | null;
      isInstalled: boolean;
      consoleId: string | null;
    }>;
  }>;
}

export interface LibraryImportResult {
  imported: number;
  skipped: number;
  error?: string;
}

export interface UpdateCheckResult {
  ok: boolean;
  updateAvailable: boolean;
  currentVersion: string;
  latestVersion?: string | null;
  message: string;
}

export interface CoversResult {
  downloaded: number;
  failed: number;
}

export interface SteamStatus {
  available: boolean;
  path: string | null;
  gamesCount: number;
  lastScanAt: string | null;
  error: string | null;
}

export interface SteamScanResult {
  total: number;
  inserted: number;
  path: string | null;
}

export type StoreId = 'epic' | 'gog' | 'amazon';

export interface StoreStatus {
  id: string;
  displayName: string;
  available: boolean;
  version: string | null;
  gamesCount: number;
  path: string | null;
  lastScanAt: string | null;
  error: string | null;
}

export interface StoreScanResult {
  total: number;
  inserted: number;
}

/** Status unificado de qualquer provider (Steam + sidecars). */
export interface ProviderStatus {
  id: GamePlatform;
  displayName: string;
  available: boolean;
  version: string | null;
  gamesCount: number;
  path: string | null;
  lastScanAt: string | null;
  error: string | null;
}

/** Resultado do sync all por provider. */
export interface SyncAllResult {
  totalScanned: number;
  totalInserted: number;
  results: Array<{
    id: GamePlatform;
    ok: boolean;
    total: number;
    inserted: number;
    error?: string;
  }>;
}

export interface ConsoleView {
  id: string;
  name: string;
  shortName: string;
  extensions: string[];
  biosHint: string | null;
  gamesCount: number;
  defaultFolder: string;
  activeEmulator: string;
  emulatorOptions: EmulatorView[];
}

export interface EmulatorView {
  id: string;
  name: string;
  core: string | null;
  args: string | null;
  detectedPath: string | null;
}

export interface RomScanResult {
  found: number;
  added: number;
}

export interface RetroSetupStatus {
  romsRoot: string;
  emulatorsRoot: string;
  romsConfigured: boolean;
  emulatorsDetected: number;
  lastScanFound?: number;
  lastScanAdded?: number;
}

export interface LocalGamesSetupStatus {
  gamesRoot: string;
  configured: boolean;
  gamesFound: number;
}

export interface LocalGamesScanResult {
  found: number;
  added: number;
}

export type OrganizeFolder = 'Epic' | 'GOG' | 'Luna' | 'Steam' | 'Outros';

export type OrganizeSourceKind = 'heroic' | 'steam' | 'local';

export interface OrganizeGame {
  id: string;
  title: string;
  platform: Extract<GamePlatform, 'steam' | 'epic' | 'gog' | 'amazon' | 'local'>;
  folder: OrganizeFolder;
  currentPath: string;
  suggestedPath: string;
  sizeBytes: number | null;
  alreadyStandard: boolean;
  source: OrganizeSourceKind;
  externalId: string;
  canMove?: boolean;
  hint?: string;
}

export interface OrganizeRootStatus {
  gamesRoot: string;
  configured: boolean;
  dirsReady: boolean;
}

export interface OrganizeDiscoverResult {
  gamesRoot: string;
  items: OrganizeGame[];
}

export type OrganizeTransferEvent =
  | { type: 'start'; total: number }
  | {
      type: 'item';
      index: number;
      total: number;
      id: string;
      title: string;
      stage: 'move' | 'patch' | 'done' | 'error';
      message?: string;
    }
  | { type: 'done'; moved: number; failed: number };

export interface OrganizeTransferResult {
  moved: number;
  failed: number;
  errors: Array<{ id: string; title: string; error: string }>;
}

export type RatingSource = 'rawg' | 'metacritic' | 'steam';

export interface GameRating {
  gameId: string;
  source: RatingSource;
  rating: number | null;
  reviewCount: number | null;
  url: string | null;
  matchedName: string | null;
  lastUpdated: string | null;
}

export interface RatingsSummary {
  score: number | null;
  source: RatingSource | null;
  updatedAt: string | null;
  sources: Array<{
    source: RatingSource;
    score: number | null;
    reviewCount: number | null;
    lastUpdated: string | null;
  }>;
}

export interface RatingsSyncResult {
  attempted: number;
  updated: number;
  skippedFresh: number;
  noKey: boolean;
  covers?: number;
  error?: string;
}

/** Eventos do stream de enriquecimento (capa + notas), estilo NDJSON da main. */
export type EnrichEvent =
  | { type: 'start'; total: number }
  | {
      type: 'item';
      index: number;
      total: number;
      gameId: string;
      title: string;
      coverOk: boolean;
      coverPath: string | null;
      summary: RatingsSummary | null;
      steamAppId?: string | null;
      skipped?: boolean;
    }
  | {
      type: 'done';
      updated: number;
      covers: number;
      skippedFresh: number;
      noKey: boolean;
    }
  | { type: 'error'; message: string };

export interface PriceSnapshot {
  id: string;
  wishlistId: string;
  source: string;
  itadId: string | null;
  currentPrice: number | null;
  regularPrice: number | null;
  cutPercent: number | null;
  historicalLow: number | null;
  historicalLowShop: string | null;
  shopName: string | null;
  currency: string | null;
  url: string | null;
  fetchedAt: string;
}

export interface WishlistEntry {
  id: string;
  gameId: string | null;
  title: string;
  itadId: string | null;
  slug: string | null;
  steamAppId: string | null;
  coverUrl: string | null;
  preferredStores: string[];
  targetPrice: number | null;
  currency: string;
  alertEnabled: boolean;
  note: string | null;
  createdAt: string;
  updatedAt: string;
  price: PriceSnapshot | null;
}

export interface ITADSearchResult {
  id: string;
  slug: string;
  title: string;
  type: string;
}

export interface WishlistAddInput {
  title: string;
  itadId?: string | null;
  slug?: string | null;
  steamAppId?: string | null;
  coverUrl?: string | null;
  targetPrice?: number | null;
  preferredStores?: string[];
  alertEnabled?: boolean;
  gameId?: string | null;
}

export interface WishlistAlert {
  title: string;
  currentPrice: number;
  targetPrice: number;
  currency: string;
  url: string | null;
}

export interface WishlistSyncResult {
  attempted: number;
  updated: number;
  noKey: boolean;
  alerts: WishlistAlert[];
  error?: string;
}

export interface SteamWishlistImportResult {
  imported: number;
  skipped: number;
  error?: string | null;
  warning?: string | null;
}

// Auth types
export interface User {
  id: string;
  email: string;
  name: string | null;
  image: string | null;
  emailVerified: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Account {
  id: string;
  userId: string;
  type: string;
  provider: string;
  providerAccountId: string;
  refreshToken: string | null;
  accessToken: string | null;
  expiresAt: number | null;
  tokenType: string | null;
  scope: string | null;
  idToken: string | null;
  sessionState: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PlatformAccount {
  id: string;
  userId: string;
  platform: 'steam' | 'gog' | 'epic' | 'amazon';
  externalUserId: string;
  displayName: string | null;
  accessToken: string | null;
  refreshToken: string | null;
  tokenExpiresAt: string | null;
  metadata: Record<string, unknown> | null;
  linkedAt: string;
  lastLibrarySyncAt: string | null;
  lastWishlistSyncAt: string | null;
  updatedAt: string;
}

export interface GoogleAuthStartResult {
  authUrl: string;
  state: string;
}

export interface GoogleAuthCallbackResult {
  user: User;
  account: Account;
}

export interface PlatformOAuthStartResult {
  authUrl: string;
  state: string;
  platform: string;
}

export interface DesktopApi {
  launchExe(req: LaunchRequest): Promise<LaunchResult>;
  dbHealth(): Promise<DbHealth>;
  openPath(path: string): Promise<{ ok: boolean; error?: string }>;
  openExternal(url: string): Promise<{ ok: boolean; error?: string }>;
  libraryList(): Promise<Game[]>;
  libraryAdd(input: CreateGameInput): Promise<Game>;
  libraryUpdate(args: { id: string; patch: UpdateGameInput }): Promise<Game>;
  libraryRemove(id: string): Promise<{ ok: boolean }>;
  libraryLaunch(id: string): Promise<LaunchResult>;
  libraryLaunchSource(sourceId: string): Promise<LaunchResult>;
  libraryInstall(id: string): Promise<LaunchResult>;
  libraryInstallSource(sourceId: string): Promise<LaunchResult>;
  libraryMergeSources(args: { targetGameId: string; sourceIds: string[] }): Promise<Game>;
  librarySeparateSource(sourceId: string): Promise<Game>;
  libraryPossibleDuplicates(): Promise<Array<{ a: Game; b: Game }>>;
  libraryLocalSetupGet(): Promise<LocalGamesSetupStatus>;
  libraryPickGamesRoot(): Promise<LocalGamesSetupStatus | null>;
  libraryScanLocalGames(): Promise<LocalGamesScanResult>;
  organizeGetRoot(): Promise<OrganizeRootStatus>;
  organizeSetRoot(folder: string): Promise<OrganizeRootStatus>;
  organizeEnsureDirs(): Promise<OrganizeRootStatus>;
  organizePickRoot(): Promise<OrganizeRootStatus | null>;
  organizeDiscover(opts?: {
    includeSteam?: boolean;
    extraFolders?: string[];
  }): Promise<OrganizeDiscoverResult>;
  organizePickScanFolder(): Promise<string | null>;
  organizeTransfer(ids: string[]): Promise<OrganizeTransferResult>;
  onOrganizeTransferProgress(cb: (event: OrganizeTransferEvent) => void): () => void;
  pickExe(): Promise<string | null>;
  pickCover(): Promise<string | null>;
  coverFromUrl(url: string): Promise<string>;
  coversDownloadMissing(): Promise<CoversResult>;
  steamStatus(): Promise<SteamStatus>;
  steamScan(): Promise<SteamScanResult>;
  steamSetPath(path: string): Promise<string | null>;
  storeStatus(id: StoreId): Promise<StoreStatus>;
  storeScan(id: StoreId): Promise<StoreScanResult>;
  providersList(): Promise<ProviderStatus[]>;
  providersSyncAll(): Promise<SyncAllResult>;
  emulationListConsoles(): Promise<ConsoleView[]>;
  emulationGames(consoleId: string): Promise<Game[]>;
  emulationSetEmulator(args: { consoleId: string; emulatorId: string }): Promise<void>;
  emulationSetFolder(args: { consoleId: string; folder: string }): Promise<void>;
  emulationScan(consoleId: string): Promise<RomScanResult>;
  emulationPickFolder(consoleId: string): Promise<{ folder: string; scan: RomScanResult } | null>;
  emulationMapRom(consoleId: string): Promise<{ romPath: string } | null>;
  emulationRemoveRom(sourceId: string): Promise<{ ok: boolean }>;
  emulationLaunch(sourceId: string): Promise<LaunchResult>;
  emulationSetupGet(): Promise<RetroSetupStatus>;
  emulationPickRomsRoot(): Promise<RetroSetupStatus | null>;
  emulationPickEmulatorsRoot(): Promise<RetroSetupStatus | null>;
  emulationScanAll(): Promise<RomScanResult>;
  onEmulationScanProgress(cb: (data: { consoleId?: string; scanned: number; total: number }) => void): () => void;
  settingsGet(key: string): Promise<string | null>;
  settingsSet(key: string, value: string): Promise<void>;
  ratingsForGame(gameId: string): Promise<RatingsSummary | null>;
  ratingsForLibrary(): Promise<Record<string, RatingsSummary | null>>;
  ratingsSyncAll(): Promise<RatingsSyncResult>;
  ratingsEnrichStream(opts?: {
    gameIds?: string[];
    force?: boolean;
    maxGames?: number;
  }): Promise<RatingsSyncResult & { covers: number }>;
  onLibraryEnrichProgress(cb: (event: EnrichEvent) => void): () => void;
  ratingsSettings(): Promise<{ rawgKey: string; steamKey: string }>;
  wishlistList(): Promise<WishlistEntry[]>;
  wishlistAdd(input: WishlistAddInput): Promise<WishlistEntry>;
  wishlistUpdate(args: { id: string; patch: Partial<WishlistAddInput> }): Promise<WishlistEntry>;
  wishlistRemove(id: string): Promise<{ ok: boolean }>;
  wishlistSearch(query: string): Promise<ITADSearchResult[]>;
  wishlistSyncPrices(): Promise<WishlistSyncResult>;
  wishlistImportSteam(): Promise<SteamWishlistImportResult>;
  wishlistSettings(): Promise<{ itadKey: string; country: string; steamId: string }>;
  // Profiles (P8-01)
  profileGet(): Promise<ProfileId>;
  profileSet(profile: ProfileId): Promise<void>;
  profileGetTokens(profile: ProfileId): Promise<ProfileTokens>;
  // Moonlight (P8-03)
  moonlightStatus(): Promise<MoonlightStatus>;
  moonlightSettings(): Promise<MoonlightSettings>;
  moonlightSetSettings(patch: Partial<MoonlightSettings>): Promise<MoonlightSettings>;
  moonlightPickExe(): Promise<string | null>;
  moonlightLaunch(): Promise<LaunchResult>;
  // Backup local (P8-06)
  libraryExport(): Promise<{ ok: boolean; path?: string; error?: string }>;
  libraryImport(): Promise<LibraryImportResult>;
  // System (P9)
  appVersion(): Promise<string>;
  appChangelog(): Promise<string>;
  cacheClear(): Promise<{ ok: boolean; coversRemoved: number }>;
  telemetryStatus(): Promise<{ enabled: boolean; dsnConfigured: boolean }>;
  telemetrySet(enabled: boolean): Promise<{ enabled: boolean }>;
  updaterCheck(): Promise<UpdateCheckResult>;
  updaterDownload(): Promise<UpdateCheckResult>;
  windowIsFullscreen(): Promise<boolean>;
  windowSetFullscreen(on: boolean): Promise<boolean>;
  windowToggleFullscreen(): Promise<boolean>;
  // Auth
  authGetCurrentUser(): Promise<User | null>;
  authGetGoogleAuthUrl(): Promise<GoogleAuthStartResult>;
  authLoginWithGoogle(): Promise<GoogleAuthCallbackResult>;
  authGoogleCallback(params: { code: string; state: string }): Promise<GoogleAuthCallbackResult>;
  authGetPlatformAuthUrl(platform: 'steam' | 'gog' | 'epic' | 'amazon'): Promise<PlatformOAuthStartResult>;
  authConnectPlatform(platform: 'steam' | 'gog' | 'epic' | 'amazon'): Promise<PlatformAccount>;
  authPlatformCallback(params: { platform: string; code: string; state: string }): Promise<PlatformAccount>;
  authListPlatformAccounts(): Promise<PlatformAccount[]>;
  authUnlinkPlatform(platform: string): Promise<{ ok: boolean }>;
  authLogout(): Promise<{ ok: boolean }>;
}
