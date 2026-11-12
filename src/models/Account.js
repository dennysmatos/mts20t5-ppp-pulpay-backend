import crypto from 'node:crypto';
import { readDatabase, writeDatabase } from '../config/database.js';

const createAccountInstance = (record) => ({
  ...record,
  toJSON() {
    const clone = { ...this };
    delete clone.toJSON;
    delete clone.save;
    return clone;
  },
  async save() {
    const db = readDatabase();
    const index = db.accounts.findIndex((item) => item._id === this._id);
    this.updatedAt = new Date().toISOString();

    const rawToSave = {
      _id: this._id,
      id: this._id,
      merchantId: this.merchantId,
      name: this.name,
      currency: this.currency,
      balance: Number(Number(this.balance).toFixed(2)),
      status: this.status,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt
    };

    if (index >= 0) {
      db.accounts[index] = rawToSave;
    } else {
      db.accounts.push(rawToSave);
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

const Account = {
  async create({
    merchantId,
    name = 'Conta Principal',
    currency = 'BRL',
    balance = 0,
    status = 'ACTIVE'
  }) {
    const db = readDatabase();
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

    db.accounts.push(record);
    writeDatabase(db);

    return createAccountInstance(record);
  },

  async findOne(filter = {}) {
    const db = readDatabase();
    const found = db.accounts.find((item) => matchesFilter(item, filter));
    return found ? createAccountInstance(found) : null;
  },

  async find(filter = {}) {
    const db = readDatabase();
    return db.accounts
      .filter((item) => matchesFilter(item, filter))
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
      .map(createAccountInstance);
  }
};

export default Account;
