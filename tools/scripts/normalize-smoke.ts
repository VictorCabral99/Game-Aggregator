// Teste unitário: normalizeTitle (P3-05).
// Uso: node tools/scripts/normalize-smoke.ts
import { normalizeTitle } from '../../packages/core/src/normalize.ts';

const cases: Array<[string, string]> = [
  ['The Witcher 3: Wild Hunt', 'the witcher 3 wild hunt'],
  ['The Witcher 3™', 'the witcher 3'],
  ['The Witcher 3®', 'the witcher 3'],
  ['Portal: Game of the Year Edition', 'portal'],
  ['Portal (GOTY)', 'portal'],
  ['Baldur’s Gate 3', 'baldurs gate 3'],
  ['Half-Life 2', 'half-life 2'],
  ['Cyberpunk 2077 (Deluxe Edition)', 'cyberpunk 2077'],
  ['Star Wars™ Jedi: Fallen Order', 'star wars jedi fallen order'],
  ['  Assassin\u2019s Creed  ', 'assassins creed'],
  ['Tomb Raider: Definitive Edition', 'tomb raider'],
  ['Hollow Knight: Complete Edition', 'hollow knight'],
  ['The Elder Scrolls V: Skyrim – Special Edition', 'the elder scrolls v skyrim'],
];

const assert = (cond: boolean, msg: string) => {
  if (!cond) throw new Error(`ASSERT FAIL: ${msg}`);
};

let failures = 0;
for (const [input, expected] of cases) {
  const got = normalizeTitle(input);
  if (got !== expected) {
    failures++;
    console.error(`FAIL: "${input}" → "${got}" (esperado "${expected}")`);
  }
}

assert(failures === 0, `${failures} falhas em ${cases.length} casos`);
console.log(`NORMALIZE_SMOKE_OK (${cases.length} casos)`);
