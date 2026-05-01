#!/usr/bin/env bash
# run.sh — host-side wrapper for the playground.
#
# Usage:
#   ./run.sh sync                 Upload lib/stick.py to the device
#   ./run.sh demos/coin.py        Run a demo (live-mounts and executes)
#   ./run.sh repl                 Drop into the REPL
#   ./run.sh ls                   List files on the device
#   ./run.sh wipe                 Remove uploaded files (keeps firmware)
#   ./run.sh exec '<python>'      One-shot exec on the device
#
# Override port:  PORT=/dev/cu.xxx ./run.sh ...

set -euo pipefail
export PATH="$HOME/Library/Python/3.9/bin:$PATH"

PORT="${PORT:-/dev/cu.usbserial-7152181438}"
HERE="$(cd "$(dirname "$0")" && pwd)"

if ! command -v mpremote >/dev/null; then
  echo "mpremote not on PATH. Try: pip install --user mpremote" >&2
  exit 1
fi

cmd="${1:-help}"; shift || true

case "$cmd" in
  sync)
    echo "→ uploading lib/stick.py to device"
    mpremote connect "$PORT" cp "$HERE/lib/stick.py" :stick.py
    ;;
  repl)
    mpremote connect "$PORT"
    ;;
  ls)
    mpremote connect "$PORT" fs ls
    ;;
  wipe)
    echo "→ removing stick.py and any demo files from device"
    mpremote connect "$PORT" exec "
import os
for f in os.listdir():
    if f != 'boot.py':
        try: os.remove(f); print('removed', f)
        except: pass
"
    ;;
  exec)
    mpremote connect "$PORT" exec "$1"
    ;;
  help|-h|--help)
    sed -n '2,15p' "$0"
    ;;
  *)
    # Treat anything else as a path to a demo .py file.
    demo="$cmd"
    if [[ ! -f "$demo" ]]; then
      echo "demo not found: $demo" >&2; exit 1
    fi
    # Ensure stick.py is on the device, then run the demo from local disk.
    mpremote connect "$PORT" cp "$HERE/lib/stick.py" :stick.py >/dev/null
    echo "→ running $demo"
    mpremote connect "$PORT" run "$demo"
    ;;
esac
