// public/js/treemap.js
// Interactive treemap visualization using D3.js (HU 2)
// Improved: zoom, labels, legend, transitions, breadcrumbs

// Utility functions
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

const CATEGORY_COLORS = {
  video: '#3b82f6',
  image: '#ef4444',
  document: '#22c55e',
  audio: '#f59e0b',
  archive: '#8b5cf6',
  code: '#06b6d4',
  executable: '#ec4899',
  temp: '#64748b',
  other: '#94a3b8',
  directory: '#475569',
  locked: '#374151'
};

const CATEGORY_LABELS = {
  video: 'Videos',
  image: 'Imágenes',
  document: 'Documentos',
  audio: 'Audio',
  archive: 'Archivos comprimidos',
  code: 'Código',
  executable: 'Ejecutables',
  temp: 'Temporales',
  other: 'Otros',
  directory: 'Carpetas',
  locked: 'Sin acceso'
};

class TreemapViz {
  constructor(containerId, tooltipId) {
    this.container = document.getElementById(containerId);
    this.tooltip = document.getElementById(tooltipId);
    this.svg = null;
    this.currentData = null;
    this.rootNode = null;
    this.onFileAction = null;
    this.zoomStack = [];
    this.currentNode = null;
    this.totalSize = 0;
  }

  render(data) {
    this.currentData = data;
    if (!data || !data.children || data.children.length === 0) {
      this.container.innerHTML = '<div class="empty-state"><div class="empty-state-icon">📊</div><h3>Sin datos</h3><p>Escanee una carpeta para ver la visualización</p></div>';
      return;
    }

    // Count total files and size
    this.totalSize = data.size || 0;
    let totalFiles = 0;
    function countFiles(node) {
      if (node.type === 'file') totalFiles++;
      else if (node.children) node.children.forEach(countFiles);
    }
    countFiles(data);

    // Limit to top 2000 files for performance
    let renderData = data;
    if (totalFiles > 2000) {
      const allFiles = [];
      function collectFiles(node) {
        if (node.type === 'file') allFiles.push(node);
        else if (node.children) node.children.forEach(collectFiles);
      }
      collectFiles(data);
      allFiles.sort((a, b) => b.size - a.size);
      const topFiles = new Set(allFiles.slice(0, 2000).map(f => f.path));

      function filterTree(node) {
        if (node.type === 'file') {
          return topFiles.has(node.path) ? { ...node } : null;
        }
        const filteredChildren = (node.children || [])
          .map(filterTree)
          .filter(Boolean);
        if (filteredChildren.length === 0) return null;
        return { ...node, children: filteredChildren, size: filteredChildren.reduce((s, c) => s + (c.size || 0), 0) };
      }
      renderData = filterTree(data);
      if (!renderData) renderData = data;
    }

    // Reset zoom
    this.zoomStack = [];
    this.currentNode = renderData;
    this._renderTreemap(renderData, totalFiles, totalFiles > 2000);
  }

  _renderTreemap(data, totalFiles, isLimited) {
    const width = this.container.clientWidth;
    const height = this.container.clientHeight;

    // Clear previous
    this.container.innerHTML = '';

    // Add limit note
    if (isLimited) {
      const note = document.createElement('div');
      note.style.cssText = 'position:absolute; top:8px; right:8px; background:rgba(0,0,0,0.75); color:#f59e0b; padding:4px 10px; border-radius:6px; font-size:11px; z-index:10; backdrop-filter:blur(4px);';
      note.textContent = `📊 Mostrando top 2000 de ${totalFiles.toLocaleString()} archivos`;
      this.container.appendChild(note);
    }

    // Add zoom breadcrumb
    if (this.zoomStack.length > 0) {
      const breadcrumb = document.createElement('div');
      breadcrumb.style.cssText = 'position:absolute; top:8px; left:8px; background:rgba(0,0,0,0.75); padding:4px 10px; border-radius:6px; font-size:11px; z-index:10; display:flex; gap:4px; align-items:center; backdrop-filter:blur(4px);';
      breadcrumb.innerHTML = `<span style="color:#94a3b8; cursor:pointer;" data-zoom="root">🏠 Raíz</span>`;
      this.zoomStack.forEach((entry, idx) => {
        breadcrumb.innerHTML += ` <span style="color:#64748b;">›</span> <span style="color:#3b82f6; cursor:pointer;" data-zoom="${idx}">${escapeHtml(entry.name)}</span>`;
      });
      this.container.appendChild(breadcrumb);

      breadcrumb.querySelectorAll('[data-zoom]').forEach(el => {
        el.addEventListener('click', () => {
          const level = el.dataset.zoom;
          if (level === 'root') {
            this.zoomStack = [];
            this.currentNode = this.currentData;
            this._renderTreemap(this.currentData, totalFiles, isLimited);
          } else {
            const idx = parseInt(level);
            this.zoomStack = this.zoomStack.slice(0, idx + 1);
            // Rebuild currentNode
            this.currentNode = this.currentData;
            for (const entry of this.zoomStack) {
              const found = this.currentNode.children ? this.currentNode.children.find(c => c.name === entry.name) : null;
              if (found) this.currentNode = found;
            }
            this._renderTreemap(this.currentNode, totalFiles, isLimited);
          }
        });
      });
    }

    this.svg = d3.select(this.container)
      .append('svg')
      .attr('width', width)
      .attr('height', height)
      .style('font-family', "'Segoe UI', system-ui, sans-serif");

    if (!data || !data.children || data.children.length === 0) {
      this.svg.append('text')
        .attr('x', width / 2)
        .attr('y', height / 2)
        .attr('text-anchor', 'middle')
        .attr('fill', '#94a3b8')
        .attr('font-size', 14)
        .text('Sin datos para mostrar');
      return;
    }

    // Create hierarchy
    const root = d3.hierarchy(data)
      .sum(d => d.type === 'file' ? d.size : 0)
      .sort((a, b) => b.value - a.value);

    // Treemap layout with better padding
    d3.treemap()
      .size([width, height])
      .padding(3)
      .paddingTop(d => d.depth === 0 ? 0 : 18)
      .round(true)(root);

    // Draw group backgrounds (directories)
    const groups = this.svg.selectAll('.treemap-group')
      .data(root.children || [])
      .join('g')
      .attr('class', 'treemap-group');

    groups.append('rect')
      .attr('x', d => d.x0)
      .attr('y', d => d.y0)
      .attr('width', d => Math.max(0, d.x1 - d.x0))
      .attr('height', d => Math.max(0, d.y1 - d.y0))
      .attr('fill', 'rgba(255,255,255,0.03)')
      .attr('stroke', 'rgba(255,255,255,0.1)')
      .attr('stroke-width', 1)
      .attr('rx', 4);

    // Group labels
    groups.append('text')
      .attr('x', d => d.x0 + 6)
      .attr('y', d => d.y0 + 13)
      .attr('fill', '#e2e8f0')
      .attr('font-size', 11)
      .attr('font-weight', 600)
      .text(d => {
        const w = d.x1 - d.x0;
        if (w < 60) return '';
        const name = d.data.name;
        const pct = this.totalSize > 0 ? ((d.value / this.totalSize) * 100).toFixed(1) : '0';
        return `${name} (${pct}%)`;
      });

    // Draw leaf cells (files)
    const leaves = root.leaves();
    const cell = this.svg.selectAll('.treemap-cell')
      .data(leaves)
      .join('g')
      .attr('class', 'treemap-cell')
      .attr('transform', d => `translate(${d.x0},${d.y0})`);

    cell.append('rect')
      .attr('width', d => Math.max(0, d.x1 - d.x0))
      .attr('height', d => Math.max(0, d.y1 - d.y0))
      .attr('fill', d => {
        const cat = d.data.category || 'other';
        const color = CATEGORY_COLORS[cat] || CATEGORY_COLORS.other;
        // Add slight variation based on depth for visual interest
        return color;
      })
      .attr('rx', 3)
      .attr('ry', 3)
      .attr('stroke', 'rgba(15,23,42,0.6)')
      .attr('stroke-width', 1)
      .style('cursor', 'pointer')
      .on('mouseover', (event, d) => this.showTooltip(event, d))
      .on('mousemove', (event, d) => this.moveTooltip(event))
      .on('mouseout', () => this.hideTooltip())
      .on('contextmenu', (event, d) => {
        event.preventDefault();
        this.showContextMenu(event, d.data);
      })
      .on('click', (event, d) => {
        // If it's a directory with children, zoom in
        if (d.data.type === 'directory' && d.data.children && d.data.children.length > 0) {
          this.zoomStack.push({ name: d.data.name, node: this.currentNode });
          this.currentNode = d.data;
          this._renderTreemap(d.data, totalFiles, isLimited);
        } else if (this.onFileAction) {
          this.onFileAction('info', d.data);
        }
      });

    // Add hover effect
    cell.selectAll('rect')
      .on('mouseenter', function() {
        d3.select(this).attr('stroke', 'white').attr('stroke-width', 2);
      })
      .on('mouseleave', function() {
        d3.select(this).attr('stroke', 'rgba(15,23,42,0.6)').attr('stroke-width', 1);
      });

    // Labels for cells large enough
    cell.append('text')
      .attr('class', 'treemap-label')
      .attr('x', 4)
      .attr('y', 13)
      .attr('fill', 'white')
      .attr('font-size', 10)
      .attr('font-weight', 500)
      .attr('pointer-events', 'none')
      .style('text-shadow', '0 1px 2px rgba(0,0,0,0.9)')
      .text(d => {
        const w = d.x1 - d.x0;
        const h = d.y1 - d.y0;
        if (w < 50 || h < 20) return '';
        const name = d.data.name;
        const maxChars = Math.floor(w / 7);
        if (name.length <= maxChars) return name;
        return name.substring(0, Math.max(3, maxChars - 2)) + '…';
      });

    // Secondary label: size (for larger cells)
    cell.append('text')
      .attr('class', 'treemap-label')
      .attr('x', 4)
      .attr('y', 25)
      .attr('fill', 'rgba(255,255,255,0.7)')
      .attr('font-size', 9)
      .attr('pointer-events', 'none')
      .style('text-shadow', '0 1px 2px rgba(0,0,0,0.9)')
      .text(d => {
        const w = d.x1 - d.x0;
        const h = d.y1 - d.y0;
        if (w < 70 || h < 35) return '';
        return formatBytes(d.data.size);
      });

    // Add legend
    this._addLegend();
  }

  showTooltip(event, d) {
    const data = d.data;
    const pct = this.totalSize > 0 ? ((data.size / this.totalSize) * 100).toFixed(2) : '0';
    const catLabel = CATEGORY_LABELS[data.category] || data.category;
    this.tooltip.innerHTML = `
      <div class="tooltip-title">${escapeHtml(data.name)}</div>
      <div style="margin:4px 0;">
        <span style="color:${CATEGORY_COLORS[data.category] || '#94a3b8'}; font-weight:600;">● ${catLabel}</span>
      </div>
      <div class="tooltip-size">${formatBytes(data.size)} <span style="color:#94a3b8;">(${pct}% del total)</span></div>
      <div class="tooltip-path">${escapeHtml(data.path)}</div>
      ${data.type === 'directory' ? '<div style="margin-top:4px; color:#3b82f6; font-size:11px;">Doble clic para hacer zoom</div>' : ''}
    `;
    this.tooltip.classList.add('visible');
    this.moveTooltip(event);
  }

  moveTooltip(event) {
    const rect = this.container.getBoundingClientRect();
    let x = event.clientX - rect.left + 15;
    let y = event.clientY - rect.top + 15;
    if (x + 250 > rect.width) x = event.clientX - rect.left - 260;
    if (y + 120 > rect.height) y = event.clientY - rect.top - 130;
    this.tooltip.style.left = x + 'px';
    this.tooltip.style.top = y + 'px';
  }

  hideTooltip() {
    this.tooltip.classList.remove('visible');
  }

  showContextMenu(event, fileData) {
    const menu = document.getElementById('contextMenu');
    menu.style.display = 'block';
    menu.style.left = event.clientX + 'px';
    menu.style.top = event.clientY + 'px';
    menu.dataset.filePath = fileData.path;
    menu.dataset.fileName = fileData.name;
    menu.dataset.fileSize = fileData.size;
  }

  _addLegend() {
    // Count categories present
    const cats = new Set();
    function collect(node) {
      if (node.type === 'file') cats.add(node.category || 'other');
      else if (node.children) node.children.forEach(collect);
    }
    if (this.currentNode) collect(this.currentNode);

    if (cats.size === 0) return;

    const legend = document.createElement('div');
    legend.style.cssText = 'position:absolute; bottom:8px; left:8px; right:8px; background:rgba(0,0,0,0.7); padding:6px 10px; border-radius:6px; font-size:10px; z-index:10; display:flex; flex-wrap:wrap; gap:8px 12px; backdrop-filter:blur(4px);';
    
    for (const cat of cats) {
      const color = CATEGORY_COLORS[cat] || CATEGORY_COLORS.other;
      const label = CATEGORY_LABELS[cat] || cat;
      legend.innerHTML += `<span style="display:flex; align-items:center; gap:4px;"><span style="width:10px; height:10px; border-radius:2px; background:${color}; display:inline-block;"></span>${label}</span>`;
    }
    this.container.appendChild(legend);
  }

  update(data) {
    this.render(data);
  }

  resize() {
    if (this.currentData) this.render(this.currentData);
  }
}

window.TreemapViz = TreemapViz;