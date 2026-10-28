# 03 · 1-Agent Workspace

Frame `995`. 1440×900.
The app, with a single live PTY. This is the shell every later screen reuses.

## Regions

```
┌ topbar 48px ──────────────────────────────────────────────┐
├ context strip ────────────────────────────────────────────┤
│ sidebar 288px │ pane (flex, one card, radius 14)          │
│               │                                            │
├ command bar ──────────────────────────────────────────────┤
│ shortcut row, centered, quiet                              │
└────────────────────────────────────────────────────────────┘
```

Background behind the pane is canvas `#F5F5F7`. The pane is a white card, 12px inset, 1px border `#E8E8ED`. Focused card: 1px accent border. Not an inset hairline on a flat split.

## Top bar

- Left: logo, `SENTRA`, serif tagline `many terminals, one window` (hide tagline under 900px).
- Right: `N/N LIVE · <cwd>` then `⚙ SETTINGS`.
- One daemon status. Do not repeat the URL in the top bar, the sidebar foot, and the empty card.

## Context strip

One line, real data only: `● <live count> agents · <cwd>`.
If a brief was set: append `· brief: <brief>`.
The design's `FABRIC / DIFF / PIPELINE / ARBITRAGE / SAVED` line is **mock**. Leave it out.

## Sidebar

See `components.md`. At one agent: one workspace block, expanded, one row, badge `1 agent · 1 live`.

## Pane

See `components.md` → Agent pane.
Header: dot, icon, `#1  <NAME>`, role if any, argv pushed right, `✕`.
Body is the PTY. Footer chips in the design (`~/SENTRA`, `opus-4.5`, `12:04`, token %) are **mock** unless the daemon sends them.

## Command bar

- White pill, radius 12, prompt `>`.
- Placeholder: `preset, @profile, or command argv…`
- Button, black, white label: `Spawn Agent ↵` (design says `+ SPAWN AGENT ↵`).
- Shortcut row, centered, uppercase, 10px mono:
  `CTRL+SHIFT+↑ SPLIT · CTRL+SHIFT+W KILL · CTRL+TAB CYCLE · R-CLICK HANDOFF`

## Behavior

- Submit spawns. Empty submit does nothing visible — disable the button, or show `empty`.
- `↑` `↓` walk command history. `@` + Tab completes a preset.
- Click the pane or its sidebar row to focus. Right-click a row opens handoff (`components.md`).
- `Esc` returns focus to the PTY.

## Responsive

- Pane column never shares a row it cannot fit. One pane is always full width.
- Under 900px the sidebar becomes the 56px icon rail.
- Under 650px the shortcut row and the argv hide.
