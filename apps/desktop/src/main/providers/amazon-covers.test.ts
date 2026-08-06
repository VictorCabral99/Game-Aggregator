import { describe, expect, it } from 'vitest';
import { amazonCoverUrlFromProduct } from './amazon-covers';

describe('amazonCoverUrlFromProduct', () => {
  it('lê iconUrl em productDetail (formato real Nile/Heroic)', () => {
    const url = amazonCoverUrlFromProduct({
      id: 'amzn1.adg.product.demo',
      title: 'Demo',
      productDetail: {
        iconUrl: 'https://m.media-amazon.com/images/I/abc._SX500_.jpg',
        details: {
          backgroundUrl1: 'https://m.media-amazon.com/images/I/bg1.jpg',
        },
      },
    });
    expect(url).toBe('https://m.media-amazon.com/images/I/abc._SX500_.jpg');
  });

  it('cai para background/logo se não houver iconUrl', () => {
    expect(
      amazonCoverUrlFromProduct({
        productDetail: {
          details: {
            logoUrl: 'https://cdn.example/logo.png',
            backgroundUrl2: 'https://cdn.example/bg2.jpg',
          },
        },
      })
    ).toBe('https://cdn.example/logo.png');

    expect(
      amazonCoverUrlFromProduct({
        productDetail: {
          details: { backgroundUrl2: 'https://cdn.example/bg2.jpg' },
        },
      })
    ).toBe('https://cdn.example/bg2.jpg');
  });

  it('normaliza URL protocol-relative', () => {
    expect(
      amazonCoverUrlFromProduct({
        productDetail: { iconUrl: '//images-na.ssl-images-amazon.com/images/I/x.jpg' },
      })
    ).toBe('https://images-na.ssl-images-amazon.com/images/I/x.jpg');
  });

  it('não usa campos top-level inventados quando productDetail existe vazio', () => {
    expect(
      amazonCoverUrlFromProduct({
        productImageUrl: 'https://should.not/prefer-if-detail-empty',
        productDetail: {},
      })
    ).toBe('https://should.not/prefer-if-detail-empty');
  });

  it('retorna undefined sem arte', () => {
    expect(amazonCoverUrlFromProduct({})).toBeUndefined();
    expect(amazonCoverUrlFromProduct(null)).toBeUndefined();
  });
});
