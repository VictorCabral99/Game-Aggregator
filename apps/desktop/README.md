# @gagg/desktop — Launcher de jogos (Electron)

Launcher unificado para Windows. **Não é um fork do Heroic**: reusa sidecars
(Legendary/gogdl/Nile) e provider próprio de Steam.

## Fase atual

- **Fase 0** ✅ fundação (monorepo, shell, IPC, SQLite)
- **Fase 1** ✅ MVP — biblioteca local de `.exe`, fullscreen, capas, instalador NSIS
- **Fase 2** em andamento — Steam scan/launch, depois Epic/GOG/Amazon

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
