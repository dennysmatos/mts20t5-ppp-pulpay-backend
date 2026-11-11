import crypto from 'node:crypto';
import { readDatabase, writeDatabase } from '../config/database.js';

const createMerchantInstance = (record) => ({
  ...record,
  toJSON() {
    const { password: _password, ...publicData } = this;
    delete publicData.toJSON;
    delete publicData.save;
    return publicData;
  },
  async save() {
    const db = readDatabase();
    const index = db.merchants.findIndex((item) => item._id === this._id);
    this.updatedAt = new Date().toISOString();

    const rawToSave = {
      _id: this._id,
      id: this._id,
      name: this.name,
      email: this.email,
      document: this.document,
      password: this.password,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt
    };

    if (index >= 0) {
      db.merchants[index] = rawToSave;
    } else {
      db.merchants.push(rawToSave);
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
    return item[key] === value;
  });
};

const Merchant = {
  async create({ name, email, document = null, password }) {
    const db = readDatabase();
    const now = new Date().toISOString();
    const id = crypto.randomUUID();

    const record = {
      _id: id,
      id,
      name: String(name).trim(),
      email: String(email).toLowerCase().trim(),
      document: document ? String(document).trim() : null,
      password,
      createdAt: now,
      updatedAt: now
    };

    db.merchants.push(record);
    writeDatabase(db);

    return createMerchantInstance(record);
  },

  async findOne(filter = {}) {
    const db = readDatabase();
    const found = db.merchants.find((item) => matchesFilter(item, filter));
    return found ? createMerchantInstance(found) : null;
  },

  async find(filter = {}) {
    const db = readDatabase();
    return db.merchants
      .filter((item) => matchesFilter(item, filter))
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
      .map(createMerchantInstance);
  }
};

export default Merchant;
