# 05 · 3-Agent Dynamic Grid

Frame `1116`. 1440×900.
Three live panes. Layout rule for 3, 4, 6, 8 lives here.

## Grid

Gap 12. Padding 12. Each pane a white card, radius 14.

| Panes | Columns | Notes |
|---|---|---|
| 1 | 1 | full width |
| 2 | 2 | equal |
| 3 | 2 | third pane spans both columns, bottom |
| 4 | 2×2 | |
| 5–6 | 3 | |
| 7–8 | 4 | screen 06 |
| 9+ | keep 4 columns, scroll the grid | the file's `SLOT #9` is a spawn affordance, not a ninth visible cell |

Wrap to 1 column when the pane column is under ~840px (two 420px cards no longer fit).

## Pane content in this frame (what is mock)

The file draws, per pane:

- Header `#1 CLAUDE` / role `UI/UX DESIGNER` / `✕ Kill`
- Meta chips: `~/SENTRA` `sentra-ui ✔` `opus-4.5` `12:04`
- Telemetry: `◔ 38% (98k)` `42MB` `$0.12`
- A fake transcript and an Approve / Deny card
- Pane 2: a "cognitive trace" side panel and a handoff banner
- Pane 3: full-width bottom, `INCOMING TASK ← #2 OMP`

Ship the header, the PTY, the kill button, and a status line driven by real events (idle, exit code, RSS if the daemon sends it).
Do not ship the trace tree, the dollar figure, the model name, or the approve card unless a real tool-call event exists.

## Top of this frame

- Status: `3/3 LIVE · RSS 3.8 MB · ~/SENTRA` — RSS only if measured.
- A `REWIND (Cmd+Shift+R)` + `SNAP #4` control. **Not built.** Spec it as later: snapshot list, restore. Do not draw a dead button.
- Context strip in the file is the fabric/diff/pipeline mock. Replace with the real strip from 03.

## Command bar

Same as 03, with the folder chip and `+ File` sitting left of the prompt:

- Folder chip: `~/SENTRA` ▾ (opens 09)
- `+ File` (opens the picker; dropped files use 05b)
- Prompt, then `+ SPAWN AGENT ↵`

Hint under the bar, 9.5px, **mock in the file**:
`SPAWN RUNTIME: /home/dewhush/SENTRA · DRAG & DROP FILES… · ESC TO FOCUS ACTIVE PTY`
Ship one short line: `Esc focuses the PTY · drop PDF, TXT, MD, JSON · under 10 MB`.

## Focus

One pane has the accent border and the word `FOCUSED` in its header. Keyboard: `Ctrl-Tab` cycles. `Ctrl-Shift-arrows` splits (v1 split = spawn the same preset beside the focused one, not a tiling engine).
