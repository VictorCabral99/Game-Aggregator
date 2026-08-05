import { NextRequest, NextResponse } from 'next/server';
import { requireUserId, sleep, mapPool } from '@/lib/auth-helpers';
import { SteamAPI } from '@/lib/steam-api';
import { createRatingsFileLog } from '@/lib/ratings-log';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const DELAY_MS = 150;
const STEAM_CONCURRENCY = 3;
const FRESH_MS = 7 * 24 * 60 * 60 * 1000;

type TimingBucket = 'steamLookup' | 'steam' | 'rawg' | 'save';
type Phase = 'steam' | 'rawg';

function summarizeTimings(samples: number[]) {
  if (samples.length === 0) return null;
  const total = samples.reduce((a, b) => a + b, 0);
  return {
    count: samples.length,
    totalMs: total,
    avgMs: Math.round(total / samples.length),
    maxMs: Math.max(...samples),
  };
}

function formatMs(ms: number) {
  if (ms >= 1000) return `${(ms / 1000).toFixed(1)}s`;
  return `${ms}ms`;
}

function ndjsonResponse(
  write: (send: (obj: unknown) => void) => Promise<void>
) {
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (obj: unknown) => {
        controller.enqueue(encoder.encode(`${JSON.stringify(obj)}\n`));
      };
      try {
        await write(send);
      } catch (error) {
        console.error('Ratings stream error:', error);
        send({ type: 'error', error: 'Falha ao buscar notas' });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'application/x-ndjson; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      'X-Accel-Buffering': 'no',
    },
  });
}

function resolveSteamAppId(
  platform: string,
  externalId: string,
  gameData: Record<string, unknown>
): number | null {
  if (platform === 'steam') {
    const fromExternal = parseInt(externalId, 10);
    if (!Number.isNaN(fromExternal) && fromExternal > 0) return fromExternal;
  }
  const fromData = gameData.appid ?? gameData.steam_appid;
  if (fromData !== undefined && fromData !== null && fromData !== '') {
    const n =
      typeof fromData === 'number' ? fromData : parseInt(String(fromData), 10);
    if (!Number.isNaN(n) && n > 0) return n;
  }
  return null;
}

function ratingOf(
  ratings: { source: string; rating: number | null; lastUpdated: Date }[],
  source: string
): { rating: number | null; lastUpdated: Date } | null {
  const row = ratings.find((r) => r.source === source);
  return row ? { rating: row.rating, lastUpdated: row.lastUpdated } : null;
}

function isFreshUseful(
  row: { rating: number | null; lastUpdated: Date } | null,
  staleCutoff: number
) {
  if (!row || row.rating === null || row.rating <= 0) return false;
  return row.lastUpdated.getTime() >= staleCutoff;
}

export async function POST(request: NextRequest) {
  const auth = await requireUserId();
  if ('error' in auth) return auth.error;

  const body = await request.json().catch(() => ({}));
  const force = Boolean(body?.force);

  const games = await prisma.gameLibrary.findMany({
    where: { userId: auth.userId },
    include: { ratings: true },
    orderBy: { syncedAt: 'desc' },
  });

  const staleCutoff = Date.now() - FRESH_MS;
  const steamQueue: typeof games = [];
  let skippedFresh = 0;

  for (const game of games) {
    const gameData =
      typeof game.gameData === 'string'
        ? JSON.parse(game.gameData)
        : game.gameData;
    const gameName = String(gameData?.name || gameData?.title || '');
    if (!gameName || /^[0-9a-f]{32}$/i.test(gameName)) continue;

    const steamRow = ratingOf(game.ratings, 'steam');
    const steamFresh = !force && isFreshUseful(steamRow, staleCutoff);

    // Temporário: só Steam (RAWG/Meta desligado)
    if (steamFresh) {
      skippedFresh += 1;
      continue;
    }
    steamQueue.push(game);
  }

  const steam = new SteamAPI(process.env.STEAM_API_KEY || 'unused');
  const fileLog = await createRatingsFileLog();

  return ndjsonResponse(async (send) => {
    const totalSteam = steamQueue.length;
    const totalRawg = 0;
    const totalWork = totalSteam;

    fileLog.line(
      `start · steamQueue=${totalSteam} rawgQueue=0 (disabled) skippedFresh=${skippedFresh}`
    );
    void fileLog.flush();

    send({
      type: 'meta',
      totalEligible: totalWork,
      steamTotal: totalSteam,
      rawgTotal: 0,
      skippedFresh,
      phase: 'steam' as Phase,
      logFile: fileLog.relativePath,
      message:
        totalWork > 0
          ? `Buscando Steam em ${totalSteam} jogos`
          : skippedFresh > 0
            ? `Nada pendente — ${skippedFresh} com Steam recente`
            : 'Nenhuma nota pendente',
    });

    if (totalWork === 0) {
      await fileLog.flush();
      send({
        type: 'done',
        updated: 0,
        totalEligible: 0,
        steamTotal: 0,
        rawgTotal: 0,
        logFile: fileLog.relativePath,
      });
      return;
    }

    let updated = 0;
    let completed = 0;
    const timingSamples: Record<TimingBucket, number[]> = {
      steamLookup: [],
      steam: [],
      rawg: [],
      save: [],
    };
    const timingLog: Array<{
      title: string;
      bucket: TimingBucket;
      ms: number;
      phase: Phase;
    }> = [];
    const batchStartedAt = Date.now();

    const timed = async <T>(
      title: string,
      phase: Phase,
      bucket: TimingBucket,
      work: () => Promise<T>
    ): Promise<{ value: T; ms: number }> => {
      const started = Date.now();
      const value = await work();
      const ms = Date.now() - started;
      timingSamples[bucket].push(ms);
      timingLog.push({ title, bucket, ms, phase });
      fileLog.line(`${phase} · ${title} · ${bucket} · ${ms}ms`);
      return { value, ms };
    };

    // ─── Fase 1: Steam reviews (rápida, prioritária) ─────────────────
    if (totalSteam > 0) {
      send({
        type: 'phase',
        phase: 'steam',
        message: `Fase Steam — ${totalSteam} jogos`,
        current: 0,
        total: totalSteam,
      });

      const processSteam = async (
        game: (typeof games)[number],
        allowLookup: boolean
      ) => {
        let gameName = 'Jogo';
        try {
          const gameData =
            typeof game.gameData === 'string'
              ? JSON.parse(game.gameData)
              : game.gameData;
          gameName = String(gameData.name || gameData.title || '');
          if (!gameName) {
            completed += 1;
            return;
          }

          send({
            type: 'stage',
            phase: 'steam',
            gameId: game.id,
            title: gameName,
            stage: 'steam',
            message: `${gameName} — Steam %`,
            current: completed,
            total: totalSteam,
          });
          await sleep(10);

          let steamAppId = resolveSteamAppId(
            game.platform,
            game.externalId,
            gameData
          );
          let steamMatchedName: string | null = null;

          if (!steamAppId && allowLookup) {
            send({
              type: 'stage',
              phase: 'steam',
              gameId: game.id,
              title: gameName,
              stage: 'steam-lookup',
              message: `${gameName} — Steam AppID`,
              current: completed,
              total: totalSteam,
            });
            const { value: found, ms } = await timed(
              gameName,
              'steam',
              'steamLookup',
              () => steam.findAppIdByTitle(gameName)
            );
            steamAppId = found.appid;
            steamMatchedName = found.matchedName;
            fileLog.line(
              `steam · ${gameName} · lookup ${
                steamAppId ? steamAppId : 'MISS'
              } · match=${steamMatchedName || '-'} · score=${
                found.score ?? '-'
              } · q="${found.query || gameName}" · ${ms}ms`
            );
          }

          let steamPercent: number | null = null;
          if (steamAppId) {
            const { value: review, ms } = await timed(
              gameName,
              'steam',
              'steam',
              () => steam.getReviewScore(steamAppId!)
            );
            steamPercent = review.percent;
            fileLog.line(
              `steam · ${gameName} · review ${steamPercent ?? 'null'}% · ${ms}ms`
            );
          }

          await timed(gameName, 'steam', 'save', async () => {
            const nextGameData = {
              ...gameData,
              steam_appid: steamAppId,
              steam_appid_resolved: true,
              ...(steamMatchedName
                ? { steam_matched_name: steamMatchedName }
                : {}),
            };
            await prisma.gameLibrary.update({
              where: { id: game.id },
              data: { gameData: JSON.stringify(nextGameData) },
            });

            const steamDbLink = steamAppId
              ? `https://steamdb.info/app/${steamAppId}/`
              : null;

            await prisma.gameRating.upsert({
              where: {
                gameLibraryId_source: {
                  gameLibraryId: game.id,
                  source: 'steam',
                },
              },
              update: {
                rating: steamPercent,
                lastUpdated: new Date(),
                ...(steamDbLink ? { url: steamDbLink } : {}),
              },
              create: {
                gameLibraryId: game.id,
                source: 'steam',
                rating: steamPercent,
                ...(steamDbLink ? { url: steamDbLink } : {}),
              },
            });
          });

          completed += 1;
          if (steamPercent && steamPercent > 0) updated += 1;

          send({
            type: 'item',
            phase: 'steam',
            gameId: game.id,
            title: gameName,
            steam: steamPercent,
            steamAppId,
            rawg: null,
            metacritic: null,
            message:
              steamPercent && steamPercent > 0
                ? `${gameName} · Steam ${steamPercent}%`
                : `${gameName} — sem % Steam`,
            current: completed,
            total: totalSteam,
          });

          await sleep(DELAY_MS);
        } catch (error) {
          completed += 1;
          fileLog.line(`steam · ${gameName} · ERROR · ${String(error)}`);
          console.error('Steam phase error:', error);
        }
      };

      // Primeiro quem já tem AppID; lookup (mais lento) só depois
      const knownAppId: typeof games = [];
      const needLookup: typeof games = [];
      for (const game of steamQueue) {
        const gameData =
          typeof game.gameData === 'string'
            ? JSON.parse(game.gameData)
            : game.gameData;
        if (resolveSteamAppId(game.platform, game.externalId, gameData)) {
          knownAppId.push(game);
        } else {
          needLookup.push(game);
        }
      }

      await mapPool(knownAppId, STEAM_CONCURRENCY, async (game) => {
        await processSteam(game, false);
      });

      if (needLookup.length > 0) {
        send({
          type: 'stage',
          phase: 'steam',
          stage: 'steam-lookup-pass',
          message: `Steam AppID lookup: ${needLookup.length} jogos`,
          current: completed,
          total: totalSteam,
        });
      }

      await mapPool(needLookup, STEAM_CONCURRENCY, async (game) => {
        await processSteam(game, true);
      });
    }

    // Fase 2 RAWG/Meta desligada por enquanto
    fileLog.line('rawg · skipped · disabled');

    await prisma.user.update({
      where: { id: auth.userId },
      data: { lastRatingsSyncAt: new Date() },
    });

    const timingSummary = {
      steamLookup: summarizeTimings(timingSamples.steamLookup),
      steam: summarizeTimings(timingSamples.steam),
      rawg: summarizeTimings(timingSamples.rawg),
      save: summarizeTimings(timingSamples.save),
    };
    const bucketLabels: Record<TimingBucket, string> = {
      steamLookup: 'Steam AppID',
      steam: 'Steam %',
      rawg: 'RAWG/Meta',
      save: 'Gravar DB',
    };
    const ranked = (
      Object.entries(timingSummary) as [
        TimingBucket,
        ReturnType<typeof summarizeTimings>,
      ][]
    )
      .filter(([, s]) => s)
      .sort((a, b) => (b[1]!.avgMs || 0) - (a[1]!.avgMs || 0));
    const bottleneck = ranked[0]
      ? {
          bucket: ranked[0][0],
          label: bucketLabels[ranked[0][0]],
          avgMs: ranked[0][1]!.avgMs,
          maxMs: ranked[0][1]!.maxMs,
        }
      : null;

    const elapsedMs = Date.now() - batchStartedAt;
    fileLog.line(
      `summary · updated=${updated} elapsed=${formatMs(elapsedMs)} bottleneck=${
        bottleneck
          ? `${bottleneck.label} avg=${formatMs(bottleneck.avgMs)} max=${formatMs(bottleneck.maxMs)}`
          : 'n/a'
      }`
    );
    for (const row of timingLog) {
      fileLog.line(
        `row · ${row.phase} · ${row.title} · ${row.bucket} · ${row.ms}ms`
      );
    }
    const logFile = await fileLog.flush();

    send({
      type: 'done',
      updated,
      totalEligible: totalWork,
      steamTotal: totalSteam,
      rawgTotal: totalRawg,
      elapsedMs,
      timings: timingSummary,
      bottleneck,
      log: timingLog,
      logFile,
      message: bottleneck
        ? `Notas ok — gargalo ${bottleneck.label} (média ${formatMs(bottleneck.avgMs)}) · ${formatMs(elapsedMs)} · ${logFile}`
        : `Notas ok — ${updated} atualizados · ${formatMs(elapsedMs)} · ${logFile}`,
    });
  });
}
