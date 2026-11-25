@echo off
setlocal
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo [ERROR] Node.js no esta instalado.
  echo Descargalo desde https://nodejs.org ^(version LTS^) y vuelve a ejecutar este archivo.
  echo.
  pause
  exit /b 1
)

if not exist "node_modules" (
  echo Instalando dependencias por primera vez...
  call npm install
  if errorlevel 1 (
    echo.
    echo [ERROR] No se pudieron instalar las dependencias.
    echo Revisa tu conexion a Internet e intenta de nuevo.
    echo.
    pause
    exit /b 1
  )
)

echo.
echo Iniciando DiskMap...
echo Cuando termines, presiona Ctrl+C para detener el servidor.
echo.
call npm start
