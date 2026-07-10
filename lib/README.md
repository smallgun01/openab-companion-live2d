# Cubism SDK — Setup

This project uses **Live2D Cubism 5 SDK for Web**. The SDK files **cannot** be distributed in this repo per the Live2D EULA — you must download them yourself.

## Quick Setup

```bash
# 1. Download Cubism 5 SDK for Web
#    Visit https://www.live2d.com/sdk/download/web/
#    Accept the license and download CubismSdkForWeb-5-r.1.zip

# 2. Extract the zip
unzip CubismSdkForWeb-5-r.1.zip -d /tmp/

# 3. OR clone from GitHub (same SDK)
git clone https://github.com/Live2D/CubismWebSamples.git /tmp/CubismWebSamples

# 4. Copy SDK files into this project
#    From the official zip:
cp -r /tmp/CubismSdkForWeb-5-r.1/Core ./lib/

#    From GitHub samples:
cp -r /tmp/CubismWebSamples/Samples/TypeScript/Demo/Packages/CubismSdkForWeb-5-r.1/Core ./lib/

# 5. Run the setup script
bash lib/setup.sh
```

## What setup.sh Does

1. Copies the Cubism Core (`.wasm` + `.js`) into place
2. Compiles the Framework TypeScript → ES modules with esbuild
3. Outputs to `lib/CubismFramework/`

## SDK License

The Live2D Cubism SDK is proprietary software. See `lib/LICENSE.md` for details.

You **must** accept the Live2D SDK License Agreement before using this software:
https://www.live2d.com/eula/live2d-sdk-license-agreement_en.html

Commercial use requires a separate Live2D Publishing License.
