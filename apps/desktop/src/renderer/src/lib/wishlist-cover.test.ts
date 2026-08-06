import { describe, expect, it } from 'vitest';
import {
  steamWishlistCoverUrl,
  wishlistCoverCandidates,
  wishlistCoverUrl,
} from './wishlist-cover';

describe('wishlistCoverUrl', () => {
  it('prioriza coverUrl gravada', () => {
    expect(
      wishlistCoverUrl({ coverUrl: 'https://example.com/c.jpg', steamAppId: '620' })
    ).toBe('https://example.com/c.jpg');
  });

  it('monta header Steam a partir do appid', () => {
    expect(wishlistCoverUrl({ coverUrl: null, steamAppId: '620' })).toBe(
      steamWishlistCoverUrl(620)
    );
    expect(steamWishlistCoverUrl(620)).toContain('/apps/620/header.jpg');
  });

  it('retorna null sem capa nem appid', () => {
    expect(wishlistCoverUrl({ coverUrl: null, steamAppId: null })).toBeNull();
  });

  it('candidatos incluem fallbacks de CDN', () => {
    const list = wishlistCoverCandidates({ coverUrl: null, steamAppId: '620' });
    expect(list[0]).toContain('header.jpg');
    expect(list.some((u) => u.includes('library_600x900'))).toBe(true);
  });
});
