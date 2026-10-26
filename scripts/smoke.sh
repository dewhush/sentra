#!/usr/bin/env bash
# Sentra smoke test — M1 parts 1-4 now, more sections per milestone.
# Exit 0 = pass. Run with SENTRA_BIN=target/debug/sentra
set -u
cd "$(dirname "$0")/.."
BIN="${SENTRA_BIN:-target/debug/sentra}"
SOCK="$(mktemp -u /tmp/sentra-smoke-XXXX)/sentra.sock"
export SENTRA_SOCKET="$SOCK"
FAIL() { echo "FAIL: $*" >&2; exit 1; }
need() { command -v "$1" >/dev/null || FAIL "missing tool: $1"; }
need python3

CLEANUP() {
  [[ -n "${SRV_PID:-}" ]] && kill "$SRV_PID" 2>/dev/null
  wait 2>/dev/null
  pkill -f 'sentra-smoke-tag' 2>/dev/null
  rm -rf "$(dirname "$SOCK")"
}
trap CLEANUP EXIT

echo "== M1: daemon spawn/send/wait/read/resize/kill =="
"$BIN" serve &
SRV_PID=$!
for i in $(seq 1 50); do [ -S "$SOCK" ] && break; sleep 0.1; done
[ -S "$SOCK" ] || FAIL "socket never appeared: $SOCK"

python3 - "$SOCK" <<'PY' || FAIL "probe failed"
import json, socket, sys, time

class C:
    def __init__(self, path):
        self.s = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
        self.s.settimeout(6)
        self.s.connect(path)
        self.f = self.s.makefile("rwb", buffering=0)
    def req(self, **kw):
        self.f.write((json.dumps(kw) + "\n").encode())
        return json.loads(self.f.readline())
    def line(self):
        return json.loads(self.f.readline())

sock = sys.argv[1]
c = C(sock)
r = c.req(cmd="spawn", argv=["bash", "--norc"], name="echo")
assert r.get("ok"), r
aid = r["id"]

# seed the marker loop
mark = 'sentra-smoke-tag'; mark2 = 'sentra-smoke-tag2'
c.req(cmd="send", id=str(aid), text=(
    f"while read -r l; do echo HI: $l; done; echo {mark}\r"))
time.sleep(0.4)
c.req(cmd="send", id=str(aid), text="ping\r")
w = c.req(cmd="wait", id=str(aid), idle_ms=1500, timeout_ms=8000)
assert w.get("ok") and (w.get("idle") or w.get("exited")), w
r = c.req(cmd="read", id=str(aid), tail=4000)
assert r.get("ok"), r
assert "HI: ping" in r["chunk"], f"echo bot roundtrip missing HI: ping in {r['chunk']!r}"

# resize
rr = c.req(cmd="resize", id=str(aid), cols=80, rows=24)
assert rr.get("ok"), rr
# id+name resolution
rn = c.req(cmd="read", id="echo", tail=100)
assert rn.get("ok") and rn["id"] == aid, rn
# unknown agent error message names the id
bad = c.req(cmd="read", id="nosuch")
assert not bad.get("ok") and "nosuch" in bad["err"], bad

# watch fanout: two subs both see out events
w1, w2 = C(sock), C(sock)
ack1 = w1.req(cmd="watch", id=str(aid))
ack2 = w2.req(cmd="watch", id=str(aid))
assert ack1.get("ok") and ack2.get("ok"), (ack1, ack2)
c.req(cmd="send", id=str(aid), text=f"echo {mark2}\r")
got1 = got2 = False
for _ in range(20):
    for wcli, which in ((w1, "1"), (w2, "2")):
        try:
            ev = wcli.line()
        except Exception:
            continue
        if ev.get("evt") == "out" and mark2 in ev.get("chunk", ""):
            if which == "1":
                got1 = True
            else:
                got2 = True
    if got1 and got2:
        break
assert got1 and got2, f"fanout failed got1={got1} got2={got2}"

# kill
k = c.req(cmd="kill", id=str(aid))
assert k.get("ok"), k
time.sleep(0.4)
lst = c.req(cmd="list")
assert lst.get("ok") and lst["agents"] and lst["agents"][0]["alive"] is False, lst
x = c.req(cmd="wait", id=str(aid), exit=False, idle_ms=100)  # E8: dead+exit:false → exited immediately
assert x.get("ok") and x.get("exited"), x
print("M1 probe OK")
PY


SKIP_SERVE=1 source scripts/smoke-m2.sh
SKIP_SERVE=1 source scripts/smoke-m4.sh

echo "SMOKE PASS"
