// src/scanner.js
// File system scanning module - File System Access Layer
// Implements recursive directory traversal with progress reporting

const fs = require('fs');
const path = require('path');

// File type categories for color coding (HU 2)
const FILE_CATEGORIES = {
  video: ['.mp4', '.avi', '.mkv', '.mov', '.wmv', '.flv', '.webm', '.m4v'],
  image: ['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.svg', '.webp', '.ico', '.tiff'],
  document: ['.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx', '.txt', '.md', '.rtf', '.odt'],
  audio: ['.mp3', '.wav', '.flac', '.aac', '.ogg', '.wma', '.m4a'],
  archive: ['.zip', '.rar', '.7z', '.tar', '.gz', '.bz2'],
  code: ['.js', '.ts', '.py', '.java', '.c', '.cpp', '.html', '.css', '.json', '.xml'],
  executable: ['.exe', '.msi', '.bat', '.sh', '.app'],
  temp: ['.tmp', '.temp', '.log', '.cache']
};

function getCategory(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  for (const [cat, exts] of Object.entries(FILE_CATEGORIES)) {
    if (exts.includes(ext)) return cat;
  }
  return 'other';
}

class Scanner {
  constructor() {
    this.cancelled = false;
    this.totalFiles = 0;
    this.totalSize = 0;
    this.skippedDirs = 0;
    this.errors = [];
  }

  cancel() {
    this.cancelled = true;
  }

  reset() {
    this.cancelled = false;
    this.totalFiles = 0;
    this.totalSize = 0;
    this.skippedDirs = 0;
    this.errors = [];
  }

  async scan(targetPath, onProgress) {
    this.reset();
    const root = {
      name: path.basename(targetPath) || targetPath,
      path: targetPath,
      size: 0,
      type: 'directory',
      category: 'directory',
      children: []
    };

    await this._scanDir(targetPath, root, onProgress);
    // Calculate directory sizes bottom-up
    this._calcSizes(root);
    // Attach scan stats
    root._stats = {
      totalFiles: this.totalFiles,
      totalSize: this.totalSize,
      skippedDirs: this.skippedDirs,
      errors: this.errors
    };
    return root;
  }

  async _scanDir(dirPath, node, onProgress) {
    if (this.cancelled) return;

    let entries;
    try {
      entries = await fs.promises.readdir(dirPath, { withFileTypes: true });
    } catch (err) {
      // Permission denied or inaccessible - skip
      node.error = err.code || err.message;
      this.skippedDirs++;
      this.errors.push({ path: dirPath, error: err.code || err.message });
      return;
    }

    for (const entry of entries) {
      if (this.cancelled) return;

      const fullPath = path.join(dirPath, entry.name);

      if (entry.isDirectory()) {
        const childNode = {
          name: entry.name,
          path: fullPath,
          size: 0,
          type: 'directory',
          category: 'directory',
          children: []
        };
        node.children.push(childNode);
        await this._scanDir(fullPath, childNode, onProgress);
      } else if (entry.isFile()) {
        let stat;
        try {
          stat = await fs.promises.stat(fullPath);
        } catch (err) {
          continue;
        }
        const fileNode = {
          name: entry.name,
          path: fullPath,
          size: stat.size,
          type: 'file',
          category: getCategory(fullPath),
          modified: stat.mtimeMs,
          created: stat.birthtimeMs
        };
        node.children.push(fileNode);
        this.totalFiles++;
        this.totalSize += stat.size;

        if (onProgress && this.totalFiles % 50 === 0) {
          onProgress({
            filesScanned: this.totalFiles,
            totalSize: this.totalSize,
            currentPath: fullPath,
            skippedDirs: this.skippedDirs
          });
        }
      }
    }
  }

  _calcSizes(node) {
    if (node.type === 'file') return node.size;
    let sum = 0;
    for (const child of node.children) {
      sum += this._calcSizes(child);
    }
    node.size = sum;
    return sum;
  }

  // Get list of available drives (Windows)
  async getDrives() {
    const drives = [];
    if (process.platform === 'win32') {
      // Check common drive letters
      const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
      for (const letter of letters) {
        const drivePath = `${letter}:\\`;
        try {
          await fs.promises.access(drivePath, fs.constants.R_OK);
          const stat = await fs.promises.stat(drivePath);
          drives.push({ name: `${letter}:`, path: drivePath, type: 'drive' });
        } catch (e) {
          // Drive not available
        }
      }
    } else {
      // Unix-like: root
      drives.push({ name: '/', path: '/', type: 'drive' });
      // Check common mount points
      try {
        const mnt = await fs.promises.readdir('/mnt');
        for (const d of mnt) {
          drives.push({ name: d, path: `/mnt/${d}`, type: 'drive' });
        }
      } catch (e) {}
    }
    return drives;
  }
}

module.exports = { Scanner, getCategory, FILE_CATEGORIES };