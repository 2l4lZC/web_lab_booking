/**
 * PM2 进程配置。
 *
 * 用法：
 *   pm2 start deploy/ecosystem.config.cjs
 *   pm2 save                  # 保存进程列表
 *   pm2 startup               # 生成开机自启脚本（按提示执行输出的命令）
 *
 * 文件名用 .cjs 是因为 server/package.json 里声明了 "type": "module"，
 * 这个配置文件用的是 CommonJS 写法，必须显式区分。
 */
module.exports = {
  apps: [
    {
      name: 'lab-booking-api',
      script: 'src/app.js',
      cwd: '/var/www/lab-booking/server',

      // ⚠️ 必须是单实例 fork 模式。
      //    app.js 里启动了「未签到扫描」定时任务，cluster 模式下
      //    每个 worker 都会各跑一份，导致同一条预约被重复记违规。
      //    要扩容的话，得先把定时任务拆成独立进程。
      instances: 1,
      exec_mode: 'fork',

      env: {
        NODE_ENV: 'production',
        PORT: 3000,
      },

      // 内存超限自动重启，防止长时间运行后泄漏拖垮服务器
      max_memory_restart: '300M',

      // 崩溃重启策略：最多连崩 10 次，间隔 4 秒
      autorestart: true,
      max_restarts: 10,
      restart_delay: 4000,

      error_file: '/var/log/lab-booking/error.log',
      out_file: '/var/log/lab-booking/out.log',
      merge_logs: true,
      time: true,
    },
  ],
}
