# P2a — Capability-Driven Model & Expression Profiles

## Decision

Live2D models are not interchangeable assets. Their parameter IDs, ranges,
available expressions/motions, rigging quality, and visual language differ by
illustration and by rigger. P2 therefore standardizes **semantic intent**, not
Cubism parameter names.

The renderer asks for a semantic operation such as `joy`, `blink`, `gaze`, or
`speak`. A model-specific profile determines whether that operation is
implemented with parameters, a native `.exp3.json`, a `.motion3.json`, or a
safe no-op fallback.

This document defines P2a only: the profile contract and a zero-regression
migration of JellyFish Girl. It deliberately does not change the renderer.

## Non-goals

- Do not auto-generate emotionally correct expressions from an unknown model.
- Do not require every model to implement every semantic capability.
- Do not force VRM to expose Cubism parameter IDs.
- Do not add an editor, model downloader, packaging work, or cloud control.
- Do not replace the existing transition/animation implementation in P2a.

## Layers and ownership

```
Gateway emotion tag / client state
          │  joy | sadness | thinking | neutral
          ▼
Semantic contract                 Shared across Live2D and future VRM
          │  applyExpression(), blink(), gaze(), speak()
          ▼
Live2D adapter                    Resolves profile recipes and validates use
          │
          ├── Model profile       Asset, layout, capabilities, bindings
          └── Expression profile  Per-model expression/idle recipes
          ▼
Cubism model                      Parameter IDs, native expressions, motions
```

Only the bottom layer knows names such as `ParamMouthOpenY`. Application code,
chat transport, and emotion-tag parsing never do.

## Profile contract

Profiles are checked-in JSON (or JS modules exporting the same data) under
`profiles/live2d/<profile-id>/`. A profile has a stable ID and an explicit
schema version. It is data, not executable user code.

```json
{
  "schemaVersion": 1,
  "id": "jellyfish-girl-v1",
  "displayName": "JellyFish Girl",
  "renderer": "live2d-cubism",
  "assets": {
    "model": "models/jellyfish-girl/jellyfishgirl.model3.json"
  },
  "layout": {
    "anchor": [0.5, 1.0],
    "fit": "contain-width",
    "scaleMultiplier": 0.85,
    "placement": "bottom-center"
  },
  "capabilities": {
    "expressions": ["neutral", "joy", "sadness", "anger", "surprise", "fear", "disgust", "smirk", "thinking"],
    "blink": "parameter",
    "gaze": "parameter",
    "lipSync": "parameter",
    "breath": "parameter",
    "nativeExpressions": false,
    "motions": false,
    "physics": "model-default"
  },
  "bindings": {
    "blink.left": { "id": "ParamEyeLOpen", "range": [0, 1], "closed": 0, "open": 1 },
    "blink.right": { "id": "ParamEyeROpen", "range": [0, 1], "closed": 0, "open": 1 },
    "lipSync.open": { "id": "ParamMouthOpenY", "range": [0, 1], "closed": 0, "open": 1 },
    "gaze.x": { "id": "ParamEyeBallX", "range": [-1, 1] },
    "gaze.y": { "id": "ParamEyeBallY", "range": [-1, 1] },
    "idle.breath": { "id": "ParamBreath", "range": [0, 1] },
    "idle.bodySway": { "id": "ParamBodyAngleX", "range": [-10, 10] },
    "idle.headSway": { "id": "ParamAngleX", "range": [-30, 30] }
  }
}
```

### Binding rules

- A semantic binding is optional. Missing binding means the capability is
  unavailable, not an error to hide with a guessed parameter name.
- `range` records the model's native calibrated range. Recipe values retain
  native units when precision matters (for example degrees); helpers may map a
  semantic normalized value to this range when the caller supplies `0..1`.
- A binding may later add `invert: true` when a model's visual direction is
  opposite to the semantic convention.
- One Cubism parameter may support more than one semantic binding only when
  the profile declares the priority/ownership rule explicitly.

## Expression profile

The expression profile owns model performance direction. An emotion has one
of four implementations, selected per model rather than globally.

```json
{
  "schemaVersion": 1,
  "modelProfile": "jellyfish-girl-v1",
  "transitionMs": 300,
  "baseline": {
    "ParamEyeLOpen": 1,
    "ParamEyeROpen": 1,
    "ParamMouthForm": 0.2,
    "ParamMouthOpenY": 0,
    "ParamCheek": 0,
    "ParamAngleX": 0,
    "ParamAngleY": 0,
    "ParamAngleZ": 0,
    "ParamBodyAngleX": 0,
    "ParamBodyAngleY": 0,
    "ParamBodyAngleZ": 0
  },
  "expressions": {
    "joy": {
      "kind": "parameters",
      "static": { "ParamEyeLSmile": 1, "ParamEyeRSmile": 1, "ParamMouthForm": 1, "ParamMouthOpenY": 1, "ParamCheek": 0.5, "ParamBodyAngleY": 2 },
      "dynamic": { "ParamAngleZ": [8, 2.8, 0] }
    },
    "thinking": {
      "kind": "parameters",
      "static": { "ParamEyeBallX": 0.35, "ParamEyeBallY": 0.3, "ParamMouthOpenY": 0.05 },
      "dynamic": { "ParamEyeBallX": [0.1, 4.5, 0] }
    },
    "neutral": { "kind": "parameters", "static": {} }
  },
  "fallbacks": {
    "unknownEmotion": "neutral",
    "missingBinding": "skip",
    "unsupportedExpression": "neutral"
  }
}
```

Supported `kind` values:

- `parameters`: current static/dynamic lerp behavior.
- `native-expression`: an explicitly named `.exp3.json` asset.
- `motion`: an explicitly named `.motion3.json` asset with a declared loop
  policy.
- `none`: intentional no-op; useful for a model without a credible emotional
  signal for that semantic intent.

P2a implements and migrates `parameters` only. The other kinds are contract
reservations, not a promise that the current engine exposes them yet.

## Validation contract

Before any profile can control a loaded model, the Live2D adapter must produce
a validation report:

- asset model path is present and loads;
- every referenced parameter ID is present in the model;
- every recipe parameter exists in the model profile or is explicitly marked
  model-local;
- dynamic recipes have `amplitude >= 0` and `periodSeconds > 0`;
- no parameter is simultaneously owned by incompatible idle and expression
  layers without an expression-over-idle priority declaration;
- declared native expressions/motions exist when those profile kinds are used.

Development: surface the complete report in the console/diagnostics UI.
Production: do not crash or issue repeated unknown-parameter warnings. Skip
only the invalid operation and fall back to neutral when the requested
expression cannot be formed.

Validation must report facts, not infer emotional correctness. Visual quality
is a human calibration decision.

## JellyFish Girl migration inventory

P2a must preserve the following current behavior exactly before any second
model is introduced.

| Current hard-coded location | Destination | Required behavior |
| --- | --- | --- |
| `live2d-scene.js` model path and relayout constants | model profile `assets` and `layout` | same model, bottom-center anchor, 0.85 fit multiplier |
| `expression.js` baseline and `EMOTION_MAP` | expression profile | same eight tags plus `thinking`, same 300 ms transition and dynamics |
| `live2d-anim.js` idle/blink/lip-sync parameter IDs | model profile `bindings` | same blink timing, breath, sway, head sway, lip-sync response |
| `setParameter()` callers | adapter semantic resolution | no direct JellyFish parameter IDs outside profile/adapter |

## P2a deliverables and gates

1. Add profile schema documentation and a checked-in JellyFish Girl profile.
2. Add a thin Live2D profile loader/validator without changing visual output.
3. Migrate the current model path, layout, expression map, idle, blink, and
   lip-sync bindings into the profile through one adapter boundary.
4. Preserve the existing eight emotion tags and `thinking` client state.
5. Add unit tests for profile validation and profile fallback behavior.
6. Run existing gates plus a manual JellyFish Girl regression: load, all eight
   tags, thinking → tag handoff, blink, tray minimize/restore, and history.

P2a is complete only when JellyFish Girl remains visually and behaviorally
unchanged while no application module directly depends on its parameter IDs.

## New-model onboarding protocol (P2b preview)

1. Add the model assets without committing licensed assets that are not
   redistributable.
2. Run profile inspection to list concrete parameter/expression/motion facts.
3. Create a draft profile with only verified bindings.
4. Calibrate each semantic expression against the original art and rigger's
   intended motion language.
5. Validate, then manually approve visual behavior. Missing capability stays
   a deliberate fallback; it is never fabricated.

## Deferred decisions

- JSON Schema file versus JS-module profiles: choose after confirming how much
  tooling and comments/calibration metadata the first real profile needs.
- Profile selection UI: P2a uses a fixed selected profile to avoid changing
  settings UX before two models exist.
- Native expression/motion playback adapter details: specify only after a
  target model supplies those assets and engine support is verified.
- VRM adapter: shares semantic contract, but uses a distinct VRM profile and
  does not reuse Cubism bindings.
