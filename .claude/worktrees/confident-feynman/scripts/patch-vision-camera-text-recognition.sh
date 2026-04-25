#!/usr/bin/env bash
# Patches react-native-vision-camera-v3-text-recognition@1.1.1 so it compiles
# against VisionCamera 4.x on iOS:
#   1. Fixes the VisionCameraProxy.h import path (needs <VisionCamera/...>)
#   2. Renames the .m file to .mm so Objective-C++ stdlib headers resolve
#      (VisionCameraProxyHolder transitively pulls in <condition_variable>).
#
# Runs in postinstall so it's idempotent and survives npm install / CI.

set -euo pipefail

PLUGIN_DIR="node_modules/react-native-vision-camera-v3-text-recognition/ios"
M_FILE="$PLUGIN_DIR/VisionCameraV3TextRecognition.m"
MM_FILE="$PLUGIN_DIR/VisionCameraV3TextRecognition.mm"

# If the plugin isn't installed (e.g. fresh clone with no node_modules), bail quietly.
if [ ! -d "$PLUGIN_DIR" ]; then
  exit 0
fi

# Step 1: fix the import path. Works on whichever file currently exists.
TARGET=""
if [ -f "$M_FILE" ]; then
  TARGET="$M_FILE"
elif [ -f "$MM_FILE" ]; then
  TARGET="$MM_FILE"
fi

if [ -n "$TARGET" ]; then
  # VisionCameraProxy.h is NOT a public header in VisionCamera 4.x — only
  # VisionCameraProxyHolder.h is. The plugin doesn't actually use Proxy (only
  # ProxyHolder in an initWithProxy: signature), so delete the dead import.
  # Also rewrite historical bare-<> forms to the namespaced pod form, in case
  # a future plugin release pre-namespaces some imports but keeps this one.
  if grep -qE "^#import <(VisionCamera/)?VisionCameraProxy\.h>" "$TARGET"; then
    sed -E '/^#import <(VisionCamera\/)?VisionCameraProxy\.h>/d' \
      "$TARGET" > "$TARGET.tmp" && mv "$TARGET.tmp" "$TARGET"
    echo "[patch-vision-camera-text-recognition] Dropped dead VisionCameraProxy.h import."
  fi

  # After rename to .mm, @import module syntax requires -fcxx-modules which
  # isn't set by the plugin's podspec. Rewrite @import to the equivalent
  # classical #import which works in Objective-C++ without extra flags.
  if grep -q "^@import MLKitVision;" "$TARGET"; then
    sed 's|^@import MLKitVision;|#import <MLKitVision/MLKitVision.h>|' \
      "$TARGET" > "$TARGET.tmp" && mv "$TARGET.tmp" "$TARGET"
    echo "[patch-vision-camera-text-recognition] Converted @import MLKitVision to #import."
  fi
fi

# Step 2: rename .m → .mm if still needed.
if [ -f "$M_FILE" ] && [ ! -f "$MM_FILE" ]; then
  mv "$M_FILE" "$MM_FILE"
  echo "[patch-vision-camera-text-recognition] Renamed .m → .mm."
fi
