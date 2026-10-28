# Components, states, errors

Shared by every screen. Frames: Topbar `4005`, Sidebar `4007`, Agent Pane `3998`, states catalog `3817`, errors `3903`.

## Top bar

48px, white, 1px bottom border.
Left: logo 22px, `SENTRA` in Archivo/mono 12px tracking .18em, optional serif tagline.
Right: one status cluster, then `⚙ SETTINGS`.
Status is text, not a pill repeated three times. Contents: live count, cwd. Daemon URL belongs in the sidebar foot, once.

## Sidebar

288px, max 34vw. Under 900px: 56px rail, icons only, labels `display: none`, footer becomes `+`.

```
WORKSPACES                          3     +  ⟳  ⚙
▾ LOCAL
  ▾ sentra                    ACTIVE · 3
    ~/SENTRA
    crates/sentra-ui               ● live
      [icon] omp          now
      [icon] claude-code  now
      [icon] codex        8m
    crates/sentra-daemon        1 agent
▾ VPS SYNC
  ▸ bug-bounty             synced · 2
+ Attach Directory…            Ctrl-O
● <real socket> · <rss if known>
```

Row hover: ink, not a new color. Selected workspace: accent-soft fill.
Do not render `no agents - spawn below` as a fake row. The empty state is screen 10.

## Agent pane

White card, radius 14, 1px border, clip overflow.

```
● [icon] CLAUDE                 bash --norc          ✕
─────────────────────────────────────────────────────
<pty>
─────────────────────────────────────────────────────
exited banner, only when dead
```

- Focused: border becomes accent.
- `✕` hover: error color. Armed (kill chord pressed once): filled error, label `KILL?`, 3s, then reverts.
- Dead: red bar `agent <name> exited (code N)` + `RESTART ⟳`.
- Telemetry chips (tokens, RSS, $) render only when a real value arrives. No `0 tok · $0.000` placeholder.

Pane states from the catalog:

| State | Shows |
|---|---|
| Idle | PTY at its prompt. Header dot neutral-live. |
| Streaming | dot accent, PTY tail moving. No fake "PID 4921" chip. |
| Crashed | exit code, last stderr lines, Restart. |
| Pending | spawned, no pid yet. Header reads `spawning`. |

## Command bar

See 03. One field, one button, one grammar (table in 04).

## Buttons (catalog)

Primary: accent fill, white label, radius 8, height 36–38. Hover brightens. Active darkens. Disabled: 40% opacity, no pointer. Loading: spinner + `Starting…`, button disabled.
Kill: ghost, turns error on hover, filled error when armed.
Secondary: white, 1px border, ink label.

## Inputs

Default: 1px border. Focus: accent border + 3px accent-soft ring. Error: error border, message under the field, not only a color. Disabled: `Locked during run` only while a spawn is in flight.

## Preset chip

Pill. Default border. Hover accent. Selected (if multi-select ever exists): check + accent fill. Disabled: muted, no click.

## Drop zone

Default: dashed border, `Drag folder here / or click to browse`.
Drag-over: accent border, `Drop to attach`, types listed.
Scanning: spinner, `N files indexed`.
Rejected: error border, `.exe unsupported` plus the filename.

## Handoff

Right-click a sidebar row, or the handoff card.
Needs a target agent and a non-empty message. Send stays disabled until both exist.
Flow: `send → wait → read`. Status text is the real result (`waiting`, `idle`, `wait failed: …`).
`COPY OUTPUT` appears after a successful wait, copies the last line.

## Kill confirm

The catalog draws a dialog: `Kill agent #2 (omp)?` / `Active background compilation will be stopped.` / `Cancel` / `✕ Kill`, then a toast `Agent #2 killed. Undo`.
Production uses a 3s arm on the same chord instead of a dialog. Keep the arm. Do not also build the dialog. Undo-kill is not built — do not promise it in the toast.

## Error scenarios

Three, from frame `3903`. Each names the trigger, the message, and the recovery. No silent failure.

**01 · Auth**
Trigger: a CLI rejects credentials.
Message: `HTTP 401` plus the CLI's own error (`invalid_api_key`).
Recovery: `Re-verify`, `Import from $<ENV>`, link to that vendor's console.
Do not invent an API-key field in Settings unless screen 07 Models is real.

**02 · Bad file**
Trigger: drop of a type outside PDF/TXT/MD/JSON, or a file over 10 MB.
Message: `2 files rejected` and each name + reason (`release_v1.tar.gz · 42MB`, `daemon.exe · forbidden`).
Recovery: `Attach supported files only`, `Clear rejected`.
Note under it: binaries and archives are not indexed.

**03 · Crash**
Trigger: child exits non-zero, including 137.
Message: `PROCESS CRASHED · EXIT CODE 137` and the last stderr lines.
Recovery: `Respawn`, `Export stderr`.
Say that other panes are untouched. Do not claim a checkpoint was written unless `~/.sentra/ckpt` was actually written.

## Boot error

Daemon unreachable. Replaces the app, not a toast:
`Sentra can't reach the daemon` / `start it with sentra serve, then reload` / the error string.
No green dot anywhere on this screen.

## Focus

Every button and field has a visible ring (3px accent-soft). Pane focus is the accent border, plus the PTY cursor. No `⌘1` badges until those shortcuts exist.

## Mock, never live

Fabric, diff, pipeline, arbitrage, "saved $", cognitive trace, thought tree, approve/deny tool cards, rewind/snapshots, model router, per-pane dollar cost, `0.08ms ring`.
They live in the FigCraft file as storytelling. A spec that lists them is listing what not to build.
