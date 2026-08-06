import type { GamePlatform, StoreId } from '../../../shared/api';

export type View =
  | { kind: 'library' }
  | { kind: 'detail'; gameId: string }
  | { kind: 'form'; gameId: string | null }
  | { kind: 'providers' }
  | { kind: 'about' }
  | { kind: 'duplicates' }
  | { kind: 'emulation' }
  | { kind: 'wishlist' }
  | { kind: 'settings' }
  | { kind: 'accounts' };

export type AppSection = 'library' | 'stores' | 'wishlist' | 'retro' | 'organize';

export type PlatformFilter = 'all' | GamePlatform;

export type SortBy = 'name' | 'rating' | 'rawg' | 'metacritic' | 'steam';

export interface ToastState {
  message: string;
  kind: 'ok' | 'error';
}

export const STORE_LABELS: Array<{ id: StoreId; label: string }> = [
  { id: 'epic', label: 'Epic' },
  { id: 'gog', label: 'GOG' },
  { id: 'amazon', label: 'Amazon' },
];

export const FILTER_OPTIONS: Array<{ id: PlatformFilter; label: string }> = [
  { id: 'all', label: 'Todos' },
  { id: 'local', label: 'Local' },
  { id: 'steam', label: 'Steam' },
  { id: 'epic', label: 'Epic' },
  { id: 'gog', label: 'GOG' },
  { id: 'amazon', label: 'Amazon' },
  { id: 'emulator', label: 'Retro' },
];
