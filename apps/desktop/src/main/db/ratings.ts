import type { DatabaseSync } from 'node:sqlite';
import type { GameRating, RatingsSummary, RatingSource } from '../../shared/api';

interface RatingRow {
  game_id: string;
  source: string;
  rating: number | null;
  review_count: number | null;
  url: string | null;
  matched_name: string | null;
  last_updated: string | null;
}

function mapRating(row: RatingRow): GameRating {
  const source = row.source as RatingSource;
  return {
    gameId: row.game_id,
    source,
    rating: row.rating,
    reviewCount: row.review_count,
    url: row.url,
    matchedName: row.matched_name,
    lastUpdated: row.last_updated,
  };
}

export class RatingsRepository {
  private readonly db: DatabaseSync;

  constructor(db: DatabaseSync) {
    this.db = db;
  }

  listForGame(gameId: string): GameRating[] {
    const rows = this.db
      .prepare(`SELECT * FROM ratings WHERE game_id = ?`)
      .all(gameId) as unknown as RatingRow[];
    return rows.map(mapRating);
  }

  listAll(): GameRating[] {
    const rows = this.db.prepare(`SELECT * FROM ratings`).all() as unknown as RatingRow[];
    return rows.map(mapRating);
  }

  listForGames(gameIds: string[]): Record<string, GameRating[]> {
    if (gameIds.length === 0) return {};
    const placeholders = gameIds.map(() => '?').join(',');
    const rows = this.db
      .prepare(`SELECT * FROM ratings WHERE game_id IN (${placeholders})`)
      .all(...gameIds) as unknown as RatingRow[];
    const byGame: Record<string, GameRating[]> = {};
    for (const row of rows) {
      (byGame[row.game_id] ??= []).push(mapRating(row));
    }
    return byGame;
  }

  /** Mapa gameId → summary composto — 1 SELECT em ratings (sem N+1). */
  summariesForAll(): Record<string, RatingsSummary | null> {
    const rows = this.db
      .prepare(`SELECT * FROM ratings`)
      .all() as unknown as RatingRow[];
    const byGame = new Map<string, GameRating[]>();
    for (const row of rows) {
      const list = byGame.get(row.game_id) ?? [];
      list.push(mapRating(row));
      byGame.set(row.game_id, list);
    }
    const result: Record<string, RatingsSummary | null> = {};
    for (const [gameId, ratings] of byGame) {
      result[gameId] = this.summaryFromRatings(ratings);
    }
    return result;
  }

  /** Nota "composta" para o jogo (prioridade steam % → rawg*20 → metacritic). */
  summaryForGame(gameId: string): RatingsSummary | null {
    return this.summaryFromRatings(this.listForGame(gameId));
  }

  private summaryFromRatings(ratings: GameRating[]): RatingsSummary | null {
    if (ratings.length === 0) return null;

    const display: RatingsSummary['sources'] = ratings.map((r) => ({
      source: r.source,
      score: r.rating,
      reviewCount: r.reviewCount,
      lastUpdated: r.lastUpdated,
    }));

    const valid: Array<{ source: RatingSource; score: number }> = [];
    for (const r of ratings) {
      if (r.rating === null) continue;
      const score =
        r.source === 'rawg' && r.rating <= 5 ? Math.round(r.rating * 20 * 10) / 10 : r.rating;
      valid.push({ source: r.source, score });
    }
    if (valid.length === 0) return { score: null, source: null, updatedAt: null, sources: display };

    const order: RatingSource[] = ['steam', 'rawg', 'metacritic'];
    const bySource = new Map(valid.map((v) => [v.source, v.score]));
    const picked = order.find((s) => bySource.has(s)) ?? valid[0].source;
    const main = bySource.get(picked)!;

    const updatedAt =
      ratings
        .map((r) => r.lastUpdated)
        .filter((d): d is string => !!d)
        .sort((a, b) => b.localeCompare(a))[0] ?? null;

    return { score: main, source: picked, updatedAt, sources: display };
  }

  upsert(input: {
    gameId: string;
    source: string;
    rating: number | null;
    reviewCount: number | null;
    url?: string | null;
    matchedName?: string | null;
  }): void {
    this.db
      .prepare(
        `INSERT INTO ratings (game_id, source, rating, review_count, url, matched_name, last_updated)
         VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
         ON CONFLICT (game_id, source) DO UPDATE SET
           rating = excluded.rating,
           review_count = excluded.review_count,
           url = excluded.url,
           matched_name = excluded.matched_name,
           last_updated = excluded.last_updated`
      )
      .run(
        input.gameId,
        input.source,
        input.rating ?? null,
        input.reviewCount ?? null,
        input.url ?? null,
        input.matchedName ?? null
      );
  }

  /** True se alguma fonte do jogo já foi tentada há menos de `freshMs`. */
  isFresh(gameId: string, freshMs = 7 * 24 * 3600 * 1000): boolean {
    const row = this.db
      .prepare(
        `SELECT MAX(strftime('%s', last_updated)) AS last
         FROM ratings WHERE game_id = ?`
      )
      .get(gameId) as { last: string | number | null };
    if (!row.last) return false;
    const lastSec = Number(row.last);
    return Date.now() - lastSec * 1000 < freshMs;
  }

  staleCount(): number {
    const row = this.db
      .prepare(
        `SELECT COUNT(DISTINCT game_id) AS n FROM ratings
         WHERE julianday(last_updated) < julianday('now', '-7 days')`
      )
      .get() as { n: number };
    return row.n;
  }

  /** Jogos com nota e sem registro de "jogado" (para a shelf de rediscovery). */
  gamesWithScoreNotPlayed(limit = 12): Array<{ gameId: string; score: number; source: RatingSource }> {
    const rows = this.db
      .prepare(
        `SELECT r.game_id, r.source, r.rating
         FROM ratings r
         WHERE r.rating IS NOT NULL AND r.rating > 0
           AND NOT EXISTS (
             SELECT 1 FROM game_sources ps
             WHERE ps.game_id = r.game_id AND ps.last_played_at IS NOT NULL
           )`
      )
      .all() as Array<{ game_id: string; source: RatingSource; rating: number }>;

    const byGame = new Map<string, Map<RatingSource, number>>();
    for (const row of rows) {
      if (!byGame.has(row.game_id)) byGame.set(row.game_id, new Map());
      byGame.get(row.game_id)!.set(row.source, row.rating);
    }

    const out: Array<{ gameId: string; score: number; source: RatingSource }> = [];
    const order: RatingSource[] = ['steam', 'rawg', 'metacritic'];
    for (const [gameId, sources] of byGame) {
      let picked: RatingSource | null = null;
      let score = 0;
      for (const source of order) {
        const raw = sources.get(source);
        if (raw === undefined) continue;
        const scaled = source === 'rawg' && raw <= 5 ? Math.round(raw * 20 * 10) / 10 : raw;
        if (scaled > score) {
          score = scaled;
          picked = source;
        }
      }
      if (picked) out.push({ gameId, score, source: picked });
    }

    return out.sort((a, b) => b.score - a.score).slice(0, limit);
  }
}
