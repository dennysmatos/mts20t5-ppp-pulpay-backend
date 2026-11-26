import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

process.env.NODE_ENV = 'test';

import { resetDatabase } from '../../../src/config/database.js';
import * as authController from '../../../src/controllers/authController.js';
import * as accountController from '../../../src/controllers/accountController.js';
import * as transactionController from '../../../src/controllers/transactionController.js';
import * as webhookController from '../../../src/controllers/webhookController.js';

const createMockRes = () => ({
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
});

describe('Controllers: Orquestração HTTP, Status Codes e Encaminhamento de Erros', () => {
  beforeEach(() => {
    process.env.NODE_ENV = 'test';
    resetDatabase();
  });

  it('authController deve retornar 201 no register, 200 no login e encaminhar erros via next()', async () => {
    const resRegister = createMockRes();
    await authController.register(
      {
        body: {
          name: 'Controller Merchant',
          email: 'ctrl@pulsar.com',
          password: 'Password123'
        }
      },
      resRegister,
      (err) => assert.fail(err)
    );
    assert.equal(resRegister.statusCode, 201);
    assert.ok(resRegister.body.token);

    let registerErr = null;
    await authController.register({ body: {} }, createMockRes(), (err) => {
      registerErr = err;
    });
    assert.equal(registerErr.statusCode, 400);

    const resLogin = createMockRes();
    await authController.login(
      {
        body: {
          email: 'ctrl@pulsar.com',
          password: 'Password123'
        }
      },
      resLogin,
      (err) => assert.fail(err)
    );
    assert.equal(resLogin.statusCode, 200);
    assert.ok(resLogin.body.token);

    let loginErr = null;
    await authController.login({ body: {} }, createMockRes(), (err) => {
      loginErr = err;
    });
    assert.equal(loginErr.statusCode, 400);
  });

  it('accountController, transactionController e webhookController devem retornar 201/200 e encaminhar erros via next()', async () => {
    const user = { id: 'merchant-ctrl-01' };

    // 1. Criar Conta (201) + erro (422)
    const resCreateAcc = createMockRes();
    await accountController.createAccount(
      { user, body: { name: 'Conta Ctrl', initialBalance: 300 } },
      resCreateAcc,
      (err) => assert.fail(err)
    );
    assert.equal(resCreateAcc.statusCode, 201);
    const accountId = resCreateAcc.body.account._id;

    let createAccErr = null;
    await accountController.createAccount(
      { user, body: { initialBalance: -10 } },
      createMockRes(),
      (err) => {
        createAccErr = err;
      }
    );
    assert.equal(createAccErr.statusCode, 422);

    // 2. Listar e Consultar Conta (200) + erro (404)
    const resListAcc = createMockRes();
    await accountController.listAccounts({ user }, resListAcc, (err) =>
      assert.fail(err)
    );
    assert.equal(resListAcc.statusCode, 200);
    assert.equal(resListAcc.body.total, 1);

    const resGetAcc = createMockRes();
    await accountController.getAccountById(
      { user, params: { id: accountId } },
      resGetAcc,
      (err) => assert.fail(err)
    );
    assert.equal(resGetAcc.statusCode, 200);

    let getAccErr = null;
    await accountController.getAccountById(
      { user, params: { id: 'inexistente' } },
      createMockRes(),
      (err) => {
        getAccErr = err;
      }
    );
    assert.equal(getAccErr.statusCode, 404);

    // 3. Criar Transação (201), Replay Idempotente (200) e erro (400)
    const resCreateTx = createMockRes();
    await transactionController.createTransaction(
      {
        user,
        headers: { 'idempotency-key': 'idem-ctrl-1' },
        body: { accountId, type: 'CHARGE', amount: 100, status: 'PAID' }
      },
      resCreateTx,
      (err) => assert.fail(err)
    );
    assert.equal(resCreateTx.statusCode, 201);
    const txId = resCreateTx.body.transaction._id;

    const resReplayTx = createMockRes();
    await transactionController.createTransaction(
      {
        user,
        headers: { 'idempotency-key': 'idem-ctrl-1' },
        body: { accountId, type: 'CHARGE', amount: 100, status: 'PAID' }
      },
      resReplayTx,
      (err) => assert.fail(err)
    );
    assert.equal(resReplayTx.statusCode, 200);
    assert.equal(resReplayTx.body.idempotentReplayed, true);

    let createTxErr = null;
    await transactionController.createTransaction(
      { user, headers: {}, body: {} },
      createMockRes(),
      (err) => {
        createTxErr = err;
      }
    );
    assert.equal(createTxErr.statusCode, 400);

    // 4. Listar, Consultar e Estornar Transação (200) + erros (404/422)
    const resListTx = createMockRes();
    await transactionController.listTransactions(
      { user, query: {} },
      resListTx,
      (err) => assert.fail(err)
    );
    assert.equal(resListTx.statusCode, 200);

    const resGetTx = createMockRes();
    await transactionController.getTransactionById(
      { user, params: { id: txId } },
      resGetTx,
      (err) => assert.fail(err)
    );
    assert.equal(resGetTx.statusCode, 200);

    let getTxErr = null;
    await transactionController.getTransactionById(
      { user, params: { id: 'tx-404' } },
      createMockRes(),
      (err) => {
        getTxErr = err;
      }
    );
    assert.equal(getTxErr.statusCode, 404);

    const resRefundTx = createMockRes();
    await transactionController.refundTransaction(
      { user, params: { id: txId }, body: { reason: 'Teste Controller' } },
      resRefundTx,
      (err) => assert.fail(err)
    );
    assert.equal(resRefundTx.statusCode, 200);
    assert.equal(resRefundTx.body.transaction.status, 'REFUNDED');

    let refundTxErr = null;
    await transactionController.refundTransaction(
      { user, params: { id: txId }, body: {} },
      createMockRes(),
      (err) => {
        refundTxErr = err;
      }
    );
    assert.equal(refundTxErr.statusCode, 422);

    // 5. Criar, Listar e Testar Webhook (201/200) + erros (400/404)
    const resCreateWh = createMockRes();
    await webhookController.createWebhook(
      { user, body: { url: 'https://ctrl.pulsar.com/webhook' } },
      resCreateWh,
      (err) => assert.fail(err)
    );
    assert.equal(resCreateWh.statusCode, 201);

    let createWhErr = null;
    await webhookController.createWebhook(
      { user, body: { url: 'invalida' } },
      createMockRes(),
      (err) => {
        createWhErr = err;
      }
    );
    assert.equal(createWhErr.statusCode, 400);

    const resListWh = createMockRes();
    await webhookController.listWebhooks({ user }, resListWh, (err) =>
      assert.fail(err)
    );
    assert.equal(resListWh.statusCode, 200);

    const resTestWh = createMockRes();
    await webhookController.testWebhook(
      { user, body: { event: 'webhook.test' } },
      resTestWh,
      (err) => assert.fail(err)
    );
    assert.equal(resTestWh.statusCode, 200);

    let testWhErr = null;
    await webhookController.testWebhook(
      { user, body: { webhookId: 'wh-404' } },
      createMockRes(),
      (err) => {
        testWhErr = err;
      }
    );
    assert.equal(testWhErr.statusCode, 404);
  });
});
