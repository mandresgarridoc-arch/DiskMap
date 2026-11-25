# DiskMap — Analizador de espacio en disco

DiskMap es una aplicación web local que permite ver qué está ocupando el espacio
de un disco o carpeta. Escanea el sistema de archivos y muestra el resultado como
un **treemap interactivo** o como una **lista con barras de peso**, sin enviar
datos a Internet y sin instalar una aplicación de escritorio pesada.

Proyecto del ramo **Ingeniería de Software** — Evaluación 2.

- Treemap interactivo con zoom, colores por tipo de archivo y tooltips.
- Lista ordenable con barra de peso relativo por archivo o carpeta.
- Búsqueda global en todo el disco y filtros por categoría, tamaño y antigüedad.
- Gestión segura de archivos: mover a papelera, eliminar, abrir ubicación e información.
- Carpetas sin permisos visibles con 🔒 (no se fuerza la elevación de privilegios).
- Todo local: la interfaz se abre en `http://localhost`.

---

## 1. Qué hay que instalar

| Software | Obligatorio | Versión | Para qué |
|---|---|---|---|
| **Node.js** (incluye npm) | Sí | **18 o superior** (se recomienda LTS) | Ejecutar el servidor local y instalar dependencias |
| Navegador web | Sí | Chrome, Edge o Firefox actualizado | Ver la interfaz |
| Git | No | Cualquiera | Solo si vas a clonar el repositorio en vez de descargar el ZIP |

No se necesita:

- ❌ Base de datos (no usa MySQL, PostgreSQL ni SQLite).
- ❌ Python, Java ni .NET.
- ❌ Permisos de administrador.
- ❌ Conexión a Internet después de instalado (D3 está incluido localmente).

Las dependencias de Node (`express`, `ws`, `trash`) se instalan solas con
`npm install` dentro de la carpeta del proyecto.

### Instalar Node.js

**Windows**

1. Descarga el instalador LTS desde <https://nodejs.org>.
2. Ejecuta el instalador y deja las opciones por defecto (agrega Node al PATH).
3. Abre **PowerShell** y verifica:

   ```powershell
   node -v
   npm -v
   ```

   Debe mostrar `v18.x` o superior.

   También puedes instalarlo con winget:

   ```powershell
   winget install OpenJS.NodeJS.LTS
   ```

**Linux (Debian/Ubuntu)**

```bash
sudo apt update
sudo apt install -y nodejs npm
node -v
```

Si la versión es menor a 18, instala la LTS con NodeSource o con `nvm`.

**macOS**

Descarga el instalador LTS desde <https://nodejs.org> o usa Homebrew:

```bash
brew install node
node -v
```

---

## 2. Obtener el proyecto

Elige **una** de las dos opciones.

### Opción A — Clonar con Git

```bash
git clone https://github.com/mandresgarridoc-arch/DiskMap.git
cd DiskMap
```

### Opción B — Descargar el ZIP

1. Entra al repositorio en GitHub.
2. **Code → Download ZIP**.
3. Descomprime el archivo, por ejemplo en `C:\DiskMap`.
4. Abre una terminal **dentro de esa carpeta** (en Windows: clic derecho →
   *Abrir en Terminal*, o `cd C:\DiskMap` en PowerShell).

> La carpeta puede tener cualquier nombre y estar en cualquier ruta; no depende
> de la carpeta original de desarrollo.

---

## 3. Instalar dependencias

Desde la carpeta del proyecto:

```bash
npm install
```

Esto descarga `express`, `ws` y `trash` dentro de `node_modules/`. Solo es
necesario la primera vez (o cuando cambien las dependencias).

Si tienes el archivo `package-lock.json` y quieres una instalación reproducible:

```bash
npm ci
```

> **¿Y un `requirements.txt`?** Ese formato es de Python. En Node.js el
> equivalente ya está en el proyecto: `package.json` declara las dependencias
> (`express`, `ws`, `trash`) y `package-lock.json` fija las versiones exactas.
> `npm install` lee ambos archivos e instala todo; no hay que crear nada más.

**Windows — si PowerShell bloquea `npm.ps1`:**

```powershell
npm.cmd install
```

o, si prefieres habilitar scripts:

```powershell
Set-ExecutionPolicy -Scope CurrentUser RemoteSigned
```

---

## 4. Ejecutar el programa

### Instalación y arranque en un solo paso

El proyecto incluye scripts que verifican Node, instalan las dependencias si
faltan y arrancan el servidor:

**Windows** — doble clic en `iniciar.bat`, o desde la terminal:

```powershell
.\iniciar.bat
```

**Linux / macOS:**

```bash
chmod +x iniciar.sh   # solo la primera vez
./iniciar.sh
```

Si Node.js no está instalado, el script lo indica y se detiene sin dejar nada a
medias.

### Ejecución manual

Si prefieres hacerlo paso a paso:

```bash
npm start
```

Qué ocurre:

1. Se inicia un servidor local en `127.0.0.1`.
2. El puerto se elige automáticamente (no hay que configurarlo).
3. La consola muestra la dirección, por ejemplo:

   ```
   ╔══════════════════════════════════════════╗
   ║            DiskMap - Disk Analyzer         ║
   ╠══════════════════════════════════════════╣
   ║  Server running at: http://localhost:54321  ║
   ║  Press Ctrl+C to stop                     ║
   ╚══════════════════════════════════════════╝
   ```

4. El navegador se abre solo. Si no lo hace, copia esa URL y ábrela a mano.

Para detener el servidor: **Ctrl + C** en la terminal.

Para volver a usarlo otro día: abre la terminal en la carpeta y ejecuta
`npm start`. No hace falta repetir `npm install`.

### Usar un puerto fijo (opcional)

**PowerShell (Windows):**

```powershell
$env:PORT=3000; npm start
```

**Linux / macOS:**

```bash
PORT=3000 npm start
```

Luego abre `http://localhost:3000`.

> El servidor escucha solo en `127.0.0.1`: no queda expuesto a la red local ni a
> Internet, y normalmente no genera avisos del firewall.

---

## 5. Primer uso

1. Selecciona una unidad (por ejemplo `C:`) o una carpeta con el explorador.
2. Haz clic en **Iniciar escaneo** y espera el progreso.
3. Revisa las estadísticas: archivos, tamaño total, carpetas, archivo más grande
   y carpetas sin acceso.
4. Explora el **Treemap**: el área es proporcional al tamaño y el color indica el
   tipo de archivo. Haz clic en una carpeta para acercarte y usa la ruta de
   navegación (breadcrumb) para volver.
5. Cambia a **Lista** para ver el peso relativo con barras y ordenar por tamaño.
6. Usa la **búsqueda global** y los **filtros** por categoría, tamaño o antigüedad.
7. Haz clic derecho sobre un archivo para moverlo a la papelera, eliminarlo,
   abrir su ubicación o ver su información.

**Prueba rápida recomendada:** escanea una carpeta pequeña (Descargas o
`C:\Windows\Fonts`) antes de lanzar un disco completo.

**Tiempo de referencia:** un disco `C:` con ~450.000 archivos tarda alrededor de
90 segundos. La interfaz sigue respondiendo durante el escaneo.

> Las carpetas del sistema sin permisos se muestran con 🔒 y no se fuerzan. Si
> necesitas analizarlas, ejecuta la terminal como administrador bajo tu criterio.

---

## 6. Solución de problemas

| Síntoma | Causa probable | Solución |
|---|---|---|
| `node` o `npm` no se reconoce | Node no está instalado o la terminal es anterior a la instalación | Instala Node LTS y **abre una terminal nueva** |
| `npm.ps1 cannot be loaded` | Política de ejecución de PowerShell | Usa `npm.cmd install` / `npm.cmd start` o aplica `Set-ExecutionPolicy` |
| `npm install` falla con errores de red | Proxy, firewall o antivirus | Revisa la conexión, configura el proxy de npm o prueba desde otra red |
| El navegador no se abre | El comando de apertura automática falló | Abre manualmente la URL que muestra la consola |
| El puerto aparece ocupado | Otro proceso usa ese puerto | DiskMap elige otro automáticamente; si fijaste `PORT`, cámbialo |
| El escaneo muestra carpetas con 🔒 | Permisos de Windows | Es el comportamiento esperado; no se eleva privilegios |
| `EPERM` o `EACCES` al borrar | Archivo en uso o sin permisos | Cierra el programa que lo usa o ejecuta como administrador |
| No aparece la papelera en Linux | Falta una implementación de papelera | Instala `trash-cli` o usa la eliminación permanente |
| La página queda en blanco | WebSocket bloqueado | La app reintenta por polling; recarga la página |
| Antivirus advierte sobre Node | Servidor local escuchando | Permite `node.exe` en la red privada/local |

---

## 7. Actualizar el proyecto

Si instalaste con Git:

```bash
git pull
npm install
npm start
```

Si usaste el ZIP, descarga la nueva versión, reemplaza los archivos y ejecuta
`npm install` otra vez.

---

## 8. Desinstalar

1. Detén el servidor con **Ctrl + C**.
2. Borra la carpeta del proyecto.

DiskMap no crea servicios, tareas programadas ni archivos fuera de su carpeta.
Los resultados de los escaneos viven solo en memoria y desaparecen al cerrar el
servidor.

---

## 9. Estructura del proyecto

```
DiskMap/
├── package.json
├── package-lock.json
├── iniciar.bat            # Instala y arranca en Windows (doble clic)
├── iniciar.sh             # Instala y arranca en Linux/macOS
├── server.js              # Servidor Express + WebSocket
├── src/
│   ├── scanner.js         # Escaneo recursivo del sistema de archivos
│   ├── filters.js         # Patrón Strategy para filtrado
│   ├── fileOperations.js  # Papelera, eliminar, abrir, información
│   └── observer.js        # Patrón Observer para el estado del escaneo
├── public/
│   ├── index.html         # Interfaz web
│   ├── css/
│   │   └── styles.css     # Estilos
│   └── js/
│       ├── app.js         # Lógica principal del cliente
│       ├── treemap.js     # Visualización D3.js
│       ├── listview.js    # Vista de lista con barras de peso
│       ├── observer.js    # Observer del frontend
│       └── d3.v7.min.js   # D3 incluido localmente (sin CDN)
├── docs/
│   ├── PRESENTACION.md    # Guion de presentación
│   ├── presentacion.html  # Deck proyectable
│   └── presentacion.pdf   # Respaldo en PDF
└── README.md
```

---

## 10. Arquitectura

- **Cliente-servidor:** navegador (HTML + CSS + JS + D3) ↔ servidor Node.js local.
- **Tres capas:** presentación (`public/`), lógica de aplicación (`src/`) y acceso
  al sistema de archivos (`fs`, `path`, `child_process`).
- **Patrones:** Observer (progreso y estado del escaneo) y Strategy (filtros).
- **Sin base de datos:** el origen de la verdad es el sistema de archivos y el
  análisis es efímero. El árbol completo se mantiene en memoria en el servidor.

### Carga bajo demanda

Escanear un disco completo puede generar cientos de miles de nodos. Para que el
navegador no se congele, el servidor conserva el árbol y entrega solo porciones:

- `GET /api/tree?path=...&depth=2&maxNodes=5000` → subárbol para el treemap.
- `GET /api/children?path=...` → hijos directos para la lista.
- `GET /api/search?q=...` → búsqueda global paginada.
- `GET /api/scan/status` → estado ligero, sin el árbol completo.

El WebSocket solo transmite progreso y un resumen del escaneo.

---

## 11. Requisitos técnicos del escaneo

- Recorrido recursivo con `fs.promises.readdir(..., { withFileTypes: true })`.
- Tamaños de carpetas calculados de abajo hacia arriba.
- Archivos y carpetas de **0 bytes** se conservan.
- Enlaces simbólicos omitidos para evitar bucles y resultados inconsistentes.
- Indicador `verified` que compara el conteo del árbol con el contador real.
- Carpetas sin permisos visibles con 🔒, sin elevar privilegios.

---

## Licencia

MIT. Proyecto con fines educativos.
