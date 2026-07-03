#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MODULE_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
MODEL_DIR="$MODULE_DIR/android/src/main/assets/models"
TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT

VOSK_MODEL="vosk-model-small-en-us-0.15"
WHISPER_MODEL="small.en-q5_1"

mkdir -p "$MODEL_DIR"

if [[ ! -d "$MODEL_DIR/$VOSK_MODEL" ]]; then
  echo "Downloading Vosk model..."
  curl -L --fail --retry 4 \
    -o "$TMP_DIR/$VOSK_MODEL.zip" \
    "https://alphacephei.com/vosk/models/$VOSK_MODEL.zip"
  unzip -q "$TMP_DIR/$VOSK_MODEL.zip" -d "$MODEL_DIR"
else
  echo "Vosk model already exists."
fi

if [[ ! -f "$MODEL_DIR/ggml-$WHISPER_MODEL.bin" ]]; then
  echo "Downloading whisper.cpp model..."
  curl -L --fail --retry 4 \
    -o "$MODEL_DIR/ggml-$WHISPER_MODEL.bin" \
    "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-$WHISPER_MODEL.bin"
else
  echo "Whisper model already exists."
fi

echo "Models installed in $MODEL_DIR"
