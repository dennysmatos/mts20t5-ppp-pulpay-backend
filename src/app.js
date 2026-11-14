import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import { setupSwagger } from './config/swagger.js';
import authRoutes from './routes/authRoutes.js';
import accountRoutes from './routes/accountRoutes.js';
import transactionRoutes from './routes/transactionRoutes.js';
import webhookRoutes from './routes/webhookRoutes.js';
import { errorHandler, notFoundHandler } from './middlewares/errorHandler.js';

const app = express();

// Middlewares Globais
app.use(cors());
app.use(morgan('dev'));
app.use(express.json());

// Documentação Interativa OpenAPI 3.0 (Swagger UI)
setupSwagger(app);

// Rota de Healthcheck
app.get('/health', (_req, res) => {
  res.status(200).json({
    status: 'ok',
    service: 'Pulsar Payments API',
    timestamp: new Date().toISOString()
  });
});

// Rotas de Domínio
app.use('/auth', authRoutes);
app.use('/accounts', accountRoutes);
app.use('/transactions', transactionRoutes);
app.use('/webhooks', webhookRoutes);

// Tratamento de rotas inexistentes e erros centralizados
app.use(notFoundHandler);
app.use(errorHandler);

export default app;

