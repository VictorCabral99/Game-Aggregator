import type { DatabaseSync } from 'node:sqlite';
import type { PriceSnapshot, WishlistAddInput, WishlistEntry } from '../../shared/api';

interface WishlistRow {
  id: string;
  game_id: string | null;
  title: string;
  itad_id: string | null;
  slug: string | null;
  preferred_stores: string | null;
  target_price: number | null;
  currency: string;
  alert_enabled: number;
  note: string | null;
  created_at: string;
  updated_at: string;
}

interface PriceRow {
  id: string;
  wishlist_id: string;
  source: string;
  itad_id: string | null;
  current_price: number | null;
  regular_price: number | null;
  cut_percent: number | null;
  historical_low: number | null;
  historical_low_shop: string | null;
  shop_name: string | null;
  currency: string | null;
  url: string | null;
  fetched_at: string;
}

function mapPrice(row: PriceRow): PriceSnapshot {
  return {
    id: row.id,
    wishlistId: row.wishlist_id,
    source: row.source,
    itadId: row.itad_id,
    currentPrice: row.current_price,
    regularPrice: row.regular_price,
    cutPercent: row.cut_percent,
    historicalLow: row.historical_low,
    historicalLowShop: row.historical_low_shop,
    shopName: row.shop_name,
    currency: row.currency,
    url: row.url,
    fetchedAt: row.fetched_at,
  };
}

function mapEntry(row: WishlistRow, price: PriceRow | null): WishlistEntry {
  return {
    id: row.id,
    gameId: row.game_id,
    title: row.title,
    itadId: row.itad_id,
    slug: row.slug,
    preferredStores: row.preferred_stores ? (JSON.parse(row.preferred_stores) as string[]) : [],
    targetPrice: row.target_price,
    currency: row.currency,
    alertEnabled: row.alert_enabled === 1,
    note: row.note,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    price: price ? mapPrice(price) : null,
  };
}

export class WishlistRepository {
  private readonly db: DatabaseSync;

  constructor(db: DatabaseSync) {
    this.db = db;
  }

  private latestPriceFor(wishlistId: string): PriceRow | null {
    return (
      this.db
        .prepare(
          `SELECT * FROM price_snapshots WHERE wishlist_id = ?
           ORDER BY fetched_at DESC, rowid DESC LIMIT 1`
        )
        .get(wishlistId) as PriceRow | undefined
    ) ?? null;
  }

  list(): WishlistEntry[] {
    const rows = this.db
      .prepare(`SELECT * FROM wishlist_entries ORDER BY updated_at DESC`)
      .all() as unknown as WishlistRow[];
    return rows.map((row) => mapEntry(row, this.latestPriceFor(row.id)));
  }

  get(id: string): WishlistEntry | null {
    const row = this.db
      .prepare(`SELECT * FROM wishlist_entries WHERE id = ?`)
      .get(id) as WishlistRow | undefined;
    return row ? mapEntry(row, this.latestPriceFor(row.id)) : null;
  }

  add(input: WishlistAddInput): WishlistEntry {
    const id = `w-${crypto.randomUUID()}`;
    const now = new Date().toISOString();
    this.db
      .prepare(
        `INSERT INTO wishlist_entries
           (id, game_id, title, itad_id, slug, preferred_stores, target_price, currency, alert_enabled, note, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        id,
        input.gameId ?? null,
        input.title.trim(),
        input.itadId ?? null,
        input.slug ?? null,
        input.preferredStores?.length ? JSON.stringify(input.preferredStores) : null,
        input.targetPrice ?? null,
        'BRL',
        input.alertEnabled === false ? 0 : 1,
        null,
        now,
        now
      );
    return this.get(id)!;
  }

  update(id: string, patch: Partial<WishlistAddInput>): WishlistEntry {
    const current = this.get(id);
    if (!current) throw new Error('Wishlist entry não encontrada');

    const title = patch.title?.trim() || current.title;
    const itadId = patch.itadId !== undefined ? patch.itadId ?? null : current.itadId;
    const slug = patch.slug !== undefined ? patch.slug ?? null : current.slug;
    const preferredStores =
      patch.preferredStores !== undefined ? patch.preferredStores : current.preferredStores;
    const targetPrice = patch.targetPrice !== undefined ? patch.targetPrice ?? null : current.targetPrice;
    const alertEnabled =
      patch.alertEnabled !== undefined ? patch.alertEnabled : current.alertEnabled;
    const gameId = patch.gameId !== undefined ? patch.gameId ?? null : current.gameId;

    this.db
      .prepare(
        `UPDATE wishlist_entries SET
           game_id = ?, title = ?, itad_id = ?, slug = ?, preferred_stores = ?,
           target_price = ?, alert_enabled = ?, updated_at = datetime('now')
         WHERE id = ?`
      )
      .run(
        gameId,
        title,
        itadId,
        slug,
        preferredStores.length ? JSON.stringify(preferredStores) : null,
        targetPrice,
        alertEnabled ? 1 : 0,
        id
      );
    return this.get(id)!;
  }

  remove(id: string): void {
    this.db.prepare(`DELETE FROM wishlist_entries WHERE id = ?`).run(id);
  }

  findByIds(ids: string[]): WishlistEntry[] {
    if (ids.length === 0) return [];
    const placeholders = ids.map(() => '?').join(',');
    const rows = this.db
      .prepare(`SELECT * FROM wishlist_entries WHERE id IN (${placeholders})`)
      .all(...ids) as unknown as WishlistRow[];
    return rows.map((row) => mapEntry(row, this.latestPriceFor(row.id)));
  }

  upsertPrice(input: {
    wishlistId: string;
    itadId: string | null;
    currentPrice: number | null;
    regularPrice: number | null;
    cutPercent: number | null;
    historicalLow: number | null;
    historicalLowShop: string | null;
    shopName: string | null;
    currency: string | null;
    url: string | null;
  }): void {
    this.db
      .prepare(
        `INSERT INTO price_snapshots
           (id, wishlist_id, source, itad_id, current_price, regular_price, cut_percent,
            historical_low, historical_low_shop, shop_name, currency, url, fetched_at)
         VALUES (?, ?, 'itad', ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`
      )
      .run(
        `p-${crypto.randomUUID()}`,
        input.wishlistId,
        input.itadId,
        input.currentPrice ?? null,
        input.regularPrice ?? null,
        input.cutPercent ?? null,
        input.historicalLow ?? null,
        input.historicalLowShop ?? null,
        input.shopName ?? null,
        input.currency ?? null,
        input.url ?? null
      );
  }

  /** Preço mais recente por entrada, mesmo se o campo price estiver null no map. */
  latestForGame(itadId: string): PriceSnapshot | null {
    const row = this.db
      .prepare(
        `SELECT ps.* FROM price_snapshots ps
         JOIN wishlist_entries w ON w.id = ps.wishlist_id
         WHERE w.itad_id = ?
         ORDER BY ps.fetched_at DESC, ps.rowid DESC LIMIT 1`
      )
      .get(itadId) as PriceRow | undefined;
    return row ? mapPrice(row) : null;
  }

  has(itadId: string): boolean {
    const row = this.db
      .prepare(`SELECT 1 AS x FROM wishlist_entries WHERE itad_id = ?`)
      .get(itadId) as { x: number } | undefined;
    return Boolean(row);
  }
}
