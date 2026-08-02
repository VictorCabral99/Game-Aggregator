#!/usr/bin/env node
/**
 * Smoke test dos sidecars de loja (Fase 0).
 * Sucesso: printa versão de cada sidecar presente e sai 0.
 * Ausente: warning, sai 0. Quebrado (exit != 0): sai 1.
 */
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const binDir = join(root, 'apps', 'desktop', 'resources', 'bin');

const sidecars = [
  { id: 'legendary', file: 'legendary.exe', args: ['--version'] },
  { id: 'gogdl', file: 'gogdl.exe', args: ['--version'] },
  { id: 'nile', file: 'nile.exe', args: ['--version'] },
];

let failed = false;

for (const sc of sidecars) {
  const local = join(binDir, sc.file);
  if (!existsSync(local)) {
    console.log(`[skip] ${sc.id}: binário não encontrado em ${local}`);
    continue;
  }
  const res = spawnSync(local, sc.args, { encoding: 'utf8', timeout: 10_000 });
  const ok = res.status === 0 && !res.error;
  const out = (res.stdout || res.stderr || '').trim().split('\n')[0] || 'sem output';
  console.log(`[${ok ? 'OK' : 'FAIL'}] ${sc.id}: ${out}`);
  if (!ok) failed = true;
}

if (failed) {
  console.error('Algum sidecar falhou. Corrija ou remova o binário antes do gate.');
  process.exit(1);
}
