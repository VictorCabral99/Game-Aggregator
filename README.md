# Game Aggregator

Agregador de jogos: login Google → conecta lojas → biblioteca com notas (Metacritic/RAWG) e wishlist com promoções (IsThereAnyDeal).

## Stack

- **Frontend:** Next.js 14 (App Router) + TypeScript + Tailwind CSS
- **Backend:** Next.js API Routes
- **Banco:** SQLite + Prisma
- **Auth:** NextAuth.js (Google OAuth)

## Fluxo

1. Login obrigatório com Google
2. Conectar Steam e/ou GOG (Epic e Amazon Luna em breve)
3. **Biblioteca** — notas Metacritic + RAWG
4. **Wishlist** — preços/promoções via IsThereAnyDeal
5. Sync automático **1x por dia** ao abrir o dashboard (ou “Atualizar agora”)

## Configuração

### 1. Instalar

```bash
npm install
```

### 2. Variáveis de ambiente

Copie `.env.example` para `.env` / `.env.local`:

```bash
DATABASE_URL="file:./dev.db"
NEXTAUTH_URL="http://localhost:3000"
NEXTAUTH_SECRET="change-me"
GOOGLE_CLIENT_ID="..."
GOOGLE_CLIENT_SECRET="..."
STEAM_API_KEY="..."
RAWG_API_KEY="..."
ITAD_API_KEY="..."
ITAD_COUNTRY="BR"
# Opcional (refresh token GOG)
GOG_CLIENT_ID=""
GOG_CLIENT_SECRET=""
```

Chaves:

- Google: https://console.cloud.google.com
- Steam: https://steamcommunity.com/dev/apikey
- RAWG: https://rawg.io/apidocs
- ITAD: https://isthereanydeal.com/apps/

### 3. Banco

```bash
npx prisma generate
npx prisma db push
```

### 4. Rodar

```bash
npm run dev
```

http://localhost:3000

## Conectar lojas

- **Steam:** Steam ID64 ou vanity URL (perfil precisa ter wishlist pública para sync da wishlist)
- **GOG:** access token ou refresh token (API não oficial; pode exigir `GOG_CLIENT_ID` / `GOG_CLIENT_SECRET` para refresh)

## APIs principais

| Rota | Função |
|------|--------|
| `POST /api/platforms/steam` | Vincular Steam |
| `POST /api/platforms/gog` | Vincular GOG |
| `GET/DELETE /api/platforms` | Listar / desvincular |
| `GET/POST /api/library` | Ler / sync biblioteca |
| `GET/POST /api/wishlist` | Ler / sync wishlist |
| `POST /api/ratings/batch` | Notas em lote (owned) |
| `POST /api/deals/batch` | Preços ITAD em lote (wishlist) |
| `GET/POST /api/sync/daily` | Gate 24h + orquestra sync |

## Status

- [x] Google OAuth
- [x] Steam biblioteca + wishlist
- [x] GOG biblioteca + wishlist (token)
- [x] Notas Metacritic + RAWG (biblioteca)
- [x] Preços IsThereAnyDeal (wishlist)
- [x] Sync diário ao abrir
- [ ] Epic Games (UI em breve + stub)
- [ ] Amazon Luna (UI em breve + stub)
- [ ] GG.deals, alertas, filtros, página de detalhe
