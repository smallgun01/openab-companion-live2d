const { app, BrowserWindow, ipcMain, Menu, nativeImage, screen, Tray } = require('electron');
const path = require('node:path');
const { normalizeBounds, readWindowState, writeWindowState } = require('./window-state.cjs');

const ROOT = path.resolve(__dirname, '..');
const DIST = path.join(ROOT, 'desktop-dist');
const PET_STATE_PATH = path.join(app.getPath('userData'), 'pet-window-state.json');
const PET_DEFAULT_SIZE = { width: 420, height: 720 };
const PET_MINIMUM_SIZE = { width: 420, height: 540 };
let petWindow;
let historyWindow;
let tray;
let isQuitting = false;
let saveWindowStateTimer;
let lastPetBounds;
const CANCELLED_REQUEST = Symbol('companion:cancelled');
const SSE_FIELD_RE = /^(data|event|id|retry):\s*(.*)$/i;
// Main-process ownership: this map owns the real HTTP AbortController. Renderer
// request gates only suppress stale UI callbacks and cannot stop this fetch alone.
const activeChatRequests = new Map();

function isAllowedEndpoint(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' ||
      (url.protocol === 'http:' && isLoopbackHostname(url.hostname));
  } catch { return false; }
}

function isLoopbackHostname(hostname) {
  // URL implementations serialize IPv6 hostnames differently; normalize both forms.
  const normalized = hostname.replace(/^\[|\]$/g, '');
  return ['localhost', '127.0.0.1', '::1'].includes(normalized);
}

function emitChat(sender, requestId, type, payload = {}) {
  if (!sender.isDestroyed()) sender.send('companion:chat-event', { requestId, type, ...payload });
}

ipcMain.handle('companion:stream-chat', async (event, request) => {
  console.log('[electron] native chat request received');
  const { requestId, text, endpoint, token = '' } = request || {};
  if (typeof requestId !== 'string' || typeof text !== 'string' || !text.trim() || !isAllowedEndpoint(endpoint)) {
    return { ok: false, code: 400, message: 'Invalid chat request or endpoint.' };
  }
  if (text.length > 12000 || token.length > 4096) return { ok: false, code: 400, message: 'Chat input is too large.' };

  const controller = new AbortController();
  activeChatRequests.set(requestId, { controller, sender: event.sender });
  const timeout = setTimeout(() => controller.abort(), 60000);
  try {
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers.Authorization = `Bearer ${token}`;
    const response = await fetch(endpoint, {
      method: 'POST', headers,
      body: JSON.stringify({ model: 'default', messages: [{ role: 'user', content: text }], stream: true }),
      signal: controller.signal,
    });
    if (!response.ok || !response.body) {
      const detail = await response.text().catch(() => '');
      return { ok: false, code: response.status, message: detail || `HTTP ${response.status}` };
    }

    const decoder = new TextDecoder();
    let buffer = '';
    let fullText = '';
    for await (const chunk of response.body) {
      buffer += decoder.decode(chunk, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';
      for (const raw of lines) {
        const line = raw.trim();
        const match = line.match(SSE_FIELD_RE);
        if (!match) continue;
        const [, field, value] = match;
        // Gateway may finish a stream with `event: done` and retain the HTTP
        // connection.  Match the browser transport so the renderer is not
        // left in its streaming/locked state until the timeout fires.
        if (field.toLowerCase() === 'event' && value === 'done') {
          emitChat(event.sender, requestId, 'done');
          return { ok: true, fullText };
        }
        if (field.toLowerCase() !== 'data') continue;
        const data = value;
        if (data === '[DONE]') { emitChat(event.sender, requestId, 'done'); return { ok: true, fullText }; }
        try {
          const delta = JSON.parse(data)?.choices?.[0]?.delta?.content;
          if (typeof delta === 'string' && delta) {
            fullText += delta;
            emitChat(event.sender, requestId, 'delta', { delta });
          }
        } catch { /* Ignore non-content SSE payloads. */ }
      }
    }
    emitChat(event.sender, requestId, 'done');
    return { ok: true, fullText };
  } catch (error) {
    const cancelled = controller.signal.aborted && controller.signal.reason === CANCELLED_REQUEST;
    return { ok: false, code: cancelled ? 499 : 0, message: cancelled ? 'Request cancelled' : (error?.name === 'AbortError' ? 'Request timeout after 60s' : (error?.message || 'Network error')) };
  } finally {
    clearTimeout(timeout);
    if (activeChatRequests.get(requestId)?.controller === controller) activeChatRequests.delete(requestId);
  }
});

ipcMain.handle('companion:cancel-chat', (event, requestId) => {
  const request = activeChatRequests.get(requestId);
  if (!request || request.sender !== event.sender) return { ok: false };
  request.controller.abort(CANCELLED_REQUEST);
  return { ok: true };
});

async function createWindow() {
  const savedBounds = readWindowState(PET_STATE_PATH);
  const workAreas = screen.getAllDisplays().map((display) => display.workArea);
  const initialBounds = normalizeBounds(savedBounds, defaultPetBounds(), workAreas, PET_MINIMUM_SIZE);
  petWindow = new BrowserWindow({
    ...initialBounds,
    minWidth: 420,
    minHeight: 540,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    backgroundColor: '#00000000',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  lastPetBounds = petWindow.getBounds();
  petWindow.on('move', rememberPetBounds);
  petWindow.on('resize', rememberPetBounds);
  petWindow.on('show', refreshTrayMenu);
  petWindow.on('hide', refreshTrayMenu);
  petWindow.on('minimize', refreshTrayMenu);
  petWindow.on('restore', refreshTrayMenu);
  petWindow.on('close', (event) => {
    if (isQuitting) return;
    event.preventDefault();
    hideCompanion();
  });

  await petWindow.loadFile(path.join(DIST, 'index.html'));
  console.log('[electron] bridge available:', await petWindow.webContents.executeJavaScript('typeof window.jelliiDesktop?.streamChat'));
  // Desktop pet: prefer the strongest standard Electron layer over normal apps.
  petWindow.setAlwaysOnTop(true, 'screen-saver');
  petWindow.setVisibleOnAllWorkspaces(true);
  console.log('[electron] always-on-top:', petWindow.isAlwaysOnTop());
  createTray();
}

function defaultPetBounds() {
  const { workArea } = screen.getPrimaryDisplay();
  return {
    width: PET_DEFAULT_SIZE.width,
    height: PET_DEFAULT_SIZE.height,
    x: workArea.x + workArea.width - PET_DEFAULT_SIZE.width - 24,
    y: workArea.y + workArea.height - PET_DEFAULT_SIZE.height - 48,
  };
}

function scheduleWindowStateSave() {
  clearTimeout(saveWindowStateTimer);
  saveWindowStateTimer = setTimeout(saveWindowState, 300);
}

function rememberPetBounds() {
  if (!petWindow || petWindow.isDestroyed()) return;
  lastPetBounds = petWindow.getBounds();
  scheduleWindowStateSave();
}

function saveWindowState() {
  if (!lastPetBounds) return;
  try {
    writeWindowState(PET_STATE_PATH, lastPetBounds);
  } catch (error) {
    // Window placement is optional state. A full disk or an inaccessible user
    // data directory must never prevent a user-requested quit.
    console.warn('[electron] could not save pet window state:', error.message);
  }
}

function showPetWindow() {
  if (!petWindow || petWindow.isDestroyed()) return;
  // Wayland owns top-level window placement. Restore a minimized window so the
  // compositor retains its in-session placement instead of re-placing a hidden
  // transparent surface when show() is called.
  if (petWindow.isMinimized()) petWindow.restore();
  else petWindow.show();
  petWindow.focus();
}

function hideCompanion() {
  rememberPetBounds();
  if (historyWindow && !historyWindow.isDestroyed()) historyWindow.hide();
  if (petWindow && !petWindow.isDestroyed()) petWindow.minimize();
}

function resetPetPosition() {
  if (!petWindow || petWindow.isDestroyed()) return;
  const bounds = defaultPetBounds();
  petWindow.setBounds(bounds);
  lastPetBounds = bounds;
  saveWindowState();
  showPetWindow();
}

function createTray() {
  if (tray) return;
  tray = new Tray(createTrayIcon());
  tray.setToolTip('Jellii Companion');
  tray.on('click', () => {
    if (petWindow?.isVisible()) hideCompanion();
    else showPetWindow();
  });
  refreshTrayMenu();
}

function refreshTrayMenu() {
  if (!tray) return;
  const isVisible = petWindow && !petWindow.isDestroyed() && petWindow.isVisible() && !petWindow.isMinimized();
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: isVisible ? 'Hide Jellii' : 'Show Jellii', click: isVisible ? hideCompanion : showPetWindow },
    { label: 'Reset position', click: resetPetPosition },
    { type: 'separator' },
    { label: 'Quit Jellii', click: () => app.quit() },
  ]));
}

function createTrayIcon() {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32"><circle cx="16" cy="16" r="14" fill="#7b68ee"/><path d="M10 13c2-5 10-5 12 0v8c-2 4-10 4-12 0z" fill="#f5f3ff"/><circle cx="13" cy="16" r="1.5" fill="#29234d"/><circle cx="19" cy="16" r="1.5" fill="#29234d"/><path d="M13 20c2 1.5 4 1.5 6 0" stroke="#29234d" stroke-width="1.5" fill="none" stroke-linecap="round"/></svg>`;
  return nativeImage.createFromDataURL(`data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`);
}

ipcMain.handle('companion:open-history', async () => {
  if (historyWindow && !historyWindow.isDestroyed()) { historyWindow.show(); historyWindow.focus(); return; }
  historyWindow = new BrowserWindow({ width: 460, height: 640, minWidth: 360, minHeight: 420, title: 'JellyFish Girl — Conversation history', backgroundColor: '#10182d', webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true } });
  historyWindow.on('closed', () => { historyWindow = null; });
  await historyWindow.loadFile(path.join(DIST, 'history.html'));
});

ipcMain.handle('companion:hide-pet', (event) => {
  if (!petWindow || event.sender !== petWindow.webContents) return { ok: false };
  hideCompanion();
  return { ok: true };
});

app.whenReady().then(createWindow).catch((error) => {
  console.error('[electron] startup failed:', error);
  app.quit();
});

app.on('before-quit', () => {
  isQuitting = true;
  clearTimeout(saveWindowStateTimer);
  saveWindowState();
});

app.on('activate', showPetWindow);

app.on('window-all-closed', () => app.quit());
