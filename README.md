
# DiskMap - Analizador de Espacio en Disco

Borrador de aplicación para el ramo proyecto para ing. de Software.
La aplicación DiskMap, deberá permitir organizar el espacio del disco duro de una manera mas interactiva, fácil y rapida.
Nos permite ver el espacio de los discos a través de un treemap, o una lista que muestra el espacio de manera mas interactiva.
Borrador de proyecto realizado con IA, para fines educativos.

## Características

- 🔍 **Escaneo de unidades**: Selecciona un disco o carpeta para analizar
- 📊 **Visualización Treemap**: Mapa de árbol interactivo con colores por tipo de archivo
- 🗑️ **Gestión de archivos**: Mover a papelera, eliminar, abrir ubicación
- 🔎 **Filtrado dinámico**: Por categoría, tamaño y antigüedad
- 🌐 **Acceso web**: Servidor local, sin conexión a Internet requerida
- 📱 **Responsive**: Compatible con diferentes tamaños de pantalla

## Arquitectura

- **Cliente-Servidor**: Navegador web (cliente) + Servidor Node.js local (servidor)
- **Por capas**: Presentación, Lógica de aplicación, Acceso a sistema de archivos
- **Patrones de diseño**: Observer (actualización de estado) y Strategy (filtrado)

### Carga bajo demanda (escaneos de discos completos)

Escanear un disco completo puede producir cientos de miles de archivos y un árbol
de datos de cientos de MB. Para que la interfaz siga siendo rápida, el servidor
conserva el árbol completo en memoria y el navegador solicita solo lo que necesita:

- `GET /api/tree?path=...&depth=2&maxNodes=5000` → subárbol limitado para el treemap.
- `GET /api/children?path=...` → hijos directos de una carpeta para la lista.
- `GET /api/search?q=...` → búsqueda global paginada en todo el disco.
- `GET /api/scan/status` → estado ligero (sin el árbol completo).

Así, el WebSocket solo transmite progreso y un resumen del escaneo, nunca el árbol
completo. Esto evita que el navegador se congele al analizar unidades enteras.

## Requisitos

- Node.js 18+ 
- npm

## Instalación

```bash
cd "DiskLen prueba"
npm install
```

## Ejecución

```bash
npm start
```

El servidor se iniciará en un puerto disponible y abrirá automáticamente el navegador.

## Estructura del proyecto

```
disklen/
├── package.json
├── server.js              # Servidor Express + WebSocket
├── src/
│   ├── scanner.js         # Escaneo del sistema de archivos
│   ├── filters.js         # Patrón Strategy para filtrado
│   ├── fileOperations.js  # Operaciones de archivos
│   └── observer.js        # Patrón Observer para estado
├── public/
│   ├── index.html         # Interfaz web
│   ├── css/
│   │   └── styles.css     # Estilos
│   └── js/
│       ├── app.js         # Lógica principal
│       ├── treemap.js     # Visualización D3.js
│       ├── listview.js    # Vista de lista con barras de peso
│       └── observer.js    # Observer frontend
└── README.md
```

## Uso

1. Ejecuta `npm start`
2. El navegador se abrirá automáticamente
3. Selecciona una unidad o carpeta
4. Haz clic en "Iniciar escaneo"
5. Explora el **Treemap** (clic en una carpeta para acercarte) o cambia a la **Lista**
6. Usa la búsqueda global para encontrar archivos en todo el disco
7. Haz clic derecho sobre un archivo para ver sus opciones

> Las carpetas sin permisos se muestran con 🔒 en lugar de intentar elevar
> privilegios. Las carpetas y archivos de 0 bytes también se incluyen en el análisis.


