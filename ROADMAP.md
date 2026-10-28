# Sentra Product & Architectural Roadmap

Sentra is a native, ultra-low-footprint Linux orchestrator for autonomous CLI agents. Where existing harnesses consume hundreds of megabytes of RAM running Electron and fragile sub-processes, Sentra decouples agent execution into an independent headless Rust daemon (`~2.8 MB` RSS) owning robust PTY rings, while a GPU-accelerated viewer attaches and detaches seamlessly.

This roadmap details upcoming architectural milestones informed by state-of-the-art agent harnesses (Claude Code, Codex CLI, OpenCode, omp, Warp, and Aider) adapted to Sentra's UNIX-philosophy daemon design.

---

## 🗺️ High-Level Overview

```
┌─────────────────────────────────────────────────────────────┐
│                    Current Foundation (v0.1)                │
│  Daemon PTY Engine · send→wait→read · Multi-Dispatch · S00-S10│
└──────────────────────────────┬──────────────────────────────┘
                               │
       ┌───────────────────────┴───────────────────────┐
       ▼                                               ▼
┌───────────────────────────────┐       ┌───────────────────────────────┐
│ Phase 1: Worktree Sandboxing  │       │ Phase 2: MCP Tool Bridge      │
│ Isolated Git Worktrees per PTY│       │ Daemon-level MCP multiplexer  │
└──────────────┬────────────────┘       └───────────────┬───────────────┘
               │                                        │
               └───────────────────────┬────────────────┘
                                       │
                                       ▼
┌─────────────────────────────────────────────────────────────┐
│ Phase 3: Visual Pipeline DAGs & Artifact Passing            │
│ Chain agents autonomously with exit-code & quiet triggers   │
└──────────────────────────────┬──────────────────────────────┘
                               │
       ┌───────────────────────┴───────────────────────┐
       ▼                                               ▼
┌───────────────────────────────┐       ┌───────────────────────────────┐
│ Phase 4: Semantic Transcript  │       │ Phase 5: Checkpoints & Undo   │
│ Dual-mode xterm + Card folding│       │ Pre-turn git snapshot rollback│
└───────────────────────────────┘       └───────────────────────────────┘
```

---

## 📌 Phase 1: Agent Isolation & Git Worktree Sandboxing

**Target:** v0.2 · **Status:** In Design

### The Problem
When running multiple coding agents simultaneously (e.g. `@omp` on backend and `@claude` on frontend) inside the same workspace directory, agents step on each other's uncommitted changes, trigger Git index lock collisions (`index.lock`), and contaminate active test runners.

### Deliverables
- **Auto-Worktree Provisioning:** Daemon automatically clones a lightweight git worktree (`.sentra/worktrees/<agent-id>`) when spawning coding profiles.
- **Rebase & Merge Coordination:** Commands to review diffs and merge agent worktree branches cleanly back into the main branch (`sentra merge <id>`).
- **Filesystem & Privilege Sandboxing:**
  - Linux `landlock` integration for filesystem access limits (restricting agent PTYs to workspace directory).
  - Optional `cgroups v2` resource ceilings (memory and CPU quotas per agent).

---

## 📌 Phase 2: MCP (Model Context Protocol) Bridge & Tool Hub

**Target:** v0.3 · **Status:** Planning

### The Problem
CLI agents currently boot redundant MCP servers (filesystem, SQLite, GitHub, Playwright browser) independently, wasting memory and creating connection deadlocks.

### Deliverables
- **Daemon-Hosted MCP Multiplexer:** Sentra daemon hosts and manages configured MCP servers once, exposing standard stdio/SSE endpoints to all active PTYs.
- **Sentra as an MCP Server:** Expose Sentra's orchestration primitives as an MCP tool suite:
  - `sentra_spawn(preset, profile, task)`
  - `sentra_send(agent, prompt)`
  - `sentra_wait_idle(agent, timeout)`
  - `sentra_read_tail(agent, lines)`
  - *Outcome:* Any running agent (e.g. Lead Planner) can autonomously spawn, steer, and gather results from worker agents via structured tool calls.

---

## 📌 Phase 3: Autonomous Workflow DAGs & Pipeline Chains

**Target:** v0.4 · **Status:** Planning

### The Problem
Inter-agent collaboration currently requires manual right-click handoffs or inline `@name1 task @name2 task` commands. Complex multi-stage engineering tasks need deterministic chaining.

### Deliverables
- **Declarative Pipeline Config (`sentra.yaml`):**
  ```yaml
  pipeline: security-audit
  nodes:
    - id: recon
      preset: subfinder
      output: subdomains.txt
    - id: scanner
      preset: nuclei
      depends_on: recon
      input: $recon.output
    - id: triage
      profile: omp-sec
      depends_on: scanner
      prompt: "Analyze findings in $scanner.output and write report.md"
  ```
- **Quiet & Exit Triggers:** Daemon evaluates completion via exit codes or PTY idle detection (`--idle-ms 1200`), routing standard output artifacts to downstream agents automatically.
- **DAG Status Visualization:** Topbar visual pipeline indicator displaying live stage progression and bottlenecks.

---

## 📌 Phase 4: Semantic Transcript Layer & Tool-Call Folding

**Target:** v0.5 · **Status:** Concept

### The Problem
Raw VT100 terminals are essential for high-fidelity interactive TUIs (like `omp` or `htop`), but verbose log outputs (thousands of lines of build logs or web fetches) obscure critical decisions and diffs.

### Deliverables
- **Dual-Mode Pane Rendering:**
  - **Raw Mode:** Current zero-latency xterm.js PTY stream.
  - **Transcript Mode:** Semantic parser extracting markdown blocks, code diffs, command executions, and model responses into collapsible cards.
- **Searchable Cross-Agent Stream:** Global unified activity feed indexing events across all active panes.

---

## 📌 Phase 5: Checkpoints, Session Rewind & Instant Undo

**Target:** v0.6 · **Status:** Concept

### The Problem
An autonomous agent can produce destructive edits or introduce bugs deep into a session, forcing tedious manual `git checkout` or `git stash` recovery.

### Deliverables
- **Pre-Turn Snapshots:** Daemon captures a lightweight Git tree hash before delivering a new dispatch or command.
- **One-Click Turn Undo:** Command bar and pane UI button to roll back workspace modifications to any checkpoint without restarting the agent session.
- **Session Checkpoint Export:** Export entire orchestration state (agent ring logs, profiles, active worktrees) into reproducible bundles for team sharing.

---

## 📌 Phase 6: Remote Multiplexing & Mobile Telemetry Relay

**Target:** v0.7 · **Status:** Future

### Deliverables
- **Secure Remote Gateway:** Authenticated WebSocket tunnel over the local HTTP daemon.
- **Responsive Mobile Companion:** Monitor long-running agent clusters, receive quiet notifications, and approve pending tool calls directly from mobile browsers.

---

## 💡 Comparison Matrix: Sentra vs. Other Harnesses

| Feature | Sentra | Claude Code | Codex CLI | OpenCode | Warp |
|---|---|---|---|---|---|
| **Core Architecture** | Headless Rust Daemon | Node CLI / Web | Rust TUI | Go Server / TUI | Closed-source ADE |
| **Idle Memory (Daemon)** | **~2.8 MB** | ~120 MB | ~45 MB | ~80 MB | ~450 MB |
| **Crash Immunity** | **Yes (Daemon owns PTY)** | No | No | Partial | Yes |
| **Multi-Agent Grid** | **Native dynamic grid** | Background jobs | Subagents | Tab switch | Panes |
| **Inter-Agent Handoff**| **`send→wait→read` triad** | Teleport | Findings return | Parent/child | Manual |
| **Worktree Sandboxing** | *Phase 1 (Planned)* | Manual | Bubblewrap | Planned | No |
| **Daemon MCP Bridge** | *Phase 2 (Planned)* | Client only | Server inspect | Config-based | No |

---

*Contributions, architectural feedback, and RFCs are welcome. See [CONTRIBUTING.md](CONTRIBUTING.md) to get involved.*
