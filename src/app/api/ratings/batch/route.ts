import { NextRequest, NextResponse } from 'next/server';
import { requireUserId, sleep, mapPool } from '@/lib/auth-helpers';
import { RAWGAPI } from '@/lib/rawg-api';
import { SteamAPI } from '@/lib/steam-api';
import { RatingAggregator } from '@/lib/aggregation';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const DELAY_MS = 150;
const CONCURRENCY = 2;
const FRESH_MS = 7 * 24 * 60 * 60 * 1000;

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
    const n = typeof fromData === 'number' ? fromData : parseInt(String(fromData), 10);
    if (!Number.isNaN(n) && n > 0) return n;
  }
  return null;
}

export async function POST(request: NextRequest) {
  const auth = await requireUserId();
  if ('error' in auth) return auth.error;

  if (!process.env.RAWG_API_KEY) {
    return NextResponse.json(
      { error: 'RAWG_API_KEY is not configured' },
      { status: 503 }
    );
  }

  const body = await request.json().catch(() => ({}));
  const force = Boolean(body?.force);

  const games = await prisma.gameLibrary.findMany({
    where: { userId: auth.userId },
    include: { ratings: true },
    orderBy: { syncedAt: 'desc' },
  });

  const staleCutoff = Date.now() - FRESH_MS;
  const eligible = games.filter((game) => {
    const gameData =
      typeof game.gameData === 'string'
        ? JSON.parse(game.gameData)
        : game.gameData;
    const gameName = String(gameData?.name || gameData?.title || '');
    if (!gameName || /^[0-9a-f]{32}$/i.test(gameName)) return false;

    if (force) return true;

    const useful = game.ratings.filter(
      (r) => r.rating !== null && r.rating > 0
    );
    if (useful.length === 0) return true;

    const steamAppId = resolveSteamAppId(game.platform, game.externalId, gameData);
    // Sem steam_appid resolvido → buscar de novo (preenche link SteamDB + % Steam)
    if (!steamAppId && !gameData.steam_appid_resolved) {
      return true;
    }
    // Tem appid mas ainda não gravou a fonte steam → completar
    if (steamAppId && !game.ratings.some((r) => r.source === 'steam')) {
      return true;
    }

    // Já tem nota fresca (< 7 dias) → não busca de novo
    const freshest = Math.max(...useful.map((r) => r.lastUpdated.getTime()));
    return freshest < staleCutoff;
  });

  const rawg = new RAWGAPI(process.env.RAWG_API_KEY);
  // API key optional for store reviews endpoint
  const steam = new SteamAPI(process.env.STEAM_API_KEY || 'unused');

  return ndjsonResponse(async (send) => {
    send({
      type: 'meta',
      totalEligible: eligible.length,
      scanned: eligible.length,
      remaining: 0,
      concurrency: CONCURRENCY,
    });

    if (eligible.length === 0) {
      send({
        type: 'done',
        updated: 0,
        matched: 0,
        scanned: 0,
        remaining: 0,
        totalEligible: 0,
      });
      return;
    }

    let updated = 0;
    let matched = 0;
    let completed = 0;

    await mapPool(eligible, CONCURRENCY, async (game) => {
      try {
        const gameData =
          typeof game.gameData === 'string'
            ? JSON.parse(game.gameData)
            : game.gameData;
        const gameName = String(gameData.name || gameData.title || '');
        if (!gameName) {
          completed += 1;
          return;
        }

        send({
          type: 'looking',
          title: gameName,
          current: completed,
          total: eligible.length,
        });
        await sleep(10);

        const resolved = await rawg.resolveRatingsForTitle(gameName);
        if (resolved.matchedName) matched += 1;

        let steamPercent: number | null = null;
        let steamAppId = resolveSteamAppId(
          game.platform,
          game.externalId,
          gameData
        );
        let steamMatchedName: string | null = null;

        if (!steamAppId) {
          const found = await steam.findAppIdByTitle(gameName);
          steamAppId = found.appid;
          steamMatchedName = found.matchedName;
        }

        if (steamAppId) {
          const review = await steam.getReviewScore(steamAppId);
          steamPercent = review.percent;
        }

        // Persiste appid no gameData para o link SteamDB ficar preciso
        const nextGameData = {
          ...gameData,
          steam_appid: steamAppId,
          steam_appid_resolved: true,
          ...(steamMatchedName ? { steam_matched_name: steamMatchedName } : {}),
        };
        await prisma.gameLibrary.update({
          where: { id: game.id },
          data: { gameData: JSON.stringify(nextGameData) },
        });

        const steamDbLink = steamAppId
          ? `https://steamdb.info/app/${steamAppId}/`
          : null;

        const ratings = RatingAggregator.aggregate(
          resolved.metacritic,
          resolved.rawg,
          steamAppId ? steamPercent : null
        ).filter((r) => {
          if (r.source === 'steam' && !steamAppId) return false;
          return true;
        });

        for (const rating of ratings) {
          await prisma.gameRating.upsert({
            where: {
              gameLibraryId_source: {
                gameLibraryId: game.id,
                source: rating.source,
              },
            },
            update: {
              rating: rating.rating,
              lastUpdated: new Date(),
              ...(rating.source === 'steam' && steamDbLink
                ? { url: steamDbLink }
                : {}),
            },
            create: {
              gameLibraryId: game.id,
              source: rating.source,
              rating: rating.rating,
              ...(rating.source === 'steam' && steamDbLink
                ? { url: steamDbLink }
                : {}),
            },
          });
        }

        updated += 1;
        completed += 1;
        send({
          type: 'item',
          title: gameName,
          matchedName: resolved.matchedName,
          rawg: resolved.rawg,
          metacritic: resolved.metacritic,
          steam: steamPercent,
          steamAppId,
          current: completed,
          total: eligible.length,
        });

        await sleep(DELAY_MS);
      } catch (error) {
        completed += 1;
        console.error('Ratings batch item error:', error);
      }
    });

    await prisma.user.update({
      where: { id: auth.userId },
      data: { lastRatingsSyncAt: new Date() },
    });

    send({
      type: 'done',
      updated,
      matched,
      scanned: eligible.length,
      remaining: 0,
      totalEligible: eligible.length,
    });
  });
}
