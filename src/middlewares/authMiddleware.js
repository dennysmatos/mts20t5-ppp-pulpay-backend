import jwt from 'jsonwebtoken';
import { AppError } from './errorHandler.js';

export const authMiddleware = (req, _res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return next(
      new AppError(
        'Token de autenticação ausente ou malformado. Utilize o formato Authorization: Bearer <token>',
        401,
        'UNAUTHORIZED'
      )
    );
  }

  const token = authHeader.slice(7).trim();
  if (!token) {
    return next(
      new AppError('Token JWT não informado no header Authorization', 401, 'UNAUTHORIZED')
    );
  }

  const secret = process.env.JWT_SECRET || 'pulsar_super_secret_jwt_key_2026';

  try {
    const decoded = jwt.verify(token, secret);
    req.user = {
      id: decoded.sub || decoded.id,
      email: decoded.email,
      name: decoded.name
    };
    return next();
  } catch (_error) {
    return next(
      new AppError('Token JWT inválido ou expirado', 401, 'UNAUTHORIZED')
    );
  }
};

export default authMiddleware;

