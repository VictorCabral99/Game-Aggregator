import { describe, expect, it } from 'vitest';
import type { PriceSnapshot, WishlistEntry } from '../../../shared/api';
import { isHistoricalLowDeal, sortWishlistEntries } from './wishlist-sort';

function price(partial: Partial<PriceSnapshot>): PriceSnapshot {
  return {
    id: 'p1',
    wishlistId: 'w1',
    source: 'itad',
    itadId: null,
    currentPrice: null,
    regularPrice: null,
    cutPercent: null,
    historicalLow: null,
    historicalLowShop: null,
    shopName: null,
    currency: 'BRL',
    url: null,
    fetchedAt: '2026-01-01T00:00:00.000Z',
    ...partial,
  };
}

function entry(title: string, p: Partial<PriceSnapshot> | null): WishlistEntry {
  return {
    id: title,
    gameId: null,
    title,
    itadId: null,
    slug: null,
    preferredStores: [],
    targetPrice: null,
    currency: 'BRL',
    alertEnabled: true,
    note: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    price: p ? price(p) : null,
  };
}

describe('isHistoricalLowDeal', () => {
  it('é true quando preço atual ≤ mínimo histórico', () => {
    expect(
      isHistoricalLowDeal(entry('A', { currentPrice: 10, historicalLow: 10 }))
    ).toBe(true);
    expect(
      isHistoricalLowDeal(entry('B', { currentPrice: 9.99, historicalLow: 10 }))
    ).toBe(true);
  });

  it('é false sem preço ou acima do mínimo', () => {
    expect(isHistoricalLowDeal(entry('A', null))).toBe(false);
    expect(
      isHistoricalLowDeal(entry('B', { currentPrice: 12, historicalLow: 10 }))
    ).toBe(false);
    expect(isHistoricalLowDeal(entry('C', { currentPrice: 10, historicalLow: null }))).toBe(
      false
    );
  });
});

describe('sortWishlistEntries', () => {
  it('põe mínimo histórico no topo mesmo com preço maior', () => {
    const list = [
      entry('Caro', { currentPrice: 50, historicalLow: 20, cutPercent: 10 }),
      entry('Mínimo', { currentPrice: 80, historicalLow: 80, cutPercent: 5 }),
      entry('Barato', { currentPrice: 15, historicalLow: 10, cutPercent: 20 }),
    ];
    const sorted = sortWishlistEntries(list, 'price');
    expect(sorted.map((e) => e.title)).toEqual(['Mínimo', 'Barato', 'Caro']);
  });

  it('ordena por preço ascendente (sem preço no fim)', () => {
    const list = [
      entry('B', { currentPrice: 40, historicalLow: 10 }),
      entry('Sem', null),
      entry('A', { currentPrice: 20, historicalLow: 5 }),
    ];
    expect(sortWishlistEntries(list, 'price').map((e) => e.title)).toEqual([
      'A',
      'B',
      'Sem',
    ]);
  });

  it('ordena por desconto descendente', () => {
    const list = [
      entry('Pouca', { currentPrice: 50, cutPercent: 10, historicalLow: 5 }),
      entry('Mega', { currentPrice: 30, cutPercent: 70, historicalLow: 5 }),
      entry('Sem%', { currentPrice: 20, cutPercent: null, historicalLow: 5 }),
    ];
    expect(sortWishlistEntries(list, 'discount').map((e) => e.title)).toEqual([
      'Mega',
      'Pouca',
      'Sem%',
    ]);
  });
});
