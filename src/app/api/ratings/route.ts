import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { RAWGAPI } from '@/lib/rawg-api';
import { MetacriticAPI } from '@/lib/metacritic-api';
import { RatingAggregator } from '@/lib/aggregation';
import { prisma } from '@/lib/prisma';

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const gameLibraryId = searchParams.get('gameLibraryId');

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
  } catch (error) {
    console.error('Ratings fetch error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch ratings' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
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

    if (!gameLibrary) {
      return NextResponse.json({ error: 'Game not found' }, { status: 404 });
    }

    const gameData = typeof gameLibrary.gameData === 'string' 
      ? JSON.parse(gameLibrary.gameData)
      : gameLibrary.gameData;
    const gameName = gameData.name;

    // Fetch ratings from different sources
    const rawgAPI = new RAWGAPI(process.env.RAWG_API_KEY!);
    const metacriticAPI = new MetacriticAPI();

    // Search in RAWG
    let rawgRating = null;
    try {
      const rawgSearch = await rawgAPI.searchGames(gameName);
      if (rawgSearch.results.length > 0) {
        const rawgGame = rawgSearch.results[0];
        rawgRating = rawgGame.rating;
      }
    } catch (error) {
      console.error('RAWG fetch error:', error);
    }

    // Search in Metacritic
    let metacriticRating = null;
    try {
      const metacriticSearch = await metacriticAPI.searchGames(gameName);
      if (metacriticSearch.length > 0) {
        const metacriticGame = metacriticSearch[0];
        metacriticRating = metacriticGame.score;
      }
    } catch (error) {
      console.error('Metacritic fetch error:', error);
    }

    // Aggregate ratings
    const ratings = RatingAggregator.aggregate(
      metacriticRating,
      rawgRating,
      null // GG.deals not implemented yet
    );

    // Save ratings to database
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

    const averageRating = RatingAggregator.calculateAverage(ratings);
    const weightedRating = RatingAggregator.calculateWeighted(ratings);

    return NextResponse.json({
      success: true,
      ratings,
      averageRating,
      weightedRating,
    });
  } catch (error) {
    console.error('Ratings sync error:', error);
    return NextResponse.json(
      { error: 'Failed to sync ratings' },
      { status: 500 }
    );
  }
}
