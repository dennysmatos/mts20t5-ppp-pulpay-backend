import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

process.env.NODE_ENV = 'test';

import {
  loadEnv,
  initDatabase,
  resetDatabase,
  isPostgresEnabled,
  getPostgresPoolConfig,
  queryPostgres,
  MAX_PG_CONNECTION_LIMIT,
  INITIAL_SEED
} from '../../../src/config/database.js';

describe('Config: database.js (Conexão PostgreSQL via Env Vars e Adaptador de Testes)', () => {
  beforeEach(() => {
    process.env.NODE_ENV = 'test';
    resetDatabase();
  });

  it('deve validar a configuração do Pool PostgreSQL via variáveis de ambiente e limite de conexões', () => {
    assert.equal(isPostgresEnabled(), false);

    const previousCa = process.env.PG_CA_CERT;
    process.env.PG_CA_CERT = '-----BEGIN CERTIFICATE-----\\nTEST_CA\\n-----END CERTIFICATE-----';

    try {
      const poolConfig = getPostgresPoolConfig();
      assert.ok(poolConfig.ssl);
      assert.equal(poolConfig.ssl.rejectUnauthorized, true);
      assert.match(poolConfig.ssl.ca, /BEGIN CERTIFICATE/);
      assert.ok(poolConfig.max <= MAX_PG_CONNECTION_LIMIT);
    } finally {
      if (previousCa !== undefined) {
        process.env.PG_CA_CERT = previousCa;
      } else {
        delete process.env.PG_CA_CERT;
      }
    }
  });

  it('deve configurar host, port, database e user a partir das variáveis PG_* quando DATABASE_URL não estiver definida', () => {
    const previousUrl = process.env.DATABASE_URL;
    const previousHost = process.env.PG_HOST;
    delete process.env.DATABASE_URL;
    process.env.PG_HOST = 'pg.test.internal';

    try {
      const poolConfig = getPostgresPoolConfig();
      assert.equal(poolConfig.host, 'pg.test.internal');
      assert.equal(poolConfig.port, Number(process.env.PG_PORT) || 20151);
      assert.equal(poolConfig.database, process.env.PG_DATABASE || 'defaultdb');
    } finally {
      if (previousUrl !== undefined) {
        process.env.DATABASE_URL = previousUrl;
      }
      if (previousHost !== undefined) {
        process.env.PG_HOST = previousHost;
      } else {
        delete process.env.PG_HOST;
      }
    }
  });

  it('deve possuir a estrutura de seed inicial do PostgreSQL para lojista, conta, transação e webhook', () => {
    assert.equal(INITIAL_SEED.merchants.length, 1);
    assert.equal(INITIAL_SEED.accounts.length, 1);
    assert.equal(INITIAL_SEED.transactions.length, 1);
    assert.equal(INITIAL_SEED.webhooks.length, 1);
  });

  it('deve executar queryPostgres e resetDatabase corretamente no adaptador de testes', async () => {
    await queryPostgres(
      'INSERT INTO merchants (_id, id, name, email, document, password, "createdAt", "updatedAt") VALUES ($1, $2, $3, $4, $5, $6, $7, $8)',
      ['m1', 'm1', 'Loja 1', 'a@b.com', null, 'hash', '2026-11-10T00:00:00Z', '2026-11-10T00:00:00Z']
    );

    const beforeReset = await queryPostgres('SELECT * FROM merchants');
    assert.equal(beforeReset.rows.length, 1);

    resetDatabase();
    const afterReset = await queryPostgres('SELECT * FROM merchants');
    assert.equal(afterReset.rows.length, 0);
  });

  it('deve executar loadEnv e initDatabase sem falhar', () => {
    assert.doesNotThrow(() => loadEnv());
    assert.equal(initDatabase(), true);
  });
});
