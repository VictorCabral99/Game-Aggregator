export {
  RAWGAPI,
  normalizeGameTitle,
  titleMatchScore,
  pickBestRawgMatch,
} from './rawg';
export type { RAWGGame, RAWGSearchResponse } from './rawg';
export { SteamAPI } from './steam';
export type { SteamReviewScore, SteamWishlistGame } from './steam';
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
