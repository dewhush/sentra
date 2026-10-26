#!/usr/bin/env python3
"""Sentra daemon smoke probe: spawn/send/wait/read/resize/list/kill + fanout."""
import json, os, socket, subprocess, sys, tempfile, time

SOCK = os.environ.get("SENTRA_SOCKET") or "/tmp/sentra-probe/sentra.sock"

def conn():
    s = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
    s.connect(SOCK)
    return s

def rpc(s, **req):
    s.sendall((json.dumps(req) + "\n").encode())
    f = s.makefile("r")
    return json.loads(f.readline())

def main():
    s = conn()
    r = rpc(s, cmd="spawn", name="probe", argv=["bash", "--noprofile", "--norc"], cwd="/tmp")
    assert r.get("ok") and r.get("id"), r
    aid = r["id"]; print("spawn ok", r)

    r = rpc(s, cmd="send", id=str(aid), text="echo ping")
    assert r.get("ok"), r
    time.sleep(0.5)
    r = rpc(s, cmd="wait", id=str(aid), idle_ms=1200, timeout_ms=5000)
    assert r.get("ok") and (r.get("idle") or r.get("exited")), r
    r = rpc(s, cmd="read", id=str(aid), tail=2000)
    assert r.get("ok") and "ping" in r.get("chunk", ""), r
    print("read ok:", r["chunk"].strip()[-40:])

    r = rpc(s, cmd="resize", id=str(aid), cols=200, rows=50)
    r = rpc(s, cmd="resize", id=str(aid), cols=500, rows=0)
    assert r.get("ok"), r  # rows 0 clamps to 2
    r = rpc(s, cmd="list")
    assert r.get("ok") and any(a["id"] == aid for a in r["agents"]), r
    print("list ok,", len(r["agents"]), "agent(s)")

    # duplicate name dedup
    r2 = rpc(s, cmd="spawn", name="probe", argv=["bash", "--noprofile", "--norc"])
    assert r2.get("ok") and r2["name"] == "probe-2", r2
    print("dedup ok:", r2["name"])

    # fanout: two subscribers
    w1, w2 = conn(), conn()
    for w in (w1, w2):
        w.sendall((json.dumps({"cmd": "watch", "id": str(aid)}) + "\n").encode())
        assert json.loads(w.makefile("r").readline())["ok"]
    time.sleep(0.3)
    rpc(s, cmd="send", id=str(aid), text="echo fanout_test")
    for w in (w1, w2):
        w.settimeout(5)
        f = w.makefile("r")
        hit = False
        for _ in range(20):
            evt = json.loads(f.readline())
            if evt.get("evt") == "out" and "fanout_test" in evt.get("chunk", ""):
                hit = True; break
        assert hit, "subscriber missed fanout_test"
    print("fanout ok: both subscribers got out event")

    # E8: wait on dead agent with exit:false
    r = rpc(s, cmd="kill", id=str(aid))
    assert r.get("ok"), r
    time.sleep(0.5)
    r = rpc(s, cmd="wait", id=str(aid), exit=False, timeout_ms=3000)
    assert r.get("ok") and r.get("exited") is True, r
    print("E8 ok:", r)
    lr = rpc(s, cmd="read", id=str(aid), tail=100)
    assert lr.get("alive") is False, lr
    r = rpc(s, cmd="wait", id="9999", timeout_ms=500)
    assert not r.get("ok") and "not found" in r.get("err", ""), r
    print("unknown agent err ok:", r["err"])
    rpc(s, cmd="kill", id=str(r2["id"]))
    print("ALL PROBE CHECKS PASSED")

if __name__ == "__main__":
    main()
