// Smoke: parser VDF com amostras reais de libraryfolders.vdf e appmanifest.acf.
// Uso: node tools/scripts/vdf-smoke.ts
import { libraryFoldersFromVdf, parseVdf, vdfGet, type VdfNode } from '../../apps/desktop/src/main/providers/vdf.ts';

const assert = (cond: boolean, msg: string) => {
  if (!cond) throw new Error(`ASSERT FAIL: ${msg}`);
};

const libraryVdf = String.raw`"libraryfolders"
{
	"ContentStatsID"		"-2176707962745905687"
	"0"
	{
		"path"		"C:\\Program Files (x86)\\Steam"
		"label"		""
		"contentid"		"-2147483647"
		"totalsize"		"0"
		"apps"
		{
			"570"		"2564936742"
			"730"		"3611815482"
		}
	}
	"1"
	{
		"path"		"D:\\SteamLibrary"
		"label"		"Jogos"
		"apps"
		{
			"8930"		"1"
		}
	}
}`;

const manifestAcf = `"AppState"
{
	"appid"		"730"
	"Universe"		"1"
	"name"		"Counter-Strike 2"
	"StateFlags"		"4"
	"installdir"		"Counter-Strike Global Offensive"
	"LastUpdated"		"1752810000"
	"UpdateResult"		"0"
	"SizeOnDisk"		"38846476800"
	"StagingSize"		"0"
	"buildid"		"15850238"
}`;

const root = parseVdf(libraryVdf);
const lib = root.libraryfolders as VdfNode;
const folders = libraryFoldersFromVdf(lib);
assert(folders.length === 2, `folders=${folders.length}`);
assert(folders[0].includes('Program Files (x86)'), 'folder0 path');
assert(folders[1] === 'D:\\SteamLibrary', 'folder1 path');

const app = parseVdf(manifestAcf);
const state = app.AppState as VdfNode;
assert(vdfGet(state, 'appid') === '730', 'appid');
assert(vdfGet(state, 'name') === 'Counter-Strike 2', 'name');
assert(vdfGet(state, 'installdir') === 'Counter-Strike Global Offensive', 'installdir');
assert(Number(vdfGet(state, 'SizeOnDisk')) === 38846476800, 'sizeOnDisk');

console.log('VDF_SMOKE_OK', JSON.stringify({ folders, size: vdfGet(state, 'SizeOnDisk') }));
