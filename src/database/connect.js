/**
 * Conexão centralizada ao MongoDB
 * - Usa variáveis de ambiente (.env)
 * - Loga estados da conexão
 * - Previne crashes silenciosos
 * - Preparado para produção (PM2 / Railway)
 */

const mongoose = require('mongoose');

const MONGO_URI = process.env.MONGO_URI;

if (!MONGO_URI) {
  console.error('❌ MONGO_URI não definida no .env');
  process.exit(1); // Impede o bot de arrancar sem BD
}

/**
 * Opções recomendadas para produção
 */
const options = {
  autoIndex: false,        // Melhor performance em produção
  serverSelectionTimeoutMS: 10000, // Timeout de 10s
};

/**
 * Função de conexão
 */
async function connectMongo() {
  try {
    await mongoose.connect(MONGO_URI, options);
    console.log('✅ MongoDB connected');
  } catch (err) {
    console.error('❌ MongoDB connection error:', err.message);
    process.exit(1); // Falha crítica
  }
}

/**
 * Eventos de estado da conexão
 */
mongoose.connection.on('connected', () => {
  console.log('🟢 MongoDB connection established');
});

mongoose.connection.on('disconnected', () => {
  console.warn('🟠 MongoDB disconnected');
});

mongoose.connection.on('error', err => {
  console.error('🔴 MongoDB error:', err.message);
});

/**
 * Reconexão automática se o processo continuar vivo
 */
process.on('SIGINT', async () => {
  await mongoose.connection.close();
  console.log('🛑 MongoDB connection closed (SIGINT)');
  process.exit(0);
});

// Inicia conexão
connectMongo();
