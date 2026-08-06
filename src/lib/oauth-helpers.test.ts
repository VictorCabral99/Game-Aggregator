import { createHash } from 'crypto';
import { afterEach, describe, expect, it } from 'vitest';
import { baseUrl, pkceChallenge, randomString } from '@/lib/oauth-helpers';

describe('baseUrl', () => {
  const original = process.env.NEXTAUTH_URL;

  afterEach(() => {
    if (original === undefined) delete process.env.NEXTAUTH_URL;
    else process.env.NEXTAUTH_URL = original;
  });

  it('extrai a origem de uma URL completa em string', () => {
    expect(baseUrl('http://localhost:3001/auth/callback')).toBe(
      'http://localhost:3001'
    );
  });

  it('usa URL.origin quando recebe uma instância de URL', () => {
    expect(baseUrl(new URL('https://example.com/path?x=1'))).toBe(
      'https://example.com'
    );
  });

  it('prefere nextUrl.origin em objetos semelhantes a request', () => {
    expect(
      baseUrl({ nextUrl: new URL('http://localhost:3002/dashboard') })
    ).toBe('http://localhost:3002');
  });

  it('monta a URL a partir dos headers de host/proto encaminhados', () => {
    const headers = new Headers({
      'x-forwarded-host': 'app.example.com',
      'x-forwarded-proto': 'https',
    });
    expect(baseUrl({ headers })).toBe('https://app.example.com');
  });

  it('cai para NEXTAUTH_URL e depois para localhost:3000', () => {
    process.env.NEXTAUTH_URL = 'http://localhost:4000';
    expect(baseUrl()).toBe('http://localhost:4000');
    delete process.env.NEXTAUTH_URL;
    expect(baseUrl()).toBe('http://localhost:3000');
  });
});

describe('pkceChallenge', () => {
  it('retorna o SHA-256 em base64url do verifier', () => {
    const verifier = 'test-verifier-value';
    const expected = createHash('sha256').update(verifier).digest('base64url');
    expect(pkceChallenge(verifier)).toBe(expected);
  });
});

describe('randomString', () => {
  it('retorna uma string base64url não vazia', () => {
    const s = randomString(16);
    expect(s.length).toBeGreaterThan(10);
    expect(s).toMatch(/^[A-Za-z0-9_-]+$/);
  });
});
