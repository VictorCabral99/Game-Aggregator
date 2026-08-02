# @gagg/desktop — Launcher de jogos (Electron)

Launcher unificado para Windows. **Não é um fork do Heroic**: reusa sidecars
(Legendary/gogdl/Nile) e provider próprio de Steam.

## Fase atual

- **Fase 0** ✅ fundação (monorepo, shell, IPC, SQLite)
- **Fase 1** ✅ MVP — biblioteca local de `.exe`, fullscreen, capas, instalador NSIS
- **Fase 2A** ✅ Steam — scan local (`libraryfolders.vdf`/`appmanifest_*.acf`) + `steam://rungameid`
- **Fase 2B–D** ✅ providers Epic (Legendary), GOG (gogdl) e Amazon (Nile) — dependem dos sidecars
- **Fase 2E** ✅ integração — Sync tudo, tela Providers, filtro por plataforma, About com atribuições
- **Fase 3** ✅ biblioteca unificada — canonical_games + game_sources (dedupe/auto-merge), capas offline em cache disco, gêneros, busca e filtros
- **Fase 4** ✅ consoles retro — entrada “Emulação” (tipo pasta) → consoles → jogos; pasta padrão drop-in por console; emulador relativo trocável; mapeamento manual de ROM; filtro Retro
- **Fase 5** ✅ experiência console/TV — navegação por controle (A/B/X/Y/Start/Select), modo TV com cursor oculto, seção “Continuar”, settings de UI (TV/fullscreen/sons) e sons opt-in
- **Fase 6** ✅ avaliações e rediscovery — notas RAWG/Metacritic/Steam (batch com cache TTL 7d), sort/filtro por nota, shelf “Esquecidos bem avaliados”, setting esconder notas
- **Fase 7+** em andamento

## Sidecars (Epic/GOG/Amazon)

Baixe os CLIs oficiais para `apps/desktop/resources/bin/` (fora do git):

```bash
node tools/scripts/fetch-sidecars.mjs        # baixa última release de cada
node tools/scripts/smoke-sidecars.mjs        # confere presença/versão
```

Depois autentique cada um no terminal: `legendary auth`, `gogdl auth`, `nile auth`.
Sem os binários, o app mostra a loja como “indisponível” sem quebrar.

## Rodar (dev)

```bash
npm install
npm run dev:desktop        # raiz do monorepo
```

App abre em fullscreen. Use `Ctrl+N` para adicionar um jogo.

## Testes/smokes

```bash
npm run typecheck            # tsc nos workspaces
npm run build -w @gagg/desktop
npm run smoke:sidecars       # verifica binários de loja (Fase 2)
node tools/scripts/repo-smoke.ts            # CRUD da biblioteca local
node tools/scripts/merge-smoke.ts           # auto-merge + separar (Fase 3)
node tools/scripts/normalize-smoke.ts       # normalizeTitle (Fase 3)
node tools/scripts/migration-upgrade-smoke.ts  # upgrade v2→v4 (Fase 3)
node tools/scripts/perf-filter-smoke.ts     # filtro 200 itens <300ms (Fase 3)
node tools/scripts/emulation-smoke.ts       # consoles retro + drop-in (Fase 4)
node tools/scripts/settings-smoke.ts        # settings UI (Modo TV/sons) (Fase 5)
node tools/scripts/ratings-smoke.ts         # notas RAWG/Steam + shelf (Fase 6)
```

## Notas (Fase 6)

- Botão **Sync notas** busca RAWG (nota da comunidade + Metacritic via detalhes) e % de
  reviews positivas da Steam (store API, sem key) para a biblioteca inteira.
- Concurrency 3 + cache `api_cache` no SQLite; TTL de 7 dias (2ª sync quase sem HTTP).
- Para RAWG, configure a **Chave RAWG** em Configurações (ou env `RAWG_API_KEY`).
- Grade mostra o score no card; ficha mostra breakdown por fonte e aviso quando stale (>7 dias).
- Sort por nota, filtro "Nota ≥ 80" e shelf "Esquecidos bem avaliados" (score ≥ 80, nunca jogado).
- Setting **Esconder notas** (`ui.hideRatings`) remove scores da UI.

## Emulação (Fase 4)

- Entrada **“Emulação”** no header → lista de consoles (NES, SNES, GBA, GB(C), Genesis, PS1, PS2).
- Cada console tem **pasta padrão** (drop-in): coloque ROMs válidos lá e escaneie —
  o app reconhece pela extensão e lista sozinho (scan automático ao abrir o console com pasta configurada).
- **Emulador relativo**: cada console tem opções pré-definidas (ex.: SNES via RetroArch `snes9x` ou bsnes);
  troque na tela do console e o launch passa a usar o novo, sem reimportar.
- Mapeamento manual de ROM (apontar arquivo) também disponível.
- Catálogo editável via `consoles.json`/`emulators.json` em `%APPDATA%/@gagg/desktop/`
  (se existirem, substituem o catálogo default em `src/main/emulation/catalog.ts`).
- Launch: RetroArch `-L core rom` / PCSX2 `-batch -- rom` / DuckStation `rom` (path do binário
  detectado em paths comuns ou configurável em `emulator.<id>.path` nas settings).
- Sem BIOS (PS2): mensagem de erro legível do emulador, sem crash.

## Instalador

```bash
npm run dist -w @gagg/desktop
```

Artefato em `apps/desktop/dist/Game Aggregator Launcher Setup <versão>.exe`.

## Estrutura

```
apps/desktop/
  src/main/           # window, IPC, db (node:sqlite), providers
  src/preload/        # bridge contextIsolation
  src/renderer/       # UI React
  src/shared/         # contrato IPC compartilhado (types)
  resources/bin/      # sidecars (Legendary, gogdl, Nile) — fora do git
  out/                # build electron-vite (gerado)
```

## Notas

- Banco: `%APPDATA%/@gagg/desktop/launcher.db` (WAL), migrações em
  `src/main/db/migrations.ts`.
- Capas servidas via protocolo `cover://img/<path>` (CSP `img-src` libera `cover:`).
