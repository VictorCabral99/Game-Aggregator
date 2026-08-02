// Smoke: exercita LibraryRepository + migrações em Node puro (sem Electron).
// Uso: node tools/scripts/repo-smoke.ts
import { DatabaseSync } from 'node:sqlite';
import { rmSync } from 'node:fs';
import { applyMigrations } from '../../apps/desktop/src/main/db/migrations.ts';
import { LibraryRepository } from '../../apps/desktop/src/main/db/games.ts';

const assert = (cond: boolean, msg: string) => {
  if (!cond) throw new Error(`ASSERT FAIL: ${msg}`);
};

const file = 'repo-smoke-tmp.db';
for (const suffix of ['', '-wal', '-shm']) rmSync(file + suffix, { force: true });

const db = new DatabaseSync(file);
applyMigrations(db);
const repo = new LibraryRepository(db);

const g1 = repo.add({ title: 'Notepad', executable: 'C:\\Windows\\System32\\notepad.exe' });
const g2 = repo.add({ title: 'Calc', executable: 'C:\\Windows\\System32\\calc.exe', cwd: 'C:\\Windows' });
assert(repo.list().length === 2, 'list count');
assert(g1.title === 'Notepad', 'add title');
assert(g1.sources.length === 1, 'add source 1');
assert(g1.sources[0].platform === 'local', 'add source local');
assert(g1.sources[0].executable === 'C:\\Windows\\System32\\notepad.exe', 'add source exe');
assert(g1.preferredSource?.id === g1.sources[0].id, 'preferred = única source');

const upd = repo.update(g1.id, { title: 'Bloco de Notas' });
assert(upd?.title === 'Bloco de Notas', 'update title');
assert(upd?.sources[0].cwd === null, 'cwd default null');

repo.touchPlayed(g1.id);
const afterTouch = repo.get(g1.id);
assert(Boolean(afterTouch?.preferredSource?.lastPlayedAt), 'touchPlayed via preferred');
assert(afterTouch?.sources[0].lastPlayedAt !== null, 'touchPlayed source');

// upsert de provider cria canonical 1:1 e é idempotente
const first = repo.upsertMany('steam', [
  { externalId: '570', title: 'Dota 2' },
  { externalId: '730', title: 'Counter-Strike 2', sizeBytes: 1000 },
]);
assert(first.inserted === 2, 'upsert first');
assert(repo.countByPlatform('steam') === 2, 'count steam');
const second = repo.upsertMany('steam', [{ externalId: '570', title: 'Dota 2' }]);
assert(second.inserted === 0, 'upsert idempotente');

const steamList = repo.listByPlatform('steam');
assert(steamList.length === 2, 'list steam');
assert(steamList.every((g) => g.sources.some((s) => s.platform === 'steam')), 'source steam');
assert(steamList.every((g) => g.preferredSource?.platform === 'steam'), 'preferred steam');

repo.remove(g2.id);
assert(repo.list().length === 3, 'remove');
db.close();

const db2 = new DatabaseSync(file, { readOnly: true });
const repo2 = new LibraryRepository(db2);
assert(repo2.list().length === 3, 'persistence after reopen');
assert(repo2.get(g1.id)?.title === 'Bloco de Notas', 'persisted update');
db2.close();
for (const suffix of ['', '-wal', '-shm']) rmSync(file + suffix, { force: true });

console.log('REPO_SMOKE_OK');
