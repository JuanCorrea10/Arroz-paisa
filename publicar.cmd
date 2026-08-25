@echo off
REM ===========================================================================
REM  publicar.cmd  -  Subir los cambios, sin pelear con Windows.
REM
REM  Windows no deja correr scripts de PowerShell por defecto, y con razon:
REM  asi nadie ejecuta por accidente algo que le dejaron en una carpeta.
REM
REM  En vez de cambiarle esa configuracion a todo el computador, este archivo
REM  le dice a PowerShell "corre SOLO este, y solo esta vez". Es lo mismo pero
REM  sin bajarle la guardia a la maquina entera.
REM
REM  Se usa de dos formas:
REM     doble clic en este archivo
REM     o desde la terminal:   publicar "lo que cambio"
REM ===========================================================================
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0publicar.ps1" %*
if errorlevel 1 (
  echo.
  echo   Algo salio mal. Lea el mensaje de arriba.
  pause
)
