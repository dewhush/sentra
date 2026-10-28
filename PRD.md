# Sentra — The AI Orchestrator
**PRD v0.9 — single-owner, Linux-first, local-only**
Status: APPROVED-BY-OWNER (Dew) · Owner: 0x · Platform: Linux desktop (Kali) · License: MIT

---

## 1. One-liner

> Sentra is a local desktop orchestrator where **one window hosts many AI-agent
> terminals** (hermes / omp / claude / codex / any CLI), the user **spawns and
> steers them**, and **agents hand work to each other** — at a fraction of the
> RAM of Electron-based alternatives.

## 2. Problem

1. Running 4–6 AI CLI agents = 4–6 terminal windows/tabs. Context switching dies fast, no overview, no statuses.
2. Existing orchestrator (Orca) is Electron, ~500 MB–1 GB RAM, one GPU-churning renderer, and 70% of its features (mobile relay, remote runtime, worktrees, browser) are dead weight for a single-user Linux desktop.
3. Agents currently cannot hand work to each other without copy-pasting between windows by hand.
4. When the UI dies, the agents die too (they are children of the UI process).

## 3. Solution overview

A **headless daemon owns every agent PTY**. A thin client (CLI) and a viewer (Tauri/xterm.js window) attach to it. Handoff = typed text into another agent's TTY + an "idle" detector, exposed both as CLI verbs and as a GUI right-click action. Agents also self-orchestrate by calling the same CLI.

## 4. Goals / Non-goals

**Goals (v1 = v0.1–v0.3)**
- G1: Spawn 5+ agents in one window, all visible, each focused in ≤1 keystroke.
- G2: Spawn presets one-click / one-command (`sentra spawn --preset omp`).
- G3: Human-to-agent and **agent-to-agent handoff** with a reliable idle-detector.
- G4: UI restart must be invisible to agents (agents survive; history survives).
- G5: Daemon idle RAM ≤ 30 MB @ 5 bash agents; total app ≤ 180 MB with UI.
- G6: Zero-config SaniOS install: clone → `cargo build --release` → run.
- G7: Four built-in themes (light, dark, cyberpunk, sepia) plus a
  reduced-motion switch. Chrome and terminal palette only — no theme plugin
  API, no per-agent skins.

**Non-goals (REJECTED — final for v1; see §12 for deferred banner list):**
mobile, remote/SSH runtimes, relays, git worktrees, embedded browser, GitHub/
Linear/GitLab integration, skills marketplace, kanban, team features, accounts,
telemetry, auto-update, plugins, theme plugins/marketplaces, Windows/macOS
builds, docker.

## 5. Personas

- **Dew (primary, the only user that matters)** — power user, Kali, runs
  security/research workflows; drives everything from keyboard; hates bloat.
- **"Script" (persona non-humana)** — cron jobs and agents themselves invoking
  `sentra send/wait/read` to coordinate each other. First-class customer.

## 6. User stories & acceptance criteria

| # | Story | Acceptance |
|---|-------|-----------|
| S1 | As Dew I open one window and see all my agents at a glance | Roster shows every live agent (status dot, name, argv, id) without scrolling; roster updates within 500 ms of spawn/exit |
| S2 | As Dew I spawn a preset agent in one action | Command bar `omp` + Enter, or preset chip click, or `sentra spawn --preset omp` → new PTY running that agent in ≤ 500 ms |
| S3 | As Dew I split the view to compare two agents working | Split focus, both panes render TUI apps (htop, claude code spinner) without artifacts; resize keeps them aligned |
| S4 | As Dew I hand a task from agent A to agent B | Select A → handoff dialog → pick B → message. B's TTY receives the text; UI offers "copy B's last output" once B's PTY is quiet after answering (not a claim that the task is done) |
| S5 | As a script I orchestrate two agents unattended | `send → wait --idle-ms 5000 → read --tail 4000` roundtrip against two headless echo-agents exits 0 with expected bytes |
| S6 | As Dew I close my laptop lid / UI crashes | Daemon keeps running; reopening UI shows same agents, same scrollback (last 256 KiB per pane) |
| S7 | As Dew I kill an agent | Only that agent dies; banner "agent exited (code N)" on its pane; roster dot turns hollow |
| S8 | As the orchestrator-curious I wire 3 agents into a chain | Documented CLI recipe (send/wait/read loop) works for ≥ 3 hops without manual copy-paste |
| S9 | As Dew I run the whole thing from a terminal-only box | `sentra serve` + CLI verbs do everything except rendering; no GUI dependency in the daemon binary |

## 7. Functional requirements

### F1 — Daemon (`sentra serve`) [P0, M1]
- Owns N PTYs (portable-pty). Spawn/lifecycle per §8 data model.
- Unix-socket JSON-Lines API: `spawn, list, watch, unwatch, send, wait, read, resize, kill, forget`.
- `wait` returns idle only when the newest PTY output is newer than the newest
  input; input written and followed by silence is not idle. `forget` prunes a
  dead registry record and refuses live agents.
- Ring buffer 256 KiB per agent; `last_output` timestamp; alive/exited states.
- Stale socket handling, sane errors (`{"ok":false,"err":"agent 12 not found"}`).
- Affects: G4, S6, S7, S9.

### F2 — CLI (`sentra <verb>`) [P0, M2]
- Verbs: `spawn|list|send|wait|read|resize|kill|forget|presets` (+`serve`).
- Name-or-id resolution, `--json` on all, exit codes 0/1, stream-safe for pipes.
- Presets file `~/.config/sentra/presets.json` overrides bundled defaults.
- Affects: G2, G3, S5, S8.

### F3 — Viewer UI (`sentra-ui`, Tauri 2 + xterm.js)[P0, M3]
- Single window: roster sidebar, pane grid (2-col masonry, depth ≤2), command bar.
- xterm.js render + fit-addon; daemons `read --tail` backfill then `watch` stream.
- Hover/click focus; shortcuts: split (Ctrl+Shift+arrows), close (Ctrl+Shift+W),
  cycle (Ctrl+Tab). Re-grid equal-size (no tiling algebra).
- Affects: S1, S2, S3.

### F4 — Handoff (cross-cutting) [P0, M4]
- CLI triad documented & tested: `send → wait --idle-ms → read --tail`.
- GUI: right-click pane → "Send to…" → target picker → message → auto-wait →
  "copy last output" affordance.
- Idle semantics: no PTY output for ≥ idle_ms AND ≥1 output seen. Documented
  caveat pages (agents emitting fragments) — default 4000 ms, tunable per call.
- Affects: S4, S8.

### F5 — Packaging [P1, M5]
- `cargo build --release` one-shot. `sentra.desktop` + `Exec=sentra serve --with-ui`
  (starts daemon if absent, then window). Resize-safe on HiDPI.
- Affects: G6.

### F6 — Observability-lite [P2, stretch]
- `sentra status` prints daemon version, uptime, agent count, RSS (self + children).
- `--json`. No daemons, no logging frameworks — stderr only.

## 8. Architecture & data model

```
┌──────────┐   unix socket (JSON lines)   ┌──────────────────┐
│ sentra-ui │◄────────────────────────────►│ sentra-daemon     │
│ (viewer)  │  spawn/list/send/wait/…      │  ├ agent 1: PTY   │
└──────────┘   watch→{out|exit} stream      │  ├ agent 2: PTY   │
┌──────────┐                                │  └ agent N: PTY   │
│ sentra-cli│◄──────────────────────────────►│  ring buffer 256K │
└──────────┘   same verbs, machine use        └──────────────────┘
```

Agent record: `id u32 monotonic · name unique (dup → name-2) · argv · cwd · pid ·
alive:bool · exit_code · last_output:Option<Instant> · ring:VecDeque<u8> · subs`.

Socket: `$XDG_RUNTIME_DIR/sentra/sentra.sock` (fallback `/tmp/sentra-$UID/…` if
unset — create 0700). Env override `SENTRA_SOCKET`.

## 9. UX spec (v1 wireframe)

```
┌ roster ─────┬ pane A (focused) ────────┬ pane B ───────┐
│ ● omp      │  $ htop …                │ > claude      │
│ ● claude   │                          │  ▊ thinking…  │
│ ○ bash-2   │                          │               │
│ ● hermes   │                          │               │
├────────────┴──────────────────────────┴───────────────┤
│ > omp                                   [hermes][omp][claude][codex][bash] │
└────────────────────────────────────────────────────────┘
```
- Focus ring on the active pane; dead agents' panes get a red "exited (code N)" strip.
- Command-bar grammar: `@name task` dispatches to live agents with that name,
  or spawns the preset/profile and sends the task. A bare known name spawns
  that preset; anything else is raw argv and spawns a new PTY. The button reads
  `DISPATCH REPO ▸` only when every handle is live and a task is present.

## 10. Performance requirements

| Metric | Target | Measured by |
|---|---|---|
| Daemon RSS @5 idle agents | ≤ 30 MB | `smem`/`ps` in smoke script |
| UI total RSS @5 running, idle | ≤ 150–180 MB | same |
| spawn → first PTY byte | ≤ 500 ms | smoke script timer |
| handoff roundtrip (send→wait→read) | ≤ idle_ms + 250 ms | smoke script timer |
| idle daemon CPU | 0% (event-driven, no busy loops) | `top` over 10 s |

## 11. Reliability & edge cases (must handle, each has a test)

- E1 agent segfaults → pane marks dead, daemon lives, roster updates.
- E2 daemon killed → agents killed (documented behavior); daemon restart clears
  registry (no zombies, no stale sockets).
- E3 client disconnects mid-`watch` → subscriber cleanup, no leaked threads/panics.
- E4 massive output flood (`yes`) → ring caps at 256 KiB; watchers backpressure =
  skip-and-drop with a `{"evt":"dropped"}` marker (never blocks the agent's PTY).
- E5 duplicate spawn names → `omp-2`, `omp-3`…
- E6 UTF-8 torn at read boundaries → lossy single-frame convert + note (v1 debt).
- E7 resize row/col to absurd values → clamp 10..500 / 2..300.
- E8 `wait` on dead agent with `exit:false` → immediate `{"exited":true}`.

## 12. Deferred (v2+ backlog — acknowledged, NOT built in v1)

Named so nobody "discovers" them: git worktree per agent pane; chain Flows
(YAML: a→wait→b→…); scrollback persistence across daemon restarts; multiple
named socket groups ("decks"); portability (macOS); `item handoff` attachments.
Re-entry requires a new PRD bump.

## 13. Risks & mitigations

| Risk | Mitigation |
|---|---|
| webkit2gtk quirks on Kali/XFCE | daemon-only fallback remains fully functional (S9) |
| Idle-detector false positives on chatty agents | tunable idle_ms per call + `--exit` alternative; documented |
| xterm.js re-render cost at 30+ agents | roster caps visible panes at 12; others Listed-only (v1) |
| Single-file distribution drift | `sentra serve --with-ui` sanity-checks versions at boot, refuses mismatched pair |

## 14. Success metrics (v1 shipped =)

- M1–M5 all smoke tests green (`scripts/smoke.sh` exits 0).
- Owner uses Sentra ≥ 3 days across his real hermes/omp/claude/codex sessions.
- Peak RAM ≤ targets in §10.
- One full "agent helps agent" real task completed without the user copying
  text into windows manually.

## 15. Open questions

- Q1: Should `send` refuse when target agent is mid-TUI (spinner)? → v1: no (text lands like a user typing; the agent's own prompt handles it). Revisit with data.
- Q2: Named socket ownership check (another daemon already bound)? → respond `{"ok":false,"err":"daemon already running"}`; no second-daemon arbitration in v1.
