import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import jwt from 'jsonwebtoken';
import { authMiddleware } from '../../../src/middlewares/authMiddleware.js';
import {
  AppError,
  notFoundHandler,
  errorHandler
} from '../../../src/middlewares/errorHandler.js';

const createMockRes = () => {
  const res = {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    }
  };
  return res;
};

describe('Middlewares: authMiddleware e errorHandler', () => {
  describe('authMiddleware', () => {
    it('deve rejeitar requisição sem header Authorization (401)', () => {
      const req = { headers: {} };
      const res = createMockRes();
      let capturedError = null;

      authMiddleware(req, res, (err) => {
        capturedError = err;
      });

      assert.ok(capturedError instanceof AppError);
      assert.equal(capturedError.statusCode, 401);
      assert.equal(capturedError.code, 'UNAUTHORIZED');
    });

    it('deve rejeitar header Authorization com Bearer vazio (401)', () => {
      const req = { headers: { authorization: 'Bearer    ' } };
      const res = createMockRes();
      let capturedError = null;

      authMiddleware(req, res, (err) => {
        capturedError = err;
      });

      assert.ok(capturedError instanceof AppError);
      assert.equal(capturedError.statusCode, 401);
    });

    it('deve rejeitar token JWT inválido ou assinado com segredo incorreto (401)', () => {
      const badToken = jwt.sign({ sub: '123' }, 'wrong_secret');
      const req = { headers: { authorization: `Bearer ${badToken}` } };
      const res = createMockRes();
      let capturedError = null;

      authMiddleware(req, res, (err) => {
        capturedError = err;
      });

      assert.ok(capturedError instanceof AppError);
      assert.equal(capturedError.statusCode, 401);
      assert.equal(capturedError.code, 'UNAUTHORIZED');
    });

    it('deve autenticar com sucesso e popular req.user quando o token JWT é válido', () => {
      const secret = process.env.JWT_SECRET || 'pulsar_super_secret_jwt_key_2026';
      const validToken = jwt.sign(
        { sub: 'merchant-99', email: 'qa@pulsar.com', name: 'QA Merchant' },
        secret,
        { expiresIn: '1h' }
      );

      const req = { headers: { authorization: `Bearer ${validToken}` } };
      const res = createMockRes();
      let capturedError = null;

      authMiddleware(req, res, (err) => {
        capturedError = err;
      });

      assert.equal(capturedError, undefined);
      assert.deepEqual(req.user, {
        id: 'merchant-99',
        email: 'qa@pulsar.com',
        name: 'QA Merchant'
      });
    });
  });

  describe('notFoundHandler & errorHandler', () => {
    it('notFoundHandler deve retornar 404 com método e URL original', () => {
      const req = { method: 'GET', originalUrl: '/rota-inexistente' };
      const res = createMockRes();

      notFoundHandler(req, res);

      assert.equal(res.statusCode, 404);
      assert.equal(res.body.error, 'NOT_FOUND');
      assert.match(res.body.message, /GET \/rota-inexistente/);
    });

    it('errorHandler deve formatar AppError com statusCode, code e details opcionais', () => {
      const err = new AppError('Saldo insuficiente', 422, 'INSUFFICIENT_FUNDS', {
        required: 100,
        available: 20
      });
      const res = createMockRes();

      errorHandler(err, {}, res, () => {});

      assert.equal(res.statusCode, 422);
      assert.deepEqual(res.body, {
        error: 'INSUFFICIENT_FUNDS',
        message: 'Saldo insuficiente',
        details: { required: 100, available: 20 }
      });
    });

    it('errorHandler deve retornar 400 INVALID_JSON quando o body parser falha (entity.parse.failed)', () => {
      const parseErr = new Error('Unexpected token');
      parseErr.type = 'entity.parse.failed';
      const res = createMockRes();

      errorHandler(parseErr, {}, res, () => {});

      assert.equal(res.statusCode, 400);
      assert.equal(res.body.error, 'INVALID_JSON');
    });

    it('errorHandler deve retornar 500 INTERNAL_SERVER_ERROR para exceções genéricas não tratadas', () => {
      const genericErr = new Error('Falha inesperada');
      const res = createMockRes();

      errorHandler(genericErr, {}, res, () => {});

      assert.equal(res.statusCode, 500);
      assert.equal(res.body.error, 'INTERNAL_SERVER_ERROR');
    });
  });
});

