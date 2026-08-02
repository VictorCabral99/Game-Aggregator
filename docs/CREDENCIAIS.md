# Credenciais e configuração

Guia de como obter cada informação necessária para rodar o Game Aggregator.

Copie `.env.example` → `.env.local` e preencha conforme abaixo.

> **Importante:** use sempre a mesma porta do app em `NEXTAUTH_URL` (ex.: `http://localhost:3000`). Se o Next subir em outra porta, alinhe a variável ou mate processos extras.

---

## Obrigatórias (app básico)

### 1. `DATABASE_URL`

SQLite local. Pode deixar o padrão:

```env
DATABASE_URL="file:./dev.db"
```

---

### 2. `NEXTAUTH_URL` + `NEXTAUTH_SECRET`

- **`NEXTAUTH_URL`**: URL base do app, ex. `http://localhost:3000`
- **`NEXTAUTH_SECRET`**: string aleatória longa (pode gerar com `openssl rand -base64 32`)

---

### 3. Google OAuth — `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`

Login obrigatório do app.

1. Abra [Google Cloud Console](https://console.cloud.google.com/)
2. Crie um projeto (ou use um existente)
3. **APIs e serviços → Credenciais → Criar credenciais → ID do cliente OAuth**
4. Tipo: **Aplicativo da Web**
5. URI de redirecionamento autorizado:
   - `http://localhost:3000/api/auth/callback/google`
6. Copie **Client ID** e **Client Secret** para o `.env.local`

Na tela de consentimento OAuth, adicione seu e-mail como usuário de teste se o app estiver em modo Testing.

---

### 4. Steam — `STEAM_API_KEY`

Usada para biblioteca (`GetOwnedGames`) e nome do perfil.

1. Entre na Steam no navegador
2. Abra [https://steamcommunity.com/dev/apikey](https://steamcommunity.com/dev/apikey)
3. Domain Name: `localhost`
4. Aceite os termos e registre
5. Copie a chave (**32 caracteres hex**) para `STEAM_API_KEY`

**Requisitos / problemas comuns**

- Conta Steam **limited** (sem ~US$5 gastos) **não gera** API key
- A página pede login; sem sessão parece “quebrada”
- Sem chave válida a Steam conecta (OpenID), mas a biblioteca fica vazia (erro 401)

**Login no app:** botão **Entrar com Steam** (OpenID). Não precisa colar Steam ID.

**Wishlist:** perfil Steam com wishlist **pública**. O app usa `IWishlistService/GetWishlist` (a URL antiga `wishlist/wishlistdata` não funciona mais).

---

### 5. RAWG — `RAWG_API_KEY`

Notas da comunidade, Metacritic (via detalhes RAWG) e **% de reviews positivas da Steam** (botão **Buscar notas**). Jogos Steam usam o `appid` da biblioteca — a mesma base do SteamDB/store.

1. Conta em [rawg.io](https://rawg.io/)
2. Docs / API: [https://rawg.io/apidocs](https://rawg.io/apidocs)
3. Gere uma API key e coloque em `RAWG_API_KEY`

O fluxo faz **busca por título** → melhor match → **detalhes do jogo** (a busca listada muitas vezes vem com `metacritic: null`; o detalhe traz a nota Meta quando existir). A API antiga `backend.metacritic.com` não é mais usada.

---

### 6. IsThereAnyDeal — `ITAD_API_KEY` / `ITAD_COUNTRY`

Preços da wishlist (botão **Buscar preços**).

1. Crie um app em [https://isthereanydeal.com/apps/](https://isthereanydeal.com/apps/)
2. Copie a API key → `ITAD_API_KEY`
3. País: `ITAD_COUNTRY="BR"` (ou outro código ISO)

---

## Lojas (login no app)

### Steam

- **Env:** `STEAM_API_KEY` (acima)
- **No app:** Entrar com Steam → sync com **Buscar jogos nas lojas**

---

### GOG — `GOG_CLIENT_ID` / `GOG_CLIENT_SECRET` (opcional)

O app já usa o **client público Galaxy** (mesmo padrão Heroic/gogdl) se as variáveis estiverem vazias.

1. No app: **Entrar com GOG**
2. Abre o login oficial Galaxy
3. Após o login, a URL de sucesso contém o `code` (redirect `embed.gog.com/...`)
4. Cole a URL ou o código no formulário do app

**Não precisa** de client próprio para o fluxo bridge atual.

---

### Epic Games — `EPIC_CLIENT_ID` / `EPIC_CLIENT_SECRET` (opcional)

Defaults = client público **Legendary / Heroic**. Pode deixar vazio.

1. No app: **Entrar com Epic Games**
2. Abra o login Epic / legendary.gl
3. A Epic mostra um JSON com `authorizationCode` (não redireciona pro localhost)
4. Cole o JSON ou só o código no formulário
5. **Buscar jogos nas lojas** — títulos vêm do catálogo Epic

Códigos Epic **expiram rápido**; cole logo após gerar.

---

### Amazon Games — fluxo Nile / Heroic (recomendado)

**Não precisa** criar app no developer.amazon.com nem `AMAZON_CLIENT_ID`.

1. No dashboard: **Entrar** em Amazon Games  
2. Abre o login Amazon (launcher Sonic / Nile)  
3. Depois do login, copie a **URL completa** da barra (`amazon.com/?openid...authorization_code=...`)  
4. Cole no formulário e confirme  
5. **Buscar jogos nas lojas**

Códigos expiram rápido — cole logo após o login.

#### Variáveis LWA (opcional / legado)

`AMAZON_CLIENT_ID` / `SECRET` do Login with Amazon **não são mais necessárias** para o botão do app. O fluxo atual é device-auth estilo Nile.

---

## Variáveis opcionais

| Variável | Uso |
|----------|-----|
| `EPIC_LOCALE` | Locale do catálogo Epic (padrão `pt-BR`) |
| `EPIC_COUNTRY` | País do catálogo Epic (padrão `BR`) |

---

## Checklist rápido

| Item | Obrigatório? | Onde pegar |
|------|--------------|------------|
| Google Client ID/Secret | Sim | [Google Cloud Console](https://console.cloud.google.com/) |
| `NEXTAUTH_SECRET` | Sim | Gerar localmente |
| `STEAM_API_KEY` | Sim (p/ biblioteca Steam) | [steamcommunity.com/dev/apikey](https://steamcommunity.com/dev/apikey) |
| `RAWG_API_KEY` | Sim (p/ notas) | [rawg.io/apidocs](https://rawg.io/apidocs) |
| `ITAD_API_KEY` | Sim (p/ preços wishlist) | [isthereanydeal.com/apps](https://isthereanydeal.com/apps/) |
| GOG client | Não | Defaults Galaxy / bridge no app |
| Epic client | Não | Defaults Legendary / bridge no app |
| Amazon LWA | Não | Fluxo Nile no app (colar URL após login) |

---

## Depois de configurar

```bash
npm install
npx prisma generate
npx prisma db push
npm run dev
```

1. Entre com Google em http://localhost:3000  
2. Conecte as lojas no dashboard  
3. **Buscar jogos nas lojas** (biblioteca + wishlist Steam pública)  
4. **Buscar notas** (RAWG + Metacritic via detalhes RAWG)  
5. **Buscar preços** (IsThereAnyDeal na wishlist)
