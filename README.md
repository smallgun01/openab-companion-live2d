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
│  ├── live2d-profile.js adapter   │
│  ├── live2d-anim.js  idle        │
│  └── settings.js  localStorage   │
└──────────────────────────────────┘
```

- **Live2D Scene**: PixiJS v8 Application + untitled-pixi-live2d-engine sprite (CDN), wraps Cubism 5 Core WASM. Idle animations (breathing, blinking, body sway) on top.
- **Chat**: SSE streaming via `fetch()` + `ReadableStream` — same parser as VRM companion
- **Expressions**: 8 emotion tags (`[joy]`, `[sadness]`, ...) parsed from responses; `{ static, dynamic }` structure; lerp for static, sine oscillation for dynamic.
- **Model profiles (P2b)**: application code expresses semantic intent—such as `joy`, `blink`, `gaze`, and `speak`—while a checked-in model profile owns Cubism parameter IDs, calibrated ranges, assets, layout, capabilities, and expression recipes. A registry selects the active model explicitly, so the same Jellii backend can render JellyFish Girl or Shizuku without leaking model-specific bindings across the app.
- **Settings**: endpoint/background in localStorage; bearer tokens remain in memory for one session only. HTTPS is required except for localhost development.

### Why untitled-engine

Rendering pipeline delegates to the upstream-maintained abstraction instead of guessing Cubism SDK behavior with hand-written shaders and monkey-patches.

## Quick Start

```bash
# 1. Clone
git clone https://github.com/smallgun01/openab-companion-live2d.git
cd openab-companion-live2d

# 2. Install licensed runtime assets (they are intentionally not committed)
#    See lib/README.md and provide JellyFish Girl under models/jellyfish-girl/.
#    Verify before starting: npm run check:assets

# 3. Start dev server
node dev-server.mjs

# 4. Open http://localhost:8011
#    Configure an HTTPS endpoint + session-only token in Settings (⚙️)
#    Start chatting
```

### Desktop runtime

`npm run dev:electron` first builds `desktop-dist/`, then Electron loads those
files directly. It does not start `dev-server.mjs` or a local gateway proxy.
The gateway connection uses the browser's normal TLS checks.

The desktop transport uses streamed SSE deltas for immediate rendering. Its
native request completion also returns accumulated text as a fallback, so a
missed renderer IPC event cannot leave a completed reply blank. History uses
the same completed response path.

### P2a/P2b model and expression profiles

P2a introduces a model-specific boundary under
`profiles/live2d/<profile-id>/`:

- `model-profile.js` declares the licensed model asset, layout, semantic
  capabilities, and Cubism parameter bindings.
- `expression-profile.js` defines the calibrated baseline and expression
  recipes for that model.
- `js/live2d-profile.js` validates and resolves those profiles before the
  scene, animation, or expression layers use them.

P2b adds an explicit registry with `jellyfish-girl-v1` as the default and
`shizuku-v1` as a second, independent profile. Shizuku is declared
neutral-expression-only with native-motion capability; it does not reuse
JellyFish Girl parameter recipes. See
[`docs/p2-model-expression-profiles.md`](docs/p2-model-expression-profiles.md)
for the semantic contract, validation rules, and the deferred work for native
expressions, motions, and second-model onboarding.

For development regression, Electron accepts an explicit profile ID:

```bash
npm run dev:electron -- --profile=jellyfish-girl-v1
npm run dev:electron -- --profile=shizuku-v1
```

The ID travels from Electron's command line into the renderer query, where the
registry validates it. An unknown ID fails fast; it does not silently load the
default model. The intended runtime sequence is A→B→A: JellyFish Girl, Shizuku,
then JellyFish Girl again.

### Runtime asset gate

Cubism Core and the JellyFish Girl model have separate licences and are not
committed to this repository. `npm run check:assets` is the preflight;
`npm run build:desktop-assets` runs it automatically and reports each missing
path. A clone without licensed assets therefore fails early and clearly.

## File Structure

```
openab-companion-live2d/
├── index.html              Entry point (loads Core WASM + PixiJS + engine from CDN)
├── dev-server.mjs          Static development server only
├── css/
│   └── style.css           All styles
├── js/
│   ├── main.js             Init, event wiring, message handling
│   ├── chat.js             SSE fetch + stream parser (60s timeout)
│   ├── expression.js       Emotion tag parser → engine params (lerp + sine)
│   ├── settings.js         localStorage persistence
│   ├── live2d-scene.js     PixiJS App init, model load, render loop
│   ├── live2d-profile.js   Profile loader, validation, semantic bindings
│   └── live2d-anim.js      Sine-driven idle animations
├── profiles/
│   └── live2d/
│       ├── registry.js                    Explicit profile catalog
│       ├── jellyfish-girl/                Default model profile
│       │   ├── model-profile.js
│       │   └── expression-profile.js
│       └── shizuku/                       Independent sample-model profile
│           ├── model-profile.js
│           └── expression-profile.js
├── electron/
│   ├── main.cjs             Native window and SSE transport
│   ├── preload.cjs          Safe renderer bridge with completion fallback
│   ├── profile-selection.cjs  Development profile CLI parsing
│   └── window-state.cjs     Window residency and restore state
├── docs/
│   └── p2-model-expression-profiles.md  P2a contract and migration record
├── lib/
│   ├── README.md           Cubism Core installation notes
│   └── LICENSE.md          Live2D SDK license notice
├── lib/CubismSdkForWeb-5-r.1/
│   └── Core/
│       └── live2dcubismcore.min.js   ← required by untitled-engine
├── models/
│   ├── jellyfish-girl/     Licensed JellyFish Girl model (not committed)
│   └── shizuku/            Cubism sample runtime model (not committed)
├── motions/                Post-MVP: .motion3.json files
├── LICENSE                 MIT
└── README.md
```

## Dependencies

| Library | Source | Notes |
|---|---|---|
| PixiJS v8 | `cdn.jsdelivr.net` (CDN) | Render pipeline |
| untitled-pixi-live2d-engine v1.3.1 | `cdn.jsdelivr.net` (CDN) | Live2D → PixiJS abstraction |
| Cubism Core WASM 5.1.0 | local licensed install | Required by untitled-engine |

## Verification

```bash
npm test                    # unit and transport/profile regression tests
npm run lint                # static project checks
npm run check:assets        # licensed Cubism/model asset gate
npm run build:desktop-assets
npm run dev:electron        # local desktop regression
```

For a GUI regression, verify one reply appears in the chat bubble and
History, then confirm an emotion tag and blink can coexist during that reply.

## License

- **Code**: MIT — see [LICENSE](LICENSE)
- **Cubism SDK**: Proprietary (Live2D Inc.) — see [lib/LICENSE.md](lib/LICENSE.md)
- **JellyFish Girl model**: Custom model — see repo for details

## Related

- [openab-companion](https://github.com/smallgun01/openab-companion) — VRM (3D) companion
- [OpenAB](https://github.com/openabdev/openab) — Unified bot backend
