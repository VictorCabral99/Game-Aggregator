import type { Game, RatingsSummary } from '../../../shared/api';

/** Mínimo de reviews Steam para entrar nas faixas de nota (senão → grupo amostra pequena). */
export const MIN_REVIEWS_FOR_RANK = 100;

export type RatingBandId =
  | 'excellent'
  | 'great'
  | 'good'
  | 'ok'
  | 'low'
  | 'unrated'
  | 'low_sample';

export interface RatingBandMeta {
  id: RatingBandId;
  label: string;
  /** Faixas ≥90 começam abertas por padrão. */
  defaultOpen: boolean;
}

export const RATING_BAND_ORDER: RatingBandMeta[] = [
  { id: 'excellent', label: 'Excelente (95–100)', defaultOpen: true },
  { id: 'great', label: 'Muito bom (90–94)', defaultOpen: true },
  { id: 'good', label: 'Bom (80–89)', defaultOpen: false },
  { id: 'ok', label: 'Ok (70–79)', defaultOpen: false },
  { id: 'low', label: 'Baixo (<70)', defaultOpen: false },
  { id: 'unrated', label: 'Sem nota', defaultOpen: false },
  { id: 'low_sample', label: 'Poucas reviews (<100)', defaultOpen: false },
];

export interface RatingGroup {
  id: RatingBandId;
  label: string;
  defaultOpen: boolean;
  games: Game[];
}

export type GridRow =
  | { kind: 'header'; groupId: RatingBandId; label: string; count: number; open: boolean }
  | { kind: 'game-row'; games: Game[]; startIndex: number };

export function steamReviewCount(summary: RatingsSummary | null | undefined): number {
  const row = summary?.sources.find((s) => s.source === 'steam');
  return row?.reviewCount != null && row.reviewCount > 0 ? row.reviewCount : 0;
}

export function steamScore(summary: RatingsSummary | null | undefined): number {
  const row = summary?.sources.find((s) => s.source === 'steam');
  if (row?.score != null && row.score > 0) return row.score;
  if (summary?.source === 'steam' && summary.score != null && summary.score > 0) {
    return summary.score;
  }
  return summary?.score != null && summary.score > 0 ? summary.score : 0;
}

/** Faixa por nota (ignora amostra pequena — isso é decidido em buildRatingGroups). */
export function ratingBandForScore(score: number): Exclude<RatingBandId, 'low_sample'> {
  if (score <= 0) return 'unrated';
  if (score >= 95) return 'excellent';
  if (score >= 90) return 'great';
  if (score >= 80) return 'good';
  if (score >= 70) return 'ok';
  return 'low';
}

function sortByScoreThenReviews(
  games: Game[],
  ratings: Record<string, RatingsSummary | null>
): Game[] {
  return [...games].sort((a, b) => {
    const sa = steamScore(ratings[a.id]);
    const sb = steamScore(ratings[b.id]);
    if (sb !== sa) return sb - sa;
    const ra = steamReviewCount(ratings[a.id]);
    const rb = steamReviewCount(ratings[b.id]);
    if (rb !== ra) return rb - ra;
    return a.title.localeCompare(b.title);
  });
}

/**
 * Agrupa jogos para sort por nota/Steam %.
 * Jogos com nota > 0 e reviewCount < MIN_REVIEWS_FOR_RANK → low_sample (final).
 */
export function buildRatingGroups(
  games: Game[],
  ratings: Record<string, RatingsSummary | null>
): RatingGroup[] {
  const buckets = new Map<RatingBandId, Game[]>();
  for (const meta of RATING_BAND_ORDER) buckets.set(meta.id, []);

  for (const game of games) {
    const summary = ratings[game.id];
    const score = steamScore(summary);
    const reviews = steamReviewCount(summary);
    let band: RatingBandId;
    if (score > 0 && reviews < MIN_REVIEWS_FOR_RANK) {
      band = 'low_sample';
    } else {
      band = ratingBandForScore(score);
    }
    buckets.get(band)!.push(game);
  }

  const groups: RatingGroup[] = [];
  for (const meta of RATING_BAND_ORDER) {
    const list = sortByScoreThenReviews(buckets.get(meta.id) ?? [], ratings);
    if (list.length === 0) continue;
    groups.push({
      id: meta.id,
      label: meta.label,
      defaultOpen: meta.defaultOpen,
      games: list,
    });
  }
  return groups;
}

export function defaultCollapsedState(groups: RatingGroup[]): Record<string, boolean> {
  const state: Record<string, boolean> = {};
  for (const g of groups) {
    state[g.id] = g.defaultOpen;
  }
  return state;
}

/** Jogos visíveis na ordem das faixas abertas (índice = selected / gamepad). */
export function flattenOpenGroupGames(
  groups: RatingGroup[],
  open: Record<string, boolean>
): Game[] {
  const out: Game[] = [];
  for (const g of groups) {
    if (open[g.id] === false) continue;
    out.push(...g.games);
  }
  return out;
}

/** Linhas virtuais: headers + linhas de cards (cols por linha). */
export function buildGridRows(
  groups: RatingGroup[],
  open: Record<string, boolean>,
  cols: number
): GridRow[] {
  const safeCols = Math.max(1, cols);
  const rows: GridRow[] = [];
  let gameIndex = 0;

  for (const g of groups) {
    const isOpen = open[g.id] !== false;
    rows.push({
      kind: 'header',
      groupId: g.id,
      label: g.label,
      count: g.games.length,
      open: isOpen,
    });
    if (!isOpen) continue;

    for (let i = 0; i < g.games.length; i += safeCols) {
      const chunk = g.games.slice(i, i + safeCols);
      rows.push({
        kind: 'game-row',
        games: chunk,
        startIndex: gameIndex,
      });
      gameIndex += chunk.length;
    }
  }
  return rows;
}
