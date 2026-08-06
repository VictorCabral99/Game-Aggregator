import { describe, expect, it } from 'vitest';
import { shouldFallbackCopy } from './transfer';

describe('movePath / permissões', () => {
  it('trata EPERM e EACCES como fallback de cópia (Program Files)', () => {
    expect(shouldFallbackCopy('EPERM')).toBe(true);
    expect(shouldFallbackCopy('EACCES')).toBe(true);
    expect(shouldFallbackCopy('EXDEV')).toBe(true);
  });

  it('não faz fallback em outros erros', () => {
    expect(shouldFallbackCopy('ENOENT')).toBe(false);
    expect(shouldFallbackCopy('EEXIST')).toBe(false);
    expect(shouldFallbackCopy(undefined)).toBe(false);
  });
});
