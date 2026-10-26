#!/usr/bin/env bash
# §10 metric: daemon RSS with 5 idle bash agents. Prints kB (RSS of the serve process).
set -u
cd "$(dirname "$0")/.."
BIN="${SENTRA_BIN:-target/release/sentra}"
export SENTRA_SOCKET="/tmp/sentra-rss-$$/sentra.sock"
mkdir -p "$(dirname "$SENTRA_SOCKET")"
"$BIN" serve & SRV=$!
sleep 0.4
for i in 1 2 3 4 5; do "$BIN" spawn --preset bash --name "idle$i" >/dev/null; done
sleep 1
RSS=$(ps -o rss= -p "$SRV" | tr -d ' ')
echo "daemon RSS @5 idle bash agents: ${RSS} kB (limit 30720 kB)"
kill "$SRV" 2>/dev/null
# kill spawned children
for id in $("${BIN}" list --json 2>/dev/null | python3 -c 'import json,sys
try:
    [print(a["id"]) for a in json.load(sys.stdin)["agents"]]
except Exception: pass' 2>/dev/null); do "${BIN}" kill "$id" >/dev/null 2>&1; done
rm -rf "$(dirname "$SENTRA_SOCKET")"
[ "$RSS" -le 30720 ] && echo "RSS PASS" || { echo "RSS FAIL"; exit 1; }
