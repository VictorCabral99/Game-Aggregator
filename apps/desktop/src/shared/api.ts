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

export interface Game {
  id: string;
  title: string;
  executable: string | null;
  cwd: string | null;
  coverPath: string | null;
  coverUrl: string | null;
  notes: string | null;
  platform: 'local' | 'steam' | 'epic' | 'gog' | 'amazon' | 'emulator' | 'manual';
  externalId: string | null;
  createdAt: string;
  updatedAt: string;
  lastPlayedAt: string | null;
}

export interface CreateGameInput {
  title: string;
  executable: string;
  cwd?: string;
  coverPath?: string;
  coverUrl?: string;
  notes?: string;
}

export type UpdateGameInput = Partial<CreateGameInput>;

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
  id: Game['platform'];
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
    id: Game['platform'];
    ok: boolean;
    total: number;
    inserted: number;
    error?: string;
  }>;
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
  pickExe(): Promise<string | null>;
  pickCover(): Promise<string | null>;
  coverFromUrl(url: string): Promise<string>;
  steamStatus(): Promise<SteamStatus>;
  steamScan(): Promise<SteamScanResult>;
  steamSetPath(path: string): Promise<string | null>;
  storeStatus(id: StoreId): Promise<StoreStatus>;
  storeScan(id: StoreId): Promise<StoreScanResult>;
  providersList(): Promise<ProviderStatus[]>;
  providersSyncAll(): Promise<SyncAllResult>;
}
