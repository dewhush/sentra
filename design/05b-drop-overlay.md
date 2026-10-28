# 05b · Drag & Drop Files Overlay

Frame `6097` (light), `6335` (dark). 1440×900.
Modal over whichever workspace is up (03–06, 08, 10).

## Purpose

User dropped files. Confirm what was accepted, who receives them, then inject.

## Layout

Workspace behind is dimmed and blurred. Centered card, dashed accent border, radius 16, max 580px.

- Icon in a circle.
- H3: `Drop Files to Inject into Workspace`
- Sub: `Injects file references directly into active CLI agent context ring buffer`
- File chips, one per accepted file: icon, name (`server.rs`), size (`14.2 KB`). Folders show a count (`e2e_tests/ · 6 files`).
- Row: `Attach to Agent:` + select (default the focused agent, then each live agent by `#id name`) + primary `Inject All (N) ▸`
- Hint: `Press Escape or drag pointer outside canvas to cancel`

## Rules

Accepted: PDF, TXT, MD, JSON. Each file under 10 MB.
Rejected: anything else, archives, executables. Say so with the scenario-02 copy in `components.md` — name the file and the reason. Do not silently drop it.

The file's own hint says `Supported: Any text, code, patch, markdown, or directory`. That contradicts the 10 MB / PDF·TXT·MD·JSON rule used on 00, 01, and the error sheet. **The restrictive rule wins.**

## Behavior

- `Esc`, or a drag that leaves the window, closes with no inject.
- Inject sends a file reference to the chosen agent. It does not upload a binary blob into the PTY.
- Zero accepted files: no Inject button. Show the rejection state only.
- No live agent: Inject disabled. Copy: `Spawn an agent first.`
