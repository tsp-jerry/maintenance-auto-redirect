# maintenance-auto-redirect
# 维护跳转一键开关（Nginx × Sentinel）

一套在“维护期临时跳转到状态页、维护结束自动或手动恢复”的最小方案：

- `sentinel.js`：本机健康聚合服务（检查 PM2 进程状态 + 端口连通性，健康返回 204，否则 403）。
- `maintenance.html`：维护页，定时请求 Sentinel 健康接口，检测到 204 即自动跳回首页。
- `maintenance_enable.sh` / `maintenance_disable.sh`：一键开启/关闭维护（以“重定向片段”方式注入/撤销 302）。

---

## 1. 架构与流程

```
用户访问站点 ──→ Nginx（正常反代）
                    │
维护期启用          └─→ include 重定向片段 → 302 跳 https://<status-domain>/
                                       │
                                       └─→ status 域部署 maintenance.html
                                              │（定时）
                                              └─→ 访问 https://<sentinel-domain>/health
                                                     ├─ 204（健康）→ 自动跳回 https://<main-domain>/
                                                     └─ 403（不健康）→ 停留维护页
```

---

## 2. 文件说明

- `sentinel.js`
  - 监听：`127.0.0.1:8088`
  - 规则：两个条件都满足才判定“健康”
    - PM2 进程为 `online`（默认检查 `backend` 与 `front`）
    - TCP 端口可连接（默认 `127.0.0.1:3000`、`127.0.0.1:3001`）
  - 接口：
    - `GET/HEAD /health` → 204/403（已开启 CORS & 禁止缓存）
    - `GET /health-pixel` → 跨域图片探针（健康 200 GIF / 不健康 503）
  - 环境变量（可选）：
    - `PM2_BIN` 指定 pm2 可执行，默认 `pm2`
    - `SERVICES` 覆盖服务列表（JSON 数组）
      ```json
      [{"pm2Name":"backend","host":"127.0.0.1","port":3000},{"pm2Name":"front","host":"127.0.0.1","port":3001}]
      ```

- `maintenance.html`
  - 每 10s 对 `https://sentinel.ugirl.ai/health` 发 `HEAD`，返回 204 则跳 `https://www.ugirl.ai/`
  - 如需自定义，将文末两处常量替换：
    ```js
    const SENTINEL_HEALTH_URLS = ['https://<sentinel-domain>/health'];
    const RESTORE_TARGET_URL = 'https://<main-domain>/';
    ```

- `maintenance_enable.sh`（开启维护）
  - 在宝塔“重定向 include”目录生成片段并重载 Nginx：
    `/www/server/panel/vhost/nginx/redirect/<域名>/<hash>_<域名>.conf`
  - 内容为 Server 级 `return 302`，避免与已有 `location /` 冲突；放行 `/.well-known`。
  - 支持 `NGINX_BIN` 环境变量指定 Nginx 可执行路径，默认自动探测。

- `maintenance_disable.sh`（关闭维护）
  - 删除上述片段文件（兼容历史命名），并重载 Nginx。

---

## 3. 部署步骤

### 3.1 部署 Sentinel（本机健康聚合服务）

```bash
# 安装依赖（Node 16+）
node -v

# 以 PM2 方式守护（示例）
pm2 start sentinel.js --name sentinel --interpreter node -- \
  && pm2 save

# 验证
curl -I http://127.0.0.1:8088/health
# 204 说明健康；403 为不健康
```

若 Sentinel 需通过域名对外提供给维护页（HTTPS）：

```nginx
# /www/server/panel/vhost/nginx/<sentinel-domain>.conf（示例片段）
listen 80;
listen [::]:80;
listen 443 ssl http2;
listen [::]:443 ssl http2;
server_name <sentinel-domain>;
location / { proxy_pass http://127.0.0.1:8088; }
```

### 3.2 站点 Nginx 配置（宝塔）

确认你的站点主配置中包含以下引用（宝塔默认会有）：

```nginx
include /www/server/panel/vhost/nginx/redirect/<域名>/*.conf;
```

### 3.3 部署维护页（可选）

将 `maintenance.html` 放到你的状态页域名（例如 `https://staging-status.devbase.cloud/`）对应的站点根目录；或通过任意静态托管服务提供该页面。

---

## 4. 启用/关闭维护

把脚本放到服务器：

```bash
sudo mkdir -p /opt/maintenance
sudo cp maintenance_enable.sh maintenance_disable.sh /opt/maintenance/
sudo chmod +x /opt/maintenance/*.sh
```

启用维护（全站临时 302 到状态页）：

```bash
/opt/maintenance/maintenance_enable.sh
```

关闭维护（删除片段，恢复正常反代）：

```bash
/opt/maintenance/maintenance_disable.sh
```

> 注意：脚本内部会执行 `nginx -t && nginx -s reload`，需要具备重载权限（root 或具备 sudo 权限）。

---

## 5. 在 CI/CD 中使用（示例）

```bash
# 开启维护（比如部署开始）
/opt/maintenance/maintenance_enable.sh || true

# ... 执行你的部署任务 ...

# 关闭维护（部署结束）
/opt/maintenance/maintenance_disable.sh || true
```

---

## 6. 常见问题

- Q：维护页不自动跳回？  
  A：确保 Sentinel 域名可被维护页访问，`/health` 响应状态 204 且带 CORS。可 `curl -I https://<sentinel>/health` 验证；并检查维护页内 `SENTINEL_HEALTH_URLS` 与 `RESTORE_TARGET_URL` 是否与你的域名一致。

- Q：Nginx reload 报“duplicate location /”？  
  A：本方案已使用 Server 级 `return 302`（非 `location /`），避免冲突。如仍存在其它重定向片段，请清理 include 目录下的旧文件。

‑ Q：pm2 不在 PATH？  
  A：为 Sentinel 设置环境变量 `PM2_BIN=/usr/local/bin/pm2`（按实际路径），或在 systemd/PM2 生态内保证可执行路径。
  
‑ Q：部署维护页，要在BT上设置404重定向首页。 
---

## 7. 目录建议（可选）

```
.
├─ maintenance_enable.sh
├─ maintenance_disable.sh
├─ maintenance.html
├─ sentinel.js
└─ README.md
```

---

## 8. 许可

MIT（按需自定义）。


