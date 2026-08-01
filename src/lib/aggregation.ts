export interface AggregatedRating {
  source: string;
  rating: number | null;
  reviewCount: number | null;
  url: string | null;
}

export interface AggregatedGame {
  id: string;
  name: string;
  platforms: string[];
  ratings: AggregatedRating[];
  averageRating: number;
  weightedRating: number;
}

export class RatingAggregator {
  static calculateAverage(ratings: AggregatedRating[]): number {
    const validRatings = ratings.filter(r => r.rating !== null && r.rating > 0);
    if (validRatings.length === 0) return 0;
    
    const sum = validRatings.reduce((acc, r) => acc + (r.rating || 0), 0);
    return Math.round((sum / validRatings.length) * 10) / 10;
  }

  static calculateWeighted(ratings: AggregatedRating[]): number {
    const validRatings = ratings.filter(r => r.rating !== null && r.rating > 0);
    if (validRatings.length === 0) return 0;

    // Pesos: Metacritic (40%), RAWG (30%), GG.deals (30%)
    const weights: Record<string, number> = {
      metacritic: 0.4,
      rawg: 0.3,
      ggdeals: 0.3,
    };

    let weightedSum = 0;
    let totalWeight = 0;

    validRatings.forEach(r => {
      const weight = weights[r.source] || 0.25; // Padrão se não especificado
      weightedSum += (r.rating || 0) * weight;
      totalWeight += weight;
    });

    if (totalWeight === 0) return 0;
    return Math.round((weightedSum / totalWeight) * 10) / 10;
  }

  static aggregate(
    metacritic: number | null,
    rawg: number | null,
    ggdeals: number | null
  ): AggregatedRating[] {
    const ratings: AggregatedRating[] = [
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
        source: 'ggdeals',
        rating: ggdeals,
        reviewCount: null,
        url: null,
      },
    ];

    return ratings.filter(r => r.rating !== null);
  }
}
