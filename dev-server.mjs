#!/usr/bin/env node
/**
 * dev-server.mjs — development-only static file server.
 *
 * Usage:  node dev-server.mjs
 *         Open http://localhost:8011 in browser.
 *
 * - Serves static files from current directory (index.html, css/, js/, models/)
 * - It never proxies credentials or disables TLS verification.
 *
 * ─────────────────────────────────────────────────────────────────
 * Configuring the LLM endpoint (web development)
 * ─────────────────────────────────────────────────────────────────
 *
 * Use an HTTPS endpoint which permits this origin via CORS. The packaged
 * Electron app does not use this server: its main process owns credentials
 * and performs the verified-TLS request.
 *
 *   1. Run:  node dev-server.mjs
 *   2. Open: http://localhost:8011
 *   3. Click ⚙️ in the header → Settings panel
 *   4. Fill in:
 *        - OpenAB Endpoint URL (e.g. https://your-gateway/v1/chat/completions)
 *        - Bearer Token (optional)
 *   5. Save. Settings persist in browser localStorage — no env needed.
 *
 * The configured endpoint is used directly by the browser. It must therefore
 * permit this development origin via CORS.
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = 8011;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.vrm': 'application/octet-stream',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
};

function serveFile(res, filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const ct = MIME[ext] || 'application/octet-stream';
  try {
    const data = fs.readFileSync(filePath);
    res.writeHead(200, { 'Content-Type': ct, 'Access-Control-Allow-Origin': '*' });
    res.end(data);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('404 Not Found');
  }
}

const server = http.createServer((req, res) => {
  // Static files
  let filePath = req.url === '/' ? '/index.html' : req.url.split('?')[0];
  filePath = path.join(__dirname, filePath);

  // Security: prevent directory traversal
  if (!filePath.startsWith(__dirname)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }

  serveFile(res, filePath);
});

server.listen(PORT, () => {
  console.log(`\n🔺 OpenAB Companion Live2D dev server`);
  console.log(`   http://localhost:${PORT}  ←  open this in your browser`);
  console.log('   Static development server only; no gateway proxy.\n');
});
