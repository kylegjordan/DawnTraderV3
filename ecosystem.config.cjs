// DawnTrader PM2 Ecosystem Configuration
// Usage:
//   Start:    pm2 start ecosystem.config.cjs
//   Stop:     pm2 stop all
//   Restart:  pm2 restart all
//   Logs:     pm2 logs
//   Monitor:  pm2 monit
//
// PM2 is used for VM-style deployments on EC2 (without Docker).
// For Docker deployments, the Dockerfile CMD handles startup directly.
// These are NOT overlapping — choose one deployment model per environment:
//   - EC2 bare metal: PM2 (this file)
//   - Containerized:  Docker (Dockerfile + docker-compose.yml)

module.exports = {
  apps: [
    {
      name: 'dawntrader',
      script: 'dist/index.js',
      node_args: '--experimental-specifier-resolution=node --env-file=.env',
      instances: 1,           // Single instance — trading state is in-memory
      exec_mode: 'fork',      // Fork mode (not cluster) — WebSocket + in-memory state
      autorestart: true,
      watch: false,
      max_memory_restart: '2G', // Batch 47f15: Increased from 1G per Kyle directive. Memory purge system planned separately.
      env: {
        NODE_ENV: 'production',
        PORT: 5000,
      },
      // Structured log output
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      error_file: '/var/log/dawntrader/error.log',
      out_file: '/var/log/dawntrader/out.log',
      merge_logs: true,
      // Graceful shutdown (allow open trades to finalize)
      kill_timeout: 10000,
      listen_timeout: 30000,
      // Restart delay to avoid rapid restart loops
      restart_delay: 5000,
      max_restarts: 10,
      min_uptime: '30s',
    },
    {
      name: 'dawntrader-ml',
      script: '/opt/ml-venv/bin/python3',
      args: 'services/ml_service.py',
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      watch: false,
      max_memory_restart: '512M',
      env: {
        ML_SERVICE_PORT: 5001,
      },
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      error_file: '/var/log/dawntrader/ml-error.log',
      out_file: '/var/log/dawntrader/ml-out.log',
      merge_logs: true,
      kill_timeout: 5000,
      restart_delay: 3000,
      max_restarts: 5,
      min_uptime: '10s',
    },
  ],
};
