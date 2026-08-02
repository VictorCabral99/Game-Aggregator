# @gagg/desktop — Launcher de jogos (Electron)

Launcher unificado para Windows. **Não é um fork do Heroic**: reusa sidecars
(Legendary/gogdl/Nile) e provider próprio de Steam.

## Fase atual

- **Fase 0** ✅ fundação (monorepo, shell, IPC, SQLite)
- **Fase 1** ✅ MVP — biblioteca local de `.exe`, fullscreen, capas, instalador NSIS
- **Fase 2A** ✅ Steam — scan local (`libraryfolders.vdf`/`appmanifest_*.acf`) + `steam://rungameid`
- **Fase 2B–D** ✅ providers Epic (Legendary), GOG (gogdl) e Amazon (Nile) — dependem dos sidecars
- **Fase 3+** em andamento — normalização, capas/metadados

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
node tools/scripts/repo-smoke.ts   # CRUD da biblioteca local
```

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
