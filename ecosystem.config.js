// ecosystem.config.js
module.exports = {
  apps: [
    {
      name: 'OzarkBot',
      script: 'src/index.js',

      // ✅ Evita duplicados do GameNews (e problemas de interval duplicado)
      instances: 1,
      exec_mode: 'fork',

      watch: false,

      // ✅ Auto-restart está ok
      autorestart: true,
      max_restarts: 10,
      restart_delay: 5000,

      // ✅ No Railway, as env vars já vêm do painel.
      // Mantemos só NODE_ENV e defaults seguros.
      env: {
        NODE_ENV: 'production'
      },
    }
  ]
};
