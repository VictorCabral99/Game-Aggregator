# ADR 0001 — Stack e estratégia de base

**Data:** 2026-08-02
**Status:** Aceito

## Contexto

Queremos um launcher desktop unificado (Windows) que centralize Steam, Epic, GOG,
Amazon, jogos locais e emuladores, com foco em decisão de compra/jogo (ratings,
wishlist, preços) e UX estilo console. O repositório já tem um agregador web
(Next.js + Prisma + SQLite) com ratings/deals funcionando.

## Decisão

- **Desktop:** Electron + React + TypeScript + SQLite (`better-sqlite3`)
- **Produto próprio:** não forkar Heroic nem Playnite
- **Sidecars:** Legendary (Epic), gogdl (GOG), Nile (Amazon) — orquestrados pelo
  nosso main process, sem incorporar código-fonte GPL do Heroic
- **Steam:** provider próprio — scan local (`libraryfolders.vdf`,
  `appmanifest_*.acf`) + launch via `steam://rungameid/<appid>`
- **Domínio ratings/wishlist/deals:** extrair do `game-aggregator` web para
  packages compartilhados e reusar no desktop

## Consequências

- Footprint/RAM do Electron aceitos no MVP; reavaliar Tauri só se virar dor
  mensurável de produto
- GPL do Heroic não entra no repo; binários CLI têm atribuição no About
- Monorepo pnpm/npm workspaces com `apps/*` e `packages/*`
- Steam é prioridade de integração (maior biblioteca no Windows), depois
  Epic/GOG/Amazon
