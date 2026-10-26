#!/bin/bash
# keeps the sentra reverse tunnel to vps alive
SOCK="${XDG_RUNTIME_DIR:-/run/user/$(id -u)}/sentra/sentra.sock"
while true; do
  ssh vps "rm -f /tmp/sentra-vps.sock" 2>/dev/null
  ssh -N -R /tmp/sentra-vps.sock:"$SOCK" -o ExitOnForwardFailure=yes -o ServerAliveInterval=15 -o ServerAliveCountMax=3 -o StrictHostKeyChecking=no vps
  sleep 3
done
