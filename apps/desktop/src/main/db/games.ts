import { randomUUID } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';

export type GamePlatform = 'local' | 'steam' | 'epic' | 'gog' | 'amazon' | 'emulator' | 'manual';

export interface Game {
  id: string;
  title: string;
  executable: string | null;
  cwd: string | null;
  coverPath: string | null;
  coverUrl: string | null;
  notes: string | null;
  platform: GamePlatform;
  externalId: string | null;
  createdAt: string;
  updatedAt: string;
  lastPlayedAt: string | null;
}

export interface CreateGameInput {
  title: string;
  executable?: string;
  cwd?: string;
  coverPath?: string;
  coverUrl?: string;
  notes?: string;
  platform?: GamePlatform;
  externalId?: string;
}

export type UpdateGameInput = Partial<CreateGameInput>;

export interface ProviderGameRow {
  externalId: string;
  title: string;
  sizeBytes?: number;
  coverUrl?: string;
}

function mapRow(row: Record<string, unknown>): Game {
  return {
    id: String(row.id),
    title: String(row.title),
    executable: row.executable == null ? null : String(row.executable),
    cwd: row.cwd == null ? null : String(row.cwd),
    coverPath: row.cover_path == null ? null : String(row.cover_path),
    coverUrl: row.cover_url == null ? null : String(row.cover_url),
    notes: row.notes == null ? null : String(row.notes),
    platform: (row.platform as GamePlatform) ?? 'local',
    externalId: row.external_id == null ? null : String(row.external_id),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
    lastPlayedAt: row.last_played_at == null ? null : String(row.last_played_at),
  };
}

export class LibraryRepository {
  private readonly db: DatabaseSync;

  constructor(db: DatabaseSync) {
    this.db = db;
  }

  list(): Game[] {
    const rows = this.db
      .prepare(
        `SELECT * FROM games
         ORDER BY CASE platform WHEN 'local' THEN 0 WHEN 'steam' THEN 1 ELSE 2 END,
                  title COLLATE NOCASE ASC`
      )
      .all() as Record<string, unknown>[];
    return rows.map(mapRow);
  }

  listByPlatform(platform: GamePlatform): Game[] {
    const rows = this.db
      .prepare(`SELECT * FROM games WHERE platform = ? ORDER BY title COLLATE NOCASE ASC`)
      .all(platform) as Record<string, unknown>[];
    return rows.map(mapRow);
  }

  get(id: string): Game | null {
    const row = this.db.prepare(`SELECT * FROM games WHERE id = ?`).get(id) as
      | Record<string, unknown>
      | undefined;
    return row ? mapRow(row) : null;
  }

  getByExternal(platform: GamePlatform, externalId: string): Game | null {
    const row = this.db
      .prepare(`SELECT * FROM games WHERE platform = ? AND external_id = ?`)
      .get(platform, externalId) as Record<string, unknown> | undefined;
    return row ? mapRow(row) : null;
  }

  add(input: CreateGameInput): Game {
    const id = randomUUID();
    const now = new Date().toISOString();
    const platform = input.platform ?? 'local';
    this.db
      .prepare(
        `INSERT INTO games (id, title, executable, cwd, cover_path, cover_url, notes, platform, external_id, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        id,
        input.title.trim(),
        input.executable?.trim() || null,
        input.cwd?.trim() || null,
        input.coverPath?.trim() || null,
        input.coverUrl?.trim() || null,
        input.notes?.trim() || null,
        platform,
        input.externalId?.trim() || null,
        now,
        now
      );
    const game = this.get(id);
    if (!game) throw new Error('Falha ao criar jogo');
    return game;
  }

  /** Upsert em lote para providers (Steam/Epic/…). Preserva rows locais. */
  upsertMany(platform: GamePlatform, items: ProviderGameRow[]): { inserted: number } {
    const now = new Date().toISOString();
    const stmt = this.db.prepare(
      `INSERT INTO games (id, title, executable, cwd, cover_path, cover_url, notes, platform, external_id, created_at, updated_at)
       VALUES (?, ?, NULL, NULL, NULL, ?, NULL, ?, ?, ?, ?)
       ON CONFLICT (platform, external_id) WHERE external_id IS NOT NULL DO NOTHING`
    );
    let inserted = 0;
    for (const item of items) {
      const info = stmt.run(randomUUID(), item.title.trim(), item.coverUrl ?? null, platform, item.externalId, now, now);
      inserted += Number(info.changes);
    }
    return { inserted };
  }

  update(id: string, patch: UpdateGameInput): Game | null {
    const current = this.get(id);
    if (!current) return null;

    const next = {
      title: patch.title?.trim() ?? current.title,
      executable: patch.executable !== undefined ? patch.executable.trim() || null : current.executable,
      cwd: patch.cwd !== undefined ? patch.cwd.trim() || null : current.cwd,
      coverPath: patch.coverPath !== undefined ? patch.coverPath.trim() || null : current.coverPath,
      coverUrl: patch.coverUrl !== undefined ? patch.coverUrl.trim() || null : current.coverUrl,
      notes: patch.notes !== undefined ? patch.notes.trim() || null : current.notes,
    };

    this.db
      .prepare(
        `UPDATE games SET title = ?, executable = ?, cwd = ?, cover_path = ?, cover_url = ?, notes = ?,
         updated_at = ? WHERE id = ?`
      )
      .run(
        next.title,
        next.executable,
        next.cwd,
        next.coverPath,
        next.coverUrl,
        next.notes,
        new Date().toISOString(),
        id
      );
    return this.get(id);
  }

  remove(id: string): void {
    this.db.prepare(`DELETE FROM games WHERE id = ?`).run(id);
  }

  touchPlayed(id: string): void {
    this.db
      .prepare(`UPDATE games SET last_played_at = ? WHERE id = ?`)
      .run(new Date().toISOString(), id);
  }

  countByPlatform(platform: GamePlatform): number {
    const row = this.db.prepare(`SELECT COUNT(*) AS n FROM games WHERE platform = ?`).get(platform) as {
      n: number;
    };
    return row.n;
  }
}
