import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_GAMES_ROOT,
  folderNameFromTitle,
  isAlreadyStandard,
  platformDir,
  platformFolder,
  suggestedInstallPath,
} from './root';

describe('organize/root', () => {
  it('mapeia plataforma para pasta padrão', () => {
    expect(platformFolder('epic')).toBe('Epic');
    expect(platformFolder('gog')).toBe('GOG');
    expect(platformFolder('amazon')).toBe('Luna');
    expect(platformFolder('steam')).toBe('Steam');
    expect(platformFolder('local')).toBe('Outros');
  });

  it('monta platformDir sob a raiz', () => {
    expect(platformDir('C:\\Games', 'gog')).toBe(path.join('C:\\Games', 'GOG'));
    expect(platformDir(DEFAULT_GAMES_ROOT, 'amazon')).toBe(path.join(DEFAULT_GAMES_ROOT, 'Luna'));
  });

  it('sanitiza nome de pasta a partir do título', () => {
    expect(folderNameFromTitle('Cozy Grove')).toBe('Cozy Grove');
    expect(folderNameFromTitle('A:B/C?')).toBe('ABC');
    expect(folderNameFromTitle('  Moonscars  ')).toBe('Moonscars');
  });

  it('sugere path Epic/GOG/Luna/Outros como Loja\\Jogo', () => {
    expect(suggestedInstallPath('C:\\Games', 'epic', 'Cozy Grove')).toBe(
      path.join('C:\\Games', 'Epic', 'Cozy Grove')
    );
    expect(suggestedInstallPath('C:\\Games', 'gog', 'Moonscars')).toBe(
      path.join('C:\\Games', 'GOG', 'Moonscars')
    );
    expect(suggestedInstallPath('C:\\Games', 'local', 'Hytale')).toBe(
      path.join('C:\\Games', 'Outros', 'Hytale')
    );
  });

  it('sugere path Steam sob steamapps/common', () => {
    expect(suggestedInstallPath('C:\\Games', 'steam', 'Celeste', { steamInstallDir: 'Celeste' })).toBe(
      path.join('C:\\Games', 'Steam', 'steamapps', 'common', 'Celeste')
    );
  });

  it('detecta alreadyStandard quando path já está na pasta da loja', () => {
    expect(isAlreadyStandard('C:\\Games', 'gog', 'C:\\Games\\GOG\\Moonscars')).toBe(true);
    expect(isAlreadyStandard('C:\\Games', 'epic', 'C:\\Users\\Victor\\Games\\Heroic\\CozyGrove')).toBe(
      false
    );
    expect(
      isAlreadyStandard('C:\\Games', 'steam', 'C:\\Games\\Steam\\steamapps\\common\\Celeste')
    ).toBe(true);
  });
});
