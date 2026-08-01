import { NextRequest, NextResponse } from 'next/server';
import { requireUserId } from '@/lib/auth-helpers';
import { SteamAPI } from '@/lib/steam-api';
import { prisma } from '@/lib/prisma';

export async function POST(request: NextRequest) {
  const auth = await requireUserId();
  if ('error' in auth) return auth.error;

  if (!process.env.STEAM_API_KEY) {
    return NextResponse.json(
      { error: 'STEAM_API_KEY is not configured' },
      { status: 503 }
    );
  }

  const { steamId } = await request.json();
  if (!steamId || typeof steamId !== 'string') {
    return NextResponse.json({ error: 'steamId is required' }, { status: 400 });
  }

  const steamAPI = new SteamAPI(process.env.STEAM_API_KEY);
  const resolvedId = await steamAPI.resolveVanityUrl(steamId.trim());

  if (!resolvedId) {
    return NextResponse.json(
      { error: 'Could not resolve Steam ID' },
      { status: 400 }
    );
  }

  const summaries = await steamAPI.getPlayerSummaries([resolvedId]);
  const player = summaries?.response?.players?.[0];

  const account = await prisma.platformAccount.upsert({
    where: {
      userId_platform: {
        userId: auth.userId,
        platform: 'steam',
      },
    },
    update: {
      externalUserId: resolvedId,
      displayName: player?.personaname || resolvedId,
      metadata: JSON.stringify({ avatar: player?.avatarfull }),
    },
    create: {
      userId: auth.userId,
      platform: 'steam',
      externalUserId: resolvedId,
      displayName: player?.personaname || resolvedId,
      metadata: JSON.stringify({ avatar: player?.avatarfull }),
    },
  });

  return NextResponse.json({
    success: true,
    account: {
      id: account.id,
      platform: account.platform,
      externalUserId: account.externalUserId,
      displayName: account.displayName,
      linkedAt: account.linkedAt,
    },
  });
}
