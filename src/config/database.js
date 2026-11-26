import fs from 'node:fs';
import path from 'node:path';
import pg from 'pg';

const { Pool } = pg;

/**
 * Carrega variáveis de ambiente do arquivo .env (caso exista)
 * utilizando apenas módulos nativos do Node.js.
 */
export const loadEnv = () => {
  const envPath = path.resolve(process.cwd(), '.env');
  if (!fs.existsSync(envPath)) {
    return;
  }

  if (typeof process.loadEnvFile === 'function') {
    process.loadEnvFile(envPath);
    return;
  }

  const content = fs.readFileSync(envPath, 'utf8');
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIndex = trimmed.indexOf('=');
    if (eqIndex === -1) continue;
    const key = trimmed.slice(0, eqIndex).trim();
    const value = trimmed.slice(eqIndex + 1).trim().replace(/^['"]|['"]$/g, '');
    if (process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
};

loadEnv();

export const MAX_PG_CONNECTION_LIMIT = 20;

export const INITIAL_SEED = {
  merchants: [
    {
      _id: 'ed7561f8-9f64-46bb-af05-1a72947799d8',
      id: 'ed7561f8-9f64-46bb-af05-1a72947799d8',
      name: 'Loja Estrela LTDA',
      email: 'financeiro@lojaestrela.com.br',
      document: '12.345.678/0001-99',
      password: '$2a$10$u9A87JL5h28gdcWq088.EuYIL.DnbWjftk6i4WtcvKI1o04bVo/bm',
      createdAt: '2026-11-12T18:58:34.404Z',
      updatedAt: '2026-11-12T18:58:34.404Z'
    }
  ],
  accounts: [
    {
      _id: '40fb3bc7-ab30-4e07-ae82-e05a1b083cc2',
      id: '40fb3bc7-ab30-4e07-ae82-e05a1b083cc2',
      merchantId: 'ed7561f8-9f64-46bb-af05-1a72947799d8',
      name: 'Carteira Principal BRL',
      currency: 'BRL',
      balance: 1250,
      status: 'ACTIVE',
      createdAt: '2026-11-12T19:02:37.327Z',
      updatedAt: '2026-11-12T19:04:34.979Z'
    }
  ],
  transactions: [
    {
      _id: 'a3a19616-7993-447c-9a3f-3b00ab95054d',
      id: 'a3a19616-7993-447c-9a3f-3b00ab95054d',
      merchantId: 'ed7561f8-9f64-46bb-af05-1a72947799d8',
      accountId: '40fb3bc7-ab30-4e07-ae82-e05a1b083cc2',
      type: 'CHARGE',
      amount: 250,
      currency: 'BRL',
      status: 'PAID',
      description: 'Pedido #9841 - Assinatura Anual',
      idempotencyKey: 'idem-key-2026-0001',
      refundReason: null,
      refundedAt: null,
      metadata: {
        orderId: '9841',
        paymentMethod: 'PIX'
      },
      createdAt: '2026-11-12T19:04:34.980Z',
      updatedAt: '2026-11-12T19:04:34.980Z'
    }
  ],
  webhooks: [
    {
      _id: '338d110a-e348-4248-87d9-be0d27d2b1e2',
      id: '338d110a-e348-4248-87d9-be0d27d2b1e2',
      merchantId: 'ed7561f8-9f64-46bb-af05-1a72947799d8',
      url: 'https://api.lojaestrela.com.br/webhooks/pulsar',
      events: [
        'transaction.paid',
        'transaction.failed',
        'transaction.refunded',
        'webhook.test'
      ],
      secret: 'whsec_custom_merchant_secret',
      active: true,
      deliveryLogs: [],
      createdAt: '2026-11-12T19:06:07.016Z',
      updatedAt: '2026-11-12T19:06:07.016Z'
    }
  ]
};

/**
 * Indica se o banco PostgreSQL remoto está ativo (configurado via variáveis de ambiente).
 */
export const isPostgresEnabled = () => {
  if (process.env.NODE_ENV === 'test') {
    return false;
  }

  return Boolean(
    process.env.DATABASE_URL ||
      (process.env.PG_HOST && process.env.PG_USER && process.env.PG_PASSWORD)
  );
};

let pgPool = null;
let pgInitPromise = null;

/**
 * Monta a configuração do Pool de conexões PostgreSQL exclusivamente a partir
 * de variáveis de ambiente (DATABASE_URL, PG_HOST, PG_PORT, PG_DATABASE,
 * PG_USER, PG_PASSWORD, PG_CA_CERT, PG_POOL_MAX).
 */
export const getPostgresPoolConfig = () => {
  const defaultLimit = process.env.VERCEL ? 5 : MAX_PG_CONNECTION_LIMIT;
  const maxConnections = Math.min(
    Number(process.env.PG_POOL_MAX) || defaultLimit,
    MAX_PG_CONNECTION_LIMIT
  );

  const rawCa = process.env.PG_CA_CERT
    ? process.env.PG_CA_CERT.replace(/\\n/g, '\n')
    : undefined;

  const sslConfig = rawCa
    ? {
        rejectUnauthorized: true,
        ca: rawCa
      }
    : {
        rejectUnauthorized: false
      };

  if (process.env.DATABASE_URL) {
    const cleanUrl = process.env.DATABASE_URL.replace(
      /([?&])sslmode=[^&]+(&|$)/i,
      (_match, p1, p2) => (p1 === '?' && p2 === '&' ? '?' : p2 ? p1 : '')
    );

    return {
      connectionString: cleanUrl,
      ssl: sslConfig,
      max: maxConnections,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 10000
    };
  }

  return {
    host: process.env.PG_HOST,
    port: Number(process.env.PG_PORT) || 20151,
    database: process.env.PG_DATABASE || 'defaultdb',
    user: process.env.PG_USER,
    password: process.env.PG_PASSWORD,
    ssl: sslConfig,
    max: maxConnections,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000
  };
};

export const getPostgresPool = () => {
  if (!pgPool) {
    pgPool = new Pool(getPostgresPoolConfig());
  }
  return pgPool;
};

/**
 * Inicializa as tabelas e índices no PostgreSQL (Aiven)
 * e insere o seed inicial caso a tabela de lojistas esteja vazia.
 */
export const ensurePostgresInitialized = async () => {
  if (!isPostgresEnabled()) {
    return false;
  }

  if (pgInitPromise) {
    return pgInitPromise;
  }

  pgInitPromise = (async () => {
    const pool = getPostgresPool();

    await pool.query(`
      CREATE TABLE IF NOT EXISTS merchants (
        _id VARCHAR(64) PRIMARY KEY,
        id VARCHAR(64) NOT NULL,
        name VARCHAR(255) NOT NULL,
        email VARCHAR(255) UNIQUE NOT NULL,
        document VARCHAR(64),
        password VARCHAR(255) NOT NULL,
        "createdAt" VARCHAR(64) NOT NULL,
        "updatedAt" VARCHAR(64) NOT NULL
      );

      CREATE TABLE IF NOT EXISTS accounts (
        _id VARCHAR(64) PRIMARY KEY,
        id VARCHAR(64) NOT NULL,
        "merchantId" VARCHAR(64) NOT NULL,
        name VARCHAR(255) NOT NULL,
        currency VARCHAR(16) NOT NULL DEFAULT 'BRL',
        balance NUMERIC(15, 2) NOT NULL DEFAULT 0,
        status VARCHAR(32) NOT NULL DEFAULT 'ACTIVE',
        "createdAt" VARCHAR(64) NOT NULL,
        "updatedAt" VARCHAR(64) NOT NULL
      );

      CREATE TABLE IF NOT EXISTS transactions (
        _id VARCHAR(64) PRIMARY KEY,
        id VARCHAR(64) NOT NULL,
        "merchantId" VARCHAR(64) NOT NULL,
        "accountId" VARCHAR(64) NOT NULL,
        type VARCHAR(32) NOT NULL,
        amount NUMERIC(15, 2) NOT NULL,
        currency VARCHAR(16) NOT NULL DEFAULT 'BRL',
        status VARCHAR(32) NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        "idempotencyKey" VARCHAR(255),
        "refundReason" TEXT,
        "refundedAt" VARCHAR(64),
        metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
        "createdAt" VARCHAR(64) NOT NULL,
        "updatedAt" VARCHAR(64) NOT NULL
      );

      CREATE TABLE IF NOT EXISTS webhooks (
        _id VARCHAR(64) PRIMARY KEY,
        id VARCHAR(64) NOT NULL,
        "merchantId" VARCHAR(64) NOT NULL,
        url TEXT NOT NULL,
        events JSONB NOT NULL DEFAULT '[]'::jsonb,
        secret VARCHAR(255) NOT NULL,
        active BOOLEAN NOT NULL DEFAULT true,
        "deliveryLogs" JSONB NOT NULL DEFAULT '[]'::jsonb,
        "createdAt" VARCHAR(64) NOT NULL,
        "updatedAt" VARCHAR(64) NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_accounts_merchant ON accounts ("merchantId");
      CREATE INDEX IF NOT EXISTS idx_transactions_merchant ON transactions ("merchantId");
      CREATE INDEX IF NOT EXISTS idx_transactions_idempotency ON transactions ("merchantId", "idempotencyKey");
      CREATE INDEX IF NOT EXISTS idx_webhooks_merchant ON webhooks ("merchantId");
    `);

    const { rows } = await pool.query('SELECT COUNT(*)::int AS count FROM merchants');
    if (rows[0].count === 0) {
      for (const m of INITIAL_SEED.merchants) {
        await pool.query(
          `INSERT INTO merchants (_id, id, name, email, document, password, "createdAt", "updatedAt")
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
           ON CONFLICT (_id) DO NOTHING`,
          [m._id, m.id, m.name, m.email, m.document, m.password, m.createdAt, m.updatedAt]
        );
      }

      for (const a of INITIAL_SEED.accounts) {
        await pool.query(
          `INSERT INTO accounts (_id, id, "merchantId", name, currency, balance, status, "createdAt", "updatedAt")
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
           ON CONFLICT (_id) DO NOTHING`,
          [a._id, a.id, a.merchantId, a.name, a.currency, a.balance, a.status, a.createdAt, a.updatedAt]
        );
      }

      for (const t of INITIAL_SEED.transactions) {
        await pool.query(
          `INSERT INTO transactions (_id, id, "merchantId", "accountId", type, amount, currency, status, description, "idempotencyKey", "refundReason", "refundedAt", metadata, "createdAt", "updatedAt")
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13::jsonb, $14, $15)
           ON CONFLICT (_id) DO NOTHING`,
          [
            t._id,
            t.id,
            t.merchantId,
            t.accountId,
            t.type,
            t.amount,
            t.currency,
            t.status,
            t.description,
            t.idempotencyKey,
            t.refundReason,
            t.refundedAt,
            JSON.stringify(t.metadata),
            t.createdAt,
            t.updatedAt
          ]
        );
      }

      for (const w of INITIAL_SEED.webhooks) {
        await pool.query(
          `INSERT INTO webhooks (_id, id, "merchantId", url, events, secret, active, "deliveryLogs", "createdAt", "updatedAt")
           VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7, $8::jsonb, $9, $10)
           ON CONFLICT (_id) DO NOTHING`,
          [
            w._id,
            w.id,
            w.merchantId,
            w.url,
            JSON.stringify(w.events),
            w.secret,
            w.active,
            JSON.stringify(w.deliveryLogs),
            w.createdAt,
            w.updatedAt
          ]
        );
      }
    }

    console.log('[Database] Conexão e estrutura PostgreSQL (Aiven) inicializadas com sucesso');
    return true;
  })().catch((err) => {
    pgInitPromise = null;
    throw err;
  });

  return pgInitPromise;
};

/**
 * Adaptador de testes isolado para execução de testes unitários (NODE_ENV=test)
 * sem gravar arquivos em disco e sem alterar a base produtiva PostgreSQL na Aiven.
 */
const testTables = {
  merchants: [],
  accounts: [],
  transactions: [],
  webhooks: []
};

export const resetDatabase = () => {
  testTables.merchants = [];
  testTables.accounts = [];
  testTables.transactions = [];
  testTables.webhooks = [];
};

const executeTestQuery = (text, params = []) => {
  const normalizedSql = text.trim().replace(/\s+/g, ' ');

  if (/^SELECT \* FROM (merchants|accounts|transactions|webhooks)/i.test(normalizedSql)) {
    const table = normalizedSql.match(/^SELECT \* FROM (\w+)/i)[1].toLowerCase();
    const rows = [...testTables[table]].sort(
      (a, b) => new Date(b.createdAt) - new Date(a.createdAt)
    );
    return { rows };
  }

  if (/^INSERT INTO merchants/i.test(normalizedSql)) {
    const [_id, id, name, email, document, password, createdAt, updatedAt] = params;
    const record = { _id, id, name, email, document, password, createdAt, updatedAt };
    const idx = testTables.merchants.findIndex((item) => item._id === _id);
    if (idx >= 0) {
      testTables.merchants[idx] = { ...testTables.merchants[idx], ...record };
    } else {
      testTables.merchants.push(record);
    }
    return { rows: [record], rowCount: 1 };
  }

  if (/^INSERT INTO accounts/i.test(normalizedSql)) {
    const [_id, id, merchantId, name, currency, balance, status, createdAt, updatedAt] = params;
    const record = { _id, id, merchantId, name, currency, balance, status, createdAt, updatedAt };
    const idx = testTables.accounts.findIndex((item) => item._id === _id);
    if (idx >= 0) {
      testTables.accounts[idx] = { ...testTables.accounts[idx], ...record };
    } else {
      testTables.accounts.push(record);
    }
    return { rows: [record], rowCount: 1 };
  }

  if (/^INSERT INTO transactions/i.test(normalizedSql)) {
    const [
      _id,
      id,
      merchantId,
      accountId,
      type,
      amount,
      currency,
      status,
      description,
      idempotencyKey,
      refundReason,
      refundedAt,
      metadata,
      createdAt,
      updatedAt
    ] = params;
    const parsedMeta = typeof metadata === 'string' ? JSON.parse(metadata) : metadata;
    const record = {
      _id,
      id,
      merchantId,
      accountId,
      type,
      amount,
      currency,
      status,
      description,
      idempotencyKey,
      refundReason,
      refundedAt,
      metadata: parsedMeta,
      createdAt,
      updatedAt
    };
    const idx = testTables.transactions.findIndex((item) => item._id === _id);
    if (idx >= 0) {
      testTables.transactions[idx] = { ...testTables.transactions[idx], ...record };
    } else {
      testTables.transactions.push(record);
    }
    return { rows: [record], rowCount: 1 };
  }

  if (/^INSERT INTO webhooks/i.test(normalizedSql)) {
    const [
      _id,
      id,
      merchantId,
      url,
      events,
      secret,
      active,
      deliveryLogs,
      createdAt,
      updatedAt
    ] = params;
    const record = {
      _id,
      id,
      merchantId,
      url,
      events: typeof events === 'string' ? JSON.parse(events) : events,
      secret,
      active,
      deliveryLogs:
        typeof deliveryLogs === 'string' ? JSON.parse(deliveryLogs) : deliveryLogs,
      createdAt,
      updatedAt
    };
    const idx = testTables.webhooks.findIndex((item) => item._id === _id);
    if (idx >= 0) {
      testTables.webhooks[idx] = { ...testTables.webhooks[idx], ...record };
    } else {
      testTables.webhooks.push(record);
    }
    return { rows: [record], rowCount: 1 };
  }

  return { rows: [], rowCount: 0 };
};

export const queryPostgres = async (text, params = []) => {
  if (!isPostgresEnabled()) {
    return executeTestQuery(text, params);
  }
  await ensurePostgresInitialized();
  const pool = getPostgresPool();
  return pool.query(text, params);
};

export const initDatabase = () => {
  if (isPostgresEnabled()) {
    ensurePostgresInitialized().catch((error) => {
      console.error('[Database] Erro ao inicializar PostgreSQL:', error.message);
    });
  }
  return true;
};

export default initDatabase;
