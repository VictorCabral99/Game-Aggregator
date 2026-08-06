export type {
  OrganizeDiscoverResult,
  OrganizeFolder,
  OrganizeGame,
  OrganizeRootStatus,
  OrganizeSourceKind,
  OrganizeStorePlatform,
  OrganizeTransferEvent,
  OrganizeTransferResult,
} from './types';

export {
  DEFAULT_GAMES_ROOT,
  ORGANIZE_FOLDERS,
  ensureOrganizeDirs,
  folderNameFromTitle,
  getGamesRoot,
  getOrganizeRootStatus,
  isAlreadyStandard,
  isProtectedInstallPath,
  platformDir,
  platformFolder,
  setGamesRoot,
  suggestedInstallPath,
} from './root';

export {
  defaultHeroicPaths,
  discoverHeroicGames,
  parseGogInstalled,
  parseLegendaryInstalled,
  parseNileInstalled,
  patchHeroicInstallPath,
} from './heroic';

export {
  discoverOrganizeGames,
  discoverKnownLocals,
  discoverSteamGames,
  discoverXboxGames,
  discoverHeroicOrphans,
  discoverNamedLocals,
  scanExtraGamesFolder,
  dedupeOrganizeGames,
  findPokemonTcgLivePath,
  scrapeAllGames,
  scoreGameDir,
} from './discover';
export { transferOrganizeGames, movePath, shouldFallbackCopy } from './transfer';
export { ensureSteamLibraryFolder, ensureSteamLibraryInVdf, planSteamMove } from './steam-library';
