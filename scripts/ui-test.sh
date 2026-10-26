#!/usr/bin/env bash
# M3 harness: serve daemon, spawn bash preset, then launch sentra-ui on DISPLAY :0.0
# Operator then runs `htop` in the pane; window + roster visible in screenshot shot.png
set -u
cd "$(dirname "$0")/.."
BIN="${SENTRA_BIN:-target/debug/sentra}"
export SENTRA_SOCKET="${SENTRA_SOCKET:-/tmp/sentra-ui-test/sentra.sock}"
mkdir -p "$(dirname "$SENTRA_SOCKET")"
pkill -f 'sentra serve' 2>/dev/null && sleep 0.3
rm -f "$SENTRA_SOCKET"
"$BIN" serve & echo "daemon pid $!"
sleep 0.5
"$BIN" spawn --preset bash --name ui-test >/dev/null
DISPLAY="${DISPLAY:-:0.0}" ./target/debug/sentra-ui &
UI_PID=$!
sleep 6
import -window root /tmp/sentra-shot.png 2>/dev/null || scrot /tmp/sentra-shot.png 2>/dev/null || echo "no screenshot tool"
echo "ui pid $UI_PID; socket $SENTRA_SOCKET"
