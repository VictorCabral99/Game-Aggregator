import { describe, expect, it } from 'vitest';
import { ensureSteamLibraryInVdf } from './steam-library';

describe('organize/steam-library', () => {
  it('não altera VDF se a library já existe', () => {
    const vdf = `"libraryfolders"
{
	"0"
	{
		"path"		"C:\\\\Program Files (x86)\\\\Steam"
	}
	"1"
	{
		"path"		"C:\\\\Games\\\\Steam"
	}
}
`;
    const { changed, text } = ensureSteamLibraryInVdf(vdf, 'C:\\Games\\Steam');
    expect(changed).toBe(false);
    expect(text).toBe(vdf);
  });

  it('adiciona nova library folder no VDF', () => {
    const vdf = `"libraryfolders"
{
	"0"
	{
		"path"		"C:\\\\Program Files (x86)\\\\Steam"
	}
}
`;
    const { changed, text } = ensureSteamLibraryInVdf(vdf, 'C:\\Games\\Steam');
    expect(changed).toBe(true);
    expect(text).toContain('C:\\\\Games\\\\Steam');
    expect(text).toContain('"1"');
  });
});
