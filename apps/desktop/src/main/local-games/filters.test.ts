import { describe, expect, it } from 'vitest';
import { isNonGameLocal } from './filters';

describe('isNonGameLocal', () => {
  it('marca utilitários Windows comuns pelo título', () => {
    expect(isNonGameLocal('Calculadora')).toBe(true);
    expect(isNonGameLocal('Notepad')).toBe(true);
    expect(isNonGameLocal('Bloco de Notas')).toBe(true);
    expect(isNonGameLocal('Paint')).toBe(true);
    expect(isNonGameLocal('Gerenciador de Tarefas')).toBe(true);
  });

  it('marca exes de utilitário pelo basename', () => {
    expect(isNonGameLocal('C:\\\\Windows\\\\System32\\\\calc.exe')).toBe(true);
    expect(isNonGameLocal('notepad.exe')).toBe(true);
    expect(isNonGameLocal('mspaint.exe')).toBe(true);
  });

  it('não marca jogos reais', () => {
    expect(isNonGameLocal('Minecraft')).toBe(false);
    expect(isNonGameLocal('Hades.exe')).toBe(false);
    expect(isNonGameLocal('D:\\\\Games\\\\Celeste\\\\Celeste.exe')).toBe(false);
  });
});
