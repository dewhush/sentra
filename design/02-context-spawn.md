# 02 · Context Set + Spawn 1 Agent

Frame `970`. 1440×900.
The moment between the hero and the workspace: context is bound, the first agent is spawning.

## Purpose

Show that the optional context from 01 stuck, and that the first PTY is coming up. This is a transition, not a place to live.

## What is on screen

Same shell as 03, with one difference: the pane is not idle yet.

- Top bar: `SENTRA` · status `1 agent · spawning` · `⚙ SETTINGS`
- Context strip (real, not the fabric mock): `● directory: <cwd> · brief: <the brief they typed, or omitted>`
- Sidebar: the one workspace, expanded, the new agent row in a pending state (`spawning`, not `live`).
- One pane, full width (grid class `c1`):
  - Header: live-pending dot, icon, agent name, argv
  - Body: the real PTY. First lines may be the inherited brief, then the process banner.
  - Do not paint a fake transcript (`Inherited brief from ~/SENTRA: "…"`) unless that text was actually sent.
- Command bar already visible, so the second agent can be spawned without going back to 01.

## Behavior

- Pane flips from pending to `live` on the daemon's spawn-ok.
- Spawn failure: pane becomes the crash state in `components.md` (exit code, Restart). Do not leave a blank card.
- Context strip updates from the real cwd and the real brief. No brief → no brief segment.

## Do not ship

- `REPO CLONED & CONTEXT BOUND` unless a clone happened.
- A second copy of the hero behind the pane.
