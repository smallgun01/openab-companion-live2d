#!/bin/bash
# setup.sh — Compile Cubism 5 Framework TypeScript → ES modules
#
# Prerequisites:
#   1. Download Cubism SDK for Web from https://www.live2d.com/sdk/download/web/
#   2. Place CubismSdkForWeb-5-r.1/ under lib/
#   3. Run: bash lib/setup.sh
#
# One-time setup. Not part of the dev loop.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
SDK_DIR="$SCRIPT_DIR/CubismSdkForWeb-5-r.1"
OUT_DIR="$SCRIPT_DIR/CubismFramework"

echo "=== OpenAB Companion Live2D — SDK Setup ==="

# ── Check SDK exists ──
if [ ! -d "$SDK_DIR/Core" ]; then
  echo "❌ Cubism SDK not found at $SDK_DIR"
  echo ""
  echo "   Download from: https://www.live2d.com/sdk/download/web/"
  echo "   Or clone:      git clone https://github.com/Live2D/CubismWebSamples.git"
  echo ""
  echo "   Place the SDK so that lib/CubismSdkForWeb-5-r.1/Core/ exists."
  exit 1
fi

echo "✓ SDK found at $SDK_DIR"

# ── Check Core files ──
CORE_JS="$SDK_DIR/Core/live2dcubismcore.js"
if [ ! -f "$CORE_JS" ]; then
  echo "❌ Core JS not found: $CORE_JS"
  exit 1
fi
echo "✓ Cubism Core OK"

# ── Check Framework source ──
FW_SRC="$SDK_DIR/Framework/src"
if [ ! -d "$FW_SRC" ]; then
  echo "❌ Framework source not found at $FW_SRC"
  echo "   Make sure the SDK zip is fully extracted."
  exit 1
fi
echo "✓ Framework source found"

# ── Check esbuild ──
if ! command -v npx &>/dev/null; then
  echo "❌ npx not found — Node.js required for one-time SDK compilation"
  exit 1
fi

# ── Compile Framework TS → ES modules ──
echo ""
echo "Compiling Cubism Framework (TypeScript → ES modules)…"
mkdir -p "$OUT_DIR"

# Bundle all Framework source files into a single ES module
# This preserves ESM imports so our code can tree-shake
npx --yes esbuild \
  "$FW_SRC/live2dcubismframework.ts" \
  "$FW_SRC/live2dcubismusermodel.ts" \
  "$FW_SRC/live2dcubismmoc.ts" \
  "$FW_SRC/live2dcubismmodelmatrix.ts" \
  "$FW_SRC/live2dcubismmatrix44.ts" \
  --bundle \
  --format=esm \
  --outdir="$OUT_DIR" \
  --target=es2020 \
  --sourcemap \
  --log-level=warning 2>&1

# ── Verify output ──
if [ -f "$OUT_DIR/live2dcubismframework.js" ]; then
  echo ""
  echo "✅ Setup complete!"
  echo "   Framework compiled → $OUT_DIR/"
  echo "   Core loaded via   → $CORE_JS"
  echo ""
  echo "   Start the dev server:  node dev-server.mjs"
  echo "   Open:                  http://localhost:8011"
else
  echo "❌ Compilation failed — no output files"
  exit 1
fi
