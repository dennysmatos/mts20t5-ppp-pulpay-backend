import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

process.env.NODE_ENV = 'test';

import { resetDatabase } from '../../../src/config/database.js';
import Merchant from '../../../src/models/Merchant.js';
import Account from '../../../src/models/Account.js';
import Transaction from '../../../src/models/Transaction.js';
import Webhook from '../../../src/models/Webhook.js';

describe('Models: Operações de Domínio com Persistência PostgreSQL', () => {
  beforeEach(() => {
    process.env.NODE_ENV = 'test';
    resetDatabase();
  });

  describe('Merchant Model', () => {
    it('deve criar lojista, atualizar via save() e ocultar password no toJSON()', async () => {
      const merchant = await Merchant.create({
        name: 'Loja Teste',
        email: 'CONTATO@LOJATESTE.COM',
        document: '12345678000199',
        password: 'hashed_password_123'
      });

      assert.ok(merchant._id);
      assert.equal(merchant.email, 'contato@lojateste.com');
      assert.equal(merchant.password, 'hashed_password_123');

      const json = merchant.toJSON();
      assert.equal(json.password, undefined);
      assert.equal(json.name, 'Loja Teste');

      merchant.name = 'Loja Teste Atualizada';
      await merchant.save();

      const foundById = await Merchant.findOne({ id: merchant.id });
      assert.equal(foundById.name, 'Loja Teste Atualizada');

      const list = await Merchant.find({ email: 'contato@lojateste.com' });
      assert.equal(list.length, 1);
    });
  });

  describe('Account Model', () => {
    it('deve criar conta, buscar por filtro e persistir alterações com save()', async () => {
      const account = await Account.create({
        merchantId: 'merch-1',
        name: 'Carteira Principal',
        balance: 100.555
      });

      assert.equal(account.balance, 100.56);
      assert.equal(account.currency, 'BRL');

      account.balance = 250.0;
      await account.save();

      const reloaded = await Account.findOne({ _id: account._id, merchantId: 'merch-1' });
      assert.equal(reloaded.balance, 250);
      assert.equal(reloaded.toJSON().balance, 250);
    });
  });

  describe('Transaction Model', () => {
    it('deve criar transação, filtrar por status/idempotencyKey e atualizar via save()', async () => {
      const tx = await Transaction.create({
        merchantId: 'merch-1',
        accountId: 'acc-1',
        type: 'charge',
        amount: 99.9,
        status: 'pending',
        idempotencyKey: 'idem-123'
      });

      assert.equal(tx.type, 'CHARGE');
      assert.equal(tx.status, 'PENDING');
      assert.equal(tx.amount, 99.9);

      tx.status = 'PAID';
      await tx.save();

      const found = await Transaction.findOne({
        merchantId: 'merch-1',
        idempotencyKey: 'idem-123'
      });
      assert.equal(found.status, 'PAID');
      assert.equal(found.toJSON().idempotencyKey, 'idem-123');
    });
  });

  describe('Webhook Model', () => {
    it('deve criar webhook, filtrar por evento/boolean e salvar deliveryLogs', async () => {
      const wh = await Webhook.create({
        merchantId: 'merch-1',
        url: 'https://loja.com/webhook',
        events: ['transaction.paid'],
        active: true
      });

      const matchedByEvent = await Webhook.find({
        merchantId: 'merch-1',
        active: true,
        events: 'transaction.paid'
      });
      assert.equal(matchedByEvent.length, 1);

      const notMatched = await Webhook.find({
        merchantId: 'merch-1',
        active: true,
        events: 'transaction.refunded'
      });
      assert.equal(notMatched.length, 0);

      wh.deliveryLogs.push({
        event: 'transaction.paid',
        signature: 'sha256=abc',
        payload: { ok: true },
        status: 'SIMULATED',
        statusCode: 200
      });
      await wh.save();

      const foundOne = await Webhook.findOne({ _id: wh._id });
      assert.equal(foundOne.toJSON().deliveryLogs.length, 1);
    });
  });
});
