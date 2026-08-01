# Game Aggregator

Agregador de jogos de múltiplas plataformas (Steam, GOG, Epic, Amazon Luna) com notas de Metacritic, RAWG e GG.deals.

## Stack

- **Frontend:** Next.js 14+ (App Router) + TypeScript + Tailwind CSS
- **Backend:** Next.js API Routes
- **Banco de dados:** SQLite + Prisma ORM
- **Autenticação:** NextAuth.js com Google OAuth

## Configuração

### 1. Instalar dependências

```bash
cd game-aggregator
npm install
```

### 2. Configurar variáveis de ambiente

Crie o arquivo `.env` com o seguinte conteúdo (copie de `.env.example`):

```bash
# Database
DATABASE_URL="file:./dev.db"

# NextAuth
NEXTAUTH_URL="http://localhost:3000"
NEXTAUTH_SECRET="your-secret-key-here-change-this-in-production"

# Google OAuth
GOOGLE_CLIENT_ID="your-google-client-id"
GOOGLE_CLIENT_SECRET="your-google-client-secret"

# Steam API
STEAM_API_KEY="your-steam-api-key"

# RAWG API
RAWG_API_KEY="your-rawg-api-key"
```

Você precisa configurar:

- **SQLite:** O banco de dados será criado automaticamente como `dev.db`
- **NextAuth:** URL e secret (gere um secret aleatório para produção)
- **Google OAuth:** Client ID e Secret (obter em https://console.cloud.google.com)
- **Steam API Key:** Obter em https://steamcommunity.com/dev/apikey
- **RAWG API Key:** Obter em https://rawg.io/apidocs

### 3. Configurar banco de dados

```bash
npx prisma generate
npx prisma db push
```

O SQLite será configurado automaticamente e o arquivo `dev.db` será criado no diretório `prisma/`.

### 4. Rodar o projeto

```bash
npm run dev
```

Acesse http://localhost:3000

## Funcionalidades Atuais

✅ Autenticação com Google OAuth
✅ Integração com Steam Web API
✅ Busca de jogos na biblioteca Steam
✅ Integração com RAWG API
✅ Integração com Metacritic (backend não-oficial)
✅ Sistema de agregação de notas (média ponderada)
✅ Dashboard com lista de jogos e notas
✅ Visualização de notas por fonte (Metacritic, RAWG)
✅ Botão para atualizar notas de cada jogo
✅ Estrutura para integração Amazon Luna

## Próximos Passos

- [ ] Integração GOG (API não-oficial)
- [ ] Integração Epic Games (requer onboarding)
- [ ] Integração Amazon Luna (testar endpoints)
- [ ] Integração GG.deals para preços
- [ ] Sistema de busca e filtros
- [ ] Página de detalhes do jogo
- [ ] Gráficos e estatísticas

## Como obter o Steam ID

1. Acesse https://steamcommunity.com/
2. Faça login
3. Vá ao seu perfil
4. O ID está na URL: `https://steamcommunity.com/profiles/SEU_STEAM_ID`

Ou use uma calculadora de Steam ID64: https://steamid.xyz/
