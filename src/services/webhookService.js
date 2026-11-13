import crypto from 'node:crypto';
import Webhook from '../models/Webhook.js';
import { AppError } from '../middlewares/errorHandler.js';

export const generateHmacSignature = (payload, secret) => {
  const effectiveSecret =
    secret || process.env.WEBHOOK_SECRET || 'whsec_pulsar_hmac_secret_2026';
  const serializedPayload =
    typeof payload === 'string' ? payload : JSON.stringify(payload);

  const digest = crypto
    .createHmac('sha256', effectiveSecret)
    .update(serializedPayload)
    .digest('hex');

  return `sha256=${digest}`;
};

const isValidHttpUrl = (value) => {
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
};

export const createWebhook = async (merchantId, payload = {}) => {
  const { url, events, secret, active = true } = payload;

  if (!url || !isValidHttpUrl(url)) {
    throw new AppError(
      'Informe uma URL válida (http:// ou https://) para o cadastro do webhook',
      400,
      'INVALID_WEBHOOK_URL'
    );
  }

  const webhook = await Webhook.create({
    merchantId,
    url: String(url).trim(),
    events:
      Array.isArray(events) && events.length > 0
        ? events
        : [
            'transaction.paid',
            'transaction.failed',
            'transaction.refunded',
            'webhook.test'
          ],
    secret:
      secret || process.env.WEBHOOK_SECRET || 'whsec_pulsar_hmac_secret_2026',
    active: Boolean(active)
  });

  return webhook;
};

export const listWebhooks = async (merchantId) => {
  return Webhook.find({ merchantId });
};

export const triggerEventForMerchant = async (merchantId, eventName, eventData) => {
  const webhooks = await Webhook.find({
    merchantId,
    active: true,
    events: eventName
  });

  const deliveries = [];

  for (const webhook of webhooks) {
    const envelope = {
      id: `evt_${crypto.randomUUID()}`,
      event: eventName,
      createdAt: new Date().toISOString(),
      data: eventData
    };

    const signature = generateHmacSignature(envelope, webhook.secret);

    const logEntry = {
      _id: crypto.randomUUID(),
      event: eventName,
      signature,
      payload: envelope,
      status: 'SIMULATED',
      statusCode: 200,
      attemptedAt: new Date().toISOString()
    };

    webhook.deliveryLogs.push(logEntry);
    await webhook.save();

    deliveries.push({
      webhookId: webhook._id,
      targetUrl: webhook.url,
      event: eventName,
      headers: {
        'Content-Type': 'application/json',
        'X-Signature': signature,
        'X-Pulsar-Event': eventName
      },
      status: 'SIMULATED',
      statusCode: 200,
      attemptedAt: logEntry.attemptedAt
    });
  }

  return deliveries;
};

export const simulateWebhook = async (merchantId, payload = {}) => {
  const {
    webhookId,
    event = 'webhook.test',
    data = { message: 'Disparo de teste do Pulsar Payments' }
  } = payload;

  let targetWebhook = null;

  if (webhookId) {
    targetWebhook = await Webhook.findOne({ _id: webhookId, merchantId });
    if (!targetWebhook) {
      throw new AppError(
        'Webhook não encontrado para o lojista autenticado',
        404,
        'WEBHOOK_NOT_FOUND'
      );
    }
  } else {
    targetWebhook = await Webhook.findOne({ merchantId, active: true });
  }

  const envelope = {
    id: `evt_${crypto.randomUUID()}`,
    event,
    createdAt: new Date().toISOString(),
    data
  };

  const secret =
    targetWebhook?.secret ||
    payload.secret ||
    process.env.WEBHOOK_SECRET ||
    'whsec_pulsar_hmac_secret_2026';

  const signature = generateHmacSignature(envelope, secret);

  const logEntry = {
    _id: crypto.randomUUID(),
    event,
    signature,
    payload: envelope,
    status: 'SIMULATED',
    statusCode: 200,
    attemptedAt: new Date().toISOString()
  };

  if (targetWebhook) {
    targetWebhook.deliveryLogs.push(logEntry);
    await targetWebhook.save();
  }

  return {
    webhookId: targetWebhook ? targetWebhook._id : null,
    targetUrl: targetWebhook
      ? targetWebhook.url
      : payload.url || 'https://webhook.site/simulated',
    event,
    headers: {
      'Content-Type': 'application/json',
      'X-Signature': signature,
      'X-Pulsar-Event': event
    },
    payload: envelope,
    deliveryLog: logEntry
  };
};
