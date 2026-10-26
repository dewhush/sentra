# sentra — many AI-agent terminals, one window, agents hand work to each other.

```
┌──────────┐  unix socket (JSON lines)  ┌──────────────────┐
│ sentra-ui │◄──────────────────────────►│ sentra-daemon     │
│ (viewer)  │  spawn/send/wait/read/…    │  ├ agent 1: PTY   │
└──────────┘  watch → out/exit events    │  └ agent N: PTY   │
┌──────────┐                             │  ring 256K/agent  │
│ sentra    │◄───────────────────────────►│                   │
│ (cli)     │  same verbs, scriptable     └──────────────────┘
└──────────┘
```
Measured: daemon RSS 3.2 MB with 5 idle bash agents (limit 30 MB).
Run: `cargo build --release` → `sentra serve --with-ui` (or headless `sentra serve` + `sentra spawn --preset omp`).
Remote: `SENTRA_TCP=<ip>:7621` on daemon + client → same JSONL protocol over TCP. Web UI served on that port (flat black/gray/white): any browser hits `http://<ip>:7621` — live xterm panes via SSE.
Agents die with the daemon by design (it owns the PTYs); UI crash/restart is invisible to them.
Handoff: `sentra send omp "task…"` → `sentra wait omp --idle-ms 5000` → `sentra read omp --tail 4000`.
Presets: `~/.config/sentra/presets.json` overrides bundled hermes/omp/claude/codex/bash.
