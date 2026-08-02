// Smoke: valida o spawn de exe dentro do runtime Electron (mesmo caminho do IPC launch:exe).
// Grava resultado em arquivo (evita buffering de pipe) e sai.
// Uso: npx electron tools/scripts/electron-launch-smoke.cjs
const { app } = require('electron');
const { spawn } = require('node:child_process');
const { writeFileSync } = require('node:fs');
const { join } = require('node:path');

const OUT = join(__dirname, '..', '..', 'launch-smoke-result.json');

function finish(ok, extra) {
  try {
    writeFileSync(OUT, JSON.stringify({ ok, ...extra }, null, 2));
  } catch (e) {
    // ignora: sem arquivo o gate falha visualmente
  }
  app.exit(ok ? 0 : 1);
}

app.whenReady().then(() => {
  const exe = process.env.SMOKE_EXE || 'C:\\Windows\\System32\\notepad.exe';
  const child = spawn(exe, [], { detached: true, stdio: 'ignore' });

  const timer = setTimeout(() => finish(false, { exe, error: 'timeout aguardando spawn' }), 15000);

  child.once('error', (e) => {
    clearTimeout(timer);
    finish(false, { exe, error: e.message });
  });
  child.once('spawn', () => {
    clearTimeout(timer);
    child.unref();
    finish(true, { exe, pid: child.pid });
  });
});
