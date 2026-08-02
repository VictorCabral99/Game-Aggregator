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

const upd = repo.update(g1.id, { title: 'Bloco de Notas' });
assert(upd?.title === 'Bloco de Notas', 'update title');
assert(upd?.cwd === null, 'cwd default null');

repo.touchPlayed(g1.id);
assert(Boolean(repo.get(g1.id)?.lastPlayedAt), 'touchPlayed');

repo.remove(g2.id);
assert(repo.list().length === 1, 'remove');
db.close();

const db2 = new DatabaseSync(file, { readOnly: true });
const repo2 = new LibraryRepository(db2);
assert(repo2.list().length === 1, 'persistence after reopen');
assert(repo2.get(g1.id)?.title === 'Bloco de Notas', 'persisted update');
db2.close();
for (const suffix of ['', '-wal', '-shm']) rmSync(file + suffix, { force: true });

console.log('REPO_SMOKE_OK');
