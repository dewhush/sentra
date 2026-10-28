# 08 · Sidebar Clone & Context Dispatch

Frame `1313`. 1440×900.
The workspace once context is bound and two agents are working. Sidebar is the subject.

## Purpose

Show a workspace tree with more than one folder, a bound brief, and panes that inherited it.

## Sidebar (this is the full design, 288px)

Header: `WORKSPACES` + count badge `3`, then icon buttons `+` (attach), `⟳` (refresh), `⚙` (settings).

Groups:

**Local**
- `sentra` expanded, badge `ACTIVE · 3`, path `~/SENTRA`
  - subfolder `crates/sentra-ui` · `● live`, containing the agent rows
    - omp · `attachment · TUI live` · `now`
    - claude-code · `triage · 2 files changed` · `now`
    - codex · `test harness · idle` · `8m`
  - `crates/sentra-daemon` · `1 agent` (collapsed)
  - `web` · `idle`
- `bug-bounty` collapsed, badge `synced · vps`, path `~/shared/bug-bounty`, sub `hermes · recon runner`
- `pathfinder` collapsed, `idle`, `~/code/pathfinder`

Footer: `+ Attach Directory…` with `Ctrl-O`. Daemon line under it: socket + RSS, only if real.

Agent row: status dot, icon, name, one-line argv or role, relative time. Click focuses the pane. Right-click opens handoff.

The subfolder-inside-workspace nesting is the design. Production groups by cwd only. Spec target is the tree above; cwd grouping is the acceptable v1 if the daemon has no folder tree.

## Context strip

Real: `● directory: ~/SENTRA · brief: 40+ Agent scale + Sentra UI`
Not: fabric, diff, pipeline.

## Panes (2 across)

Left `#1 CLAUDE · UI/UX DESIGNER`. Body shows the inherited brief only if it was sent:
`Inherited brief from ~/SENTRA: "…"` then the PTY.
Right `#2 OMP · FULLSTACK ENGINEER (FOCUSED)`, accent border.

## Command bar

Filled example: `@omp handle backend refactor @claude handle ui @codex verify diff`
Button: `DISPATCH REPO ▸` when the line dispatches to agents already alive, `Spawn Agent ↵` when it spawns new ones. One button, label follows the line. Do not invent a third mode.

## Do not ship

- `synced · vps` on a folder that is not a Syncthing path.
- Relative times (`now`, `8m`) that do not update.
