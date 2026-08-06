/**
 * Apps Steam que não são jogo (runtime/ferramentas).
 * SteamVR AppID oficial: 250820; build main: 330050.
 */
export const NON_GAME_STEAM_APPIDS = new Set([
  '250820', // SteamVR
  '330050', // SteamVR (Main)
]);

const NON_GAME_STEAM_TITLE =
  /^(steam\s*vr|steamvr(\s+home)?|steam\s*works?\s*common\s*redistributables?)$/i;

/**
 * Runtime/ferramenta Steam — não entra na biblioteca.
 * Match por AppID conhecido ou título.
 */
export function isNonGameSteam(appId: string | null | undefined, title: string): boolean {
  const id = (appId ?? '').trim();
  if (id && NON_GAME_STEAM_APPIDS.has(id)) return true;
  const t = title.trim();
  if (!t) return false;
  return NON_GAME_STEAM_TITLE.test(t);
}
