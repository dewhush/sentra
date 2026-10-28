# Contributing to Sentra

Thanks for your interest in Sentra — many AI-agent terminals, one window, agents
handing work to each other.

## The one design rule

**The daemon owns all agent PTYs.** The GUI is a viewer. If the UI crashes or
restarts, agents keep running. Every change must respect this: no agent state in
the UI, no PTYs outside `sentra-daemon`.

## Hard cuts (rejected scope — don't propose them)

Mobile, pairing, relay servers (beyond `SENTRA_TCP`), SSH/remotes, git
worktrees, embedded browser, GitHub/Linear integration, marketplace, kanban,
theming, telemetry, auto-update, async runtime (tokio). The daemon is threads +
`std::sync` only. PRs adding these will be closed.

## Getting started

```sh
git clone https://github.com/dewhush/sentra
cd sentra
cargo build
bash scripts/smoke.sh   # must exit 0
cargo clippy             # must be clean
```

## Ground rules

- Rust 2024 edition, `cargo build --release` zero warnings.
- No `unwrap()` where a user string can kill the daemon — answer
  `{"ok": false, "err": "…"}` instead.
- Every error message names the agent id and what failed.
- Threads + `std::sync` only. No tokio, no async runtime.
- Persist nothing. No config beyond `~/.config/sentra/presets.json`.
- RSS budget: daemon ≤ 30 MB with 5 idle bash agents.
- UI: vanilla JS + xterm.js, no React/Vue/bundler.

## Commit messages

Subjects follow `type(scope): summary` — imperative mood, lowercase type,
one line, no trailing period. Real examples from this repo's history:

```
docs(readme): embed visual architectural roadmap and harness comparison matrix
feat(daemon): pre-check $PATH on spawn, add forget verb, sanitize ANSI in lessons
fix(serve): web dist resolve from any cwd — exe-adjacent ~/.local/share/sentra/dist fallback
feat(ui): FigCraft G1-G9 implementation — workspaces sidebar, quick switcher, empty state, dark/light themes
ci: trigger on master
```

Types in use: `feat`, `fix`, `docs`, `ci`. Scope is the crate or surface
(`ui`, `daemon`, `serve`, `design`, `readme`) and may be omitted when the
change spans the repo. Full rule (`docs(readme): …` → `docs: …`) is visible
in `git log`.

## Pull requests

1. Fork, branch off `master` (the repository's default branch).
2. Keep the daemon-owns-PTYs rule and the hard cuts.
3. `bash scripts/smoke.sh` green + `cargo clippy` clean, or the frontend can be
   loaded in a browser against a running daemon (`SENTRA_TCP=127.0.0.1:7621 sentra serve`).
4. Small PRs win. One feature or one fix per PR.
5. Describe what you changed and why — behavior, not vibes.

## PR checklist

CI (`.github/workflows/ci.yml`) has two jobs. `lint` runs first and is fast
(no system deps); `build` runs only after `lint` passes. Both must be green.

Enforced by CI:

- `cargo fmt --all -- --check` — `lint` job.
- `cargo clippy -p sentra-daemon -p sentra-cli --all-targets -- -D warnings` — `lint` job.
- `cargo build --release` emits zero warnings (the log is grepped for `^warning`) — `build` job.
- `cargo clippy --all-targets -- -D warnings` over the whole workspace — `build` job
  (needs the webkit apt packages, which is why it is not in `lint`).
- `cargo test --workspace` — `build` job.
- `bash scripts/smoke.sh` exits 0 (`SENTRA_BIN=target/release/sentra`) — `build` job.

Required in review, not by CI:

- No new dependency without a justification in the PR description.
- One feature or one fix per PR — split unrelated changes out.

Run the same commands locally as `bash scripts/smoke.sh` with
`SENTRA_BIN=target/debug/sentra`; see [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md).

## Reporting bugs

Open an issue with: your distro, `sentra` version (commit hash), what you ran,
what you expected, what happened. For agent crashes: the daemon survives; paste
the daemon stderr, not a screenshot of a dead pane. Questions:
**dewantorokuntow@gmail.com**.

## License

MIT. By contributing you agree your contributions are licensed under MIT.
