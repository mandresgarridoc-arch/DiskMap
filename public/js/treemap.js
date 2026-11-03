// public/js/treemap.js
// Interactive treemap visualization using D3.js (HU 2)

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
  directory: '#475569'
};

class TreemapViz {
  constructor(containerId, tooltipId) {
    this.container = document.getElementById(containerId);
    this.tooltip = document.getElementById(tooltipId);
    this.svg = null;
    this.currentData = null;
    this.onFileAction = null;
  }

  render(data) {
    this.currentData = data;
    if (!data || !data.children || data.children.length === 0) {
      this.container.innerHTML = '<div class="empty-state"><div class="empty-state-icon">📊</div><h3>Sin datos</h3><p>Escanee una carpeta para ver la visualización</p></div>';
      return;
    }

    const width = this.container.clientWidth;
    const height = this.container.clientHeight;

    // Clear previous
    this.container.innerHTML = '';
    this.svg = d3.select(this.container)
      .append('svg')
      .attr('width', width)
      .attr('height', height);

    // Create hierarchy
    const root = d3.hierarchy(data)
      .sum(d => d.type === 'file' ? d.size : 0)
      .sort((a, b) => b.value - a.value);

    // Treemap layout
    d3.treemap()
      .size([width, height])
      .padding(2)
      .round(true)(root);

    // Draw cells
    const cell = this.svg.selectAll('g')
      .data(root.leaves())
      .join('g')
      .attr('transform', d => `translate(${d.x0},${d.y0})`);

    cell.append('rect')
      .attr('class', 'treemap-cell')
      .attr('width', d => Math.max(0, d.x1 - d.x0))
      .attr('height', d => Math.max(0, d.y1 - d.y0))
      .attr('fill', d => CATEGORY_COLORS[d.data.category] || CATEGORY_COLORS.other)
      .attr('rx', 4)
      .on('mouseover', (event, d) => this.showTooltip(event, d))
      .on('mousemove', (event, d) => this.moveTooltip(event))
      .on('mouseout', () => this.hideTooltip())
      .on('contextmenu', (event, d) => {
        event.preventDefault();
        this.showContextMenu(event, d.data);
      })
      .on('click', (event, d) => {
        if (this.onFileAction) this.onFileAction('info', d.data);
      })
      .on('dblclick', (event, d) => {
        // Double click to open file location
        if (this.onFileAction) this.onFileAction('location', d.data);
      });

    // Labels (only for cells large enough)
    cell.append('text')
      .attr('class', 'treemap-label')
      .attr('x', 4)
      .attr('y', 14)
      .text(d => {
        const w = d.x1 - d.x0;
        const h = d.y1 - d.y0;
        if (w > 60 && h > 20) {
          const name = d.data.name;
          return name.length > 15 ? name.substring(0, 12) + '...' : name;
        }
        return '';
      });
  }

  showTooltip(event, d) {
    const data = d.data;
    this.tooltip.innerHTML = `
      <div class="tooltip-title">${escapeHtml(data.name)}</div>
      <div class="tooltip-size">${formatBytes(data.size)}</div>
      <div class="tooltip-path">${escapeHtml(data.path)}</div>
    `;
    this.tooltip.classList.add('visible');
    this.moveTooltip(event);
  }

  moveTooltip(event) {
    const rect = this.container.getBoundingClientRect();
    let x = event.clientX - rect.left + 15;
    let y = event.clientY - rect.top + 15;
    if (x + 220 > rect.width) x = event.clientX - rect.left - 230;
    if (y + 100 > rect.height) y = event.clientY - rect.top - 110;
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

  update(data) {
    this.render(data);
  }

  resize() {
    if (this.currentData) this.render(this.currentData);
  }
}

// Utility functions
function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

window.TreemapViz = TreemapViz;
window.formatBytes = formatBytes;
window.escapeHtml = escapeHtml;