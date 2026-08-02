// Smoke Fase 8: profiles, launch args, remote badge, export/import offline.
// Uso: node tools/scripts/phase8-smoke.ts
import { DatabaseSync } from 'node:sqlite';
import { applyMigrations } from '../../apps/desktop/src/main/db/migrations.ts';
import { LibraryRepository } from '../../apps/desktop/src/main/db/games.ts';
import {
  getProfileTokens,
  isProfileId,
  profileBootSettings,
  PROFILE_TOKENS,
} from '../../apps/desktop/src/shared/profiles.ts';

const assert = (cond: boolean, msg: string) => {
  if (!cond) throw new Error(`ASSERT FAIL: ${msg}`);
};

const db = new DatabaseSync(':memory:');
applyMigrations(db);

const version = (db.prepare(`SELECT MAX(version) AS v FROM schema_migrations`).get() as { v: number }).v;
assert(version >= 9, `schema v9+ esperado, got ${version}`);

// --- Profiles (P8-01/02)
assert(isProfileId('desk') && isProfileId('tv') && isProfileId('handheld'), 'profile ids');
assert(!isProfileId('mobile'), 'profile inválido rejeitado');
assert(getProfileTokens('tv').maxColumns === 5, 'tv tokens');
assert(PROFILE_TOKENS.desk.cardWidth < PROFILE_TOKENS.tv.cardWidth, 'tv cards maiores');
const tvBoot = profileBootSettings('tv');
assert(tvBoot['ui.tvMode'] === '1' && tvBoot['ui.fullscreen'] === '1', 'tv boot settings');
const deskBoot = profileBootSettings('desk');
assert(deskBoot['ui.tvMode'] === '0', 'desk desliga tvMode');

const set = (key: string, value: string) => {
  db.prepare(
    `INSERT INTO app_settings (key, value, updated_at) VALUES (?, ?, datetime('now'))
     ON CONFLICT (key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`
  ).run(key, value);
};
const get = (key: string): string | null => {
  const row = db.prepare(`SELECT value FROM app_settings WHERE key = ?`).get(key) as
    | { value?: string }
    | undefined;
  return row?.value ?? null;
};

set('ui.profile', 'tv');
for (const [k, v] of Object.entries(profileBootSettings('tv'))) set(k, v);
assert(get('ui.profile') === 'tv', 'profile persiste');
assert(get('ui.tvMode') === '1', 'tvMode derivado');

// --- Launch args + remote (P8-04/05)
const repo = new LibraryRepository(db);
const game = repo.add({
  title: 'Local Test Game',
  executable: 'C:\\Windows\\System32\\notepad.exe',
  launchArgs: '-fullscreen',
  isRemote: true,
});
assert(game.launchArgs === '-fullscreen', 'launchArgs gravado');
assert(game.isRemote === true, 'isRemote gravado');

const updated = repo.update(game.id, { launchArgs: '', isRemote: false });
assert(updated?.launchArgs === null, 'launchArgs limpa');
assert(updated?.isRemote === false, 'isRemote off');

repo.update(game.id, { launchArgs: '-fullscreen -novid', isRemote: true });
const again = repo.get(game.id);
assert(again?.launchArgs === '-fullscreen -novid', 'preset multi-arg');
assert(again?.isRemote === true, 'remote badge flag');

// --- Export / import offline (P8-06/07) — sem rede
const payload = repo.exportPayload('desk');
assert(payload.version === 1, 'export version');
assert(payload.games.length === 1, 'export tem 1 jogo');
assert(payload.games[0].launchArgs === '-fullscreen -novid', 'export leva launchArgs');
assert(payload.games[0].isRemote === true, 'export leva isRemote');

const db2 = new DatabaseSync(':memory:');
applyMigrations(db2);
const repo2 = new LibraryRepository(db2);
const result = repo2.importPayload(payload);
assert(result.imported === 1, `import imported=${result.imported}`);
assert(result.skipped === 0, 'import skipped=0');
const imported = repo2.list();
assert(imported.length === 1, 'lista após import');
assert(imported[0].title === 'Local Test Game', 'título importado');
assert(imported[0].launchArgs === '-fullscreen -novid', 'args importados');
assert(imported[0].isRemote === true, 'remote importado');

// Moonlight settings keys (persistência pura — sem spawn)
set('moonlight.path', 'C:\\Fake\\Moonlight.exe');
set('moonlight.host', 'pc-sala');
set('moonlight.app', 'Desktop');
set('moonlight.args', '--resolution 1920x1080');
assert(get('moonlight.host') === 'pc-sala', 'moonlight host persiste');

console.log('PHASE8_SMOKE_OK');
