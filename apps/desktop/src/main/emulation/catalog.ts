/**
 * Catálogo retro (P4-01/02/03).
 *
 * Modelo console-first. `folderAliases` inclui nomes EmulationStation / RetroPie
 * (ex.: D:\Jogos\Retro Games\ROMs e ISOs\nes, psx, n64…).
 * Prioridade: Nintendo, Sony, Sega — demais sistemas entram se o alias bater.
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
  /** Nomes de pasta aceitos sob a raiz de ROMs (além de id/shortName). */
  folderAliases?: string[];
  /** Nome da pasta no CDN de thumbnails do Libretro (Named_Boxarts). */
  libretroSystem?: string;
  /** Família para ordenar UI (nintendo / sony / sega / other). */
  family?: 'nintendo' | 'sony' | 'sega' | 'other';
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
  {
    id: 'dolphin',
    name: 'Dolphin',
    argsTemplate: '-e "{rom}"',
    detectCandidates: ['Dolphin\\Dolphin.exe', 'Dolphin-x64\\Dolphin.exe'],
  },
  {
    id: 'rpcs3',
    name: 'RPCS3',
    argsTemplate: '"{rom}"',
    detectCandidates: ['RPCS3\\rpcs3.exe'],
  },
  {
    id: 'ppsspp',
    name: 'PPSSPP',
    argsTemplate: '"{rom}"',
    detectCandidates: ['PPSSPP\\PPSSPPWindows64.exe', 'PPSSPP\\PPSSPPWindows.exe'],
  },
  {
    id: 'citra',
    name: 'Citra',
    argsTemplate: '"{rom}"',
    detectCandidates: ['Citra\\citra-qt.exe', 'citra-nightly\\citra-qt.exe'],
  },
  {
    id: 'ryujinx',
    name: 'Ryujinx',
    argsTemplate: '"{rom}"',
    detectCandidates: ['Ryujinx\\Ryujinx.exe'],
  },
];

const ra = (core: string): ConsoleEmulatorOption => ({
  emulatorId: 'retroarch',
  core,
});

export const DEFAULT_CONSOLES: ConsoleDef[] = [
  // —— Nintendo ——
  {
    id: 'nes',
    name: 'Nintendo Entertainment System',
    shortName: 'NES',
    family: 'nintendo',
    extensions: ['.nes', '.unf', '.unif', '.zip', '.7z'],
    defaultEmulator: 'retroarch',
    defaultFolder: '',
    folderAliases: ['nes', 'famicom', 'fds', 'Nintendo Entertainment System'],
    libretroSystem: 'Nintendo - Nintendo Entertainment System',
    emulatorOptions: [ra('nestopia_libretro.dll'), ra('fceumm_libretro.dll')],
  },
  {
    id: 'snes',
    name: 'Super Nintendo',
    shortName: 'SNES',
    family: 'nintendo',
    extensions: ['.smc', '.sfc', '.fig', '.swc', '.zip', '.7z'],
    defaultEmulator: 'retroarch',
    defaultFolder: '',
    folderAliases: [
      'snes',
      'sfc',
      'snesna',
      'satellaview',
      'sufami',
      'Super Nintendo',
      'Super Famicom',
      'Super Nintendo Entertainment System',
    ],
    libretroSystem: 'Nintendo - Super Nintendo Entertainment System',
    emulatorOptions: [ra('snes9x_libretro.dll'), ra('bsnes_libretro.dll'), { emulatorId: 'bsnes' }],
  },
  {
    id: 'n64',
    name: 'Nintendo 64',
    shortName: 'N64',
    family: 'nintendo',
    extensions: ['.z64', '.n64', '.v64', '.zip', '.7z'],
    defaultEmulator: 'retroarch',
    defaultFolder: '',
    folderAliases: ['n64', 'n64dd', 'Nintendo 64'],
    libretroSystem: 'Nintendo - Nintendo 64',
    emulatorOptions: [ra('mupen64plus_next_libretro.dll'), ra('parallel_n64_libretro.dll')],
  },
  {
    id: 'gc',
    name: 'Nintendo GameCube',
    shortName: 'GC',
    family: 'nintendo',
    extensions: ['.iso', '.gcm', '.gcz', '.rvz', '.wbfs', '.ciso', '.dol'],
    defaultEmulator: 'dolphin',
    defaultFolder: '',
    folderAliases: ['gc', 'gamecube', 'GameCube', 'Nintendo GameCube'],
    libretroSystem: 'Nintendo - GameCube',
    emulatorOptions: [{ emulatorId: 'dolphin' }, ra('dolphin_libretro.dll')],
  },
  {
    id: 'wii',
    name: 'Nintendo Wii',
    shortName: 'Wii',
    family: 'nintendo',
    extensions: ['.iso', '.wbfs', '.gcm', '.gcz', '.rvz', '.wia', '.dol'],
    defaultEmulator: 'dolphin',
    defaultFolder: '',
    folderAliases: ['wii', 'Wii', 'Nintendo Wii'],
    libretroSystem: 'Nintendo - Wii',
    emulatorOptions: [{ emulatorId: 'dolphin' }],
  },
  {
    id: 'wiiu',
    name: 'Nintendo Wii U',
    shortName: 'Wii U',
    family: 'nintendo',
    extensions: ['.wud', '.wux', '.wua', '.rpx', '.iso'],
    defaultEmulator: 'retroarch',
    defaultFolder: '',
    folderAliases: ['wiiu', 'wii u', 'Wii U'],
    libretroSystem: 'Nintendo - Wii U',
    emulatorOptions: [ra('cemu_libretro.dll')],
  },
  {
    id: 'switch',
    name: 'Nintendo Switch',
    shortName: 'Switch',
    family: 'nintendo',
    extensions: ['.xci', '.nsp', '.nca', '.nro'],
    defaultEmulator: 'ryujinx',
    defaultFolder: '',
    folderAliases: ['switch', 'Switch', 'Nintendo Switch'],
    libretroSystem: 'Nintendo - Switch',
    emulatorOptions: [{ emulatorId: 'ryujinx' }],
  },
  {
    id: 'nds',
    name: 'Nintendo DS',
    shortName: 'NDS',
    family: 'nintendo',
    extensions: ['.nds', '.dsi', '.zip', '.7z'],
    defaultEmulator: 'retroarch',
    defaultFolder: '',
    folderAliases: ['nds', 'Nintendo DS', 'DS'],
    libretroSystem: 'Nintendo - Nintendo DS',
    emulatorOptions: [ra('melonds_libretro.dll'), ra('desmume_libretro.dll')],
  },
  {
    id: 'n3ds',
    name: 'Nintendo 3DS',
    shortName: '3DS',
    family: 'nintendo',
    extensions: ['.3ds', '.cia', '.cxi', '.app', '.cci'],
    defaultEmulator: 'citra',
    defaultFolder: '',
    folderAliases: ['n3ds', '3ds', 'Nintendo 3DS'],
    libretroSystem: 'Nintendo - Nintendo 3DS',
    emulatorOptions: [{ emulatorId: 'citra' }, ra('citra_libretro.dll')],
  },
  {
    id: 'gba',
    name: 'Game Boy Advance',
    shortName: 'GBA',
    family: 'nintendo',
    extensions: ['.gba', '.zip', '.7z'],
    defaultEmulator: 'retroarch',
    defaultFolder: '',
    folderAliases: ['gba', 'Game Boy Advance', 'Gameboy Advance'],
    libretroSystem: 'Nintendo - Game Boy Advance',
    emulatorOptions: [ra('mgba_libretro.dll'), { emulatorId: 'mGBA' }],
  },
  {
    id: 'gbc',
    name: 'Game Boy / Color',
    shortName: 'GB/C',
    family: 'nintendo',
    extensions: ['.gb', '.gbc', '.sgb', '.zip', '.7z'],
    defaultEmulator: 'retroarch',
    defaultFolder: '',
    folderAliases: ['gb', 'gbc', 'sgb', 'Game Boy', 'Game Boy Color', 'Gameboy'],
    libretroSystem: 'Nintendo - Game Boy Color',
    emulatorOptions: [ra('gambatte_libretro.dll'), ra('mgba_libretro.dll')],
  },
  {
    id: 'virtualboy',
    name: 'Virtual Boy',
    shortName: 'VB',
    family: 'nintendo',
    extensions: ['.vb', '.vboy', '.zip', '.7z'],
    defaultEmulator: 'retroarch',
    defaultFolder: '',
    folderAliases: ['virtualboy', 'Virtual Boy'],
    libretroSystem: 'Nintendo - Virtual Boy',
    emulatorOptions: [ra('mednafen_vb_libretro.dll')],
  },
  {
    id: 'pokemini',
    name: 'Pokémon Mini',
    shortName: 'PokeMini',
    family: 'nintendo',
    extensions: ['.min', '.zip', '.7z'],
    defaultEmulator: 'retroarch',
    defaultFolder: '',
    folderAliases: ['pokemini', 'Pokemon Mini'],
    libretroSystem: 'Nintendo - Pokemon Mini',
    emulatorOptions: [ra('pokemini_libretro.dll')],
  },

  // —— Sony ——
  {
    id: 'ps1',
    name: 'PlayStation',
    shortName: 'PS1',
    family: 'sony',
    extensions: ['.cue', '.chd', '.pbp', '.iso', '.img', '.m3u', '.ecm'],
    biosHint: 'PS1 BIOS',
    defaultEmulator: 'duckstation',
    defaultFolder: '',
    folderAliases: ['psx', 'ps1', 'playstation', 'PSXISOs', 'PS1ISOs'],
    libretroSystem: 'Sony - PlayStation',
    emulatorOptions: [{ emulatorId: 'duckstation' }, ra('pcsx_rearmed_libretro.dll')],
  },
  {
    id: 'ps2',
    name: 'PlayStation 2',
    shortName: 'PS2',
    family: 'sony',
    extensions: ['.iso', '.chd', '.cso', '.bin', '.dump', '.gz', '.m3u'],
    biosHint: 'PS2 BIOS',
    defaultEmulator: 'pcsx2',
    defaultFolder: '',
    folderAliases: ['ps2', 'PlayStation 2', 'Playstation 2', 'PS2ISOs'],
    libretroSystem: 'Sony - PlayStation 2',
    emulatorOptions: [{ emulatorId: 'pcsx2' }, ra('pcsx2_libretro.dll')],
  },
  {
    id: 'ps3',
    name: 'PlayStation 3',
    shortName: 'PS3',
    family: 'sony',
    extensions: ['.iso', '.pkg', '.rap'],
    biosHint: 'PS3 firmware',
    defaultEmulator: 'rpcs3',
    defaultFolder: '',
    folderAliases: ['ps3', 'PlayStation 3'],
    libretroSystem: 'Sony - PlayStation 3',
    emulatorOptions: [{ emulatorId: 'rpcs3' }],
  },
  {
    id: 'psp',
    name: 'PlayStation Portable',
    shortName: 'PSP',
    family: 'sony',
    extensions: ['.iso', '.cso', '.pbp', '.chd', '.prx'],
    defaultEmulator: 'ppsspp',
    defaultFolder: '',
    folderAliases: ['psp', 'PlayStation Portable'],
    libretroSystem: 'Sony - PlayStation Portable',
    emulatorOptions: [{ emulatorId: 'ppsspp' }, ra('ppsspp_libretro.dll')],
  },
  {
    id: 'psvita',
    name: 'PlayStation Vita',
    shortName: 'Vita',
    family: 'sony',
    extensions: ['.vpk', '.mai', '.psv'],
    defaultEmulator: 'retroarch',
    defaultFolder: '',
    folderAliases: ['psvita', 'vita', 'PS Vita'],
    libretroSystem: 'Sony - PlayStation Vita',
    emulatorOptions: [ra('vita3k_libretro.dll')],
  },

  // —— Sega (principais) ——
  {
    id: 'genesis',
    name: 'Sega Genesis / Mega Drive',
    shortName: 'Genesis',
    family: 'sega',
    extensions: ['.md', '.gen', '.smd', '.bin', '.zip', '.7z'],
    defaultEmulator: 'retroarch',
    defaultFolder: '',
    folderAliases: [
      'genesis',
      'megadrive',
      'megadrivejp',
      'mark3',
      'Mega Drive',
      'md',
      'Sega Mega Drive',
    ],
    libretroSystem: 'Sega - Mega Drive - Genesis',
    emulatorOptions: [ra('genesis_plus_gx_libretro.dll'), ra('picodrive_libretro.dll')],
  },
  {
    id: 'mastersystem',
    name: 'Sega Master System',
    shortName: 'SMS',
    family: 'sega',
    extensions: ['.sms', '.zip', '.7z'],
    defaultEmulator: 'retroarch',
    defaultFolder: '',
    folderAliases: ['mastersystem', 'Master System', 'sms'],
    libretroSystem: 'Sega - Master System - Mark III',
    emulatorOptions: [ra('genesis_plus_gx_libretro.dll')],
  },
  {
    id: 'gamegear',
    name: 'Sega Game Gear',
    shortName: 'GG',
    family: 'sega',
    extensions: ['.gg', '.zip', '.7z'],
    defaultEmulator: 'retroarch',
    defaultFolder: '',
    folderAliases: ['gamegear', 'Game Gear'],
    libretroSystem: 'Sega - Game Gear',
    emulatorOptions: [ra('genesis_plus_gx_libretro.dll')],
  },
  {
    id: 'sega32x',
    name: 'Sega 32X',
    shortName: '32X',
    family: 'sega',
    extensions: ['.32x', '.zip', '.7z'],
    defaultEmulator: 'retroarch',
    defaultFolder: '',
    folderAliases: ['sega32x', 'sega32xjp', 'sega32xna', '32x'],
    libretroSystem: 'Sega - 32X',
    emulatorOptions: [ra('picodrive_libretro.dll')],
  },
  {
    id: 'segacd',
    name: 'Sega CD / Mega CD',
    shortName: 'Sega CD',
    family: 'sega',
    extensions: ['.cue', '.chd', '.iso', '.m3u'],
    biosHint: 'Sega CD BIOS',
    defaultEmulator: 'retroarch',
    defaultFolder: '',
    folderAliases: ['segacd', 'megacd', 'megacdjp', 'Sega CD', 'Mega CD'],
    libretroSystem: 'Sega - Mega-CD - Sega CD',
    emulatorOptions: [ra('genesis_plus_gx_libretro.dll')],
  },
  {
    id: 'saturn',
    name: 'Sega Saturn',
    shortName: 'Saturn',
    family: 'sega',
    extensions: ['.cue', '.chd', '.iso', '.m3u'],
    biosHint: 'Saturn BIOS',
    defaultEmulator: 'retroarch',
    defaultFolder: '',
    folderAliases: ['saturn', 'saturnjp', 'Sega Saturn'],
    libretroSystem: 'Sega - Saturn',
    emulatorOptions: [ra('mednafen_saturn_libretro.dll'), ra('beetle_saturn_libretro.dll')],
  },
  {
    id: 'dreamcast',
    name: 'Sega Dreamcast',
    shortName: 'DC',
    family: 'sega',
    extensions: ['.cdi', '.gdi', '.chd', '.cue', '.iso'],
    defaultEmulator: 'retroarch',
    defaultFolder: '',
    folderAliases: ['dreamcast', 'Dreamcast'],
    libretroSystem: 'Sega - Dreamcast',
    emulatorOptions: [ra('flycast_libretro.dll')],
  },
];
