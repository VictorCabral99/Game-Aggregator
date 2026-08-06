import { existsSync, promises as fs } from 'node:fs';
import path from 'node:path';
import { getLibraryRepository } from '../db';
import { getSteamProvider } from '../providers';
import { discoverOrganizeGames } from './discover';
import { defaultHeroicPaths, patchHeroicInstallPath, type HeroicPaths } from './heroic';
import { ensureOrganizeDirs, getGamesRoot, platformDir } from './root';
import {
  ensureSteamLibraryFolder,
  findAppManifest,
  planSteamMove,
} from './steam-library';
import type {
  OrganizeGame,
  OrganizeTransferEvent,
  OrganizeTransferResult,
} from './types';

async function pathExists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

export type MovePathResult = {
  mode: 'rename' | 'copy';
  sourceRemoved: boolean;
};

/** EPERM/EACCES em Program Files e EXDEV (outro volume) → copy+rm. */
export function shouldFallbackCopy(code: string | undefined): boolean {
  return code === 'EXDEV' || code === 'EPERM' || code === 'EACCES';
}

/**
 * Move pasta/arquivo.
 * Rename primeiro; se EPERM/EACCES/EXDEV, copia e tenta apagar a origem.
 * Se a cópia ok mas o delete falhar (Program Files sem admin), destino fica
 * e `sourceRemoved: false` — caller avisa o usuário.
 */
export async function movePath(src: string, dest: string): Promise<MovePathResult> {
  await fs.mkdir(path.dirname(dest), { recursive: true });
  if (await pathExists(dest)) {
    throw new Error(`Destino já existe: ${dest}`);
  }
  try {
    await fs.rename(src, dest);
    return { mode: 'rename', sourceRemoved: true };
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (!shouldFallbackCopy(code)) throw err;

    await fs.cp(src, dest, { recursive: true, errorOnExist: true });
    try {
      await fs.rm(src, { recursive: true, force: true });
      return { mode: 'copy', sourceRemoved: true };
    } catch (rmErr) {
      const rmCode = (rmErr as NodeJS.ErrnoException).code;
      if (rmCode === 'EPERM' || rmCode === 'EACCES') {
        return { mode: 'copy', sourceRemoved: false };
      }
      throw rmErr;
    }
  }
}

function updateLibraryInstallPath(
  platform: OrganizeGame['platform'],
  externalId: string,
  title: string,
  installPath: string
): void {
  const repo = getLibraryRepository();
  repo.upsertMany(platform === 'local' ? 'local' : platform, [
    {
      externalId,
      title,
      installPath,
      isInstalled: true,
    },
  ]);
}

async function transferOne(
  game: OrganizeGame,
  heroicPaths: HeroicPaths,
  onEvent: (e: OrganizeTransferEvent) => void,
  index: number,
  total: number
): Promise<void> {
  if (game.alreadyStandard) {
    onEvent({
      type: 'item',
      index,
      total,
      id: game.id,
      title: game.title,
      stage: 'done',
      message: 'já na pasta padrão',
    });
    return;
  }

  if (game.canMove === false) {
    throw new Error(game.hint || 'Este jogo não pode ser movido (Microsoft Store / Xbox)');
  }

  if (!(await pathExists(game.currentPath))) {
    throw new Error(`Origem não encontrada: ${game.currentPath}`);
  }

  onEvent({ type: 'item', index, total, id: game.id, title: game.title, stage: 'move' });

  if (game.platform === 'steam') {
    const steam = getSteamProvider();
    const steamRoot = steam.detectPath();
    if (!steamRoot) throw new Error('Steam não encontrado');
    const libraryRoot = platformDir(getGamesRoot(), 'steam');
    ensureSteamLibraryFolder(steamRoot, libraryRoot);
    const plan = planSteamMove(game.currentPath, libraryRoot, game.externalId);
    const manifest =
      findAppManifest(path.dirname(path.dirname(game.currentPath)), game.externalId) ??
      plan.fromManifest;

    const moved = await movePath(plan.fromCommon, plan.toCommon);
    if (await pathExists(manifest)) {
      try {
        await movePath(manifest, plan.toManifest);
      } catch (err) {
        try {
          if ((await pathExists(plan.toCommon)) && !(await pathExists(plan.fromCommon))) {
            await movePath(plan.toCommon, plan.fromCommon);
          }
        } catch {
          // ignore rollback failure
        }
        throw err;
      }
    }
    onEvent({ type: 'item', index, total, id: game.id, title: game.title, stage: 'patch' });
    updateLibraryInstallPath('steam', game.externalId, game.title, plan.toCommon);
    if (!moved.sourceRemoved) {
      onEvent({
        type: 'item',
        index,
        total,
        id: game.id,
        title: game.title,
        stage: 'done',
        message: 'copiado; origem Steam ainda existe (feche a Steam / permissões)',
      });
      return;
    }
  } else {
    await ensureOrganizeDirs();
    let moved: MovePathResult;
    try {
      moved = await movePath(game.currentPath, game.suggestedPath);
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      const msg = err instanceof Error ? err.message : String(err);
      if (code === 'EPERM' || code === 'EACCES' || /EPERM|EACCES|not permitted/i.test(msg)) {
        throw new Error(
          `${msg}. Feche o ${game.title} (e o launcher) e, se estiver em Program Files, rode o Game Center como administrador ou desinstale a origem depois da cópia.`
        );
      }
      throw err;
    }
    onEvent({ type: 'item', index, total, id: game.id, title: game.title, stage: 'patch' });

    if (
      game.source === 'heroic' &&
      (game.platform === 'epic' || game.platform === 'gog' || game.platform === 'amazon')
    ) {
      const ok = patchHeroicInstallPath(
        heroicPaths,
        game.platform,
        game.externalId,
        game.suggestedPath
      );
      if (!ok) {
        onEvent({
          type: 'item',
          index,
          total,
          id: game.id,
          title: game.title,
          stage: 'patch',
          message: 'movido; Heroic não atualizado (installed.json)',
        });
      }
    }
    updateLibraryInstallPath(game.platform, game.externalId, game.title, game.suggestedPath);

    if (!moved.sourceRemoved) {
      onEvent({
        type: 'item',
        index,
        total,
        id: game.id,
        title: game.title,
        stage: 'done',
        message:
          'copiado para a pasta padrão; não deu para apagar a origem (Program Files / sem permissão). Desinstale o original pelo Windows se quiser liberar espaço.',
      });
      return;
    }
  }

  onEvent({ type: 'item', index, total, id: game.id, title: game.title, stage: 'done' });
}

export async function transferOrganizeGames(
  ids: string[],
  opts?: {
    onEvent?: (e: OrganizeTransferEvent) => void;
    heroicPaths?: HeroicPaths;
    gamesRoot?: string;
  }
): Promise<OrganizeTransferResult> {
  const onEvent = opts?.onEvent ?? (() => undefined);
  const heroicPaths = opts?.heroicPaths ?? defaultHeroicPaths();
  await ensureOrganizeDirs(opts?.gamesRoot);

  const { items } = await discoverOrganizeGames({
    gamesRoot: opts?.gamesRoot,
    heroicPaths,
    includeSteam: ids.some((id) => id.startsWith('steam:')),
  });
  const byId = new Map(items.map((g) => [g.id, g]));
  const selected = ids.map((id) => byId.get(id)).filter(Boolean) as OrganizeGame[];

  onEvent({ type: 'start', total: selected.length });
  let moved = 0;
  let failed = 0;
  const errors: OrganizeTransferResult['errors'] = [];

  for (let i = 0; i < selected.length; i += 1) {
    const game = selected[i];
    try {
      await transferOne(game, heroicPaths, onEvent, i + 1, selected.length);
      if (!game.alreadyStandard) moved += 1;
    } catch (err) {
      failed += 1;
      const message = err instanceof Error ? err.message : String(err);
      errors.push({ id: game.id, title: game.title, error: message });
      onEvent({
        type: 'item',
        index: i + 1,
        total: selected.length,
        id: game.id,
        title: game.title,
        stage: 'error',
        message,
      });
    }
  }

  onEvent({ type: 'done', moved, failed });
  return { moved, failed, errors };
}

export function gameStillExists(p: string): boolean {
  return existsSync(p);
}
