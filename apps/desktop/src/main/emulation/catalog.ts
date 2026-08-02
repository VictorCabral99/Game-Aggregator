/**
 * Catálogo retro (P4-01/02/03).
 *
 * Modelo console-first: o console (SNES, GBA, PS2…) é a entidade principal;
 * o emulador é relativo — cada console lista opções pré-definidas
 * (emulatorId + core/args) e o usuário escolhe a ativa.
 */

export interface EmulatorProfile {
  id: string;
  name: string;
  /** Argumentos padrão; placeholders: {rom} para o caminho do ROM. */
  argsTemplate: string;
  /** Candidatos de detecção em paths comuns (windows). */
  detectCandidates: string[];
}

export interface ConsoleEmulatorOption {
  emulatorId: string;
  core?: string;
  args?: string;
}

export interface ConsoleDef {
  id: string;
  name: string;
  shortName: string;
  extensions: string[];
  biosHint?: string;
  defaultEmulator: string;
  defaultFolder: string;
  emulatorOptions: ConsoleEmulatorOption[];
}

export const DEFAULT_EMULATORS: EmulatorProfile[] = [
  {
    id: 'retroarch',
    name: 'RetroArch',
    argsTemplate: '-L {core} "{rom}"',
    detectCandidates: [
      'RetroArch-Win64\\retroarch.exe',
      'RetroArch\\retroarch.exe',
      'RetroArch\\retroarch64.exe',
    ],
  },
  {
    id: 'pcsx2',
    name: 'PCSX2',
    argsTemplate: '-batch -- "{rom}"',
    detectCandidates: ['PCSX2\\pcsx2-qt.exe', 'PCSX2\\pcsx2.exe'],
  },
  {
    id: 'duckstation',
    name: 'DuckStation',
    argsTemplate: '"{rom}"',
    detectCandidates: ['DuckStation\\duckstation-qt-x64-ReleaseLTCG.exe', 'DuckStation\\duckstation.exe'],
  },
  {
    id: 'bsnes',
    name: 'bsnes (standalone)',
    argsTemplate: '"{rom}"',
    detectCandidates: ['bsnes\\bsnes.exe', 'bsnes-hd\\bsnes.exe'],
  },
  {
    id: 'mGBA',
    name: 'mGBA',
    argsTemplate: '"{rom}"',
    detectCandidates: ['mGBA\\mGBA.exe', 'mGBA-0.10-win64\\mGBA.exe'],
  },
];

export const DEFAULT_CONSOLES: ConsoleDef[] = [
  {
    id: 'nes',
    name: 'Nintendo Entertainment System',
    shortName: 'NES',
    extensions: ['.nes'],
    biosHint: '—',
    defaultEmulator: 'retroarch',
    defaultFolder: '',
    emulatorOptions: [
      { emulatorId: 'retroarch', core: 'nestopia_libretro.dll' },
      { emulatorId: 'retroarch', core: 'fceumm_libretro.dll' },
      { emulatorId: 'bsnes' },
    ],
  },
  {
    id: 'snes',
    name: 'Super Nintendo Entertainment System',
    shortName: 'SNES',
    extensions: ['.smc', '.sfc'],
    biosHint: '—',
    defaultEmulator: 'retroarch',
    defaultFolder: '',
    emulatorOptions: [
      { emulatorId: 'retroarch', core: 'snes9x_libretro.dll' },
      { emulatorId: 'retroarch', core: 'bsnes_libretro.dll' },
      { emulatorId: 'bsnes' },
    ],
  },
  {
    id: 'gba',
    name: 'Game Boy Advance',
    shortName: 'GBA',
    extensions: ['.gba'],
    biosHint: '—',
    defaultEmulator: 'retroarch',
    defaultFolder: '',
    emulatorOptions: [
      { emulatorId: 'retroarch', core: 'mgba_libretro.dll' },
      { emulatorId: 'mGBA' },
    ],
  },
  {
    id: 'gbc',
    name: 'Game Boy / Game Boy Color',
    shortName: 'GB(C)',
    extensions: ['.gb', '.gbc'],
    biosHint: '—',
    defaultEmulator: 'retroarch',
    defaultFolder: '',
    emulatorOptions: [
      { emulatorId: 'retroarch', core: 'gambatte_libretro.dll' },
    ],
  },
  {
    id: 'genesis',
    name: 'Sega Genesis / Mega Drive',
    shortName: 'Genesis',
    extensions: ['.md', '.gen', '.bin'],
    biosHint: '—',
    defaultEmulator: 'retroarch',
    defaultFolder: '',
    emulatorOptions: [
      { emulatorId: 'retroarch', core: 'genesis_plus_gx_libretro.dll' },
      { emulatorId: 'retroarch', core: 'picodrive_libretro.dll' },
    ],
  },
  {
    id: 'ps1',
    name: 'PlayStation',
    shortName: 'PS1',
    extensions: ['.cue', '.chd', '.pbp', '.bin'],
    biosHint: 'PS1 BIOS',
    defaultEmulator: 'duckstation',
    defaultFolder: '',
    emulatorOptions: [
      { emulatorId: 'duckstation' },
      { emulatorId: 'retroarch', core: 'pcsx_rearmed_libretro.dll' },
    ],
  },
  {
    id: 'ps2',
    name: 'PlayStation 2',
    shortName: 'PS2',
    extensions: ['.iso', '.chd', '.cso'],
    biosHint: 'PS2 BIOS',
    defaultEmulator: 'pcsx2',
    defaultFolder: '',
    emulatorOptions: [
      { emulatorId: 'pcsx2' },
      { emulatorId: 'retroarch', core: 'pcsx2_libretro.dll' },
    ],
  },
];
