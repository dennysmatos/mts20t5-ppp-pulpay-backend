import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

process.env.NODE_ENV = 'test';

import { resetDatabase } from '../../../src/config/database.js';
import {
  createAccount,
  listAccounts,
  getAccountById
} from '../../../src/services/accountService.js';

describe('Service: accountService (Gestão de Carteiras e Trava de Saldo Negativo)', () => {
  const merchantId = 'merchant-acc-01';

  beforeEach(() => {
    process.env.NODE_ENV = 'test';
    resetDatabase();
  });

  it('deve criar conta com valores padrão (saldo 0, moeda BRL, status ACTIVE)', async () => {
    const account = await createAccount(merchantId, {});

    assert.equal(account.merchantId, merchantId);
    assert.equal(account.name, 'Conta Principal');
    assert.equal(account.currency, 'BRL');
    assert.equal(account.balance, 0);
    assert.equal(account.status, 'ACTIVE');
  });

  it('deve criar conta aceitando initialBalance ou balance positivo com arredondamento de 2 casas', async () => {
    const acc1 = await createAccount(merchantId, {
      name: 'Reserva',
      initialBalance: 1250.456
    });
    const acc2 = await createAccount(merchantId, {
      name: 'Operacional',
      balance: 300
    });

    assert.equal(acc1.balance, 1250.46);
    assert.equal(acc2.balance, 300);
  });

  it('deve rejeitar criação de conta com saldo inicial negativo (422 NEGATIVE_BALANCE_NOT_ALLOWED)', async () => {
    await assert.rejects(
      () => createAccount(merchantId, { initialBalance: -0.01 }),
      (err) =>
        err.statusCode === 422 && err.code === 'NEGATIVE_BALANCE_NOT_ALLOWED'
    );
  });

  it('deve rejeitar saldo inicial não numérico (400 INVALID_BALANCE)', async () => {
    await assert.rejects(
      () => createAccount(merchantId, { initialBalance: 'abc' }),
      (err) => err.statusCode === 400 && err.code === 'INVALID_BALANCE'
    );
  });

  it('deve rejeitar moeda diferente de BRL (422 UNSUPPORTED_CURRENCY)', async () => {
    await assert.rejects(
      () => createAccount(merchantId, { initialBalance: 100, currency: 'USD' }),
      (err) => err.statusCode === 422 && err.code === 'UNSUPPORTED_CURRENCY'
    );
  });

  it('deve listar apenas as contas do lojista autenticado e consultar por ID', async () => {
    const created = await createAccount(merchantId, {
      name: 'Carteira QA',
      initialBalance: 500
    });
    await createAccount('outro-merchant', {
      name: 'Carteira Terceiro',
      initialBalance: 900
    });

    const accounts = await listAccounts(merchantId);
    assert.equal(accounts.length, 1);
    assert.equal(accounts[0]._id, created._id);

    const fetched = await getAccountById(merchantId, created._id);
    assert.equal(fetched.name, 'Carteira QA');
  });

  it('deve lançar 404 ACCOUNT_NOT_FOUND ao consultar conta inexistente ou de outro lojista', async () => {
    const otherAccount = await createAccount('outro-merchant', {
      initialBalance: 100
    });

    await assert.rejects(
      () => getAccountById(merchantId, otherAccount._id),
      (err) => err.statusCode === 404 && err.code === 'ACCOUNT_NOT_FOUND'
    );
  });
});
