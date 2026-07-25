# Cubism Core setup

This project uses `untitled-pixi-live2d-engine` with the **Cubism Core** only.
The Core and JellyFish Girl model are licensed assets and are intentionally not
committed to this repository.

## Install the required Core file

1. Download the Cubism SDK for Web from <https://www.live2d.com/sdk/download/web/> and accept its licence.
2. Copy `Core/live2dcubismcore.min.js` into:

   ```text
   lib/CubismSdkForWeb-5-r.1/Core/live2dcubismcore.min.js
   ```

3. Place the separately licensed JellyFish Girl model under `models/jellyfish-girl/`.
4. Run `npm run check:assets` before launching the web or Electron runtime.

There is deliberately no `lib/setup.sh`, no local Cubism Framework build, and
no `CubismFramework/` directory. PixiJS and the Live2D engine are loaded from
the pinned CDN paths in `index.html`.

## Licence

The Live2D Cubism SDK is proprietary software. See `lib/LICENSE.md` and the
<https://www.live2d.com/eula/live2d-sdk-license-agreement_en.html> licence
agreement. Commercial use may require a separate Live2D Publishing License.
