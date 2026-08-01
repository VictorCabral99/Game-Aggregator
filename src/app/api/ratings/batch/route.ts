import { NextResponse } from 'next/server';
import { requireUserId, sleep } from '@/lib/auth-helpers';
import { RAWGAPI } from '@/lib/rawg-api';
import { MetacriticAPI } from '@/lib/metacritic-api';
import { RatingAggregator } from '@/lib/aggregation';
import { prisma } from '@/lib/prisma';

const BATCH_LIMIT = 40;
const DELAY_MS = 300;

export async function POST() {
  const auth = await requireUserId();
  if ('error' in auth) return auth.error;

  if (!process.env.RAWG_API_KEY) {
    return NextResponse.json(
      { error: 'RAWG_API_KEY is not configured' },
      { status: 503 }
    );
  }

  const games = await prisma.gameLibrary.findMany({
    where: { userId: auth.userId },
    include: { ratings: true },
    orderBy: { syncedAt: 'desc' },
  });

  const staleCutoff = Date.now() - 24 * 60 * 60 * 1000;
  const targets = games
    .filter((game) => {
      if (game.ratings.length === 0) return true;
      return game.ratings.some((r) => r.lastUpdated.getTime() < staleCutoff);
    })
    .slice(0, BATCH_LIMIT);

  const rawg = new RAWGAPI(process.env.RAWG_API_KEY);
  const metacritic = new MetacriticAPI();
  let updated = 0;

  for (const game of targets) {
    try {
      const gameData =
        typeof game.gameData === 'string'
          ? JSON.parse(game.gameData)
          : game.gameData;
      const gameName = gameData.name || gameData.title;
      if (!gameName) continue;

      let rawgRating: number | null = null;
      let metacriticRating: number | null = null;

      try {
        const rawgSearch = await rawg.searchGames(gameName);
        if (rawgSearch.results?.length) {
          rawgRating = rawgSearch.results[0].rating;
          if (rawgSearch.results[0].metacritic) {
            metacriticRating = rawgSearch.results[0].metacritic;
          }
        }
      } catch (error) {
        console.error('RAWG batch error:', error);
      }

      if (metacriticRating === null) {
        try {
          const mcSearch = await metacritic.searchGames(gameName);
          if (mcSearch.length > 0) {
            metacriticRating = mcSearch[0].score;
          }
        } catch (error) {
          console.error('Metacritic batch error:', error);
        }
      }

      const ratings = RatingAggregator.aggregate(metacriticRating, rawgRating);

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
          },
          create: {
            gameLibraryId: game.id,
            source: rating.source,
            rating: rating.rating,
          },
        });
      }

      updated += 1;
      await sleep(DELAY_MS);
    } catch (error) {
      console.error('Ratings batch item error:', error);
    }
  }

  await prisma.user.update({
    where: { id: auth.userId },
    data: { lastRatingsSyncAt: new Date() },
  });

  return NextResponse.json({
    success: true,
    updated,
    scanned: targets.length,
  });
}
