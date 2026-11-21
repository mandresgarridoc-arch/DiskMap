// server.js
// DiskLen - Modern web-based disk space analyzer
// Backend: Express + WebSocket (client-server architecture with layered design)

const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');
const fs = require('fs');

const { Scanner } = require('./src/scanner');
const { FileOperations } = require('./src/fileOperations');
const { FilterManager, ExtensionFilter, SizeFilter, AgeFilter, CategoryFilter, CATEGORY_PRESETS } = require('./src/filters');
const { ScanStateSubject } = require('./src/observer');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server, maxPayload: 200 * 1024 * 1024 }); // 200MB

const PORT = process.env.PORT || 0; // 0 = auto-assign (HU 4)

// State
let scanner = null;
let scanId = 0; // Unique ID for each scan to prevent race conditions
let currentScanPromise = null; // Track running scan promise
let scanState = new ScanStateSubject();
let fileOps = new FileOperations();

// Full scan result stays on the server. The client only receives small,
// on-demand slices (subtree, children, search results) to avoid sending
// hundreds of MB over the WebSocket / HTTP for whole-drive scans.
let scanResult = null;
let scanIndex = null; // Map<path, node>

function buildIndex(root) {
  const index = new Map();
  if (!root) return index;
  const stack = [root];
  while (stack.length) {
    const node = stack.pop();
    if (node && node.path) index.set(node.path, node);
    if (node && node.children) {
      for (const child of node.children) stack.push(child);
    }
  }
  return index;
}

function getNodeByPath(targetPath) {
  if (!targetPath) return null;
  if (!scanIndex && scanResult) scanIndex = buildIndex(scanResult);
  if (!scanIndex) return null;
  let node = scanIndex.get(targetPath);
  if (node) return node;

  // Fallbacks for small differences in separators / drive letter casing
  const resolved = path.resolve(targetPath);
  node = scanIndex.get(resolved);
  if (node) return node;

  const lower = targetPath.toLowerCase();
  for (const [key, value] of scanIndex) {
    if (key.toLowerCase() === lower) return value;
  }
  return null;
}

// Only the stats the UI actually needs (skip full error / locked-folder lists)
function compactStats(stats) {
  if (!stats) return null;
  return {
    totalFiles: stats.totalFiles,
    totalSize: stats.totalSize,
    skippedDirs: stats.skippedDirs,
    treeFileCount: stats.treeFileCount,
    treeDirCount: stats.treeDirCount,
    largestFile: stats.largestFile || null,
    verified: stats.verified
  };
}

function toSummary(node) {
  if (!node) return null;
  return {
    name: node.name,
    path: node.path,
    size: node.size || 0,
    type: node.type,
    locked: node.locked === true,
    _stats: compactStats(node._stats)
  };
}

// Build a size-limited subtree so the treemap receives a manageable payload.
function pruneTree(root, maxDepth, maxNodes) {
  let count = 0;
  function copy(node, depth) {
    count++;
    const out = {
      name: node.name,
      path: node.path,
      size: node.size || 0,
      type: node.type,
      category: node.category,
      locked: node.locked === true
    };
    if (node.modified !== undefined) out.modified = node.modified;
    if (node.created !== undefined) out.created = node.created;

    if (node.type === 'directory' && depth < maxDepth && node.children && node.children.length > 0) {
      const kids = node.children.slice().sort((a, b) => (b.size || 0) - (a.size || 0));
      out.children = [];
      for (const kid of kids) {
        if (count >= maxNodes) break;
        out.children.push(copy(kid, depth + 1));
      }
      if (out.children.length < node.children.length) {
        out._truncated = true;
        // Represent the omitted children as a single aggregate so the
        // treemap keeps showing the real total size of this directory.
        const includedSize = out.children.reduce((sum, child) => sum + (child.size || 0), 0);
        const remaining = (node.size || 0) - includedSize;
        if (remaining > 0) {
          out.children.push({
            name: 'Otros',
            path: `${node.path}::otros`,
            size: remaining,
            type: 'directory',
            category: 'other',
            locked: false,
            _truncated: true,
            _aggregate: true
          });
        }
      }
    }
    return out;
  }
  return copy(root, 0);
}

// Public state never includes the full tree.
function getPublicState() {
  const s = scanState.getState();
  return {
    status: s.status,
    filesScanned: s.filesScanned,
    totalSize: s.totalSize,
    currentPath: s.currentPath,
    progress: s.progress,
    error: s.error,
    startTime: s.startTime,
    hasResult: !!s.result,
    summary: s.result ? {
      name: s.result.name,
      path: s.result.path,
      size: s.result.size,
      type: s.result.type,
      _stats: compactStats(s.result._stats)
    } : null
  };
}

// Middleware
app.use(express.json({ limit: '50mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// CORS for local dev
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  next();
});

// WebSocket connection handling (Observer pattern - real-time progress)
wss.on('connection', (ws) => {
  console.log('Client connected');
  // Send current (lightweight) state
  ws.send(JSON.stringify({ type: 'state', data: getPublicState() }));

  // Subscribe to scan state changes
  const unsubscribe = scanState.subscribe((event) => {
    if (ws.readyState === WebSocket.OPEN) {
      try {
        ws.send(JSON.stringify({ type: event, data: getPublicState() }));
      } catch (e) {
        console.error('WebSocket send error:', e.message);
      }
    }
  });

  ws.on('close', () => {
    unsubscribe();
    console.log('Client disconnected');
  });
});

// API Routes

// Get available drives
app.get('/api/drives', async (req, res) => {
  try {
    const s = new Scanner();
    const drives = await s.getDrives();
    res.json({ success: true, drives });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Browse directory (for folder picker)
app.get('/api/browse', async (req, res) => {
  const dirPath = req.query.path || (process.platform === 'win32' ? 'C:\\' : '/');
  try {
    const entries = await fs.promises.readdir(dirPath, { withFileTypes: true });
    const result = entries
      .filter(e => e.isDirectory())
      .map(e => ({
        name: e.name,
        path: path.join(dirPath, e.name),
        type: 'directory'
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
    res.json({ success: true, path: dirPath, entries: result });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Start scan
app.post('/api/scan/start', async (req, res) => {
  const { path: targetPath } = req.body;
  if (!targetPath) {
    return res.status(400).json({ success: false, message: 'Path required' });
  }

  // Increment scan ID to invalidate previous scan's callbacks
  const thisScanId = ++scanId;

  // Cancel previous scan if running and WAIT for it to fully stop
  if (scanner && currentScanPromise) {
    scanner.cancel();
    try {
      await currentScanPromise;
    } catch (e) {
      // Ignore errors from cancelled scan
    }
    // Extra safety delay
    await new Promise(resolve => setTimeout(resolve, 200));
  }

  scanner = new Scanner();
  scanResult = null;
  scanIndex = null;
  scanState.reset();
  scanState.setStatus('scanning');

  // Run scan in background and track the promise
  currentScanPromise = (async () => {
    try {
      const result = await scanner.scan(targetPath, (progress) => {
        // Only update if this is still the current scan
        if (scanId === thisScanId) {
          scanState.updateProgress(progress);
        }
      });
      // Only update state if this is still the current scan
      if (scanId !== thisScanId) return;
      if (scanner.cancelled) {
        scanState.cancel();
      } else {
        // Verify result integrity
        if (result && result._stats) {
          console.log(`Scan ${thisScanId} complete: ${result._stats.totalFiles} files, ${result._stats.skippedDirs} skipped`);
        }
        // Keep the full tree server-side; build a path index for lazy queries
        scanResult = result;
        scanIndex = buildIndex(result);
        scanState.state.filesScanned = result && result._stats ? result._stats.totalFiles : scanState.state.filesScanned;
        scanState.state.totalSize = result && result._stats ? result._stats.totalSize : scanState.state.totalSize;
        scanState.state.currentPath = '';
        scanState.setResult(result);
      }
    } catch (err) {
      if (scanId === thisScanId) {
        scanState.setError(err.message);
      }
    } finally {
      if (scanId === thisScanId) {
        currentScanPromise = null;
      }
    }
  })();

  res.json({ success: true, message: 'Scan started', scanId: thisScanId });
});

// Cancel scan
app.post('/api/scan/cancel', (req, res) => {
  if (scanner) scanner.cancel();
  scanState.cancel();
  res.json({ success: true, message: 'Scan cancelled' });
});

// Get scan status (lightweight: never includes the full tree)
app.get('/api/scan/status', (req, res) => {
  res.json({ success: true, state: getPublicState() });
});

// Get a size-limited subtree for the treemap
app.get('/api/tree', (req, res) => {
  const node = getNodeByPath(req.query.path);
  if (!node) return res.status(404).json({ success: false, message: 'Nodo no encontrado' });
  const depth = Math.max(0, Math.min(parseInt(req.query.depth, 10) || 2, 8));
  const maxNodes = Math.max(100, Math.min(parseInt(req.query.maxNodes, 10) || 5000, 20000));
  res.json({ success: true, node: pruneTree(node, depth, maxNodes) });
});

// Get immediate children of a directory (for the list view)
app.get('/api/children', (req, res) => {
  const node = getNodeByPath(req.query.path);
  if (!node) return res.status(404).json({ success: false, message: 'Nodo no encontrado' });
  const children = (node.children || []).map(c => ({
    name: c.name,
    path: c.path,
    size: c.size || 0,
    type: c.type,
    category: c.category,
    modified: c.modified,
    created: c.created,
    locked: c.locked === true,
    childCount: c.children ? c.children.length : 0
  })).sort((a, b) => (b.size || 0) - (a.size || 0));
  res.json({ success: true, node: toSummary(node), children });
});

// Global search across the full scan result (server-side, limited)
app.get('/api/search', (req, res) => {
  const q = (req.query.q || '').trim().toLowerCase();
  if (!q) return res.json({ success: true, results: [], total: 0, limited: false });
  if (!scanResult) return res.status(404).json({ success: false, message: 'No hay resultados de escaneo' });

  const limit = Math.max(1, Math.min(parseInt(req.query.limit, 10) || 5000, 20000));
  const results = [];
  const stack = [scanResult];
  while (stack.length && results.length < limit) {
    const node = stack.pop();
    if (node !== scanResult) {
      const name = (node.name || '').toLowerCase();
      const p = (node.path || '').toLowerCase();
      if (name.includes(q) || p.includes(q)) {
        results.push({
          name: node.name,
          path: node.path,
          size: node.size || 0,
          type: node.type,
          category: node.category,
          modified: node.modified,
          locked: node.locked === true,
          childCount: node.children ? node.children.length : 0
        });
      }
    }
    if (node.children) {
      for (const child of node.children) stack.push(child);
    }
  }
  results.sort((a, b) => (b.size || 0) - (a.size || 0));
  res.json({ success: true, results, total: results.length, limited: results.length >= limit });
});

// File operations
app.post('/api/file/trash', async (req, res) => {
  const { path: filePath } = req.body;
  const result = await fileOps.moveToTrash(filePath);
  res.json(result);
});

app.post('/api/file/delete', async (req, res) => {
  const { path: filePath } = req.body;
  const result = await fileOps.deleteFile(filePath);
  res.json(result);
});

app.post('/api/file/open-location', async (req, res) => {
  const { path: filePath } = req.body;
  const result = await fileOps.openLocation(filePath);
  res.json(result);
});

app.post('/api/file/open', async (req, res) => {
  const { path: filePath } = req.body;
  const result = await fileOps.openFile(filePath);
  res.json(result);
});

app.get('/api/file/info', async (req, res) => {
  const filePath = req.query.path;
  const result = await fileOps.getFileInfo(filePath);
  res.json(result);
});

// Filtering endpoint (Strategy pattern)
app.post('/api/filter', (req, res) => {
  const { tree, filters } = req.body;
  if (!tree) return res.status(400).json({ success: false, message: 'Tree required' });

  const fm = new FilterManager();
  if (filters) {
    if (filters.categories && filters.categories.length > 0) {
      fm.addStrategy(new CategoryFilter(filters.categories));
    }
    if (filters.extensions && filters.extensions.length > 0) {
      fm.addStrategy(new ExtensionFilter(filters.extensions));
    }
    if (filters.minSize !== undefined || filters.maxSize !== undefined) {
      fm.addStrategy(new SizeFilter(filters.minSize || 0, filters.maxSize || Infinity));
    }
    if (filters.ageDays !== undefined) {
      fm.addStrategy(new AgeFilter(filters.ageDays, filters.ageMode || 'older'));
    }
  }

  const filtered = fm.applyToTree(tree);
  res.json({ success: true, tree: filtered || tree });
});

// Category presets
app.get('/api/categories', (req, res) => {
  res.json({ success: true, presets: CATEGORY_PRESETS });
});


// Start server
server.listen(PORT, '127.0.0.1', () => {
  const actualPort = server.address().port;
  console.log('');
  console.log('  ╔══════════════════════════════════════════╗');
  console.log('  ║            DiskLen - Disk Analyzer         ║');
  console.log('  ╠══════════════════════════════════════════╣');
  console.log(`  ║  Server running at: http://localhost:${actualPort}  ║`);
  console.log('  ║  Press Ctrl+C to stop                     ║');
  console.log('  ╚══════════════════════════════════════════╝');
  console.log('');

  // Auto-open browser (HU 4)
  const url = `http://localhost:${actualPort}`;
  const start = process.platform === 'win32' ? 'start' : process.platform === 'darwin' ? 'open' : 'xdg-open';
  require('child_process').exec(`${start} ${url}`);
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\nShutting down...');
  if (scanner) scanner.cancel();
  server.close(() => process.exit(0));
});