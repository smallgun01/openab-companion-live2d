/**
 * main.js — Entry point. Wires Live2D scene, chat, expression, settings, animation.
 *
 * Adapts the VRM companion (openab-companion) architecture to Live2D Cubism SDK.
 * chat.js / settings.js / dev-server.mjs are shared; rendering layer is replaced.
 */
import { parseAndApply, getLastEmotion } from './expression.js';
import { sendMessage } from './chat.js';
import { getSettings, saveSettings } from './settings.js';

// Dynamic imports — Live2D module may fail (SDK not set up); chat always works
let initScene, loadModel, setBackgroundColor, hasParameters;
let live2dAvailable = false;
let live2dErrorMsg = '';

const live2dReady = (async () => {
  try {
    const mod = await import('./live2d-scene.js');
    initScene = mod.initScene;
    loadModel = mod.loadModel;
    setBackgroundColor = mod.setBackgroundColor;
    hasParameters = mod.hasParameters;
    live2dAvailable = true;
  } catch (err) {
    live2dErrorMsg = err.message || String(err);
    console.warn('Live2D scene unavailable:', live2dErrorMsg);
    setBackgroundColor = () => {};
    hasParameters = () => false;
  }
})();

// Animation — imported separately (depends on live2d-scene)
let startIdleAnimations, stopIdleAnimations, isIdlePlaying;
const animReady = live2dReady.then(async () => {
  if (!live2dAvailable) return;
  try {
    const mod = await import('./live2d-anim.js');
    startIdleAnimations = mod.startIdleAnimations;
    stopIdleAnimations = mod.stopIdleAnimations;
    isIdlePlaying = mod.isPlaying;
  } catch (err) {
    console.warn('Live2D animation module unavailable:', err.message);
  }
});

/* ── State ────────────────────────────────────────────── */
let settings;
let streamingAbort = null;
let isStreaming = false;
let retryCount = 0;
const MAX_RETRIES = 3;

/* ── DOM refs ─────────────────────────────────────────── */
const app            = document.getElementById('app');
const canvas         = document.getElementById('live2d-canvas');
const modelPrompt    = document.getElementById('model-prompt');
const statusDot      = document.getElementById('status-dot');
const statusText     = document.getElementById('status-text');
const messagesEl     = document.getElementById('messages');
const chatInput      = document.getElementById('chat-input');
const sendBtn        = document.getElementById('send-btn');
const settingsOverlay   = document.getElementById('settings-overlay');
const settingsBtn    = document.getElementById('settings-btn');
const settingsClose  = document.getElementById('settings-close');
const endpointInp    = document.getElementById('setting-endpoint');
const tokenInp       = document.getElementById('setting-token');
const bgColorInp     = document.getElementById('setting-bgcolor');
const saveSettingsBtn = document.getElementById('settings-save');

/* ── Init ─────────────────────────────────────────────── */

async function init() {
  try {
    settings = getSettings();

    // Wait for Live2D module to load (or fail)
    await live2dReady;

    // Live2D Scene
    if (live2dAvailable && initScene) {
      const ok = initScene(canvas, settings.bgColor);
      if (ok) {
        // Load default model
        const loaded = await loadModel('models/jellyfish-girl/');
        if (loaded) {
          modelPrompt.classList.add('hidden');
          setStatus('connected', 'Ready');

          // Start idle animations after model is loaded
          await animReady;
          if (startIdleAnimations) startIdleAnimations();
        } else {
          modelPrompt.classList.remove('hidden');
          const p = modelPrompt.querySelector('p');
          if (p) p.textContent = '⚠️ Failed to load model. Is models/jellyfish-girl/ set up?';
          setStatus('error', 'Model load failed');
        }
      } else {
        modelPrompt.classList.remove('hidden');
        const p = modelPrompt.querySelector('p');
        if (p) p.textContent = '⚠️ Cubism SDK not set up. Run `bash lib/setup.sh` and reload.';
        setStatus('error', 'SDK init failed');
      }
    } else {
      // Live2D unavailable — show friendly placeholder
      const hint = live2dErrorMsg ? ` (${live2dErrorMsg})` : '';
      modelPrompt.classList.remove('hidden');
      const p = modelPrompt.querySelector('p');
      if (p) p.textContent = `🎭 Live2D renderer unavailable${hint}. Chat still works — set your endpoint in Settings (⚙️).`;
      setStatus('connected', 'Chat ready (no renderer)');
    }

    // Apply saved background
    document.documentElement.style.setProperty('--bg', settings.bgColor);
    bgColorInp.value = settings.bgColor;

    // Settings form
    endpointInp.value = settings.endpoint;
    tokenInp.value = settings.token;
  } catch (err) {
    console.error('Init error:', err);
    setStatus('error', 'Init failed: ' + err.message);
  }

  // Event wiring — always runs, even if init partially fails
  wireEvents();
  enableChat();
}

function wireEvents() {
  sendBtn.addEventListener('click', handleSend);
  chatInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  });

  // Settings
  settingsBtn.addEventListener('click', () => settingsOverlay.classList.add('open'));
  settingsClose.addEventListener('click', () => settingsOverlay.classList.remove('open'));
  settingsOverlay.addEventListener('click', (e) => {
    if (e.target === settingsOverlay) settingsOverlay.classList.remove('open');
  });
  saveSettingsBtn.addEventListener('click', handleSaveSettings);
}

/* ── Message Handling ─────────────────────────────────── */

async function handleSend(textOverride) {
  const text = textOverride || chatInput.value.trim();
  if (!text || isStreaming) return;

  if (!textOverride) {
    chatInput.value = '';
    chatInput.style.height = 'auto';
  }

  addBubble('user', text);
  const assistantBubble = addBubble('assistant', '', true);
  const contentSpan = assistantBubble.querySelector('.content');
  const cursorSpan = assistantBubble.querySelector('.cursor');

  isStreaming = true;
  sendBtn.disabled = true;
  retryCount = 0;
  setStatus('connected', 'Typing…');

  const abort = new AbortController();
  streamingAbort = abort;

  let fullText = '';
  let lastExpressionCheck = '';

  await sendMessage({
    text,
    endpoint: settings.endpoint,
    token: settings.token,
    signal: abort.signal,
    onChunk(delta) {
      fullText += delta;
      contentSpan.textContent = fullText;

      // Apply expression on new text chunks (~every 20 chars)
      if (fullText.length - lastExpressionCheck.length > 20) {
        parseAndApply(fullText);
        lastExpressionCheck = fullText;
      }
      scrollBottom();
    },
    onDone() {
      // Final expression parse
      const cleaned = parseAndApply(fullText);
      contentSpan.textContent = cleaned;

      cursorSpan?.remove();
      assistantBubble.classList.remove('streaming');
      finishStream();
      setStatus('connected', 'Ready');
    },
    onError(code, msg) {
      cursorSpan?.remove();
      assistantBubble.classList.remove('streaming');
      finishStream();

      if (code === 429 && retryCount < MAX_RETRIES) {
        retryCount++;
        addBubble('system', `⚠️ Server busy — retry ${retryCount}/${MAX_RETRIES}…`);
        setTimeout(() => handleSend(text), 3000);
        return;
      }

      if (code === 429) {
        addBubble('error', '⚠️ Server busy. Please try again later.');
      } else {
        addBubble('error', `Error (${code}): ${msg}`);
      }
      setStatus('error', code ? `Error ${code}` : 'Disconnected');
    },
  });
}

function finishStream() {
  isStreaming = false;
  sendBtn.disabled = false;
  streamingAbort = null;
  chatInput.focus();
}

/* ── Bubble Helpers ───────────────────────────────────── */

function addBubble(role, content = '', streaming = false) {
  const el = document.createElement('div');
  el.className = `message ${role}`;
  if (streaming) {
    el.classList.add('streaming');
    const contentSpan = document.createElement('span');
    contentSpan.className = 'content';
    contentSpan.textContent = content;
    const cursor = document.createElement('span');
    cursor.className = 'cursor';
    el.appendChild(contentSpan);
    el.appendChild(cursor);
  } else {
    el.textContent = content;
  }
  messagesEl.appendChild(el);
  scrollBottom();
  return el;
}

function scrollBottom() {
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

/* ── Settings ─────────────────────────────────────────── */

function handleSaveSettings() {
  const newEndpoint = endpointInp.value.trim() || settings.endpoint;
  const newToken = tokenInp.value.trim();
  const newBg = bgColorInp.value || settings.bgColor;

  saveSettings({ endpoint: newEndpoint, token: newToken, bgColor: newBg });
  settings = getSettings();

  document.documentElement.style.setProperty('--bg', newBg);
  if (setBackgroundColor) setBackgroundColor(newBg);

  settingsOverlay.classList.remove('open');
  setStatus('connected', 'Settings saved');
}

function enableChat() {
  chatInput.disabled = false;
  sendBtn.disabled = false;
  chatInput.placeholder = 'Type a message…';
}

/* ── Status ───────────────────────────────────────────── */

function setStatus(state, msg) {
  statusDot.className = `status-dot ${state}`;
  statusText.textContent = msg;
}

/* ── Start ────────────────────────────────────────────── */

document.addEventListener('DOMContentLoaded', init);
