import { describe, it, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

process.env.DB_FILE = 'data/test-database-transactions.json';

import {
  getDatabaseFilePath,
  resetDatabase,
  readDatabase,
  writeDatabase
} from '../../../src/config/database.js';
import { createAccount, getAccountById } from '../../../src/services/accountService.js';
import { createWebhook } from '../../../src/services/webhookService.js';
import {
  createTransaction,
  listTransactions,
  getTransactionById,
  refundTransaction
} from '../../../src/services/transactionService.js';

describe('Service: transactionService (Saldo, Idempotência e Máquina de Estados)', () => {
  const testDbPath = getDatabaseFilePath();
  const merchantId = 'merchant-tx-01';
  let account;

  beforeEach(async () => {
    process.env.DB_FILE = 'data/test-database-transactions.json';
    resetDatabase();
    account = await createAccount(merchantId, {
      name: 'Conta Principal QA',
      initialBalance: 500.0
    });
  });

  after(() => {
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }
  });

  describe('createTransaction - Regras Financeiras e Webhooks', () => {
    it('deve creditar saldo ao criar transação CHARGE/CREDIT com status PAID e disparar webhook', async () => {
      await createWebhook(merchantId, {
        url: 'https://loja.com/webhooks/pulsar'
      });

      const result = await createTransaction(merchantId, {
        accountId: account._id,
        type: 'CHARGE',
        amount: 150.25,
        status: 'PAID',
        description: 'Cobrança PIX #01'
      });

      assert.equal(result.idempotentReplayed, false);
      assert.equal(result.transaction.status, 'PAID');
      assert.equal(result.accountBalance, 650.25);
      assert.equal(result.webhookDeliveries.length, 1);
      assert.equal(result.webhookDeliveries[0].event, 'transaction.paid');
      assert.match(
        result.webhookDeliveries[0].headers['X-Signature'],
        /^sha256=[a-f0-9]{64}$/
      );
    });

    it('deve debitar saldo ao criar transação PAYMENT/DEBIT com status PAID quando há saldo suficiente', async () => {
      const result = await createTransaction(merchantId, {
        accountId: account._id,
        type: 'PAYMENT',
        amount: 200.0,
        status: 'PAID',
        description: 'Pagamento Fornecedor'
      });

      assert.equal(result.accountBalance, 300.0);
      const updatedAccount = await getAccountById(merchantId, account._id);
      assert.equal(updatedAccount.balance, 300.0);
    });

    it('deve bloquear transação de débito que deixe o saldo negativo (422 INSUFFICIENT_FUNDS)', async () => {
      await assert.rejects(
        () =>
          createTransaction(merchantId, {
            accountId: account._id,
            type: 'DEBIT',
            amount: 500.01,
            status: 'PAID'
          }),
        (err) => err.statusCode === 422 && err.code === 'INSUFFICIENT_FUNDS'
      );

      const unchangedAccount = await getAccountById(merchantId, account._id);
      assert.equal(unchangedAccount.balance, 500.0);
    });

    it('não deve alterar saldo em transações PENDING ou FAILED (disparando webhook transaction.failed)', async () => {
      await createWebhook(merchantId, {
        url: 'https://loja.com/webhooks/pulsar'
      });

      const pendingResult = await createTransaction(merchantId, {
        accountId: account._id,
        type: 'CHARGE',
        amount: 300.0,
        status: 'PENDING'
      });
      assert.equal(pendingResult.accountBalance, 500.0);
      assert.equal(pendingResult.webhookDeliveries.length, 0);

      const failedResult = await createTransaction(merchantId, {
        accountId: account._id,
        type: 'PAYMENT',
        amount: 100.0,
        status: 'FAILED'
      });
      assert.equal(failedResult.accountBalance, 500.0);
      assert.equal(failedResult.webhookDeliveries.length, 1);
      assert.equal(failedResult.webhookDeliveries[0].event, 'transaction.failed');
    });
  });

  describe('createTransaction - Idempotência (Idempotency-Key)', () => {
    it('deve retornar a transação original sem duplicar saldo quando Idempotency-Key já foi processada', async () => {
      const firstCall = await createTransaction(
        merchantId,
        {
          accountId: account._id,
          type: 'CHARGE',
          amount: 100.0,
          status: 'PAID'
        },
        'idem-key-unique-001'
      );

      assert.equal(firstCall.idempotentReplayed, false);
      assert.equal(firstCall.accountBalance, 600.0);

      const secondCall = await createTransaction(
        merchantId,
        {
          accountId: account._id,
          type: 'CHARGE',
          amount: 100.0,
          status: 'PAID'
        },
        'idem-key-unique-001'
      );

      assert.equal(secondCall.idempotentReplayed, true);
      assert.equal(secondCall.transaction._id, firstCall.transaction._id);

      const currentAccount = await getAccountById(merchantId, account._id);
      assert.equal(currentAccount.balance, 600.0);
    });
  });

  describe('createTransaction - Validações de Entrada e Conta', () => {
    it('deve validar accountId ausente (400), amount inválido (400) e amount <= 0 (422)', async () => {
      await assert.rejects(
        () => createTransaction(merchantId, { amount: 100 }),
        (err) => err.statusCode === 400 && err.code === 'MISSING_ACCOUNT_ID'
      );

      await assert.rejects(
        () =>
          createTransaction(merchantId, {
            accountId: account._id,
            amount: 'invalido'
          }),
        (err) => err.statusCode === 400 && err.code === 'INVALID_AMOUNT'
      );

      await assert.rejects(
        () =>
          createTransaction(merchantId, {
            accountId: account._id,
            amount: 0
          }),
        (err) =>
          err.statusCode === 422 && err.code === 'INVALID_TRANSACTION_AMOUNT'
      );
    });

    it('deve validar type inválido (400), status inválido (400) e criação direta como REFUNDED (422)', async () => {
      await assert.rejects(
        () =>
          createTransaction(merchantId, {
            accountId: account._id,
            amount: 50,
            type: 'PIX_INVALIDO'
          }),
        (err) =>
          err.statusCode === 400 && err.code === 'INVALID_TRANSACTION_TYPE'
      );

      await assert.rejects(
        () =>
          createTransaction(merchantId, {
            accountId: account._id,
            amount: 50,
            status: 'CANCELLED'
          }),
        (err) =>
          err.statusCode === 400 && err.code === 'INVALID_TRANSACTION_STATUS'
      );

      await assert.rejects(
        () =>
          createTransaction(merchantId, {
            accountId: account._id,
            amount: 50,
            status: 'REFUNDED'
          }),
        (err) => err.statusCode === 422 && err.code === 'INVALID_INITIAL_STATUS'
      );
    });

    it('deve rejeitar conta inexistente (404) ou conta com status BLOCKED (422)', async () => {
      await assert.rejects(
        () =>
          createTransaction(merchantId, {
            accountId: 'conta-inexistente',
            amount: 50
          }),
        (err) => err.statusCode === 404 && err.code === 'ACCOUNT_NOT_FOUND'
      );

      account.status = 'BLOCKED';
      await account.save();

      await assert.rejects(
        () =>
          createTransaction(merchantId, {
            accountId: account._id,
            amount: 50
          }),
        (err) => err.statusCode === 422 && err.code === 'ACCOUNT_BLOCKED'
      );
    });
  });

  describe('listTransactions & getTransactionById', () => {
    it('deve listar transações com filtros (accountId, status, type) e buscar por ID', async () => {
      const { transaction: tx1 } = await createTransaction(merchantId, {
        accountId: account._id,
        type: 'CHARGE',
        amount: 80,
        status: 'PAID'
      });
      await createTransaction(merchantId, {
        accountId: account._id,
        type: 'PAYMENT',
        amount: 30,
        status: 'PENDING'
      });

      const all = await listTransactions(merchantId);
      assert.equal(all.length, 2);

      const paidCharges = await listTransactions(merchantId, {
        accountId: account._id,
        status: 'paid',
        type: 'charge'
      });
      assert.equal(paidCharges.length, 1);
      assert.equal(paidCharges[0]._id, tx1._id);

      const fetched = await getTransactionById(merchantId, tx1._id);
      assert.equal(fetched.amount, 80);

      await assert.rejects(
        () => getTransactionById(merchantId, 'tx-inexistente'),
        (err) => err.statusCode === 404 && err.code === 'TRANSACTION_NOT_FOUND'
      );
    });
  });

  describe('refundTransaction - Máquina de Estados e Reversão Financeira', () => {
    it('deve estornar transação CHARGE (PAID -> REFUNDED), debitando o valor da conta e disparando webhook', async () => {
      await createWebhook(merchantId, {
        url: 'https://loja.com/webhooks/pulsar'
      });

      const { transaction } = await createTransaction(merchantId, {
        accountId: account._id,
        type: 'CHARGE',
        amount: 120.0,
        status: 'PAID'
      });

      const refundResult = await refundTransaction(merchantId, transaction._id, {
        reason: 'Desistência da compra'
      });

      assert.equal(refundResult.transaction.status, 'REFUNDED');
      assert.equal(refundResult.transaction.refundReason, 'Desistência da compra');
      assert.ok(refundResult.transaction.refundedAt);
      assert.equal(refundResult.accountBalance, 500.0);
      assert.equal(refundResult.webhookDeliveries.length, 1);
      assert.equal(refundResult.webhookDeliveries[0].event, 'transaction.refunded');
    });

    it('deve estornar transação PAYMENT/DEBIT (PAID -> REFUNDED), devolvendo o saldo à conta', async () => {
      const { transaction } = await createTransaction(merchantId, {
        accountId: account._id,
        type: 'DEBIT',
        amount: 200.0,
        status: 'PAID'
      });

      const refundResult = await refundTransaction(merchantId, transaction._id);
      assert.equal(refundResult.transaction.status, 'REFUNDED');
      assert.equal(refundResult.accountBalance, 500.0);
    });

    it('deve impedir estorno de transação PENDING, FAILED ou já REFUNDED (422)', async () => {
      const { transaction: pendingTx } = await createTransaction(merchantId, {
        accountId: account._id,
        type: 'CHARGE',
        amount: 50,
        status: 'PENDING'
      });

      const { transaction: failedTx } = await createTransaction(merchantId, {
        accountId: account._id,
        type: 'CHARGE',
        amount: 50,
        status: 'FAILED'
      });

      await assert.rejects(
        () => refundTransaction(merchantId, pendingTx._id),
        (err) =>
          err.statusCode === 422 && err.code === 'INVALID_STATE_TRANSITION'
      );

      await assert.rejects(
        () => refundTransaction(merchantId, failedTx._id),
        (err) =>
          err.statusCode === 422 && err.code === 'INVALID_STATE_TRANSITION'
      );

      const { transaction: paidTx } = await createTransaction(merchantId, {
        accountId: account._id,
        type: 'CHARGE',
        amount: 50,
        status: 'PAID'
      });

      await refundTransaction(merchantId, paidTx._id);

      await assert.rejects(
        () => refundTransaction(merchantId, paidTx._id),
        (err) =>
          err.statusCode === 422 && err.code === 'TRANSACTION_ALREADY_REFUNDED'
      );
    });

    it('deve impedir estorno de cobrança quando o saldo atual da conta for insuficiente (422 INSUFFICIENT_FUNDS_FOR_REFUND)', async () => {
      const zeroAccount = await createAccount(merchantId, {
        initialBalance: 0
      });

      const { transaction: chargeTx } = await createTransaction(merchantId, {
        accountId: zeroAccount._id,
        type: 'CHARGE',
        amount: 100,
        status: 'PAID'
      });

      // Consome todo o saldo com um pagamento
      await createTransaction(merchantId, {
        accountId: zeroAccount._id,
        type: 'PAYMENT',
        amount: 100,
        status: 'PAID'
      });

      await assert.rejects(
        () => refundTransaction(merchantId, chargeTx._id),
        (err) =>
          err.statusCode === 422 && err.code === 'INSUFFICIENT_FUNDS_FOR_REFUND'
      );
    });

    it('deve retornar 404 quando a transação ou conta vinculada não existir', async () => {
      await assert.rejects(
        () => refundTransaction(merchantId, 'id-inexistente'),
        (err) => err.statusCode === 404 && err.code === 'TRANSACTION_NOT_FOUND'
      );

      const { transaction: paidTx } = await createTransaction(merchantId, {
        accountId: account._id,
        type: 'CHARGE',
        amount: 50,
        status: 'PAID'
      });

      // Remove a conta do banco para testar proteção de integridade (404 ACCOUNT_NOT_FOUND)
      const db = readDatabase();
      db.accounts = [];
      writeDatabase(db);

      await assert.rejects(
        () => refundTransaction(merchantId, paidTx._id),
        (err) => err.statusCode === 404 && err.code === 'ACCOUNT_NOT_FOUND'
      );
    });
  });
});

