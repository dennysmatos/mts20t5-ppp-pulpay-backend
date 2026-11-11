export class AppError extends Error {
  constructor(message, statusCode = 400, code = 'BAD_REQUEST', details = undefined) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
  }
}

export const notFoundHandler = (req, res) => {
  res.status(404).json({
    error: 'NOT_FOUND',
    message: `Rota ${req.method} ${req.originalUrl} não encontrada`
  });
};

export const errorHandler = (err, _req, res, _next) => {
  if (err instanceof AppError) {
    return res.status(err.statusCode).json({
      error: err.code,
      message: err.message,
      ...(err.details ? { details: err.details } : {})
    });
  }

  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({
      error: 'INVALID_JSON',
      message: 'Payload JSON malformado no corpo da requisição'
    });
  }

  console.error('[ErrorHandler] Erro interno:', err);
  return res.status(500).json({
    error: 'INTERNAL_SERVER_ERROR',
    message: 'Erro interno inesperado no servidor Pulsar Payments'
  });
};

export default errorHandler;
