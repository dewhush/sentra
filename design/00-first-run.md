# 00 · First-Run Setup & CLI Detection

Frame `6615` (light), `6758` (dark). 1440×900.
Shown once, before any workspace exists. Not the hero. Not the empty folder.

## Purpose

Probe `$PATH`, list the CLIs that actually exist, pick the root folder, then enter the app.
No hardcoded agent list. Whatever the probe finds becomes the launcher cards.

## Layout

Top bar, then a centered column.

**Top bar**
- Wordmark `SENTRA` · `INITIAL ENVIRONMENT BOOTSTRAP`
- Right: green dot `127.0.0.1:4829 LIVE` · `Linux x86_64 · 32GB RAM · 0.08ms Ring`
- Host line is **mock**. Ship the real daemon URL and drop the ring-latency claim.

**Step**
- Kicker `STEP 1 OF 1 · SYSTEM SCAN` and `⚡ 12ms probe` (probe time is real, or omit).
- H1 24px Inter: `Local Agent Swarm Discovered`
- Sub 12px: `Sentra verified autonomous CLI binaries in your $PATH. Launchers and grid terminals adapt dynamically without hardcoding.`
- Status pill: `$PATH PROBE: 5/5 RUNTIMES VERIFIED & READY TO SPAWN`
- Path chips: `/usr/local/bin · ~/.cargo/bin · ~/.local/bin`

**Runtime rows** (one card each, only if the binary exists)

| Name | Handle | Blurb | Path | Version | State |
|---|---|---|---|---|---|
| Claude Code | claude | Autonomous coding agent with tool-call approvals | /usr/local/bin/claude | v0.2.29 | Ready |
| Codex CLI | codex | Code generation & continuous test verification | /usr/local/bin/codex | v1.4.0 | Ready |
| Oh My Pi (OMP) | omp | High-throughput pipeline runner & AST compiler | ~/.cargo/bin/omp | v0.8.2 | Ready |
| Hermes Autonomous Agent | hermes | Autonomous web search & deep documentation triage | ~/.local/bin/hermes | v2.1.0 | Ready |
| GNU Bash Shell | bash | Native Linux pseudo-terminal command fallback | /bin/bash | v5.2.15 | Ready |

Row: check, name 12px, handle chip, one-line blurb, mono path, version, green `Ready`.
Missing binary: row absent, or present as disabled with `Not found`. Do not show a check for a binary that is not there.

**Root folder**
- Label `DEFAULT WORKSPACE DIRECTORY (ROOT CWD)`
- Hint `All spawned agent terminals will initialize in this folder`
- Field: folder icon, `~/code/sentra`, `● local folder`, button `Browse`
- Actions: `⟳ Rescan $PATH` · `Manual Settings ↗` · primary `Initialize Sentra Workspace ▸`

## Behavior

- Rescan re-runs the probe and redraws the rows.
- Browse opens a directory picker. Field shows the chosen path.
- Initialize writes the workspace and routes to screen 01 (or straight to 10 if the folder is empty and the user skips the hero).
- Manual Settings opens screen 07.

## Do not ship

- Fake probe counts (`5/5`) when the scan found fewer.
- `0.08ms Ring` and RAM claims unless measured.
