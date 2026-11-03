// src/filters.js
// Strategy Pattern for file filtering (HU 5)
// Each filter implements a common interface: matches(file) -> boolean

class FilterStrategy {
  matches(file) { return true; }
  getName() { return 'base'; }
}

class ExtensionFilter extends FilterStrategy {
  constructor(extensions) {
    super();
    this.extensions = extensions.map(e => e.toLowerCase());
  }
  matches(file) {
    if (!file || file.type === 'directory') return true;
    const ext = require('path').extname(file.name || '').toLowerCase();
    return this.extensions.length === 0 || this.extensions.includes(ext);
  }
  getName() { return 'extension'; }
}

class SizeFilter extends FilterStrategy {
  constructor(minBytes, maxBytes) {
    super();
    this.minBytes = minBytes || 0;
    this.maxBytes = maxBytes || Infinity;
  }
  matches(file) {
    if (!file || file.type === 'directory') return true;
    return file.size >= this.minBytes && file.size <= this.maxBytes;
  }
  getName() { return 'size'; }
}

class AgeFilter extends FilterStrategy {
  constructor(daysOld, mode = 'older') {
    // mode: 'older' or 'newer'
    super();
    this.daysOld = daysOld;
    this.mode = mode;
    this.threshold = Date.now() - (daysOld * 24 * 60 * 60 * 1000);
  }
  matches(file) {
    if (!file || file.type === 'directory' || !file.modified) return true;
    if (this.mode === 'older') return file.modified < this.threshold;
    return file.modified >= this.threshold;
  }
  getName() { return 'age'; }
}

class CategoryFilter extends FilterStrategy {
  constructor(categories) {
    super();
    this.categories = categories || [];
  }
  matches(file) {
    if (!file || file.type === 'directory') return true;
    return this.categories.length === 0 || this.categories.includes(file.category);
  }
  getName() { return 'category'; }
}

// Context that applies multiple strategies (AND logic)
class FilterManager {
  constructor() {
    this.strategies = [];
  }
  addStrategy(strategy) {
    this.strategies.push(strategy);
  }
  clear() {
    this.strategies = [];
  }
  removeStrategy(name) {
    this.strategies = this.strategies.filter(s => s.getName() !== name);
  }
  matches(file) {
    return this.strategies.every(s => s.matches(file));
  }
  // Apply filter to a tree, returning filtered structure
  applyToTree(node) {
    if (!node) return null;
    if (node.type === 'file') {
      return this.matches(node) ? { ...node } : null;
    }
    const filteredChildren = (node.children || [])
      .map(c => this.applyToTree(c))
      .filter(Boolean);
    if (filteredChildren.length === 0 && node.type === 'directory') {
      // Keep empty dirs only if they have size? Skip for cleanliness
      return null;
    }
    return { ...node, children: filteredChildren };
  }
}

// Predefined category presets (HU 5)
const CATEGORY_PRESETS = {
  videos: ['video'],
  images: ['image'],
  documents: ['document'],
  temp: ['temp'],
  archives: ['archive']
};

module.exports = {
  FilterStrategy,
  ExtensionFilter,
  SizeFilter,
  AgeFilter,
  CategoryFilter,
  FilterManager,
  CATEGORY_PRESETS
};