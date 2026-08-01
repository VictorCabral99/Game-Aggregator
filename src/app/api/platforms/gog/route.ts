import { NextRequest, NextResponse } from 'next/server';
import { requireUserId } from '@/lib/auth-helpers';
import { GogAPI } from '@/lib/gog-api';
import { prisma } from '@/lib/prisma';

export async function POST(request: NextRequest) {
  const auth = await requireUserId();
  if ('error' in auth) return auth.error;

  const { accessToken, refreshToken } = await request.json();

  let token = accessToken as string | undefined;
  let nextRefresh = refreshToken as string | undefined;
  let expiresAt: Date | undefined;

  if (!token && refreshToken) {
    try {
      const refreshed = await GogAPI.refreshAccessToken(refreshToken);
      token = refreshed.access_token;
      nextRefresh = refreshed.refresh_token || refreshToken;
      if (refreshed.expires_in) {
        expiresAt = new Date(Date.now() + refreshed.expires_in * 1000);
      }
    } catch (error) {
      console.error('GOG token refresh failed:', error);
      return NextResponse.json(
        { error: 'Failed to refresh GOG token' },
        { status: 400 }
      );
    }
  }

  if (!token) {
    return NextResponse.json(
      { error: 'accessToken or refreshToken is required' },
      { status: 400 }
    );
  }

  try {
    const gog = new GogAPI(token);
    const userData = await gog.getUserData();

    const account = await prisma.platformAccount.upsert({
      where: {
        userId_platform: {
          userId: auth.userId,
          platform: 'gog',
        },
      },
      update: {
        externalUserId: userData.userId,
        displayName: userData.username,
        accessToken: token,
        refreshToken: nextRefresh,
        tokenExpiresAt: expiresAt,
      },
      create: {
        userId: auth.userId,
        platform: 'gog',
        externalUserId: userData.userId,
        displayName: userData.username,
        accessToken: token,
        refreshToken: nextRefresh,
        tokenExpiresAt: expiresAt,
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
  } catch (error) {
    console.error('GOG link error:', error);
    return NextResponse.json(
      { error: 'Invalid GOG token or failed to fetch user' },
      { status: 400 }
    );
  }
}
