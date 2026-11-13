import crypto from 'node:crypto';
import { readDatabase, writeDatabase } from '../config/database.js';

const createWebhookInstance = (record) => ({
  ...record,
  toJSON() {
    const clone = { ...this };
    delete clone.toJSON;
    delete clone.save;
    return clone;
  },
  async save() {
    const db = readDatabase();
    const index = db.webhooks.findIndex((item) => item._id === this._id);
    this.updatedAt = new Date().toISOString();

    const rawToSave = {
      _id: this._id,
      id: this._id,
      merchantId: this.merchantId,
      url: this.url,
      events: Array.isArray(this.events) ? this.events : [],
      secret: this.secret,
      active: Boolean(this.active),
      deliveryLogs: Array.isArray(this.deliveryLogs) ? this.deliveryLogs : [],
      createdAt: this.createdAt,
      updatedAt: this.updatedAt
    };

    if (index >= 0) {
      db.webhooks[index] = rawToSave;
    } else {
      db.webhooks.push(rawToSave);
    }

    writeDatabase(db);
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
    const db = readDatabase();
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

    db.webhooks.push(record);
    writeDatabase(db);

    return createWebhookInstance(record);
  },

  async findOne(filter = {}) {
    const db = readDatabase();
    const matches = db.webhooks
      .filter((item) => matchesFilter(item, filter))
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    return matches[0] ? createWebhookInstance(matches[0]) : null;
  },

  async find(filter = {}) {
    const db = readDatabase();
    return db.webhooks
      .filter((item) => matchesFilter(item, filter))
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
      .map(createWebhookInstance);
  }
};

export default Webhook;
