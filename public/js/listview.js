// public/js/listview.js
// List view with colored size bars (alternative to treemap)
// Supports drill-down navigation into folders

const CATEGORY_COLORS_LIST = {
  video: '#3b82f6',
  image: '#ef4444',
  document: '#22c55e',
  audio: '#f59e0b',
  archive: '#8b5cf6',
  code: '#06b6d4',
  executable: '#ec4899',
  temp: '#64748b',
  other: '#94a3b8',
  directory: '#475569'
};

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
    this.navStack = []; // Array of {name, node} for breadcrumb
    this.sortBy = 'size';
    this.sortDir = 'desc';
    this.onFileAction = null;
    this.maxSize = 0;
    this.stats = null;
  }

  render(data) {
    if (data && data._stats) {
      this.stats = data._stats;
    }
    this.rootData = data;
    this.currentNode = data;
    this.navStack = [];
    this._renderCurrentNode();
  }

  _renderCurrentNode() {
    const node = this.currentNode;
    if (!node || !node.children || node.children.length === 0) {
      this.container.innerHTML = '<div class="empty-state"><div class="empty-state-icon">📋</div><h3>Sin datos</h3><p>Escanee una carpeta para ver la lista</p></div>';
      return;
    }

    const items = node.children.map(child => ({
      name: child.name,
      path: child.path,
      size: child.size || 0,
      type: child.type,
      category: child.category,
      children: child.children,
      modified: child.modified
    }));

    this.maxSize = Math.max(...items.map(i => i.size), 1);

    items.sort((a, b) => {
      let va = a[this.sortBy], vb = b[this.sortBy];
      if (typeof va === 'string') {
        va = va.toLowerCase(); vb = vb.toLowerCase();
        return this.sortDir === 'asc' ? va.localeCompare(vb) : vb.localeCompare(va);
      }
      return this.sortDir === 'asc' ? va - vb : vb - va;
    });

    // Breadcrumb
    let breadcrumbHtml = '<div class="breadcrumb">';
    breadcrumbHtml += `<span class="breadcrumb-item" data-level="root">🏠 Raíz</span>`;
    this.navStack.forEach((entry, idx) => {
      breadcrumbHtml += `<span class="breadcrumb-sep">›</span>`;
      breadcrumbHtml += `<span class="breadcrumb-item" data-level="${idx}">${escapeHtml(entry.name)}</span>`;
    });
    breadcrumbHtml += '</div>';

    let html = breadcrumbHtml + `
      <div class="list-header">
        <div class="col-name">Nombre</div>
        <div class="col-size">Tamaño</div>
        <div class="col-bar"><span style="flex:1">Peso relativo</span></div>
      </div>
    `;

    for (const item of items) {
      const ratio = item.size / this.maxSize;
      const barColor = getSizeColor(ratio);
      const barWidth = Math.max(2, ratio * 100);
      const icon = item.type === 'directory' ? '📁' : this._getFileIcon(item.category);
      const percent = (ratio * 100).toFixed(1);
      const isDir = item.type === 'directory';

      html += `
        <div class="list-row" data-path="${escapeHtml(item.path)}" data-name="${escapeHtml(item.name)}" data-size="${item.size}" data-type="${item.type}" data-isdir="${isDir}">
          <div class="col-name">
            <span class="item-icon">${icon}</span>
            <div style="overflow:hidden;">
              <div class="item-name" title="${escapeHtml(item.path)}">${escapeHtml(item.name)}</div>
              ${isDir ? `<div class="item-path">${item.children ? item.children.length : 0} elementos</div>` : `<div class="item-path">${escapeHtml(item.category)}</div>`}
            </div>
          </div>
          <div class="col-size">${formatBytes(item.size)}</div>
          <div class="col-bar">
            <div class="bar-track">
              <div class="bar-fill" style="width:${barWidth}%; background:${barColor};"></div>
            </div>
            <span class="bar-percent">${percent}%</span>
          </div>
        </div>
      `;
    }

    if (this.stats) {
      html += `
        <div class="list-footer">
          <span>📊 ${this.stats.totalFiles.toLocaleString()} archivos | ${formatBytes(this.stats.totalSize)} total</span>
          ${this.stats.skippedDirs > 0 ? `<span style="color:var(--warning); margin-left:16px;">⚠️ ${this.stats.skippedDirs} carpetas sin acceso (permisos)</span>` : ''}
        </div>
      `;
    }

    this.container.innerHTML = html;

    // Attach event listeners
    this.container.querySelectorAll('.list-row').forEach(row => {
      row.addEventListener('click', () => {
        const isDir = row.dataset.isdir === 'true';
        if (isDir) {
          const item = items.find(i => i.path === row.dataset.path);
          if (item && item.children && item.children.length > 0) {
            this.navStack.push({ name: row.dataset.name, node: this.currentNode });
            this.currentNode = item;
            this._renderCurrentNode();
            return;
          }
        }
        if (this.onFileAction) {
          this.onFileAction('info', {
            path: row.dataset.path,
            name: row.dataset.name,
            size: parseInt(row.dataset.size),
            type: row.dataset.type
          });
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

    // Breadcrumb navigation
    this.container.querySelectorAll('.breadcrumb-item').forEach(item => {
      item.addEventListener('click', () => {
        const level = item.dataset.level;
        if (level === 'root') {
          this.currentNode = this.rootData;
          this.navStack = [];
        } else {
          const idx = parseInt(level);
          // Navigate to that level
          this.navStack = this.navStack.slice(0, idx + 1);
          // Rebuild currentNode by traversing from root
          this.currentNode = this.rootData;
          for (let i = 0; i <= idx; i++) {
            const targetName = this.navStack[i].name;
            const found = this.currentNode.children.find(c => c.name === targetName);
            if (found) this.currentNode = found;
          }
        }
        this._renderCurrentNode();
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
      this.sortDir = 'desc';
    }
    this._renderCurrentNode();
  }
}

window.ListView = ListView;