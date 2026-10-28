# Security Policy

## Supported versions

| Version | Supported |
| ------- | --------- |
| master  | yes       |

Sentra is young; only `master` receives fixes.

## Scope

Sentra is a **local** desktop orchestrator:

- IPC is a unix socket at `$XDG_RUNTIME_DIR/sentra/sentra.sock`, parent dir mode
  `700` — same-user only.
- The optional TCP/Web listener (`SENTRA_TCP=host:port`) serves the JSONL
  protocol, the static web UI, and an SSE feed. It has **no authentication by
  design** — bind it to localhost or a private/trusted network only. Do not
  expose it directly to the internet.
- The daemon spawns the commands you configure (presets) with your privileges
  and streams their PTY output. Treat agent output as untrusted text; the web
  UI renders it as terminal glyphs, not HTML.

Out of scope: the security of the agents you run (hermes/omp/claude/codex),
prompt injection inside agent conversations, and anything from running
untrusted prompts.

## Reporting a vulnerability

Email **dewantorokuntow@gmail.com** or open a GitHub security advisory
(“Report a vulnerability” on the Security tab). Include reproduction steps and
impact. Please do not open a public issue.

You will get a response within 7 days. We aim to release a fix within 30 days
of confirmation; you will be credited in the release notes unless you prefer
otherwise.
