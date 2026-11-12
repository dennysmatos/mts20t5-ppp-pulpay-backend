import Account from '../models/Account.js';
import { AppError } from '../middlewares/errorHandler.js';

export const createAccount = async (merchantId, payload = {}) => {
  const { name, currency = 'BRL' } = payload;
  const rawInitialBalance =
    payload.initialBalance !== undefined
      ? payload.initialBalance
      : payload.balance !== undefined
        ? payload.balance
        : 0;

  const parsedBalance = Number(rawInitialBalance);

  if (Number.isNaN(parsedBalance)) {
    throw new AppError(
      'O saldo inicial (initialBalance) deve ser um valor numérico válido',
      400,
      'INVALID_BALANCE'
    );
  }

  if (parsedBalance < 0) {
    throw new AppError(
      'Operação não permitida: o saldo da conta não pode ser negativo',
      422,
      'NEGATIVE_BALANCE_NOT_ALLOWED'
    );
  }

  const normalizedCurrency = String(currency).toUpperCase().trim();
  if (normalizedCurrency !== 'BRL') {
    throw new AppError(
      'Moeda não suportada. O Pulsar Payments opera exclusivamente com BRL',
      422,
      'UNSUPPORTED_CURRENCY'
    );
  }

  const account = await Account.create({
    merchantId,
    name: name ? String(name).trim() : 'Conta Principal',
    currency: normalizedCurrency,
    balance: Number(parsedBalance.toFixed(2)),
    status: 'ACTIVE'
  });

  return account;
};

export const listAccounts = async (merchantId) => {
  return Account.find({ merchantId });
};

export const getAccountById = async (merchantId, accountId) => {
  const account = await Account.findOne({ _id: accountId, merchantId });

  if (!account) {
    throw new AppError(
      'Conta não encontrada para o lojista autenticado',
      404,
      'ACCOUNT_NOT_FOUND'
    );
  }

  return account;
};
