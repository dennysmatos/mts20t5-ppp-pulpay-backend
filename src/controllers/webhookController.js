import * as webhookService from '../services/webhookService.js';

export const createWebhook = async (req, res, next) => {
  try {
    const webhook = await webhookService.createWebhook(req.user.id, req.body);
    return res.status(201).json({
      message: 'Webhook registrado com sucesso',
      webhook
    });
  } catch (error) {
    return next(error);
  }
};

export const listWebhooks = async (req, res, next) => {
  try {
    const webhooks = await webhookService.listWebhooks(req.user.id);
    return res.status(200).json({
      total: webhooks.length,
      webhooks
    });
  } catch (error) {
    return next(error);
  }
};

export const testWebhook = async (req, res, next) => {
  try {
    const result = await webhookService.simulateWebhook(req.user.id, req.body);
    return res.status(200).json({
      message: 'Disparo de webhook simulado com assinatura HMAC SHA-256 gerada',
      ...result
    });
  } catch (error) {
    return next(error);
  }
};

