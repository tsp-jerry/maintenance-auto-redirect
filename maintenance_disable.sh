#!/usr/bin/env bash
set -euo pipefail

# Nginx redirect snippet directory for Baota (BT Panel)
REDIR_DIR="/www/server/panel/vhost/nginx/redirect/staging-www.devbase.cloud"
REDIR_FILE="${REDIR_DIR}/6afc524c33af0690742a30a0e6361678_staging-www.devbase.cloud.conf"

# Nginx binary (auto-detect; fallback to Baota default path)
NGINX_BIN="${NGINX_BIN:-$(command -v nginx || echo /www/server/nginx/sbin/nginx)}"

if [ -f "${REDIR_FILE}" ]; then
  rm -f "${REDIR_FILE}"
  echo "[INFO] Removed ${REDIR_FILE}"
else
  echo "[INFO] Redirect snippet not present (already disabled)"
fi

"${NGINX_BIN}" -t
"${NGINX_BIN}" -s reload
echo "[OK] Maintenance redirect DISABLED – site restored"
