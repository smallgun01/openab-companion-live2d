/**
 * main.js — Entry point. Wires Live2D scene, chat, expression, settings, animation.
 *
 * Adapts the VRM companion (openab-companion) architecture to Live2D Cubism SDK.
 * chat.js / settings.js / dev-server.mjs are shared; rendering layer is replaced.
 */
import { applyExpression, parseAndApply } from './expression.js';
import { sendMessage } from './chat.js';
import { getSettings, saveSettings } from './settings.js';
import { clearRetryTimer } from './retry-timer.js';

// Dynamic imports — Live2D module may fail (SDK not set up); chat always works
let initScene, setParameter, setBackgroundColor, hasParameters, getModel, dispose, getLastInitError;
let live2dAvailable = false;
let live2dErrorMsg = '';

const live2dReady = (async () => {
  try {
    const mod = await import('./live2d-scene.js');
    initScene = mod.initScene;
    setParameter = mod.setParameter;
    setBackgroundColor = mod.setBackgroundColor;
    hasParameters = mod.hasParameters;
    getModel = mod.getModel;
    dispose = mod.dispose;
    getLastInitError = mod.getLastInitError;
    live2dAvailable = true;
  } catch (err) {
    live2dErrorMsg = err.message || String(err);
    console.warn('Live2D scene unavailable:', live2dErrorMsg);
    setBackgroundColor = () => {};
    hasParameters = () => false;
    getModel = () => null;
    dispose = () => {};
    setParameter = () => {};
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
let retryTimer = null;
let retryContext = null;
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
const chatPanel       = document.getElementById('chat-panel');
const chatToggle      = document.getElementById('chat-toggle');
const chatCloseBtn    = document.getElementById('chat-close-btn');
const speechBubble    = document.getElementById('speech-bubble');
const speechBubbleText = document.getElementById('speech-bubble-text');
const quickCompose    = document.getElementById('quick-compose');
const quickInput      = document.getElementById('quick-input');
const quickSendBtn    = document.getElementById('quick-send-btn');
const historyBtn      = document.getElementById('history-btn');
const quickSettingsBtn = document.getElementById('quick-settings-btn');
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

    // Live2D Scene — initScene now handles everything internally
    if (live2dAvailable && initScene) {
      const ok = await initScene(canvas, {
        bgColor: settings.bgColor,
        bgImage: settings.bgImage || '',
        transparent: window.__JELLII_DESKTOP__ === true,
      });
      if (ok) {
        modelPrompt.classList.add('hidden');
        setStatus('connected', 'Ready');

        // Start idle animations after model is loaded
        await animReady;
        if (startIdleAnimations) startIdleAnimations();
      } else {
        modelPrompt.classList.remove('hidden');
        const p = modelPrompt.querySelector('p');
        const detail = getLastInitError?.() || 'Unknown renderer error';
        if (p) p.textContent = `⚠️ Failed to load model: ${detail}`;
        setStatus('error', 'Model load failed');
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

  if (window.__JELLII_DESKTOP__) {
    chatToggle.addEventListener('click', () => setQuickComposeOpen(true));
    speechBubble.addEventListener('click', () => window.jelliiDesktop?.openHistory());
    quickSendBtn.addEventListener('click', handleQuickSend);
    quickSettingsBtn.addEventListener('click', () => settingsOverlay.classList.add('open'));
    quickInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleQuickSend(); }
      if (e.key === 'Escape') setQuickComposeOpen(false);
    });
    historyBtn.addEventListener('click', () => window.jelliiDesktop?.openHistory());
    window.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.code === 'Space') { e.preventDefault(); setQuickComposeOpen(true); }
    });
    speechBubble.addEventListener('mouseenter', pauseSpeechBubble);
    speechBubble.addEventListener('mouseleave', resumeSpeechBubble);
  }
}

/* ── Message Handling ─────────────────────────────────── */

async function handleSend(textOverride, isRetry = false) {
  const text = typeof textOverride === 'string' ? textOverride : chatInput.value.trim();
  if (!text || (isStreaming && !isRetry)) return;
  if (isRetry && retryContext?.text !== text) return;
  retryTimer = clearRetryTimer(retryTimer);

  if (!textOverride) {
    chatInput.value = '';
    chatInput.style.height = 'auto';
  }

  let assistantBubble;
  let contentSpan;
  let cursorSpan;
  if (isRetry) {
    ({ assistantBubble, contentSpan, cursorSpan } = retryContext);
  } else {
    addBubble('user', text);
    assistantBubble = addBubble('assistant', '', true);
    contentSpan = assistantBubble.querySelector('.content');
    cursorSpan = assistantBubble.querySelector('.cursor');
    retryContext = { text, assistantBubble, contentSpan, cursorSpan };
    retryCount = 0;
  }

  isStreaming = true;
  sendBtn.disabled = true;
  if (window.__JELLII_DESKTOP__) quickSendBtn.disabled = true;
  setStatus('connected', 'Typing…');
  latestSpeechBubble = null;
  // SSE exposes no tool/reasoning event. This truthfully means only that the
  // request is pending; a Jellii tag replaces it when response text arrives.
  applyExpression('thinking');
  showSpeechBubble('…', 'thinking', { persistent: true });

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
      // Strip tags AND apply expression; show clean text
      const cleaned = parseAndApply(fullText);
      contentSpan.textContent = cleaned;

      if (fullText.length - lastExpressionCheck.length > 20) {
        lastExpressionCheck = fullText;
      }
      scrollBottom();
    },
    onDone() {
      // Final expression parse + strip any remaining tags
      const cleaned = parseAndApply(fullText);
      if (!hasModelEmotionTag(fullText)) applyExpression('neutral');
      contentSpan.textContent = cleaned;
      if (cleaned.trim()) persistHistory('assistant', cleaned);

      cursorSpan?.remove();
      assistantBubble.classList.remove('streaming');
      finishStream();
      if (cleaned.trim()) showSpeechBubble(cleaned, 'reply');
      setStatus('connected', 'Ready');
    },
    onError(code, msg) {
      if (code === 429 && retryCount < MAX_RETRIES) {
        retryCount++;
        addBubble('system', `⚠️ Server busy — retry ${retryCount}/${MAX_RETRIES}…`);
        streamingAbort = null;
        setStatus('connected', `Server busy — retrying ${retryCount}/${MAX_RETRIES}…`);
        retryTimer = setTimeout(() => {
          retryTimer = null;
          handleSend(text, true);
        }, 3000);
        return;
      }

      cursorSpan?.remove();
      assistantBubble.classList.remove('streaming');
      finishStream();
      applyExpression('neutral');

      if (code === 429) {
        addBubble('error', '⚠️ Server busy. Please try again later.');
        showSpeechBubble('Server busy. Try again shortly.', 'error');
      } else {
        addBubble('error', `Error (${code}): ${msg}`);
        showSpeechBubble('Connection failed. Open chat for details.', 'error');
      }
      setStatus('error', code ? `Error ${code}` : 'Disconnected');
    },
  });
}

function hasModelEmotionTag(text) {
  return /\[(joy|sadness|anger|surprise|fear|disgust|smirk|neutral)\]/i.test(text);
}

function finishStream() {
  retryTimer = clearRetryTimer(retryTimer);
  isStreaming = false;
  sendBtn.disabled = false;
  if (window.__JELLII_DESKTOP__) quickSendBtn.disabled = false;
  streamingAbort = null;
  retryContext = null;
  if (!window.__JELLII_DESKTOP__) chatInput.focus();
}

/* ── Desktop chat / speech bubble ─────────────────────── */

let speechBubbleTimer = null;
let speechBubbleRemainingMs = 0;
let speechBubbleStartedAt = 0;
let speechBubblePersistent = false;
let latestSpeechBubble = null;

function setQuickComposeOpen(open) {
  if (!window.__JELLII_DESKTOP__) return;
  chatToggle.setAttribute('aria-expanded', String(open));
  chatToggle.setAttribute('aria-label', open ? 'Quick input is open' : 'Talk to JellyFish Girl');
  chatToggle.hidden = open;
  quickCompose.hidden = !open;
  if (open) setTimeout(() => quickInput.focus(), 0);
}

function handleQuickSend() {
  const text = quickInput.value.trim();
  if (!text || isStreaming) return;
  quickInput.value = '';
  quickInput.style.height = 'auto';
  setQuickComposeOpen(false);
  handleSend(text);
}

function showSpeechBubble(text, kind = 'reply', { persistent = false } = {}) {
  if (!window.__JELLII_DESKTOP__) return;
  if (!persistent) latestSpeechBubble = { text, kind };
  clearSpeechBubbleTimer();
  speechBubblePersistent = persistent;
  speechBubbleText.textContent = text;
  speechBubble.className = `speech-bubble ${kind}`;
  speechBubble.hidden = false;
  if (!persistent) {
    speechBubbleRemainingMs = 10000;
    speechBubbleStartedAt = performance.now();
    speechBubbleTimer = setTimeout(() => hideSpeechBubble({ forget: true }), speechBubbleRemainingMs);
  }
}

function hideSpeechBubble({ forget = false } = {}) {
  clearSpeechBubbleTimer();
  speechBubble.hidden = true;
  speechBubblePersistent = false;
  if (forget) latestSpeechBubble = null;
}

function clearSpeechBubbleTimer() {
  if (speechBubbleTimer) clearTimeout(speechBubbleTimer);
  speechBubbleTimer = null;
}

function pauseSpeechBubble() {
  if (speechBubblePersistent || !speechBubbleTimer) return;
  speechBubbleRemainingMs -= performance.now() - speechBubbleStartedAt;
  clearSpeechBubbleTimer();
}

function resumeSpeechBubble() {
  if (speechBubblePersistent || speechBubbleTimer || speechBubbleRemainingMs <= 0) return;
  speechBubbleStartedAt = performance.now();
  speechBubbleTimer = setTimeout(() => hideSpeechBubble({ forget: true }), speechBubbleRemainingMs);
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
  if (!streaming) persistHistory(role, content);
  scrollBottom();
  return el;
}

function persistHistory(role, content) {
  if (!window.__JELLII_DESKTOP__ || !content) return;
  try {
    const key = 'jellii-companion-history-v1';
    const entries = JSON.parse(localStorage.getItem(key) || '[]');
    entries.push({ role, content, at: Date.now() });
    localStorage.setItem(key, JSON.stringify(entries.slice(-300)));
  } catch (err) {
    console.warn('Unable to persist conversation history:', err);
  }
}

function scrollBottom() {
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

/* ── Settings ─────────────────────────────────────────── */

function handleSaveSettings() {
  const newEndpoint = endpointInp.value.trim() || settings.endpoint;
  const newToken = tokenInp.value.trim();
  const newBg = bgColorInp.value || settings.bgColor;

  try {
    saveSettings({ endpoint: newEndpoint, bgColor: newBg });
  } catch (err) {
    setStatus('error', err.message);
    return;
  }
  settings = { ...getSettings(), token: newToken };

  document.documentElement.style.setProperty('--bg', newBg);
  if (setBackgroundColor) setBackgroundColor(newBg);

  settingsOverlay.classList.remove('open');
  setStatus('connected', 'Settings saved (token is kept only for this session)');
}

function enableChat() {
  chatInput.disabled = false;
  sendBtn.disabled = false;
  if (window.__JELLII_DESKTOP__) {
    quickInput.disabled = false;
    quickSendBtn.disabled = false;
    setQuickComposeOpen(false);
  }
  chatInput.placeholder = 'Type a message…';
}

/* ── Status ───────────────────────────────────────────── */

function setStatus(state, msg) {
  statusDot.className = `status-dot ${state}`;
  statusText.textContent = msg;
}

/* ── Start ────────────────────────────────────────────── */

document.addEventListener('DOMContentLoaded', init);

// Debug: expose live2d internals for browser console testing
window.__l2d = async () => { const m = await import('./live2d-scene.js'); return m.__debug(); };
