import crypto from 'node:crypto';
import { queryPostgres } from '../config/database.js';

const normalizeWebhookRow = (row) => ({
  _id: String(row._id),
  id: String(row.id || row._id),
  merchantId: String(row.merchantId),
  url: String(row.url),
  events: Array.isArray(row.events)
    ? row.events
    : typeof row.events === 'string'
      ? JSON.parse(row.events)
      : [],
  secret: String(row.secret),
  active: Boolean(row.active),
  deliveryLogs: Array.isArray(row.deliveryLogs)
    ? row.deliveryLogs
    : typeof row.deliveryLogs === 'string'
      ? JSON.parse(row.deliveryLogs)
      : [],
  createdAt: String(row.createdAt),
  updatedAt: String(row.updatedAt)
});

const createWebhookInstance = (record) => ({
  ...normalizeWebhookRow(record),
  toJSON() {
    const clone = { ...this };
    delete clone.toJSON;
    delete clone.save;
    return clone;
  },
  async save() {
    this.updatedAt = new Date().toISOString();

    await queryPostgres(
      `INSERT INTO webhooks (_id, id, "merchantId", url, events, secret, active, "deliveryLogs", "createdAt", "updatedAt")
       VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7, $8::jsonb, $9, $10)
       ON CONFLICT (_id) DO UPDATE SET
         url = EXCLUDED.url,
         events = EXCLUDED.events,
         secret = EXCLUDED.secret,
         active = EXCLUDED.active,
         "deliveryLogs" = EXCLUDED."deliveryLogs",
         "updatedAt" = EXCLUDED."updatedAt"`,
      [
        this._id,
        this._id,
        this.merchantId,
        this.url,
        JSON.stringify(Array.isArray(this.events) ? this.events : []),
        this.secret,
        Boolean(this.active),
        JSON.stringify(Array.isArray(this.deliveryLogs) ? this.deliveryLogs : []),
        this.createdAt,
        this.updatedAt
      ]
    );

    return this;
  }
});

const matchesFilter = (item, filter = {}) => {
  return Object.entries(filter).every(([key, value]) => {
    if (value === undefined) return true;
    if (key === '_id' || key === 'id') {
      return item._id === String(value) || item.id === String(value);
    }
    if (key === 'events' && typeof value === 'string') {
      return Array.isArray(item.events) && item.events.includes(value);
    }
    if (typeof value === 'boolean') {
      return Boolean(item[key]) === value;
    }
    return String(item[key]) === String(value);
  });
};

const Webhook = {
  async create({
    merchantId,
    url,
    events = [
      'transaction.paid',
      'transaction.failed',
      'transaction.refunded',
      'webhook.test'
    ],
    secret = process.env.WEBHOOK_SECRET || 'whsec_pulsar_hmac_secret_2026',
    active = true
  }) {
    const now = new Date().toISOString();
    const id = crypto.randomUUID();

    const record = {
      _id: id,
      id,
      merchantId: String(merchantId),
      url: String(url).trim(),
      events,
      secret,
      active: Boolean(active),
      deliveryLogs: [],
      createdAt: now,
      updatedAt: now
    };

    await queryPostgres(
      `INSERT INTO webhooks (_id, id, "merchantId", url, events, secret, active, "deliveryLogs", "createdAt", "updatedAt")
       VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7, $8::jsonb, $9, $10)`,
      [
        record._id,
        record.id,
        record.merchantId,
        record.url,
        JSON.stringify(record.events),
        record.secret,
        record.active,
        JSON.stringify(record.deliveryLogs),
        record.createdAt,
        record.updatedAt
      ]
    );

    return createWebhookInstance(record);
  },

  async findOne(filter = {}) {
    const { rows } = await queryPostgres(
      'SELECT * FROM webhooks ORDER BY "createdAt" DESC'
    );
    const matches = rows
      .map(normalizeWebhookRow)
      .filter((item) => matchesFilter(item, filter))
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    return matches[0] ? createWebhookInstance(matches[0]) : null;
  },

  async find(filter = {}) {
    const { rows } = await queryPostgres(
      'SELECT * FROM webhooks ORDER BY "createdAt" DESC'
    );
    return rows
      .map(normalizeWebhookRow)
      .filter((item) => matchesFilter(item, filter))
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
      .map(createWebhookInstance);
  }
};

export default Webhook;
