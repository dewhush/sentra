# 09 · Quick Folder Switcher

Frame `9540` (light), `9589` (dark). 1440×900.
Overlay. Opened by `Ctrl-O` or the sidebar footer. Not a page.

## Layout

Dim scrim. Card 520px, radius 12, centered ~12vh from the top. Shadow.

**Field**
- Search icon, placeholder `Jump to workspace folder or sync directory…`
- Right side of the field: `Ctrl-O / Ctrl-K` as a hint, not a second shortcut. `Ctrl-K` is not bound. Drop it, or bind it to the same toggle.

**Section label** `ACTIVE & RECENT WORKSPACES`

**Rows**

| Icon | Path | Sub | Badge |
|---|---|---|---|
| folder | ~/SENTRA | Local Directory · Current Active Workspace | ● 3 running · ↵ jump |
| folder | ~/code/pathfinder | Local Directory · 1 agent active | 1 running |
| cloud folder | ~/shared/bug-bounty | VPS Syncthing Sync · latency | ⇄ VPS · 2 running |
| plus | Open / Attach New Workspace Folder… | | Ctrl-Shift-O |

Selected row: accent outline, full width.
`VPS` and latency are real only for a path that is actually synced. A local folder does not get a cloud icon.

**Footer** `↑↓ Navigate · ↵ Select Folder · ⇥ Subfolders · esc Dismiss`

## Behavior

- Type filters name + path. Arrow keys move the selection. Enter activates.
- Workspace row: focus the first live agent in that folder. None live → refresh the list, stay on the overlay only if the folder failed to resolve.
- Preset rows may share this overlay (production already lists them). Label them `PRESET`, not as folders.
- Attach row opens the directory picker.
- `Esc` closes and returns focus to whatever had it.
- `⇥` for subfolders is in the file and not built. Omit the hint until it works.

## Empty

No workspaces yet: one row, `Open / Attach New Workspace Folder…`, and the line `No folders yet.`
