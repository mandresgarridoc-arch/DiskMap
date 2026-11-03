// public/js/app.js
// Main application logic - Presentation Layer

// State
let ws = null;
let currentTree = null;
let selectedPath = null;
let selectedDrive = null;
let treemap = null;
let listView = null;
let currentView = 'treemap';
let currentFilter = {};

// Initialize
document.addEventListener('DOMContentLoaded', () => {
  treemap = new TreemapViz('treemap', 'tooltip');
  treemap.onFileAction = handleFileAction;
  listView = new ListView('listView');
  listView.onFileAction = handleFileAction;

  initWebSocket();
  loadDrives();
  setupEventListeners();
  setupContextMenu();
  setupModals();
  setupResize();
});

// WebSocket connection
function initWebSocket() {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  ws = new WebSocket(`${protocol}//${window.location.host}`);

  ws.onopen = () => console.log('WebSocket connected');
  ws.onmessage = (event) => {
    const msg = JSON.parse(event.data);
    handleWsMessage(msg);
  };
  ws.onclose = () => {
    console.log('WebSocket disconnected, reconnecting...');
    setTimeout(initWebSocket, 2000);
  };
  ws.onerror = (err) => console.error('WebSocket error:', err);
}

function handleWsMessage(msg) {
  switch (msg.type) {
    case 'state':
    case 'status':
      updateProgressUI(msg.data);
      break;
    case 'progress':
      updateProgressUI(msg.data);
      break;
    case 'complete':
      handleScanComplete(msg.data);
      break;
    case 'cancelled':
      handleScanCancelled();
      break;
    case 'error':
      handleScanError(msg.data);
      break;
    case 'reset':
      resetUI();
      break;
  }
}

// Load drives
async function loadDrives() {
  try {
    const res = await fetch('/api/drives');
    const data = await res.json();
    if (data.success) {
      renderDrives(data.drives);
    }
  } catch (err) {
    console.error('Error loading drives:', err);
    document.getElementById('drivesList').innerHTML = '<div class="loading">Error al cargar unidades</div>';
  }
}

function renderDrives(drives) {
  const container = document.getElementById('drivesList');
  if (!drives || drives.length === 0) {
    container.innerHTML = '<div class="loading">No se encontraron unidades</div>';
    return;
  }
  container.innerHTML = drives.map(d => `
    <div class="drive-item" data-path="${escapeHtml(d.path)}" data-name="${escapeHtml(d.name)}">
      <span class="drive-icon">💿</span>
      <div>
        <div class="drive-name">${escapeHtml(d.name)}</div>
        <div class="drive-path">${escapeHtml(d.path)}</div>
      </div>
    </div>
  `).join('');

  container.querySelectorAll('.drive-item').forEach(item => {
    item.addEventListener('click', () => {
      container.querySelectorAll('.drive-item').forEach(i => i.classList.remove('selected'));
      item.classList.add('selected');
      selectedPath = item.dataset.path;
      selectedDrive = item.dataset.name;
      document.getElementById('folderPath').value = selectedPath;
    });
  });
}

// Event listeners
function setupEventListeners() {
  document.getElementById('btnScan').addEventListener('click', startScan);
  document.getElementById('btnCancel').addEventListener('click', cancelScan);
  document.getElementById('btnBrowse').addEventListener('click', openBrowseModal);
  document.getElementById('btnApplyFilter').addEventListener('click', applyFilters);
  document.getElementById('btnClearFilter').addEventListener('click', clearFilters);
  document.getElementById('btnTheme').addEventListener('click', toggleTheme);

  // View toggle
  document.getElementById('btnViewTreemap').addEventListener('click', () => switchView('treemap'));
  document.getElementById('btnViewList').addEventListener('click', () => switchView('list'));

  // List view controls
  document.getElementById('listSearch').addEventListener('input', (e) => {
    if (listView) listView.setSearch(e.target.value);
  });
  document.getElementById('globalSearch').addEventListener('input', (e) => {
    if (listView) listView.setGlobalSearch(e.target.value);
  });
  document.getElementById('listPageSize').addEventListener('change', (e) => {
    if (listView) listView.setPageSize(e.target.value);
  });
  document.getElementById('compactMode').addEventListener('change', (e) => {
    if (listView) listView.setCompact(e.target.checked);
  });

  // Size filter change
  document.getElementById('sizeFilter').addEventListener('change', () => {});
}

async function startScan() {
  const path = document.getElementById('folderPath').value.trim();
  if (!path) {
    alert('Seleccione una unidad o carpeta primero');
    return;
  }

  document.getElementById('btnScan').style.display = 'none';
  document.getElementById('btnCancel').style.display = 'block';
  document.getElementById('progressSection').style.display = 'block';
  document.getElementById('statsSection').style.display = 'none';

  try {
    const res = await fetch('/api/scan/start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path })
    });
    const data = await res.json();
    if (!data.success) {
      alert(data.message || 'Error al iniciar escaneo');
      resetScanButtons();
    }
  } catch (err) {
    alert('Error de conexión: ' + err.message);
    resetScanButtons();
  }
}

async function cancelScan() {
  try {
    await fetch('/api/scan/cancel', { method: 'POST' });
  } catch (err) {
    console.error('Error cancelling:', err);
  }
}

function updateProgressUI(state) {
  if (!state) return;
  const progressText = document.getElementById('progressText');
  const progressCount = document.getElementById('progressCount');
  const progressFill = document.getElementById('progressFill');
  const progressPath = document.getElementById('progressPath');

  if (state.status === 'scanning') {
    progressText.textContent = 'Escaneando...';
    progressCount.textContent = `${state.filesScanned.toLocaleString()} archivos`;
    progressPath.textContent = state.currentPath || '';
    // Indeterminate progress
    progressFill.style.width = '100%';
    progressFill.style.animation = 'pulse 1.5s ease-in-out infinite';
  }
}

function handleScanComplete(state) {
  resetScanButtons();
  document.getElementById('progressSection').style.display = 'none';

  if (state && state.result) {
    currentTree = state.result;
    renderStats(state.result);
    document.getElementById('statsSection').style.display = 'grid';
    renderCurrentView();
  }
}

function handleScanCancelled() {
  resetScanButtons();
  document.getElementById('progressSection').style.display = 'none';
  alert('Escaneo cancelado');
}

function handleScanError(state) {
  resetScanButtons();
  document.getElementById('progressSection').style.display = 'none';
  alert('Error: ' + (state ? state.error : 'Error desconocido'));
}

function resetScanButtons() {
  document.getElementById('btnScan').style.display = 'block';
  document.getElementById('btnCancel').style.display = 'none';
}

function resetUI() {
  currentTree = null;
  document.getElementById('statsSection').style.display = 'none';
  document.getElementById('progressSection').style.display = 'none';
  treemap.container.innerHTML = '<div class="empty-state"><div class="empty-state-icon">📊</div><h3>Sin datos</h3><p>Escanee una carpeta para ver la visualización</p></div>';
  listView.container.innerHTML = '<div class="empty-state"><div class="empty-state-icon">📋</div><h3>Sin datos</h3><p>Escanee una carpeta para ver la lista</p></div>';
  resetScanButtons();
}

function renderStats(tree) {
  if (!tree) return;
  let fileCount = 0;
  let dirCount = 0;
  let largestFile = null;

  function walk(node) {
    if (node.type === 'file') {
      fileCount++;
      if (!largestFile || node.size > largestFile.size) largestFile = node;
    } else if (node.type === 'directory') {
      dirCount++;
      (node.children || []).forEach(walk);
    }
  }
  walk(tree);

  document.getElementById('statFiles').textContent = fileCount.toLocaleString();
  document.getElementById('statSize').textContent = formatBytes(tree.size);
  document.getElementById('statDirs').textContent = dirCount.toLocaleString();
  document.getElementById('statLargest').textContent = largestFile ? largestFile.name : '-';
  const skipped = (tree._stats && tree._stats.skippedDirs) || 0;
  document.getElementById('statSkipped').textContent = skipped.toLocaleString();
}

// Filters
async function applyFilters() {
  if (!currentTree) {
    alert('No hay datos para filtrar. Realice un escaneo primero.');
    return;
  }

  // Collect filter criteria
  const categories = Array.from(document.querySelectorAll('.cat-filter:checked')).map(cb => cb.value);
  const sizeValue = document.getElementById('sizeFilter').value;
  const ageValue = document.getElementById('ageFilter').value;

  currentFilter = {};
  if (categories.length > 0) currentFilter.categories = categories;

  // Handle size filter
  if (sizeValue === 'empty') {
    currentFilter.sizeMode = 'empty';
  } else if (sizeValue === 'small') {
    currentFilter.maxSize = 1048576;
  } else if (sizeValue === 'medium') {
    currentFilter.minSize = 1048576;
    currentFilter.maxSize = 104857600;
  } else if (sizeValue === 'large') {
    currentFilter.minSize = 104857600;
  } else if (sizeValue !== 'all' && !isNaN(parseInt(sizeValue))) {
    currentFilter.minSize = parseInt(sizeValue);
  }

  if (ageValue) {
    currentFilter.ageDays = parseInt(ageValue);
    currentFilter.ageMode = 'older';
  }

  applyFiltersToTree();
}

function applyFiltersToTree() {
  if (!currentTree) return;
  renderCurrentView();
}

function createFilterManager(filters) {
  // Simple client-side filter manager
  return {
    applyToTree(node) {
      if (!node) return null;
      if (node.type === 'file') {
        if (this.matches(node)) return { ...node };
        return null;
      }
      const filteredChildren = (node.children || [])
        .map(c => this.applyToTree(c))
        .filter(Boolean);
      // Always keep empty directories and locked folders visible
      const isEmptyDir = (!node.children || node.children.length === 0);
      const isLocked = node.locked === true;
      if (filteredChildren.length === 0 && (isEmptyDir || isLocked)) {
        // Keep if no restrictive filter is active, or if filtering by empty
        const restrictiveFilter = (filters.sizeMode && filters.sizeMode !== 'empty') ||
          (filters.minSize && filters.minSize > 0) ||
          (filters.maxSize !== undefined && filters.maxSize !== Infinity && filters.maxSize < 1) ||
          (filters.categories && filters.categories.length > 0) ||
          filters.ageDays;
        if (!restrictiveFilter || filters.sizeMode === 'empty') {
          return { ...node, children: [], size: 0, locked: isLocked };
        }
        return null;
      }
      return { ...node, children: filteredChildren, size: filteredChildren.reduce((s, c) => s + (c.size || 0), 0) };
    },
    matches(file) {
      if (filters.categories && filters.categories.length > 0) {
        if (!filters.categories.includes(file.category)) return false;
      }
      if (filters.sizeMode === 'empty') {
        if (file.size !== 0) return false;
      }
      if (filters.minSize) {
        if (file.size < filters.minSize) return false;
      }
      if (filters.maxSize !== undefined) {
        if (file.size > filters.maxSize) return false;
      }
      if (filters.ageDays) {
        const threshold = Date.now() - (filters.ageDays * 24 * 60 * 60 * 1000);
        if (filters.ageMode === 'older') {
          if (file.modified >= threshold) return false;
        } else {
          if (file.modified < threshold) return false;
        }
      }
      return true;
    }
  };
}

async function clearFilters() {
  document.querySelectorAll('.cat-filter').forEach(cb => cb.checked = false);
  document.getElementById('sizeFilter').value = '0';
  document.getElementById('ageFilter').value = '';
  currentFilter = {};
  if (currentTree) {
    renderCurrentView();
  }
}

// View switching
function switchView(view) {
  currentView = view;
  document.getElementById('btnViewTreemap').classList.toggle('active', view === 'treemap');
  document.getElementById('btnViewList').classList.toggle('active', view === 'list');

  const treemapContainer = document.getElementById('treemapContainer');
  const listContainer = document.getElementById('listContainer');

  if (view === 'treemap') {
    treemapContainer.style.display = 'block';
    listContainer.style.display = 'none';
  } else {
    treemapContainer.style.display = 'none';
    listContainer.style.display = 'flex';
  }

  renderCurrentView();
}

function renderCurrentView() {
  if (!currentTree) return;

  // Apply filters
  const fm = createFilterManager(currentFilter);
  const filtered = fm.applyToTree(currentTree);
  const dataToRender = filtered || currentTree;

  if (currentView === 'treemap') {
    treemap.render(dataToRender);
  } else {
    listView.render(dataToRender);
  }
}

// File actions
function handleFileAction(action, fileData) {
  if (action === 'info') {
    showFileInfo(fileData.path, fileData.locked === true);
  } else if (action === 'location') {
    fetch('/api/file/open-location', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: fileData.path })
    });
  }
}

function showContextMenuForFile(fileData) {
  // Used by treemap context menu
}

// Context Menu
function setupContextMenu() {
  const menu = document.getElementById('contextMenu');
  document.addEventListener('click', () => {
    menu.style.display = 'none';
  });

  menu.querySelectorAll('.context-item').forEach(item => {
    item.addEventListener('click', async (e) => {
      e.stopPropagation();
      const action = item.dataset.action;
      const filePath = menu.dataset.filePath;
      menu.style.display = 'none';

      switch (action) {
        case 'trash':
          if (confirm('¿Mover a la papelera?')) {
            const res = await fetch('/api/file/trash', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ path: filePath })
            });
            const data = await res.json();
            if (data.success) alert('Movido a la papelera');
            else alert('Error: ' + data.message);
          }
          break;
        case 'delete':
          if (confirm('¿ELIMINAR PERMANENTEMENTE? Esta acción no se puede deshacer.')) {
            const res = await fetch('/api/file/delete', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ path: filePath })
            });
            const data = await res.json();
            if (data.success) alert('Eliminado permanentemente');
            else alert('Error: ' + data.message);
          }
          break;
        case 'location':
          await fetch('/api/file/open-location', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ path: filePath })
          });
          break;
        case 'open':
          await fetch('/api/file/open', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ path: filePath })
          });
          break;
        case 'info':
          showFileInfo(filePath);
          break;
      }
    });
  });
}

async function showFileInfo(filePath, locked) {
  if (locked) {
    // Mostrar info de carpeta bloqueada sin llamar al API
    document.getElementById('infoContent').innerHTML = `
      <div class="info-row"><span class="info-label">Ruta</span><span class="info-value">${escapeHtml(filePath)}</span></div>
      <div class="info-row"><span class="info-label">Estado</span><span class="info-value" style="color:var(--warning);">🔒 Sin permisos de lectura</span></div>
      <div class="info-row"><span class="info-label">Motivo</span><span class="info-value">El sistema operativo no permite acceder a esta carpeta</span></div>
      <div class="info-row"><span class="info-label">Sugerencia</span><span class="info-value">Ejecute la aplicación como administrador si necesita analizar esta carpeta</span></div>
    `;
    document.getElementById('infoModal').style.display = 'flex';
    return;
  }
  try {
    const res = await fetch(`/api/file/info?path=${encodeURIComponent(filePath)}`);
    const data = await res.json();
    if (data.success) {
      const info = data.info;
      if (info.locked) {
        document.getElementById('infoContent').innerHTML = `
          <div class="info-row"><span class="info-label">Nombre</span><span class="info-value">${escapeHtml(info.name)}</span></div>
          <div class="info-row"><span class="info-label">Ruta</span><span class="info-value">${escapeHtml(info.path)}</span></div>
          <div class="info-row"><span class="info-label">Estado</span><span class="info-value" style="color:var(--warning);">🔒 Sin permisos de lectura</span></div>
          <div class="info-row"><span class="info-label">Motivo</span><span class="info-value">El sistema operativo no permite acceder a esta carpeta</span></div>
        `;
      } else {
        document.getElementById('infoContent').innerHTML = `
          <div class="info-row"><span class="info-label">Nombre</span><span class="info-value">${escapeHtml(info.name)}</span></div>
          <div class="info-row"><span class="info-label">Ruta</span><span class="info-value">${escapeHtml(info.path)}</span></div>
          <div class="info-row"><span class="info-label">Tamaño</span><span class="info-value">${formatBytes(info.size)}</span></div>
          <div class="info-row"><span class="info-label">Tipo</span><span class="info-value">${info.isDirectory ? 'Carpeta' : 'Archivo'}</span></div>
          <div class="info-row"><span class="info-label">Modificado</span><span class="info-value">${new Date(info.modified).toLocaleString()}</span></div>
          <div class="info-row"><span class="info-label">Creado</span><span class="info-value">${new Date(info.created).toLocaleString()}</span></div>
        `;
      }
      document.getElementById('infoModal').style.display = 'flex';
    }
  } catch (err) {
    alert('Error al obtener información: ' + err.message);
  }
}

// Folder browser modal
let browseCurrentPath = null;
let browseSelectedPath = null;

function openBrowseModal() {
  browseCurrentPath = selectedPath || (window.navigator.platform.includes('Win') ? 'C:\\' : '/');
  browseSelectedPath = browseCurrentPath;
  document.getElementById('browseModal').style.display = 'flex';
  loadBrowseDir(browseCurrentPath);
}

async function loadBrowseDir(dirPath) {
  try {
    const res = await fetch(`/api/browse?path=${encodeURIComponent(dirPath)}`);
    const data = await res.json();
    if (data.success) {
      browseCurrentPath = data.path;
      document.getElementById('browsePath').textContent = data.path;
      const list = document.getElementById('browseList');
      list.innerHTML = '';

      // Parent directory
      const parent = getParentPath(data.path);
      if (parent && parent !== data.path) {
        const parentItem = document.createElement('div');
        parentItem.className = 'browse-item';
        parentItem.innerHTML = '<span class="browse-icon">⬆️</span><span>.. (carpeta superior)</span>';
        parentItem.addEventListener('click', () => loadBrowseDir(parent));
        list.appendChild(parentItem);
      }

      data.entries.forEach(entry => {
        const item = document.createElement('div');
        item.className = 'browse-item';
        item.innerHTML = `<span class="browse-icon">📁</span><span>${escapeHtml(entry.name)}</span>`;
        item.addEventListener('click', () => {
          list.querySelectorAll('.browse-item').forEach(i => i.classList.remove('selected'));
          item.classList.add('selected');
          browseSelectedPath = entry.path;
          // Double click to navigate
        });
        item.addEventListener('dblclick', () => loadBrowseDir(entry.path));
        list.appendChild(item);
      });

      browseSelectedPath = data.path;
    }
  } catch (err) {
    console.error('Browse error:', err);
  }
}

function getParentPath(p) {
  const parts = p.replace(/\\/g, '/').split('/').filter(Boolean);
  if (parts.length <= 1) {
    if (p.includes(':\\')) return p.split(':')[0] + ':\\';
    return '/';
  }
  parts.pop();
  let parent = parts.join('/');
  if (p.includes(':\\')) {
    // Windows
    if (parts.length === 1) parent = parts[0] + ':\\';
    else parent = parts.join('\\');
  }
  return parent || '/';
}

// Modal setup
function setupModals() {
  document.querySelectorAll('.modal-close').forEach(btn => {
    btn.addEventListener('click', () => {
      btn.closest('.modal').style.display = 'none';
    });
  });

  document.getElementById('btnSelectFolder').addEventListener('click', () => {
    if (browseSelectedPath) {
      selectedPath = browseSelectedPath;
      document.getElementById('folderPath').value = selectedPath;
      // Update selected drive item
      document.querySelectorAll('.drive-item').forEach(i => i.classList.remove('selected'));
    }
    document.getElementById('browseModal').style.display = 'none';
  });

  document.getElementById('btnCancelBrowse').addEventListener('click', () => {
    document.getElementById('browseModal').style.display = 'none';
  });

  // Close modal on outside click
  document.querySelectorAll('.modal').forEach(modal => {
    modal.addEventListener('click', (e) => {
      if (e.target === modal) modal.style.display = 'none';
    });
  });
}

// Theme toggle
function toggleTheme() {
  document.body.classList.toggle('light');
  const btn = document.getElementById('btnTheme');
  btn.textContent = document.body.classList.contains('light') ? '☀️' : '🌙';
}

// Resize handler
function setupResize() {
  let resizeTimer;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      if (currentTree) {
        if (currentView === 'treemap') treemap.resize();
        else listView.resize();
      }
    }, 250);
  });
}

// Pulse animation for progress bar
const style = document.createElement('style');
style.textContent = `
  @keyframes pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.5; }
  }
`;
document.head.appendChild(style);