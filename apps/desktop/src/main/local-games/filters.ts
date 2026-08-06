/** Utilitários Windows / apps que não são jogo (pasta ou título). */
const NON_GAME_NAME =
  /^(calculadora|calculator|calc|notepad|bloco de notas|paint|mspaint|wordpad|snipping tool|ferramenta de corte|ferramenta de recorte|explorer|file explorer|cmd|command prompt|prompt de comando|powershell|windows terminal|terminal|settings|configurações|configuracoes|photos|fotos|mail|maps|mapas|clock|alarme|relógio|relogio|weather|tempo|camera|câmera|camera|microsoft store|store|edge|microsoft edge|chrome|firefox|brave|opera|spotify|discord|teams|zoom|skype|onedrive|dropbox|winrar|7-?zip|vlc|notepad\+\+|sublime text|visual studio code|code|task manager|gerenciador de tarefas)$/i;

const NON_GAME_EXE =
  /^(calc|calculatorapp|notepad|mspaint|paintstudio|wordpad|SnippingTool|ScreenSketch|explorer|cmd|powershell|WindowsTerminal|msedge|chrome|firefox|spotify|Discord|Teams|Zoom|OneDrive|WinRAR|7zFM|vlc|Code|Taskmgr)$/i;

function normalizeName(name: string): string {
  return name
    .replace(/\.exe$/i, '')
    .replace(/[._-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Pasta/título/exe de utilitário — não entra na biblioteca. */
export function isNonGameLocal(nameOrExe: string): boolean {
  const base = nameOrExe.replace(/^.*[/\\]/, '');
  const asTitle = normalizeName(base);
  if (NON_GAME_NAME.test(asTitle)) return true;
  if (/\.exe$/i.test(base) && NON_GAME_EXE.test(base.replace(/\.exe$/i, ''))) return true;
  return false;
}
