# Sentra — Implementation UI/UX Audit

**Date:** 2026-10-28 · **Build:** `386fc92` + working-tree changes · **Surface:** shipped web UI (`crates/sentra-ui/dist`), served by `sentra serve` and by the Tauri shell.
**Method:** static review + live Chromium via CDP + axe-core 4.10.2 + WCAG contrast math + fault injection.
**Companion docs:** `AUDIT.md` (design-canvas audit, 2026-10-27), `audit-framework.md` (11-paradigm rubric).

> This audit is about the **running product**, not the FigCraft canvas. Where the design audit
> scored intent, this one scores what a user actually gets: DOM, CSS, JS behaviour, keyboard,
> screen reader, error and failure states.

---

## 0. TL;DR

**Score: 10 / 22 → REWORK before release.** 4 blockers, 11 high, 9 medium.

The visual language is genuinely good — the token layer, dark theme, dense terminal aesthetic and
the first-run hero are worth keeping. But the shipped shell has a **layout collapse that hides the
third pane and the command bar**, **lies about the daemon being alive after it dies**, and **fabricates
operational data** (`FABRIC`, `DIFF +142 LOC`, `PIPELINE`, router/providers). Keyboard users cannot
reach the roster, preset rows, chips or the kill control, and every modal opens without moving focus.

**Fix these 6 first (≈1 day):**

| # | Fix | Where | Effort |
|---|---|---|---|
| 1 | Constrain the app shell (`#app { flex:1; min-height:0; display:flex }`) + close the unclosed `<section>` | `style.css:248`, `index.html:55-107` | S |
| 2 | Daemon liveness: ping loop + `EventSource.onerror` + offline banner, disable spawn while down | `app.js:64-66`, `524-593` | M |
| 3 | Delete fabricated data: context strip, runtime path, socket/RSS literals, Models tab | `index.html:40,52,105,159-166` | S |
| 4 | A11y baseline: `lang`, viewport, labels, dialog roles + focus trap, 2 px focus ring, `aria-live` on status/rail | `index.html:2`, `app.js:710-720`, `style.css:243` | M |
| 5 | Fix the launcher: show it on first run, or delete it; make free text spawn or say why not | `app.js:99-147`, `604` | M |
| 6 | Reset the handoff dialog on every open; separate “Send” from “Copy output” | `app.js:649-683` | S |

---

## 1. Scope & method

| Dimension | What was done |
|---|---|
| Code review | `index.html` (206 L), `style.css` (692 L), `app.js` (918 L), `tauri.conf.json`, `src/main.rs`, daemon error strings |
| Runtime | Repo binary `target/release/sentra serve` on a private port + private `XDG_RUNTIME_DIR`; 1–3 throwaway `bash` agents; no user session touched |
| Browser | Chromium headless, CDP (`Runtime`, `Input.dispatchKeyEvent`, `Page.captureScreenshot`) |
| A11y | axe-core 4.10.2 (`wcag2a/2aa/21a/21aa/22aa` + best-practice) on launcher, workspace, 5 settings tabs, switcher, handoff, drop overlay, dark theme |
| Contrast | Relative-luminance computation for all four themes and the role badges (axe cannot resolve `color-mix`) |
| Viewports | 1440×813, 1280×720, 1024×768, 820×700, **720×480 (Tauri `minWidth`/`minHeight`)**, 390×844, 200 % zoom |
| Fault injection | `kill` the daemon while the UI is open; `kill` then reload; spawn with daemon down; drag text instead of files; output containing `401`; quoted argv |
| Keyboard | Tab-order enumeration, focus-ring measurement, modal focus containment, shortcut conflict tests |

Limitations: Chromium only (no WebKitGTK/Tauri runtime pass), no manual NVDA/Orca session, headless
viewport 813 px instead of 900. None of these change the blockers below.

Raw evidence: `/tmp/audit/probe*.txt`, `/tmp/audit/axe-*.json`, 30 screenshots in `/tmp/audit/shots/`.

---

## 2. Score — 11 paradigms

| # | Paradigm | Score | Evidence | Why not higher |
|---|---|---|---|---|
| P1 | Visibility of system status | **1** | Roster dots + labels, pane telemetry, exit banner | Daemon death keeps 5 green “LIVE” dots forever; `FABRIC/DIFF/PIPELINE` never update; no `aria-live` |
| P2 | Match system ↔ real world | **1** | Preset icons, real argv, terminal vocabulary | `FABRIC`, `DIFF`, `PIPELINE`, “arbitrage”, “harness/persona/profile/folder/workspace”, `⌘O` on Linux, EN/ID mix |
| P3 | User control & freedom | **1** | Two-step kill, Esc closes overlays, restart | No pane close/dismiss, no undo, no focus trap, no cancel spawn, drop overlay hijacks any drag |
| P4 | Consistency & standards | **1** | Real token layer, 4 themes, consistent radii | Three theme storage keys desync; two handoff surfaces; presets repeated 4×; negative `⌘`/Ctrl mix |
| P5 | Error prevention | **1** | Kill arm, file-type rejection message | Empty Send enabled, no inline validation, quoted argv silently mangled, free text silently no-ops |
| P6 | Recognition rather than recall | **1** | Icons, `kbd` hints, shortcuts sheet | Kill is an icon-only `<span>`, `◐` unnamed, no tooltip on roster rows, no labels for two selects |
| P7 | Flexibility & efficiency | **1** | Cmd history, `@` autocomplete, switcher, shortcuts | No terminal search/copy, no maximize, no bulk actions, shortcuts dead inside terminal, no resize refit |
| P8 | Aesthetic & minimalist design | **1** | Strong type, spacing, hierarchy; hero is excellent | Hero unreachable; fake chrome; 3 competing spawn surfaces; 8–10.5 px microcopy; dead 45 % of empty state |
| P9 | Error recovery | **1** | Pane error banner, dead strip, retry | Any output containing “401” raises “API key invalid”; banner re-raises; no reconnection; rail auto-hides in 6 s |
| P10 | Help & documentation | **1** | Shortcuts matrix, hints, README | No docs link, no first-run guidance, placeholders used as labels, Settings is read-only |
| P11 | Accessibility WCAG 2.2 AA | **0** | — | Language, labels, keyboard, dialogs, contrast, live regions, target size, reflow — all fail (see §6) |
| | **Total** | **10 / 22** | | Previous design audit: 7/22. States/errors improved; structural + a11y debt remains |

Band (same rubric as `AUDIT.md`): ≥18 ship · 13–17 iterate · **≤12 rework** → **REWORK**.

---

## 3. Findings

### P0 — blockers

#### P0-1 · The app shell does not fit the window
**Observed (1440×813, three agents):** `#app` is 1612 px tall (2.0× viewport), the grid is 1451 px,
the top bar is at `y = -536` (scrolled out of view) and the command bar at `y = 965` (below the
fold). Only 2 of 3 panes are visible; the third is entirely off-screen. Empty state: `#app` is only
486 px and the command bar starts at `y = 451`, leaving 251 px of dead space beneath it.
**720×480 (the Tauri minimum):** document height 1962 px, top bar `y = -748`, command bar `y = 1067`.
**Root cause:** `#main { flex:1 }` (`style.css:248`) is a flex child of `#app`, but `#app` has **no
CSS rule at all** — it is `display:block`, height auto. The xterm FitAddon grows rows to fill an
unbounded container, which grows the grid, which grows the page. `index.html` also never closes
`<section id="main">` (3 `<section>` open, 2 close), so the command bar is parsed inside `#main`.
**Proof of fix:** injecting `#app { flex:1; min-height:0; display:flex }` makes the app 737 px,
grid 565 px, command bar 641 px, `scrollHeight == innerHeight` (screenshot `17-layout-fix-css.png`).

```css
/* style.css — add near #main */
#app { flex: 1; min-height: 0; display: flex; }
```

```html
<!-- index.html:107 — close the section before </main> -->
 </section>
</main>
```

Also missing: no `window.addEventListener('resize', refitAll)` — resizing the window never refits
the terminals or tells the daemon the new size (`app.js:346-351` is only called on open/close).

#### P0-2 · Daemon death is invisible; the UI keeps claiming everything is live
**Observed (daemon killed while 1 agent open):** top bar still reads `1/1 LIVE`, all five dots stay
`dot live`, roster footer still says `DAEMON: http://127.0.0.1:7799`. Spawning then throws
`TypeError: Failed to fetch` in the console — **no UI message at all** (rail stays hidden).
There is no reconnect, no offline state, no retry, and no `EventSource.onerror` handler
(`app.js:64-66`). In Tauri, the watch thread just exits silently (`src/main.rs`), so the webview
never learns.
**Why it matters:** the product promise is “UI crashes, agents live”; the UI cannot tell the
difference between “healthy daemon” and “daemon gone”.
**Fix:** 2–3 s `ping` loop → `online` state; `EventSource.onerror`/Tauri disconnect event → offline;
banner with Retry; disable Spawn and buttons while offline; `aria-live="assertive"` on the banner.

#### P0-3 · Fabricated operational data presented as live telemetry
| Where | What it claims | Reality |
|---|---|---|
| `index.html:52` | `FABRIC: /dev/shm (128K ring · 0.08ms) · DIFF: +142 LOC · PIPELINE: @hermes ──▸ @omp ──▸ @claude` | Static strings; never updated; ring is 256 KiB per README; no diff/pipeline feature exists |
| `index.html:40` | `SOCKET /RUN/USER/1000/SENTRA.SOCK · 0 AGENTS · RSS 1.8 MB` | Literal; wrong socket on this machine until the first `list` replaces it |
| `index.html:105` | `SPAWN RUNTIME: /home/dewhush/SENTRA` | Literal developer path; wrong on every other machine |
| `index.html:159-166` | Active router `gemini-3.8-flash-high`; providers “READY/CONNECTED”; `~/.sentra/credentials` | Entire Models tab is invented UI; no code reads or writes it |
| `app.js:266-280` | `24 tok · $0.000`, `4MB` | Tokens = `chars/4`, cost = tokens × $3/M for every model; presented without “est.” except a tooltip |

For a security/research workflow this is worse than an empty state: it teaches the user to distrust
the chrome, and it contradicts PRD non-goals (“no accounts, no telemetry, no themes”).
**Fix:** delete or wire each value to the daemon (`list` already returns RSS, counts, URL, socket).
Label estimates `~` and put the formula in the tooltip. Remove the Models tab until it is real.

#### P0-4 · Core actions are mouse-only and unlabelled (accessibility blocker)
- **19** elements are clickable `<div>/<span>` with `onclick` and **no** `role`/`tabindex`:
  roster rows, workspace headers, preset rows, command-bar chips, theme cards, switcher rows,
  pane titles, kill control (`app.js:189-203, 229-233, 318-319, 324-339, 475-489, 738-740, 877-878`).
- Only **8 tabbables** in the workspace; the roster and every preset chip are skipped. Tab from the
  Settings button lands on `#context-strip` — a non-interactive scroll container — before any pane.
- **Kill is a bare `<span>` 18×17 px** (`style.css:348`, `app.js:296`), while WCAG 2.5.8 needs 24×24.
- **No input has a label**: `#cmd`, `#es-input`, `#hinput`, `#ctx-repo`, `#ctx-brief`, `#sw-input`,
  `#ho-msg`, `#ho-target`, `#drop-target-agent` rely on placeholders only.
- **All four overlays** (`#settings`, `#handoff`, `#switcher`, `#drop-overlay`) have no
  `role="dialog"`, no `aria-modal`, no label, and **no focus management**. Opening Settings leaves
  focus on the xterm textarea; Tab escapes the modal after 15 presses and reaches the page behind it.
- Terminal output is a canvas with no accessible text (`screenReaderMode` off): a screen-reader user
  gets an empty region.
- **No `aria-live` anywhere** — spawn errors, exit notices, handoff progress and daemon status are silent.
**Fix:** convert clickable divs to `<button>` (or `role="button" tabindex="0"` + Enter/Space);
label every control; `<dialog>`-style semantics + focus trap + restore; 2 px accent focus ring;
`aria-live="polite"` for rail/handoff, `assertive` for connectivity; xterm `screenReaderMode: true`
or a parallel `role="log"` text mirror.

---

### P1 — high

#### P1-1 · The best screen is unreachable; free text silently no-ops
`main()` hides `#harness` and shows `#app` **unconditionally** as soon as the first `list` returns
(`app.js:604`), so the hero (screenshot `20-launcher-forced.png`) only flashes for a moment, even
with zero agents. Users land on the in-app empty state instead.
The launcher advertises `free text = raw argv` and placeholder `… or bash --norc`, but
`parseHarness()` only matches `@handles` (`app.js:88-98`); typing `bash --norc` + Enter does
**nothing** — harness stays visible, no error (probe 8). The in-app empty state *does* support raw
argv, so the two inputs contradict each other.
**Fix:** choose one entry model. If the hero stays: show it when `agents.length === 0` and no
pending spawn, and fall back to `spawnCmd()` for non-`@` input. Otherwise delete `#harness` and put
the hero copy above the empty-state card.

#### P1-2 · “Project context” does not provide context
The card promises “AGENTS INHERIT THIS” and “drop files … inject context”, but:
- repo/brief are prepended to the first parsed agent as the literal string
  `repo:github.com/dewhush/sentra context:fix the layout` and **typed into the shell** (`app.js:142-153`).
  Observed: `bash: repo:github.com/dewhush/sentra: No such file or directory`.
- files selected in `#ctx-drop` only change the dropzone label (`app.js:120-135`); their paths are
  never sent anywhere.
- with more than one `@handle`, only the first agent receives the context.
**Fix:** either remove the card, or: create a workspace record, `cd` new agents into the repo, and
write the brief to a file the agent is told to read; send attachment paths as a single quoted argument.

#### P1-3 · Handoff dialog corrupts itself after one successful handoff
After a successful send→wait, `#ho-send` is permanently re-labelled **“COPY LAST OUTPUT”** and its
`onclick` is replaced (`app.js:671-682`). Reopening the dialog keeps that button, so the next handoff
has no Send control (verified: `HANDOFF REOPEN {"sendLabel":"copy last output"}`). “Cancel” remains,
and `openHandoff` never restores the original handler.
Also: Send is enabled with an empty message (silent no-op, `app.js:651-653`); when there is no other
live agent the select is empty but Send stays enabled; the target `<select>` and textarea are unlabelled.
**Fix:** separate buttons (Send / Copy result), reset `textContent`, `disabled`, `onclick`, and
status on every open; validate target + non-empty message.

#### P1-4 · Drag & drop: hijacks text drags, “Inject All” is dead, paths are unquoted
- Any `dragenter` — including dragging selected text inside the terminal — opens a full-screen
  modal overlay (`app.js:822-826`). Verified with a `text/plain` `DataTransfer`.
- The static option **“Inject All Agents”** is removed by `showDropOverlay()` (`app.js:812-815`) and
  the drop handler never handles `value="all"`; it would send to agent `NaN` (`app.js:843-846`).
- Paths are joined with spaces and sent raw (`app.js:846`): a filename with a space or shell
  metacharacter becomes multiple words/commands.
- No keyboard alternative for injecting files (WCAG 2.5.7 dragging movements).
**Fix:** gate on `e.dataTransfer.types.includes('Files')`; shell-quote paths; implement “all” as a
loop; add a visible Browse/Inject button and a Cancel button; focus the dialog.

#### P1-5 · Error handling is heuristic and mostly invisible
- The auth banner fires on `/401|unauthorized|authentication_error|invalid_api_key/` anywhere in
  **any** output (`app.js:530-544`). `echo "line 401 of the report"` produced
  “Auth Error (HTTP 401): API key invalid or missing” (screenshot `18-auth-false-positive.png`).
- That banner is not `role="alert"`, has no focus, and can re-appear on the next chunk after dismiss.
- Spawn failures appear only in a 6 s rail toast (`app.js:79-85`) with mixed copy:
  `spawn gagal: preset "…" not found` — Indonesian verb, English payload.
- `main().catch()` replaces the whole body with an error dead-end (`app.js:916-918`), no retry.
- Daemon loss produces no message at all (P0-2).
**Fix:** match on structured daemon/agent errors, not terminal text; `role="alert"` + sticky until
dismissed; one locale; add Retry/Details; keep the last error in the status area.

#### P1-6 · Theme system: persistence broken, Reduce Motion inert, alt themes fail contrast
- Three storage keys disagree: `sentra-theme` (`app.js:178`), `sentra-theme-variant` (`730`),
  `sentra-dark` (`731`). Choosing Cyberpunk stores variant `cyberpunk` but leaves
  `sentra-theme = "light"`; after reload `html` has **no class** (light) while
  `sentra-theme-variant` says `cyberpunk` — so the Appearance tab highlights Cyberpunk while the UI
  is light (verified `AFTER RELOAD {"cls":"","variant":"cyberpunk","theme":"light"}`).
- **“Reduce Motion” does nothing**: no JS listener, no stored key, zero
  `@media (prefers-reduced-motion)` rules (`index.html:137`, `app.js` has no reference).
- Cyberpunk/sepia text tones fail: `--faint` **2.00:1** in both, sepia `--muted` 3.48, sepia `--acc`
  4.10 (small text), sepia `--warn` 3.78 (see Appendix A).
- Themes contradict PRD §4 (“themes” is an explicit non-goal); the topbar toggle is an unlabelled
  `◐` glyph with only a `title` (`index.html:48`).
**Fix:** one state object + one key (`sentra-theme`), apply before first paint (inline script), wire
the checkbox to a `reduce-motion` class + CSS media query, and fix the palette values below.

#### P1-7 · Contrast: role badges and secondary text fail AA
Measured on the light panel (12 % tint of the brand colour):

| Badge | Ratio | AA 4.5:1 |
|---|---|---|
| `@omp` `#5AD8E6` | **1.58** | fail |
| `@bash` `#4EAA25` | **2.63** | fail |
| `@claude` `#D97757` | **2.77** | fail |
| `@codex` `#10A37F` | **2.81** | fail |
| `@hermes` `#F04438` | **3.22** | fail |

They are 8.5 px uppercase (`style.css:291-299`), so 4.5:1 applies. Dark theme is much better but
`hermes` still lands at 4.25 (marginal fail); the rest pass.
Also failing: `.flow-status.pending` `--warn` 3.19 on panel; all cyber/sepia values above.
**Fix:** use dark text on the tint (e.g. claude `#A03D24` 6.37, omp `#0B6E7A` 5.76, hermes `#B42318`
6.36, codex `#067647` 5.51, bash `#3B6E1E` 5.92) and keep the brand colour as a 3 px dot/border.
Raise cyber `--faint` to `#8A8AA3` (5.95) and sepia `--faint` to `#6E5E49` (5.53), sepia `--acc` to
`#A34715` (4.98).

#### P1-8 · Pane lifecycle: cannot close a pane, dead panes accumulate, exits are under-announced
`closePane()` exists but is only called by the restart button (`app.js:368-374, 561`). There is no
close/dismiss action, so killed or crashed agents leave a permanent dead banner in the grid; the
roster keeps them because `state.panes` still has the id. No desktop notification or persistent log
on exit — only a 6 s rail toast and the auto-learn strip (which is overwritten by the next exit).
On restart, only the first 8 live agents get panes (`app.js:607`); 9+ are silently “listed only”,
with no badge explaining the cap.
**Fix:** add “Close pane” (and “Keep in roster”), collapse dead panes to a one-line strip, add an
exit notification + activity log, and mark list-only agents in the roster.

#### P1-9 · Documented shortcuts don’t work where the user is
- `?` and `Ctrl+O` are dead when the terminal is focused — xterm consumes them. Worse, `?` is typed
  into the shell (`bash: ?: command not found`, screenshot `21-focus-ring.png`).
- `Esc to focus active PTY` in the command-bar hint (`index.html:105`) is false: Esc in `#cmd` leaves
  focus in `#cmd` (verified).
- `⌘O` is shown on Linux (`index.html:62,145`); `Ctrl+Tab` is intercepted by browsers in web mode.
- `Ctrl-Shift-↑/↓/←/→` all map to the same “spawn another pane” action; no direction handling.
**Fix:** use capture-phase handlers or xterm `attachCustomKeyEventHandler`; pick platform labels
(`Ctrl+O` on Linux); implement Esc-to-terminal or delete the hint; make split respect direction.

#### P1-10 · Spawn grammar is ambiguous and silently destructive
- `bash -c "echo hi"` becomes argv `["bash","-c","\"echo","hi\""]` — quotes are passed literally,
  so the command fails (verified).
- Empty submit returns `{ok:false,err:'empty'}` but the UI shows nothing (`app.js:387-397`).
- `@` autocomplete only covers the five presets, not profiles, and only when the value starts with `@`.
- The empty-state placeholder `or: bash htop` implies “run command”, but it is argv (`bash htop`).
**Fix:** either a real shell-word parser (quotes/escapes) or a clear “argv only, no quotes” rule +
inline error; include profiles in autocomplete; disable Spawn on empty.

#### P1-11 · Settings looks editable, is read-only or invented
- “CONFIGURED AGENTS (~/.config/sentra/presets.json)” lists rows with only **SPAWN** — no add,
  edit, remove, or open-file (`app.js:762-786`).
- PERSONAS duplicates the same list (including `@codex-sec · Helper of OMP`, a copy-paste bug in
  `profiles.rs:22`) and cannot create a persona (`app.js:742-760`).
- MODELS is 100 % static/fabricated (P0-3).
- SHORTCUTS is static and already wrong (P1-9).
- “DONE” is the only exit — no Cancel semantics, no dirty state.
**Fix:** rename to “Agents” and make rows read-only with an “Edit file” link, or implement editing;
delete PERSONAS/MODELS until real; generate the shortcuts table from a single keymap.

---

### P2 — medium / polish

| ID | Finding | Evidence | Fix |
|---|---|---|---|
| P2-1 | **Four competing spawn surfaces** (hero input, sidebar presets, empty-state form, command bar) with different grammars | screenshots 01/13/20 | one primary spawn field; presets as chips next to it |
| P2-2 | **Terminology and language drift**: agent / harness / preset / profile / persona / workspace / folder; EN + ID (`spawn gagal`, `lesson disimpan`) | `app.js:111,401,511` | one glossary; pick one locale or i18n |
| P2-3 | **Micro-typography**: 12 size/weight/family combinations below 11 px, smallest 8 px, all caps + letter-spacing on 8.5–10 px | type census (Appendix B) | floor at 11 px for body/chips, 10 px only for `kbd` |
| P2-4 | **Ambiguous glyphs**: `◐` theme, `✕` kill, `+` preset prefix, `▸` rail, emoji 📁 | `index.html:48`, `app.js:296` | real icons + `aria-label` + tooltips |
| P2-5 | **Duplicate daemon URL** three times (topbar pill, roster footer, empty-state foot) and trailing `· /` when no cwd | screenshots 01/13 | one status location; drop the trailing separator |
| P2-6 | **Missing power features** for the PRD persona: terminal search, copy output (only in handoff), font size, maximize/zoom, bulk kill, rename | PRD §5 | add search addon, per-pane menu, `Ctrl+=/-`, maximize |
| P2-7 | **Chrome metadata**: no favicon (404 in console), static `<title>Sentra</title>`, no `color-scheme`, theme applied in JS after first paint (flash risk) | console log | favicon, `Sentra — 3 agents`, `<meta name="color-scheme">`, pre-paint theme |
| P2-8 | **Jank under streaming output**: `seq 1 20000` → 10 long tasks, 1.44 s total, max frame 417 ms, p95 33 ms | CDP perf run | batch telemetry/rail updates (rAF), avoid innerHTML per chunk, cap telemetry to 1 Hz |
| P2-9 | **Dead code/CSS**: legacy `#handoff` + `#handrail-card` coexist with the new flow; `.h-daemon-footer` literals; unused Archivo font | `style.css:442-464,517-555` | delete or wire; subset fonts |

---

## 4. Flow walkthroughs (observed)

| Flow | Expected | Observed | Verdict |
|---|---|---|---|
| First launch, 0 agents | Hero launcher (“Many terminals, one window.”) | Hero hidden after first `list`; app empty state with command bar floating mid-page | **fail** |
| Spawn from launcher, free text `bash --norc` | Spawn bash | Nothing; no error; harness stays | **fail** |
| Spawn from launcher `@bash echo TASK` | Spawn + send task | 2 `@handles` spawn 2 agents; task typed into shell | partial |
| Spawn 3 agents | All 3 visible (PRD S1) | 2 visible, 3rd below the fold; command bar off-screen | **fail** |
| Kill agent (button) | Arm → kill; pane marked dead | Works (arm 3 s), but the target is 18×17 px and mouse-only | partial |
| Kill via `Ctrl-Shift-W` | Global | Window handler exists (`app.js:440`); not verified inside xterm (xterm may consume it) | partial |
| Handoff A→B (right-click) | Send → wait → copy output | Works once; then Send button is permanently replaced by Copy | **fail** |
| Daemon dies | Offline state, disable actions | `1/1 LIVE`, green dots, unhandled `TypeError` on spawn | **fail** |
| Output contains “401” | No banner | “Auth Error (HTTP 401)” banner | **fail** |
| Drag a text selection | No overlay | Full-screen “Drop Files” overlay | **fail** |
| Drag files, choose “Inject All Agents” | Send to all | Option removed; handler sends to `NaN` | **fail** |
| Switch theme to Cyberpunk, reload | Cyberpunk persists | Reverts to light; Appearance still shows Cyberpunk | **fail** |
| Toggle “Reduce Motion” | Animations stop | Nothing happens; not stored | **fail** |
| Keyboard-only: open handoff | Reachable | Only via right-click; no key path | **fail** |
| Resize window | Terminals refit | No resize listener; daemon keeps old PTY size | **fail** |
| Spawn failure | Readable, persistent error | 6 s rail toast, mixed language, no ARIA | partial |
| Settings → edit a preset | Edit / save | Read-only rows, no editor | **fail** |

---

## 5. What is working (keep it)

- **Token architecture**: canonical swatches + spacing/radius scales + semantic vars per theme
  (`style.css:9-103`) — the right foundation, unlike the design canvas.
- **Light accent fixed**: `--acc: #0D62D9` → 5.4–5.58:1 (the design audit’s worst contrast finding).
- **24 px minimum on `<button>`** (`style.css:235`) — correct instinct; just not applied to spans.
- **Roster dots** have `role="img"` + `aria-label` (`app.js:193`) — the right pattern, extend it.
- **Two-step kill** with a 3 s arm window and a visible `KILL?` state; keyboard arm too.
- **Daemon-owned panes really work**: killing the UI and reloading restores scrollback from the ring
  buffer; the core value proposition is intact.
- **Handoff send→wait→read** performs end-to-end (status `done — idled`, output ready).
- **Command history, `@` autocomplete, `Ctrl+O` switcher, `?` cheat sheet** exist and are fast.
- **Empty, error, dead, restart** states exist as components — the design audit’s “no states” finding
  is now addressed in principle.
- **Dark theme** is coherent (all semantic pairs pass AA; only the tiny `hermes` role badge is marginal
  at 4.25) and easy on a terminal-heavy workflow.
- **Self-hosted fonts**, no CDN, no external calls at runtime.

---

## 6. WCAG 2.2 AA checklist

| SC | Status | Evidence |
|---|---|---|
| 1.3.1 Info & relationships | **fail** | Unclosed `<section>`; clickable divs; `<table>` without `<th>`; dialog content unassociated |
| 1.4.3 Contrast (minimum) | **fail** | Role badges 1.58–3.22; cyber/sepia `--faint` 2.00; sepia acc 4.10; `--warn` 3.19 |
| 1.4.4 Resize text (200 %) | **fail** | Effective 720×406 window; layout breaks (720×480 already broken) |
| 1.4.10 Reflow (320 px) | **fail** | 390 px viewport → `scrollWidth` 439; 720×480 → 1962 px tall |
| 1.4.11 Non-text contrast | **fail** | Focus ring = `rgba(acc,.08)` ≈ 1.1:1 on white; 7 px status dots |
| 2.1.1 Keyboard | **fail** | 19 clickable non-focusable elements; kill span; handoff mouse-only |
| 2.4.1 Bypass blocks | **fail** | No skip link; 288 px sidebar before content |
| 2.4.3 Focus order | **fail** | Modal opens without focus; context strip is a stop; focus stays behind overlays |
| 2.4.7 Focus visible | **partial** | Inputs have accent border; buttons get only an 8 % shadow (`style.css:243`) |
| 2.4.11 Focus not obscured | **fail** | Scrolled shell hides the focused region; modals cover content |
| 2.5.7 Dragging movements | **fail** | File injection is drag-only; no button alternative |
| 2.5.8 Target size (24×24) | **fail** | Kill 18×17; daemon links 13–14 px tall |
| 2.2.1 Timing | **partial** | Rail errors auto-hide after 6 s; kill arm 3 s |
| 3.1.1 Language of page | **fail** | `<html>` has no `lang` |
| 3.2.2 On input | pass | No unexpected context changes |
| 3.3.2 Labels or instructions | **fail** | 9 of 10 inputs/selects rely on placeholders; the only native label is “Reduce Motion” |
| 3.3.3 Error suggestion | **partial** | “preset not found” is clear; auth banner is wrong |
| 4.1.2 Name, role, value | **fail** | Dialogs, tabs, list rows, theme cards, kill have no roles/names |
| 4.1.3 Status messages | **fail** | 0 `aria-live`/`role="status"`/`role="alert"` in the DOM |

axe-core summary: `html-has-lang` (serious), `scrollable-region-focusable` (serious),
`region` (23 nodes on Settings), `landmark-complementary-is-top-level`, `page-has-heading-one`,
`label`, `select-name`, `color-contrast` (dark). The canvas terminal is invisible to axe — the
biggest a11y gap is not machine-detectable.

---

## 7. Remediation plan

### Phase 0 — release blockers (≈1 day)
1. `#app` flex rule + close `</section>`; add `resize` → `refitAll()`; verify at 1440×900 and 720×480.
2. Daemon liveness: `ping` poll, SSE `onerror`, Tauri disconnect event, offline banner, disable spawn.
3. Remove fabricated strings; Models tab: delete or mark “Not configured”; wire RSS/agents/socket from `list`.
4. A11y baseline: `lang`, viewport meta, labels, `<button>` for rows/chips/kill, dialog semantics +
   focus trap/restore, 2 px focus ring, `aria-live`, xterm screen-reader mode.
5. Handoff reset; validate message/target; separate Copy button.
6. Launcher decision: show on first run + support free text, or delete the hero and keep one spawn UI.

### Phase 1 — high (≈3–4 days)
7. Context card: real workspace/`cd`, brief file, attachments as quoted args.
8. Drop overlay: files-only, “all” handler, shell quoting, Browse/Cancel, focus.
9. Error handling: structured errors, sticky `role="alert"`, one locale, Retry.
10. Theme state: single key, pre-paint apply, Reduce Motion implementation, palette fixes.
11. Pane lifecycle: close/dismiss, collapse dead, exit notification, list-only badge.
12. Shortcuts: capture phase / xterm key handler, platform labels, real split direction, Esc-to-PTY.
13. Spawn parser + validation + profile autocomplete.
14. Settings: read-only truth or real editing; regenerate shortcuts from a keymap.

### Phase 2 — polish (≈2–3 days)
15. Type scale (≥11 px), dedupe spawn surfaces, terminology pass.
16. Icons/tooltips, status consolidation, metadata (favicon/title/color-scheme).
17. Perf: batch telemetry/rail (rAF, 1 Hz), avoid per-chunk `innerHTML`, virtualize roster if >30.
18. Terminal power features: search, copy, font size, maximize, bulk kill.
19. CI: Playwright + axe smoke at 1440×900 / 720×480 / 390, keyboard-only script, daemon-kill test.

---

## Appendix A — contrast (measured)

### Light semantic tokens (on `#FFFFFF` / `#FBFBFD`)

| Token | Hex | Panel | Page | Verdict |
|---|---|---|---|---|
| ink | `#1D1D1F` | 16.83 | 16.28 | AA |
| text2 | `#59595E` | 6.96 | 6.74 | AA |
| muted | `#6E6E73` | 5.07 | 4.91 | AA |
| faint | `#5E6470` | 5.94 | 5.75 | AA |
| acc | `#0D62D9` | 5.58 | 5.40 | AA |
| good | `#027A48` | 5.41 | 5.24 | AA |
| err | `#C02626` | 5.92 | 5.73 | AA |
| **warn** | `#D97706` | **3.19** | 3.08 | **fail** (small text) |

Dark: all semantic pairs pass (acc 4.84, muted 5.35, faint 6.92, err 6.46, warn 9.70).
Cyberpunk: `--faint #44445A` **2.00** fail; everything else passes.
Sepia: `--faint #B5A48E` **2.00**; `--muted #8C7860` **3.48**; `--acc #B5531D` **4.10**;
`--info-t #9C5B28` **4.39**; `--warn #B45F06` **3.78** → all fail for small text.

### Role badges (light, 12 % tint)

`omp 1.58 · bash 2.63 · claude 2.77 · codex 2.81 · hermes 3.22` → all fail 4.5:1.

---

## Appendix B — measurements

| Measurement | Value |
|---|---|
| `#app` height vs viewport (3 agents) | 1612 px vs 813 (1.98×); scrollHeight 1688 |
| Grid height (3 panes) | 1451 px; pane 3 off-screen |
| Empty state | app 486 px, command bar `y=451`, 251 px dead space beneath |
| Min window 720×480 | scrollHeight 1962, topbar `y=-748`, cmdbar `y=1067` |
| 390×844 | scrollHeight 2591, scrollWidth 439 (horizontal overflow) |
| With fix CSS | app 737, main 737, grid 565, cmdbar 641, scrollHeight 813 |
| Tabbables / clickable divs | 8 / 19 |
| Labelled inputs | 1 of 10 controls has a native label (Reduce Motion); 0 of 9 text/select fields |
| Live regions | 0 |
| Kill target | 18 × 17 px |
| Type combinations below 11 px | 12 size/weight/family combinations; min 8 px |
| Streaming perf (`seq 1 20000`) | 10 long tasks, 1437 ms total, max frame 417 ms, p95 33 ms, heap 13 MB |
| axe violations | 8 distinct rules across states; `html-has-lang` and `scrollable-region-focusable` serious |

---

## Appendix C — evidence index (local, not committed)

- `/tmp/audit/shots/01…30-*.png` — launcher, workspace light/dark, settings tabs, switcher, handoff,
  drop overlay, cyberpunk/sepia, reload, spawn error, false auth, daemon-dead, min window, mobile,
  focus ring, layout-fix proof.
- `/tmp/audit/probe1…9.txt` — raw DOM/a11y/geometry probes.
- `/tmp/audit/axe-*.json` — full axe results.
- `/tmp/opencode/cdp.mjs`, `probe*.mjs`, `contrast.mjs` — reproducible harness.

_Test agents and the private daemon on :7799 were created and killed during the audit; the user’s
session on :7621 was never touched._
