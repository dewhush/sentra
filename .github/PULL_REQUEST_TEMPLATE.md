## What & why

<!-- One line. Behavior that changes, and why. Not vibes, not a refactor diary. -->

## Design rule

- [ ] The daemon still owns all agent PTYs; the UI holds no agent state.

## Hard cuts

- [ ] My change does not add mobile / SSH-remote / git-worktrees / browser-embed / GitHub-integration / marketplace / kanban / telemetry / theming / async runtime.

## Verification (matches CI)

- [ ] `cargo fmt --all -- --check` is clean
- [ ] `cargo clippy --all-targets -- -D warnings` is clean
- [ ] `bash scripts/smoke.sh` exits 0
- [ ] `cargo build --release` emits zero warnings
- [ ] New dependencies: none added, or justified below

## Design fidelity

<!-- UI change? Name the design/NN-*.md frame it matches. Otherwise: n/a. -->

## Evidence

<!-- UI change? Screenshot or terminal output. Otherwise: n/a. -->

## Breaking change / migration

- [ ] No breaking change to the CLI, protocol, or `presets.json` — or the migration path is described here:
