#!/usr/bin/env bash
set -euo pipefail

# Nginx redirect snippet directory for Baota (BT Panel)
REDIR_DIR="/www/server/panel/vhost/nginx/redirect/staging-www.devbase.cloud"
REDIR_FILE="${REDIR_DIR}/6afc524c33af0690742a30a0e6361678_staging-www.devbase.cloud.conf"

# Nginx binary (auto-detect; fallback to Baota default path)
NGINX_BIN="${NGINX_BIN:-$(command -v nginx || echo /www/server/nginx/sbin/nginx)}"

mkdir -p "${REDIR_DIR}"

cat > "${REDIR_FILE}" <<'NGINX'
# MAINTENANCE REDIRECT (auto-generated)
# Temporary 302 redirect all traffic to status page during maintenance
# 注意：此片段被 include 到 server{} 内部，避免与现有 location / 冲突，使用 server 级 return
if ($request_uri !~ "^/\\.well-known") {
    return 302 https://staging-status.devbase.cloud$request_uri;
}
NGINX

"${NGINX_BIN}" -t
"${NGINX_BIN}" -s reload
echo "[OK] Maintenance redirect ENABLED → https://staging-status.devbase.cloud"
