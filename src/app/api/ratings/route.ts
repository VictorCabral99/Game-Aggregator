import { NextRequest, NextResponse } from 'next/server';
import { requireUserId } from '@/lib/auth-helpers';
import { RAWGAPI } from '@/lib/rawg-api';
import { MetacriticAPI } from '@/lib/metacritic-api';
import { RatingAggregator } from '@/lib/aggregation';
import { prisma } from '@/lib/prisma';

export async function GET(request: NextRequest) {
  const auth = await requireUserId();
  if ('error' in auth) return auth.error;

  const gameLibraryId = new URL(request.url).searchParams.get('gameLibraryId');
  if (!gameLibraryId) {
    return NextResponse.json(
      { error: 'Game library ID is required' },
      { status: 400 }
    );
  }

  const ratings = await prisma.gameRating.findMany({
    where: { gameLibraryId },
  });

  return NextResponse.json({ ratings });
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

  const { gameLibraryId } = await request.json();
  if (!gameLibraryId) {
    return NextResponse.json(
      { error: 'Game library ID is required' },
      { status: 400 }
    );
  }

  const gameLibrary = await prisma.gameLibrary.findUnique({
    where: { id: gameLibraryId },
  });

  if (!gameLibrary || gameLibrary.userId !== auth.userId) {
    return NextResponse.json({ error: 'Game not found' }, { status: 404 });
  }

  const gameData =
    typeof gameLibrary.gameData === 'string'
      ? JSON.parse(gameLibrary.gameData)
      : gameLibrary.gameData;
  const gameName = gameData.name || gameData.title;

  const rawgAPI = new RAWGAPI(process.env.RAWG_API_KEY);
  const metacriticAPI = new MetacriticAPI();

  let rawgRating: number | null = null;
  let metacriticRating: number | null = null;

  try {
    const rawgSearch = await rawgAPI.searchGames(gameName);
    if (rawgSearch.results.length > 0) {
      rawgRating = rawgSearch.results[0].rating;
      if (rawgSearch.results[0].metacritic) {
        metacriticRating = rawgSearch.results[0].metacritic;
      }
    }
  } catch (error) {
    console.error('RAWG fetch error:', error);
  }

  if (metacriticRating === null) {
    try {
      const metacriticSearch = await metacriticAPI.searchGames(gameName);
      if (metacriticSearch.length > 0) {
        metacriticRating = metacriticSearch[0].score;
      }
    } catch (error) {
      console.error('Metacritic fetch error:', error);
    }
  }

  const ratings = RatingAggregator.aggregate(metacriticRating, rawgRating);

  for (const rating of ratings) {
    await prisma.gameRating.upsert({
      where: {
        gameLibraryId_source: {
          gameLibraryId,
          source: rating.source,
        },
      },
      update: {
        rating: rating.rating,
        lastUpdated: new Date(),
      },
      create: {
        gameLibraryId,
        source: rating.source,
        rating: rating.rating,
      },
    });
  }

  return NextResponse.json({
    success: true,
    ratings,
    averageRating: RatingAggregator.calculateAverage(ratings),
    weightedRating: RatingAggregator.calculateWeighted(ratings),
  });
}
