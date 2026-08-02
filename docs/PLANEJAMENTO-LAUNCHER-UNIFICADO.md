# Planejamento Técnico e de Produto — Launcher de Jogos Unificado (Windows)

**Projeto:** Game Aggregator → Unified Game Launcher  
**Plataforma-alvo inicial:** Windows 10/11  
**Documento:** v1.2  
**Status:** Planejamento + execução pronta (começar Fase 0)

| Documento | Função |
|-----------|--------|
| **Este arquivo** | Visão, arquitetura, stack, fases (o quê / por quê) |
| [`PLAYBOOK-EXECUCAO-LAUNCHER.md`](./PLAYBOOK-EXECUCAO-LAUNCHER.md) | Tarefas dia a dia, testes manuais, gates 100% funcionais (como / quando) |
| [`CREDENCIAIS.md`](./CREDENCIAIS.md) | Keys e logins de APIs/lojas |
| `docs/adr/` | Decisões registradas (começar por `0001-stack.md` no Dia 1) |

### Decisão estratégica (v1.1 — mantida)

| Decisão | Escolha |
|---------|---------|
| Base do produto | **App próprio** — não fork hard de Heroic nem Playnite |
| Stack desktop | **Electron + React + TypeScript** (velocity; alinha com o repo e com o ecossistema Heroic) |
| Epic / GOG / Amazon | **Reusar backends** Legendary, gogdl e Nile (mesma infra do Heroic), sem herdar a UI/filosofia deles |
| Steam | **Provider próprio**: scan local + launch via `steam://` |
| Cérebro de decisão | **`game-aggregator` atual** (ratings, wishlist, ITAD) extraído para packages compartilhados |
| Diferencial | Rediscovery por notas + wishlist/promoções + UX console/TV — não “mais um cliente de loja” |

**Regra de ouro:** tratar o [Heroic Games Launcher](https://github.com/Heroic-Games-Launcher/HeroicGamesLauncher) como **fornecedor de infraestrutura de loja** (CLIs/padrão Runner), não como base do produto. Detalhes na [seção 6](#6-estratégia-de-base-produto-próprio--backends-heroic--não-fork).

### Regra de entrega (v1.2)

Cada fase termina **100% funcional** ou não termina:

1. Demo de valor usável sem gambiarra  
2. DoD do playbook 100% verde  
3. Regressão da fase anterior intacta  
4. Build/dev (e instalador a partir da Fase 1) rodável  
5. Tag git `phase-N-done`  

**Não iniciar a fase seguinte** antes do gate. Detalhes, calendário e checklist do Dia 1: [`PLAYBOOK-EXECUCAO-LAUNCHER.md`](./PLAYBOOK-EXECUCAO-LAUNCHER.md).

---

## 1. Visão e princípios

### 1.1 Problema

Jogadores no PC possuem bibliotecas fragmentadas (Steam, Epic, GOG, Amazon, emuladores, instaladores soltos). Cada loja tem seu launcher, suas regras de UI e nenhum deles resolve bem três perguntas ao mesmo tempo:

1. **O que eu tenho?** (biblioteca unificada, sem duplicatas)
2. **O que eu deveria jogar agora?** (notas, rediscovery, filtros inteligentes)
3. **O que vale a pena comprar e quando?** (wishlist + preços históricos + alertas)

O produto atual (`game-aggregator`) já cobre parte de (2) e (3) via web (Steam/GOG/Epic/Amazon + RAWG/Metacritic + IsThereAnyDeal). O próximo salto é um **launcher desktop instalável**, gamepad-first, que também **executa** jogos — sem substituir launchers oficiais.

### 1.2 Objetivo principal

Construir um launcher estilo console (fullscreen, navegação por controle) que centralize **todas** as fontes de jogos em um único lugar, com experiência simples, fluida e consistente — e que ajude o usuário a **decidir o que jogar e o que comprar** com dados de avaliação e mercado.

### 1.3 Regras não negociáveis

| Regra | Implicação técnica |
|-------|-------------------|
| Não substituir launchers oficiais | Steam: detectar + `steam://run/<appid>`. Epic/GOG: CLI/bridge oficial ou comunitário estável, sem reimplementar DRM |
| Métodos seguros e legais | Protocolos oficiais, leitura de manifests locais, APIs públicas, CLIs open-source (Legendary, gogdl, Nile). Sem scraping de DRM, sem cracks |
| UX acima de complexidade | Provider falhou? Mostrar estado claro e fallback manual. Não bloquear a biblioteca inteira |
| Gamepad-first + fullscreen | Input model pensado para controle desde a Fase 1; mouse/teclado são secundários |
| Windows desde o dia 1 | Instalador Electron (NSIS/MSI), paths Windows, atalho na área de trabalho, opção “iniciar com Windows / Big Picture” |
| Não fork hard | Não copiar o repositório Heroic/Playnite como base; reutilizar só backends/padrões estáveis |

### 1.4 Relação com o código atual

O repositório atual é um **agregador web** (Next.js + Prisma + SQLite) com:

- Sync de bibliotecas/wishlists (Steam, GOG, Epic, Amazon/Nile)
- Ratings (RAWG + Metacritic)
- Deals (IsThereAnyDeal)
- Auth Google (NextAuth)

**Estratégia oficial:**

1. Extrair o domínio de agregação (normalização, ratings, deals, wishlist) para **packages TypeScript compartilhados**.
2. Construir o launcher como **`apps/desktop` (Electron + React)** que consome esse core + providers locais de execução.
3. Orquestrar **Legendary / gogdl / Nile** como sidecars (padrão comprovado pelo Heroic), sem fork do app Heroic.
4. A UI web permanece como dashboard/cloud opcional no curto prazo; o desktop é o produto principal de execução.

---

## 2. Arquitetura alvo

### 2.1 Diagrama lógico

```
┌─────────────────────────────────────────────────────────────┐
│  Shell UI (Electron + React)                                │
│  Fullscreen / TV layout / Gamepad navigation / Settings     │
└───────────────────────────┬─────────────────────────────────┘
                            │ IPC (preload bridge)
┌───────────────────────────▼─────────────────────────────────┐
│  Application Core (packages/core + main process)            │
│  LibraryService · LaunchService · WishlistService           │
│  MetadataService · DealService · ProfileService             │
└───────────┬─────────────────────────────┬───────────────────┘
            │                             │
┌───────────▼───────────┐     ┌───────────▼───────────────────┐
│  Provider Registry    │     │  Local Persistence            │
│  SteamProvider        │     │  SQLite (better-sqlite3)      │
│  EpicProvider         │     │  File cache (covers, JSON)    │
│  GogProvider          │     │  safeStorage / keytar (tokens)│
│  AmazonProvider       │     └───────────────────────────────┘
│  LocalExeProvider     │
│  EmulatorProvider     │
│  MetadataProvider*    │     ┌───────────────────────────────┐
│  WishlistPriceProvider│────▶│  External APIs (rate-limited) │
└───────────┬───────────┘     │  RAWG · Steam Store · ITAD    │
            │                 └───────────────────────────────┘
            │ spawn / CLI
┌───────────▼─────────────────────────────────────────────────┐
│  Sidecars (infra estilo Heroic — sem fork do app)           │
│  Legendary (Epic) · gogdl (GOG) · Nile (Amazon)             │
└─────────────────────────────────────────────────────────────┘
```

\* Metadata e preços são “providers de enriquecimento”, não de launch.  
\*\* Steam e Local **não** passam por esses sidecars: scan/protocolo próprios.

### 2.2 Contrato de Provider (launch / library)

Todo provider de jogos implementa a mesma interface. Isso permite MVP local → lojas → emuladores sem reescrever a UI.

```ts
type PlatformId =
  | 'steam' | 'epic' | 'gog' | 'amazon'
  | 'local' | 'emulator' | 'manual';

interface GameProvider {
  id: PlatformId;
  displayName: string;
  capabilities: {
    scanLibrary: boolean;
    launch: boolean;
    install: boolean;      // geralmente false no nosso escopo
    playtime: boolean;
    uninstall: boolean;    // false — delegar ao launcher oficial
  };

  isAvailable(): Promise<boolean>;
  scan(): Promise<ProviderGame[]>;
  launch(game: ProviderGame, opts?: LaunchOptions): Promise<LaunchResult>;
  getInstallPath?(game: ProviderGame): Promise<string | null>;
}

interface ProviderGame {
  providerId: PlatformId;
  externalId: string;          // appid / namespace / path hash
  title: string;
  installPath?: string;
  executable?: string;
  coverUrl?: string;
  playtimeMinutes?: number;
  sizeBytes?: number;
  lastPlayedAt?: string | null;
  raw?: Record<string, unknown>;
}
```

Providers de enriquecimento (metadados/preços) usam contrato separado:

```ts
interface MetadataProvider {
  id: 'rawg' | 'steam-store' | 'igdb' | 'local-cache';
  enrich(canonical: CanonicalGame): Promise<Partial<GameMetadata>>;
}

interface PriceProvider {
  id: 'itad' | 'ggdeals';
  lookup(titleOrIds: PriceLookupKey): Promise<DealSnapshot | null>;
}
```

### 2.3 Modelo de domínio unificado

```
CanonicalGame          ← identidade única do jogo (dedupe)
  ├─ GameSource[]      ← instâncias por provider (steam:570, local:C:\..., etc.)
  ├─ GameMetadata      ← capa, gêneros, descrição, requisitos, datas
  ├─ GameRatings[]     ← metacritic, rawg, steam %
  ├─ PlayStats         ← tempo jogado agregado, last played
  └─ UserFlags         ← favorito, oculto, tags manuais

WishlistEntry
  ├─ CanonicalGame? / ExternalTitle
  ├─ PreferredStores[]
  ├─ PriceSnapshots[]
  └─ AlertRules
```

**Regra de dedupe (Fase 3):**  
chave primária lógica = `normalize(title) + (steamAppId | gogId | epicCatalogId | igdbId)` com scoring de similaridade. Preferência de capa/metadados: Steam Store → RAWG/IGDB → capa local do provider.

### 2.4 Esquema de banco sugerido (evolução do Prisma atual)

O schema web atual (`GameLibrary` com JSON blob) funciona para sync rápido, mas o launcher precisa de entidades normalizadas para ordenação, filtros e dedupe.

```prisma
// Conceito — SQLite local no desktop (pode manter Prisma ou drizzle)

model CanonicalGame {
  id              String   @id @default(cuid())
  slug            String   @unique
  title           String
  normalizedTitle String
  igdbId          Int?
  steamAppId      Int?
  releaseDate     DateTime?
  coverPath       String?  // path local em cache
  heroPath        String?
  summary         String?
  genresJson      String?  // JSON string[]
  tagsJson        String?
  minSpecsJson    String?
  recSpecsJson    String?
  sizeBytes       BigInt?
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt

  sources   GameSource[]
  ratings   Rating[]
  playStats PlayStats?
  wishlist  WishlistEntry?
}

model GameSource {
  id            String   @id @default(cuid())
  gameId        String
  platform      String   // steam, epic, gog, amazon, local, emulator
  externalId    String
  title         String
  installPath   String?
  executable    String?
  launchArgs    String?
  isInstalled   Boolean  @default(true)
  playtimeMin   Int?
  lastPlayedAt  DateTime?
  sizeBytes     BigInt?
  rawJson       String?
  scannedAt     DateTime @default(now())

  game CanonicalGame @relation(fields: [gameId], references: [id], onDelete: Cascade)

  @@unique([platform, externalId])
  @@index([gameId])
}

model Rating {
  id          String   @id @default(cuid())
  gameId      String
  source      String   // metacritic, rawg, steam
  score       Float?   // normalizado 0-100 quando possível
  scoreRaw    Float?
  reviewCount Int?
  percentPositive Int? // steam-like
  url         String?
  fetchedAt   DateTime @default(now())

  game CanonicalGame @relation(fields: [gameId], references: [id], onDelete: Cascade)
  @@unique([gameId, source])
}

model PlayStats {
  gameId          String   @id
  totalPlaytimeMin Int     @default(0)
  lastPlayedAt    DateTime?
  launchCount     Int      @default(0)
  game CanonicalGame @relation(fields: [gameId], references: [id], onDelete: Cascade)
}

model WishlistEntry {
  id              String   @id @default(cuid())
  gameId          String?  @unique
  manualTitle     String?
  preferredStores String?  // JSON
  targetPrice     Float?
  currency        String?  @default("BRL")
  alertEnabled    Boolean  @default(true)
  addedAt         DateTime @default(now())

  game   CanonicalGame? @relation(fields: [gameId], references: [id], onDelete: SetNull)
  prices PriceSnapshot[]
}

model PriceSnapshot {
  id              String   @id @default(cuid())
  wishlistId      String
  source          String   // itad
  shopName        String?
  currentPrice    Float?
  regularPrice    Float?
  cutPercent      Int?
  historicalLow   Float?
  currency        String?
  url             String?
  fetchedAt       DateTime @default(now())

  wishlist WishlistEntry @relation(fields: [wishlistId], references: [id], onDelete: Cascade)
  @@index([wishlistId, fetchedAt])
}

model ApiCache {
  key         String   @id
  payload     String
  expiresAt   DateTime
  etag        String?
  updatedAt   DateTime @updatedAt
}

model AppSetting {
  key   String @id
  value String
}
```

### 2.5 Estratégia de cache (APIs externas)

| Tipo de dado | TTL sugerido | Invalidação |
|--------------|--------------|-------------|
| Capa / arte | 30 dias (arquivo em disco) | Manual / miss de arquivo |
| Metadados (descrição, gêneros) | 14 dias | Mudança de `externalId` mapping |
| Ratings | 7 dias | Botão “atualizar notas” |
| Preços / deals | 6–12 h | Sync diário + alerta |
| Scan de biblioteca local | sob demanda + watch opcional | Ao focar a app / botão sync |
| Steam player summaries | 24 h | — |

Regras:

1. **Nunca** chamar API no hot path de render da grade; UI lê só SQLite + arquivos locais.
2. Enriquecimento em **fila em background** com concurrency baixa (ex.: 2–3 workers).
3. `ApiCache` com chave estável (`rawg:slug:witcher-3`, `itad:plain:xxx`).
4. Backoff exponencial + respeito a `Retry-After`.
5. Fallback: se API cair, mostrar dados stale com timestamp (“notas de 12/07”).

---

## 3. Stack sugerida

### 3.1 Decisão oficial: Electron + React + TypeScript

| Critério | Electron | Tauri 2 | Decisão |
|----------|----------|---------|---------|
| Velocity (1 stack TS) | Excelente | Rust + TS | **Electron** |
| Alinhamento com Heroic / CLIs Node | Nativo | Indireto | **Electron** |
| Reuso do `game-aggregator` | Direto | Direto na UI | **Electron** |
| Tamanho / RAM | Maior | Menor | Aceitar custo no MVP |
| Spawn de sidecars (Legendary etc.) | Trivial no main | OK, mais glue | **Electron** |
| Gamepad / fullscreen Windows | Maduro | Maduro | Empate |

**Escolha:** **Electron + React + TypeScript + SQLite (`better-sqlite3`)**.

- **Main process:** scan FS, spawn de jogos/CLIs, secure storage, IPC.
- **Renderer:** UI gamepad-first / TV.
- **Packages TS:** domínio de ratings, wishlist, dedupe (extraído do agregador web).

**Tauri fica como alternativa futura** se footprint/RAM virarem problema de produto — não bloqueia a Fase 0. A decisão Electron vs Tauri não precisa de spike longo: Electron é o default até haver dor mensurável.

### 3.2 Bibliotecas e ferramentas

| Camada | Sugestão |
|--------|----------|
| Desktop shell | Electron (electron-vite ou electron-forge) |
| UI | React 18/19, Tailwind (ou CSS vars próprias), Framer Motion (transições TV) |
| Roteamento UI | estado interno simples (não precisa Next no desktop) |
| DB | `better-sqlite3` + Drizzle ou Prisma |
| HTTP | `axios` / `fetch` com wrapper de rate-limit |
| Ratings | RAWG (já no repo), Steam Store API (reviews %), Metacritic via RAWG details |
| Preços | IsThereAnyDeal (já no repo) |
| Epic | [Legendary](https://github.com/derrod/legendary) como sidecar |
| GOG | [gogdl](https://github.com/Heroic-Games-Launcher/heroic-gogdl) como sidecar (preferencial); Galaxy local como fallback de scan |
| Amazon | [Nile](https://github.com/imLinguin/nile) como sidecar |
| Steam | manifests em `steamapps`, `libraryfolders.vdf`, launch `steam://rungameid/` |
| Emulators | Consoles retro (`consoles.json` + `emulators.json`); emulador ativo por console, launch `retroArch -L core` / PCSX2 CLI |
| Gamepad | Gamepad API no renderer; fallback nativo só se necessário |
| Tokens | `safeStorage` (Electron) ou `keytar` |
| Installer | electron-builder (NSIS/MSI) |
| Telemetria (opt-in) | Sentry ou nada no MVP |

### 3.3 Estrutura de pastas recomendada

```
game-aggregator/
├── apps/
│   ├── web/                         # agregador Next.js atual (dashboard/cloud)
│   └── desktop/                     # Electron launcher
│       ├── electron/                # main + preload
│       │   ├── main.ts
│       │   ├── preload.ts
│       │   ├── ipc/
│       │   └── providers/           # steam scan, process spawn, CLI wrappers
│       ├── src/                     # React UI (renderer)
│       │   ├── components/
│       │   ├── features/
│       │   │   ├── library/
│       │   │   ├── wishlist/
│       │   │   ├── discover/
│       │   │   └── settings/
│       │   ├── input/               # gamepad focus engine
│       │   └── styles/
│       └── resources/bin/           # sidecars pinados (legendary, gogdl, nile)
├── packages/
│   ├── core/                        # domínio: CanonicalGame, dedupe, sort
│   ├── providers-meta/              # RAWG, Steam ratings, ITAD
│   ├── providers-store/             # clients HTTP / wrappers CLI Epic/GOG/Amazon
│   └── ui-kit/                      # componentes TV-safe compartilhados
├── docs/
│   ├── CREDENCIAIS.md
│   ├── adr/
│   │   └── 0001-stack.md
│   └── PLANEJAMENTO-LAUNCHER-UNIFICADO.md
└── tools/
    └── scripts/                     # pin/update sidecars, smoke tests
```

Monorepo com pnpm/npm workspaces. O código em `src/lib/*-api.ts` atual migra para `packages/providers-meta` e `packages/providers-store`.

---

## 4. Fases incrementais

Cada fase é **independente, testável, entregável** e gera valor real ao usuário. Não iniciar Fase N+1 sem o gate 100% funcional (exceto spikes em branch separada).

**Execução detalhada (tarefas, dias, scripts de teste):** ver playbook —  
[Kickoff amanhã](./PLAYBOOK-EXECUCAO-LAUNCHER.md#kickoff--começar-amanhã-fase-0) · [Fase 0](./PLAYBOOK-EXECUCAO-LAUNCHER.md#fase-0--fundação) · [Fase 1](./PLAYBOOK-EXECUCAO-LAUNCHER.md#fase-1--mvp-funcional-jogos-locais) · [Fase 2](./PLAYBOOK-EXECUCAO-LAUNCHER.md#fase-2--plataformas-steam--epic--gog--amazon) · [Fase 3+](./PLAYBOOK-EXECUCAO-LAUNCHER.md#fase-3--biblioteca-unificada-inteligente).

### Mapa rápido: valor ao fechar cada fase

| Fase | Usuário consegue… | Tag |
|------|-------------------|-----|
| 0 | (dev) abrir shell, lançar Notepad, DB ok | `phase-0-done` |
| 1 | Adicionar exes e jogar em fullscreen com lib persistente | `phase-1-done` |
| 2 | Ver/jogar Steam (+ Epic/GOG/Amazon via sidecars) | `phase-2-done` |
| 3 | Uma capa por jogo; sources múltiplas; busca/filtro | `phase-3-done` |
| 4 | Consoles retro: entrada “Emulação” tipo pasta → jogos por console, ROMs da pasta padrão, emulador trocável | `phase-4-done` |
| 5 | Usar só o controle em modo TV | `phase-5-done` |
| 6 | Ordenar por nota e achar “esquecidos” bem avaliados | `phase-6-done` |
| 7 | Wishlist com preço/historical low e alerta | `phase-7-done` |
| 8 | Perfis + Moonlight/presets | `phase-8-done` |
| 9 | Install polido, update, onboarding → `v1.0.0` | `phase-9-done` |

---

### Fase 0 — Definição e base do projeto

> **Playbook:** [Fase 0 + Kickoff Dia 1–3](./PLAYBOOK-EXECUCAO-LAUNCHER.md#kickoff--começar-amanhã-fase-0)

#### Objetivo
Registrar a estratégia de base, bootstrap do monorepo Electron e contratos de provider — sem fork de terceiros.

#### Funcionalidades incluídas
- Scaffold Electron (`apps/desktop`: main/preload/renderer) com “Hello + fullscreen + launch notepad.exe”
- ADR `docs/adr/0001-stack.md` fixando Electron + produto próprio + backends Heroic
- Scaffold monorepo (`packages/core`)
- Interface `GameProvider` + registry vazio
- Wrapper stub de sidecar CLI (ex.: `legendary --version` se presente)
- SQLite local inicializado (migrations)
- Documento de credenciais/limites de API atualizado para desktop
- Decisão: web app permanece como dashboard; desktop é o foco de execução

#### O que NÃO será incluído ainda
- UI de biblioteca real
- Integrações completas de loja
- Ratings / wishlist
- Fork ou cópia do repositório Heroic/Playnite

#### Decisões técnicas principais
- **Electron + React + TS** (oficial)
- **Não fork Heroic** — apenas sidecars Legendary/gogdl/Nile e aprendizado do padrão Runner
- Persistência local-first (sem conta obrigatória no desktop MVP; conta Google opcional depois para sync cloud)
- Providers plugáveis registrados em runtime
- Tokens de loja em `safeStorage` / keytar — nunca em plaintext no repo

#### Dependências
- Node 20+
- Contas de teste nas lojas (para fases seguintes)

#### Riscos e limitações
- Footprint Electron aceito conscientemente no MVP
- Decisão prematura de monorepo excessivo → começar com `apps/desktop` + 1 package `core`
- Tentação de “copiar pastas do Heroic” → proibido na Fase 0; só contratos e sidecars

#### Definition of Done
- [ ] App Windows abre em fullscreen via Electron
- [ ] IPC executa um `.exe` de teste e retorna exit code
- [ ] DB cria tabelas vazias
- [ ] ADR `docs/adr/0001-stack.md` publicado com a decisão v1.1
- [ ] CI básica: `tsc` + build desktop
- [ ] README desktop deixa explícito: backends ≠ fork do Heroic

---

### Fase 1 — MVP funcional

> **Playbook:** [Fase 1 — dias, CRUD, NSIS, gate](./PLAYBOOK-EXECUCAO-LAUNCHER.md#fase-1--mvp-funcional-jogos-locais)

#### Objetivo
Usuário instala o launcher, adiciona jogos manuais (`.exe`) e joga em fullscreen — sem depender de nenhuma loja.

#### Funcionalidades incluídas
- UI básica: grade de jogos + detalhe + botão Jogar
- Biblioteca manual: adicionar exe, pasta, editar nome, remover
- Execução de jogos externos (`CreateProcess` / `std::process::Command`)
- Modo tela cheia (borderless) na abertura
- Capas manuais (URL ou arquivo local) opcional
- Persistência da biblioteca no SQLite
- Atalho “Adicionar jogo” navegável por teclado (gamepad básico opcional)

#### O que NÃO será incluído ainda
- Steam/Epic/GOG/Amazon
- Emuladores
- Ratings, wishlist, dedupe
- Navegação gamepad completa estilo console

#### Decisões técnicas principais
- `LocalExeProvider` como primeiro provider real (equivalente conceitual ao sideload do Heroic, implementação própria)
- Launch detached via `child_process` / `shell.openPath` no main (não bloquear UI)
- Paths Windows com espaços/unicode tratados corretamente
- Sem elevação admin por padrão

#### Dependências
- Fase 0 concluída
- Instalador electron-builder gerando `.exe` NSIS (MSI opcional)

#### Riscos e limitações
- Alguns jogos exigem working directory específico → campo `cwd` no form
- Anti-cheat / launchers intermediários (Riot, Battle.net) podem falhar com spawn direto → documentar “adicione o launcher do jogo”
- Sem metadados, a grade fica feia → permitir capa manual desde o MVP

#### Definition of Done
- [ ] Usuário adiciona ≥3 exes diferentes e todos iniciam corretamente
- [ ] App reabre e a biblioteca persiste
- [ ] Fullscreen estável em monitor principal
- [ ] Remover jogo não apaga arquivos do disco (só entrada na lib)
- [ ] Build instalável testado em máquina limpa (VM OK)

---

### Fase 2 — Integração com plataformas principais

> **Playbook:** [Fase 2 — sub-fases 2.A Steam → 2.B Epic → 2.C GOG → 2.D Amazon](./PLAYBOOK-EXECUCAO-LAUNCHER.md#fase-2--plataformas-steam--epic--gog--amazon)  
> Cada sub-fase (2.A–2.E) tem gate interno; a fase só fecha no gate final.

#### Objetivo
Biblioteca passa a incluir jogos das lojas principais com launch legal — **priorizando Steam primeiro** (maior biblioteca no Windows) e em seguida Epic/GOG/Amazon via sidecars do ecossistema Heroic.

#### Funcionalidades incluídas

**Steam (prioridade #1 — provider próprio)**
- Scan de `libraryfolders.vdf` + `appmanifest_*.acf`
- Exibir só instalados (MVP da fase); “não instalados” pode ser lista secundária
- Launch: `steam://rungameid/<appid>`
- Playtime a partir do manifest / API local quando disponível
- Não depende do Heroic

**Epic (Legendary — sidecar)**
- Bundlar Legendary pinado em `resources/bin` **ou** detectar instalação do usuário
- `legendary list-installed` / launch por app name
- Fallback: abrir Epic Launcher oficial se Legendary ausente/falhar

**GOG (gogdl — sidecar)**
- Preferir [gogdl](https://github.com/Heroic-Games-Launcher/heroic-gogdl) para list/launch (mesmo backend do Heroic)
- Fallback: ler Galaxy local / bridge HTTP já existente no agregador

**Amazon / Prime Gaming (Nile — sidecar)**
- Integração via Nile (listagem + launch path)
- Luna: apenas placeholder/flag “streaming futuro” (sem implementação)

**UI**
- Badge de plataforma na capa
- Botão “Sincronizar bibliotecas”
- Tela de status por provider (ok / não encontrado / erro / versão do sidecar)

#### O que NÃO será incluído ainda
- Dedupe inteligente entre lojas
- Instalador completo estilo Heroic (download queue / repair) — **launch + scan primeiro**; install/update fica backlog se necessário
- Wishlist e ratings (já existem na web; no desktop entram nas Fases 6–7)
- Emuladores
- Qualquer cópia da UI do Heroic

#### Decisões técnicas principais
- **Ordem de entrega da fase:** Steam → Legendary → gogdl → Nile
- Orquestrar CLIs via main process com PATH/versão configuráveis em Settings
- Pin de versão dos sidecars + script de smoke (`legendary --version`, etc.)
- Licenças dos sidecars respeitadas (atribuição); app próprio permanece desacoplado do GPL do Heroic **desde que não incorpore código GPL do Heroic**
- Steam **não** usa Web API para launch — só scan local + protocolo
- Provider que falha não derruba os outros (`Promise.allSettled`)
- Escopo consciente: somos agregador/launcher, não substituto completo das lojas (install opcional depois)

#### Dependências
- Binários Legendary / gogdl / Nile documentados em `docs/CREDENCIAIS.md`
- Steam client instalado para a maior parte dos usuários Windows

#### Riscos e limitações
- Legendary/gogdl/Nile quebram com mudanças de API → pin + smoke test + atualização coordenada
- Se no futuro copiarmos código GPL do Heroic (não só CLIs), o app inteiro pode ser forçado a GPL — **evitar**
- Amazon Prime claim ≠ always downloadable game
- Política: nunca pedir senha Steam; OpenID/API key só se formos sync cloud depois

#### Definition of Done
- [ ] Steam: scan encontra jogos instalados e launch via protocolo funciona
- [ ] Epic: launch via Legendary para ≥1 título
- [ ] GOG: list/launch via gogdl (ou fallback documentado) para ≥1 título
- [ ] Amazon: aparece via Nile ou estado “provider indisponível” claro
- [ ] Log de erros/versão por provider em Settings → Diagnóstico
- [ ] Nenhum código-fonte do repositório Heroic vendored no monorepo

---

### Fase 3 — Biblioteca unificada inteligente

> **Playbook:** [Fase 3](./PLAYBOOK-EXECUCAO-LAUNCHER.md#fase-3--biblioteca-unificada-inteligente)

#### Objetivo
Uma grade, um jogo — metadados consistentes, sem duplicatas óbvias, organização útil.

#### Funcionalidades incluídas
- Normalização de títulos (`normalizeTitle`: lowercase, remove ™®, “GOTY”, traços)
- Merge de `GameSource` no mesmo `CanonicalGame`
- Capas/hero em cache local (download uma vez)
- Categorias/gêneros (manual + importados de metadata provider)
- Filtros: plataforma, instalado, gênero
- Busca por nome (fuzzy simples)
- Resolução de conflitos: UI “estes jogos são o mesmo?” para merges duvidosos

#### O que NÃO será incluído ainda
- Ratings completos (Fase 6) — pode haver capa via RAWG search já, mas sem sistema de notas na UI
- Emuladores
- Wishlist

#### Decisões técnicas principais
- Pipeline: `scan providers → upsert GameSource → match CanonicalGame → enqueue metadata`
- Scoring de match: IDs externos > título exact > fuzzy (threshold alto para auto-merge)
- Preferência de arte: Steam CDN → RAWG → primeira capa do provider
- Manter `GameSource` mesmo após merge (nunca perder origem/launch)

#### Dependências
- Fase 2 (múltiplas fontes)
- API key RAWG (já usada no projeto)

#### Riscos e limitações
- Falsos positivos de merge (editions, DLC) → nunca auto-merge DLC; editions com review manual
- Rate-limit RAWG no primeiro import massivo → fila + cache
- Títulos em PT vs EN

#### Definition of Done
- [ ] Mesmo jogo em Steam+Epic aparece **uma** vez com 2 sources
- [ ] Capas carregam offline na segunda abertura
- [ ] Filtro por plataforma e busca por nome funcionam
- [ ] Usuário pode “Separar” um merge incorreto
- [ ] Biblioteca de 200+ jogos permanece utilizável (<300 ms para filtrar local)

---

### Fase 4 — Consoles retro (emulador relativo)

> **Playbook:** [Fase 4](./PLAYBOOK-EXECUCAO-LAUNCHER.md#fase-4--consoles-retro-emulador-relativo)

#### Objetivo
ROMs entram na biblioteca organizados por **console retro**. O console (SNES, GBA, PS1, PS2…) é a entidade de primeira classe: dentro dele fica a listagem dos jogos. O **emulador é relativo** — não é o que o usuário navega; é apenas o motor de execução, escolhido pelo gosto do usuário entre opções pré-definidas por console. Os jogos seguem um **modelo de pasta padrão**: colocar um ROM válido na pasta daquele console faz o software reconhecer e listar automaticamente.

#### Funcionalidades incluídas
- Entrada **“Emulação”** na navegação — semelhante a uma pasta: abrir → lista de consoles retro → jogos de cada console
- **Consoles como entidade principal** (SNES, NES, GBA, PS1, PS2, Arcade…): cada um com id, nome, extensões de ROM e dica de BIOS
- **Pasta padrão por console** (watch folder): ROMs válidos colocados na pasta são identificados automaticamente por extensão e entram na lista — modelo drop-in
- Mapeamento manual de ROM (alternativa à pasta padrão): apontar um arquivo específico para um console
- UI: lista de consoles → **dentro do console**, grade dos jogos daquele console
- Catálogo de emuladores (RetroArch, PCSX2, DuckStation, bsnes, higan…) com detecção de path e registro manual
- Cada console tem **opções de emulador pré-definidas** (ex.: SNES → RetroArch `snes9x_libretro`, bsnes, higan)
- **Emulador ativo por console** (setting): o usuário troca entre as opções a qualquer momento; o launch usa o ativo
- Metadados básicos (nome do arquivo limpo; scrape opcional depois)
- Launch: `retroArch.exe -L core.dll romPath` — ou o binário/args do emulador ativo daquele console
- Agrupamento/categoria “Retro” por console no filtro

#### O que NÃO será incluído ainda
- Scraping avançado tipo LaunchBox/EmulationStation completo
- BIOS management wizard elaborado (apenas path configurável)
- Netplay

#### Decisões técnicas principais
- **Console-first**: `consoles.json` define os consoles (id, nome, extensões, BIOS hint) e suas **opções de emulador** (`emulatorId` + core/args)
- `emulators.json` define perfis de binário (path, detecção, argsTemplate genéricos)
- **Modelo de pasta padrão**: cada console tem um `defaultFolder` (watch folder). O scan dessa pasta identifica ROMs válidos pela extensão e cria/atualiza `GameSource` automaticamente — “colocou na pasta, o app reconhece”. Mapeamento manual continua disponível
- `GameSource` de plataforma `emulator` ganha `console_id` — o jogo pertence ao console; o emulador é resolvido no launch
- Setting `console.<id>.emulator` guarda a escolha do usuário (default = primeira opção disponível instalada)
- Não distribuir ROMs/BIOS; só apontar paths do usuário
- Hash opcional (CRC) para dedupe de ROMs

#### Dependências
- Emuladores instalados pelo usuário
- Fase 3 ajuda a organizar na grade

#### Riscos e limitações
- Legalidade: o app só gerencia arquivos locais do usuário
- Paths absurdamente grandes (milhares de ROMs) → import async + virtualização da grade
- Cores RetroArch variam por instalação → opções por console mitigam (usuário troca o core)
- Detecção de emulador falha em instalações fora do padrão → registro manual de path
- Pasta padrão sem organização (ROMs soltos + subpastas) → scan recursivo com limite de profundidade e ignorar pastas ocultas

#### Definition of Done
- [ ] Importa pasta SNES e lista jogos **dentro do console SNES**
- [ ] Colocar um ROM válido novo na pasta padrão → aparece sem reimport manual
- [ ] Trocar o emulador ativo do SNES (ex.: bsnes em vez de RetroArch) muda o launch sem reimportar
- [ ] PCSX2 (ou segundo console/emulador) configurável e funcional
- [ ] Itens retro filtráveis/agrupáveis por console

---

### Fase 5 — Experiência estilo console

> **Playbook:** [Fase 5](./PLAYBOOK-EXECUCAO-LAUNCHER.md#fase-5--experiência-console--tv)

#### Objetivo
O launcher parece e se comporta como um shell de console no PC/TV.

#### Funcionalidades incluídas
- Motor de foco/spatial navigation (D-pad, sticks, A/B/X/Y)
- UI TV: tipografia grande, safe margins, contraste alto, poucas colunas
- Atalhos: A jogar, X opções, Y buscar, B voltar
- Boot direto em fullscreen (setting “modo TV”)
- Inatividade: esconder cursor
- Sons de UI leves (opt-in)
- “Continuar” / “Jogados recentemente” no topo
- Suporte a resolução 1080p/1440p/4K sem quebrar layout

#### O que NÃO será incluído ainda
- Perfis multi-device avançados (Fase 8)
- Voice search
- Temas custom complexos

#### Decisões técnicas principais
- Focus engine próprio (ou lib tipo `@noriginmedia/norigin-spatial-navigation`) — avaliar no spike
- Input: Gamepad API + polling; não depender só de tabindex
- Todas as ações primárias devem ser alcançáveis sem mouse
- Animações 200–300 ms, sem bloquear input

#### Dependências
- Biblioteca já utilizável (Fases 1–3)
- Controle XInput/DirectInput testado

#### Riscos e limitações
- WebView gamepad quirks → fallback Rust XInput
- TV via HDMI: overscan → safe area padding
- Misturar mouse e gamepad no mesmo frame pode “roubar” foco — regra: último input device wins

#### Definition of Done
- [ ] Fluxo completo sem mouse: abrir app → navegar → jogar → voltar
- [ ] Layout validado a 1080p em TV/monitor
- [ ] Setting “Iniciar em modo TV” funciona após reboot do app
- [ ] Checklist de acessibilidade básica (foco visível, contraste)

---

### Fase 6 — Sistema de avaliação e descoberta *(prioridade alta)*

> **Playbook:** [Fase 6](./PLAYBOOK-EXECUCAO-LAUNCHER.md#fase-6--avaliações-e-rediscovery)

#### Objetivo
Fazer o usuário **redescobrir** jogos que já possui e são bem avaliados, mas esquecidos.

#### Funcionalidades incluídas
- Integração ratings: RAWG, Metacritic (via detalhes RAWG), Steam review % (Steam Store/API)
- Exibir nota composta + breakdown por fonte na ficha do jogo
- Exibir % positivas estilo Steam quando disponível
- Ordenação da biblioteca por:
  - Nota (composta / por fonte)
  - Nome
  - Tempo de jogo (se disponível)
  - Tamanho em disco
  - Requisitos (proxy: tier low/med/high a partir de metadados, quando houver)
- Filtros: “nota ≥ 80”, “nunca jogados”, “não jogados nos últimos 6 meses”
- Prateleira inteligente: **“Esquecidos bem avaliados”** (high rating + low/zero playtime)

#### O que NÃO será incluído ainda
- Reviews textuais completas / UGC
- Critic user reviews próprios
- Wishlist/deals (Fase 7)

#### Decisões técnicas principais
- Reaproveitar `RatingAggregator` e clients `rawg-api` / `metacritic-api` do repo atual
- Normalizar scores para 0–100 na UI (já há lógica parcial em `aggregation.ts`)
- Steam %: campo separado (`percentPositive`), não misturar na média sem peso explícito
- Enriquecimento batch com os mesmos cuidados de cache da seção 2.5
- Ordenação **sempre** no SQLite/índices locais — nunca “sort na API”

#### Dependências
- `STEAM_API_KEY` / RAWG key (`docs/CREDENCIAIS.md`)
- Canonical games da Fase 3 (senão ratings duplicam por source)

#### Riscos e limitações
- Metacritic nem sempre disponível via RAWG
- Rate limits no backfill inicial
- Requisitos de sistema são dados sujos/incompletos — ordenação por requirements é best-effort
- Spoiler de score: setting “esconder notas”

#### Definition of Done
- [ ] ≥90% dos jogos da lib de teste têm ao menos uma fonte de nota (ou “sem dados”)
- [ ] Ordenar por nota e por playtime funciona offline após sync
- [ ] Prateleira “Esquecidos bem avaliados” lista casos reais (ex.: nota alta + 0h)
- [ ] Sync de notas respeita cache (segunda execução ≪ primeira em chamadas HTTP)
- [ ] Paridade conceitual com o batch de ratings da web (`POST /api/ratings/batch`)

---

### Fase 7 — Wishlist e sistema de promoções *(diferencial forte)*

> **Playbook:** [Fase 7](./PLAYBOOK-EXECUCAO-LAUNCHER.md#fase-7--wishlist-e-promoções)

#### Objetivo
Ajudar a decidir **quando comprar**, com preços atuais, mínimos históricos e alertas.

#### Funcionalidades incluídas
- Wishlist interna no desktop
- Add manual (busca título) ou import automático das wishlists Steam/GOG/Epic (reuso da web)
- Integração IsThereAnyDeal (já no projeto)
- Na ficha / lista da wishlist:
  - Preço atual + loja
  - % de desconto
  - Historical low
  - Link para página da oferta (abre browser)
- Alertas: toast no app + opcional notificação Windows quando preço ≤ alvo ou ≤ historical low
- Associação wishlist ↔ plataformas preferidas
- Sync periódico (6–12 h) alinhado ao `sync/daily` da web

#### O que NÃO será incluído ainda
- Compra in-app / carrinho
- Price tracking de jogos já possuídos (exceto DLC futuro)
- Auto-purchase

#### Decisões técnicas principais
- Reusar `itad-api.ts` e modelo `GameDeal` → `PriceSnapshot`
- Wishlist pode apontar para `CanonicalGame` ou título manual ainda não mapeado
- Alertas: job em background enquanto app aberta; opcional tarefa agendada Windows depois
- Deep link `steam://` / URLs de loja — não hospedar checkout

#### Dependências
- API key ITAD
- Fase 6 desejável (notas na wishlist melhoram decisão), mas não bloqueante

#### Riscos e limitações
- ITAD plain IDs nem sempre batem com título → UI de desambiguação
- Preços regionais (BR vs US) — fixar `country`/`currency` nas settings
- Notificações Windows exigem permissão/AUMID do instalador

#### Definition of Done
- [ ] Usuário adiciona 5 jogos à wishlist e vê preço + historical low
- [ ] Import da wishlist Steam (quando configurada) funciona
- [ ] Alerta dispara em condição simulada (preço alvo)
- [ ] Clique na oferta abre a loja correta no navegador/Steam
- [ ] Cache de preços evita flood na ITAD

---

### Fase 8 — Recursos avançados

> **Playbook:** [Fase 8](./PLAYBOOK-EXECUCAO-LAUNCHER.md#fase-8--avançado-perfis-streaming-presets)

#### Objetivo
Cobrir cenários de uso além do PC “local”: perfis, streaming, presets.

#### Funcionalidades incluídas
- Perfis por dispositivo: PC Desk / TV / Handheld (UI density, confirmações, timeout)
- Integração Moonlight/Sunshine: atalho para stream host; games marcados como “remote”
- Auto-config leve: resolution preset ao launch (args conhecidos / wrappers), não injecção em processo
- Cloud sync opcional de biblioteca/wishlist (reusar backend Next atual como API)

#### O que NÃO será incluído ainda
- Marketplace próprio
- Mods / workshop manager completo
- Mobile app nativo (perfil “mobile” pode ser só layout remoto/web)

#### Decisões técnicas principais
- Profiles = set de `AppSetting` + layout tokens
- Streaming = launch do client Moonlight com appid/host config — não reimplementar protocolo
- Sync cloud: auth opcional; desktop continua functional offline

#### Dependências
- Fases 5–7 estáveis
- Sunshine/Moonlight instalados pelo usuário

#### Riscos e limitações
- Auto-config quebra jogos → sempre opt-in por título
- Sync de conflitos (mesmo jogo em dois devices)

#### Definition of Done
- [ ] Troca de perfil altera UI e setting de boot
- [ ] Atalho Moonlight inicia stream para host configurado
- [ ] Pelo menos 1 preset de launch documentado (ex.: `-fullscreen`)
- [ ] Offline: biblioteca e launch local intactos sem rede

---

### Fase 9 — Polimento e produto

> **Playbook:** [Fase 9](./PLAYBOOK-EXECUCAO-LAUNCHER.md#fase-9--polimento-e-distribuição)

#### Objetivo
Performance, UX refinada, settings completos, distribuição confiável.

#### Funcionalidades incluídas
- Virtualização da grade (janela de 500–5000 jogos)
- Cold start < 2 s até UI interativa (meta)
- Settings: paths, providers, API keys, cache clear, idioma, tema, modo TV
- Onboarding de primeiro uso (detectar Steam → importar)
- Crash reports opt-in
- Auto-update (electron-updater)
- Changelog in-app
- Instalador assinado (se certificado disponível)
- Documentação de usuário (README desktop)

#### O que NÃO será incluído
- Features novas de escopo amplo (voltar ao backlog)

#### Decisões técnicas principais
- Profiling: startup, scan, IPC chatter
- Feature flags para providers experimentais
- Política de privacidade / telemetria clara

#### Dependências
- Artefato estável das fases anteriores
- Conta de signing Windows (opcional mas importante para SmartScreen)

#### Riscos e limitações
- SmartScreen “Unknown publisher” sem certificado
- Auto-update mal configurado pode brickar install → staged rollout

#### Definition of Done
- [ ] Checklist UX TV + mouse completo
- [ ] Benchmark em lib de 1k jogos documentado
- [ ] Instalador + updater testados (upgrade de N-1 → N)
- [ ] Settings cobrem todos os paths/keys necessários
- [ ] Tag `v1.0.0` com notas de release

---

## 5. Mapa de valor por fase

| Fase | Valor para o usuário | Entregável |
|------|----------------------|------------|
| 0 | Base sólida | App shell + ADR |
| 1 | Jogar exes num só lugar | MVP instalável |
| 2 | Lojas na mesma grade | Scan+launch Steam/Epic/GOG/Amazon |
| 3 | Biblioteca limpa | Dedupe + metadados |
| 4 | Retro unificado | Consoles + ROMs (pasta padrão) + emulador relativo |
| 5 | Sofá / TV | Gamepad-first real |
| 6 | “O que jogar?” | Ratings + rediscovery |
| 7 | “Quando comprar?” | Wishlist + deals |
| 8 | Casa multi-device | Profiles + streaming |
| 9 | Produto | Performance + distribuição |

**Prioridade de negócio pós-MVP:** Fase 6 e 7 são o diferencial em relação a Playnite/Heroic/LaunchBox — o agregador atual já valida a tese; o launcher incorpora execução + UX console.

---

## 6. Estratégia de base: produto próprio + backends Heroic (não fork)

### 6.1 Contexto

Ecossistema existente:

| Projeto | Força | Lacuna vs nossa visão |
|---------|-------|------------------------|
| [Heroic](https://github.com/Heroic-Games-Launcher/HeroicGamesLauncher) | Legendary/gogdl/Nile maduros; Electron+React; install/update Epic/GOG/Amazon | Sem Steam first-class; sem tese ratings/wishlist; UI não é console/TV; **GPL-3.0** |
| Playnite | Extensível, maduro, Windows, Steam+tudo | C#/.NET; UX nem sempre TV-native; foco menor em deals/ratings como produto |
| LaunchBox/BigBox | Emulação/TV excelentes | Pago / menos lojas PC modernas como first-class |
| Steam Big Picture | Polido | Só Steam |
| **Este repo** | Ratings + wishlist + ITAD já funcionando | Ainda não executa jogos / não é desktop |

### 6.2 Opções avaliadas

| Opção | Economia | Custo / risco | Encaixa na tese? |
|-------|----------|---------------|------------------|
| **A. Produto próprio + sidecars (Legendary/gogdl/Nile)** | Alta na Fase 2 sem herdar UI | Implementar Steam/TV/ratings nós mesmos | **Alto — escolhida** |
| **B. Fork hard do Heroic** | Alta em Epic/GOG/Amazon/install | GPL-3.0, rebase eterno, UX errada, Steam ainda manual | Médio |
| **C. Fork/extensão Playnite** | Alta em biblioteca Windows | Troca stack TS→C#; joga fora código atual | Médio-alto tecnicamente, baixo para este repo |
| **D. Tauri do zero sem sidecars** | Nenhuma | Reimplementa o mais frágil (APIs de loja) + Rust | Baixo no curto prazo |

### 6.3 Por que não forkar o Heroic

1. **Produto diferente:** Heroic quer ser cliente de loja (install/update/Wine). Nós queremos agregador + decisão (jogar/comprar) + shell console.
2. **Steam:** maior fatia da biblioteca Windows — Heroic não resolve; fork não elimina esse trabalho.
3. **GPL-3.0:** fork/código copiado contamina o derivado. Sidecars CLI (Legendary, gogdl, Nile) podem ser *usados* como binários com atribuição, sem incorporar o app Heroic.
4. **Manutenção:** hard fork exige rebase contínuo contra APIs que quebram; melhor pin de sidecars + nossos wrappers finos.
5. **Diferencial está nas Fases 5–7**, não na UI de store do Heroic.

### 6.4 O que *reutilizar* do ecossistema Heroic

| Reutilizar | Não reutilizar |
|------------|----------------|
| Legendary, gogdl, Nile (binários/sidecars) | UI / fluxos de store do Heroic |
| Ideia do padrão Runner / GameManager | Código-fonte GPL do repositório Heroic |
| Lições de IPC Electron + spawn de CLI | Filosofia “substituir Epic/GOG” como meta de produto |
| Documentação comunitária de quirks das lojas | Wine/Proton stack completa (fora do foco Windows inicial) |

Opcional no futuro: provider read-only “importar biblioteca exportada do Heroic/Playnite” para bootstrap — sem depender deles em runtime.

### 6.5 Decisão oficial

**Produto próprio (Electron) + domínio do `game-aggregator` + sidecars Legendary/gogdl/Nile + Steam provider próprio.**

Sequência inteligente de entrega:

1. MVP local (exe + fullscreen)  
2. Steam scan/launch  
3. Legendary → gogdl → Nile  
4. Dedupe / metadados  
5. Plugar ratings + wishlist do agregador  
6. Gamepad/TV  
7. Consoles retro (emulador relativo) e avançados  

Reavaliar fork Playnite **somente** se Steam+sidecars atrasarem >2× o estimado *e* a equipe aceitar migrar para C#. Reavaliar Tauri só com métrica de footprint/RAM do Electron.

---

## 7. Segurança, legal e privacidade

1. **Sem DRM cracking, sem inject, sem bypass.**  
2. Tokens OAuth/lojas apenas em secure storage.  
3. API keys do usuário ficam locais (settings); nunca commitadas.  
4. Scraping: preferir APIs oficiais/públicas; se algum endpoint for frágil (Metacritic), isolar e degradar.  
5. Telemetria off by default.  
6. ROMs/BIOS: responsabilidade do usuário; o app não oferece download.  
7. Respeitar ToS: não se passar pelo cliente oficial além do que Legendary/gogdl/Nile/comunidade já fazem de forma estabelecida.
8. **Licenças:** não vendorar código GPL do Heroic. Sidecars: respeitar licença de cada CLI + atribuição no About. Manter o app próprio em licença compatível com o repositório (definir na Fase 0/9).

---

## 8. Estimativas de esforço (ordem de grandeza)

Assumindo 1 dev full-stack confortável com TypeScript/Electron (sem Rust obrigatório):

| Fase | Esforço relativo | Notas |
|------|------------------|-------|
| 0 | 2–4 dias | Scaffold Electron + ADR (decisão já fechada) |
| 1 | 1–2 semanas | MVP jogável |
| 2 | 2–4 semanas | Steam próprio + wrappers de sidecars (menor que reimplementar lojas) |
| 3 | 2–3 semanas | Dedupe + cache arte |
| 4 | 1–2 semanas | Emulação básica |
| 5 | 2–4 semanas | Gamepad polish é artesanal |
| 6 | 1–2 semanas | Reaproveitamento forte do web |
| 7 | 1–2 semanas | Idem ITAD/wishlist |
| 8 | 2–3 semanas | Streaming/profiles |
| 9 | 2–3 semanas | Release engineering |

Total orientativo até um v1 convincente (Fases 0–7 + polish parcial): **~3–4 meses** em ritmo consistente — a economia vs “tudo do zero” vem dos sidecars, não de um fork.

---

## 9. Backlog explícito (fora das fases, não esquecer)

- Conta cloud opcional + sync multi-PC
- Install/update/repair via sidecars (fila estilo Heroic) — só se launch+scan não bastar
- Provider opcional “importar biblioteca Heroic/Playnite”
- Suporte a Battle.net / Ubisoft / EA App / Xbox PC (providers adicionais)
- Amazon Luna quando houver API/cliente estável
- Achievements agregados
- Friends / “o que amigos jogam” (baixo prioridade, dependências sociais)
- Plugin SDK público para providers da comunidade
- Traduções (pt-BR first, en-US)
- Revisitar Tauri se footprint Electron for problema real de produto

---

## 10. Critérios de sucesso do produto (norte)

O launcher será sucesso quando um usuário puder, **só com um controle**:

1. Abrir o app na TV  
2. Ver **todos** os jogos (lojas + local + retro) numa grade limpa  
3. Ordenar por **nota** e achar um jogo esquecido com 90+ que ele já tem  
4. Abrir a wishlist, ver que o jogo X está no **menor preço histórico**, e ir à loja  
5. Voltar e jogar sem abrir Steam/Epic manualmente (eles podem abrir por baixo — isso é OK)

Se esses cinco passos forem fluidos, a tese do produto está validada.

---

## 11. Começar amanhã (Fase 0 — resumo)

Seguir o playbook na íntegra: **[Kickoff — Dia 1](./PLAYBOOK-EXECUCAO-LAUNCHER.md#kickoff--começar-amanhã-fase-0)**.

| Dia | Meta |
|-----|------|
| **1** | Branch + ADR + Electron fullscreen + IPC Notepad |
| **2** | `packages/core` + SQLite health + smoke sidecars stub |
| **3** | Scripts build/typecheck + gate Fase 0 + tag `phase-0-done` |

Checklist ambiente (hoje, se possível): Node 20, Git, Steam com jogos instalados, keys do `CREDENCIAIS.md` à mão para Fases 6–7.

Depois do `phase-0-done`: abrir só a [Fase 1 do playbook](./PLAYBOOK-EXECUCAO-LAUNCHER.md#fase-1--mvp-funcional-jogos-locais) e ignorar o restante até o próximo gate.

---

## 12. Histórico do documento

| Versão | Mudança |
|--------|---------|
| v1.0 | Planejamento inicial (fases 0–9, providers, schema, cache) |
| v1.1 | Estratégia oficial: **não fork Heroic**; Electron; reusar Legendary/gogdl/Nile; Steam primeiro; agregador como cérebro de decisão |
| v1.2 | Playbook de execução detalhado; regra gate 100% funcional; kickoff Dia 1–3; mapa de tags por fase |

---

*Este documento é a fonte de verdade da **estratégia**. O playbook é a fonte de verdade da **execução**. Mudanças de escopo atualizam ambos (fase afetada + tarefas/gates).*
