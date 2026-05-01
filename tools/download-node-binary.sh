#!/usr/bin/env bash
# Scarica il Node binary nativo per la sidecar Tauri (macOS arm64 / x64).
# Tauri sidecar pattern: il file deve essere nominato `node-<target-triple>`
# in src-tauri/binaries/.
#
# Usage: ./tools/download-node-binary.sh

set -e

NODE_VERSION="22.13.1" # LTS stabile a Q1 2026
APP_DIR="$(cd "$(dirname "$0")/.." && pwd)"
BIN_DIR="$APP_DIR/src-tauri/binaries"
mkdir -p "$BIN_DIR"

ARCH=$(uname -m)
case "$ARCH" in
  arm64)
    NODE_ARCH="darwin-arm64"
    TARGET_TRIPLE="aarch64-apple-darwin"
    ;;
  x86_64)
    NODE_ARCH="darwin-x64"
    TARGET_TRIPLE="x86_64-apple-darwin"
    ;;
  *)
    echo "❌ Arch sconosciuta: $ARCH"
    exit 1
    ;;
esac

DEST="$BIN_DIR/node-${TARGET_TRIPLE}"

if [ -f "$DEST" ]; then
  echo "✅ Già presente: $DEST"
  "$DEST" --version
  exit 0
fi

URL="https://nodejs.org/dist/v${NODE_VERSION}/node-v${NODE_VERSION}-${NODE_ARCH}.tar.gz"
TMP=$(mktemp -d)

echo "→ Download Node v${NODE_VERSION} per ${NODE_ARCH}..."
curl -sL "$URL" -o "$TMP/node.tar.gz"

echo "→ Estraggo..."
tar -xzf "$TMP/node.tar.gz" -C "$TMP"
NODE_BIN_SRC="$TMP/node-v${NODE_VERSION}-${NODE_ARCH}/bin/node"

if [ ! -f "$NODE_BIN_SRC" ]; then
  echo "❌ Node binary non trovato in archivio"
  exit 1
fi

cp "$NODE_BIN_SRC" "$DEST"
chmod +x "$DEST"
rm -rf "$TMP"

echo "✅ Node binary salvato:"
ls -lh "$DEST"
"$DEST" --version
