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

## Perfis

Em **Configurações → Perfil de Uso**:

- **Mesa** — UI compacta, mouse/teclado
- **TV** — cards grandes, fullscreen, cursor some
- **Handheld** — densidade intermediária

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
