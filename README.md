# Game Aggregator

Agregador de jogos: login Google → conecta lojas → biblioteca com notas (Metacritic/RAWG) e wishlist com promoções (IsThereAnyDeal).

## Stack

- **Frontend:** Next.js 14 (App Router) + TypeScript + Tailwind CSS
- **Backend:** Next.js API Routes
- **Banco:** SQLite + Prisma
- **Auth:** NextAuth.js (Google OAuth)

## Fluxo

1. Login obrigatório com Google
2. Conectar lojas (Steam, GOG, Epic, Amazon)
3. **Buscar jogos nas lojas** — sincroniza biblioteca e wishlist
4. **Buscar notas** — RAWG (+ Metacritic via detalhes RAWG)
5. **Buscar preços** — IsThereAnyDeal na wishlist
5. Wishlist — preços via IsThereAnyDeal

## Configuração

### 1. Instalar

```bash
npm install
```

### 2. Variáveis de ambiente

Copie o exemplo e preencha:

```bash
cp .env.example .env.local
```

**Como obter cada chave / login:** veja o guia completo em [`docs/CREDENCIAIS.md`](docs/CREDENCIAIS.md).

Resumo:

| Variável | Onde |
|----------|------|
| Google | [Google Cloud Console](https://console.cloud.google.com/) |
| Steam API | [steamcommunity.com/dev/apikey](https://steamcommunity.com/dev/apikey) |
| RAWG | [rawg.io/apidocs](https://rawg.io/apidocs) |
| ITAD | [isthereanydeal.com/apps](https://isthereanydeal.com/apps/) |
| GOG / Epic | Defaults públicos; login bridge no app |
| Amazon | [Login with Amazon](https://developer.amazon.com/loginwithamazon/console/site/lwa/overview.html) (opcional; app usa Nile) |

### 3. Banco

```bash
npx prisma generate
npx prisma db push
```

### 4. Rodar

```bash
npm run dev
```

Abra **http://localhost:3000** (mantenha `NEXTAUTH_URL` alinhado à porta).

## Conectar lojas

| Loja | Como |
|------|------|
| **Steam** | Botão Entrar + `STEAM_API_KEY` (wishlist pública no perfil) |
| **GOG** | Bridge: login Galaxy → colar URL/`code` |
| **Epic** | Bridge: login Epic → colar JSON/`authorizationCode` |
| **Amazon** | Bridge Nile: login Amazon → colar URL com `authorization_code` |

Detalhes passo a passo: [`docs/CREDENCIAIS.md`](docs/CREDENCIAIS.md).

## APIs principais

| Rota | Função |
|------|--------|
| `GET/DELETE /api/platforms` | Listar / desvincular lojas |
| `GET/POST /api/library` | Listar / sync bibliotecas |
| `GET/POST /api/wishlist` | Listar / sync wishlists |
| `POST /api/ratings/batch` | Buscar notas RAWG (+ Meta nos detalhes) |
| `POST /api/deals/batch` | Preços ITAD da wishlist |
| `GET/POST /api/sync/daily` | Sync diário (biblioteca + preços) |

## Estrutura

```
src/
  app/                 # páginas e API routes
  lib/                 # Steam, GOG, Epic, Amazon, RAWG, Metacritic, ITAD
prisma/
  schema.prisma
docs/
  CREDENCIAIS.md       # como obter cada credencial
```
