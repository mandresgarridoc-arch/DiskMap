
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

## Requisitos

- Node.js 18+ 
- npm

## Instalación

```bash
cd "DiskMap_prueba"
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
│       └── observer.js    # Observer frontend
└── README.md
```

## Uso

1. Ejecuta `npm start`
2. El navegador se abrirá automáticamente
3. Selecciona una unidad o carpeta
4. Haz clic en "Iniciar escaneo"
5. Explora la visualización treemap
6. Haz clic derecho sobre un archivo para ver opciones


