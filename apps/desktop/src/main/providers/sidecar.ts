import { spawn, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { app } from 'electron';
import type { GamePlatform } from '../db/games';
import type { LaunchResult, ProviderGame } from '@gagg/core';

export interface SidecarConfig {
  bin: string;
  platform: GamePlatform;
  displayName: string;
}

/**
 * Base para CLIs de loja (Legendary, gogdl, Nile).
 * Localiza o binário em resources/bin (dev) ou resources/bin (packaged),
 * expõe version/isAvailable e execução de processos.
 */
export class SidecarProvider {
  constructor(protected readonly config: SidecarConfig) {}

  get platform(): GamePlatform {
    return this.config.platform;
  }

  get displayName(): string {
    return this.config.displayName;
  }

  binPath(): string | null {
    const candidates = [
      join(app.getAppPath(), 'resources', 'bin', this.config.bin),
      join(process.resourcesPath ?? '', 'bin', this.config.bin),
    ];
    return candidates.find((p) => existsSync(p)) ?? null;
  }

  version(): string | null {
    const bin = this.binPath();
    if (!bin) return null;
    const res = spawnSync(bin, ['--version'], {
      encoding: 'utf8',
      windowsHide: true,
      timeout: 10_000,
    });
    if (res.status !== 0) return null;
    const line = (res.stdout || res.stderr || '').split('\n')[0];
    return line?.trim() || null;
  }

  isAvailable(): boolean {
    return this.binPath() !== null && this.version() !== null;
  }

  /** Subclasses implementam a leitura da biblioteca instalada. */
  scan(): ProviderGame[] {
    throw new Error(`${this.displayName}: scan não implementado`);
  }

  runJson(args: string[], timeoutMs = 60_000): unknown {
    const bin = this.binPath();
    if (!bin) throw new Error(`${this.displayName}: binário não encontrado em resources/bin`);
    const res = spawnSync(bin, args, {
      encoding: 'utf8',
      windowsHide: true,
      timeout: timeoutMs,
      maxBuffer: 64 * 1024 * 1024,
    });
    if (res.error) throw res.error;
    if (res.status !== 0) {
      const detail = (res.stderr || res.stdout || '').trim().slice(0, 300);
      throw new Error(`${this.displayName}: comando falhou (${res.status}) ${detail}`);
    }
    try {
      return JSON.parse(res.stdout);
    } catch {
      throw new Error(`${this.displayName}: saída JSON inválida`);
    }
  }

  /** Inicia um jogo de forma destacada; retorna imediatamente. */
  launch(args: string[]): Promise<LaunchResult> {
    const bin = this.binPath();
    if (!bin) {
      return Promise.resolve({ ok: false, error: `${this.displayName}: binário não encontrado` });
    }
    return new Promise((resolve) => {
      const child = spawn(bin, args, { detached: true, stdio: 'ignore', windowsHide: false });
      const fail = (err: Error) => resolve({ ok: false, error: err.message });
      child.once('error', fail);
      child.once('spawn', () => {
        child.removeListener('error', fail);
        child.unref();
        resolve({ ok: true, pid: child.pid });
      });
    });
  }
}
