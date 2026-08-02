# @gagg/desktop — Launcher de jogos (Electron)

Launcher unificado para Windows. **Não é um fork do Heroic**: reusa sidecars
(Legendary/gogdl/Nile) e provider próprio de Steam.

**Guia do usuário:** [`docs/USER-GUIDE.md`](../../docs/USER-GUIDE.md)  
**SmartScreen:** [`docs/SMARTSCREEN.md`](../../docs/SMARTSCREEN.md)  
**Benchmark 1k:** [`docs/BENCHMARK-1K.md`](../../docs/BENCHMARK-1K.md)

## Status (v1.0.0)

Fases 0–9 implementadas: fundação → biblioteca local → lojas → dedupe → emulação →
TV/gamepad → notas → wishlist → perfis/Moonlight → polimento/distribuição.

## Rodar (dev)

```bash
npm install
npm run dev:desktop        # raiz do monorepo
```

## Build / instalador

```bash
npm run build:desktop
npm run dist -w @gagg/desktop   # NSIS em apps/desktop/dist
```

## Smokes úteis

```bash
npm run typecheck
node tools/scripts/phase8-smoke.ts
node tools/scripts/bench-1k-smoke.ts
node tools/scripts/wishlist-smoke.ts
node tools/scripts/settings-smoke.ts
```

## Sidecars (Epic/GOG/Amazon)

Baixe os CLIs oficiais para `apps/desktop/resources/bin/` (fora do git):

```bash
node tools/scripts/fetch-sidecars.mjs
node tools/scripts/smoke-sidecars.mjs
```

## Controles (resumo)

| Input | Ação |
|-------|------|
| A / Enter | Confirmar |
| B / Esc | Voltar |
| Y | Busca |
| Start | Configurações |
| Select | Emulação |

Detalhes em [`docs/USER-GUIDE.md`](../../docs/USER-GUIDE.md).
