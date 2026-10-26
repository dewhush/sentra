#!/usr/bin/env python3
"""Sentra Telegram bridge — controls & watches Sentra agents over the reverse-tunnel socket.

Transport: ssh -N -R /tmp/sentra-vps.sock:<laptop-sentra.sock> vps  (run from laptop)
Auth:      TG_ALLOW = comma-separated chat_ids allowed to issue commands.
Commands:
  /ps                     — lista semua agent (id, status, nama, argv)
  /log <agent> [n]        — output terakhir agent (default tail 1200 bytes)
  /send <agent> <text>    — ketik teks ke TTY agent (Enter otomatis), lalu tunggu idle & balas tail output
  /kill <agent>           — kill agent
  /spawn <preset|argv>    — spawn preset (hermes/omp/claude/codex/bash) atau raw argv
  /harness @omp backend @claude ui ...  — spawn multi @mention, tiap task dikirim ke agent-nya
  /help
"""
import json, os, re, socket, sys, time
from telegram import Update
from telegram.constants import ChatAction
from telegram.ext import Application, CommandHandler, ContextTypes

ENV_FILE = os.path.expanduser("~/telegram-bot/.env")
SOCK = os.environ.get("SENTRA_VPS_SOCK", "/tmp/sentra-vps.sock")

ENV_FILE = os.path.expanduser("~/telegram-bot/.env")
SOCK = os.environ.get("SENTRA_VPS_SOCK", "/tmp/sentra-vps.sock")
def _env():
    if os.path.exists(ENV_FILE):
        return dict(re.findall(r"^([A-Z_]+)=(.*)$", open(ENV_FILE).read(), re.M))
    return {}


def _allow():
    env = _env()
    raw = os.environ.get("TG_ALLOW") or env.get("TG_ALLOW", "")
    return {x.strip() for x in raw.split(",") if x.strip()}


def auth(update: Update) -> bool:
    allow = _allow()
    if not allow:
        # pairing mode: tell the caller their chat_id so the owner can pin it
        try:
            update.message.reply_text(f"pairing mode — chat_id kamu: {update.effective_chat.id}")
        except Exception:
            pass
        return False
    return str(update.effective_chat.id) in allow



def rpc(payload: dict, timeout: float = 10.0) -> dict:
    s = socket.socket(socket.AF_UNIX)
    s.settimeout(timeout)
    try:
        s.connect(SOCK)
        s.sendall((json.dumps(payload) + "\n").encode())
        buf = b""
        while b"\n" not in buf:
            chunk = s.recv(65536)
            if not chunk:
                break
            buf += chunk
        return json.loads(buf.decode(errors="replace"))
    finally:
        s.close()


def rname(t: str) -> str:
    t = t.strip()
    return t if t.isdigit() else t


def fmt_list(resp: dict) -> str:
    agents = resp.get("agents", [])
    if not agents:
        return "no agents — /spawn <preset> dulu"
    lines = []
    for a in sorted(agents, key=lambda x: x["id"]):
        mark = "●" if a.get("alive") else "○"
        lines.append(f"{mark} #{a['id']} {a['name']} `{ ' '.join(a['argv']) }`")
    return "\n".join(lines)


def do_spawn(spec: str) -> str:
    spec = spec.strip()
    if not spec:
        return "usage: /spawn <preset|argv…>"
    if " " in spec:
        r = rpc({"cmd": "spawn", "argv": spec.split(), "_req": 1})
    else:
        r = rpc({"cmd": "spawn", "preset": spec, "_req": 1})
    if not r.get("ok"):
        return f"spawn gagal: {r.get('err')}"
    aid = r.get("id")
    return f"spawned #{aid} `{spec}`"


def do_harness(text: str) -> str:
    specs = [(m.group(1).lower(), (m.group(2) or "").strip())
             for m in re.finditer(r"@([A-Za-z0-9_-]+)([^@]*)", text)]
    if not specs:
        return "usage: /harness @omp handle backend @claude handle ui"
    ids = []
    for preset, task in specs:
        r = rpc({"cmd": "spawn", "preset": preset, "_req": 1})
        if not r.get("ok"):
            return f"spawn {preset} gagal: {r.get('err')}"
        aid = r["id"]
        ids.append(aid)
        if task:
            rpc({"cmd": "send", "id": str(aid), "text": task, "enter": True, "_req": 1})
    lines = [f"spawned: " + " ".join(f"#{i}" for i in ids)]
    lines.append("quad 2×2 tampil di desktop (kalau UI jalan).")
    return "\n".join(lines)


def do_send(target: str, text: str) -> str:
    if not text:
        return "usage: /send <agent> <text>"
    rpc({"cmd": "send", "id": target, "text": text, "enter": True, "_req": 1})
    w = rpc({"cmd": "wait", "id": target, "idle_ms": 3500, "timeout_ms": 25000, "_req": 1}, timeout=30)
    r = rpc({"cmd": "read", "id": target, "tail": 1200, "_req": 1})
    tail = r.get("chunk", "(kosong)").strip()[-1200:]
    idle = "idled" if w.get("ok") else (w.get("err") or "timeout")
    return f"sent → {target} ({idle})\n```\n{tail}\n```"


async def guard(fn):
    async def h(update: Update, ctx: ContextTypes.DEFAULT_TYPE):
        if not auth(update):
            return  # silent
        await update.message.chat.send_action(ChatAction.TYPING)
        try:
            out = fn(update, ctx)
            import asyncio
            if out and out.__class__.__name__ == "coroutine":
                out = await out
        except Exception as e:
            out = f"error: {e}"
        if out:
            await update.message.reply_text(out, parse_mode=None)
    return h


def main():
    tok = os.environ.get("SENTRA_BOT_TOKEN") or _env().get("SENTRA_BOT_TOKEN") or os.environ.get("BOT_TOKEN") or _env().get("BOT_TOKEN", "")
    if not tok:
        sys.exit("no BOT_TOKEN")
    app = Application.builder().token(tok).build()

    def cmd(name):
        def deco(fn):
            app.add_handler(CommandHandler(name, guard(fn)))
            return fn
        return deco

    @cmd("ps")
    def _(u, c):
        r = rpc({"cmd": "list", "_req": 1})
        return fmt_list(r) if r.get("ok") else f"daemon error: {r.get('err') or 'socket down'}"

    @cmd("log")
    def _(u, c):
        a = c.args
        tail = int(a[1]) if len(a) > 1 and a[1].isdigit() else 1200
        if not a:
            return "usage: /log <agent> [tail_bytes]"
        r = rpc({"cmd": "read", "id": rname(a[0]), "tail": tail, "_req": 1})
        return ("```\n" + r.get("chunk", "(kosong)").strip()[-tail:] + "\n```") if r.get("ok") else r.get("err")

    @cmd("send")
    def _(u, c):
        if not c.args:
            return "usage: /send <agent> <text>"
        return do_send(rname(c.args[0]), " ".join(c.args[1:]))

    @cmd("kill")
    def _(u, c):
        if not c.args:
            return "usage: /kill <agent>"
        r = rpc({"cmd": "kill", "id": rname(c.args[0]), "_req": 1})
        return f"killed {c.args[0]}" if r.get("ok") else r.get("err")

    @cmd("spawn")
    def _(u, c):
        return do_spawn(" ".join(c.args))

    @cmd("harness")
    def _(u, c):
        return do_harness(" ".join(c.args))

    @cmd("help")
    def _(u, c):
        return ("/ps — daftar agent\n/log <agent> [n] — output terakhir\n"
                "/send <agent> <text> — ketik ke agent, tunggu idle, balas output\n"
                "/kill <agent>\n/spawn <preset|argv>\n"
                "/harness @omp backend @claude ui — multi-spawn + auto-dispatch")

    app.run_polling(drop_pending_updates=True)


if __name__ == "__main__":
    main()
