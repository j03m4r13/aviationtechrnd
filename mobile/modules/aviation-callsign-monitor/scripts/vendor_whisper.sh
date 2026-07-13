#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MODULE_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
DEST="$MODULE_DIR/android/vendor/whisper.cpp"
VERSION="v1.9.1"

if [[ -d "$DEST/.git" ]]; then
  echo "whisper.cpp already exists at $DEST"
  exit 0
fi

rm -rf "$DEST"
mkdir -p "$(dirname "$DEST")"
git clone --depth 1 --branch "$VERSION" https://github.com/ggml-org/whisper.cpp.git "$DEST"
echo "Installed whisper.cpp $VERSION at $DEST"
