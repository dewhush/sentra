# Changelog

All notable changes to Sentra are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] - 2026-11-09

First public release: v0.1 Core Foundation (shipped). Covers all work on
`master` from 2026-10-26 to 2026-10-28 — the native Rust daemon, the `sentra`
CLI, the Tauri viewer, the optional web UI, CI, and the contributor docs.

### Added

- Native Rust daemon (`sentra-daemon`) that owns all agent PTYs; the UI is
  only a viewer, so agents keep running if the UI crashes or restarts.
- `sentra` CLI with the `send → wait → read` handoff triad
  (`spawn | list | send | wait | read | resize | kill | forget | presets |
  profiles | lessons | research`), all `--json`-capable.
- Multi-agent grid (1–8 panes, 1 / 2 / 3-column layouts), xterm.js rendering,
  live resize, roster with live/dead dots, preset chips, one-click spawn.
- Handoff UI: send → wait for PTY quiet → copy last output; on agent exit,
  offer to save the last output as a lesson and to respawn (explicit clicks
  only). Lessons are keyed by preset/profile and injected into the next
  spawn's first prompt.
- Presets from `~/.config/sentra/presets.json` (file wins over bundled
  defaults); first-class presets for `claude`, `codex`, `hermes`, and `omp`.
- Optional TCP listener + web UI: `SENTRA_TCP=127.0.0.1:7621 sentra serve`
  streams live xterm panes over SSE to any browser.
- FigCraft G1–G9 UI: workspaces sidebar, quick switcher (Ctrl/⌘+O), empty
  state, dark/light themes, 24px hit targets, status labels on dots, command
  history + preset autocomplete.
- Telemetry: live daemon RSS chip (2.8 MB idle, 3.3 MB with 5 idle bash
  agents; 30 MB budget) and per-pane RSS; lobe-icons SVG set; settings modal.
- Daemon hardening: `$PATH` pre-check on spawn, `forget` verb, ANSI
  sanitization in lessons, spawn/kill race fixes, SIGKILL/ESRCH handling so
  dead agents are never shown as alive.
- Harness launcher: `@mention` spawn into a 2×2 quad, flat logo/icons,
  hue-coded panes.
- CI (`.github/workflows/ci.yml`): fast `lint` job (rustfmt, clippy
  `-D warnings` on daemon + CLI, frontend bundle guard) gating the `build`
  job (zero-warning release build, workspace clippy, tests, smoke suite),
  both cached, with concurrency cancel-in-progress, read-only permissions,
  and job timeouts.
- Contributor hygiene: MIT `LICENSE`, `CONTRIBUTING.md`, `SECURITY.md`,
  `CODE_OF_CONDUCT.md`, `NOTICE`, issue templates, `CODEOWNERS`,
  `PULL_REQUEST_TEMPLATE.md`, Dependabot (cargo + GitHub Actions), and
  branch protection requiring `lint` + `build`.
- Docs: README revamp (banner, install matrix, usage, FAQ), `ROADMAP.md`
  (v0.1–v0.6), `docs/DEVELOPMENT.md` (prereqs, build, run, smoke suite, PR
  checklist, architecture), design specs, PRD, and honest architecture
  benchmarks.

### Fixed

- `sentra serve` web dist resolution from any cwd (exe-adjacent
  `~/.local/share/sentra/dist` fallback).
- UI font URLs matched on-disk casing (daemon static server is
  case-sensitive).
- rustfmt across the workspace and clippy `collapsible_if` /
  `redundant_closure` findings, which were blocking branch protection.
- `bug_report.yml` did not parse as YAML (unquoted `: ` inside a JSON
  placeholder), so the bug form was not rendering.
- `CONTRIBUTING.md` / `SECURITY.md` said the default branch was `main`;
  it is `master`.
- Removed the legacy `web/` directory (superseded by
  `crates/sentra-ui/dist`).

### Notes

- No packaged binaries in this release — install is build-from-source
  (`cargo build --release`); see [Install / run](README.md#install--run).
- The optional TCP/Web listener has no authentication by design — localhost
  or trusted networks only. See [SECURITY.md](SECURITY.md).
