# Benchmark — 1.000 jogos (Fase 9)

Script: `node tools/scripts/bench-1k-smoke.ts`

## O que mede

1. Seed de 1000 `game_sources` Steam via `upsertMany`
2. `LibraryRepository.list()`
3. Filtro de busca por tokens (mesmo algoritmo da toolbar)

## Metas

| Métrica | Meta | Notas |
|---------|------|-------|
| Filtro 1k | < 300 ms | igual Fase 3 (200 itens) |
| List 1k | < 500 ms | SQLite in-memory no smoke |
| UI | virtualizada | só ~N linhas visíveis no DOM (`VirtualizedGameGrid`) |

## Como rodar

```bash
node tools/scripts/bench-1k-smoke.ts
```

Saída esperada inclui `BENCH_1K_SMOKE_OK` e um JSON com `seedMs`, `listMs`, `filterMs`.
