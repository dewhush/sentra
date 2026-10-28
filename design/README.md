# Sentra UI — design specs

Source: `sentra-ui.figcraft` (page **Sentra Application UI**). That file is a 7 MB Figma-derived binary and is **not in this repository** — it is kept locally at `~/figcraft-work/sentra-ui.figcraft` and ignored via `*.figcraft`. The specs below are the reviewable, in-repo record of it.
Canvas is 1440×900 unless noted. Light is the spec. Dark is the same layout on the dark tokens.

These files describe the design. They do not describe what production does today.
Copy marked **mock** is decoration in the file (fabric, diff, pipeline, cognitive trace, dollar costs). Do not ship it as live data.

Shortcuts in the file use `⌘`. The product runs on Linux. Ship `Ctrl`.

| # | File | Frame |
|---|---|---|
| 00 | [00-first-run.md](00-first-run.md) | First-Run Setup & CLI Detection |
| 01 | [01-empty-launcher.md](01-empty-launcher.md) | Empty Launcher — First Run |
| 02 | [02-context-spawn.md](02-context-spawn.md) | Context Set + Spawn 1 Agent |
| 03 | [03-one-agent.md](03-one-agent.md) | 1-Agent Workspace |
| 04 | [04-adding-second.md](04-adding-second.md) | Adding 2nd Agent |
| 05 | [05-grid-3.md](05-grid-3.md) | 3-Agent Dynamic Grid |
| 05b | [05b-drop-overlay.md](05b-drop-overlay.md) | Drag & Drop Files Overlay |
| 06 | [06-grid-8.md](06-grid-8.md) | Scaled 8+ Agents |
| 07 | [07-settings.md](07-settings.md) | Settings shell + tabs |
| 08 | [08-sidebar-dispatch.md](08-sidebar-dispatch.md) | Sidebar Clone & Context Dispatch |
| 09 | [09-switcher.md](09-switcher.md) | Quick Folder Switcher |
| 10 | [10-empty-folder.md](10-empty-folder.md) | Empty Folder State |
| 11 | [11-mobile.md](11-mobile.md) | Mobile UI Suite (390×844) |
| — | [components.md](components.md) | Topbar, sidebar, pane, states, errors |

## Tokens

| Token | Light | Use |
|---|---|---|
| ink | `#1D1D1F` | text |
| paper | `#FBFBFD` | page |
| canvas | `#F5F5F7` | app background behind cards |
| accent | `#2D81FF` | primary button, focus, links |
| neutral | `#FFFFFF` | cards, inputs |
| muted | `#6E6E73` | secondary text |
| ghost | `#6E7382` | hints |
| border | `#E8E8ED` | hairlines |

Type: Inter (UI), Instrument Serif italic (the one hero word), Geist Mono (paths, keys, status), Archivo (wordmark).
8px grid. Cards radius 12–16. Buttons radius 8. Min interactive target 24px.

## Flow

```
00 first run  →  01 empty launcher  →  02 context + first spawn
      →  03 one agent  →  04 second  →  05 three  →  06 eight
overlays, any time after 03:  05b drop · 07 settings · 09 switcher
10 empty folder: a workspace with zero live PTYs, other folders still exist
```

00 is a one-time bootstrap. 01 is the hero with no agents. 10 is the in-app empty state after a workspace exists.
