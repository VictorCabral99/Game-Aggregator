import type { WishlistEntry } from '../../../shared/api';

export type WishlistSortMode = 'price' | 'discount';

/** Preço atual no (ou abaixo do) mínimo histórico ITAD. */
export function isHistoricalLowDeal(entry: WishlistEntry): boolean {
  const cur = entry.price?.currentPrice;
  const low = entry.price?.historicalLow;
  if (cur == null || low == null) return false;
  return cur <= low + 0.005;
}

function cmpTitle(a: WishlistEntry, b: WishlistEntry): number {
  return a.title.localeCompare(b.title, 'pt-BR', { sensitivity: 'base' });
}

/**
 * Ordena a wishlist só na tela de promoções.
 * Mínimo histórico sempre no topo; depois preço (asc) ou desconto (desc).
 */
export function sortWishlistEntries(
  entries: WishlistEntry[],
  mode: WishlistSortMode
): WishlistEntry[] {
  return [...entries].sort((a, b) => {
    const aPin = isHistoricalLowDeal(a) ? 0 : 1;
    const bPin = isHistoricalLowDeal(b) ? 0 : 1;
    if (aPin !== bPin) return aPin - bPin;

    if (mode === 'price') {
      const ap = a.price?.currentPrice;
      const bp = b.price?.currentPrice;
      if (ap == null && bp == null) return cmpTitle(a, b);
      if (ap == null) return 1;
      if (bp == null) return -1;
      if (ap !== bp) return ap - bp;
      return cmpTitle(a, b);
    }

    const ac = a.price?.cutPercent;
    const bc = b.price?.cutPercent;
    if (ac == null && bc == null) return cmpTitle(a, b);
    if (ac == null) return 1;
    if (bc == null) return -1;
    if (ac !== bc) return bc - ac;
    return cmpTitle(a, b);
  });
}
