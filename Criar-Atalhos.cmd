@echo off
rem Cria o atalho "Code Room" na area de trabalho e no menu Iniciar (sem administrador).
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\criar-atalhos.ps1"
echo.
echo Pronto. Procure o icone "Code Room" na area de trabalho.
pause
