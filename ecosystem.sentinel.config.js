// ecosystem.sentinel.config.js
module.exports = {
  apps: [
    {
      name: "sentinel",                 // 健康聚合服务
      cwd: "/opt/maintenance-auto-redirect",          // 放置 sentinel.js 的目录（按需修改）
      script: "./sentinel.js",
      interpreter: "node",
      args: "",

      watch: false,
      autorestart: true,
      max_restarts: 10,
      restart_delay: 3000,

      instances: 1,
      exec_mode: "fork",

      merge_logs: true,
      log_date_format: "YYYY-MM-DD HH:mm:ss",
      max_logs_backup: 7,
      log_type: "raw",

      // 进程内存上限，超过将自动重启
      max_memory_restart: "256M",

      // 可选：覆盖环境变量
      // env: {
      //   PM2_BIN: "/usr/bin/pm2",
      //   SERVICES: '[{"pm2Name":"backend","host":"127.0.0.1","port":3000},{"pm2Name":"front","host":"127.0.0.1","port":3001}]'
      // }
    }
  ]
};
