export interface AggregatedRating {
  source: string;
  rating: number | null;
  reviewCount: number | null;
  url: string | null;
}

export class RatingAggregator {
  static calculateAverage(ratings: AggregatedRating[]): number {
    const validRatings = ratings.filter((r) => r.rating !== null && r.rating > 0);
    if (validRatings.length === 0) return 0;

    const sum = validRatings.reduce((acc, r) => acc + (r.rating || 0), 0);
    return Math.round((sum / validRatings.length) * 10) / 10;
  }

  static calculateWeighted(ratings: AggregatedRating[]): number {
    const validRatings = ratings.filter((r) => r.rating !== null && r.rating > 0);
    if (validRatings.length === 0) return 0;

    // Metacritic 0-100 scale; RAWG typically 0-5 — normalize RAWG to 0-100
    const weights: Record<string, number> = {
      metacritic: 0.6,
      rawg: 0.4,
    };

    let weightedSum = 0;
    let totalWeight = 0;

    validRatings.forEach((r) => {
      const weight = weights[r.source] || 0.25;
      let value = r.rating || 0;
      if (r.source === 'rawg' && value <= 5) {
        value = value * 20;
      }
      weightedSum += value * weight;
      totalWeight += weight;
    });

    if (totalWeight === 0) return 0;
    return Math.round((weightedSum / totalWeight) * 10) / 10;
  }

  static aggregate(
    metacritic: number | null,
    rawg: number | null,
    steam: number | null = null
  ): AggregatedRating[] {
    // Keep null rows so callers can stamp lastUpdated after an attempt
    // (avoids re-fetching the same title every click when a source is missing).
    return [
      {
        source: 'metacritic',
        rating: metacritic,
        reviewCount: null,
        url: null,
      },
      {
        source: 'rawg',
        rating: rawg,
        reviewCount: null,
        url: null,
      },
      {
        source: 'steam',
        rating: steam,
        reviewCount: null,
        url: null,
      },
    ];
  }

  /** Normalize display score to ~0-100 for UI */
  static toDisplayScore(source: string, rating: number | null): number | null {
    if (rating === null) return null;
    if (source === 'rawg' && rating <= 5) {
      return Math.round(rating * 20 * 10) / 10;
    }
    return rating;
  }
}
