# @gagg/desktop — Launcher Electron

Launcher unificado de jogos (Windows). **Fase 0: fundação.**

> Este app é um produto próprio. Não é fork do Heroic Games Launcher nem do
> Playnite — reutiliza apenas sidecars CLI (Legendary/gogdl/Nile) quando
> configurados. Ver `docs/adr/0001-stack.md`.

## Rodar

Na raiz do monorepo:

```bash
npm install
npm run dev:desktop
```

O app abre em fullscreen com:

- botão **Abrir Notepad** (prova do IPC `launch:exe`)
- indicador de saúde do banco SQLite (`db:health`)

## Estrutura

```
src/
  main/        # processo principal: janela, IPC, DB
  preload/     # ponte seguro renderer ↔ main
  renderer/    # UI React
  shared/      # contrato de tipos do IPC
resources/bin/ # sidecars (não versionados)
```

## Scripts

| Script | O que faz |
|--------|-----------|
| `npm run dev:desktop` (raiz) | Builda `@gagg/core` e sobe o dev server |
| `npm run build:desktop` (raiz) | Builda core + desktop |
| `npm run typecheck` (raiz) | Typecheck desktop + core |
| `npm run smoke:sidecars` (raiz) | Verifica sidecars presentes |
