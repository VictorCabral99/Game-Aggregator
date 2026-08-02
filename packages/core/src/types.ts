/**
 * Contratos de domínio compartilhados (Fase 0 — stubs mínimos).
 * Evoluem nas Fases 1–3: CanonicalGame, GameSource, GameMetadata…
 */

export type PlatformId =
  | 'steam'
  | 'epic'
  | 'gog'
  | 'amazon'
  | 'local'
  | 'emulator'
  | 'manual';

export interface GameProviderCapabilities {
  scanLibrary: boolean;
  launch: boolean;
  install: boolean;
  playtime: boolean;
  uninstall: boolean;
}

export interface ProviderGame {
  providerId: PlatformId;
  externalId: string;
  title: string;
  installPath?: string;
  executable?: string;
  coverUrl?: string;
  playtimeMinutes?: number;
  sizeBytes?: number;
  lastPlayedAt?: string | null;
  raw?: Record<string, unknown>;
}

export interface LaunchOptions {
  cwd?: string;
  args?: string[];
  env?: Record<string, string>;
}

export interface LaunchResult {
  ok: boolean;
  error?: string;
  pid?: number;
}

export interface GameProvider {
  id: PlatformId;
  displayName: string;
  capabilities: GameProviderCapabilities;
  isAvailable(): Promise<boolean>;
  scan(): Promise<ProviderGame[]>;
  launch(game: ProviderGame, opts?: LaunchOptions): Promise<LaunchResult>;
  getInstallPath?(game: ProviderGame): Promise<string | null>;
}

export interface ProviderStatus {
  id: PlatformId;
  available: boolean;
  version?: string;
  error?: string;
  lastScanAt?: string;
  gamesCount?: number;
}
