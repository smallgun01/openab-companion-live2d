/**
 * live2d-scene.js — Cubism SDK initialization, model loading, WebGL render loop.
 *
 *   initScene(canvas, bgColor)    — one-time WebGL + CubismFramework setup
 *   loadModel(modelDir)           — load .model3.json + textures
 *   setParameter(name, value)     — set a Cubism parameter (0–1)
 *   getParameter(name)            — get current parameter value
 *   getParameterNames()           — list all parameter IDs
 *   hasParameters()               — model loaded and ready?
 *   setBackgroundColor(color)     — update clear color
 *   dispose()                     — tear down
 *
 * SDK SETUP: Run `bash lib/setup.sh` once to compile Cubism Framework TS → ES modules.
 * Core (live2dcubismcore.js + .wasm) loads via <script> in index.html.
 *
 * Cubism SDK is (c) Live2D Inc. — see lib/LICENSE.md
 */

// ── Fix 1: csmGetMocVersion (Core 5.1.0 expects pointer, Framework passes ArrayBuffer)
(function patchCsmGetMocVersion() {
  const orig = Live2DCubismCore.Version.csmGetMocVersion;
  Live2DCubismCore.Version.csmGetMocVersion = function (mocBytes) {
    if (mocBytes && typeof mocBytes.byteLength === 'number') return 0;
    return orig.call(this, mocBytes);
  };
})();

// ── Fix 2: Model.fromMoc — inject offscreens + blendModes (Core 5.1.0 missing)
(function patchModelFromMoc() {
  const origFromMoc = Live2DCubismCore.Model.fromMoc;
  Live2DCubismCore.Model.fromMoc = function (moc) {
    const model = origFromMoc.call(this, moc);
    if (model) {
      if (!model.offscreens) model.offscreens = { count: 0 };
      if (model.drawables && !model.drawables.blendModes)
        model.drawables.blendModes = new Int32Array(model.drawables.count);
    }
    return model;
  };
})();

// ── Cubism Framework imports ─────────────────────────────
// Path: lib/CubismFramework/ — compiled from SDK TS barrel by setup.sh
import {
  CubismFramework,
  CubismUserModel,
  CubismMatrix44,
} from '../lib/CubismFramework/live2dcubismframework.js';

// ── Module state ────────────────────────────────────────

/** @type {WebGLRenderingContext} */
let gl;

/** @type {HTMLCanvasElement} */
let canvas;

/** @type {CubismUserModel} */
let userModel = null;

/** @type {object} — parsed .model3.json settings */
let modelSetting = null;

/** @type {number[]} — clear color [r, g, b, a] 0–1 */
let bgColor = [0.102, 0.102, 0.180, 1.0]; // #1a1a2e

/** @type {CubismMatrix44} — shared orthographic projection, rebuilt on resize */
let projectionMatrix = null;

/** @type {number} — render loop animation frame id */
let animationFrameId = null;

/** @type {WebGLTexture[]} — tracked for cleanup on dispose */
const textures = [];

/** @type {boolean} — first draw error already logged */
let drawErrorLogged = false;

/** @type {number} — canvas pixel ratio */
let devicePixelRatio = 1;

/** @type {boolean} — framework initialized */
let frameworkReady = false;

// ── Initialization ─────────────────────────────────────

/**
 * Initialize WebGL context and Cubism Framework. Call once.
 *
 * @param {HTMLCanvasElement} canvasEl
 * @param {string} [colorHex] — background CSS color, e.g. '#1a1a2e'
 * @returns {boolean} — true on success
 */
export function initScene(canvasEl, colorHex) {
  canvas = canvasEl;
  devicePixelRatio = window.devicePixelRatio || 1;

  // ── WebGL context ──
  const ctxOpts = {
    alpha: true,
    premultipliedAlpha: true,
    antialias: true,
    preserveDrawingBuffer: false,
  };
  gl = canvas.getContext('webgl', ctxOpts) || canvas.getContext('experimental-webgl', ctxOpts);
  if (!gl) {
    console.error('[live2d-scene] WebGL not available');
    return false;
  }

  // ── Cubism Framework startup ──
  try {
    CubismFramework.startUp({
      logFunction: console.log,
      loggingEnabled: false,
    });
    CubismFramework.initialize();
    frameworkReady = true;
    console.log('[live2d-scene] CubismFramework initialized');
  } catch (err) {
    console.error('[live2d-scene] CubismFramework startup failed:', err.message);
    console.error('[live2d-scene] Did you run `bash lib/setup.sh`? See lib/README.md');
    return false;
  }

  if (colorHex) {
    setBackgroundColor(colorHex);
  }

  resizeCanvas();
  window.addEventListener('resize', resizeCanvas);

  // Build orthographic projection: pixel coords → clip space [-1, 1]
  // Y is flipped: WebGL Y ↑ but model Y ↓ in pixel space
  buildProjection();

  // Start empty render loop (model drawn after load)
  lastTime = performance.now();
  animationFrameId = requestAnimationFrame(tick);

  return true;
}

// ── Model loading ──────────────────────────────────────

/**
 * Load a Live2D model from a directory containing .model3.json + resources.
 *
 * @param {string} modelDir — path to model directory, e.g. 'models/Haru/'
 * @returns {Promise<boolean>}
 */
export async function loadModel(modelDir) {
  if (!frameworkReady || !gl) {
    console.error('[live2d-scene] Cannot load model — framework not ready');
    return false;
  }

  // Normalize directory path
  const dir = modelDir.endsWith('/') ? modelDir : modelDir + '/';

  // ── Fetch .model3.json (auto-detect filename in directory) ──
  let settingJson;
  try {
    // Try listing directory for any .model3.json file
    let modelJsonPath = null;
    try {
      const listingResp = await fetch(dir);
      if (listingResp.ok) {
        const html = await listingResp.text();
        const match = html.match(/href="([^"]+\.model3\.json)"/i);
        if (match) modelJsonPath = dir + match[1];
      }
    } catch { /* directory listing may fail — try known names */ }

    // Fallbacks
    if (!modelJsonPath) {
      for (const name of ['jellyfishgirl.model3.json', 'Haru.model3.json']) {
        try {
          const probe = await fetch(dir + name, { method: 'HEAD' });
          if (probe.ok) { modelJsonPath = dir + name; break; }
        } catch { /* continue */ }
      }
    }

    if (!modelJsonPath) throw new Error('No .model3.json found in ' + dir);

    const resp = await fetch(modelJsonPath);
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    settingJson = await resp.json();
  } catch (err) {
    console.error('[live2d-scene] Failed to load .model3.json:', err.message);
    return false;
  }

  modelSetting = settingJson;

  // ── Dispose previous model ──
  if (userModel) {
    userModel.releaseRenderer?.();
    userModel.releaseMoc?.();
    userModel = null;
  }

  // ── Load .moc3 (use FileReferences.Moc from model3.json) ──
  const mocFileName = settingJson.FileReferences?.Moc;
  if (!mocFileName) {
    console.error('[live2d-scene] No Moc reference in .model3.json');
    return false;
  }
  let mocBuffer;
  try {
    const resp = await fetch(dir + mocFileName);
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    mocBuffer = await resp.arrayBuffer();
  } catch (err) {
    console.error('[live2d-scene] Failed to load .moc3:', err.message);
    return false;
  }

  // ── Create model from MOC ──
  try {
    console.log('[live2d-scene] mocBuffer type:', mocBuffer?.constructor?.name, 'size:', mocBuffer?.byteLength);
    userModel = new CubismUserModel();
    console.log('[live2d-scene] CubismUserModel created, calling loadModel...');
    userModel.loadModel(mocBuffer);  // handles Moc creation, param save, model matrix
    console.log('[live2d-scene] loadModel OK, creating renderer...');

    // Create renderer with canvas dimensions
    const cw = Math.floor(canvas.width / devicePixelRatio);
    const ch = Math.floor(canvas.height / devicePixelRatio);
    userModel.createRenderer(cw, ch);

    // ⚠️ CRITICAL: CubismRenderer_WebGL.startUp(gl) must be called after
    // createRenderer(). Without it, this.gl is null and drawModel() silently
    // renders nothing. initialize() explicitly skips GL context setup.
    const renderer = userModel.getRenderer();
    if (renderer && renderer.startUp) {
      renderer.startUp(gl);
      console.log('[live2d-scene] Renderer startUp(gl) called');

      // 🔬 Force shader loading + monkey-patch to trace
      const proto = Object.getPrototypeOf(renderer);
      const origLoadShaders = proto.loadShaders;
      proto.loadShaders = function (sp) {
        const shader = this._rendererProfile?._shader || 'unknown';
        console.log('[live2d-scene] renderer.loadShaders() called — gl exists:', !!this.gl);
        return origLoadShaders.call(this, sp);
      };
      // Try explicit call
      console.log('[live2d-scene] Calling renderer.loadShaders() explicitly...');
      try { renderer.loadShaders(); } catch(e) { console.warn('[live2d-scene] loadShaders threw:', e.message); }
    } else {
      console.warn('[live2d-scene] Renderer has no startUp method');
    }

    console.log('[live2d-scene] Model loaded from MOC');
  } catch (err) {
    console.error('[live2d-scene] Model creation failed:', err.message, err.stack);
    return false;
  }

  // ── Load textures ──
  const texturePaths = settingJson.FileReferences?.Textures || [];
  for (let i = 0; i < texturePaths.length; i++) {
    const texPath = texturePaths[i];
    try {
      const img = await loadImage(dir + texPath);
      const tex = createGLTexture(img);
      // Register texture with Cubism renderer
      const renderer = userModel.getRenderer?.();
      if (renderer) {
        try {
          renderer.bindTexture?.(i, tex);
          console.log(`[live2d-scene] Texture ${i} (${texPath}) bound OK`);
        } catch (e) {
          console.warn(`[live2d-scene] bindTexture failed for ${i}:`, e.message);
        }
      } else {
        console.warn('[live2d-scene] No renderer for texture binding');
      }
    } catch (err) {
      console.warn(`[live2d-scene] Texture ${i} (${texPath}) failed:`, err.message);
    }
  }

  // ── Setup model matrix ──
  const matrix = userModel.getModelMatrix?.();
  if (matrix) {
    const modelObj = userModel.getModel?.();
    const cw = modelObj?.getCanvasWidth?.();
    const ch = modelObj?.getCanvasHeight?.();
    console.log('[live2d-scene] Model canvas:', cw, 'x', ch);
    console.log('[live2d-scene] Viewport:', canvas.width, 'x', canvas.height);
    const dc = modelObj?._model?.drawables?.count;
    console.log('[live2d-scene] Drawables:', dc, '| Vert[0]=', modelObj?._model?.drawables?.vertexCounts?.[0]);

    // Use default CubismModelMatrix from loadModel (no manual setup)
    const cvw = canvas.width / devicePixelRatio;
    const cvh = canvas.height / devicePixelRatio;
    console.log('[live2d-scene] Canvas:', cvw, 'x', cvh, '| using default model matrix');
  }

  console.log('[live2d-scene] Model loaded:', modelDir);
  return true;
}

// ── Parameter access ───────────────────────────────────

/**
 * Set a Cubism parameter by name (string ID from model).
 *
 * @param {string} name  — parameter ID, e.g. 'ParamMouthOpenY'
 * @param {number} value — 0.0–1.0 (clamped)
 */
export function setParameter(name, value) {
  if (!userModel) return;
  const model = userModel.getModel?.();
  if (!model) return;

  // Angle params (ParamAngleX/Y/Z, ParamBodyAngleX/Y/Z) use degree-scale
  // values (~ -30..30), NOT 0-1. Only clamp params known to be 0-1 range.
  const clamped = Math.max(-100, Math.min(100, value));  // safety clamp only
  try {
    model.setParameterValueById(name, clamped);
  } catch {
    // Unknown parameter — silent ignore
  }
}

/**
 * Get current parameter value.
 *
 * @param {string} name
 * @returns {number} 0–1
 */
export function getParameter(name) {
  if (!userModel) return 0;
  const model = userModel.getModel?.();
  if (!model) return 0;

  try {
    return model.getParameterValueById?.(name) ?? 0;
  } catch {
    return 0;
  }
}

/**
 * List all parameter IDs on the loaded model.
 *
 * @returns {string[]}
 */
export function getParameterNames() {
  if (!userModel) return [];
  const model = userModel.getModel?.();
  if (!model) return [];

  const count = model.getParameterCount?.() || 0;
  const ids = [];
  for (let i = 0; i < count; i++) {
    try {
      ids.push(model.getParameterId?.(i) || `param_${i}`);
    } catch {
      ids.push(`param_${i}`);
    }
  }
  return ids;
}

/**
 * Check if a loaded model is ready for expression/animation.
 *
 * @returns {boolean}
 */
export function hasParameters() {
  return !!(userModel && userModel.getModel?.());
}

// ── Rendering ──────────────────────────────────────────

let lastTime = 0;
let _drawFirstLogged = false;
let _frameCount = 0;
let _frameLogged = false;

function tick(now) {
  animationFrameId = requestAnimationFrame(tick);
  const deltaTime = (now - lastTime) / 1000;
  lastTime = now;

  _frameCount++;
  if (!_frameLogged && _frameCount === 60) {
    console.log('[live2d-scene] Render loop running — 60 frames drawn');
    _frameLogged = true;
  }

  if (!gl || !canvas) return;

  if (gl.canvas.width !== canvas.width || gl.canvas.height !== canvas.height) {
    gl.canvas.width = canvas.width;
    gl.canvas.height = canvas.height;
  }

  gl.viewport(0, 0, canvas.width, canvas.height);
  gl.clearColor(bgColor[0], bgColor[1], bgColor[2], bgColor[3]);
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

  // Draw model if loaded
  if (userModel && frameworkReady) {
    if (!_drawFirstLogged) {
      _drawFirstLogged = true;
      const renderer = userModel.getRenderer?.();
      const model = userModel.getModel?.();
      console.log('[live2d-scene] First draw() — renderer:', !!renderer, '| model:', !!model);
      console.log('[live2d-scene] Projection:', projectionMatrix?.getArray?.());
      console.log('[live2d-scene] ModelMatrix:', userModel.getModelMatrix?.()?.getArray?.());
    }
    try {
      userModel.update?.();
      userModel.draw?.(projectionMatrix);
      drawErrorLogged = false;
      // Check WebGL errors once per 60 frames
      if (_frameCount % 60 === 0) {
        let err = gl.getError();
        while (err !== gl.NO_ERROR) {
          console.warn('[live2d-scene] WebGL error:', err);
          err = gl.getError();
        }
      }
    } catch (err) {
      if (!drawErrorLogged) {
        console.warn('[live2d-scene] Render error:', err.message, err.stack);
        drawErrorLogged = true;
      }
    }
  }
}

function resizeCanvas() {
  if (!canvas) return;
  const parent = canvas.parentElement;
  if (!parent) return;

  const rect = parent.getBoundingClientRect();
  canvas.width = Math.floor(rect.width * devicePixelRatio);
  canvas.height = Math.floor(rect.height * devicePixelRatio);
  canvas.style.width = rect.width + 'px';
  canvas.style.height = rect.height + 'px';
  buildProjection();
}

/**
 * Build projection matrix: Cubism screen space → WebGL clip space.
 * Model matrix already handles model→screen mapping via CubismModelMatrix.
 * Projection adds aspect ratio correction only.
 */
function buildProjection() {
  if (!canvas) return;
  const cw = canvas.width / devicePixelRatio;
  const ch = canvas.height / devicePixelRatio;
  projectionMatrix = new CubismMatrix44();
  // Same pattern as Open-LLM-VTuber onUpdate()
  if (cw < ch) {
    projectionMatrix.scale(1.0, cw / ch);
  } else {
    projectionMatrix.scale(ch / cw, 1.0);
  }
}

// ── Helpers ────────────────────────────────────────────

function loadImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Image load failed: ${url}`));
    img.src = url;
  });
}

function createGLTexture(image) {
  if (!gl) return null;
  const tex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.bindTexture(gl.TEXTURE_2D, null);
  textures.push(tex);  // track for cleanup
  return tex;
}

function setupLayout(matrix, modelWidth, modelHeight) {
  if (!canvas) return;

  const canvasW = canvas.width / devicePixelRatio;
  const canvasH = canvas.height / devicePixelRatio;

  // CubismModelMatrix already has Y-flip from constructor (scaleY = -w/width).
  // Just adjust scale to fit canvas height and center horizontally.
  // Do NOT call loadIdentity() — it destroys the Y-flip.
  const scale = canvasH / (modelHeight || 1);
  const scaledW = (modelWidth || 1) * scale;
  const offsetX = (canvasW - scaledW) / 2;

  matrix.scale(scale, scale);
  matrix.translateRelative(offsetX / scale, 0);

  console.log('[live2d-scene] Layout: scale=', scale.toFixed(1), 'offsetX=', offsetX.toFixed(1));
}

// ── Background ─────────────────────────────────────────

export function setBackgroundColor(colorHex) {
  if (!colorHex) return;
  const r = parseInt(colorHex.slice(1, 3), 16) / 255;
  const g = parseInt(colorHex.slice(3, 5), 16) / 255;
  const b = parseInt(colorHex.slice(5, 7), 16) / 255;
  bgColor = [r, g, b, 1.0];
}

// ── Teardown ───────────────────────────────────────────

export function dispose() {
  if (animationFrameId) {
    cancelAnimationFrame(animationFrameId);
    animationFrameId = null;
  }

  if (userModel) {
    try { userModel.releaseRenderer?.(); } catch {}
    try { userModel.releaseMoc?.(); } catch {}
    userModel = null;
  }

  // Cleanup tracked textures
  for (const tex of textures) {
    if (gl) try { gl.deleteTexture(tex); } catch {}
  }
  textures.length = 0;

  if (frameworkReady) {
    try { CubismFramework.dispose?.(); } catch {}
    frameworkReady = false;
  }

  modelSetting = null;
  console.log('[live2d-scene] disposed');
}
