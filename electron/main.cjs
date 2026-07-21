const { app, BrowserWindow } = require('electron');
const { spawn } = require('node:child_process');
const http = require('node:http');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const PORT = 8011;
// Under `npm run`, npm preserves the actual Node executable here. `process.execPath`
// would otherwise point at Electron and spawn a second Chromium application.
const NODE_EXECUTABLE = process.env.npm_node_execpath || process.execPath;
let proxyProcess;

function serverIsReady() {
  return new Promise((resolve) => {
    const request = http.get(`http://127.0.0.1:${PORT}/`, (response) => {
      response.resume();
      resolve(response.statusCode === 200);
    });
    request.on('error', () => resolve(false));
    request.setTimeout(300, () => {
      request.destroy();
      resolve(false);
    });
  });
}

async function ensureLocalServer() {
  if (await serverIsReady()) return;

  proxyProcess = spawn(NODE_EXECUTABLE, ['dev-server.mjs'], {
    cwd: ROOT,
    env: {
      ...process.env,
      OPENAB_GATEWAY: process.env.OPENAB_GATEWAY || 'gw.k100.uk',
    },
    stdio: 'inherit',
  });

  for (let attempt = 0; attempt < 30; attempt += 1) {
    if (await serverIsReady()) return;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Local companion server did not start on port ${PORT}`);
}

async function createWindow() {
  await ensureLocalServer();

  const window = new BrowserWindow({
    width: 420,
    height: 720,
    minWidth: 420,
    minHeight: 540,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    backgroundColor: '#00000000',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  await window.loadURL(`http://127.0.0.1:${PORT}/`);
  // Desktop pet: prefer the strongest standard Electron layer over normal apps.
  window.setAlwaysOnTop(true, 'screen-saver');
  window.setVisibleOnAllWorkspaces(true);
  console.log('[electron] always-on-top:', window.isAlwaysOnTop());
}

app.whenReady().then(createWindow).catch((error) => {
  console.error('[electron] startup failed:', error);
  app.quit();
});

app.on('window-all-closed', () => app.quit());
app.on('before-quit', () => proxyProcess?.kill());
