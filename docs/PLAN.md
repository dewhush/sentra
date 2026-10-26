# Sentra Build Plan

Source of truth: `PRD.md` (wins over `PROMPT.md` on conflicts).
Build order strict M1 → M5; `scripts/smoke.sh` must exit 0 after M1, M2, M4, M5.

## Workspace

```
crates/Cargo.toml          workspace manifest (members: daemon, cli, ui)
crates/sentra-daemon/      core: PTY registry + unix-socket JSONL server (no GUI deps)
  └ src/main.rs            busybox dispatch `sentra serve` → daemon::serve
  └ src/lib.rs             registry.rs (spawn/kill/resolve/ring), server.rs (conn loop),
                           protocol.rs (req parse/resp), presets.rs
crates/sentra-cli/         thin client over socket; verbs spawn|list|send|wait|read|resize|kill|presets
crates/sentra-ui/          Tauri 2 shell (binary = `sentra serve --with-ui` helper too)
  └ dist/                  index.html + app.js + style.css + vendored xterm.js + fit addon
scripts/smoke.sh           M1/M2/M4 verification (+ RAM check after M5)
sentra.desktop             Exec=sentra serve --with-ui
README.md
```

Single binary: `sentra` (busybox: `serve` in daemon, rest in CLI). UI crate builds
`sentra-ui` binary + frontend assets; `serve --with-ui` = daemon + spawn UI child.

## M1 — daemon
- Unix socket `$XDG_RUNTIME_DIR/sentra/sentra.sock` (0700 dir, stale unlink, `SENTRA_SOCKET` override, `/tmp/sentra-$UID` fallback).
- JSONL req/res per PRD §3; id-resolve numeric→id else name.
- portable-pty PTYs, 120×30, ring 256 KiB, reader thread/agent, subs fanout (`/tmp` fallback), last_output.
- Threads + std::sync only, no tokio. Errors: `{"ok":false,"err":"agent N …"}`.
- Verify: `scripts/smoke.sh` (echo-bot ping roundtrip) exit 0.

## M2 — CLI
- All verbs, `--json`, exit 0/1, err→stderr. Presets: defaults + `~/.config/sentra/presets.json` (file wins).
- Verify: smoke.sh section 2 exit 0.

## M3 — UI
- Tauri 2, vanilla JS + xterm.js + fit addon (vendored, no bundler).
- Roster (dot/name/argv/id, click focus), pane grid (equal re-flow), watch stream → panes,
  command bar + preset chips, kill shortcut, resize → daemon.
- Verify: launch, run htop in a pane, screenshot.

## M4 — handoff
- CLI triad two echo-bots roundtrip (proven in smoke.sh).
- GUI: right-click → Send to… → target picker → message → auto-wait → copy-last-output.
- Verify: smoke.sh section 4 exit 0.

## M5 — packaging
- `cargo build --release` zero warnings, clippy clean.
- `sentra.desktop` (`Exec=sentra serve --with-ui`). RSS ≤ 30 MB @ 5 idle agents measured + README.
- Verify: full smoke.sh again + RSS numbers printed.
