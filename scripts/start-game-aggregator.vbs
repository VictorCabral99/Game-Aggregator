' Launcher silencioso: sobe o Next (main), abre janela app e fecha ao sair
Set sh = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
ps1 = fso.GetParentFolderName(WScript.ScriptFullName) & "\start-game-aggregator.ps1"
' 0 = janela oculta; True = espera o PowerShell terminar
sh.Run "powershell.exe -NoProfile -ExecutionPolicy Bypass -File """ & ps1 & """", 0, True
