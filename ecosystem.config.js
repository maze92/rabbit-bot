module.exports = {
  apps: [
    {
      name: 'OzarkBot',                // Nome do processo
      script: 'src/index.js',          // Script principal do bot
      watch: false,                    // Não reinicia automaticamente por mudanças de arquivo
      instances: 1,                    // Apenas 1 instância
      autorestart: true,               // Reinicia automaticamente se travar
      max_restarts: 10,                // Máximo de 10 tentativas em caso de crash
      restart_delay: 5000,             // Aguarda 5 segundos antes de reiniciar
      env: {
        NODE_ENV: 'production',        // Variável de ambiente
        TOKEN: process.env.TOKEN,
        PORT: process.env.PORT || 3000,
        MONGODB_URI: process.env.MONGODB_URI
      },
      error_file: 'logs/err.log',      // Arquivo para logs de erro
      out_file: 'logs/out.log',        // Arquivo para logs padrão
      merge_logs: true,                // Mescla logs de várias instâncias
      log_date_format: 'YYYY-MM-DD HH:mm:ss'
    }
  ]
};
