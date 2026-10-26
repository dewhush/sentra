#!/usr/bin/env bash
# Provision sentra headless on the VPS: build + systemd + presets.
# Usage: scripts/vps-setup.sh [user@host] (default: vps)
set -euo pipefail
HOST="${1:-vps}"
REPO="$(cd "$(dirname "$0")/.." && pwd)"

echo "==> push source"
tar -C "$REPO" --exclude target --exclude node_modules --exclude .git -cf - . | ssh "$HOST" 'mkdir -p ~/code/sentra && tar -C ~/code/sentra -xf -'
echo "==> rust toolchain"
if ! ssh "$HOST" 'command -v cargo >/dev/null'; then
  ssh "$HOST" 'curl --proto "=https" --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y --profile minimal'
fi

echo "==> build release (daemon+cli only)"
ssh "$HOST" 'cd ~/code/sentra && ~/.cargo/bin/cargo build --release -p sentra-daemon -p sentra-cli'

echo "==> install + systemd user service"
ssh "$HOST" 'bash -s' <<'REMOTE'
set -e
mkdir -p ~/.config/sentra ~/.config/systemd/user ~/.local/bin
[ -f ~/.config/sentra/presets.json ] || printf '{ "hermes": ["hermes"], "omp": ["omp"], "claude": ["claude"], "codex": ["codex"], "bash": ["bash"] }\n' > ~/.config/sentra/presets.json
cp ~/code/sentra/target/release/sentra ~/.local/bin/sentra
# TCP bind on the tailscale interface only.
TSIP="$(tailscale ip -4 2>/dev/null || true)"
BIND="${TSIP:-127.0.0.1}:7621"
cat > ~/.config/systemd/user/sentra.service <<UNIT
[Unit]
Description=sentra orchestrator daemon (headless)

[Service]
ExecStart=%h/.local/bin/sentra serve
Environment=SENTRA_TCP=$BIND
Environment=SENTRA_WEB=%h/code/sentra/web
Restart=always
RestartSec=2

[Install]
WantedBy=default.target
UNIT
systemctl --user daemon-reload
systemctl --user enable --now sentra.service
sleep 1
systemctl --user is-active sentra.service
echo "bind: $BIND"
REMOTE

echo "==> done. Control from laptop:"
echo "    SENTRA_TCP=$BIND ~/.local/bin/sentra list"
echo "    browser: http://$BIND"
