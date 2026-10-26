#!/usr/bin/env bash
# Sentra smoke — M2 section: every CLI verb, --json, name resolution, presets.
# Sourced by smoke.sh with SENTRA_SOCKET already exported (or run standalone
# against a live daemon: SKIP_SERVE=1 scripts/smoke-m2.sh).
set -u
cd "$(dirname "$0")/.."
BIN="${SENTRA_BIN:-target/debug/sentra}"
J() { "$BIN" "$@" --json; }
FAIL() { echo "FAIL: $*" >&2; exit 1; }

if [[ "${SKIP_SERVE:-0}" != "1" ]]; then
  echo "run via smoke.sh, or with SKIP_SERVE=1 against a live daemon" >&2
  exit 2
fi

echo "== M2: CLI verbs =="
OUT="$("$BIN" spawn --preset bash --name m2bot)"; [[ "$OUT" == spawned* ]] || FAIL "spawn preset: $OUT"
N="$("$BIN" list --json | python3 -c 'import json,sys; print(next(a["id"] for a in json.load(sys.stdin)["agents"] if a["name"]=="m2bot"))')"
"$BIN" send "$N" 'echo RUNMarker_$((40+2))' >/dev/null || FAIL "send"
"$BIN" wait "$N" --idle-ms 1200 --timeout-ms 8000 >/dev/null || FAIL "wait"
R="$("$BIN" read "$N" --tail 2000)"
[[ "$R" == *RUNMarker_42* ]] || FAIL "read marker missing: $R"

# name resolution + --json shapes
L="$(J list)"
echo "$L" | python3 -c 'import json,sys; d=json.load(sys.stdin); assert d["ok"] and any(a["name"]=="m2bot" for a in d["agents"])' || FAIL "list json"
E="$(J read nosuchagent)"
echo "$E" | python3 -c 'import json,sys; d=json.load(sys.stdin); assert not d["ok"] and "nosuchagent" in d["err"]' || FAIL "err json"
"$BIN" read nosuchagent 2>/dev/null && FAIL "read unknown should exit 1"

# resize (E7 clamp is daemon-side; sane values must pass) + kill semantics
"$BIN" resize "$N" --cols 100 --rows 20 >/dev/null || FAIL "resize"
"$BIN" kill "$N" >/dev/null || FAIL "kill"
"$BIN" kill "$N" >/dev/null 2>&1 && FAIL "double kill must fail"
P="$(J presets)"
echo "$P" | python3 -c 'import json,sys; d=json.load(sys.stdin); assert d["omp"]==["omp"] and d["bash"][0]=="bash" and d["hermes"]==["hermes"]' || FAIL "presets json"

echo "== M2 extra: dup names + argv spawn =="
"$BIN" spawn --preset bash --name duo >/dev/null || FAIL "spawn duo 1"
"$BIN" spawn --preset bash --name duo >/dev/null || FAIL "spawn duo 2"
"$BIN" spawn -- bash --noprofile --norc >/dev/null || FAIL "spawn raw argv"
L2="$("$BIN" list --json)"
echo "$L2" | python3 -c '
import json,sys
d=json.load(sys.stdin)
ns=[a["name"] for a in d["agents"] if a["alive"]]
assert ns.count("duo")==1 and ns.count("duo-2")==1, ns
assert any(a["argv"]==["bash","--noprofile","--norc"] and a["name"]!="duo" for a in d["agents"] if a["alive"]), d
' || FAIL "dup names / argv spawn"
# cleanup every live agent so later sections start clean
for id in $( "$BIN" list --json | python3 -c 'import json,sys; [print(a["id"]) for a in json.load(sys.stdin)["agents"] if a["alive"]]' ); do
  "$BIN" kill "$id" >/dev/null || true
done
echo "M2 PASS"
