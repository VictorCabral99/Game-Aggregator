import { describe, expect, it } from 'vitest';
import type { Game, RatingsSummary } from '../../../shared/api';
import {
  MIN_REVIEWS_FOR_RANK,
  buildGridRows,
  buildRatingGroups,
  defaultCollapsedState,
  flattenOpenGroupGames,
  ratingBandForScore,
  steamReviewCount,
  steamScore,
} from './rating-groups';

function game(id: string, title: string): Game {
  return {
    id,
    slug: id,
    title,
    normalizedTitle: title.toLowerCase(),
    coverPath: null,
    coverUrl: null,
    notes: null,
    summary: null,
    genres: [],
    launchArgs: null,
    isRemote: false,
    steamAppId: null,
    createdAt: '',
    updatedAt: '',
    preferredSource: null,
    sources: [],
  };
}

function steamSummary(score: number, reviewCount: number): RatingsSummary {
  return {
    score,
    source: 'steam',
    updatedAt: '2026-01-01',
    sources: [{ source: 'steam', score, reviewCount, lastUpdated: '2026-01-01' }],
  };
}

describe('rating-groups', () => {
  it('ratingBandForScore classifica faixas', () => {
    expect(ratingBandForScore(0)).toBe('unrated');
    expect(ratingBandForScore(96)).toBe('excellent');
    expect(ratingBandForScore(92)).toBe('great');
    expect(ratingBandForScore(85)).toBe('good');
    expect(ratingBandForScore(72)).toBe('ok');
    expect(ratingBandForScore(40)).toBe('low');
  });

  it('steamScore / steamReviewCount leem a fonte Steam', () => {
    const s = steamSummary(91, 500);
    expect(steamScore(s)).toBe(91);
    expect(steamReviewCount(s)).toBe(500);
    expect(steamReviewCount(null)).toBe(0);
  });

  it('buildRatingGroups manda amostra pequena para low_sample', () => {
    const games = [
      game('a', 'Indie 100%'),
      game('b', 'AAA 92%'),
      game('c', 'Sem nota'),
    ];
    const ratings: Record<string, RatingsSummary | null> = {
      a: steamSummary(100, 12),
      b: steamSummary(92, 50_000),
      c: null,
    };
    const groups = buildRatingGroups(games, ratings);
    const byId = Object.fromEntries(groups.map((g) => [g.id, g.games.map((x) => x.id)]));

    expect(byId.great).toEqual(['b']);
    expect(byId.low_sample).toEqual(['a']);
    expect(byId.unrated).toEqual(['c']);
    expect(byId.excellent).toBeUndefined();
  });

  it(`threshold de reviews é ${MIN_REVIEWS_FOR_RANK}`, () => {
    const games = [game('edge', 'Edge')];
    const under = buildRatingGroups(games, {
      edge: steamSummary(99, MIN_REVIEWS_FOR_RANK - 1),
    });
    expect(under.map((g) => g.id)).toEqual(['low_sample']);

    const ok = buildRatingGroups(games, {
      edge: steamSummary(99, MIN_REVIEWS_FOR_RANK),
    });
    expect(ok.map((g) => g.id)).toEqual(['excellent']);
  });

  it('dentro da faixa ordena por nota depois reviews', () => {
    const games = [game('x', 'X'), game('y', 'Y'), game('z', 'Z')];
    const ratings = {
      x: steamSummary(90, 200),
      y: steamSummary(94, 150),
      z: steamSummary(94, 900),
    };
    const groups = buildRatingGroups(games, ratings);
    expect(groups[0].id).toBe('great');
    expect(groups[0].games.map((g) => g.id)).toEqual(['z', 'y', 'x']);
  });

  it('defaultCollapsedState abre ≥90 e fecha o resto', () => {
    const groups = buildRatingGroups(
      [game('a', 'A'), game('b', 'B'), game('c', 'C')],
      {
        a: steamSummary(96, 200),
        b: steamSummary(85, 200),
        c: steamSummary(100, 5),
      }
    );
    const open = defaultCollapsedState(groups);
    expect(open.excellent).toBe(true);
    expect(open.good).toBe(false);
    expect(open.low_sample).toBe(false);
  });

  it('flattenOpenGroupGames e buildGridRows respeitam collapse e cols', () => {
    const groups = buildRatingGroups(
      [game('a', 'A'), game('b', 'B'), game('c', 'C')],
      {
        a: steamSummary(96, 200),
        b: steamSummary(91, 200),
        c: steamSummary(85, 200),
      }
    );
    const open = { excellent: true, great: false, good: true };
    const flat = flattenOpenGroupGames(groups, open);
    expect(flat.map((g) => g.id)).toEqual(['a', 'c']);

    const rows = buildGridRows(groups, open, 2);
    expect(rows.filter((r) => r.kind === 'header').map((r) => r.kind === 'header' && r.groupId)).toEqual([
      'excellent',
      'great',
      'good',
    ]);
    const gameRows = rows.filter((r) => r.kind === 'game-row');
    expect(gameRows).toHaveLength(2); // a alone in excellent; c in good
    expect(gameRows[0].kind === 'game-row' && gameRows[0].startIndex).toBe(0);
    expect(gameRows[1].kind === 'game-row' && gameRows[1].startIndex).toBe(1);
  });
});
