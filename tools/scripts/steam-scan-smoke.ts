// Smoke: SteamProvider.scan() contra um fixture local (Steam fake em tools/fixtures).
// Uso: node tools/scripts/steam-scan-smoke.ts [caminho-do-fixture]
import { SteamProvider } from '../../apps/desktop/src/main/providers/steam.ts';

const fixture = process.argv[2] ?? 'tools/fixtures/fake-steam';

const store = new Map<string, string>();
const provider = new SteamProvider({
  get: (k) => store.get(k) ?? null,
  set: (k, v) => void store.set(k, v),
});

provider.setPathOverride(fixture);
const detect = provider.detectPath();
console.log('detectPath:', detect);
if (!detect) {
  console.log('STEAM_SMOKE_FAIL: fixture não detectado');
  process.exit(1);
}

const games = await provider.scan();
console.log(`STEAM_SMOKE_OK: ${games.length} jogos detectados`);
for (const g of games) {
  console.log('  -', g.title, '| appid', g.externalId, '| size', g.sizeBytes, '|', g.installPath ?? '');
}

const assert = (cond: boolean, msg: string) => {
  if (!cond) throw new Error(`ASSERT FAIL: ${msg}`);
};
assert(games.length === 3, 'esperado 3 jogos (730, 8930, 570)');
assert(games.some((g) => g.externalId === '570' && g.title === 'Dota 2'), 'jogo da pasta secundária');
