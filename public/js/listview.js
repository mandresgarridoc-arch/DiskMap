// public/js/listview.js
// List view with colored size bars, search, pagination and compact mode

function getSizeColor(ratio) {
  if (ratio < 0.25) return '#22c55e';
  if (ratio < 0.5) return '#84cc16';
  if (ratio < 0.75) return '#f59e0b';
  return '#ef4444';
}

class ListView {
  constructor(containerId) {
    this.container = document.getElementById(containerId);
    this.rootData = null;
    this.currentNode = null;
    this.navStack = [];
    this.sortBy = 'name';
    this.sortDir = 'asc';
    this.onFileAction = null;
    this.maxSize = 0;
    this.stats = null;

    // Search & pagination
    this.searchQuery = '';
    this.globalSearchQuery = '';
    this.pageSize = 100;
    this.currentPage = 1;
    this.compactMode = false;
    this.allItems = []; // Flattened items for current node
  }

  render(data) {
    if (data && data._stats) {
      this.stats = data._stats;
    }
    this.rootData = data;
    this.currentNode = data;
    this.navStack = [];
    this.currentPage = 1;
    this.searchQuery = '';
    this._renderCurrentNode();
  }

  _getItems(node) {
    if (!node || !node.children) return [];
    return node.children.map(child => ({
      name: child.name,
      path: child.path,
      size: child.size || 0,
      type: child.type,
      category: child.category,
      children: child.children,
      modified: child.modified,
      locked: child.locked === true
    }));
  }

  _flattenTree(node, result = []) {
    if (!node) return result;
    if (node.type === 'file' || node.type === 'directory') {
      if (node.path && node.name) {
        result.push({
          name: node.name,
          path: node.path,
          size: node.size || 0,
          type: node.type,
          category: node.category,
          children: node.children,
          modified: node.modified,
          locked: node.locked === true
        });
      }
    }
    if (node.children) {
      for (const child of node.children) {
        this._flattenTree(child, result);
      }
    }
    return result;
  }

  _filterItems(items) {
    let filtered = items;
    // Local search
    if (this.searchQuery) {
      const q = this.searchQuery.toLowerCase();
      filtered = filtered.filter(item => item.name.toLowerCase().includes(q) || item.path.toLowerCase().includes(q));
    }
    // Global search
    if (this.globalSearchQuery) {
      const q = this.globalSearchQuery.toLowerCase();
      filtered = filtered.filter(item => item.name.toLowerCase().includes(q) || item.path.toLowerCase().includes(q));
    }
    return filtered;
  }

  _sortItems(items) {
    return items.sort((a, b) => {
      let va = a[this.sortBy], vb = b[this.sortBy];
      if (typeof va === 'string') {
        va = va.toLowerCase(); vb = vb.toLowerCase();
        return this.sortDir === 'asc' ? va.localeCompare(vb) : vb.localeCompare(va);
      }
      return this.sortDir === 'asc' ? va - vb : vb - va;
    });
  }

  _renderCurrentNode() {
    if (!this.rootData) {
      this.container.innerHTML = '<div class="empty-state"><div class="empty-state-icon">📋</div><h3>Sin datos</h3><p>Escanee una carpeta para ver la lista</p></div>';
      this._renderPagination(0);
      return;
    }

    // Global search: flatten entire tree
    if (this.globalSearchQuery) {
      this.allItems = this._flattenTree(this.rootData);
    } else {
      const node = this.currentNode;
      if (!node) {
        this.container.innerHTML = '<div class="empty-state"><div class="empty-state-icon">📋</div><h3>Sin datos</h3><p>Escanee una carpeta para ver la lista</p></div>';
        this._renderPagination(0);
        return;
      }
      this.allItems = this._getItems(node);
    }

    this.maxSize = Math.max(...this.allItems.map(i => i.size), 1);

    let filtered = this._filterItems(this.allItems);
    filtered = this._sortItems(filtered);

    const totalItems = filtered.length;
    const totalPages = this.pageSize > 0 ? Math.ceil(totalItems / this.pageSize) : 1;
    if (this.currentPage > totalPages && totalPages > 0) this.currentPage = totalPages;
    if (this.currentPage < 1) this.currentPage = 1;

    const startIdx = this.pageSize > 0 ? (this.currentPage - 1) * this.pageSize : 0;
    const endIdx = this.pageSize > 0 ? startIdx + this.pageSize : filtered.length;
    const pageItems = filtered.slice(startIdx, endIdx);

    if (pageItems.length === 0 && this.allItems.length === 0) {
      this.container.innerHTML = '<div class="empty-state"><div class="empty-state-icon">📋</div><h3>Sin datos</h3><p>Escanee una carpeta para ver la lista</p></div>';
      this._renderPagination(0);
      return;
    }

    // Breadcrumb or global search header
    let headerHtml = '';
    if (this.globalSearchQuery) {
      headerHtml = `<div class="breadcrumb"><span style="color:var(--accent);">🌐 Resultados de búsqueda global: "${escapeHtml(this.globalSearchQuery)}"</span> <span style="color:var(--text-secondary); margin-left:8px;">(${filtered.length} resultados)</span></div>`;
    } else {
      headerHtml = '<div class="breadcrumb">';
      headerHtml += `<span class="breadcrumb-item" data-level="root">🏠 Raíz</span>`;
      this.navStack.forEach((entry, idx) => {
        headerHtml += `<span class="breadcrumb-sep">›</span>`;
        headerHtml += `<span class="breadcrumb-item" data-level="${idx}">${escapeHtml(entry.name)}</span>`;
      });
      headerHtml += '</div>';
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
      const ratio = item.size / this.maxSize;
      const barColor = isLocked ? '#64748b' : getSizeColor(ratio);
      const barWidth = isLocked ? 100 : Math.max(2, ratio * 100);
      const icon = isLocked ? '🔒' : (item.type === 'directory' ? '📁' : this._getFileIcon(item.category));
      const percent = isLocked ? '—' : (ratio * 100).toFixed(1);
      const isDir = item.type === 'directory';

      html += `
        <div class="list-row ${isLocked ? 'locked' : ''}" data-path="${escapeHtml(item.path)}" data-name="${escapeHtml(item.name)}" data-size="${item.size}" data-type="${item.type}" data-isdir="${isDir}" data-locked="${isLocked}">
          <div class="col-name">
            <span class="item-icon">${icon}</span>
            <div style="overflow:hidden;">
              <div class="item-name" title="${escapeHtml(item.path)}">${escapeHtml(item.name)}</div>
              ${isLocked ? `<div class="item-path" style="color:var(--warning);">Sin permisos de lectura</div>` : (isDir ? `<div class="item-path">${item.children ? item.children.length : 0} elementos</div>` : `<div class="item-path">${escapeHtml(item.category)}</div>`)}
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
      const total = this.allItems.length;
      html += `
        <div class="list-footer">
          <span>📊 ${this.stats.totalFiles.toLocaleString()} archivos | ${formatBytes(this.stats.totalSize)} total | Mostrando ${shown} de ${total} en esta vista</span>
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
        if (isLocked) {
          if (this.onFileAction) this.onFileAction('info', { path: row.dataset.path, name: row.dataset.name, size: 0, type: 'directory', locked: true });
          return;
        }
        if (isDir) {
          const item = this.allItems.find(i => i.path === row.dataset.path);
          if (item && item.children && item.children.length > 0) {
            this.navStack.push({ name: row.dataset.name, node: this.currentNode });
            this.currentNode = item;
            this.currentPage = 1;
            this._renderCurrentNode();
            return;
          }
        }
        if (this.onFileAction) {
          this.onFileAction('info', { path: row.dataset.path, name: row.dataset.name, size: parseInt(row.dataset.size), type: row.dataset.type });
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

    // Breadcrumb navigation (only when not in global search)
    if (!this.globalSearchQuery) {
      this.container.querySelectorAll('.breadcrumb-item').forEach(item => {
        item.addEventListener('click', () => {
          const level = item.dataset.level;
          if (level === 'root') {
            this.currentNode = this.rootData;
            this.navStack = [];
          } else {
            const idx = parseInt(level);
            this.navStack = this.navStack.slice(0, idx + 1);
            this.currentNode = this.rootData;
            for (let i = 0; i <= idx; i++) {
              const targetName = this.navStack[i].name;
              const found = this.currentNode.children ? this.currentNode.children.find(c => c.name === targetName) : null;
              if (found) this.currentNode = found;
            }
          }
          this.currentPage = 1;
          this._renderCurrentNode();
        });
      });
    }

    this._renderPagination(totalPages, totalItems);
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
        const page = parseInt(btn.dataset.page);
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

  update(data) {
    this.render(data);
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
    this.searchQuery = query;
    this.currentPage = 1;
    this._renderCurrentNode();
  }

  setGlobalSearch(query) {
    this.globalSearchQuery = query;
    this.currentPage = 1;
    this._renderCurrentNode();
  }

  setPageSize(size) {
    this.pageSize = parseInt(size);
    this.currentPage = 1;
    this._renderCurrentNode();
  }

  setCompact(mode) {
    this.compactMode = mode;
    this._renderCurrentNode();
  }
}

window.ListView = ListView;