import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import jwt from 'jsonwebtoken';

process.env.NODE_ENV = 'test';

import { resetDatabase } from '../../../src/config/database.js';
import { registerMerchant, loginMerchant } from '../../../src/services/authService.js';

describe('Service: authService (Registro, Hash bcryptjs e Login JWT)', () => {
  beforeEach(() => {
    process.env.NODE_ENV = 'test';
    resetDatabase();
  });

  describe('registerMerchant', () => {
    it('deve registrar um novo lojista com senha criptografada e retornar token JWT', async () => {
      const result = await registerMerchant({
        name: 'Pulsar Tech LTDA',
        email: 'FINANCEIRO@PULSAR.COM',
        password: 'Password@123',
        document: '12.345.678/0001-99'
      });

      assert.ok(result.token);
      assert.equal(result.merchant.name, 'Pulsar Tech LTDA');
      assert.equal(result.merchant.email, 'financeiro@pulsar.com');
      assert.equal(result.merchant.password, undefined);

      const decoded = jwt.verify(
        result.token,
        process.env.JWT_SECRET || 'pulsar_super_secret_jwt_key_2026'
      );
      assert.equal(decoded.sub, result.merchant._id);
    });

    it('deve lançar erro 400 VALIDATION_ERROR quando campos obrigatórios estiverem ausentes', async () => {
      await assert.rejects(
        () => registerMerchant({ name: 'Incompleto', email: '' }),
        (err) => err.statusCode === 400 && err.code === 'VALIDATION_ERROR'
      );
    });

    it('deve lançar erro 400 WEAK_PASSWORD quando a senha tiver menos de 6 caracteres', async () => {
      await assert.rejects(
        () =>
          registerMerchant({
            name: 'Loja',
            email: 'loja@teste.com',
            password: '123'
          }),
        (err) => err.statusCode === 400 && err.code === 'WEAK_PASSWORD'
      );
    });

    it('deve lançar erro 409 EMAIL_ALREADY_EXISTS ao tentar cadastrar e-mail duplicado', async () => {
      await registerMerchant({
        name: 'Loja 1',
        email: 'duplicado@pulsar.com',
        password: 'Password@123'
      });

      await assert.rejects(
        () =>
          registerMerchant({
            name: 'Loja 2',
            email: 'DUPLICADO@PULSAR.COM',
            password: 'Password@456'
          }),
        (err) => err.statusCode === 409 && err.code === 'EMAIL_ALREADY_EXISTS'
      );
    });
  });

  describe('loginMerchant', () => {
    beforeEach(async () => {
      await registerMerchant({
        name: 'Loja Login',
        email: 'login@pulsar.com',
        password: 'SecretPassword123'
      });
    });

    it('deve autenticar com sucesso e retornar token Bearer quando credenciais são válidas', async () => {
      const result = await loginMerchant({
        email: 'LOGIN@PULSAR.COM',
        password: 'SecretPassword123'
      });

      assert.equal(result.type, 'Bearer');
      assert.ok(result.token);
      assert.equal(result.merchant.email, 'login@pulsar.com');
      assert.equal(result.merchant.password, undefined);
    });

    it('deve lançar erro 400 VALIDATION_ERROR se email ou password não forem informados', async () => {
      await assert.rejects(
        () => loginMerchant({ email: 'login@pulsar.com' }),
        (err) => err.statusCode === 400 && err.code === 'VALIDATION_ERROR'
      );
    });

    it('deve lançar erro 401 INVALID_CREDENTIALS quando o e-mail não existe', async () => {
      await assert.rejects(
        () =>
          loginMerchant({
            email: 'inexistente@pulsar.com',
            password: 'SecretPassword123'
          }),
        (err) => err.statusCode === 401 && err.code === 'INVALID_CREDENTIALS'
      );
    });

    it('deve lançar erro 401 INVALID_CREDENTIALS quando a senha está incorreta', async () => {
      await assert.rejects(
        () =>
          loginMerchant({
            email: 'login@pulsar.com',
            password: 'SenhaErrada999'
          }),
        (err) => err.statusCode === 401 && err.code === 'INVALID_CREDENTIALS'
      );
    });
  });
});
