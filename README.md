# OpenAB Companion Live2D

Give OpenAB a 2D face — lightweight web Live2D Cubism character chat interface.

Zero build step, vanilla JS + Cubism 5 SDK for Web. Designed to pair with the [OpenAB Companion VRM](https://github.com/smallgun01/openab-companion) as a parallel renderer.

```
node dev-server.mjs
# Open http://localhost:8011
```

## Architecture

```
Browser                               OpenAB Backend
┌──────────────────────────────┐      ┌──────────────────┐
│  index.html                  │      │  Gateway         │
│  ├── main.js                 │─────▶│  /v1/chat/       │
│  ├── chat.js    SSE stream   │      │   completions    │
│  ├── expression.js  emotions │      └──────────────────┘
│  ├── live2d-scene.js  Cubism │
│  ├── live2d-anim.js  idle    │
│  └── settings.js  localStorage│
└──────────────────────────────┘
```

- **Live2D Scene**: Cubism SDK WebGL rendering with idle animations (breathing, blinking, body sway)
- **Chat**: SSE streaming via `fetch()` + `ReadableStream` — same parser as VRM companion
- **Expressions**: 19 emotion tags (`[happy]`, `[sad]`, …) parsed from responses, lerp-applied to Cubism parameters
- **Settings**: endpoint/token in localStorage

## Quick Start

```bash
# 1. Clone
git clone https://github.com/smallgun01/openab-companion-live2d.git
cd openab-companion-live2d

# 2. Set up Cubism SDK (one-time)
#    Download from https://www.live2d.com/sdk/download/web/
#    Place CubismSdkForWeb-5-r.1/ under lib/
bash lib/setup.sh

# 3. Start dev server
node dev-server.mjs

# 4. Open http://localhost:8011
#    Configure endpoint + token in Settings (⚙️)
#    Start chatting
```

## File Structure

```
openab-companion-live2d/
├── index.html              Entry point + Cubism Core <script>
├── dev-server.mjs          Static file server + CORS proxy (⚠️ DEV ONLY)
├── css/
│   └── style.css           All styles
├── js/
│   ├── main.js             Init, event wiring, message handling
│   ├── chat.js             SSE fetch + stream parser (60s timeout)
│   ├── expression.js       Emotion tag parser + Cubism parameter control
│   ├── settings.js         localStorage persistence
│   ├── live2d-scene.js     Cubism SDK init, model load, WebGL render loop
│   └── live2d-anim.js      Parameter-based idle animations (breathing + blinking + sway)
├── lib/
│   ├── README.md           SDK setup instructions
│   ├── setup.sh            One-time SDK compilation script
│   └── LICENSE.md          Live2D SDK license notice
├── models/
│   └── Haru/               JellyFish Girl (custom model)
├── motions/                Post-MVP: .motion3.json files
├── LICENSE                 MIT
└── README.md
```

## Dependencies

| Library | Source | Notes |
|---|---|---|
| Cubism Core (WASM) | `lib/` (local) | Must download from Live2D |
| Cubism Framework (JS) | `lib/CubismFramework/` (compiled) | Compiled from SDK TS by setup.sh |
| No CDN / npm dependencies | | Zero build step |

## License

- **Code**: MIT — see [LICENSE](LICENSE)
- **Cubism SDK**: Proprietary (Live2D Inc.) — see [lib/LICENSE.md](lib/LICENSE.md)
- **Sample model (Haru)**: Live2D Inc., included in SDK for development use

## Related

- [openab-companion](https://github.com/smallgun01/openab-companion) — VRM (3D) companion
- [OpenAB](https://github.com/openabdev/openab) — Unified bot backend
