export {
  RAWGAPI,
  normalizeGameTitle,
  titleMatchScore,
  pickBestRawgMatch,
} from './rawg';
export type { RAWGGame, RAWGSearchResponse } from './rawg';
export { SteamAPI, steamSearchTerms } from './steam';
export type { SteamReviewScore, SteamWishlistGame, SteamFindAppResult } from './steam';
export { RatingAggregator } from './aggregation';
export type { AggregatedRating } from './aggregation';
export { ITADAPI } from './itad';
export type {
  ITADGame,
  ITADPriceAmount,
  ITADShop,
  ITADCurrentDeal,
  ITADLowestPrice,
  ITADPriceOverview,
  ITADOverviewResponse,
  ITADDealInfo,
} from './itad';
