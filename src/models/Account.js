import crypto from 'node:crypto';
import { queryPostgres } from '../config/database.js';

const normalizeAccountRow = (row) => ({
  _id: String(row._id),
  id: String(row.id || row._id),
  merchantId: String(row.merchantId),
  name: String(row.name),
  currency: String(row.currency),
  balance: Number(Number(row.balance).toFixed(2)),
  status: String(row.status),
  createdAt: String(row.createdAt),
  updatedAt: String(row.updatedAt)
});

const createAccountInstance = (record) => ({
  ...normalizeAccountRow(record),
  toJSON() {
    const clone = { ...this };
    delete clone.toJSON;
    delete clone.save;
    return clone;
  },
  async save() {
    this.updatedAt = new Date().toISOString();
    this.balance = Number(Number(this.balance).toFixed(2));

    await queryPostgres(
      `INSERT INTO accounts (_id, id, "merchantId", name, currency, balance, status, "createdAt", "updatedAt")
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       ON CONFLICT (_id) DO UPDATE SET
         name = EXCLUDED.name,
         currency = EXCLUDED.currency,
         balance = EXCLUDED.balance,
         status = EXCLUDED.status,
         "updatedAt" = EXCLUDED."updatedAt"`,
      [
        this._id,
        this._id,
        this.merchantId,
        this.name,
        this.currency,
        this.balance,
        this.status,
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

const Account = {
  async create({
    merchantId,
    name = 'Conta Principal',
    currency = 'BRL',
    balance = 0,
    status = 'ACTIVE'
  }) {
    const now = new Date().toISOString();
    const id = crypto.randomUUID();

    const record = {
      _id: id,
      id,
      merchantId: String(merchantId),
      name: String(name).trim(),
      currency: String(currency).toUpperCase().trim(),
      balance: Number(Number(balance).toFixed(2)),
      status,
      createdAt: now,
      updatedAt: now
    };

    await queryPostgres(
      `INSERT INTO accounts (_id, id, "merchantId", name, currency, balance, status, "createdAt", "updatedAt")
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        record._id,
        record.id,
        record.merchantId,
        record.name,
        record.currency,
        record.balance,
        record.status,
        record.createdAt,
        record.updatedAt
      ]
    );

    return createAccountInstance(record);
  },

  async findOne(filter = {}) {
    const { rows } = await queryPostgres(
      'SELECT * FROM accounts ORDER BY "createdAt" DESC'
    );
    const found = rows
      .map(normalizeAccountRow)
      .find((item) => matchesFilter(item, filter));
    return found ? createAccountInstance(found) : null;
  },

  async find(filter = {}) {
    const { rows } = await queryPostgres(
      'SELECT * FROM accounts ORDER BY "createdAt" DESC'
    );
    return rows
      .map(normalizeAccountRow)
      .filter((item) => matchesFilter(item, filter))
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
      .map(createAccountInstance);
  }
};

export default Account;
