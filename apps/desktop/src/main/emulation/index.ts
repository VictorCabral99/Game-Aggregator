import { promises as fs } from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { app } from 'electron';
import { getSetting, setSetting } from '../db';
import { getLibraryRepository } from '../db';
import type { GameSource } from '../db/games';
import { DEFAULT_EMULATORS, DEFAULT_CONSOLES } from './catalog';
import type { ConsoleDef, EmulatorProfile } from './catalog';
import { cleanRomTitle, isHiddenEntry, isValidRom } from './rom';

export interface EmulatorView {
  id: string;
  name: string;
  core: string | null;
  args: string | null;
  detectedPath: string | null;
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

let cachedEmulators: EmulatorProfile[] | null = null;
let cachedConsoles: ConsoleDef[] | null = null;

function userDataDir(): string {
  return app.getPath('userData');
}

/**
 * Consoles/emuladores editáveis via JSON em %APPDATA%/game-aggregator
 * (consoles.json / emulators.json). Se existirem, fazem merge sobre o default.
 */
async function loadJsonCatalog<T>(file: string): Promise<T[] | null> {
  try {
    const raw = await fs.readFile(path.join(userDataDir(), file), 'utf8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as T[]) : null;
  } catch {
    return null;
  }
}

async function getEmulators(): Promise<EmulatorProfile[]> {
  if (cachedEmulators) return cachedEmulators;
  const custom = await loadJsonCatalog<EmulatorProfile>('emulators.json');
  cachedEmulators = custom && custom.length > 0 ? custom : DEFAULT_EMULATORS;
  return cachedEmulators;
}

async function getConsoles(): Promise<ConsoleDef[]> {
  if (cachedConsoles) return cachedConsoles;
  const custom = await loadJsonCatalog<ConsoleDef>('consoles.json');
  cachedConsoles = custom && custom.length > 0 ? custom : DEFAULT_CONSOLES;
  return cachedConsoles;
}

const DETECT_HINTS: Record<string, string[]> = {
  retroarch: [
    '%LOCALAPPDATA%\\RetroArch\\retroarch.exe',
    '%PROGRAMFILES%\\RetroArch\\retroarch.exe',
    '%USERPROFILE%\\RetroArch\\retroarch.exe',
    'C:\\RetroArch\\retroarch.exe',
  ],
  pcsx2: [
    '%LOCALAPPDATA%\\PCSX2\\pcsx2-qt.exe',
    '%PROGRAMFILES%\\PCSX2\\pcsx2-qt.exe',
    'C:\\PCSX2\\pcsx2-qt.exe',
  ],
  duckstation: [
    '%LOCALAPPDATA%\\DuckStation\\duckstation-qt-x64-ReleaseLTCG.exe',
    '%PROGRAMFILES%\\DuckStation\\duckstation-qt-x64-ReleaseLTCG.exe',
    'C:\\DuckStation\\duckstation-qt-x64-ReleaseLTCG.exe',
  ],
  bsnes: [
    '%PROGRAMFILES%\\bsnes\\bsnes.exe',
    'C:\\bsnes\\bsnes.exe',
  ],
  'mGBA': [
    '%PROGRAMFILES%\\mGBA\\mGBA.exe',
    'C:\\mGBA\\mGBA.exe',
  ],
};

function expandEnv(p: string): string {
  return p.replace(/%([^%]+)%/g, (_m, name: string) => process.env[name] ?? '');
}

async function detectEmulatorPath(emulatorId: string): Promise<string | null> {
  const saved = getSetting(`emulator.${emulatorId}.path`);
  if (saved) return saved;
  const candidates = DETECT_HINTS[emulatorId] ?? [];
  for (const hint of candidates) {
    const full = expandEnv(hint);
    try {
      await fs.access(full);
      return full;
    } catch {
      // tenta o próximo candidato
    }
  }
  return null;
}

async function emulatorViewFor(
  option: { emulatorId: string; core?: string; args?: string }
): Promise<EmulatorView> {
  const emulators = await getEmulators();
  const profile = emulators.find((e) => e.id === option.emulatorId);
  return {
    id: option.emulatorId,
    name: profile?.name ?? option.emulatorId,
    core: option.core ?? null,
    args: option.args ?? null,
    detectedPath: await detectEmulatorPath(option.emulatorId),
  };
}

function activeEmulatorSetting(consoleId: string): string {
  return getSetting(`console.${consoleId}.emulator`) ?? '';
}

function defaultFolderSetting(consoleId: string): string {
  return getSetting(`console.${consoleId}.defaultFolder`) ?? '';
}

export async function listConsoles(): Promise<ConsoleView[]> {
  const consoles = await getConsoles();
  const familyOrder = { nintendo: 0, sony: 1, sega: 2, other: 3 } as const;
  const sorted = [...consoles].sort((a, b) => {
    const fa = familyOrder[a.family ?? 'other'];
    const fb = familyOrder[b.family ?? 'other'];
    if (fa !== fb) return fa - fb;
    return a.name.localeCompare(b.name);
  });
  const repo = getLibraryRepository();
  const views: ConsoleView[] = [];
  for (const c of sorted) {
    const activeEmulator = activeEmulatorSetting(c.id) || c.defaultEmulator;
    const defaultFolder = defaultFolderSetting(c.id) || c.defaultFolder;
    const emulatorOptions = await Promise.all(c.emulatorOptions.map(emulatorViewFor));
    views.push({
      id: c.id,
      name: c.name,
      shortName: c.shortName,
      extensions: c.extensions,
      biosHint: c.biosHint ?? null,
      gamesCount: repo.countByConsole(c.id),
      defaultFolder,
      activeEmulator,
      emulatorOptions,
    });
  }
  return views;
}

export async function setActiveEmulator(consoleId: string, emulatorId: string): Promise<void> {
  const consoles = await getConsoles();
  const console = consoles.find((c) => c.id === consoleId);
  if (!console) throw new Error(`Console desconhecido: ${consoleId}`);
  const valid = console.emulatorOptions.some((o) => o.emulatorId === emulatorId);
  if (!valid) throw new Error(`Emulador inválido para ${console.name}: ${emulatorId}`);
  setSetting(`console.${consoleId}.emulator`, emulatorId);
}

export async function setDefaultFolder(consoleId: string, folder: string): Promise<void> {
  setSetting(`console.${consoleId}.defaultFolder`, folder);
}

export interface RetroSetupStatus {
  romsRoot: string;
  emulatorsRoot: string;
  romsConfigured: boolean;
  emulatorsDetected: number;
  lastScanFound?: number;
  lastScanAdded?: number;
}

export function getRetroSetup(): RetroSetupStatus {
  const romsRoot = getSetting('emulation.romsRoot')?.trim() ?? '';
  const emulatorsRoot = getSetting('emulation.emulatorsRoot')?.trim() ?? '';
  let emulatorsDetected = 0;
  for (const emu of DEFAULT_EMULATORS) {
    if (getSetting(`emulator.${emu.id}.path`)) emulatorsDetected += 1;
  }
  return {
    romsRoot,
    emulatorsRoot,
    romsConfigured: Boolean(romsRoot),
    emulatorsDetected,
  };
}

/**
 * Pastas do console sob a raiz (aliases EmulationStation: nes/, psx/, n64/…).
 * Nunca usa a raiz inteira — cada sistema só olha suas subpastas.
 */
async function resolveConsoleFolders(root: string, console: ConsoleDef): Promise<string[]> {
  const aliases = [
    console.id,
    console.shortName,
    ...(console.folderAliases ?? []),
  ];
  const wanted = new Set(
    aliases
      .map((a) => a.trim().toLowerCase())
      .filter(Boolean)
      .map((a) => a.replace(/\s+/g, ''))
  );
  // também aceita alias com espaços (ex.: "wii u") vs pasta "wiiu"
  for (const a of aliases) {
    const raw = a.trim().toLowerCase();
    if (raw) wanted.add(raw);
  }

  const found: string[] = [];
  const seen = new Set<string>();

  const push = (full: string) => {
    const key = full.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    found.push(full);
  };

  for (const alias of aliases) {
    const direct = path.join(root, alias);
    try {
      await fs.access(direct);
      push(direct);
    } catch {
      // next
    }
  }

  try {
    const entries = await fs.readdir(root, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory() || isHiddenEntry(entry.name)) continue;
      const name = entry.name.toLowerCase();
      const compact = name.replace(/\s+/g, '');
      if (wanted.has(name) || wanted.has(compact)) {
        push(path.join(root, entry.name));
      }
    }
  } catch {
    // ignore
  }

  return found;
}

/**
 * Pasta raiz de ROMs (onboarding): aplica a todos os consoles.
 * Prefer subpasta snes/gba/… (e aliases) se existir; senão deixa vazio (não escaneia a raiz).
 */
export async function setRomsRoot(folder: string): Promise<RetroSetupStatus> {
  const trimmed = folder.trim();
  setSetting('emulation.romsRoot', trimmed);
  if (trimmed) {
    const consoles = await getConsoles();
    for (const c of consoles) {
      const folders = await resolveConsoleFolders(trimmed, c);
      setSetting(`console.${c.id}.defaultFolder`, folders[0] ?? '');
      setSetting(`console.${c.id}.extraFolders`, JSON.stringify(folders.slice(1)));
    }
  } else {
    const consoles = await getConsoles();
    for (const c of consoles) {
      setSetting(`console.${c.id}.defaultFolder`, '');
      setSetting(`console.${c.id}.extraFolders`, '[]');
    }
  }
  return getRetroSetup();
}

function extraFoldersFor(consoleId: string): string[] {
  try {
    const raw = getSetting(`console.${consoleId}.extraFolders`);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === 'string' && !!x) : [];
  } catch {
    return [];
  }
}

async function foldersForConsole(consoleId: string): Promise<string[]> {
  const root = getSetting('emulation.romsRoot')?.trim() ?? '';
  const consoles = await getConsoles();
  const def = consoles.find((c) => c.id === consoleId);
  if (root && def) {
    const resolved = await resolveConsoleFolders(root, def);
    if (resolved.length > 0) return resolved;
  }
  const primary = defaultFolderSetting(consoleId) || def?.defaultFolder || '';
  const extras = extraFoldersFor(consoleId);
  return [primary, ...extras].filter(Boolean);
}

/** Escaneia todos os consoles com pasta configurada / aliases sob romsRoot. */
export async function scanAllConsoles(
  onProgress?: (consoleId: string, scanned: number, total: number) => void
): Promise<{ found: number; added: number }> {
  const root = getSetting('emulation.romsRoot')?.trim() ?? '';
  // Re-resolve aliases se a raiz mudou ou o catálogo cresceu
  if (root) {
    const consoles = await getConsoles();
    for (const c of consoles) {
      const folders = await resolveConsoleFolders(root, c);
      setSetting(`console.${c.id}.defaultFolder`, folders[0] ?? '');
      setSetting(`console.${c.id}.extraFolders`, JSON.stringify(folders.slice(1)));
    }
  }

  const consoles = await getConsoles();
  let found = 0;
  let added = 0;
  for (const c of consoles) {
    const res = await scanConsoleFolder(c.id, (scanned, total) => {
      onProgress?.(c.id, scanned, total || scanned);
    });
    found += res.found;
    added += res.added;
  }
  return { found, added };
}

/** Pasta de emuladores: detecta exes conhecidos e grava emulator.<id>.path. */
export async function setEmulatorsRoot(folder: string): Promise<RetroSetupStatus> {
  const trimmed = folder.trim();
  setSetting('emulation.emulatorsRoot', trimmed);
  if (!trimmed) return getRetroSetup();

  const emulators = await getEmulators();
  for (const emu of emulators) {
    const found = await findExeUnder(trimmed, emu);
    if (found) setSetting(`emulator.${emu.id}.path`, found);
  }
  for (const [id, hints] of Object.entries(DETECT_HINTS)) {
    if (getSetting(`emulator.${id}.path`)) continue;
    for (const hint of hints) {
      const base = path.basename(expandEnv(hint));
      const candidate = path.join(trimmed, base);
      try {
        await fs.access(candidate);
        setSetting(`emulator.${id}.path`, candidate);
        break;
      } catch {
        // next
      }
    }
  }
  return getRetroSetup();
}

async function findExeUnder(root: string, emu: EmulatorProfile): Promise<string | null> {
  const names = new Set(
    [
      ...emu.detectCandidates.map((c) => path.basename(c).toLowerCase()),
      `${emu.id.toLowerCase()}.exe`,
    ].filter(Boolean)
  );

  const queue: Array<{ dir: string; depth: number }> = [{ dir: root, depth: 0 }];
  while (queue.length > 0) {
    const { dir, depth } = queue.shift()!;
    let entries;
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (isHiddenEntry(entry.name)) continue;
      const full = path.join(dir, entry.name);
      if (entry.isFile() && names.has(entry.name.toLowerCase())) return full;
      if (entry.isDirectory() && depth < 2) {
        const folderHit = emu.detectCandidates.some((c) =>
          c.toLowerCase().includes(entry.name.toLowerCase())
        );
        if (folderHit || depth === 0) queue.push({ dir: full, depth: depth + 1 });
      }
    }
  }
  return null;
}

export async function gamesByConsole(consoleId: string) {
  return getLibraryRepository().listByConsole(consoleId);
}

async function walkRoms(
  folder: string,
  extensions: string[],
  out: string[],
  onProgress?: (count: number) => void,
  depth = 0
): Promise<void> {
  if (depth > 8) return;
  let entries;
  try {
    entries = await fs.readdir(folder, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    if (isHiddenEntry(entry.name)) continue;
    const full = path.join(folder, entry.name);
    if (entry.isDirectory()) {
      await walkRoms(full, extensions, out, onProgress, depth + 1);
    } else if (entry.isFile() && isValidRom(entry.name, extensions)) {
      out.push(full);
      onProgress?.(out.length);
    }
  }
}

/**
 * Scan da pasta padrão (drop-in): reconhece ROMs pela extensão e cria/atualiza
 * GameSources com console_id. Recursivo, ignora pastas ocultas.
 */
export async function scanConsoleFolder(
  consoleId: string,
  onProgress?: (scanned: number, total: number) => void
): Promise<{ found: number; added: number }> {
  const consoles = await getConsoles();
  const console = consoles.find((c) => c.id === consoleId);
  if (!console) throw new Error(`Console desconhecido: ${consoleId}`);

  const folders = await foldersForConsole(consoleId);
  if (folders.length === 0) return { found: 0, added: 0 };

  const roms: string[] = [];
  for (const folder of folders) {
    await walkRoms(folder, console.extensions, roms, () => onProgress?.(roms.length, 0));
  }

  const repo = getLibraryRepository();
  const existing = new Set(
    repo
      .listByConsole(consoleId)
      .flatMap((g) => g.sources.map((s) => s.installPath?.toLowerCase()))
      .filter(Boolean) as string[]
  );

  let added = 0;
  for (let i = 0; i < roms.length; i += 1) {
    const rom = roms[i];
    const key = rom.toLowerCase();
    if (!existing.has(key)) {
      repo.upsertRom(consoleId, rom, cleanRomTitle(rom));
      added += 1;
    }
    onProgress?.(i + 1, roms.length);
  }
  return { found: roms.length, added };
}

/** Mapeamento manual de ROM (P4-09): aponta um arquivo explícito. */
export async function mapRomFile(consoleId: string, romPath: string): Promise<void> {
  const consoles = await getConsoles();
  const console = consoles.find((c) => c.id === consoleId);
  if (!console) throw new Error(`Console desconhecido: ${consoleId}`);
  if (!isValidRom(romPath, console.extensions)) {
    throw new Error(
      `Arquivo não é um ROM válido para ${console.name} (extensões: ${console.extensions.join(', ')})`
    );
  }
  getLibraryRepository().upsertRom(consoleId, romPath, cleanRomTitle(romPath));
}

async function resolveEmulatorArgs(
  console: ConsoleDef,
  option: { emulatorId: string; core?: string; args?: string },
  romPath: string
): Promise<string[]> {
  const emulators = await getEmulators();
  const profile = emulators.find((e) => e.id === option.emulatorId);
  const template = option.args ?? profile?.argsTemplate ?? '';
  const core = option.core ? path.basename(option.core) : null;
  let args = template
    .replace('{core}', core ?? '')
    .replace('{rom}', romPath)
    .trim();
  if (core && !args.includes(core)) args = `-L ${core} ${args}`.trim();
  return args ? args.split(/\s+(?=(?:[^"]*"[^"]*")*[^"]*$)/).map((a) => a.replace(/^"|"$/g, '')) : [romPath];
}

/**
 * Launch do ROM (P4-07): resolve o emulador ativo do console e dispara
 * `retroarch -L core rom` / `pcsx2 -batch -- rom`.
 */
export async function launchRom(source: GameSource): Promise<{ ok: boolean; error?: string }> {
  if (source.platform !== 'emulator' || !source.consoleId) {
    return { ok: false, error: 'Fonte não é um ROM retro' };
  }
  const consoles = await getConsoles();
  const console = consoles.find((c) => c.id === source.consoleId);
  if (!console) return { ok: false, error: `Console desconhecido: ${source.consoleId}` };

  const activeId = activeEmulatorSetting(console.id) || console.defaultEmulator;
  const option = console.emulatorOptions.find((o) => o.emulatorId === activeId);
  if (!option) return { ok: false, error: `Sem opção de emulador ativa para ${console.name}` };

  const exe = await detectEmulatorPath(activeId);
  if (!exe) {
    return {
      ok: false,
      error: `Emulador "${activeId}" não encontrado. Configure o caminho do binário em Emulação → ${console.shortName}.`,
    };
  }
  if (!source.installPath) return { ok: false, error: 'ROM sem caminho de arquivo' };

  const args = await resolveEmulatorArgs(console, option, source.installPath);
  try {
    const child = spawn(exe, args, {
      cwd: path.dirname(exe),
      detached: true,
      stdio: 'ignore',
      windowsHide: false,
    });
    child.unref();
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
