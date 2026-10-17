#!/usr/bin/env bash
set -euo pipefail
# Deploy veyth.eu to VPS (ssh host: veyth)
# Usage: ./deploy.sh [--skip-build]
#
# One-time on the server: create /etc/veyth/kofi.env (see server/kofi.env.example, chmod 600).
# Until it exists the Ko-fi receiver stays stopped; the static site deploys regardless.

SKIP_BUILD=0
if [[ "${1:-}" == "--skip-build" ]]; then SKIP_BUILD=1; fi

if [[ $SKIP_BUILD -eq 0 ]]; then
  echo "→ building…"
  pnpm install --frozen-lockfile 2>/dev/null || pnpm install
  pnpm run build
else
  echo "→ skipping build"
fi

if [[ ! -d dist ]]; then echo "dist/ not found. Run build first."; exit 1; fi

# 1. Packages, user and directories (idempotent) — before copying into /etc/caddy
echo "→ preparing server…"
ssh veyth 'sudo -n bash -s' <<'REMOTE'
set -euo pipefail
if ! command -v caddy >/dev/null 2>&1; then
  echo "→ installing caddy…"
  apt-get update -qq
  apt-get install -y -qq debian-keyring debian-archive-keyring apt-transport-https curl gnupg
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor --yes -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' > /etc/apt/sources.list.d/caddy-stable.list
  apt-get update -qq
  apt-get install -y -qq caddy
fi
id veyth-kofi >/dev/null 2>&1 || useradd --system --no-create-home --shell /usr/sbin/nologin veyth-kofi
mkdir -p /var/www/veyth /opt/veyth-apps/bin /etc/veyth
chown zardrastra:caddy /var/www/veyth
chmod 2775 /var/www/veyth
chmod 700 /etc/veyth
REMOTE

# 2. Files
echo "→ syncing to veyth"
( cd server/kofi-receiver && CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build -ldflags="-s -w" -o veyth-kofi-linux-amd64 )
rsync -az --delete dist/ veyth:/var/www/veyth/
scp -q server/kofi-receiver/veyth-kofi-linux-amd64 veyth:/tmp/veyth-kofi.new
scp -q server/veyth-kofi.service veyth:/tmp/veyth-kofi.service.new
scp -q Caddyfile veyth:/tmp/Caddyfile.new

# 3. Activate
ssh veyth 'sudo -n bash -s' <<'REMOTE'
set -euo pipefail
install -o root -g root -m 755 /tmp/veyth-kofi.new /opt/veyth-apps/bin/veyth-kofi
install -o root -g root -m 644 /tmp/veyth-kofi.service.new /etc/systemd/system/veyth-kofi.service
install -o root -g root -m 644 /tmp/Caddyfile.new /etc/caddy/Caddyfile.new
rm -f /tmp/veyth-kofi.new /tmp/veyth-kofi.service.new /tmp/Caddyfile.new
# Validate before swapping so a bad Caddyfile never takes the live site down.
# Run as caddy so validation sees the same permissions the live server has.
runuser -u caddy -- caddy validate --config /etc/caddy/Caddyfile.new --adapter caddyfile
mv /etc/caddy/Caddyfile.new /etc/caddy/Caddyfile
systemctl enable caddy >/dev/null 2>&1
systemctl reload-or-restart caddy

systemctl daemon-reload
if [[ -f /etc/veyth/kofi.env ]]; then
  chmod 600 /etc/veyth/kofi.env
  systemctl enable veyth-kofi >/dev/null 2>&1
  systemctl restart veyth-kofi
else
  echo "⚠ /etc/veyth/kofi.env missing — Ko-fi receiver not started (see server/kofi.env.example)"
fi

echo "→ caddy: $(systemctl is-active caddy)  veyth-kofi: $(systemctl is-active veyth-kofi || true)"
REMOTE

echo "✓ deployed https://veyth.eu"
