/**
 * live2d-scene.js — Live2D rendering via untitled-pixi-live2d-engine.
 *
 *   initScene(canvas, opts)    — creates PIXI app, loads Live2D model
 *     opts.bgColor  — background color hex (default '#1a1a2e')
 *     opts.bgImage  — background image URL (optional, overrides bgColor)
 *   setParameter(name, value)   — set a Live2D parameter (any range)
 *   hasParameters()             — model loaded and ready?
 *   setBackgroundColor(color)   — update background color
 *   setBackgroundImage(url)     — update background image
 *   dispose()                   — tear down
 *
 * Engine: untitled-pixi-live2d-engine v1.3.1 (PixiJS v8 + Cubism 5)
 * All shader/matrix/renderer handling is internal to the engine.
 * Zero monkey-patches. Zero hand-written GLSL.
 */

import { getActiveProfile } from './live2d-profile.js';

// ── Module state ────────────────────────────────────────

/** @type {import('pixi.js').Application} */
let app = null;

/** @type {HTMLCanvasElement} */
let canvas;

/** @type {string} */
let bgColorHex = '#1a1a2e';

/** @type {string} */
let bgImagePath = '';

/** @type {boolean} — desktop shell uses an alpha canvas */
let transparentCanvas = false;

/** @type {import('pixi.js').Sprite|null} */
let bgSprite = null;

/** @type {object} — the Live2D model instance */
let live2dModel = null;
const parameterIdCache = new Map();
const partIdCache = new Map();
let partOpacityOverrides = {};
let partOpacityEntries = [];
let partOpacityTickerRegistered = false;

/** @type {boolean} — model fully loaded */
let modelReady = false;
let lastInitError = '';

const MODEL_LOAD_ATTEMPTS = 3;
const MODEL_LOAD_RETRY_MS = 350;

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Cubism Core can finish initializing just after the Pixi app is ready on a
 * cold WebView start. Retry the model load a small, bounded number of times
 * instead of leaving the companion permanently blank on that race.
 */
async function loadModelWithRetry(modelPath) {
  let lastError;
  const profileEngineOptions = getActiveProfile().engineOptions || {};
  // Profiles may select only engine behaviour this adapter explicitly owns.
  // Never let declarative model data override lifecycle-critical defaults.
  const engineOptions = {};
  if ('idleMotionGroup' in profileEngineOptions) {
    engineOptions.idleMotionGroup = profileEngineOptions.idleMotionGroup;
  }
  if ('breathDepth' in profileEngineOptions) {
    engineOptions.breathDepth = profileEngineOptions.breathDepth;
  }

  for (let attempt = 1; attempt <= MODEL_LOAD_ATTEMPTS; attempt += 1) {
    try {
      return await PIXI.live2d.Live2DModel.from(modelPath, {
        ...engineOptions,
        autoUpdate: true,
        autoHitTest: false,
        autoFocus: false,
      });
    } catch (error) {
      lastError = error;
      console.warn(
        `[live2d-scene] Model load attempt ${attempt}/${MODEL_LOAD_ATTEMPTS} failed:`,
        error?.message || error,
      );
      if (attempt < MODEL_LOAD_ATTEMPTS) await wait(MODEL_LOAD_RETRY_MS);
    }
  }

  throw lastError;
}

// ── Helpers ────────────────────────────────────────────

/** Recalculate model position & scale (called on init + resize). */
function _relayout() {
  if (!live2dModel || !app) return;

  const modelW = live2dModel.internalModel.originalWidth;
  const modelH = live2dModel.internalModel.originalHeight;

  const { layout } = getActiveProfile();
  // Scale to fit canvas width, capped at full height
  const scaleX = app.screen.width / modelW;
  const scaleY = app.screen.height / modelH;
  const scale = Math.min(scaleX, scaleY) * layout.scaleMultiplier;
  live2dModel.scale.set(scale);

  // Placement is profile data: different art crops require different anchors.
  live2dModel.anchor.set(...layout.anchor);
  live2dModel.x = app.screen.width / 2;
  live2dModel.y = app.screen.height;
}

/** Scale background image to cover canvas. */
function _fitBackground() {
  if (!bgSprite || !app) return;
  const sX = app.screen.width / bgSprite.texture.width;
  const sY = app.screen.height / bgSprite.texture.height;
  const scale = Math.max(sX, sY);  // cover
  bgSprite.scale.set(scale);
  bgSprite.anchor.set(0.5, 0.5);
  bgSprite.x = app.screen.width / 2;
  bgSprite.y = app.screen.height / 2;
}

function _onResize() {
  _relayout();
  if (bgSprite) _fitBackground();
}

// ── Initialization ─────────────────────────────────────

/**
 * Initialize PIXI app + Live2D model.
 *
 * @param {HTMLCanvasElement} canvasEl
 * @param {string} [colorHex]
 * @returns {Promise<boolean>}
 */
/**
 * Initialize PIXI app + Live2D model.
 *
 * @param {HTMLCanvasElement} canvasEl
 * @param {object} [opts]
 * @param {string} [opts.bgColor]  — hex color
 * @param {string} [opts.bgImage]  — URL to background image
 * @param {boolean} [opts.transparent] — use transparent canvas for desktop shell
 * @returns {Promise<boolean>}
 */
export async function initScene(canvasEl, opts = {}) {
  canvas = canvasEl;
  const { bgColor = '#1a1a2e', bgImage = '', transparent = false } = opts;
  if (bgColor) bgColorHex = bgColor;
  bgImagePath = bgImage;
  transparentCanvas = transparent;

  console.log('[live2d-scene] Initializing PIXI + untitled-engine...');
  lastInitError = '';

  try {
    // Register the Live2D render pipe plugin
    await PIXI.extensions.add(PIXI.live2d.Live2DPlugin);

    // Create PIXI application
    app = new PIXI.Application();
    await app.init({
      canvas: canvas,
      resizeTo: canvas.parentElement,
      background: bgImage ? null : bgColorHex,
      // Electron uses Chromium, where the transparent Pixi canvas is the
      // intended desktop-pet surface. Tauri/WebKitGTK remains as a fallback.
      backgroundAlpha: 0,
      antialias: true,
      resolution: window.devicePixelRatio || 1,
      autoDensity: true,
    });

    console.log('[live2d-scene] PIXI app initialized');

    // ── Background image ──
    if (bgImage) {
      try {
        const texture = await PIXI.Assets.load(bgImage);
        bgSprite = new PIXI.Sprite(texture);
        app.stage.addChildAt(bgSprite, 0);
        _fitBackground();
        console.log('[live2d-scene] Background image loaded');
        // Still apply bgColor behind the image (as fallback during load)
        app.renderer.background.color = bgColorHex;
      } catch (e) {
        console.warn('[live2d-scene] Background image failed:', e.message);
        app.renderer.background.color = bgColorHex;
      }
    }

    // ── Load Live2D model ──
    const modelPath = getActiveProfile().assets.model;
    console.log('[live2d-scene] Loading model:', modelPath);

    live2dModel = await loadModelWithRetry(modelPath);

    app.stage.addChild(live2dModel);
    // Position (bottom-center anchor, responsive)
    _relayout();
    window.addEventListener('resize', _onResize);

    modelReady = true;
    console.log('[live2d-scene] Model loaded and added to stage');

    return true;
  } catch (err) {
    lastInitError = err?.message || String(err);
    console.error('[live2d-scene] Init failed:', err.message, err.stack);
    return false;
  }
}

// ── Parameter access ───────────────────────────────────

/**
 * Set a Live2D parameter by ID.
 *
 * @param {string} name  — parameter ID supplied by the active profile
 * @param {number} value — 0.0–1.0
 */
export function setParameter(name, value) {
  if (!live2dModel || !live2dModel.internalModel) {
    console.warn('[setParameter] no model:', name);
    return;
  }
  try {
    const im = live2dModel.internalModel;
    const model = im.coreModel;
    if (model && model.setParameterValueById) {
      const idHandle = getParameterId(name);
      if (idHandle) {
        model.setParameterValueById(idHandle, value);
      } else {
        console.warn('[setParameter] unknown param:', name);
      }
    } else {
      console.warn('[setParameter] coreModel missing setParameterValueById');
    }
  } catch(e) { console.warn('[setParameter]', name, 'error:', e.message); }
}

/** Set a Cubism part's opacity by its profile-owned part ID. */
export function setPartOpacity(name, value) {
  if (!live2dModel?.internalModel) return;
  try {
    const model = live2dModel.internalModel.coreModel;
    if (!model?.setPartOpacityById) {
      console.warn('[setPartOpacity] coreModel missing setPartOpacityById');
      return;
    }
    const idHandle = getPartId(name);
    if (idHandle) model.setPartOpacityById(idHandle, value);
    else console.warn('[setPartOpacity] unknown part:', name);
  } catch (error) {
    console.warn('[setPartOpacity]', name, 'error:', error.message);
  }
}

/** Keep profile-declared pose-part opacity overrides authoritative per frame. */
export function setPartOpacityOverrides(overrides = {}) {
  partOpacityOverrides = { ...overrides };
  partOpacityEntries = Object.entries(partOpacityOverrides);
  syncPartOpacityTicker();
  applyPartOpacityOverrides();
}

function applyPartOpacityOverrides() {
  if (partOpacityEntries.length === 0) return;
  for (const [partId, opacity] of partOpacityEntries) {
    setPartOpacity(partId, opacity);
  }
}

/** Register the hot-path override only for profiles that actually use it. */
function syncPartOpacityTicker() {
  if (!app?.ticker) return;
  if (partOpacityEntries.length > 0 && !partOpacityTickerRegistered) {
    // Register after the auto-updating model so Cubism Pose cannot overwrite
    // the profile-owned rest composition in the rendered frame.
    app.ticker.add(applyPartOpacityOverrides);
    partOpacityTickerRegistered = true;
  } else if (partOpacityEntries.length === 0 && partOpacityTickerRegistered) {
    app.ticker.remove(applyPartOpacityOverrides);
    partOpacityTickerRegistered = false;
  }
}

/**
 * Get a Live2D parameter value by ID.
 *
 * @param {string} name
 * @returns {number}
 */
export function getParameter(name) {
  if (!live2dModel || !live2dModel.internalModel) return 0;
  try {
    const im = live2dModel.internalModel;
    const model = im.coreModel;
    if (model && model.getParameterValueById) {
      const idHandle = getParameterId(name);
      return idHandle ? model.getParameterValueById(idHandle) : 0;
    }
    return 0;
  } catch {
    return 0;
  }
}

function getParameterId(name) {
  if (parameterIdCache.has(name)) return parameterIdCache.get(name);
  const idManager = PIXI.live2d.CubismFramework.getIdManager();
  const idHandle = idManager.getId(name);
  // A failed lookup can become valid after model initialization; do not negative-cache it.
  if (idHandle) parameterIdCache.set(name, idHandle);
  return idHandle;
}

function getPartId(name) {
  if (partIdCache.has(name)) return partIdCache.get(name);
  const idHandle = PIXI.live2d.CubismFramework.getIdManager().getId(name);
  if (idHandle) partIdCache.set(name, idHandle);
  return idHandle;
}

/**
 * Check if model is loaded and ready.
 *
 * @returns {boolean}
 */
export function hasParameters() {
  return modelReady && !!live2dModel;
}

/**
 * Get the Live2D model instance for direct access.
 *
 * @returns {object|null}
 */
export function getModel() {
  return live2dModel;
}

/**
 * Play a profile-declared Cubism motion through the engine's native adapter.
 * The renderer never guesses a group name or file path from a model folder.
 */
export async function playNativeMotion(name) {
  const motion = getActiveProfile().nativeMotions?.[name];
  if (!motion || !live2dModel?.motion) return false;
  try {
    const started = Boolean(await live2dModel.motion(motion.group, motion.index, undefined, {
      loop: motion.loop === true,
      resetExpression: false,
    }));
    console.log(`[live2d-scene] Native motion ${started ? 'started' : 'not started'}:`, name, motion);
    return started;
  } catch (error) {
    // Native clips are optional profile capability; a bad clip must not make
    // an otherwise renderable companion fail its whole scene initialization.
    console.warn('[live2d-scene] Native motion failed:', name, error?.message || error);
    return false;
  }
}

/** Stop profile-native motions before renderer disposal or a clean reload. */
export function stopNativeMotions() {
  live2dModel?.stopMotions?.();
}

/**
 * Get the PIXI application instance.
 *
 * @returns {import('pixi.js').Application|null}
 */
export function getApp() {
  return app;
}

/**
 * Debug: expose internals for browser console inspection.
 */
export function __debug() {
  return { app, live2dModel, modelReady, lastInitError };
}

/** Last renderer initialization error, suitable for an on-screen debug hint. */
export function getLastInitError() {
  return lastInitError;
}

// ── Background ─────────────────────────────────────────

export function setBackgroundColor(colorHex) {
  if (!colorHex) return;
  bgColorHex = colorHex;
  if (app && app.renderer && !transparentCanvas) {
    app.renderer.background.color = colorHex;
  }
}

export async function setBackgroundImage(url) {
  if (!url || !app) return;
  bgImagePath = url;

  // Remove old background sprite
  if (bgSprite) {
    app.stage.removeChild(bgSprite);
    bgSprite.destroy({ texture: true });
    bgSprite = null;
  }

  try {
    const texture = await PIXI.Assets.load(url);
    bgSprite = new PIXI.Sprite(texture);
    app.stage.addChildAt(bgSprite, 0);
    _fitBackground();
  } catch (e) {
    console.warn('[live2d-scene] setBackgroundImage failed:', e.message);
  }
}

// ── Teardown ───────────────────────────────────────────

export function dispose() {
  window.removeEventListener('resize', _onResize);
  if (app && partOpacityTickerRegistered) {
    app.ticker.remove(applyPartOpacityOverrides);
  }
  partOpacityTickerRegistered = false;
  partOpacityOverrides = {};
  partOpacityEntries = [];
  if (live2dModel) {
    stopNativeMotions();
    try { live2dModel.destroy({ texture: true }); } catch {}
    live2dModel = null;
  }
  if (bgSprite) {
    try { bgSprite.destroy({ texture: true }); } catch {}
    bgSprite = null;
  }
  if (app) {
    try { app.destroy(true); } catch {}
    app = null;
  }
  modelReady = false;
  parameterIdCache.clear();
  partIdCache.clear();
  console.log('[live2d-scene] disposed');
}
