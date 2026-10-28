<p align="center">
  <img src="assets/banner.png" alt="Sentra — many terminals, one window" width="100%">
</p>

# sentra

**Many AI-agent terminals, one window — and agents that hand work to each other.**

Sentra is a local agent harness for Linux: spawn any CLI agent (`hermes`, `omp`,
`claude`, `codex`, or any command) into PTY panes, watch them live, and let them
throw work at each other with one triad: **send → wait → read** — from the GUI
(right-click → *Send to…*) or from a shell script.

It is a stripped-down orchestrator. Not an IDE, not a worktree manager, not a
cloud thing.

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

## Why it looks like this

- **The daemon owns all agent PTYs.** The browser/Tauri UI is a viewer — if it
  crashes or restarts, your agents keep running. This is the single most
  important rule.
- **The CLI is the orchestrator API.** Same verbs the UI uses, scriptable:

```sh
sentra send omp "Review this diff and list security bugs: $(git diff)"
sentra wait omp --idle-ms 5000
sentra read omp --tail 4000
sentra send claude "Omp said: $(sentra read omp --tail 4000). Fix the top 3."
```

- **Harness input.** Type `@hermes handle ui @claude front end @omp backend` and
  Enter spawns every mentioned agent at once, one terminal each.

## Features

- 1–8 pane grid (1 / 2 / 3-column layouts; 9+ scroll in 4 columns), xterm.js
  rendering, live resize
- Roster with live/dead dots, preset chips, one-click spawn
- Handoff UI: send → wait for PTY quiet → copy last output
- On exit: offer **save last output as lesson** and **respawn** (explicit clicks;
  nothing is learned or restarted behind your back)
- Lessons keyed by preset/profile and injected into the next spawn's first prompt
- Presets from `~/.config/sentra/presets.json` (file wins over bundled defaults)
- Optional TCP listener + web UI: `SENTRA_TCP=127.0.0.1:7621 sentra serve`, then
  any browser on `http://<ip>:7621` gets live xterm panes over SSE

## Install / run

```sh
cargo build --release
./target/release/sentra serve             # daemon + browser UI on :7621
# desktop shell (Tauri): install sentra-ui beside sentra, then
./target/release/sentra serve --with-ui
# headless:
./target/release/sentra serve
```

The web UI is served at `http://127.0.0.1:7621` with no extra step. `--with-ui`
spawns the optional Tauri window and still serves the browser UI.

Verbs: `spawn | list | send | wait | read | resize | kill | forget | presets |
profiles | lessons | research`. All `--json`-capable. Agent reference is a
numeric id or a name, everywhere.

Measured on this machine: daemon RSS **2.8 MB** on a fresh idle daemon,
**3.3 MB** with 5 idle bash agents (budget 30 MB). After heavy spawn/kill
churn the allocator can retain pages and the same daemon reports more; the top
bar shows the daemon's live measured RSS, so the number you see is the number
this build reports, not a claim in a file.

## 🗺️ Architectural Roadmap

> Sentra was built to eliminate the 500 MB–1 GB RAM overhead of Electron-based harnesses while ensuring zero UI crash propagation. Below is our phased development roadmap informed by state-of-the-art agent harnesses. Full technical specifications and architecture RFCs are documented in [ROADMAP.md](ROADMAP.md).

```
┌─────────────────────────────────────────────────────────────┐
│                   v0.1 Core Foundation (Shipped)            │
│  Daemon PTY Engine · send→wait→read · Multi-Dispatch · S00-S10│
└──────────────────────────────┬──────────────────────────────┘
                               │
       ┌───────────────────────┴───────────────────────┐
       ▼                                               ▼
┌───────────────────────────────┐       ┌───────────────────────────────┐
│ v0.2 Worktree Sandboxing      │       │ v0.3 MCP Tool Hub & Bridge    │
│ Isolated Git Worktree per PTY │       │ Daemon-level MCP multiplexer  │
└──────────────┬────────────────┘       └───────────────┬───────────────┘
               │                                        │
               └───────────────────────┬────────────────┘
                                       │
                                       ▼
┌─────────────────────────────────────────────────────────────┐
│ v0.4 Autonomous Workflow DAGs & Artifact Passing            │
│ Chain agents with exit-code triggers & sentra.yaml pipelines│
└──────────────────────────────┬──────────────────────────────┘
                               │
       ┌───────────────────────┴───────────────────────┐
       ▼                                               ▼
┌───────────────────────────────┐       ┌───────────────────────────────┐
│ v0.5 Semantic Transcript Layer│       │ v0.6 Checkpoints & Fast Undo  │
│ Dual-mode xterm + Card folding│       │ Pre-turn git snapshot rollback│
└───────────────────────────────┘       └───────────────────────────────┘
```

### Phased Milestones

| Phase | Milestone | Focus Areas | Status |
|:---:|---|---|:---:|
| **v0.1** | **Core Foundation** | Headless Rust daemon, PTY ring buffers, `send→wait→read` triad, dynamic grid | `SHIPPED` |
| **v0.2** | **Worktree Sandboxing** | Auto-provisioned Git worktrees (`.sentra/worktrees/`), Landlock FS isolation | `IN DESIGN` |
| **v0.3** | **MCP Tool Bridge** | Daemon-hosted Model Context Protocol multiplexer + Sentra MCP tools | `PLANNING` |
| **v0.4** | **Workflow DAGs** | Declarative pipelines (`sentra.yaml`), quiet & exit-code triggers | `PLANNING` |
| **v0.5** | **Semantic Transcript** | Dual-mode terminal + collapsible card-folding transcript & diff viewer | `CONCEPT` |
| **v0.6** | **Checkpoints & Undo** | Pre-turn Git tree snapshots, one-click session rewind (`/undo`) | `CONCEPT` |

---

### Harness Comparison Matrix

| Dimension | Sentra | Claude Code | Codex CLI | OpenCode | Warp |
|---|:---:|:---:|:---:|:---:|:---:|
| **Core Architecture** | **Native Rust Daemon** | Node CLI / Web | Rust TUI | Go Server / TUI | Closed-source ADE |
| **Idle Memory (Daemon)** | **~2.8 MB** | ~120 MB | ~45 MB | ~80 MB | ~450 MB |
| **Crash Immunity** | **Yes (Daemon owns PTY)** | No | No | Partial | Yes |
| **Multi-Agent Grid** | **Native dynamic grid** | Background jobs | Subagents | Tab switch | Panes |
| **Inter-Agent Handoff** | **`send→wait→read` triad** | Teleport | Findings return | Parent/child | Manual |
| **Worktree Sandboxing** | *Phase 1 (v0.2)* | Manual | Bubblewrap | Planned | No |
| **Daemon MCP Bridge** | *Phase 2 (v0.3)* | Client only | Server inspect | Config-based | No |

## Security notes

The unix socket is same-user only (`$XDG_RUNTIME_DIR/sentra`, mode 700). The
optional TCP/Web listener has **no authentication by design** — localhost or
trusted networks only. See [SECURITY.md](SECURITY.md).

Agents die with the daemon by design (it owns the PTYs). Persistence is limited
to `presets.json`, `profiles/`, and `lessons/`; scrollback does not survive a
daemon restart.

## Contributing

PRs welcome — read [CONTRIBUTING.md](CONTRIBUTING.md) first: one design rule,
hard cuts, smoke suite must stay green.

## License

[MIT](LICENSE)

## Contact

Questions or feedback: **dewantorokuntow@gmail.com** or open an
[issue](https://github.com/dewhush/sentra/issues).
