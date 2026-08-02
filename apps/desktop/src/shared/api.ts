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
  createdAt: string;
  updatedAt: string;
  preferredSource: GameSource | null;
  sources: GameSource[];
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
}

export type UpdateGameInput = Partial<CreateGameInput>;

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

export interface DesktopApi {
  launchExe(req: LaunchRequest): Promise<LaunchResult>;
  dbHealth(): Promise<DbHealth>;
  openPath(path: string): Promise<{ ok: boolean; error?: string }>;
  libraryList(): Promise<Game[]>;
  libraryAdd(input: CreateGameInput): Promise<Game>;
  libraryUpdate(args: { id: string; patch: UpdateGameInput }): Promise<Game>;
  libraryRemove(id: string): Promise<{ ok: boolean }>;
  libraryLaunch(id: string): Promise<LaunchResult>;
  libraryLaunchSource(sourceId: string): Promise<LaunchResult>;
  libraryMergeSources(args: { targetGameId: string; sourceIds: string[] }): Promise<Game>;
  librarySeparateSource(sourceId: string): Promise<Game>;
  libraryPossibleDuplicates(): Promise<Array<{ a: Game; b: Game }>>;
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
  onEmulationScanProgress(cb: (data: { consoleId?: string; scanned: number; total: number }) => void): () => void;
  settingsGet(key: string): Promise<string | null>;
  settingsSet(key: string, value: string): Promise<void>;
}
