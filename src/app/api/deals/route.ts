import { NextRequest, NextResponse } from 'next/server';
import { requireUserId } from '@/lib/auth-helpers';
import { ITADAPI } from '@/lib/itad-api';
import { prisma } from '@/lib/prisma';

export async function GET(request: NextRequest) {
  const auth = await requireUserId();
  if ('error' in auth) return auth.error;

  const wishlistItemId = new URL(request.url).searchParams.get('wishlistItemId');
  if (!wishlistItemId) {
    return NextResponse.json(
      { error: 'Wishlist item ID is required' },
      { status: 400 }
    );
  }

  const deals = await prisma.gameDeal.findMany({
    where: { wishlistItemId },
  });

  return NextResponse.json({ deals });
}

export async function POST(request: NextRequest) {
  const auth = await requireUserId();
  if ('error' in auth) return auth.error;

  if (!process.env.ITAD_API_KEY) {
    return NextResponse.json(
      { error: 'ITAD_API_KEY is not configured' },
      { status: 503 }
    );
  }

  const { wishlistItemId } = await request.json();
  if (!wishlistItemId) {
    return NextResponse.json(
      { error: 'Wishlist item ID is required' },
      { status: 400 }
    );
  }

  const item = await prisma.wishlistItem.findUnique({
    where: { id: wishlistItemId },
  });

  if (!item || item.userId !== auth.userId) {
    return NextResponse.json({ error: 'Wishlist item not found' }, { status: 404 });
  }

  const gameData =
    typeof item.gameData === 'string' ? JSON.parse(item.gameData) : item.gameData;

  const itad = new ITADAPI(
    process.env.ITAD_API_KEY,
    process.env.ITAD_COUNTRY || 'BR'
  );

  const deal = await itad.getDealForGame({
    appid: item.platform === 'steam' ? item.externalId : gameData.appid,
    title: gameData.name || gameData.title,
  });

  if (!deal) {
    return NextResponse.json(
      { error: 'Game not found on IsThereAnyDeal' },
      { status: 404 }
    );
  }

  const savedDeal = await prisma.gameDeal.upsert({
    where: {
      wishlistItemId_source: {
        wishlistItemId,
        source: 'itad',
      },
    },
    update: {
      externalId: deal.itadId,
      currentPrice: deal.currentPrice,
      regularPrice: deal.regularPrice,
      currency: deal.currency,
      cut: deal.cut,
      shopName: deal.shopName,
      historicalLow: deal.historicalLow,
      historicalLowShop: deal.historicalLowShop,
      url: deal.url,
      dealData: JSON.stringify(deal),
      lastUpdated: new Date(),
    },
    create: {
      wishlistItemId,
      source: 'itad',
      externalId: deal.itadId,
      currentPrice: deal.currentPrice,
      regularPrice: deal.regularPrice,
      currency: deal.currency,
      cut: deal.cut,
      shopName: deal.shopName,
      historicalLow: deal.historicalLow,
      historicalLowShop: deal.historicalLowShop,
      url: deal.url,
      dealData: JSON.stringify(deal),
    },
  });

  return NextResponse.json({ success: true, deal: savedDeal });
}
