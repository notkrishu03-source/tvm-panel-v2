#!/usr/bin/env bash
# ============================================================================
# TuffNode TVM Panel — one-command installer (Ubuntu 22.04 / 24.04 VPS)
#
# Usage:
#   sudo ADMIN_PASSWORD='YourStr0ngPass!' bash install.sh
#
# Environment overrides:
#   ADMIN_USERNAME   default: admin
#   ADMIN_PASSWORD   default: admin123   (change it!)
#   DB_NAME          default: tvm_panel
#   DB_USER          default: tvm_panel
#   PORT             default: 3000
# ============================================================================
set -euo pipefail

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DB_NAME="${DB_NAME:-tvm_panel}"
DB_USER="${DB_USER:-tvm_panel}"
DB_PASS="${DB_PASS:-$(openssl rand -hex 16)}"
ADMIN_USERNAME="${ADMIN_USERNAME:-admin}"
ADMIN_PASSWORD="${ADMIN_PASSWORD:-admin123}"
PORT="${PORT:-3000}"

echo "==> TuffNode TVM Panel installer"
echo "    app dir : $APP_DIR"
echo "    db      : $DB_NAME (user: $DB_USER)"
echo "    admin   : $ADMIN_USERNAME"
echo "    port    : $PORT"

# --- 1. Root check ----------------------------------------------------------
if [[ $EUID -ne 0 ]]; then
  echo "ERROR: run as root — sudo bash install.sh"
  exit 1
fi

# --- 2. System dependencies --------------------------------------------------
echo "==> Installing system packages..."
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq curl git ca-certificates lsof postgresql postgresql-client

# Node.js 20.x via NodeSource
NODE_OK=0
if command -v node >/dev/null 2>&1; then
  NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]')"
  [[ "$NODE_MAJOR" -ge 20 ]] && NODE_OK=1
fi
if [[ "$NODE_OK" -ne 1 ]]; then
  echo "==> Installing Node.js 20.x..."
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
  apt-get install -y -qq nodejs
fi
echo "    node $(node -v), npm $(npm -v)"

if ! command -v pm2 >/dev/null 2>&1; then
  echo "==> Installing PM2 (process manager)..."
  npm install -g pm2
fi

# --- 3. PostgreSQL database --------------------------------------------------
echo "==> Preparing PostgreSQL..."
systemctl enable postgresql
systemctl start postgresql
systemctl reload postgresql 2>/dev/null || true

su - postgres -c "psql -tc \"SELECT 1 FROM pg_roles WHERE rolname='${DB_USER}'\"" | grep -q 1 \
  || su - postgres -c "psql -qc \"CREATE USER ${DB_USER} WITH PASSWORD '${DB_PASS}'\""
su - postgres -c "psql -tc \"SELECT 1 FROM pg_database WHERE datname='${DB_NAME}'\"" | grep -q 1 \
  || su - postgres -c "psql -qc \"CREATE DATABASE ${DB_NAME} OWNER ${DB_USER}\""

DATABASE_URL="postgresql://${DB_USER}:${DB_PASS}@127.0.0.1:5432/${DB_NAME}"

# --- 4. Environment file ------------------------------------------------------
echo "==> Writing .env..."
cat > "$APP_DIR/.env" <<EOF
DATABASE_URL=${DATABASE_URL}
ADMIN_USERNAME=${ADMIN_USERNAME}
ADMIN_PASSWORD=${ADMIN_PASSWORD}
EOF
chmod 600 "$APP_DIR/.env"

# --- 5. Dependencies + database schema ---------------------------------------
cd "$APP_DIR"
echo "==> Installing npm dependencies..."
npm ci --no-audit --no-fund || npm install --no-audit --no-fund

echo "==> Applying database schema (drizzle)..."
npx drizzle-kit push --force

# --- 6. Build + start ----------------------------------------------------------
echo "==> Building production bundle..."
npm run build

echo "==> Starting panel with PM2 on port ${PORT}..."
pm2 delete tvm-panel 2>/dev/null || true
PORT="$PORT" PM2_HOME="${PM2_HOME:-$HOME/.pm2}" pm2 start npm --name tvm-panel -- start
pm2 save 2>/dev/null || true
pm2 startup systemd -u root --hp "$HOME" 2>/dev/null || true

# --- 7. Firewall (only if UFW is active) ---------------------------------------
if command -v ufw >/dev/null 2>&1 && ufw status 2>/dev/null | grep -q "active"; then
  echo "==> Opening ports in UFW (22 + ${PORT})..."
  ufw allow 22/tcp >/dev/null
  ufw allow "${PORT}/tcp" >/dev/null
fi

# --- 8. Verify -----------------------------------------------------------------
sleep 3
if curl -fsS "http://127.0.0.1:${PORT}/api/health" | grep -q '"ok":true'; then
  echo "==> Healthcheck passed."
else
  echo "WARN: healthcheck did not respond yet — check: pm2 logs tvm-panel"
fi

cat <<EOF

============================================================================
  TuffNode TVM Panel is installed!
============================================================================
  URL            : http://<your-server-ip>:${PORT}
  Admin user     : ${ADMIN_USERNAME}
  Admin password : ${ADMIN_PASSWORD}
  Process        : pm2 status  |  pm2 logs tvm-panel

  !! Change the admin password after first login (Account page).
  !! Put nginx + SSL in front of port ${PORT} for production use.

  Nginx example:
    server {
      listen 80;
      server_name yourdomain.com;
      location / {
        proxy_pass http://127.0.0.1:${PORT};
        proxy_set_header Host \$host;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
      }
    }
============================================================================
EOF
