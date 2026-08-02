// Smoke Fase 7: wishlist e preços.
// - migration v7 (wishlist_entries + price_snapshots)
// - WishlistRepository CRUD (add/list/update/remove)
// - upsertPrice + price mais recente mapeado no entry
// - dedupe por itad_id (has)
// Uso: node tools/scripts/wishlist-smoke.ts
import { DatabaseSync } from 'node:sqlite';
import { applyMigrations } from '../../apps/desktop/src/main/db/migrations.ts';
import { WishlistRepository } from '../../apps/desktop/src/main/db/wishlist.ts';

const assert = (cond: boolean, msg: string) => {
  if (!cond) throw new Error(`ASSERT FAIL: ${msg}`);
};

const db = new DatabaseSync(':memory:');
applyMigrations(db);
const repo = new WishlistRepository(db);

// Tabelas da migration v7 existem
const tableCount = (
  db
    .prepare(
      `SELECT COUNT(*) AS n FROM sqlite_master
       WHERE type = 'table' AND name IN ('wishlist_entries', 'price_snapshots')`
    )
    .get() as { n: number }
).n;
assert(tableCount === 2, 'migration v7 cria wishlist_entries + price_snapshots');

// CRUD
const a = repo.add({ title: 'Hollow Knight', itadId: 'hk-id', slug: 'hollow-knight', alertEnabled: true });
assert(a.itadId === 'hk-id', 'add guarda itadId');
assert(a.alertEnabled === true, 'alertEnabled default true');
assert(a.preferredStores.length === 0, 'preferredStores vazio por default');

const b = repo.add({ title: 'Jogo Manual', itadId: null });
assert(b.targetPrice === null, 'sem targetPrice por default');

let list = repo.list();
assert(list.length === 2, `list tem 2 itens (achei ${list.length})`);

// Update: targetPrice + alert
const updated = repo.update(a.id, { targetPrice: 19.9 });
assert(updated.targetPrice === 19.9, 'update salva targetPrice');
assert(updated.alertEnabled === true, 'update preserva alertEnabled');

const off = repo.update(a.id, { alertEnabled: false, preferredStores: ['Steam', 'Nuuvem'] });
assert(off.alertEnabled === false, 'update desliga alerta');
assert(off.preferredStores.length === 2, 'update salva lojas preferidas');

// Preços: upsert + snapshot mais recente
repo.upsertPrice({
  wishlistId: a.id,
  itadId: 'hk-id',
  currentPrice: 24.9,
  regularPrice: 49.9,
  cutPercent: 50,
  historicalLow: 9.9,
  historicalLowShop: 'Steam',
  shopName: 'Steam',
  currency: 'BRL',
  url: 'https://isthereanydeal.com/game/hollowknight/',
});

list = repo.list();
const withPrice = list.find((e) => e.id === a.id)!;
assert(withPrice.price?.currentPrice === 24.9, 'price mapeado no entry');
assert(withPrice.price?.cutPercent === 50, 'cut mapeado');
assert(withPrice.price?.historicalLow === 9.9, 'historical low mapeado');
assert(withPrice.price?.url?.includes('isthereanydeal'), 'url da oferta mapeada');

// Snapshot mais recente vence (nova upsert sobrescreve o mais recente)
repo.upsertPrice({
  wishlistId: a.id,
  itadId: 'hk-id',
  currentPrice: 19.9,
  regularPrice: 49.9,
  cutPercent: 60,
  historicalLow: 9.9,
  historicalLowShop: 'Steam',
  shopName: 'Epic',
  currency: 'BRL',
  url: 'https://isthereanydeal.com/game/hollowknight/',
});
list = repo.list();
assert(
  list.find((e) => e.id === a.id)!.price?.currentPrice === 19.9,
  'preço mais recente vence'
);

// Dedupe por itadId
assert(repo.has('hk-id') === true, 'has() true para itadId já adicionado');
assert(repo.has('outro-id') === false, 'has() false para itadId novo');

// findByIds
const found = repo.findByIds([a.id, b.id]);
assert(found.length === 2, 'findByIds devolve os 2');

// Remove (cascade limpa snapshots)
repo.remove(a.id);
const after = repo.list();
assert(after.length === 1, 'remove tira da lista');
const snapshots = (
  db.prepare(`SELECT COUNT(*) AS n FROM price_snapshots WHERE wishlist_id = ?`).get(a.id) as {
    n: number;
  }
).n;
assert(snapshots === 0, 'cascade apaga price_snapshots');

console.log('WISHLIST_SMOKE_OK');
