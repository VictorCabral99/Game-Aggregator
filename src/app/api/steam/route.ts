import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { SteamAPI } from '@/lib/steam-api';
import { prisma } from '@/lib/prisma';

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { steamId } = await request.json();

    if (!steamId) {
      return NextResponse.json({ error: 'Steam ID is required' }, { status: 400 });
    }

    const steamAPI = new SteamAPI(process.env.STEAM_API_KEY!);
    const ownedGames = await steamAPI.getOwnedGames(steamId);

    // Save games to database
    for (const game of ownedGames.response.games) {
      await prisma.gameLibrary.upsert({
        where: {
          userId_platform_externalId: {
            userId: session.user.id,
            platform: 'steam',
            externalId: game.appid.toString(),
          },
        },
        update: {
          gameData: JSON.stringify(game),
          syncedAt: new Date(),
        },
        create: {
          userId: session.user.id,
          platform: 'steam',
          externalId: game.appid.toString(),
          gameData: JSON.stringify(game),
        },
      });
    }

    return NextResponse.json({
      success: true,
      gameCount: ownedGames.response.game_count,
      games: ownedGames.response.games,
    });
  } catch (error) {
    console.error('Steam sync error:', error);
    return NextResponse.json(
      { error: 'Failed to sync Steam games' },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const games = await prisma.gameLibrary.findMany({
      where: {
        userId: session.user.id,
        platform: 'steam',
      },
      orderBy: {
        syncedAt: 'desc',
      },
    });

    return NextResponse.json({ games });
  } catch (error) {
    console.error('Steam games fetch error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch Steam games' },
      { status: 500 }
    );
  }
}
