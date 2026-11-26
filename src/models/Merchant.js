import crypto from 'node:crypto';
import { queryPostgres } from '../config/database.js';

const normalizeMerchantRow = (row) => ({
  _id: String(row._id),
  id: String(row.id || row._id),
  name: String(row.name),
  email: String(row.email),
  document: row.document ?? null,
  password: String(row.password),
  createdAt: String(row.createdAt),
  updatedAt: String(row.updatedAt)
});

const createMerchantInstance = (record) => ({
  ...normalizeMerchantRow(record),
  toJSON() {
    const { password: _password, ...publicData } = this;
    delete publicData.toJSON;
    delete publicData.save;
    return publicData;
  },
  async save() {
    this.updatedAt = new Date().toISOString();

    await queryPostgres(
      `INSERT INTO merchants (_id, id, name, email, document, password, "createdAt", "updatedAt")
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (_id) DO UPDATE SET
         name = EXCLUDED.name,
         email = EXCLUDED.email,
         document = EXCLUDED.document,
         password = EXCLUDED.password,
         "updatedAt" = EXCLUDED."updatedAt"`,
      [
        this._id,
        this._id,
        this.name,
        this.email,
        this.document,
        this.password,
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
    return item[key] === value;
  });
};

const Merchant = {
  async create({ name, email, document = null, password }) {
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

    await queryPostgres(
      `INSERT INTO merchants (_id, id, name, email, document, password, "createdAt", "updatedAt")
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        record._id,
        record.id,
        record.name,
        record.email,
        record.document,
        record.password,
        record.createdAt,
        record.updatedAt
      ]
    );

    return createMerchantInstance(record);
  },

  async findOne(filter = {}) {
    const { rows } = await queryPostgres(
      'SELECT * FROM merchants ORDER BY "createdAt" DESC'
    );
    const found = rows
      .map(normalizeMerchantRow)
      .find((item) => matchesFilter(item, filter));
    return found ? createMerchantInstance(found) : null;
  },

  async find(filter = {}) {
    const { rows } = await queryPostgres(
      'SELECT * FROM merchants ORDER BY "createdAt" DESC'
    );
    return rows
      .map(normalizeMerchantRow)
      .filter((item) => matchesFilter(item, filter))
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
      .map(createMerchantInstance);
  }
};

export default Merchant;
