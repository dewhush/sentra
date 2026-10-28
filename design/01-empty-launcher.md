# 01 · Empty Launcher — First Run

Frame `933`, inside `Light Version - Sentra`. 1440×900.
The hero. Shown when Sentra has a workspace but zero agents, and the user has not dismissed it.

## Purpose

One sentence, one input, five presets. Optional context below the fold of the hero, not a second app.

## Layout

Page background `#F5F5F7`. Content column max 660px, centered.

**Top bar** (full width, 48px, white)
- Logo + `SENTRA`
- Right: `⚙ SETTINGS` (opens 07)

**Hero**
- H1 40px Inter SemiBold, tracking −1.2px: `Many terminals,`
- Second line 48px Instrument Serif italic: `one window.`
- Sub 16px muted, max 560px, centered:
  `Spawn any CLI agent into a daemon-owned PTY. Chain tasks across agents with send → wait → read. UI crashes, agents live.`

**Spawn field** (white, full column width, radius 10)
- Prompt `>`
- Placeholder: `spawn an agent…  e.g.  @claude  or  bash --norc`
- Enter submits.

**Hint** 12px muted, centered:
`Enter = spawn preset · free text = raw argv · @name handle task = spawn + send`

**Preset chips** (row, centered, wrap)
`CLAUDE` `OMP` `HERMES` `CODEX` `BASH` — pill, icon + label. Click = spawn that preset with empty task.

**Divider** `─── OR SET CONTEXT FIRST ───`

**Project context card** (optional, white, radius 12)
- Kicker: `PROJECT CONTEXT (OPTIONAL — AGENTS INHERIT THIS)`
- Input: `GIT CLONE URL OR LOCAL PATH… e.g. github.com/dewhush/sentra`
- Input: `BRIEF / TASK CONTEXT… e.g. Redesign UI to ArtCraft system tokens`
- Drop zone, dashed:
  - `DROP FILES OR FOLDERS HERE · OR CLICK TO BROWSE`
  - `SUPPORTED: PDF · TXT · MD · JSON — MULTIPLE FILES OK`
- Footer: `● DAEMON IDLE · SOCKET … · 0 AGENTS · RSS …`
  - Socket path and RSS are **mock** unless the daemon reports them. Ship `● daemon live · 0 agents` plus the real URL. One status line, not three.

## Behavior

- Enter on a known preset name or `@name` spawns it.
- Free text is raw argv (`bash --norc` spawns bash). If spawn fails, say so in the field. Do not leave the hero up with no error.
- `@name <task>` spawns and sends the task.
- A chip spawns that preset immediately.
- Context fields are optional. Filling them does not spawn. They bind to agents spawned after.
- Drop zone accepts PDF, TXT, MD, JSON, each under 10 MB. Reject the rest with screen-level error copy from `components.md`.

## After a successful spawn

Leave this screen. Land on 03 with the new pane focused.

## Do not ship

- A second spawn grammar that disagrees with the in-app command bar.
- The hero and the empty-folder card at the same time.
