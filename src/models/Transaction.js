import crypto from 'node:crypto';
import { readDatabase, writeDatabase } from '../config/database.js';

export const TRANSACTION_STATUSES = ['PENDING', 'PAID', 'FAILED', 'REFUNDED'];
export const TRANSACTION_TYPES = ['CHARGE', 'PAYMENT', 'CREDIT', 'DEBIT'];

const createTransactionInstance = (record) => ({
  ...record,
  toJSON() {
    const clone = { ...this };
    delete clone.toJSON;
    delete clone.save;
    return clone;
  },
  async save() {
    const db = readDatabase();
    const index = db.transactions.findIndex((item) => item._id === this._id);
    this.updatedAt = new Date().toISOString();

    const rawToSave = {
      _id: this._id,
      id: this._id,
      merchantId: this.merchantId,
      accountId: this.accountId,
      type: this.type,
      amount: Number(Number(this.amount).toFixed(2)),
      currency: this.currency,
      status: this.status,
      description: this.description,
      idempotencyKey: this.idempotencyKey,
      refundReason: this.refundReason,
      refundedAt: this.refundedAt,
      metadata: this.metadata,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt
    };

    if (index >= 0) {
      db.transactions[index] = rawToSave;
    } else {
      db.transactions.push(rawToSave);
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
    return String(item[key]) === String(value);
  });
};

const Transaction = {
  async create({
    merchantId,
    accountId,
    type = 'CHARGE',
    amount,
    currency = 'BRL',
    status = 'PAID',
    description = '',
    idempotencyKey = null,
    refundReason = null,
    refundedAt = null,
    metadata = {}
  }) {
    const db = readDatabase();
    const now = new Date().toISOString();
    const id = crypto.randomUUID();

    const record = {
      _id: id,
      id,
      merchantId: String(merchantId),
      accountId: String(accountId),
      type: String(type).toUpperCase().trim(),
      amount: Number(Number(amount).toFixed(2)),
      currency: String(currency).toUpperCase().trim(),
      status: String(status).toUpperCase().trim(),
      description: description ? String(description).trim() : '',
      idempotencyKey: idempotencyKey ? String(idempotencyKey).trim() : null,
      refundReason,
      refundedAt,
      metadata: metadata || {},
      createdAt: now,
      updatedAt: now
    };

    db.transactions.push(record);
    writeDatabase(db);

    return createTransactionInstance(record);
  },

  async findOne(filter = {}) {
    const db = readDatabase();
    const found = db.transactions.find((item) => matchesFilter(item, filter));
    return found ? createTransactionInstance(found) : null;
  },

  async find(filter = {}) {
    const db = readDatabase();
    return db.transactions
      .filter((item) => matchesFilter(item, filter))
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
      .map(createTransactionInstance);
  }
};

export default Transaction;
