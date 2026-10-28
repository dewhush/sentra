# Development

How to build, run, and test Sentra locally. [README.md](../README.md) is the user-facing
overview; this file is the contributor loop. Every command below is taken from the file
named beside it.

## Prerequisites

| Need | Why | Source |
|---|---|---|
| Rust toolchain, stable | the whole workspace | `.github/workflows/ci.yml` — `dtolnay/rust-toolchain@stable` |
| `rustfmt` + `clippy` components | formatting and lint gates | `ci.yml` `lint` job sets `components: rustfmt, clippy` |
| `libwebkit2gtk-4.1-dev libgtk-3-dev libayatana-appindicator3-dev librsvg2-dev patchelf` | to build the Tauri 2 shell (`crates/sentra-ui`) | `ci.yml` "Install system deps" step |
| `python3` | the smoke suite drives the daemon with an inline python probe | `scripts/smoke.sh` (`need python3`) |
| `ps` (procps) | RSS measurement | `scripts/rss.sh` |
| `import` or `scrot` (optional) | screenshot in the UI harness | `scripts/ui-test.sh` |

**Node is not required to build or run.** No CI step runs `npm install`. The UI is a
Tauri *Rust* binary whose frontend is committed under `crates/sentra-ui/dist/`
(`index.html` + `app.js` + `style.css`, with xterm.js vendored in `dist/vendor/` and
fonts in `dist/fonts/`); edit `dist/` directly.

`crates/sentra-ui/package.json` + `package-lock.json` do exist and are tracked — they
record the `@xterm/xterm` / `@xterm/addon-fit` versions that were vendored into
`dist/vendor/`. Nothing in the build reads them; they are provenance only.
`crates/sentra-ui/node_modules` is gitignored.

## Build

| Crate | Produces | Notes |
|---|---|---|
| `crates/sentra-daemon` | binary `sentra` (`[[bin]]`, `src/main.rs`) | the daemon **and** the CLI front door |
| `crates/sentra-cli` | library only (no `[[bin]]`) | socket client + verb→JSONL mapping; used by both binaries |
| `crates/sentra-ui` | binary `sentra-ui` (Tauri 2) | optional window; needs the webkit deps |

```sh
cargo build              # debug   → target/debug/sentra, target/debug/sentra-ui
cargo build --release    # release → target/release/sentra, target/release/sentra-ui
cargo build --release -p sentra-daemon -p sentra-cli   # headless, no webkit needs
```

Release is `strip = true`, `lto = true` (`Cargo.toml`). CI runs `cargo build --release`
and fails if any output line matches `^warning` (`ci.yml`). `scripts/vps-setup.sh` builds
only the two headless crates.

`sentra` is one binary for both roles: `serve` starts the daemon, any other verb falls
through to `sentra_cli::run` (`crates/sentra-daemon/src/main.rs`).

## Run the daemon locally

```sh
SENTRA_TCP=127.0.0.1:7621 cargo run -p sentra-daemon -- serve
```

`sentra serve` binds a unix socket **and** a TCP listener.

Unix socket path resolution (`crates/sentra-cli/src/lib.rs`):

1. `$SENTRA_SOCKET` if set and non-empty
2. else `$XDG_RUNTIME_DIR/sentra/sentra.sock`
3. else `/tmp/sentra-$UID/sentra.sock`

TCP address defaults to `127.0.0.1:7621` and is overridden by `$SENTRA_TCP`
(`crates/sentra-daemon/src/server.rs`). The same port serves the web UI:

| Route | Serves |
|---|---|
| `GET /` `/app.js` `/style.css` `/logo.svg` | static frontend |
| `GET /vendor/*` `/fonts/*` `/icons/*` | vendored xterm, fonts, icons |
| `GET /events` | SSE event stream |
| `POST /api` | JSON request/response (browser fallback) |

Point a browser at `http://127.0.0.1:7621`. The dist directory is `$SENTRA_WEB`, else
`crates/sentra-ui/dist` relative to cwd, else `<exe>/../share/sentra/dist`, else
`~/.local/share/sentra/dist` (`server.rs`).

`sentra serve --port 7600` and `--addr host:port` just set `SENTRA_TCP`
(`crates/sentra-daemon/src/main.rs`). `--with-ui` also spawns the `sentra-ui` binary
sitting next to `sentra`; if a daemon already answers on the web port it only attaches
the window and does not start a second daemon. A TCP bind failure is fatal by design —
the daemon refuses to silently fall back to socket-only, so there is one daemon per port
(`server.rs`).

Drive it with the CLI:

```sh
export SENTRA_SOCKET=/tmp/sentra-dev/sentra.sock     # optional; else the default path
cargo run -p sentra-daemon -- spawn --preset bash --name dev
cargo run -p sentra-daemon -- list
```

Verbs: `spawn | list | send | wait | read | resize | kill | forget | presets | profiles |
lessons | research`, all `--json`-capable (`crates/sentra-cli/src/lib.rs`).

## The smoke suite

`bash scripts/smoke.sh` is the acceptance test: exit 0 = pass. It defaults `SENTRA_BIN` to
`target/debug/sentra`; CI overrides it to `target/release/sentra`.

| Script | Run it as | What it actually checks |
|---|---|---|
| `scripts/smoke.sh` | `bash scripts/smoke.sh` | M1. Starts the daemon on a throwaway `SENTRA_SOCKET`, then a raw unix-socket python probe asserts: spawn, a send→wait→read roundtrip (`HI: ping`), resize 80×24, id **and** name resolution, unknown-agent error names the id, `watch` fanout to two subscribers, `kill` flips `alive` false, `wait exit:false` on a dead agent returns `exited`. Then sources m2 + m4. |
| `scripts/smoke-m2.sh` | `SKIP_SERVE=1 bash scripts/smoke-m2.sh` | M2. Every CLI verb via `--json`: spawn by preset, `list` shape, marker roundtrip (`RUNMarker_42`), `--json` error shape for an unknown name, reading an unknown agent exits 1, resize, kill, double-kill must fail, `presets` json, duplicate name becomes `duo-2`, raw-argv spawn. |
| `scripts/smoke-m4.sh` | sourced by `smoke.sh` | M4. The handoff triad against two echo bots, a roundtrip latency budget of `idle_ms + 250ms` (= 1450 ms), and a 3-hop chain. |
| `scripts/ui-test.sh` | `bash scripts/ui-test.sh` | M3, manual harness. Serves a daemon, spawns one bash agent, launches `target/debug/sentra-ui` on `DISPLAY`, screenshots to `/tmp/sentra-shot.png`. Prints pids; no pass/fail — it is for eyeballing the window. |
| `scripts/rss.sh` | `bash scripts/rss.sh` | §10 memory budget. Serves, spawns 5 idle bash agents, reads the daemon's RSS with `ps`, prints `RSS PASS`/`RSS FAIL` against a 30720 kB limit. Defaults `SENTRA_BIN` to `target/release/sentra`. |
| `scripts/daemon_probe.py` | `python3 scripts/daemon_probe.py` | Standalone probe of an already-running daemon: spawn/send/wait/read, resize clamp (`rows:0` → 2), list, dedup (`probe-2`), fanout, `wait exit:false` on a dead agent. |

`smoke.sh` does **not** run `ui-test.sh`, `rss.sh`, or `daemon_probe.py`.

## Test checklist before a PR

CI is two jobs (`.github/workflows/ci.yml`): `lint` (fast, no system deps) gates `build`.
`build` needs `lint` to pass first.

| Job | Step | Command |
|---|---|---|
| `lint` | rustfmt, whole workspace | `cargo fmt --all -- --check` |
| `lint` | clippy, daemon + cli | `cargo clippy -p sentra-daemon -p sentra-cli --all-targets -- -D warnings` |
| `lint` | frontend bundle guard | `test -s` on `dist/index.html` `app.js` `style.css` + `grep 'id="app"'` |
| `build` | release build, zero warnings | `cargo build --release` then `! grep -E "^warning"` |
| `build` | clippy, whole workspace | `cargo clippy --all-targets -- -D warnings` |
| `build` | unit tests | `cargo test --workspace` |
| `build` | smoke suite | `bash scripts/smoke.sh` with `SENTRA_BIN=target/release/sentra` |

`sentra-ui` is excluded from the `lint` clippy run — it links webkit2gtk and cannot build
without the apt packages — so the full-workspace clippy run lives in `build`.

Checklist before pushing:

- [ ] `cargo fmt --all -- --check` clean — **CI-enforced** by the `lint` job
- [ ] `cargo clippy --all-targets -- -D warnings` clean (CI `build` job)
- [ ] `cargo test --workspace` green (CI `build` job; 2 tests in `lessons.rs` today)
- [ ] `bash scripts/smoke.sh` exits 0 (`SENTRA_BIN=target/release/sentra`)
- [ ] `cargo build --release` emits zero warnings (CI greps `^warning`)
- [ ] one change per PR; no new dependency without a justification

> `cargo fmt --all -- --check` **currently fails on `master`** (7 files). This is a
> pre-existing condition tracked in its own PR — do not run `cargo fmt` here to fix it.

**Design fidelity.** A UI change must name the `design/NN-*.md` frame it matches. The
acceptance surface is the screen set, 00→10:

| File | Screen |
|---|---|
| `design/00-first-run.md` | First-Run Setup & CLI Detection |
| `design/01-empty-launcher.md` | Empty Launcher — First Run |
| `design/02-context-spawn.md` | Context Set + Spawn 1 Agent |
| `design/03-one-agent.md` | 1-Agent Workspace |
| `design/04-adding-second.md` | Adding 2nd Agent |
| `design/05-grid-3.md` | 3-Agent Dynamic Grid |
| `design/05b-drop-overlay.md` | Drag & Drop Files Overlay |
| `design/06-grid-8.md` | Scaled 8+ Agents |
| `design/07-settings.md` | Settings shell + tabs |
| `design/08-sidebar-dispatch.md` | Sidebar Clone & Context Dispatch |
| `design/09-switcher.md` | Quick Folder Switcher |
| `design/10-empty-folder.md` | Empty Folder State |

`design/README.md` maps number → screen; `design/components.md` covers the shared
topbar/sidebar/pane/states/errors. `design/11-mobile.md` is a companion, not part of the
00–10 flow. Copy marked **mock** in the specs is decoration — do not ship it as live data.

## Architecture in one screen

- **The daemon owns the PTYs.** Only `sentra serve` holds the `MasterPty` handles
  (`crates/sentra-daemon/src/registry.rs`). If the viewer crashes, agents keep running.
- **The CLI is the orchestrator API.** `sentra <verb>` becomes one JSON line on the
  socket; the verbs are the same ones the UI uses (`crates/sentra-cli/src/lib.rs`).
- **The UI is a viewer.** `sentra-ui` holds an RPC connection plus a watch connection and
  pushes daemon lines into the webview; it keeps no agent state (`crates/sentra-ui/src/main.rs`).
- **Threads + `std::sync` only, no tokio.** No crate declares an async runtime; the tokio
  entries in `Cargo.lock` arrive transitively through Tauri. The daemon uses a thread per
  socket connection (`server.rs`) and a reader thread per PTY (`registry.rs`).

## Where things live

| Path | Role |
|---|---|
| `crates/sentra-daemon/src/main.rs` | arg parsing: `serve` (`--with-ui`, `--port`/`-p`, `--addr`), else delegate to the CLI |
| `crates/sentra-daemon/src/server.rs` | unix socket + TCP/HTTP/SSE, JSON dispatch, daemon lifecycle |
| `crates/sentra-daemon/src/registry.rs` | agent table: PTY spawn, 256 KiB ring buffer, subscribers, wait/read semantics |
| `crates/sentra-daemon/src/lessons.rs` | markdown memory keyed by profile/preset, under `~/.config/sentra/lessons/` |
| `crates/sentra-daemon/src/presets.rs` | bundled presets + `~/.config/sentra/presets.json` override |
| `crates/sentra-daemon/src/profiles.rs` | named personas over presets + `~/.config/sentra/profiles.json` |
| `crates/sentra-cli/src/lib.rs` | socket client, verb→JSONL mapping, friendly printing |
| `crates/sentra-ui/dist/` | committed frontend (html/css/js, `vendor/` xterm, `fonts/`, `icons/`) |
| `scripts/` | smoke suite, probe, RSS budget, UI harness, VPS/systemd setup, Telegram bridge |
| `design/` | numbered screen specs, `components.md`, `README.md`, preview `*.png` |
| `.github/` | `workflows/ci.yml`, issue templates, PR template, dependabot config |
| `docs/harness-features.md` | research census of other harnesses (roadmap input, not code) |

## Good first contribution path

Small, verifiable starters. Confirm each observation before writing code.

1. **Unit coverage for the wait/read semantics.** The workspace's only tests live in
   `crates/sentra-daemon/src/lessons.rs` (`#[cfg(test)] mod tests`, 2 tests); the logic
   in `registry.rs` that decides `idle` / `exited` / `alive` has none, yet the smoke
   suite asserts it end-to-end only. Add `#[cfg(test)]` cases in `registry.rs`.
2. **Close the verb-coverage gap in the smoke suite.** The CLI wires `forget`,
   `profiles`, `lessons`, `research` (`crates/sentra-cli/src/lib.rs`, dispatched in
   `server.rs`), but no script under `scripts/` exercises them. Add assertions to
   `scripts/smoke-m2.sh`.
3. **Wire the RSS budget into the smoke run.** `scripts/rss.sh` already asserts the
   30720 kB ceiling, but `scripts/smoke.sh` never calls it, so the memory limit is only
   checked when someone runs it by hand.
4. **Subfolder navigation in the quick switcher.** `design/09-switcher.md` marks the `⇥`
   hint as "in the file and not built"; the production footer omits it and `app.js` has no
   `⇥` handling, so the feature is absent. Implement it, then restore the hint.
5. **Test the web surface.** No script touches `POST /api` or `GET /events`; all coverage
   goes through the unix socket. Add a curl/python check against the TCP listener.
