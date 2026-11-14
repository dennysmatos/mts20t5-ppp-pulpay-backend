import app from './app.js';
import { initDatabase } from './config/database.js';

const PORT = Number(process.env.PORT) || 3000;

const startServer = () => {
  try {
    initDatabase();

    app.listen(PORT, () => {
      console.log(`🚀 [Pulsar Payments] Servidor rodando em http://localhost:${PORT}`);
      console.log(`📄 [Swagger UI] Documentação disponível em http://localhost:${PORT}/api-docs`);
    });
  } catch (error) {
    console.error('❌ [Pulsar Payments] Falha ao iniciar o servidor:', error.message);
    process.exit(1);
  }
};

startServer();
