import { describe, it, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';

process.env.DB_FILE = 'data/test-database-webhooks.json';

import { getDatabaseFilePath, resetDatabase } from '../../../src/config/database.js';
import {
  generateHmacSignature,
  createWebhook,
  listWebhooks,
  triggerEventForMerchant,
  simulateWebhook
} from '../../../src/services/webhookService.js';

describe('Service: webhookService (Cadastro, Simulação e Assinatura HMAC SHA-256)', () => {
  const testDbPath = getDatabaseFilePath();
  const merchantId = 'merchant-wh-01';

  beforeEach(() => {
    process.env.DB_FILE = 'data/test-database-webhooks.json';
    resetDatabase();
  });

  after(() => {
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }
  });

  it('deve gerar assinatura HMAC SHA-256 determinística no formato sha256=<hex>', () => {
    const payload = { event: 'webhook.test', amount: 150 };
    const secret = 'my_test_secret';

    const expectedHex = crypto
      .createHmac('sha256', secret)
      .update(JSON.stringify(payload))
      .digest('hex');

    const signatureFromObj = generateHmacSignature(payload, secret);
    const signatureFromString = generateHmacSignature(
      JSON.stringify(payload),
      secret
    );

    assert.equal(signatureFromObj, `sha256=${expectedHex}`);
    assert.equal(signatureFromString, `sha256=${expectedHex}`);
  });

  it('deve criar webhook com URL válida e eventos padrão, e listar por lojista', async () => {
    const wh = await createWebhook(merchantId, {
      url: 'https://api.minhaloja.com.br/webhooks'
    });

    assert.equal(wh.merchantId, merchantId);
    assert.equal(wh.url, 'https://api.minhaloja.com.br/webhooks');
    assert.deepEqual(wh.events, [
      'transaction.paid',
      'transaction.failed',
      'transaction.refunded',
      'webhook.test'
    ]);

    const list = await listWebhooks(merchantId);
    assert.equal(list.length, 1);
  });

  it('deve rejeitar cadastro de webhook com URL inválida ou protocolo diferente de http/https (400)', async () => {
    await assert.rejects(
      () => createWebhook(merchantId, { url: 'ftp://invalido.com' }),
      (err) => err.statusCode === 400 && err.code === 'INVALID_WEBHOOK_URL'
    );

    await assert.rejects(
      () => createWebhook(merchantId, { url: 'nao-e-url' }),
      (err) => err.statusCode === 400 && err.code === 'INVALID_WEBHOOK_URL'
    );
  });

  it('deve simular disparo de webhook com webhookId específico ou fallback automático, gravando deliveryLog', async () => {
    const wh = await createWebhook(merchantId, {
      url: 'https://callback.pulsar.com/hook',
      secret: 'segredo_exclusivo'
    });

    const simulation = await simulateWebhook(merchantId, {
      webhookId: wh._id,
      event: 'webhook.test',
      data: { ping: 'pong' }
    });

    assert.equal(simulation.webhookId, wh._id);
    assert.equal(simulation.targetUrl, 'https://callback.pulsar.com/hook');
    assert.match(simulation.headers['X-Signature'], /^sha256=[a-f0-9]{64}$/);
    assert.equal(simulation.deliveryLog.status, 'SIMULATED');

    const updatedList = await listWebhooks(merchantId);
    assert.equal(updatedList[0].deliveryLogs.length, 1);
  });

  it('deve permitir simulação ad-hoc mesmo sem webhook previamente cadastrado e retornar 404 para webhookId inexistente', async () => {
    const adHocSimulation = await simulateWebhook(merchantId, {
      event: 'webhook.test',
      data: { test: true }
    });

    assert.equal(adHocSimulation.webhookId, null);
    assert.equal(adHocSimulation.targetUrl, 'https://webhook.site/simulated');
    assert.match(adHocSimulation.headers['X-Signature'], /^sha256=[a-f0-9]{64}$/);

    await assert.rejects(
      () =>
        simulateWebhook(merchantId, {
          webhookId: 'wh-inexistente'
        }),
      (err) => err.statusCode === 404 && err.code === 'WEBHOOK_NOT_FOUND'
    );
  });

  it('triggerEventForMerchant deve disparar apenas para webhooks ativos inscritos no evento', async () => {
    await createWebhook(merchantId, {
      url: 'https://loja.com/paid-only',
      events: ['transaction.paid'],
      active: true
    });
    await createWebhook(merchantId, {
      url: 'https://loja.com/inactive',
      events: ['transaction.paid'],
      active: false
    });

    const deliveries = await triggerEventForMerchant(
      merchantId,
      'transaction.paid',
      { id: 'tx-100', amount: 50 }
    );

    assert.equal(deliveries.length, 1);
    assert.equal(deliveries[0].targetUrl, 'https://loja.com/paid-only');
  });
});

