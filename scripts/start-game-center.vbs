' Launcher silencioso: sobe o Game Center (Electron / develop)
Set sh = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
ps1 = fso.GetParentFolderName(WScript.ScriptFullName) & "\start-game-center.ps1"
sh.Run "powershell.exe -NoProfile -ExecutionPolicy Bypass -File """ & ps1 & """", 0, True
