#!/usr/bin/env bash
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
bash "$SCRIPT_DIR/vendor_whisper.sh"
bash "$SCRIPT_DIR/download_models.sh"
echo "Offline callsign dependencies are ready. Re-run Expo prebuild before building Android."
