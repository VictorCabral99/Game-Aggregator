# Guia do usuário — Game Aggregator Launcher

Launcher unificado para Windows: biblioteca local + lojas + emulação + notas + wishlist,
com UX pensada para controle / TV.

## Instalação

1. Baixe o instalador NSIS da release (`Game Aggregator Launcher Setup x.y.z.exe`)
2. Se o SmartScreen avisar, veja [SMARTSCREEN.md](./SMARTSCREEN.md)
3. Abra o app — onboarding oferece sync Steam se detectado

## Atalhos — teclado

| Tecla | Ação |
|-------|------|
| Setas | Navegar na grade |
| Enter | Abrir ficha / jogar (no detalhe) |
| Esc | Fechar modal / voltar |
| Ctrl+N | Adicionar jogo local |
| Delete | Remover (com confirmação na ficha) |

## Atalhos — controle (XInput)

| Botão | Ação |
|-------|------|
| D-pad / stick | Mover foco |
| A | Confirmar / abrir / jogar |
| B | Voltar / fechar |
| X | Abrir ficha do foco |
| Y | Focar busca |
| Start | Configurações |
| Select | Emulação |

Aperte qualquer botão do controle com a janela em foco para ativar a navegação
(o app mostra um toast). Mouse só “rouba” o controle com clique ou movimento grande.

### Controle não responde?

1. Clique uma vez na janela do launcher e aperte **A** / stick
2. Se o **Steam** estiver aberto: em Configurações Steam → Controle → desative
   **Steam Input** para apps não-Steam (ou feche o Steam) — ele costuma “sequestrar” o pad
3. Preferência: mode **XInput** (Xbox / muitos pads USB). DualSense às vezes precisa
   do driver oficial da Sony
4. No DevTools (Ctrl+Shift+I): procure logs `[gamepad] conectado` / `ativo`

## Perfis

Em **Configurações → Perfil de Uso**:

- **Mesa** — UI compacta, mouse/teclado
- **TV** — cards grandes, fullscreen, cursor some
- **Handheld** — densidade intermediária

## Ordenar por nota

Com **Ordenar: nota (Steam %)**, a biblioteca agrupa em faixas colapsáveis (Excelente → Sem nota). Notas com **menos de 100 reviews** Steam vão para **Poucas reviews** no final — não sobem ao topo. Faixas ≥90 começam abertas.

## Steam AppID e SteamDB

O launcher resolve o **Steam AppID** de cada jogo (fonte Steam da biblioteca ou busca por título nas lojas Epic/GOG/Amazon/local). Jogos **só retro** ficam sem AppID.

Na ficha do jogo: campo **Steam AppID** + botão **SteamDB** (abre `steamdb.info/app/{id}/` no navegador). **Atualizar** na ficha força novo lookup daquele jogo.

## Sync e lojas

- **Sync tudo** — Steam + Epic/GOG/Amazon (sidecars em `resources/bin`)
- **Sync notas** — RAWG + Steam reviews (chave RAWG em Configurações)
- **Wishlist** — preços ITAD; opcional import da wishlist Steam

## Emulação

**Emulação** → escolha o console → pasta padrão drop-in de ROMs → Jogar.
Troque o emulador ativo do console sem reimportar.

## Backup offline

Configurações → **Exportar / Importar biblioteca** (JSON local, sem rede).

## Streaming

Configure Moonlight (path + host Sunshine) em Configurações e use **Stream**.

## Atualizações

No app instalado: Configurações → **Verificar atualizações** (electron-updater).
Em modo dev a verificação é ignorada de propósito.
