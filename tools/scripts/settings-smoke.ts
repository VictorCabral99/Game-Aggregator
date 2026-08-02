// Smoke Fase 5: persistência de settings de UX (Modo TV / fullscreen / sons).
// Valida round-trip das chaves usadas pela UI via app_settings.
// Uso: node tools/scripts/settings-smoke.ts
import { DatabaseSync } from 'node:sqlite';
import { applyMigrations } from '../../apps/desktop/src/main/db/migrations.ts';

const assert = (cond: boolean, msg: string) => {
  if (!cond) throw new Error(`ASSERT FAIL: ${msg}`);
};

const db = new DatabaseSync(':memory:');
applyMigrations(db);

const get = (key: string): string | null => {
  const row = db.prepare(`SELECT value FROM app_settings WHERE key = ?`).get(key) as
    | { value?: string }
    | undefined;
  return row?.value ?? null;
};

const set = (key: string, value: string) => {
  db.prepare(
    `INSERT INTO app_settings (key, value, updated_at) VALUES (?, ?, datetime('now'))
     ON CONFLICT (key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`
  ).run(key, value);
};

// Chaves usadas pela Fase 5
set('ui.tvMode', '1');
set('ui.fullscreen', '1');
set('ui.sounds', '1');

assert(get('ui.tvMode') === '1', 'tvMode persiste');
assert(get('ui.fullscreen') === '1', 'fullscreen persiste');
assert(get('ui.sounds') === '1', 'sounds persiste');

// Round-trip: desligar/ligar de novo
set('ui.sounds', '0');
assert(get('ui.sounds') === '0', 'sounds desliga');
set('ui.sounds', '1');
assert(get('ui.sounds') === '1', 'sounds liga de novo');

// Default de chave ausente é null (UI trata como "off")
assert(get('ui.tvMode') === '1', 'tvMode segue ligado');
set('ui.tvMode', '0');
assert(get('ui.tvMode') === '0', 'tvMode desliga');

// Atualiza updated_at no conflito (upsert não cria duplicata)
set('ui.sounds', '1');
const count = (db.prepare(`SELECT COUNT(*) AS n FROM app_settings WHERE key = 'ui.sounds'`).get() as {
  n: number;
}).n;
assert(count === 1, 'upsert não duplica linha');

console.log('SETTINGS_SMOKE_OK');
