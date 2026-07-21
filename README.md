# OpenAB Companion Live2D

Give OpenAB a 2D face — lightweight web Live2D Cubism character chat interface.

Zero build step, vanilla JS + **PixiJS v8** + **untitled-pixi-live2d-engine** (CDN) + Cubism Core WASM (local). Designed to pair with the [OpenAB Companion VRM](https://github.com/smallgun01/openab-companion) as a parallel renderer.

```
node dev-server.mjs
# Open http://localhost:8011
```

## Architecture

```
Browser                               OpenAB Backend
┌──────────────────────────────────┐      ┌──────────────────┐
│  index.html                      │      │  Gateway         │
│  ├── main.js                     │─────▶│  /v1/chat/       │
│  ├── chat.js      SSE stream     │      │   completions    │
│  ├── expression.js  emotions     │      └──────────────────┘
│  ├── live2d-scene.js  PixiJS App │
│  ├── live2d-anim.js  idle        │
│  └── settings.js  localStorage   │
└──────────────────────────────────┘
```

- **Live2D Scene**: PixiJS v8 Application + untitled-pixi-live2d-engine sprite (CDN), wraps Cubism 5 Core WASM. Idle animations (breathing, blinking, body sway) on top.
- **Chat**: SSE streaming via `fetch()` + `ReadableStream` — same parser as VRM companion
- **Expressions**: 8 emotion tags (`[joy]`, `[sadness]`, ...) parsed from responses; `{ static, dynamic }` structure; lerp for static, sine oscillation for dynamic.
- **Settings**: endpoint/token in localStorage

### Why untitled-engine

Rendering pipeline delegate to upstream-maintained abstraction (guansss/PixiJS) instead of guessing Cubism SDK behavior with hand-written shaders + monkey-patches. See `../projects/openab-companion-live2d/STATUS.md` for the full architectural rationale.

## Quick Start

```bash
# 1. Clone
git clone https://github.com/smallgun01/openab-companion-live2d.git
cd openab-companion-live2d

# 2. Make sure Cubism Core is in place (already shipped in repo)
#    lib/CubismSdkForWeb-5-r.1/Core/live2dcubismcore.min.js

# 3. Start dev server
node dev-server.mjs

# 4. Open http://localhost:8011
#    Configure endpoint + token in Settings (⚙️)
#    Start chatting
```

## File Structure

```
openab-companion-live2d/
├── index.html              Entry point (loads Core WASM + PixiJS + engine from CDN)
├── dev-server.mjs          Static file server + CORS proxy (⚠️ DEV ONLY)
├── css/
│   └── style.css           All styles
├── js/
│   ├── main.js             Init, event wiring, message handling
│   ├── chat.js             SSE fetch + stream parser (60s timeout)
│   ├── expression.js       Emotion tag parser → engine params (lerp + sine)
│   ├── settings.js         localStorage persistence
│   ├── live2d-scene.js     PixiJS App init, model load, render loop
│   └── live2d-anim.js      Sine-driven idle animations
├── lib/
│   ├── README.md           SDK setup notes (now obsolete — kept for git history)
│   └── LICENSE.md          Live2D SDK license notice
├── lib/CubismSdkForWeb-5-r.1/
│   └── Core/
│       └── live2dcubismcore.min.js   ← required by untitled-engine
├── models/
│   └── Haru/               JellyFish Girl (custom model)
├── motions/                Post-MVP: .motion3.json files
├── LICENSE                 MIT
└── README.md
```

## Dependencies

| Library | Source | Notes |
|---|---|---|
| PixiJS v8 | `cdn.jsdelivr.net` (CDN) | Render pipeline |
| untitled-pixi-live2d-engine v1.3.1 | `cdn.jsdelivr.net` (CDN) | Live2D → PixiJS abstraction |
| Cubism Core WASM 5.1.0 | `lib/` (local, shipped) | Required by untitled-engine |

## License

- **Code**: MIT — see [LICENSE](LICENSE)
- **Cubism SDK**: Proprietary (Live2D Inc.) — see [lib/LICENSE.md](lib/LICENSE.md)
- **JellyFish Girl model**: Custom model — see repo for details

## Related

- [openab-companion](https://github.com/smallgun01/openab-companion) — VRM (3D) companion
- [OpenAB](https://github.com/openabdev/openab) — Unified bot backend
