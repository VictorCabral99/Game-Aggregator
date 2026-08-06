/** Pure helpers for ratings/deals sync eligibility (extracted from API routes). */

export function resolveSteamAppId(
  platform: string,
  externalId: string,
  gameData: Record<string, unknown>
): number | null {
  if (platform === 'steam') {
    const fromExternal = parseInt(externalId, 10);
    if (!Number.isNaN(fromExternal) && fromExternal > 0) return fromExternal;
  }
  const fromData = gameData.appid ?? gameData.steam_appid;
  if (fromData !== undefined && fromData !== null && fromData !== '') {
    const n =
      typeof fromData === 'number' ? fromData : parseInt(String(fromData), 10);
    if (!Number.isNaN(n) && n > 0) return n;
  }
  return null;
}

export function ratingOf(
  ratings: { source: string; rating: number | null; lastUpdated: Date }[],
  source: string
): { rating: number | null; lastUpdated: Date } | null {
  const row = ratings.find((r) => r.source === source);
  return row ? { rating: row.rating, lastUpdated: row.lastUpdated } : null;
}

export function isFreshUseful(
  row: { rating: number | null; lastUpdated: Date } | null,
  staleCutoff: number
) {
  if (!row || row.rating === null || row.rating <= 0) return false;
  return row.lastUpdated.getTime() >= staleCutoff;
}

export type DealRow = {
  source: string;
  currentPrice: number | null;
  lastUpdated: Date;
};

/** Whether a wishlist item should be re-fetched for ITAD deals. */
export function isDealEligible(
  deals: DealRow[],
  force: boolean,
  staleCutoff: number
): boolean {
  if (force) return true;
  const deal = deals.find((d) => d.source === 'itad');
  if (!deal || deal.currentPrice === null) return true;
  return deal.lastUpdated.getTime() < staleCutoff;
}
