// sentinel.js
// 健康聚合服务：通过 PM2 进程状态 + 端口连通性 判断前后端是否健康
// - 前端：pm2 名称 front，端口 3001
// - 后端：pm2 名称 backend，端口 3000
// 返回：
//   204 → 全部健康
//   403 → 任一不健康

import http from 'http';
import { execFile } from 'child_process';
import net from 'net';

// 可通过环境变量覆盖 PM2 路径与服务列表
const PM2_BIN = process.env.PM2_BIN || 'pm2';
let services;
try {
  // 形如：SERVICES='[{"pm2Name":"backend","host":"127.0.0.1","port":3000},{"pm2Name":"front","host":"127.0.0.1","port":3001}]'
  services = JSON.parse(process.env.SERVICES || '[]');
} catch {
  services = [];
}
if (!Array.isArray(services) || services.length === 0) {
  services = [
    { name: 'backend', pm2Name: 'backend', host: '127.0.0.1', port: 3000 },
    { name: 'frontend', pm2Name: 'front', host: '127.0.0.1', port: 3001 },
  ];
}

function checkPortConnect(host, port, timeoutMs = 1200) {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    let done = false;
    const finish = (ok) => { if (!done) { done = true; socket.destroy(); resolve(ok); } };
    socket.setTimeout(timeoutMs);
    socket.once('connect', () => finish(true));
    socket.once('timeout', () => finish(false));
    socket.once('error', () => finish(false));
    try {
      socket.connect(port, host);
    } catch {
      finish(false);
    }
  });
}

function getPm2OnlineSet() {
  return new Promise((resolve) => {
    // 通过 pm2 jlist 获取 JSON 列表（避免依赖全局 pm2 的 Node 模块解析路径问题）
    execFile(PM2_BIN, ['jlist', '--silent'], { timeout: 1500 }, (err, stdout) => {
      if (err) return resolve(new Set()); // 视作不健康
      try {
        const list = JSON.parse(stdout.toString());
        const set = new Set();
        for (const p of list) {
          const name = p?.name || p?.pm2_env?.name;
          const status = p?.pm2_env?.status;
          if (name && status === 'online') set.add(name);
        }
        resolve(set);
      } catch {
        resolve(new Set());
      }
    });
  });
}

// 5 秒缓存，降低探测压力
let cache = { ok: false, at: 0 };
async function getAggregatedStatus() {
  const now = Date.now();
  if (now - cache.at < 5000) return cache.ok;

  const [pm2OnlineSet, portResults] = await Promise.all([
    getPm2OnlineSet(),
    Promise.all(services.map(s => checkPortConnect(s.host, s.port))),
  ]);

  let allOk = true;
  services.forEach((s, idx) => {
    const pm2Ok = pm2OnlineSet.has(s.pm2Name);
    const portOk = !!portResults[idx];
    if (!(pm2Ok && portOk)) {
      allOk = false;
    }
  });

  cache = { ok: allOk, at: now };
  return allOk;
}

const server = http.createServer(async (req, res) => {
  if (req.url.startsWith('/health')) {
    // CORS 允许跨域访问（供维护页轮询）
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,HEAD,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('Access-Control-Max-Age', '300');
    // 禁止缓存，确保浏览器/CDN 不缓存探测结果
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');

    if (req.method === 'OPTIONS') {
      res.statusCode = 204;
      return res.end();
    }

    const ok = await getAggregatedStatus();
    if (ok) { res.statusCode = 204; res.end(); }
    else {
      res.statusCode = 403;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ ok: false }));
    }
  } else if (req.url.startsWith('/health-pixel')) {
    // 跨域友好的图片探针：健康时返回 200 + 1x1 GIF，失败返回 503
    // 注意：图片请求不需要 CORS 头，前端可通过 onload/onerror 处理
    const ok = await getAggregatedStatus();
    if (ok) {
      const b64 = 'R0lGODlhAQABAPAAAP///wAAACH5BAAAAAAALAAAAAABAAEAAAICRAEAOw==';
      const buf = Buffer.from(b64, 'base64');
      res.statusCode = 200;
      res.setHeader('Content-Type', 'image/gif');
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
      res.end(buf);
    } else {
      res.statusCode = 503;
      res.end();
    }
  } else {
    res.statusCode = 404; res.end();
  }
});

server.listen(8088, '127.0.0.1', () => console.log('sentinel on 127.0.0.1:8088'));
