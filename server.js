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
let currentScan = null;
let scanner = null;
let scanState = new ScanStateSubject();
let fileOps = new FileOperations();

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
  // Send current state
  ws.send(JSON.stringify({ type: 'state', data: scanState.getState() }));

  // Subscribe to scan state changes
  const unsubscribe = scanState.subscribe((event, data) => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: event, data }));
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

  // Cancel previous scan if running
  if (scanner) scanner.cancel();

  scanner = new Scanner();
  scanState.reset();
  scanState.setStatus('scanning');

  // Run scan in background
  (async () => {
    try {
      const result = await scanner.scan(targetPath, (progress) => {
        scanState.updateProgress(progress);
      });
      if (scanner.cancelled) {
        scanState.cancel();
      } else {
        scanState.setResult(result);
      }
    } catch (err) {
      scanState.setError(err.message);
    }
  })();

  res.json({ success: true, message: 'Scan started' });
});

// Cancel scan
app.post('/api/scan/cancel', (req, res) => {
  if (scanner) scanner.cancel();
  scanState.cancel();
  res.json({ success: true, message: 'Scan cancelled' });
});

// Get scan status
app.get('/api/scan/status', (req, res) => {
  res.json({ success: true, state: scanState.getState() });
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