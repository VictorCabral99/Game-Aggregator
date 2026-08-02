import { randomUUID } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';

export interface Game {
  id: string;
  title: string;
  executable: string;
  cwd: string | null;
  coverPath: string | null;
  coverUrl: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  lastPlayedAt: string | null;
}

export interface CreateGameInput {
  title: string;
  executable: string;
  cwd?: string;
  coverPath?: string;
  coverUrl?: string;
  notes?: string;
}

export type UpdateGameInput = Partial<CreateGameInput>;

function mapRow(row: Record<string, unknown>): Game {
  return {
    id: String(row.id),
    title: String(row.title),
    executable: String(row.executable),
    cwd: row.cwd == null ? null : String(row.cwd),
    coverPath: row.cover_path == null ? null : String(row.cover_path),
    coverUrl: row.cover_url == null ? null : String(row.cover_url),
    notes: row.notes == null ? null : String(row.notes),
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
      .prepare(`SELECT * FROM games ORDER BY title COLLATE NOCASE ASC`)
      .all() as Record<string, unknown>[];
    return rows.map(mapRow);
  }

  get(id: string): Game | null {
    const row = this.db.prepare(`SELECT * FROM games WHERE id = ?`).get(id) as
      | Record<string, unknown>
      | undefined;
    return row ? mapRow(row) : null;
  }

  add(input: CreateGameInput): Game {
    const id = randomUUID();
    const now = new Date().toISOString();
    this.db
      .prepare(
        `INSERT INTO games (id, title, executable, cwd, cover_path, cover_url, notes, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        id,
        input.title.trim(),
        input.executable.trim(),
        input.cwd?.trim() || null,
        input.coverPath?.trim() || null,
        input.coverUrl?.trim() || null,
        input.notes?.trim() || null,
        now,
        now
      );
    const game = this.get(id);
    if (!game) throw new Error('Falha ao criar jogo');
    return game;
  }

  update(id: string, patch: UpdateGameInput): Game | null {
    const current = this.get(id);
    if (!current) return null;

    const next = {
      title: patch.title?.trim() ?? current.title,
      executable: patch.executable?.trim() ?? current.executable,
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
}
