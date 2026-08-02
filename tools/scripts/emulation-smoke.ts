// Smoke Fase 4: consoles retro (modelo drop-in).
// - migration v5 (consoles + console_id)
// - upsertRom idempotente (drop-in) e listByConsole/countByConsole
// - removeRom sem apagar canonical órfão
// - cleanRomTitle a partir do filename
// Uso: node tools/scripts/emulation-smoke.ts
import { DatabaseSync } from 'node:sqlite';
import { applyMigrations } from '../../apps/desktop/src/main/db/migrations.ts';
import { LibraryRepository } from '../../apps/desktop/src/main/db/games.ts';
import { cleanRomTitle, isValidRom } from '../../apps/desktop/src/main/emulation/rom.ts';

const assert = (cond: boolean, msg: string) => {
  if (!cond) throw new Error(`ASSERT FAIL: ${msg}`);
};

const db = new DatabaseSync(':memory:');
applyMigrations(db);
const repo = new LibraryRepository(db);

// Migration v5: tabelas de console existem
const consolesCount = (db
  .prepare(`SELECT COUNT(*) AS n FROM consoles`)
  .get() as { n: number }).n;
assert(consolesCount === 7, `7 consoles seedados (achei ${consolesCount})`);
const optionsCount = (db
  .prepare(`SELECT COUNT(*) AS n FROM console_emulator_options`)
  .get() as { n: number }).n;
assert(optionsCount >= 10, `opções de emulador seedadas (achei ${optionsCount})`);

// Drop-in: 2 ROMs novos do SNES
repo.upsertRom('snes', 'D:\\Roms\\SNES\\Super Mario World (USA).smc', 'Super Mario World (USA)');
repo.upsertRom('snes', 'D:\\Roms\\SNES\\The Legend of Zelda - A Link to the Past (USA).sfc', 'The Legend of Zelda - A Link to the Past (USA)');
assert(repo.countByConsole('snes') === 2, `2 jogos no SNES (achei ${repo.countByConsole('snes')})`);

// Idempotência: re-scan não duplica
repo.upsertRom('snes', 'D:\\Roms\\SNES\\Super Mario World (USA).smc', 'Super Mario World (USA)');
assert(repo.countByConsole('snes') === 2, 're-scan idempotente');

// Source emulator com console_id e platform emulator
const snesGames = repo.listByConsole('snes');
assert(snesGames.every((g) => g.sources.some((s) => s.platform === 'emulator')), 'sources platform=emulator');
assert(
  snesGames.every((g) => g.sources.some((s) => s.consoleId === 'snes')),
  'sources com console_id=snes'
);

// cleanRomTitle
assert(cleanRomTitle('D:\\Roms\\SNES\\Super Mario World (USA).smc') === 'Super Mario World', 'titulo limpo sem No-Intro');
assert(cleanRomTitle('D:\\Roms\\GBA\\Zelda - Minish Cap (USA) [En].gba') === 'Zelda - Minish Cap', 'titulo limpo sem TOSEC');
assert(cleanRomTitle('D:\\Roms\\PS1\\Castlevania SOTN (USA) v1.1.cue') === 'Castlevania SOTN', 'titulo limpo sem revisão');
assert(cleanRomTitle('D:\\Roms\\PS2\\GTA San Andreas (USA).iso') === 'GTA San Andreas', 'titulo limpo simples');

// isValidRom por extensão
assert(isValidRom('a.smc', ['.smc', '.sfc']), 'smc válido no SNES');
assert(!isValidRom('a.iso', ['.smc', '.sfc']), 'iso inválido no SNES');

// ROMs de outro console não contaminam
repo.upsertRom('ps2', 'D:\\Roms\\PS2\\God of War (USA).iso', 'God of War (USA)');
assert(repo.countByConsole('ps2') === 1, '1 jogo no PS2');
assert(repo.countByConsole('snes') === 2, 'SNES não contaminado');

// removeRom tira do console e não deixa canonical órfão
const ps2Game = repo.listByConsole('ps2')[0];
const ps2Source = ps2Game.sources.find((s) => s.platform === 'emulator');
assert(ps2Source, 'source do PS2 existe');
repo.removeRom(ps2Source!.id);
assert(repo.countByConsole('ps2') === 0, 'PS2 vazio após removeRom');
assert(repo.list().length === 2, 'canonical órfão foi removido');

console.log('EMULATION_SMOKE_OK');
