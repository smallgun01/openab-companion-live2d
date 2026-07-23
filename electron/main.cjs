const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const DIST = path.join(ROOT, 'desktop-dist');
let petWindow;
let historyWindow;

function isAllowedEndpoint(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' ||
      (url.protocol === 'http:' && ['localhost', '127.0.0.1', '::1'].includes(url.hostname));
  } catch { return false; }
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
    for await (const chunk of response.body) {
      buffer += decoder.decode(chunk, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';
      for (const raw of lines) {
        const line = raw.trim();
        if (!line.startsWith('data:')) continue;
        const data = line.slice(5).trim();
        if (data === '[DONE]') { emitChat(event.sender, requestId, 'done'); return { ok: true }; }
        try {
          const delta = JSON.parse(data)?.choices?.[0]?.delta?.content;
          if (typeof delta === 'string' && delta) emitChat(event.sender, requestId, 'delta', { delta });
        } catch { /* Ignore non-content SSE payloads. */ }
      }
    }
    emitChat(event.sender, requestId, 'done');
    return { ok: true };
  } catch (error) {
    return { ok: false, code: error?.name === 'AbortError' ? 0 : 0, message: error?.name === 'AbortError' ? 'Request timeout after 60s' : (error?.message || 'Network error') };
  } finally { clearTimeout(timeout); }
});

async function createWindow() {
  petWindow = new BrowserWindow({
    width: 420,
    height: 720,
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

  await petWindow.loadFile(path.join(DIST, 'index.html'));
  console.log('[electron] bridge available:', await petWindow.webContents.executeJavaScript('typeof window.jelliiDesktop?.streamChat'));
  // Desktop pet: prefer the strongest standard Electron layer over normal apps.
  petWindow.setAlwaysOnTop(true, 'screen-saver');
  petWindow.setVisibleOnAllWorkspaces(true);
  console.log('[electron] always-on-top:', petWindow.isAlwaysOnTop());
}

ipcMain.handle('companion:open-history', async () => {
  if (historyWindow && !historyWindow.isDestroyed()) { historyWindow.show(); historyWindow.focus(); return; }
  historyWindow = new BrowserWindow({ width: 460, height: 640, minWidth: 360, minHeight: 420, title: 'JellyFish Girl — Conversation history', backgroundColor: '#10182d', webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true } });
  historyWindow.on('closed', () => { historyWindow = null; });
  await historyWindow.loadFile(path.join(DIST, 'history.html'));
});

app.whenReady().then(createWindow).catch((error) => {
  console.error('[electron] startup failed:', error);
  app.quit();
});

app.on('window-all-closed', () => app.quit());
