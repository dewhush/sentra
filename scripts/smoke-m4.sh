# Appended to smoke.sh by orchestrator; M4 handoff triad (S5): two echo bots.
# Requires live daemon via SENTRA_SOCKET.
set -u

_echo_bot() {  # argv name marker
  "$BIN" spawn -- bash -c "while IFS= read -r l; do echo \"BOT:\$l\"; done" --cwd "$HOME" >/dev/null
}

echo "== M4: handoff triad send→wait→read (S5) =="
# resolve ids by name from --json list
idof() { "$BIN" list --json | python3 -c "import json,sys; ns=json.load(sys.stdin)['agents']; print(next(a['id'] for a in ns if a['name']=='$1' and a['alive']))"; }

"$BIN" spawn --name hb -- bash -c 'while IFS= read -r l; do echo HANDOFF:$l; done' >/dev/null || FAIL "spawn hb"
"$BIN" spawn --name hr -- bash -c 'while IFS= read -r l; do echo REPLY:$l; done' >/dev/null || FAIL "spawn hr"
sleep 0.3
HID=$(idof hb); RID=$(idof hr)
[ -n "$HID" ] && [ -n "$RID" ] || FAIL "idof resolution"

# triad against agent 'hr' by NAME (resolution rule: numeric=id, else name)
"$BIN" send hr "handoff-payload-123" >/dev/null || FAIL "triad send"
T0=$(date +%s%N)
"$BIN" wait hr --idle-ms 1200 --timeout-ms 8000 >/dev/null || FAIL "triad wait"
T1=$(date +%s%N)
LAST="$("$BIN" read hr --tail 500)"
[[ "$LAST" == *REPLY:handoff-payload-123* ]] || FAIL "triad read: $LAST"
# handoff roundtrip latency budget: idle_ms + 250ms (PRD §10)
EL=$(( (T1 - T0) / 1000000 ))
[ "$EL" -le 1450 ] || FAIL "handoff roundtrip ${EL}ms > budget"
echo "handoff roundtrip ${EL}ms (budget 1450ms)"

# 3-hop chain recipe (S8): hb → hr → hb again
"$BIN" send hb "hop2" >/dev/null && "$BIN" wait hb --idle-ms 1200 --timeout-ms 8000 >/dev/null || FAIL "hop2"
R2="$("$BIN" read hb --tail 300)"
[[ "$R2" == *HANDOFF:hop2* ]] || FAIL "hop2 marker: $R2"

for id in $( "$BIN" list --json | python3 -c 'import json,sys; [print(a["id"]) for a in json.load(sys.stdin)["agents"] if a["alive"]]' ); do "$BIN" kill "$id" >/dev/null; done
echo "M4 PASS"
