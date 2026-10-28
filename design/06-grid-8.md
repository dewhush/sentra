# 06 · Scaled 8+ Agents (Dynamic Grid)

Frame `1206`. 1440×900.
Same shell as 05. Density is the whole point.

## Grid

4 columns when the pane area can hold them (about 1280px and up). Otherwise fall through the 05 table: 3, then 2, then 1. Never a horizontal scrollbar on the page.

The file shows 8 panes plus a dashed ninth: `+ SPAWN AGENT IN SLOT #9`. That cell is a button, not an empty pane. Click focuses the command bar.

## Pane at this density

Header shrinks to one line: `#1 claude [UI/UX] idle`.
Body is three lines of real output, then ellipsis. No cognitive trace, no approve card — there is no room, and both are mock.
Meta chips (`opus-4.5`, `12:04`) drop under 1100px.

Type in a dense pane stays ≥ 11px. The file uses 8–10px. That fails.

## Status

`8/40 AGENTS · RSS 8.4 MB (BUDGET 30MB) · ~/SENTRA`
`40` and `30MB` are budgets from the file, not measured limits. Ship `8 live` until a real cap exists. RSS only if the daemon reports it.

## Sidebar

Unchanged width (288px, max 34vw). It lists workspaces, not all 8 panes as top-level folders. Agents sit inside the expanded workspace.

## Do not ship

- `ZERO-COPY IPC`, `ARBITRAGE`, `SAVED $` on the strip.
- A pane whose only content is fake log lines.
- The rewind button, same as 05.
