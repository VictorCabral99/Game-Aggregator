/** Minimum Steam reviews to stay in a score band (else "Poucas reviews"). */
export const MIN_REVIEWS_FOR_BAND = 100;

export type RatingBandId =
  | '95-100'
  | '90-94'
  | '80-89'
  | '70-79'
  | '50-69'
  | 'below-50'
  | 'unrated'
  | 'few-reviews';

export const RATING_BAND_ORDER: RatingBandId[] = [
  '95-100',
  '90-94',
  '80-89',
  '70-79',
  '50-69',
  'below-50',
  'unrated',
  'few-reviews',
];

export const RATING_BAND_LABELS: Record<RatingBandId, string> = {
  '95-100': '95–100%',
  '90-94': '90–94%',
  '80-89': '80–89%',
  '70-79': '70–79%',
  '50-69': '50–69%',
  'below-50': '<50%',
  unrated: 'Sem nota',
  'few-reviews': 'Poucas reviews',
};

/** Bands collapsed by default in the library UI. */
export const DEFAULT_COLLAPSED_BANDS: RatingBandId[] = ['unrated', 'few-reviews'];

export interface BandGameInput {
  id: string;
  title: string;
  steamRating: number | null;
  reviewCount: number | null;
}

export interface RatingBandGroup<T extends BandGameInput = BandGameInput> {
  id: RatingBandId;
  label: string;
  games: T[];
}

function scoreBandId(rating: number): Exclude<RatingBandId, 'unrated' | 'few-reviews'> {
  if (rating >= 95) return '95-100';
  if (rating >= 90) return '90-94';
  if (rating >= 80) return '80-89';
  if (rating >= 70) return '70-79';
  if (rating >= 50) return '50-69';
  return 'below-50';
}

/**
 * Assign a game to a band.
 * Known reviewCount < MIN_REVIEWS_FOR_BAND with a useful score → few-reviews.
 * reviewCount null (legacy) stays in the score band.
 */
export function ratingBandId(
  rating: number | null,
  reviewCount: number | null
): RatingBandId {
  if (rating === null || Number.isNaN(rating) || rating <= 0) {
    return 'unrated';
  }
  if (reviewCount !== null && reviewCount < MIN_REVIEWS_FOR_BAND) {
    return 'few-reviews';
  }
  return scoreBandId(rating);
}

export function groupByRatingBands<T extends BandGameInput>(
  games: T[],
  dir: 1 | -1 = -1
): RatingBandGroup<T>[] {
  const buckets = new Map<RatingBandId, T[]>();
  for (const id of RATING_BAND_ORDER) {
    buckets.set(id, []);
  }

  for (const game of games) {
    const id = ratingBandId(game.steamRating, game.reviewCount);
    buckets.get(id)!.push(game);
  }

  const groups: RatingBandGroup<T>[] = [];
  for (const id of RATING_BAND_ORDER) {
    const list = buckets.get(id)!;
    if (list.length === 0) continue;

    list.sort((a, b) => {
      if (id === 'unrated') {
        return a.title.localeCompare(b.title, 'pt-BR');
      }
      const ar = a.steamRating ?? 0;
      const br = b.steamRating ?? 0;
      if (ar !== br) return (ar - br) * dir;
      return a.title.localeCompare(b.title, 'pt-BR');
    });

    groups.push({
      id,
      label: RATING_BAND_LABELS[id],
      games: list,
    });
  }

  return groups;
}
