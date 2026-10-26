# BUILD PROMPT — Sentra, The AI Orchestrator

> **OPERATING MODE: you are ONE agent delivering the whole build, end to end.**
> You do not wait for other agents. You do everything: M1 → M5, in order.
>
> **ONBOARDING — execute in this exact order before writing any code:**
> 1. Read `PRD.md` (same folder) fully — it is the source of truth.
> 2. Read this file fully — it is the build directive.
> 3. If PRD and this file conflict: PRD wins; note the conflict in your final report.
> 4. Write `docs/PLAN.md` (short: files you will create, in which milestone order).
> 5. Then execute M1 → M5.
>
> `scripts/smoke.sh` must exit 0 after M1, M2, M4; after M5 run the full suite
> again. Keep building until every milestone is verified — do not stop after a
> stub, do not report "ready" with TODOs. Final response = what you built,
> smoke-test output, RAM numbers from §10, and any PRD/PROMPT conflicts found.
> Build exactly what is specified. Nothing more. Every SKIP is final.

## 0. What you are building

**Sentra** = a Linux desktop app that shows **many AI-agent terminals in one window**,
lets the user **spawn agents** (each terminal runs one CLI agent: `hermes`, `omp`,
`claude`, `codex`, or any command), and lets **agents hand work to each other**
(write a prompt into another agent's TTY + wait for it to go idle).

It is a stripped-down orchestrator. NOT an IDE. NOT a worktree manager. NOT a cloud thing.

**HARD CUTS — do NOT build any of these (they are rejected scope, final):**
- Mobile app, pairing, relay servers
- Remote runtimes / SSH targets / port forwarding
- Git worktrees, branch juggling
- Embedded browser / Design Mode
- GitHub / Linear / GitLab integration
- Skills marketplace / sharing
- Kanban boards / fancy card UI
- Telemetry, crash reporting, update channels

## 1. Architecture (fixed — do not deviate)

```
sentra/
├── crates/
│   ├── sentra-daemon/     # core. Owns all PTYs. No GUI deps.
│   ├── sentra-cli/        # thin client over unix socket. Same orchestration verbs the UI uses.
│   └── sentra-ui/         # Tauri 2 app. Terminals = xterm.js. Talks to daemon via unix socket.
├── PROMPT.md
└── README.md
```

- **`sentra-daemon`** must run headless (`sentra serve`). The GUI is a *viewer*:
  if the UI crashes/restarts, agents keep running (daemon holds the PTYs).
  This is the single most important design rule.
- IPC = **JSON Lines over one unix socket** `$XDG_RUNTIME_DIR/sentra/sentra.sock`
  (create parent dir with mode 700; unlink stale socket on start; env `SENTRA_SOCKET` overrides).
- Binary names: daemon + CLI dispatch from one main entry is fine (busybox style):
  `sentra serve`, `sentra spawn|list|send|wait|read|resize|kill|presets`.

## 2. Environment (build target machine)

- Kali rolling, x86_64, user `dewhush` (home `/home/dewhush`).
- rustc/cargo 1.97 present. webkit2gtk-4.1 present. Node 24 + npm present.
- Agents that must be spawnable (already installed):
  `hermes`, `omp`, `claude`, `codex`, `bash`.
- Bundled default presets (`~/.config/sentra/presets.json`, editable, file wins over defaults):
  `{ "hermes": ["hermes"], "omp": ["omp"], "claude": ["claude"], "codex": ["codex"], "bash": ["bash"] }`

## 3. Protocol (JSON Lines)

Request envelope (client → daemon, one JSON object per line):

```jsonc
{
  "cmd": "spawn|list|watch|unwatch|send|wait|read|resize|kill",
  "id": "12",                 // agent id as string — OR name, see resolution
  "name": "claude",           // optional friendly name (spawn); dup name → "name-2"
  "preset": "omp",            // spawn from preset (argv from presets.json)
  "argv": ["omp"],            // spawn raw argv (fallback if preset missing)
  "cwd": "/path",             // spawn cwd; default $HOME
  "text": "…",                // send: text to write into the agent's TTY
  "enter": true,              // send: append \r (default true)
  "cols": 120, "rows": 30,    // resize
  "tail": 8000,               // read: last N bytes of scrollback
  "idle_ms": 4000,            // wait: no output for this long = idle
  "exit": false,              // wait: wait for process exit instead of idle
  "timeout_ms": 120000        // wait timeout (default 120000)
}
```

- Response: one JSON line `{"ok":true, …}` or `{"ok":false,"err":"…"}`.
- `watch id` = subscribe: daemon then *pushes* events on the same connection until
  client disconnects:
  `{"evt":"out","id":12,"chunk":"<utf8 lossy>"}` and `{"evt":"exit","id":12,"code":0}`.
- Agent **id = small monotonic u32**, stable across the daemon's lifetime.
  Resolution rule everywhere: numeric string = id, otherwise = name lookup.

## 4. Daemon internals (sentra-daemon)

- PTY: crate `portable-pty` (= wezterm's; battle-tested). Default size 120×30, resize on demand.
- Per agent keep: id, name, argv, cwd, pid, master (for resize), writer behind `Mutex`,
  ~256 KiB ring buffer of raw output (for `read --tail`), `last_output: Option<Instant>`,
  `alive: AtomicBool`, subscriber list (`Vec<mpsc::Sender<Value>>` behind Mutex).
- Reader thread per agent: read → append ring → fanout to subscribers → update
  `last_output`; on EOF: set exit code (spawn a waiter), broadcast `exit`.
- `wait`: poll every 150 ms. idle condition = `last_output` exists AND elapsed ≥ idle_ms
  AND at least one initial output was seen. `exit` condition = process exited.
  Return `{"ok":true,"idle":true}` / `{"ok":true,"exited":true,"code":0}` / `{"ok":false,"err":"timeout"}`.
- Threads + `std::sync` only. **No tokio, no async runtime.** This is a small loop app.
- Persist nothing. On daemon exit, children are killed (daemons do NOT outlive
  the daemon intentionally — keep it simple; document it in README).

## 5. CLI verbs (sentra-cli) — these ARE the orchestrator API

```bash
sentra serve                                   # daemon
sentra spawn --name claude1 --cwd ~/proj -- claude
sentra spawn --preset omp
sentra list [--json]
sentra send <id|name> <text…> [--no-enter]     # types into the agent's TTY
sentra wait <id|name> [--idle-ms 4000 | --exit] [--timeout-ms 120000]
sentra read <id|name> [--tail 8000]
sentra resize <id|name> --cols 120 --rows 30
sentra kill <id|name>
sentra presets                                 # dump effective presets
```

Exit codes: 0 ok, 1 error (print `err` to stderr). All subcommands `--json` capable.

**The "agents help each other" contract** (this is the whole point of Sentra — keep
it this simple):

```
# A hands a task to B, from a shell script, cron, or another agent:
sentra send omp "Review this diff and list security bugs: …" 
sentra wait omp --idle-ms 5000
sentra read omp --tail 4000
# pipe that output into the next agent…
sentra send claude "Omp said: $(…). Now fix the top 3 issues."
```

## 6. UI (crates/sentra-ui, Tauri 2)

- One window. Dark. No theming system. CSS hand-rolled, ~2 colors.
- Layout: left sidebar (roster) + main pane area + bottom command bar.
- **Roster**: every agent = row [status dot ● live / ○ dead, name, argv, id].
  Click = focus its pane. Live updates via daemon `watch` (subscribe once to a
  multiplexed change feed the daemon provides: `list` deltas or a `watch-events` stream —
  pick ONE, document it).
- **Panes**: xterm.js terminals rendered in a 2-column masonry/grid that fills the
  window. Terminal resize → `resize` command to daemon. Scrollback = daemon's ring
  (initial `read --tail`), then live via watch stream.
- **Split/new/close**: `Ctrl+Shift+Left/Right/Up/Down` = split focus; `Ctrl+Shift+W`
  = kill focused agent; `Ctrl+Tab` = cycle focus. The grid RE-FLOWS (no nested
  splits beyond depth 2; simple equal-size re-grid is correct, do not over-engineer).
- **Command bar**: prompts like `> omp` (Enter = spawn preset in focused slot),
  free text = spawn raw argv. A small row of preset chips (hermes / omp / claude /
  codex / bash) = one-click spawn.
- **Handoff UI**: right-click agent → "Send to…" → pick target agent → type message →
  UI calls `send` then `wait --idle` then offers "copy last output" (it already has it
  from the watch stream). This is the "saling lempar" feature in the GUI.
- Tauri 2 frontend: vanilla JS + xterm.js + xterm-addon-fit. **No React/Vue/bundler
  framework. Single `index.html` + `app.js` + `style.css`, ES modules, vendored
  xterm via npm then copied — keep the front-end dependency tree tiny.**

## 7. Milestones (build in this order, verify each)

1. **M1 daemon**: spawn bash, write/read/resize/wait-idle/kill work over the socket.
   Test script `scripts/smoke.sh`: spawn an `echo bot` bash loop, send "ping",
   wait idle, read tail → expect "HI: ping". Exit 0 = pass.
2. **M2 CLI**: all verbs work; `--json`; agent name resolution; presets file.
3. **M3 UI**: xterm.js pane grid wired to daemon (spawn `bash`, run `htop`, prove
   rendering + resize live). Roster + presets chips + kill.
4. **M4 handoff**: CLI triad `send → wait → read` with two bash echo-bots proves
   roundtrip; then GUI handoff dialog.
5. **M5 packaging**: `cargo build --release`; a `sentra.desktop` launcher
   (`Exec=sentra serve --with-ui` that starts daemon if missing then opens UI).

## 8. Quality bar / constraints

- Rust 2024 edition, clippy clean, `cargo build --release` zero warnings.
- Daemon RSS ≤ 30 MB with 5 idle bash agents. Measure and print it in the README.
- No `unwrap()` in non-test code paths where a user string can kill the daemon —
  accept-and-respond `{"ok":false}` instead. A crashed agent pane must NEVER take
  down the daemon.
- No config files beyond `presets.json`. No plugins. No theming. No async.
- Every error message names the agent id + what failed.
- README: 6 lines max. Architecture diagram in ASCII. How to run. Done.

## 9. Explicitly out-of-repo scope (never create these files)

Anything related to: electron, tokio, docker, database, telemetry, auto-update,
jwt/auth, cloud relay, mobile, worktree, git integration, browser embedding.
If a dependency starts with a "maybe later" — don't add it.
```
