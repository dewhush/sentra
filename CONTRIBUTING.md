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

## Pull requests

1. Fork, branch off `main`.
2. Keep the daemon-owns-PTYs rule and the hard cuts.
3. `bash scripts/smoke.sh` green + `cargo clippy` clean, or the frontend can be
   loaded in a browser against a running daemon (`SENTRA_TCP=127.0.0.1:7621 sentra serve`).
4. Small PRs win. One feature or one fix per PR.
5. Describe what you changed and why — behavior, not vibes.

## Reporting bugs

Open an issue with: your distro, `sentra` version (commit hash), what you ran,
what you expected, what happened. For agent crashes: the daemon survives; paste
the daemon stderr, not a screenshot of a dead pane.

## License

MIT. By contributing you agree your contributions are licensed under MIT.
