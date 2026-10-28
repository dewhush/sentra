# 07 · Settings

Shell frame `1271` (settings open over a 1-agent workspace).
Tab frames, each 1440×900, light and dark:

| Tab | Light | Dark |
|---|---|---|
| Shortcuts | `4009` | `7337` |
| Presets | `4139` | `7209` |
| Personas | `4292` | `7450` |
| Appearance | `4362` | `7519` |
| Models | `4462` | `7618` |

## Shell

Modal, centered, ~720px, radius 16, over a dimmed workspace.
Header: `SENTRA PREFERENCES · SETTINGS` and `✕ Close (Esc)`.
Tabs: `PRESETS` `PERSONAS` `APPEARANCE` `SHORTCUTS` `MODELS`. Active tab is filled accent.
Footer: `DISMISS` (secondary) and `SAVE CONFIG ▸` (black). `Esc` closes.
If a tab is read-only, hide Save. Do not show a save button that does nothing.

Opened from the top-bar `⚙ SETTINGS`, from 00's `Manual Settings`, and from `?` (lands on Shortcuts).

## Presets

Title: `CONFIGURED AGENTS (~/.config/sentra/presets.json)`
Sub: `Installed CLI runtimes mapped to launcher cards and spawn dispatchers`
Action: `+ New Agent Preset`

One card per preset that exists on disk:

| Name | Chip | Detail | Path |
|---|---|---|---|
| Claude Code | claude | UI/UX Designer, Design System & Tokens | /usr/local/bin/claude |
| Codex CLI | codex | Security Audit, Automated Test & Code Review | /usr/local/bin/codex |
| Oh My Pi (OMP) | omp | Fullstack Lead, Pipeline Runner | ~/.cargo/bin/omp |
| Hermes | hermes | Web Search & API Documentation Triage | ~/.local/bin/hermes |
| GNU Bash Shell | bash | Direct OS Execution & Fallback PTY | /bin/bash |

Card: tinted icon, name, handle chip, one-line role, mono path, `Configure ⚙`.
A second frame in the file lists tags (`CODING`, `REFACTOR`) and a command line. Tags are mock. Show the argv from `presets.json` or nothing.

Empty: `No presets in ~/.config/sentra/presets.json` + the New button.

## Personas

Title: `AGENT PROFILES (~/.config/sentra/profiles/)`
Sub: `Markdown files defining agent personas, system directives, and active tools`
Action: `+ New Profile (.md)`

List: filename, `ACTIVE` if it is the one bound to a live agent, size, updated time.
Selecting a row shows the markdown. Read-only preview is enough. `Open in Editor ↗` shells out.
Empty: `No profiles in ~/.config/sentra/profiles/`.

The file's sample (`ui-ux-designer.md`, 38 lines, role headings) is an example, not a bundled persona.

## Appearance

Title: `COLOR THEME`
Four swatches. The file names them Apple Light, Dark Charcoal, Midnight OLED, Tokyo Night.
Production already has Light, Dark, Cyberpunk, Sepia. **Keep the four that exist.** Do not add Tokyo Night to match a label.

Each card: name, one-line description, three color dots, `ACTIVE` on the current one.

Second block `TYPOGRAPHY SCALE & TERMINAL FONT`:
- Density: Compact 10px / Standard 11px / Spacious 13px. Ship only if a single variable drives it. Otherwise leave it out.
- Mono: Geist Mono (shipped) / JetBrains Mono / Fira Code. Only list a face that is actually loaded.

Third block: `Reduce Motion`. High-contrast focus border is already the focus ring — do not add a second toggle that sets the same thing.

## Shortcuts

Title: `KEYBOARD SHORTCUTS MATRIX`
Rows: keys, description, category.

The file lists `Cmd+…`. Ship the Linux bindings that exist, and only those:

| Keys | Does | Category |
|---|---|---|
| Ctrl-Shift-W | Kill focused agent (arm, then confirm within 3s) | Workspace |
| Ctrl-Tab | Cycle panes | Workspace |
| Ctrl-Shift-arrows | Split (spawn same preset beside focus) | Workspace |
| Ctrl-O | Quick folder switcher (09) | Global |
| Ctrl-T | Focus command bar, only on the empty-folder screen | Workspace |
| Enter | Dispatch the command bar | Input |
| ↑ / ↓ | Command history | Input |
| ? | Open this tab | Global |
| Esc | Close the topmost overlay, else focus the PTY | Global |

`Cmd-K`, `Cmd-Z` undo kill, `Cmd-D` duplicate, `Alt+1..8`, search-in-scrollback, copy-via-`sentra read`: in the file, not in the product. Do not document them until they work.
Link `sentra.dev/docs/shortcuts` only when the page exists.

## Models

Title: `PRIMARY ORCHESTRATOR ROUTER & DISPATCH`
The file shows 9router, Anthropic, OpenAI, Ollama, with latency and a model list.

This tab is **mock** unless a model router exists. Until then the panel says what is true: `Sentra does not route models. Each agent uses its own CLI.` No fake `● Connected · 18ms`. No endpoint list. No Configure button.

## Do not ship

- A tab whose only content is the design's sample copy.
- Save on a tab that cannot save.
