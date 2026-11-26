import crypto from 'node:crypto';
import { queryPostgres } from '../config/database.js';

export const TRANSACTION_STATUSES = ['PENDING', 'PAID', 'FAILED', 'REFUNDED'];
export const TRANSACTION_TYPES = ['CHARGE', 'PAYMENT', 'CREDIT', 'DEBIT'];

const normalizeTransactionRow = (row) => ({
  _id: String(row._id),
  id: String(row.id || row._id),
  merchantId: String(row.merchantId),
  accountId: String(row.accountId),
  type: String(row.type),
  amount: Number(Number(row.amount).toFixed(2)),
  currency: String(row.currency),
  status: String(row.status),
  description: row.description ?? '',
  idempotencyKey: row.idempotencyKey ?? null,
  refundReason: row.refundReason ?? null,
  refundedAt: row.refundedAt ?? null,
  metadata:
    typeof row.metadata === 'string'
      ? JSON.parse(row.metadata)
      : row.metadata || {},
  createdAt: String(row.createdAt),
  updatedAt: String(row.updatedAt)
});

const createTransactionInstance = (record) => ({
  ...normalizeTransactionRow(record),
  toJSON() {
    const clone = { ...this };
    delete clone.toJSON;
    delete clone.save;
    return clone;
  },
  async save() {
    this.updatedAt = new Date().toISOString();
    this.amount = Number(Number(this.amount).toFixed(2));

    await queryPostgres(
      `INSERT INTO transactions (_id, id, "merchantId", "accountId", type, amount, currency, status, description, "idempotencyKey", "refundReason", "refundedAt", metadata, "createdAt", "updatedAt")
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13::jsonb, $14, $15)
       ON CONFLICT (_id) DO UPDATE SET
         status = EXCLUDED.status,
         description = EXCLUDED.description,
         "refundReason" = EXCLUDED."refundReason",
         "refundedAt" = EXCLUDED."refundedAt",
         metadata = EXCLUDED.metadata,
         "updatedAt" = EXCLUDED."updatedAt"`,
      [
        this._id,
        this._id,
        this.merchantId,
        this.accountId,
        this.type,
        this.amount,
        this.currency,
        this.status,
        this.description,
        this.idempotencyKey,
        this.refundReason,
        this.refundedAt,
        JSON.stringify(this.metadata || {}),
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

    await queryPostgres(
      `INSERT INTO transactions (_id, id, "merchantId", "accountId", type, amount, currency, status, description, "idempotencyKey", "refundReason", "refundedAt", metadata, "createdAt", "updatedAt")
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13::jsonb, $14, $15)`,
      [
        record._id,
        record.id,
        record.merchantId,
        record.accountId,
        record.type,
        record.amount,
        record.currency,
        record.status,
        record.description,
        record.idempotencyKey,
        record.refundReason,
        record.refundedAt,
        JSON.stringify(record.metadata),
        record.createdAt,
        record.updatedAt
      ]
    );

    return createTransactionInstance(record);
  },

  async findOne(filter = {}) {
    const { rows } = await queryPostgres(
      'SELECT * FROM transactions ORDER BY "createdAt" DESC'
    );
    const found = rows
      .map(normalizeTransactionRow)
      .find((item) => matchesFilter(item, filter));
    return found ? createTransactionInstance(found) : null;
  },

  async find(filter = {}) {
    const { rows } = await queryPostgres(
      'SELECT * FROM transactions ORDER BY "createdAt" DESC'
    );
    return rows
      .map(normalizeTransactionRow)
      .filter((item) => matchesFilter(item, filter))
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
      .map(createTransactionInstance);
  }
};

export default Transaction;
