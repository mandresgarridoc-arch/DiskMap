#!/usr/bin/env bash
# Inicia DiskMap: instala dependencias si faltan y arranca el servidor.
set -e
cd "$(dirname "$0")"

if ! command -v node >/dev/null 2>&1; then
  echo "[ERROR] Node.js no esta instalado."
  echo "Instala Node.js 18+ desde https://nodejs.org y vuelve a ejecutar este script."
  exit 1
fi

if [ ! -d node_modules ]; then
  echo "Instalando dependencias por primera vez..."
  npm install
fi

echo "Iniciando DiskMap... (Ctrl+C para detener)"
npm start
