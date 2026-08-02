#!/usr/bin/env node
/**
 * Baixa os sidecars de loja (Legendary, gogdl, Nile) para apps/desktop/resources/bin.
 * Uso: node tools/scripts/fetch-sidecars.mjs [--dry-run]
 *
 * Fonte: última release oficial de cada projeto (GitHub).
 * NOTA: após baixar, autentique cada um no terminal:
 *   legendary auth | gogdl auth | nile auth
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const binDir = join(root, 'apps', 'desktop', 'resources', 'bin');

const SIDECARS = [
  {
    id: 'legendary',
    repo: 'derrod/legendary',
    file: 'legendary.exe',
    asset: /^legendary(\.exe|_win64.*\.exe)$/i,
  },
  {
    id: 'gogdl',
    repo: 'Heroic-Games-Launcher/gogdl',
    file: 'gogdl.exe',
    asset: /gogdl[^/]*\.exe$/i,
  },
  {
    id: 'nile',
    repo: 'imLinguin/nile',
    file: 'nile.exe',
    asset: /^nile[^/]*\.exe$/i,
  },
];

const dryRun = process.argv.includes('--dry-run');

async function latestAsset(repo, pattern) {
  const res = await fetch(`https://api.github.com/repos/${repo}/releases/latest`, {
    headers: { 'User-Agent': 'game-aggregator-sidecars' },
  });
  if (!res.ok) throw new Error(`GitHub ${res.status} para ${repo}`);
  const release = await res.json();
  const asset = release.assets?.find((a) => pattern.test(a.name));
  if (!asset) throw new Error(`Nenhum asset para ${repo} (tag ${release.tag_name})`);
  return { url: asset.browser_download_url, tag: release.tag_name, name: asset.name };
}

await mkdir(binDir, { recursive: true });

for (const sc of SIDECARS) {
  try {
    const { url, tag, name } = await latestAsset(sc.repo, sc.asset);
    console.log(`[${sc.id}] ${sc.repo}@${tag} -> ${name}`);
    if (dryRun) continue;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`download HTTP ${res.status}`);
    const buf = Buffer.from(await res.arrayBuffer());
    await writeFile(join(binDir, sc.file), buf);
    console.log(`  salvo ${join(binDir, sc.file)} (${(buf.length / 1e6).toFixed(1)} MB)`);
  } catch (err) {
    console.error(`[${sc.id}] ERRO: ${err.message}`);
  }
}
