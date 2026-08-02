// Smoke: verifica se node:sqlite existe no runtime do Electron.
// Uso: npx electron tools/scripts/node-sqlite-smoke.cjs
const { app } = require('electron');

app.whenReady().then(() => {
  try {
    const { DatabaseSync } = require('node:sqlite');
    const db = new DatabaseSync(':memory:');
    db.exec('CREATE TABLE t (id INTEGER PRIMARY KEY, v TEXT)');
    db.prepare('INSERT INTO t (v) VALUES (?)').run('ok');
    const row = db.prepare('SELECT v FROM t LIMIT 1').get();
    console.log('NODE_SQLITE_OK', JSON.stringify(row), 'electron', process.versions.electron, 'node', process.versions.node);
  } catch (e) {
    console.log('NODE_SQLITE_FAIL', e.message);
  }
  app.exit(0);
});
