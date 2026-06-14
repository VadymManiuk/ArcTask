#!/usr/bin/env bash
set -euo pipefail

VPS_HOST="${ARCTASK_VPS_HOST:-109.206.243.135}"
VPS_USER="${ARCTASK_VPS_USER:-root}"
VPS_KEY="${ARCTASK_VPS_KEY:-/Users/admin/Documents/New project/.codex-ssh/polymarket_vps}"
REMOTE_DIR="${ARCTASK_REMOTE_DIR:-/root/ArcTask}"
PM2_NAME="${ARCTASK_PM2_NAME:-arctask-worker}"
REPO_URL="${ARCTASK_REPO_URL:-https://github.com/VadymManiuk/ArcTask.git}"
ENV_FILE="${ARCTASK_ENV_FILE:-.env.local}"
COPY_ENV="${ARCTASK_COPY_ENV:-false}"

if [[ ! -f "$VPS_KEY" ]]; then
  echo "Missing SSH key: $VPS_KEY" >&2
  exit 1
fi

if [[ "$COPY_ENV" == "true" && ! -f "$ENV_FILE" ]]; then
  echo "Missing env file: $ENV_FILE" >&2
  exit 1
fi

ssh_base=(
  ssh
  -i "$VPS_KEY"
  -o IdentitiesOnly=yes
  -o BatchMode=yes
  -o StrictHostKeyChecking=no
  -o ConnectTimeout=10
  -o ConnectionAttempts=1
  "$VPS_USER@$VPS_HOST"
)

scp_base=(
  scp
  -i "$VPS_KEY"
  -o IdentitiesOnly=yes
  -o BatchMode=yes
  -o StrictHostKeyChecking=no
  -o ConnectTimeout=10
  -o ConnectionAttempts=1
)

echo "Deploying ArcTask worker to $VPS_USER@$VPS_HOST:$REMOTE_DIR"

"${ssh_base[@]}" "set -e
if [ -d '$REMOTE_DIR/.git' ]; then
  cd '$REMOTE_DIR'
  git fetch origin main
  git reset --hard origin/main
else
  rm -rf '$REMOTE_DIR'
  git clone '$REPO_URL' '$REMOTE_DIR'
  cd '$REMOTE_DIR'
fi
npm ci --omit=dev
"

if [[ "$COPY_ENV" == "true" ]]; then
  echo "Copying $ENV_FILE to $REMOTE_DIR/.env.local"
  "${scp_base[@]}" "$ENV_FILE" "$VPS_USER@$VPS_HOST:$REMOTE_DIR/.env.local"
else
  echo "Skipping env copy. Set ARCTASK_COPY_ENV=true to copy $ENV_FILE to the VPS."
fi

"${ssh_base[@]}" "set -e
cd '$REMOTE_DIR'
test -f .env.local || (echo 'Missing .env.local on VPS. Re-run with ARCTASK_COPY_ENV=true or create it manually.' >&2; exit 1)
chmod 600 .env.local
pm2 delete '$PM2_NAME' >/dev/null 2>&1 || true
pm2 start npm --name '$PM2_NAME' -- run agent:worker:live
pm2 save
pm2 describe '$PM2_NAME' --no-color | sed -n '1,80p'
pm2 logs '$PM2_NAME' --lines 30 --nostream
"
