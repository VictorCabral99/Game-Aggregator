# Playbook de Execução — Launcher Unificado

**Complementa:** [`PLANEJAMENTO-LAUNCHER-UNIFICADO.md`](./PLANEJAMENTO-LAUNCHER-UNIFICADO.md)  
**Versão:** 1.0  
**Uso:** checklist operacional dia a dia. Só avance de fase quando o **gate 100% funcional** estiver verde.

---

## 0. Regras de operação

### 0.1 Gate “fase 100% funcional”

Uma fase só fecha quando **todos** os itens abaixo forem verdadeiros:

1. **Demo de valor:** alguém (você) usa o app e obtém o benefício da fase sem gambiarras manuais no código.
2. **DoD checklist:** 100% dos checkboxes da fase marcados.
3. **Teste de regressão da fase anterior:** o valor da fase N−1 continua intacto.
4. **Build rodável:** `npm run dev:desktop` (ou equivalente) e, a partir da Fase 1, instalador ou portable funcional.
5. **Sem débito bloqueante:** bugs P0 da fase corrigidos; P1 documentados no backlog com issue.
6. **Tag git:** `phase-N-done` (ex.: `phase-0-done`) no commit de fechamento.

**Proibido:** começar Fase N+1 “só um pouquinho” antes do gate. Spikes de pesquisa em branch separada são OK, sem merge na main da feature.

### 0.2 Como trabalhar cada dia

```
1. Abrir a tarefa do dia neste playbook
2. Implementar só o escopo da tarefa
3. Rodar o mini-teste da tarefa
4. Commit pequeno e descritivo
5. No fim do dia: atualizar checkboxes neste arquivo (ou issues)
```

### 0.3 Convenções de branch e commits

| Tipo | Branch |
|------|--------|
| Fase inteira | `feat/phase-0-foundation`, `feat/phase-1-mvp`, … |
| Hotfix pós-fase | `fix/phase-N-…` |

Commits: foco no *porquê* (`feat(desktop): launch exe via IPC for local library`).

### 0.4 Ambiente mínimo (preparar antes do Dia 1)

- [ ] Windows 10/11
- [ ] Node.js 20 LTS
- [ ] Git
- [ ] Editor (Cursor/VS Code)
- [ ] Conta Steam com ≥3 jogos instalados (para Fase 2)
- [ ] (Ideal) Epic + GOG com ≥1 jogo cada
- [ ] Chaves já usadas no web: RAWG, ITAD, Steam API — ver `CREDENCIAIS.md` (Fases 6–7)
- [ ] Controle XInput (Fase 5); pode comprar/pegar depois

### 0.5 Calendário sugerido (1 dev, ritmo sustentável)

| Fase | Duração | Janela típica |
|------|---------|---------------|
| 0 | 2–3 dias | Semana 1 (início) |
| 1 | 5–8 dias | Semana 1–2 |
| 2 | 10–15 dias | Semana 2–4 |
| 3 | 8–12 dias | Semana 4–5 |
| 4 | 5–8 dias | Semana 6 |
| 5 | 10–15 dias | Semana 6–8 |
| 6 | 5–8 dias | Semana 8–9 |
| 7 | 5–8 dias | Semana 9–10 |
| 8 | 8–12 dias | Semana 10–12 |
| 9 | 8–12 dias | Semana 12–14 |

**Meta v1 jogável+útil:** fechar Fases 0–7 (~10 semanas). Fases 8–9 = produto polido.

---

## Kickoff — começar amanhã (Fase 0)

### Dia 1 (amanhã) — fundação tocável

**Meta do dia:** app Electron abre fullscreen, botão “Abrir Notepad” funciona, ADR commitado.

| # | Tarefa | Tempo | Feito |
|---|--------|-------|-------|
| D1.1 | Criar branch `feat/phase-0-foundation` | 5 min | [ ] |
| D1.2 | Escrever `docs/adr/0001-stack.md` (texto abaixo) | 30–45 min | [ ] |
| D1.3 | Configurar workspaces no monorepo (`apps/*`, `packages/*`) sem quebrar `npm run dev` da web | 1–2 h | [ ] |
| D1.4 | Scaffold `apps/desktop` com electron-vite (React+TS) | 1–2 h | [ ] |
| D1.5 | Main: janela fullscreen / borderless; preload com `contextBridge` | 1 h | [ ] |
| D1.6 | IPC `launch:exe` → spawn `notepad.exe`; UI com botão + log de resultado | 1 h | [ ] |
| D1.7 | Commit + smoke manual | 30 min | [ ] |

**Texto mínimo do ADR (`docs/adr/0001-stack.md`):**

```md
# ADR 0001 — Stack e estratégia de base

## Status
Aceito (v1.1 do planejamento)

## Decisão
- Desktop: Electron + React + TypeScript + SQLite
- Produto próprio (não fork Heroic/Playnite)
- Sidecars: Legendary, gogdl, Nile
- Steam: scan local + steam://
- Domínio ratings/wishlist: extrair do game-aggregator web

## Consequências
- Footprint Electron aceito no MVP
- GPL do Heroic não entra no repo (só binários CLI com atribuição)
```

**Mini-teste Dia 1:**

1. `npm run dev -w apps/desktop` (ajustar script)
2. App abre ocupando a tela
3. Clicar “Abrir Notepad” → Notepad abre
4. Fechar app sem crash

### Dia 2 — core + SQLite + sidecar stub

| # | Tarefa | Tempo | Feito |
|---|--------|-------|-------|
| D2.1 | Criar `packages/core` com tipos `GameProvider`, `ProviderGame`, `CanonicalGame` (stubs) | 1–2 h | [ ] |
| D2.2 | Registry vazio `ProviderRegistry.register/get/list` | 1 h | [ ] |
| D2.3 | SQLite em `%APPDATA%/game-aggregator/launcher.db` via better-sqlite3; migration inicial (`app_settings`, `schema_version`) | 2 h | [ ] |
| D2.4 | IPC `db:health` → `{ ok: true, path, version }` | 30 min | [ ] |
| D2.5 | Pasta `apps/desktop/resources/bin/` + README “sidecars aqui” | 20 min | [ ] |
| D2.6 | Script `tools/scripts/smoke-sidecars.mjs`: se `legendary` no PATH, printa versão; senão exit 0 com warning | 1 h | [ ] |
| D2.7 | `apps/desktop/README.md`: como rodar; “não é fork do Heroic” | 30 min | [ ] |

**Mini-teste Dia 2:** UI mostra path do DB e `ok`; smoke script roda sem quebrar CI local.

### Dia 3 — fechar gate Fase 0

| # | Tarefa | Tempo | Feito |
|---|--------|-------|-------|
| D3.1 | Scripts root: `dev:desktop`, `build:desktop`, `typecheck` | 1 h | [ ] |
| D3.2 | Garantir web ainda sobe (`npm run dev`) | 30 min | [ ] |
| D3.3 | Atualizar `CREDENCIAIS.md` com seção “Desktop (futuro)” | 30 min | [ ] |
| D3.4 | Rodar **Gate Fase 0** completo (abaixo) | 1 h | [ ] |
| D3.5 | Tag `phase-0-done` + merge/PR | 30 min | [ ] |

---

## Fase 0 — Fundação

### Valor demonstrável
Dev sobe o shell desktop, lança um exe de teste, vê DB saudável. Estratégia documentada.

### Fora de escopo (congelado)
Biblioteca real, lojas, ratings, UI bonita, instalador.

### Tarefas (ordem)

| ID | Tarefa | Critério de pronto da tarefa |
|----|--------|------------------------------|
| P0-01 | ADR 0001 | Arquivo em `docs/adr/` |
| P0-02 | Workspaces monorepo | Web e desktop no mesmo repo |
| P0-03 | Scaffold Electron | Dev server renderer + main |
| P0-04 | Fullscreen window | `fullscreen` ou borderless + maximize |
| P0-05 | IPC launch exe | Notepad ou path configurável |
| P0-06 | `packages/core` tipos + registry | Importável pelo desktop |
| P0-07 | SQLite + migration | Arquivo criado no APPDATA |
| P0-08 | Sidecar smoke stub | Script documentado |
| P0-09 | README desktop | Outro dev consegue rodar em 10 min |
| P0-10 | Typecheck/build scripts | `typecheck` passa |

### Artefatos esperados

```
docs/adr/0001-stack.md
apps/desktop/
  electron/main.ts
  electron/preload.ts
  electron/ipc/launch.ts
  electron/db/index.ts
  src/App.tsx
  resources/bin/README.md
  README.md
packages/core/
  src/types.ts
  src/registry.ts
  package.json
tools/scripts/smoke-sidecars.mjs
```

### Gate 100% funcional — Fase 0

- [ ] ADR publicado
- [ ] App fullscreen + launch Notepad
- [ ] DB health OK após restart
- [ ] `packages/core` compila e é importado
- [ ] Smoke sidecars documentado
- [ ] Web não quebrou
- [ ] Tag `phase-0-done`

### Regressão
N/A (primeira fase).

---

## Fase 1 — MVP funcional (jogos locais)

### Valor demonstrável
Usuário instala/abre o launcher, adiciona 3 `.exe`, joga, fecha o app, reabre e a biblioteca continua lá — tudo em fullscreen.

### Pré-requisitos
Fase 0 tagged. 3 exes seguros para teste (Notepad, Calculator, um jogo leve ou `mspaint.exe`).

### Fora de escopo
Steam/Epic/GOG/Amazon, emuladores, notas, wishlist, gamepad completo, dedupe.

### Breakdown por dias

#### Dias 1–2 — modelo + CRUD biblioteca

| ID | Tarefa | Detalhe |
|----|--------|---------|
| P1-01 | Schema SQLite | Tabelas mínimas: `games` (`id`, `title`, `executable`, `cwd`, `cover_path`, `created_at`, `updated_at`, `last_played_at`) — ainda sem CanonicalGame completo |
| P1-02 | `LocalLibraryRepository` | add / list / update / remove (soft ou hard delete só da DB) |
| P1-03 | IPC | `library:list`, `library:add`, `library:update`, `library:remove`, `library:pick-exe` (dialog) |
| P1-04 | Dialog nativo | `dialog.showOpenDialog` filtro `.exe` |

**Mini-teste:** adicionar/remover via DevTools ou UI crua; DB persiste.

#### Dias 3–4 — UI grade + detalhe + jogar

| ID | Tarefa | Detalhe |
|----|--------|---------|
| P1-05 | Tela LibraryGrid | cards com título; empty state “Adicione um jogo” |
| P1-06 | Modal/página AddGame | campos: título (auto do filename), path, cwd opcional, capa opcional |
| P1-07 | Tela GameDetail | botão Jogar / Editar / Remover |
| P1-08 | Launch real | `spawn` detached com `cwd`; registrar `last_played_at` |
| P1-09 | Confirmação ao remover | “Remove da biblioteca, não apaga arquivos” |

**Mini-teste:** 3 exes lançam; last played atualiza.

#### Dias 5–6 — fullscreen polish + capas + teclado

| ID | Tarefa | Detalhe |
|----|--------|---------|
| P1-10 | Boot fullscreen | setting `startFullscreen` default true |
| P1-11 | Capa | escolher imagem local OU URL; copiar para `%APPDATA%/.../covers/` |
| P1-12 | Atalhos teclado | `Enter` jogar (focado), `Delete` remover com confirm, `Ctrl+N` adicionar |
| P1-13 | Tratamento de erro | exe faltando → toast “arquivo não encontrado” |

#### Dias 7–8 — instalador + gate

| ID | Tarefa | Detalhe |
|----|--------|---------|
| P1-14 | electron-builder NSIS | artefato em `dist/` |
| P1-15 | Teste VM/máquina limpa | instalar, adicionar jogo, relaunch |
| P1-16 | Gate Fase 1 + tag | `phase-1-done` |

### Artefatos

```
apps/desktop/electron/db/migrations/001_games.sql
apps/desktop/electron/providers/local-exe.ts
apps/desktop/electron/ipc/library.ts
apps/desktop/src/features/library/*
apps/desktop/electron-builder.yml
```

### Script de teste manual (obrigatório no gate)

1. Instalar/abrir app em fullscreen.  
2. Adicionar `notepad.exe`, `calc.exe`, `mspaint.exe` (ou 3 jogos).  
3. Renomear um título; setar capa em um.  
4. Jogar os 3.  
5. Remover um — arquivo ainda existe no disco.  
6. Fechar app, reabrir → 2 restantes + capas + last played.  
7. Mover/renomear um exe no disco → Jogar mostra erro claro.  
8. Instalar via NSIS em outro user/VM e repetir passos 2–4.

### Gate 100% funcional — Fase 1

- [ ] CRUD completo persistente
- [ ] ≥3 exes lançam com cwd correto quando necessário
- [ ] Fullscreen no boot
- [ ] Remover ≠ apagar disco
- [ ] Erro de path ausente tratado
- [ ] NSIS (ou portable) validado
- [ ] Regressão Fase 0: IPC launch ainda ok
- [ ] Tag `phase-1-done`

### Não começar Fase 2 se
Instalador quebra, ou biblioteca não persiste, ou launch só funciona no `npm run dev`.

---

## Fase 2 — Plataformas (Steam → Epic → GOG → Amazon)

### Valor demonstrável
Um sync popula a grade com jogos Steam instalados; um clique joga via Steam. Em seguida Epic/GOG/Amazon aparecem com badge e launch quando sidecars OK.

### Pré-requisitos
Fase 1 done. Steam instalado com jogos. Legendary/gogdl/Nile baixáveis (documentar URLs de release).

### Fora de escopo
Dedupe cross-store, install/update queue, ratings, wishlist, UI Heroic, Luna.

### Sub-fases (cada uma entregável e testável)

> A Fase 2 só fecha no gate final, mas **cada sub-fase deve ficar utilizável** antes da próxima (merge interno OK).

---

### Fase 2.A — Steam (dias 1–4) — *obrigatória*

| ID | Tarefa | Detalhe |
|----|--------|---------|
| P2A-01 | Detectar Steam | Registry `HKCU/HKLM\Software\Valve\Steam` → `SteamPath`; fallback paths comuns |
| P2A-02 | Parse `libraryfolders.vdf` | Listar todos os library folders |
| P2A-03 | Parse `appmanifest_*.acf` | `appid`, `name`, `installdir`, `SizeOnDisk`, playtime se existir |
| P2A-04 | `SteamProvider.scan()` | Retorna `ProviderGame[]` só instalados |
| P2A-05 | Merge na library UI | Jogos Steam na grade com badge Steam (ainda podem ser “sources” flat) |
| P2A-06 | Launch | `shell.openExternal('steam://rungameid/' + appid)` |
| P2A-07 | Settings | Path Steam override manual |
| P2A-08 | Diagnóstico | “Steam: N jogos · path · último scan” |
| P2A-09 | Botão Sync | Rescan sem reiniciar app |

**Gate 2.A (interno):**

- [ ] ≥5 jogos Steam listados (ou todos se tiver menos)
- [ ] Launch abre o jogo (ou cliente Steam pedindo install)
- [ ] Steam ausente → estado “não encontrado”, app não crasha
- [ ] Jogos locais da Fase 1 continuam na grade

**Commit/tag sugerido:** `phase-2a-steam`

---

### Fase 2.B — Epic / Legendary (dias 5–8)

| ID | Tarefa | Detalhe |
|----|--------|---------|
| P2B-01 | Pin Legendary | Baixar release Windows; colocar em `resources/bin/legendary.exe`; versão no README |
| P2B-02 | `runSidecar('legendary', args)` | timeout, capture stdout/stderr, no shell injection |
| P2B-03 | Auth flow | Documentar `legendary auth` (usuário loga uma vez no terminal ou wizard mínimo colando status) |
| P2B-04 | `legendary list-installed --json` | Parse → ProviderGame |
| P2B-05 | Launch | `legendary launch <app_name>` |
| P2B-06 | Fallback | Se sidecar falhar: botão “Abrir Epic Launcher” |
| P2B-07 | Diagnóstico | versão legendary + last error |

**Gate 2.B:**

- [ ] ≥1 jogo Epic lista e lança
- [ ] Sem Legendary: mensagem clara + fallback
- [ ] Steam + local intactos

---

### Fase 2.C — GOG / gogdl (dias 9–11)

| ID | Tarefa | Detalhe |
|----|--------|---------|
| P2C-01 | Pin gogdl | `resources/bin` + atribuição licença |
| P2C-02 | Auth/list | Seguir docs gogdl; ou fallback Galaxy DB se auth atrasar |
| P2C-03 | Launch | via gogdl ou path do exe instalado |
| P2C-04 | Badge GOG + diagnóstico | |

**Gate 2.C:** ≥1 jogo GOG ou estado indisponível explícito (se não houver conta/jogos, documentar evidência do fallback).

---

### Fase 2.D — Amazon / Nile (dias 12–13)

| ID | Tarefa | Detalhe |
|----|--------|---------|
| P2D-01 | Pin Nile | |
| P2D-02 | List/launch | |
| P2D-03 | Placeholder Luna | Flag UI “em breve”, sem código de stream |

**Gate 2.D:** Nile OK ou “indisponível”; app estável.

---

### Fase 2.E — Integração UI + gate final (dias 14–15)

| ID | Tarefa | Detalhe |
|----|--------|---------|
| P2E-01 | Sync all | `Promise.allSettled` por provider — botão "Sync tudo" + `providers:sync-all` |
| P2E-02 | Tela Providers | status cards (disponível, versão sidecar, path, jogos, último scan, erro) |
| P2E-03 | Filtro rápido por plataforma | chips Todos/Local/Steam/Epic/GOG/Amazon com contagem |
| P2E-04 | Atribuições About | Legendary, gogdl, Nile + links; declaração "não é fork do Heroic" |
| P2E-05 | Garantir zero código Heroic vendored | `rg` — só referências/docs/comentários, sem código-fonte |
| P2E-06 | Gate final + tag `phase-2-done` | Ver abaixo |

### Modelo de dados nesta fase

Ainda pode ser flat (`games` + `platform` + `external_id`). Introdução de `GameSource` pode começar aqui se facilitar, mas **CanonicalGame/dedupe é Fase 3**. Se flat: unique `(platform, external_id)`.

### Script de teste manual — Fase 2

1. Máquina com Steam: Sync → jogos aparecem → launch 2 títulos.  
2. Desligar Steam path (settings inválido) → erro localizado; local games OK.  
3. Legendary auth + list-installed + launch 1 Epic.  
4. GOG e Amazon: sucesso ou empty state honesto.  
5. Sync all com um sidecar quebrado (renomear exe) → outros providers OK.  
6. Reiniciar app → biblioteca de lojas persiste (re-scan ou cache local).  
7. About mostra atribuições.

### Gate 100% funcional — Fase 2

- [ ] 2.A–2.E verdes
- [ ] Steam launch OK
- [ ] Epic launch OK (ou doc + issue se conta indisponível — preferir OK real)
- [ ] GOG + Amazon: OK ou indisponível claro
- [ ] Diagnóstico por provider
- [ ] Sem código-fonte Heroic no repo
- [ ] Regressão Fase 1 (CRUD local)
- [ ] Tag `phase-2-done`

---

## Fase 3 — Biblioteca unificada inteligente

### Valor demonstrável
O mesmo jogo no Steam e na Epic aparece **uma vez**; duas sources no detalhe; capas offline; busca/filtro rápidos.

### Pré-requisitos
≥1 jogo duplicado entre lojas (ou fixture de teste com dois `GameSource` manuais). RAWG key.

### Fora de escopo
Ratings na UI (só capa/metadata básica), emuladores, wishlist.

### Breakdown

#### Bloco A — modelo Canonical (dias 1–3)

| ID | Tarefa |
|----|--------|
| P3-01 | Migrar schema: `canonical_games`, `game_sources` (ver planejamento §2.4) |
| P3-02 | Migration dos dados flat → sources + canonical 1:1 |
| P3-03 | UI detalhe lista sources com botão Jogar por source |
| P3-04 | Preferência de launch: última source usada / instalada |

#### Bloco B — matching (dias 4–6)

| ID | Tarefa |
|----|--------|
| P3-05 | `normalizeTitle()` + testes unitários (casos: ™, GOTY, -: ) |
| P3-06 | Auto-merge por steamAppId / gogId / epic id quando metadata tiver |
| P3-07 | Auto-merge por título exact normalizado (threshold estrito) |
| P3-08 | Fila de “possíveis duplicatas” (fuzzy) — UI aprovar/rejeitar |
| P3-09 | Ação Separar merge |

#### Bloco C — arte e organização (dias 7–10)

| ID | Tarefa |
|----|--------|
| P3-10 | Download capa Steam CDN ou RAWG → cache disco |
| P3-11 | Offline: grade usa só cache |
| P3-12 | Gêneros (RAWG) opcional + filtro |
| P3-13 | Busca nome (includes / simples fuzzy) |
| P3-14 | Filtro plataforma / instalado |
| P3-15 | Perf: filtro <300ms em 200 itens (gerar seed se preciso) |

### Script de teste

1. Ter Witcher 3 (ou similar) em 2 lojas → 1 card, 2 sources.  
2. Aprovar fuzzy errado e Separar → 2 cards de novo.  
3. Airplane mode: capas já baixadas aparecem.  
4. Buscar e filtrar por Steam.  
5. Launch a partir de cada source.

### Gate 100% funcional — Fase 3

- [ ] Dedupe real em caso conhecido
- [ ] Separar/aprovar funcionam
- [ ] Capas offline
- [ ] Busca + filtros
- [ ] Launch multi-source
- [ ] Regressão sync providers
- [ ] Tag `phase-3-done`

---

## Fase 4 — Emuladores e retro

### Valor demonstrável
Pasta de ROMs SNES importada; A abre no RetroArch com core certo; filtro “SNES”.

### Pré-requisitos
RetroArch instalado + ≥1 core; pasta com ROMs de teste (legais do usuário). Segundo emulador (PCSX2 ou DuckStation).

### Fora de escopo
Scraper completo, netplay, distribuição de BIOS/ROMs.

### Breakdown

| ID | Tarefa |
|----|--------|
| P4-01 | `emulators.json` schema: id, binaryPath, argsTemplate, systems[] |
| P4-02 | UI Settings → Emulators (add RetroArch path) |
| P4-03 | Mapa extensão → sistema → core (`*.smc` → snes → `snes9x_libretro.dll`) |
| P4-04 | Import folder: walk files, criar GameSource `emulator` |
| P4-05 | Launch: `"$retroarch" -L "$core" "$rom"` |
| P4-06 | Segundo perfil emulador (PCSX2: `pcsx2-qt.exe -batch -- "%rom%"`) |
| P4-07 | Filtro/categoria por sistema |
| P4-08 | Import async + progress para pastas grandes |
| P4-09 | Título limpo a partir do filename |

### Script de teste

1. Configurar RetroArch + core SNES.  
2. Importar pasta → N jogos.  
3. Launch 1 ROM.  
4. Configurar 2º emulador + 1 ROM.  
5. Filtro por sistema.  
6. Sem BIOS (PS2): erro legível, não crash.

### Gate 100% funcional — Fase 4

- [ ] Import + launch RetroArch
- [ ] Segundo emulador OK
- [ ] Filtro sistema
- [ ] Lojas/local intactos
- [ ] Tag `phase-4-done`

---

## Fase 5 — Experiência console / TV

### Valor demonstrável
Desplug mouse. Com controle: abrir app → navegar grade → detalhe → jogar → voltar. Cursor some. Modo TV no boot.

### Pré-requisitos
Biblioteca com ≥20 itens. Controle XInput. Monitor/TV 1080p se possível.

### Fora de escopo
Perfis multi-device (Fase 8), voice, temas complexos.

### Breakdown

| ID | Tarefa |
|----|--------|
| P5-01 | Spike 0.5 dia: lib spatial nav vs engine próprio — ADR curto 0002 |
| P5-02 | Focus engine: grade 2D, detalhe, settings, modais |
| P5-03 | Mapa botões: A confirm/play, B back, X options, Y search, Start settings |
| P5-04 | Stick + D-pad; repeat delay |
| P5-05 | Last input device wins (mouse vs gamepad) |
| P5-06 | UI TV: type scale, 5–6 colunas max @1080p, safe margin 5% |
| P5-07 | Hide cursor após 3s inatividade (modo TV) |
| P5-08 | Seção “Continuar / Recentes” no topo |
| P5-09 | Setting “Modo TV / iniciar fullscreen” |
| P5-10 | Sons UI opt-in (3 sons: move, select, back) |
| P5-11 | Checklist acessibilidade: foco visível 3:1 |

### Script de teste (sem mouse)

1. Boot modo TV.  
2. Navegar 10 jogos, abrir detalhe, voltar.  
3. Abrir busca (Y), filtrar, jogar.  
4. Abrir settings (Start), mudar opção, voltar.  
5. Plug mouse: foco não “pula” de forma quebrada.  
6. 4K e 1080p: nada cortado nas bordas.

### Gate 100% funcional — Fase 5

- [ ] Fluxo completo só controle
- [ ] Recentes no topo
- [ ] Modo TV persiste
- [ ] Foco sempre visível
- [ ] Regressão launch
- [ ] Tag `phase-5-done`

---

## Fase 6 — Avaliações e rediscovery

### Valor demonstrável
Ordenar por nota; prateleira “Esquecidos bem avaliados” mostra jogo 85+ com 0h; offline após sync.

### Pré-requisitos
Fase 3 (canonical). Keys RAWG (+ Steam API se reviews %). Reusar `src/lib/rawg-api.ts`, `aggregation.ts`.

### Fora de escopo
Wishlist/deals, reviews textuais UGC.

### Breakdown

| ID | Tarefa |
|----|--------|
| P6-01 | Mover/adaptar clients RAWG/Metacritic → `packages/providers-meta` |
| P6-02 | Tabelas `ratings` + `api_cache` |
| P6-03 | Job batch enrich (concurrency 2–3, TTL 7d) |
| P6-04 | Steam percentPositive (store API ou scrape estável — preferir API) |
| P6-05 | UI ficha: scores + breakdown |
| P6-06 | Sort: note, name, playtime, size, requirements tier |
| P6-07 | Filtros: nota≥80, never played, not played 6m |
| P6-08 | Shelf “Esquecidos bem avaliados” (score≥80 & playtime≤60min) |
| P6-09 | Setting esconder notas |
| P6-10 | Indicador “notas de DD/MM” stale |

### Script de teste

1. Sync notas em lib de 30+ jogos.  
2. Contar chamadas HTTP na 2ª sync (deve cair via cache).  
3. Ordenar por nota; validar top.  
4. Encontrar item na shelf esquecidos.  
5. Offline: sort/filtros funcionam.  
6. Jogo sem dados: “Sem avaliação”, não 0 falso.

### Gate 100% funcional — Fase 6

- [ ] ≥90% tentados têm nota ou “sem dados”
- [ ] Sorts offline
- [ ] Shelf útil com caso real
- [ ] Cache eficaz
- [ ] Regressão TV/gamepad na ficha
- [ ] Tag `phase-6-done`

---

## Fase 7 — Wishlist e promoções

### Valor demonstrável
Wishlist com 5 jogos; preço + historical low; alerta ao simular preço alvo; clique abre loja.

### Pré-requisitos
ITAD key. Fase 6 desejável. Reusar `itad-api.ts`.

### Fora de escopo
Checkout in-app, auto-purchase.

### Breakdown

| ID | Tarefa |
|----|--------|
| P7-01 | Schema `wishlist_entries`, `price_snapshots` |
| P7-02 | Add manual (busca título ITAD/RAWG) + desambiguação |
| P7-03 | Import wishlist Steam (API/perfil — padrão web) |
| P7-04 | Batch preços ITAD + cache 6–12h |
| P7-05 | UI lista: preço, cut, low, shop |
| P7-06 | Open offer URL / steam:// |
| P7-07 | Target price + alert in-app |
| P7-08 | Notificação Windows (electron Notification) opt-in |
| P7-09 | Preferred stores por item |
| P7-10 | Sync periódico com app aberta |

### Script de teste

1. Add 5 jogos; sync preços.  
2. Ver historical low preenchido quando ITAD tiver.  
3. Set target alto → alerta dispara (ou mock snapshot).  
4. Clique oferta → browser/Steam.  
5. 2º sync: poucas chamadas HTTP.  
6. Import Steam wishlist (se key/perfil OK).

### Gate 100% funcional — Fase 7

- [ ] Wishlist CRUD + preços
- [ ] Historical low visível quando existir
- [ ] Alerta testado
- [ ] Links corretos
- [ ] Cache OK
- [ ] Biblioteca/ratings intactos
- [ ] Tag `phase-7-done`

---

## Fase 8 — Avançado (perfis, streaming, presets)

### Valor demonstrável
Trocar perfil TV vs Desk muda UI; atalho Moonlight inicia; preset `-fullscreen` em um jogo local; app offline joga igual.

### Pré-requisitos
Fases 5–7 estáveis. Moonlight opcional (senão mock “app not found”).

### Breakdown

| ID | Tarefa |
|----|--------|
| P8-01 | Profiles: `desk` / `tv` / `handheld` em settings |
| P8-02 | Tokens de layout por profile |
| P8-03 | Moonlight: path + host + launch args |
| P8-04 | Badge “Remote” opcional em games |
| P8-05 | Per-game launch args preset (opt-in) |
| P8-06 | Cloud sync opcional (API web) — pode ser MVP: export/import JSON se OAuth pesado |
| P8-07 | Garantir offline-first |

### Gate 100% funcional — Fase 8

- [ ] Troca de perfil visível
- [ ] Moonlight ou empty state claro
- [ ] 1 preset documentado funcionando
- [ ] Offline launch OK
- [ ] Tag `phase-8-done`

---

## Fase 9 — Polimento e distribuição

### Valor demonstrável
Cold start aceitável; onboarding Steam; settings completos; update de N-1→N; README de usuário.

### Breakdown

| ID | Tarefa |
|----|--------|
| P9-01 | Virtualizar grade (react-window / tanstack virtual) |
| P9-02 | Profile startup; meta <2s até interativo |
| P9-03 | Onboarding: detectar Steam → CTA sync |
| P9-04 | Settings IA completa (paths, keys, cache clear, idioma, TV, sons) |
| P9-05 | electron-updater + changelog |
| P9-06 | Sentry opt-in |
| P9-07 | Assinatura código (se certificado); senão doc SmartScreen |
| P9-08 | README usuário + atalhos controle |
| P9-09 | Benchmark 1k jogos (seed) documentado |
| P9-10 | Tag `v1.0.0` + `phase-9-done` |

### Gate 100% funcional — Fase 9 / v1.0

- [ ] Checklist UX TV + mouse
- [ ] Benchmark documentado
- [ ] Upgrade N-1→N testado
- [ ] Settings cobrem keys/paths
- [ ] Release notes
- [ ] Regressão Fases 1–7 no smoke final

### Smoke final (release)

1. Install clean → onboarding → Steam sync → launch.  
2. Só controle: jogar.  
3. Ordenar por nota → shelf esquecidos.  
4. Wishlist → abrir oferta.  
5. Import ROM → launch.  
6. Airplane mode: lib + launch local.  
7. Update path (se houver).

---

## Apêndice A — Matriz de regressão rápida

Antes de taguear qualquer fase ≥1, rodar o que já existir:

| Check | P1 | P2 | P3 | P4 | P5 | P6 | P7 |
|-------|----|----|----|----|----|----|-----|
| Add/launch local exe | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Steam scan/launch | | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Dedupe 2 sources | | | ✓ | ✓ | ✓ | ✓ | ✓ |
| ROM launch | | | | ✓ | ✓ | ✓ | ✓ |
| Gamepad only flow | | | | | ✓ | ✓ | ✓ |
| Sort by rating | | | | | | ✓ | ✓ |
| Wishlist price | | | | | | | ✓ |

---

## Apêndice B — Bugs: severidade

| Sev | Definição | Antes do gate |
|-----|-----------|---------------|
| P0 | Crash, perda de dados, launch quebrado no happy path | **Deve corrigir** |
| P1 | Feature da fase degradada com workaround | Corrigir ou issue+waiver explícito |
| P2 | Cosmético / edge | Backlog |

---

## Apêndice C — Template de fechamento de fase

Copiar no PR de fechamento:

```md
## Phase N done

### Demo
- [descrever 3 passos da demo de valor]

### DoD
- [ ] todos os checkboxes do playbook Phase N

### Regressão
- [ ] matriz apêndice A até Phase N

### Known issues
- P1/P2 listados com links

### Tag
phase-N-done
```

---

## Apêndice D — Ordem de leitura

1. Este playbook (execução)  
2. [PLANEJAMENTO-LAUNCHER-UNIFICADO.md](./PLANEJAMENTO-LAUNCHER-UNIFICADO.md) (arquitetura / decisões)  
3. [CREDENCIAIS.md](./CREDENCIAIS.md) (keys)  
4. ADRs em `docs/adr/`

---

*Ao iniciar o Dia 1: abrir só a seção Kickoff + Fase 0. Ignorar o resto até o gate fechar.*
