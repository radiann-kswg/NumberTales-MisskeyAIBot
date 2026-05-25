// PM2 プロセス設定
// package.json に "type": "module" があるため .cjs 拡張子で CommonJS として定義
/** @type {import('pm2').StartOptions} */
module.exports = {
  apps: [
    {
      name: 'numbertales-bot',
      script: 'dist/index.js',
      cwd: '/home/snine9801/NumberTales-MisskeyAIBot',

      // インスタンス数（シングルプロセス）
      instances: 1,

      // クラッシュ時の自動再起動
      autorestart: true,
      watch: false,

      // 最大メモリ超過時に再起動（512MB を目安に）
      max_memory_restart: '512M',

      // 異常終了のリトライ間隔（指数バックオフ: 最大5回, 1秒〜16秒）
      exp_backoff_restart_delay: 1000,
      max_restarts: 5,

      // ログ設定
      out_file: 'logs/out.log',
      error_file: 'logs/error.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,

      env_production: {
        NODE_ENV: 'production',
        LOG_LEVEL: 'info',
      },
    },
  ],
};
