import { randomUUID } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import { normalizeTitle } from '@gagg/core';

export type GamePlatform = 'local' | 'steam' | 'epic' | 'gog' | 'amazon' | 'emulator' | 'manual';

export interface GameSource {
  id: string;
  gameId: string;
  platform: GamePlatform;
  externalId: string | null;
  title: string;
  installPath: string | null;
  executable: string | null;
  cwd: string | null;
  isInstalled: boolean;
  sizeBytes: number | null;
  rawJson: string | null;
  lastPlayedAt: string | null;
  scannedAt: string;
  createdAt: string;
  updatedAt: string;
  /** Console retro ao qual o ROM pertence (Fase 4). Null para jogos não-retro. */
  consoleId: string | null;
}

export interface Game {
  id: string;
  slug: string;
  title: string;
  normalizedTitle: string;
  coverPath: string | null;
  coverUrl: string | null;
  notes: string | null;
  summary: string | null;
  genres: string[];
  createdAt: string;
  updatedAt: string;
  /** Última fonte jogada; senão primeira instalada. Define launch padrão. */
  preferredSource: GameSource | null;
  sources: GameSource[];
}

export interface CreateGameInput {
  title: string;
  executable?: string;
  cwd?: string;
  coverPath?: string;
  coverUrl?: string;
  notes?: string;
  summary?: string;
  genres?: string[];
  platform?: GamePlatform;
  externalId?: string;
}

export type UpdateGameInput = Partial<CreateGameInput>;

export interface ProviderGameRow {
  externalId: string;
  title: string;
  sizeBytes?: number;
  coverUrl?: string;
  installPath?: string;
  isInstalled?: boolean;
}

interface SourceRow {
  id: string;
  game_id: string;
  platform: string;
  external_id: string | null;
  title: string;
  install_path: string | null;
  executable: string | null;
  cwd: string | null;
  is_installed: number;
  size_bytes: number | null;
  raw_json: string | null;
  last_played_at: string | null;
  scanned_at: string;
  created_at: string;
  updated_at: string;
  console_id: string | null;
}

interface CanonicalRow {
  id: string;
  slug: string;
  title: string;
  normalized_title: string;
  cover_path: string | null;
  cover_url: string | null;
  notes: string | null;
  summary: string | null;
  genres_json: string | null;
  created_at: string;
  updated_at: string;
}

function mapSource(row: SourceRow): GameSource {
  return {
    id: row.id,
    gameId: row.game_id,
    platform: (row.platform as GamePlatform) ?? 'local',
    externalId: row.external_id,
    title: row.title,
    installPath: row.install_path,
    executable: row.executable,
    cwd: row.cwd,
    isInstalled: row.is_installed === 1,
    sizeBytes: row.size_bytes,
    rawJson: row.raw_json,
    lastPlayedAt: row.last_played_at,
    scannedAt: row.scanned_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    consoleId: row.console_id ?? null,
  };
}

function pickPreferred(sources: GameSource[]): GameSource | null {
  if (sources.length === 0) return null;
  const lastPlayed = sources
    .filter((s) => s.lastPlayedAt)
    .sort((a, b) => (b.lastPlayedAt as string).localeCompare(a.lastPlayedAt as string));
  if (lastPlayed.length > 0) return lastPlayed[0];
  const installed = sources.find((s) => s.isInstalled);
  return installed ?? sources[0];
}

export class LibraryRepository {
  private readonly db: DatabaseSync;

  constructor(db: DatabaseSync) {
    this.db = db;
  }

  private sourcesFor(gameId: string): GameSource[] {
    const rows = this.db
      .prepare(`SELECT * FROM game_sources WHERE game_id = ? ORDER BY platform ASC`)
      .all(gameId) as unknown as SourceRow[];
    return rows.map(mapSource);
  }

  private mapGame(row: CanonicalRow): Game {
    const sources = this.sourcesFor(row.id);
    let genres: string[] = [];
    try {
      genres = row.genres_json ? (JSON.parse(row.genres_json) as string[]) : [];
    } catch {
      genres = [];
    }
    return {
      id: row.id,
      slug: row.slug,
      title: row.title,
      normalizedTitle: row.normalized_title,
      coverPath: row.cover_path,
      coverUrl: row.cover_url,
      notes: row.notes,
      summary: row.summary,
      genres,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      preferredSource: pickPreferred(sources),
      sources,
    };
  }

  list(): Game[] {
    const rows = this.db
      .prepare(`SELECT * FROM canonical_games ORDER BY title COLLATE NOCASE ASC`)
      .all() as unknown as CanonicalRow[];
    return rows.map((r) => this.mapGame(r));
  }

  listByPlatform(platform: GamePlatform): Game[] {
    const rows = this.db
      .prepare(
        `SELECT c.* FROM canonical_games c
         JOIN game_sources s ON s.game_id = c.id
         WHERE s.platform = ?
         GROUP BY c.id
         ORDER BY c.title COLLATE NOCASE ASC`
      )
      .all(platform) as unknown as CanonicalRow[];
    return rows.map((r) => this.mapGame(r));
  }

  listByConsole(consoleId: string): Game[] {
    const rows = this.db
      .prepare(
        `SELECT c.* FROM canonical_games c
         JOIN game_sources s ON s.game_id = c.id
         WHERE s.console_id = ?
         GROUP BY c.id
         ORDER BY c.title COLLATE NOCASE ASC`
      )
      .all(consoleId) as unknown as CanonicalRow[];
    return rows.map((r) => this.mapGame(r));
  }

  countByConsole(consoleId: string): number {
    const row = this.db
      .prepare(`SELECT COUNT(*) AS n FROM game_sources WHERE console_id = ?`)
      .get(consoleId) as { n: number };
    return row.n;
  }

  get(id: string): Game | null {
    const row = this.db.prepare(`SELECT * FROM canonical_games WHERE id = ?`).get(id) as
      | CanonicalRow
      | undefined;
    return row ? this.mapGame(row) : null;
  }

  getSource(sourceId: string): GameSource | null {
    const row = this.db.prepare(`SELECT * FROM game_sources WHERE id = ?`).get(sourceId) as
      | SourceRow
      | undefined;
    return row ? mapSource(row) : null;
  }

  add(input: CreateGameInput): Game {
    const id = randomUUID();
    const now = new Date().toISOString();
    const platform = input.platform ?? 'local';
    const title = input.title.trim();

    this.db
      .prepare(
        `INSERT INTO canonical_games (id, slug, title, normalized_title, cover_path, cover_url, notes, summary, genres_json, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        id,
        `c-${randomUUID().replace(/-/g, '')}`,
        title,
        normalizeTitle(title),
        input.coverPath?.trim() || null,
        input.coverUrl?.trim() || null,
        input.notes?.trim() || null,
        input.summary?.trim() || null,
        input.genres && input.genres.length > 0 ? JSON.stringify(input.genres) : null,
        now,
        now
      );

    this.db
      .prepare(
        `INSERT INTO game_sources (id, game_id, platform, external_id, title, install_path, executable, cwd, is_installed, size_bytes, raw_json, last_played_at, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, NULL, ?, ?, 1, NULL, NULL, NULL, ?, ?)`
      )
      .run(
        `s-${randomUUID().replace(/-/g, '')}`,
        id,
        platform,
        input.externalId?.trim() || null,
        title,
        input.executable?.trim() || null,
        input.cwd?.trim() || null,
        now,
        now
      );

    const game = this.get(id);
    if (!game) throw new Error('Falha ao criar jogo');
    return game;
  }

  /** Upsert em lote para providers (Steam/Epic/...). Auto-merge por título normalizado (P3-07). */
  upsertMany(platform: GamePlatform, items: ProviderGameRow[]): { inserted: number } {
    const now = new Date().toISOString();
    let inserted = 0;
    for (const item of items) {
      const externalId = item.externalId;
      const existing = externalId
        ? (this.db
            .prepare(`SELECT * FROM game_sources WHERE platform = ? AND external_id = ?`)
            .get(platform, externalId) as SourceRow | undefined)
        : undefined;

      if (existing) {
        this.db
          .prepare(
            `UPDATE game_sources SET title = ?, install_path = COALESCE(?, install_path),
             size_bytes = COALESCE(?, size_bytes), is_installed = ?, updated_at = ? WHERE id = ?`
          )
          .run(
            item.title.trim(),
            item.installPath ?? null,
            item.sizeBytes ?? null,
            item.isInstalled === false ? 0 : 1,
            now,
            existing.id
          );
        // Re-scan: propaga capa para o canonical se ele ainda não tiver uma.
        if (item.coverUrl) {
          this.db
            .prepare(
              `UPDATE canonical_games SET cover_url = COALESCE(cover_url, ?), updated_at = ?
               WHERE id = ? AND cover_path IS NULL`
            )
            .run(item.coverUrl, now, existing.game_id);
        }
        continue;
      }

      const title = item.title.trim();
      const normalized = normalizeTitle(title);
      // Auto-merge: se já existe canonical com o mesmo título normalizado,
      // adiciona a nova source nele em vez de criar duplicata.
      const existingCanonical = this.db
        .prepare(
          `SELECT c.* FROM canonical_games c
           WHERE c.normalized_title = ? AND c.id IN (SELECT game_id FROM game_sources)
           LIMIT 1`
        )
        .get(normalized) as CanonicalRow | undefined;

      const gameId = existingCanonical?.id ?? randomUUID();
      if (!existingCanonical) {
        this.db
          .prepare(
            `INSERT INTO canonical_games (id, slug, title, normalized_title, cover_path, cover_url, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
          )
          .run(
            gameId,
            `c-${randomUUID().replace(/-/g, '')}`,
            title,
            normalized,
            null,
            item.coverUrl ?? null,
            now,
            now
          );
      } else if (item.coverUrl && !existingCanonical.cover_path && !existingCanonical.cover_url) {
        this.db
          .prepare(`UPDATE canonical_games SET cover_url = ?, updated_at = ? WHERE id = ?`)
          .run(item.coverUrl, now, existingCanonical.id);
      }
      this.db
        .prepare(
          `INSERT INTO game_sources (id, game_id, platform, external_id, title, install_path, executable, cwd, is_installed, size_bytes, raw_json, last_played_at, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, NULL, NULL, ?, ?, NULL, NULL, ?, ?)`
        )
        .run(
          `s-${randomUUID().replace(/-/g, '')}`,
          gameId,
          platform,
          externalId ?? null,
          title,
          item.installPath ?? null,
          item.isInstalled === false ? 0 : 1,
          item.sizeBytes ?? null,
          now,
          now
        );
      inserted++;
    }
    return { inserted };
  }

  /**
   * ROM drop-in (P4-08): identifica um ROM válido pela extensão e o adiciona
   * ao console. Idempotente por (platform=emulator, console_id, install_path).
   * Retorna a Game criada ou null se o arquivo não é um ROM conhecido do console.
   */
  upsertRom(consoleId: string, romPath: string, title: string): Game | null {
    const existing = this.db
      .prepare(
        `SELECT * FROM game_sources WHERE platform = 'emulator' AND console_id = ? AND install_path = ?`
      )
      .get(consoleId, romPath) as SourceRow | undefined;
    const now = new Date().toISOString();
    const cleanTitle = title.trim();

    if (existing) {
      this.db
        .prepare(`UPDATE game_sources SET title = ?, updated_at = ? WHERE id = ?`)
        .run(cleanTitle, now, existing.id);
      return this.get(existing.game_id);
    }

    const gameId = randomUUID();
    this.db
      .prepare(
        `INSERT INTO canonical_games (id, slug, title, normalized_title, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)`
      )
      .run(
        gameId,
        `c-${randomUUID().replace(/-/g, '')}`,
        cleanTitle,
        normalizeTitle(cleanTitle),
        now,
        now
      );
    this.db
      .prepare(
        `INSERT INTO game_sources (id, game_id, platform, external_id, title, install_path, executable, cwd, is_installed, size_bytes, raw_json, last_played_at, scanned_at, created_at, updated_at, console_id)
         VALUES (?, ?, 'emulator', ?, ?, ?, NULL, NULL, 1, NULL, NULL, NULL, ?, ?, ?, ?)`
      )
      .run(
        `s-${randomUUID().replace(/-/g, '')}`,
        gameId,
        `rom:${consoleId}:${romPath}`,
        cleanTitle,
        romPath,
        now,
        now,
        now,
        consoleId
      );
    return this.get(gameId);
  }

  /** Remove um ROM do console (não apaga o arquivo). */
  removeRom(sourceId: string): void {
    const source = this.getSource(sourceId);
    if (!source || source.platform !== 'emulator') return;
    this.db.prepare(`DELETE FROM game_sources WHERE id = ?`).run(sourceId);
    this.pruneEmptyCanonicals();
  }

  update(id: string, patch: UpdateGameInput): Game | null {
    const current = this.get(id);
    if (!current) return null;
    const now = new Date().toISOString();

    const title = patch.title?.trim() ?? current.title;
    this.db
      .prepare(
        `UPDATE canonical_games SET title = ?, normalized_title = ?, cover_path = COALESCE(?, cover_path),
         cover_url = COALESCE(?, cover_url), notes = ?, summary = COALESCE(?, summary),
         genres_json = ?, updated_at = ? WHERE id = ?`
      )
      .run(
        title,
        normalizeTitle(title),
        patch.coverPath?.trim() || null,
        patch.coverUrl?.trim() || null,
        patch.notes?.trim() ?? current.notes,
        patch.summary?.trim() || null,
        patch.genres !== undefined
          ? JSON.stringify(patch.genres.filter((g) => g.trim()).map((g) => g.trim()))
          : current.genres.length > 0
            ? JSON.stringify(current.genres)
            : null,
        now,
        id
      );

    const local = current.sources.find((s) => s.platform === 'local');
    if (local && (patch.executable !== undefined || patch.cwd !== undefined)) {
      this.db
        .prepare(
          `UPDATE game_sources SET executable = ?, cwd = ?, updated_at = ? WHERE id = ?`
        )
        .run(
          patch.executable !== undefined ? patch.executable.trim() || null : local.executable,
          patch.cwd !== undefined ? patch.cwd.trim() || null : local.cwd,
          now,
          local.id
        );
    }

    return this.get(id);
  }

  remove(id: string): void {
    this.db.prepare(`DELETE FROM canonical_games WHERE id = ?`).run(id);
  }

  /** Grava o path local da capa baixada (P3-10/11). */
  setCoverPath(id: string, path: string): void {
    const now = new Date().toISOString();
    this.db
      .prepare(`UPDATE canonical_games SET cover_path = ?, updated_at = ? WHERE id = ?`)
      .run(path, now, id);
  }

  touchSourcePlayed(sourceId: string): void {
    const now = new Date().toISOString();
    this.db
      .prepare(`UPDATE game_sources SET last_played_at = ?, updated_at = ? WHERE id = ?`)
      .run(now, now, sourceId);
  }

  touchPlayed(gameId: string, sourceId?: string): void {
    const game = this.get(gameId);
    if (!game) return;
    const source = sourceId
      ? game.sources.find((s) => s.id === sourceId)
      : game.preferredSource;
    if (source) this.touchSourcePlayed(source.id);
  }

  countByPlatform(platform: GamePlatform): number {
    const row = this.db
      .prepare(`SELECT COUNT(*) AS n FROM game_sources WHERE platform = ?`)
      .get(platform) as { n: number };
    return row.n;
  }

  /** Apaga canonicals que ficaram sem nenhuma source (após merge/separar). */
  private pruneEmptyCanonicals(): void {
    this.db
      .prepare(
        `DELETE FROM canonical_games
         WHERE id NOT IN (SELECT DISTINCT game_id FROM game_sources)`
      )
      .run();
  }

  /**
   * Merge manual: move sources para um canonical alvo (P3-08/09).
   * Ex.: usuário aprova que "Dota 2" (Steam) e "DOTA 2" (Epic) são o mesmo jogo.
   */
  mergeSources(targetGameId: string, sourceIds: string[]): Game {
    const target = this.get(targetGameId);
    if (!target) throw new Error('Jogo alvo não encontrado');
    const now = new Date().toISOString();
    for (const sourceId of sourceIds) {
      const source = this.getSource(sourceId);
      if (!source || source.gameId === targetGameId) continue;
      this.db
        .prepare(`UPDATE game_sources SET game_id = ?, updated_at = ? WHERE id = ?`)
        .run(targetGameId, now, sourceId);
    }
    this.pruneEmptyCanonicals();
    return this.get(targetGameId) as Game;
  }

  /** Separa uma source em um canonical próprio (1:1) — ação "Separar" (P3-09). */
  separateSource(sourceId: string): Game {
    const source = this.getSource(sourceId);
    if (!source) throw new Error('Fonte não encontrada');
    const others = this.sourcesFor(source.gameId);
    if (others.length <= 1) return this.get(source.gameId) as Game;

    const now = new Date().toISOString();
    const gameId = randomUUID();
    this.db
      .prepare(
        `INSERT INTO canonical_games (id, slug, title, normalized_title, cover_path, cover_url, notes, created_at, updated_at)
         VALUES (?, ?, ?, ?, NULL, NULL, NULL, ?, ?)`
      )
      .run(
        gameId,
        `c-${randomUUID().replace(/-/g, '')}`,
        source.title,
        normalizeTitle(source.title),
        now,
        now
      );
    this.db
      .prepare(`UPDATE game_sources SET game_id = ?, updated_at = ? WHERE id = ?`)
      .run(gameId, now, sourceId);
    return this.get(gameId) as Game;
  }

  /** Pares de possíveis duplicatas por similaridade de título normalizado (P3-08). */
  possibleDuplicates(): Array<{ a: Game; b: Game }> {
    const all = this.list();
    const out: Array<{ a: Game; b: Game }> = [];
    for (let i = 0; i < all.length; i++) {
      for (let j = i + 1; j < all.length; j++) {
        const a = all[i];
        const b = all[j];
        if (a.id === b.id) continue;
        const na = a.normalizedTitle;
        const nb = b.normalizedTitle;
        if (na === nb) continue; // já mergeados automaticamente
        if (similarity(na, nb) >= 0.75) out.push({ a, b });
      }
    }
    return out;
  }
}

function similarity(a: string, b: string): number {
  if (!a || !b) return 0;
  const setA = new Set(a.split(' '));
  const setB = new Set(b.split(' '));
  if (setA.size === 0 || setB.size === 0) return 0;
  let common = 0;
  for (const w of setA) if (setB.has(w)) common++;
  return common / Math.max(setA.size, setB.size);
}


