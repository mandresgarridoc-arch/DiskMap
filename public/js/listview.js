// public/js/listview.js
// List view with colored size bars, search, pagination and compact mode.
// Data is loaded on demand from the server (/api/children, /api/search),
// so it works with whole-drive scans without transferring the full tree.

// Utility functions
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text == null ? '' : String(text);
  return div.innerHTML;
}

function formatBytes(bytes) {
  if (!bytes) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];
  const i = Math.min(sizes.length - 1, Math.floor(Math.log(bytes) / Math.log(k)));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function getSizeColor(ratio) {
  if (ratio < 0.25) return '#22c55e';
  if (ratio < 0.5) return '#84cc16';
  if (ratio < 0.75) return '#f59e0b';
  return '#ef4444';
}

class ListView {
  constructor(containerId) {
    this.container = document.getElementById(containerId);
    this.rootSummary = null;   // { path }
    this.currentNode = null;   // { name, path, size, type }
    this.navStack = [];        // ancestors: [{ name, path }]
    this.sortBy = 'name';
    this.sortDir = 'asc';
    this.onFileAction = null;
    this.maxSize = 0;
    this.stats = null;

    // Search & pagination
    this.searchQuery = '';
    this.globalSearchQuery = '';
    this.globalResults = null;
    this.globalLimited = false;
    this.pageSize = 100;
    this.currentPage = 1;
    this.compactMode = false;
    this.items = [];           // immediate children of the current node
    this.filter = {};
    this.loading = false;
  }

  _clearSearchInputs() {
    const local = document.getElementById('listSearch');
    if (local) local.value = '';
    const global = document.getElementById('globalSearch');
    if (global) global.value = '';
  }

  // Load the root directory of a completed scan
  async load(rootPath, stats) {
    this.stats = stats || null;
    this.rootSummary = { path: rootPath };
    this.navStack = [];
    this.searchQuery = '';
    this.globalSearchQuery = '';
    this.globalResults = null;
    this.globalLimited = false;
    this.currentPage = 1;
    this._clearSearchInputs();
    await this.navigate(rootPath, []);
  }

  // Load the immediate children of a directory from the server
  async navigate(nodePath, navStack) {
    this.loading = true;
    this.searchQuery = '';
    this.globalSearchQuery = '';
    this.globalResults = null;
    this.globalLimited = false;
    this.currentPage = 1;
    this._clearSearchInputs();

    try {
      const res = await fetch(`/api/children?path=${encodeURIComponent(nodePath)}`);
      const data = await res.json();
      if (!data.success) {
        this.loading = false;
        this.container.innerHTML = `<div class="empty-state"><div class="empty-state-icon">⚠️</div><h3>No se pudo abrir la carpeta</h3><p>${escapeHtml(data.message || '')}</p></div>`;
        return;
      }
      this.currentNode = data.node;
      this.navStack = navStack || [];
      this.items = data.children || [];
      this.loading = false;
      this._renderCurrentNode();
    } catch (err) {
      this.loading = false;
      this.container.innerHTML = `<div class="empty-state"><div class="empty-state-icon">⚠️</div><h3>Error de conexión</h3><p>${escapeHtml(err.message)}</p></div>`;
    }
  }

  reset() {
    this.rootSummary = null;
    this.currentNode = null;
    this.navStack = [];
    this.items = [];
    this.stats = null;
    this.searchQuery = '';
    this.globalSearchQuery = '';
    this.globalResults = null;
    this.currentPage = 1;
    this.container.innerHTML = '<div class="empty-state"><div class="empty-state-icon">📋</div><h3>Sin datos</h3><p>Escanee una carpeta para ver la lista</p></div>';
    this._renderPagination(0);
  }

  setFilter(filters) {
    this.filter = filters || {};
  }

  _matchesFilter(item) {
    const f = this.filter || {};
    if (f.categories && f.categories.length > 0 && item.type === 'file') {
      if (!f.categories.includes(item.category)) return false;
    }
    if (f.sizeMode === 'empty') {
      if ((item.size || 0) !== 0) return false;
    }
    if (f.minSize && (item.size || 0) < f.minSize) return false;
    if (f.maxSize !== undefined && (item.size || 0) > f.maxSize) return false;
    if (f.ageDays && item.type === 'file' && item.modified) {
      const threshold = Date.now() - (f.ageDays * 24 * 60 * 60 * 1000);
      if (f.ageMode === 'older') {
        if (!(item.modified < threshold)) return false;
      } else {
        if (!(item.modified >= threshold)) return false;
      }
    }
    return true;
  }

  _filterItems(items) {
    let filtered = items.filter(item => this._matchesFilter(item));
    const query = (this.searchQuery || '').toLowerCase();
    if (query) {
      filtered = filtered.filter(item =>
        (item.name || '').toLowerCase().includes(query) ||
        (item.path || '').toLowerCase().includes(query)
      );
    }
    return filtered;
  }

  _sortItems(items) {
    return items.slice().sort((a, b) => {
      let va = a[this.sortBy];
      let vb = b[this.sortBy];
      if (this.sortBy === 'name') {
        va = (va || '').toLowerCase();
        vb = (vb || '').toLowerCase();
        return this.sortDir === 'asc' ? va.localeCompare(vb) : vb.localeCompare(va);
      }
      va = va || 0;
      vb = vb || 0;
      return this.sortDir === 'asc' ? va - vb : vb - va;
    });
  }

  _renderCurrentNode() {
    if (!this.rootSummary || !this.currentNode) {
      this.container.innerHTML = '<div class="empty-state"><div class="empty-state-icon">📋</div><h3>Sin datos</h3><p>Escanee una carpeta para ver la lista</p></div>';
      this._renderPagination(0);
      return;
    }

    if (this.loading) {
      this.container.innerHTML = '<div class="empty-state"><div class="empty-state-icon">⏳</div><h3>Cargando…</h3></div>';
      this._renderPagination(0);
      return;
    }

    const isGlobal = !!this.globalSearchQuery;
    const sourceItems = isGlobal ? (this.globalResults || []) : this.items;

    this.maxSize = Math.max(...sourceItems.map(i => i.size || 0), 1);

    let filtered = this._filterItems(sourceItems);
    filtered = this._sortItems(filtered);

    const totalItems = filtered.length;
    const totalPages = this.pageSize > 0 ? Math.ceil(totalItems / this.pageSize) : 1;
    if (this.currentPage > totalPages && totalPages > 0) this.currentPage = totalPages;
    if (this.currentPage < 1) this.currentPage = 1;

    const startIdx = this.pageSize > 0 ? (this.currentPage - 1) * this.pageSize : 0;
    const endIdx = this.pageSize > 0 ? startIdx + this.pageSize : filtered.length;
    const pageItems = filtered.slice(startIdx, endIdx);

    // El breadcrumb se construye siempre, incluso si la carpeta está vacía.
    const headerHtml = this._buildHeaderHtml(isGlobal, filtered.length);

    if (pageItems.length === 0) {
      const msg = isGlobal
        ? 'No se encontraron coincidencias'
        : (sourceItems.length === 0 ? 'Esta carpeta está vacía' : 'Ningún elemento coincide con el filtro');
      const backButton = (!isGlobal && this.navStack.length > 0)
        ? `<button class="btn btn-secondary" data-action="up" style="margin-top:16px;">⬆ Volver a la carpeta anterior</button>`
        : '';
      this.container.innerHTML = `${headerHtml}<div class="empty-state with-header"><div class="empty-state-icon">📋</div><h3>Sin resultados</h3><p>${msg}</p>${backButton}</div>`;
      this._bindHeaderNavigation(isGlobal);
      this._renderPagination(0);
      return;
    }

    let html = headerHtml;

    // Header with sort
    html += `
      <div class="list-header">
        <div class="col-name sortable" data-sort="name">Nombre ${this.sortBy === 'name' ? (this.sortDir === 'asc' ? '▲' : '▼') : ''}</div>
        <div class="col-size sortable" data-sort="size">Tamaño ${this.sortBy === 'size' ? (this.sortDir === 'asc' ? '▲' : '▼') : ''}</div>
        <div class="col-bar"><span style="flex:1">Peso relativo</span></div>
      </div>
    `;

    for (const item of pageItems) {
      const isLocked = item.locked === true;
      const ratio = (item.size || 0) / this.maxSize;
      const barColor = isLocked ? '#64748b' : getSizeColor(ratio);
      const barWidth = isLocked ? 100 : Math.max(2, ratio * 100);
      const icon = isLocked ? '🔒' : (item.type === 'directory' ? '📁' : this._getFileIcon(item.category));
      const percent = isLocked ? '—' : (ratio * 100).toFixed(1);
      const isDir = item.type === 'directory';
      const childCount = typeof item.childCount === 'number'
        ? item.childCount
        : (item.children ? item.children.length : 0);

      html += `
        <div class="list-row ${isLocked ? 'locked' : ''}" data-path="${escapeHtml(item.path)}" data-name="${escapeHtml(item.name)}" data-size="${item.size || 0}" data-type="${item.type}" data-isdir="${isDir}" data-locked="${isLocked}">
          <div class="col-name">
            <span class="item-icon">${icon}</span>
            <div style="overflow:hidden;">
              <div class="item-name" title="${escapeHtml(item.path)}">${escapeHtml(item.name)}</div>
              ${isLocked ? `<div class="item-path" style="color:var(--warning);">Sin permisos de lectura</div>` : (isDir ? `<div class="item-path">${childCount} elementos</div>` : `<div class="item-path">${escapeHtml(item.category)}</div>`)}
            </div>
          </div>
          <div class="col-size">${isLocked ? '—' : formatBytes(item.size)}</div>
          <div class="col-bar">
            <div class="bar-track">
              <div class="bar-fill" style="width:${barWidth}%; background:${barColor}; ${isLocked ? 'opacity:0.3;' : ''}"></div>
            </div>
            <span class="bar-percent">${percent}${isLocked ? '' : '%'}</span>
          </div>
        </div>
      `;
    }

    if (this.stats) {
      const shown = pageItems.length;
      const total = sourceItems.length;
      html += `
        <div class="list-footer">
          <span>📊 ${(this.stats.totalFiles || 0).toLocaleString()} archivos | ${formatBytes(this.stats.totalSize || 0)} total | Mostrando ${shown} de ${total} en esta vista</span>
          ${this.stats.skippedDirs > 0 ? `<span style="color:var(--warning); margin-left:16px;">⚠️ ${this.stats.skippedDirs} carpetas sin acceso</span>` : ''}
        </div>
      `;
    }

    this.container.innerHTML = html;
    this.container.classList.toggle('compact', this.compactMode);

    // Event listeners
    this.container.querySelectorAll('.list-row').forEach(row => {
      row.addEventListener('click', () => {
        const isDir = row.dataset.isdir === 'true';
        const isLocked = row.dataset.locked === 'true';
        const itemPath = row.dataset.path;
        const itemName = row.dataset.name;

        if (isLocked) {
          if (this.onFileAction) this.onFileAction('info', { path: itemPath, name: itemName, size: 0, type: 'directory', locked: true });
          return;
        }
        if (isDir) {
          const parent = this.currentNode;
          const newStack = this.navStack.concat([{ name: parent.name, path: parent.path }]);
          this.navigate(itemPath, newStack);
          return;
        }
        if (this.onFileAction) {
          this.onFileAction('info', { path: itemPath, name: itemName, size: parseInt(row.dataset.size, 10), type: row.dataset.type });
        }
      });
      row.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        const menu = document.getElementById('contextMenu');
        if (menu) {
          menu.style.display = 'block';
          menu.style.left = e.clientX + 'px';
          menu.style.top = e.clientY + 'px';
          menu.dataset.filePath = row.dataset.path;
          menu.dataset.fileName = row.dataset.name;
          menu.dataset.fileSize = row.dataset.size;
        }
      });
    });

    // Sort headers
    this.container.querySelectorAll('.sortable').forEach(header => {
      header.addEventListener('click', () => {
        const field = header.dataset.sort;
        if (this.sortBy === field) {
          this.sortDir = this.sortDir === 'asc' ? 'desc' : 'asc';
        } else {
          this.sortBy = field;
          this.sortDir = field === 'name' ? 'asc' : 'desc';
        }
        this._renderCurrentNode();
      });
      header.style.cursor = 'pointer';
    });

    // Breadcrumb navigation (incluye botón Subir y salida de búsqueda global)
    this._bindHeaderNavigation(isGlobal);

    this._renderPagination(totalPages, totalItems);
  }

  _buildHeaderHtml(isGlobal, resultCount) {
    if (isGlobal) {
      const count = typeof resultCount === 'number' ? resultCount : 0;
      return `<div class="breadcrumb">
        <button class="breadcrumb-back" data-action="exit-search" title="Volver a la carpeta">✕ Volver a la carpeta</button>
        <span style="color:var(--accent);">🌐 Resultados de búsqueda global: "${escapeHtml(this.globalSearchQuery)}"</span>
        <span style="color:var(--text-secondary); margin-left:8px;">(${count}${this.globalLimited ? '+' : ''} resultados)</span>
      </div>`;
    }

    const canGoUp = this.navStack.length > 0;
    let html = '<div class="breadcrumb">';
    html += `<button class="breadcrumb-up" data-action="up" ${canGoUp ? '' : 'disabled'} title="${canGoUp ? 'Subir a la carpeta anterior' : 'Ya estás en la raíz del escaneo'}">⬆ Subir</button>`;
    html += `<span class="breadcrumb-item" data-level="root">🏠 Raíz</span>`;
    this.navStack.forEach((entry, idx) => {
      html += `<span class="breadcrumb-sep">›</span>`;
      html += `<span class="breadcrumb-item" data-level="${idx}">${escapeHtml(entry.name)}</span>`;
    });
    if (this.currentNode) {
      html += `<span class="breadcrumb-sep">›</span>`;
      html += `<span class="breadcrumb-current">${escapeHtml(this.currentNode.name)}</span>`;
    }
    html += '</div>';
    return html;
  }

  _bindHeaderNavigation(isGlobal) {
    this.container.querySelectorAll('[data-action="up"]').forEach(btn => {
      btn.addEventListener('click', () => this.goUp());
    });

    const exit = this.container.querySelector('[data-action="exit-search"]');
    if (exit) exit.addEventListener('click', () => this.setGlobalSearch(''));

    if (isGlobal) return;

    this.container.querySelectorAll('.breadcrumb-item').forEach(item => {
      item.addEventListener('click', () => {
        const level = item.dataset.level;
        if (level === 'root') {
          if (this.rootSummary) this.navigate(this.rootSummary.path, []);
        } else {
          const idx = parseInt(level, 10);
          const target = this.navStack[idx];
          if (target) {
            this.navigate(target.path, this.navStack.slice(0, idx));
          }
        }
      });
    });
  }

  goUp() {
    if (!this.currentNode) return;
    if (this.navStack.length > 0) {
      const parent = this.navStack[this.navStack.length - 1];
      this.navigate(parent.path, this.navStack.slice(0, -1));
    } else if (this.rootSummary && this.currentNode.path !== this.rootSummary.path) {
      this.navigate(this.rootSummary.path, []);
    }
  }

  _renderPagination(totalPages, totalItems) {
    const container = document.getElementById('listPagination');
    if (!container) return;

    if (this.pageSize === 0 || totalPages <= 1) {
      container.innerHTML = totalItems > 0
        ? `<span class="page-info">${totalItems} elementos (todos mostrados)</span>`
        : '';
      return;
    }

    let html = '';
    html += `<button class="page-btn" ${this.currentPage <= 1 ? 'disabled' : ''} data-page="${this.currentPage - 1}">◀ Anterior</button>`;
    html += `<span class="page-info">Página ${this.currentPage} de ${totalPages} (${totalItems} elementos)</span>`;
    html += `<button class="page-btn" ${this.currentPage >= totalPages ? 'disabled' : ''} data-page="${this.currentPage + 1}">Siguiente ▶</button>`;

    container.innerHTML = html;
    container.querySelectorAll('.page-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const page = parseInt(btn.dataset.page, 10);
        if (page >= 1 && page <= totalPages) {
          this.currentPage = page;
          this._renderCurrentNode();
        }
      });
    });
  }

  _getFileIcon(category) {
    const icons = {
      video: '🎬', image: '🖼️', document: '📄', audio: '🎵',
      archive: '📦', code: '💻', executable: '⚙️', temp: '🗑️', other: '📎'
    };
    return icons[category] || '📎';
  }

  update() {
    this.refresh();
  }

  refresh() {
    this._renderCurrentNode();
  }

  resize() {
    if (this.currentNode) this._renderCurrentNode();
  }

  setSort(field) {
    if (this.sortBy === field) {
      this.sortDir = this.sortDir === 'asc' ? 'desc' : 'asc';
    } else {
      this.sortBy = field;
      this.sortDir = field === 'name' ? 'asc' : 'desc';
    }
    this._renderCurrentNode();
  }

  setSearch(query) {
    this.searchQuery = query || '';
    this.currentPage = 1;
    this._renderCurrentNode();
  }

  async setGlobalSearch(query) {
    this.globalSearchQuery = query || '';
    this.currentPage = 1;

    if (!this.globalSearchQuery) {
      this.globalResults = null;
      this.globalLimited = false;
      this._renderCurrentNode();
      return;
    }

    this.container.innerHTML = '<div class="empty-state"><div class="empty-state-icon">⏳</div><h3>Buscando…</h3></div>';
    this._renderPagination(0);

    try {
      const res = await fetch(`/api/search?q=${encodeURIComponent(this.globalSearchQuery)}&limit=5000`);
      const data = await res.json();
      if (data.success) {
        this.globalResults = data.results || [];
        this.globalLimited = !!data.limited;
        this._renderCurrentNode();
      } else {
        this.container.innerHTML = `<div class="empty-state"><div class="empty-state-icon">⚠️</div><h3>Error de búsqueda</h3><p>${escapeHtml(data.message || '')}</p></div>`;
      }
    } catch (err) {
      this.container.innerHTML = `<div class="empty-state"><div class="empty-state-icon">⚠️</div><h3>Error de conexión</h3><p>${escapeHtml(err.message)}</p></div>`;
    }
  }

  setPageSize(size) {
    this.pageSize = parseInt(size, 10);
    this.currentPage = 1;
    this._renderCurrentNode();
  }

  setCompact(mode) {
    this.compactMode = mode;
    this._renderCurrentNode();
  }
}

window.ListView = ListView;
