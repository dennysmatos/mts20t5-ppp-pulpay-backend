import { describe, it, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

process.env.DB_FILE = 'data/test-database-config.json';

import {
  loadEnv,
  getDatabaseFilePath,
  initDatabase,
  readDatabase,
  writeDatabase,
  resetDatabase
} from '../../../src/config/database.js';

describe('Config: database.js (Persistência Local em Arquivo)', () => {
  const testDbPath = getDatabaseFilePath();

  beforeEach(() => {
    process.env.DB_FILE = 'data/test-database-config.json';
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }
  });

  after(() => {
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }
  });

  it('deve retornar o caminho absoluto do arquivo configurado em DB_FILE', () => {
    const resolved = getDatabaseFilePath();
    assert.equal(resolved, path.resolve(process.cwd(), 'data/test-database-config.json'));
  });

  it('deve inicializar o arquivo JSON com a estrutura padrão quando não existir', () => {
    const initializedPath = initDatabase();
    assert.equal(fs.existsSync(initializedPath), true);

    const data = readDatabase();
    assert.deepEqual(data, {
      merchants: [],
      accounts: [],
      transactions: [],
      webhooks: []
    });
  });

  it('deve recuperar e normalizar arquivo JSON corrompido ou incompleto ao inicializar', () => {
    fs.mkdirSync(path.dirname(testDbPath), { recursive: true });
    fs.writeFileSync(testDbPath, '{ invalid json ', 'utf8');

    initDatabase();
    const dataAfterCorrupt = readDatabase();
    assert.deepEqual(dataAfterCorrupt, {
      merchants: [],
      accounts: [],
      transactions: [],
      webhooks: []
    });

    fs.writeFileSync(testDbPath, JSON.stringify({ merchants: [{ _id: '1' }] }), 'utf8');
    initDatabase();
    const dataAfterPartial = readDatabase();
    assert.equal(dataAfterPartial.merchants.length, 1);
    assert.deepEqual(dataAfterPartial.accounts, []);
    assert.deepEqual(dataAfterPartial.transactions, []);
    assert.deepEqual(dataAfterPartial.webhooks, []);
  });

  it('deve gravar e resetar o banco de dados em arquivo corretamente', () => {
    writeDatabase({
      merchants: [{ _id: 'm1', email: 'a@b.com' }],
      accounts: [],
      transactions: [],
      webhooks: []
    });

    const current = readDatabase();
    assert.equal(current.merchants.length, 1);

    resetDatabase();
    const afterReset = readDatabase();
    assert.deepEqual(afterReset, {
      merchants: [],
      accounts: [],
      transactions: [],
      webhooks: []
    });
  });

  it('deve executar loadEnv sem falhar quando .env existe ou não existe', () => {
    assert.doesNotThrow(() => loadEnv());
  });
});

