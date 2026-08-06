import type { GamePlatform } from '../../shared/api';

/** Pastas sob a raiz padrão (C:\Games\…). */
export type OrganizeFolder = 'Epic' | 'GOG' | 'Luna' | 'Steam' | 'Outros';

export type OrganizeSourceKind = 'heroic' | 'steam' | 'local';

export type OrganizeStorePlatform = Extract<GamePlatform, 'steam' | 'epic' | 'gog' | 'amazon' | 'local'>;

export interface OrganizeGame {
  id: string;
  title: string;
  platform: OrganizeStorePlatform;
  folder: OrganizeFolder;
  currentPath: string;
  suggestedPath: string;
  sizeBytes: number | null;
  alreadyStandard: boolean;
  source: OrganizeSourceKind;
  /** App / product id na loja (Legendary app_name, GOG id, Steam appid…). */
  externalId: string;
  /** false = Microsoft Store/Xbox etc. — não oferecer mover. Default true. */
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
