# 10 · Empty Folder State

Frame `9638` (light), `9691` (dark). 1440×900.
In-app empty. A workspace is selected and it has zero live PTYs. Other folders may still have agents. This is not screen 01 and not screen 00.

## When

The grid hides. This card fills the pane area. The sidebar, top bar, and command bar stay.

## Top bar

- `SENTRA`
- Center: folder chip `📁 ~/empty-workspace` · `● 0 PTYs`
- Right: `● Daemon running` plus RSS only if measured.

## Sidebar

- `WORKSPACE FOLDERS`
- Expanded current folder, highlighted, badge `0 agents`
- `OTHER FOLDERS` — collapsed rows for folders that have agents, badge `3 running`
- Clicking another folder leaves this screen.

## Card (centered, max 640px, radius 16, canvas fill)

- Circle, accent-tinted, bolt glyph.
- H2 18–20px: `No PTY running in this folder`
- Sub, muted, names the folder: `Spawn your first CLI agent or select a preset to begin orchestrating in ~/empty-workspace`
- Primary button, accent, white label: `＋ Spawn Agent` with kbd `Ctrl-T`
  - The file prints `⌘T` on top of the label (the button is 100px tall in the source and clips). Ship the keys beside the label, never over it. Linux: `Ctrl-T`.
- Preset grid, `auto-fit`, min ~140px, four or five cards:

| Preset | Sub (from the file) |
|---|---|
| Claude Code | UI & Fullstack |
| OMP | Rust Backend |
| Codex | Test Harness |
| Hermes | Recon Runner |
| Bash | (add: Shell) |

Card: icon, name, one-line role. Click spawns that preset into this folder.

- Foot, 11px muted: `Tip: Drag & drop project files anywhere or press Ctrl-O to jump to another folder`

## Behavior

- `Ctrl-T` focuses the command bar. It does not spawn a default agent.
- Preset card spawns immediately, then this card hides and the pane shows.
- Drop anywhere opens 05b. With no agent, Inject stays disabled.
- `Ctrl-O` opens 09.
- The card goes away as soon as one PTY in this folder is alive. It comes back when the last one exits or is killed.

## Do not ship

- `⌘` on a Linux build.
- A fake `DAEMON RUNNING` when the socket is down. That state is the boot error in `components.md`.
