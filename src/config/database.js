import fs from 'node:fs';
import path from 'node:path';

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

const INITIAL_STRUCTURE = {
  merchants: [],
  accounts: [],
  transactions: [],
  webhooks: []
};

export const getDatabaseFilePath = () => {
  const relativeOrAbsolute = process.env.DB_FILE || 'data/database.json';
  return path.resolve(process.cwd(), relativeOrAbsolute);
};

/**
 * Garante que o diretório e o arquivo JSON local de persistência existam.
 */
export const initDatabase = () => {
  const dbFilePath = getDatabaseFilePath();
  const dirPath = path.dirname(dbFilePath);

  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }

  if (!fs.existsSync(dbFilePath)) {
    fs.writeFileSync(
      dbFilePath,
      JSON.stringify(INITIAL_STRUCTURE, null, 2),
      'utf8'
    );
  } else {
    try {
      const raw = fs.readFileSync(dbFilePath, 'utf8').trim();
      const parsed = raw ? JSON.parse(raw) : {};
      const normalized = {
        merchants: Array.isArray(parsed.merchants) ? parsed.merchants : [],
        accounts: Array.isArray(parsed.accounts) ? parsed.accounts : [],
        transactions: Array.isArray(parsed.transactions) ? parsed.transactions : [],
        webhooks: Array.isArray(parsed.webhooks) ? parsed.webhooks : []
      };
      fs.writeFileSync(dbFilePath, JSON.stringify(normalized, null, 2), 'utf8');
    } catch {
      fs.writeFileSync(
        dbFilePath,
        JSON.stringify(INITIAL_STRUCTURE, null, 2),
        'utf8'
      );
    }
  }

  console.log(`[Database] Persistência local em arquivo inicializada: ${dbFilePath}`);
  return dbFilePath;
};

export const readDatabase = () => {
  const dbFilePath = getDatabaseFilePath();
  if (!fs.existsSync(dbFilePath)) {
    initDatabase();
  }

  const raw = fs.readFileSync(dbFilePath, 'utf8');
  const data = JSON.parse(raw);

  return {
    merchants: Array.isArray(data.merchants) ? data.merchants : [],
    accounts: Array.isArray(data.accounts) ? data.accounts : [],
    transactions: Array.isArray(data.transactions) ? data.transactions : [],
    webhooks: Array.isArray(data.webhooks) ? data.webhooks : []
  };
};

export const writeDatabase = (data) => {
  const dbFilePath = getDatabaseFilePath();
  const dirPath = path.dirname(dbFilePath);

  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }

  fs.writeFileSync(dbFilePath, JSON.stringify(data, null, 2), 'utf8');
};

export const resetDatabase = () => {
  writeDatabase({
    merchants: [],
    accounts: [],
    transactions: [],
    webhooks: []
  });
};

export default initDatabase;
