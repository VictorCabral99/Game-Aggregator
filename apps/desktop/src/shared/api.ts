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
  executable: string;
  cwd: string | null;
  coverPath: string | null;
  coverUrl: string | null;
  notes: string | null;
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
}
