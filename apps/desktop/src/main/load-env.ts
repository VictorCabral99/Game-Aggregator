import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/** Carrega `.env` / `.env.local` da raiz do monorepo (e do cwd) no process.env. */
function parseEnvFile(content: string): void {
  for (const raw of content.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

const roots = [
  process.cwd(),
  resolve(process.cwd(), '..'),
  resolve(process.cwd(), '../..'),
  resolve(__dirname, '../../../..'),
  resolve(__dirname, '../../../../'),
];

for (const root of roots) {
  for (const name of ['.env.local', '.env']) {
    const path = resolve(root, name);
    if (existsSync(path)) {
      try {
        parseEnvFile(readFileSync(path, 'utf8'));
      } catch {
        // ignore
      }
    }
  }
}
