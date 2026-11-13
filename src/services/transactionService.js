import Account from '../models/Account.js';
import Transaction, {
  TRANSACTION_STATUSES,
  TRANSACTION_TYPES
} from '../models/Transaction.js';
import { AppError } from '../middlewares/errorHandler.js';
import { triggerEventForMerchant } from './webhookService.js';

const DEBIT_TYPES = ['DEBIT', 'PAYMENT'];
const CREDIT_TYPES = ['CREDIT', 'CHARGE'];

export const createTransaction = async (
  merchantId,
  payload = {},
  headerIdempotencyKey = null
) => {
  const {
    accountId,
    type = 'CHARGE',
    amount,
    currency = 'BRL',
    status = 'PAID',
    description = '',
    metadata = {}
  } = payload;

  const idempotencyKey =
    (headerIdempotencyKey && String(headerIdempotencyKey).trim()) ||
    (payload.idempotencyKey && String(payload.idempotencyKey).trim()) ||
    null;

  // 1. Verificação de Idempotência antes de qualquer movimentação financeira
  if (idempotencyKey) {
    const existingTransaction = await Transaction.findOne({
      merchantId,
      idempotencyKey
    });

    if (existingTransaction) {
      return {
        transaction: existingTransaction,
        idempotentReplayed: true,
        webhookDeliveries: []
      };
    }
  }

  // 2. Validações de entrada
  if (!accountId) {
    throw new AppError(
      'O campo accountId é obrigatório para criar uma transação',
      400,
      'MISSING_ACCOUNT_ID'
    );
  }

  const parsedAmount = Number(amount);
  if (amount === undefined || amount === null || Number.isNaN(parsedAmount)) {
    throw new AppError(
      'O valor da transação (amount) é obrigatório e deve ser numérico',
      400,
      'INVALID_AMOUNT'
    );
  }

  if (parsedAmount <= 0) {
    throw new AppError(
      'O valor da transação (amount) deve ser maior que zero',
      422,
      'INVALID_TRANSACTION_AMOUNT'
    );
  }

  const normalizedType = String(type).toUpperCase().trim();
  if (!TRANSACTION_TYPES.includes(normalizedType)) {
    throw new AppError(
      `Tipo de transação inválido (${type}). Utilize: ${TRANSACTION_TYPES.join(', ')}`,
      400,
      'INVALID_TRANSACTION_TYPE'
    );
  }

  const normalizedStatus = String(status).toUpperCase().trim();
  if (!TRANSACTION_STATUSES.includes(normalizedStatus)) {
    throw new AppError(
      `Status inválido (${status}). Utilize: PENDING, PAID ou FAILED`,
      400,
      'INVALID_TRANSACTION_STATUS'
    );
  }

  if (normalizedStatus === 'REFUNDED') {
    throw new AppError(
      'Não é permitido criar uma transação diretamente com o status REFUNDED. Utilize o endpoint de estorno (/refund)',
      422,
      'INVALID_INITIAL_STATUS'
    );
  }

  // 3. Busca e validação da Conta / Carteira do lojista
  const account = await Account.findOne({ _id: accountId, merchantId });
  if (!account) {
    throw new AppError(
      'Conta informada não encontrada para o lojista autenticado',
      404,
      'ACCOUNT_NOT_FOUND'
    );
  }

  if (account.status !== 'ACTIVE') {
    throw new AppError(
      'A conta selecionada está bloqueada para movimentações financeiras',
      422,
      'ACCOUNT_BLOCKED'
    );
  }

  const roundedAmount = Number(parsedAmount.toFixed(2));

  // 4. Aplicação das Regras Financeiras quando a transação é liquidada (PAID)
  if (normalizedStatus === 'PAID') {
    if (DEBIT_TYPES.includes(normalizedType)) {
      const projectedBalance = Number((account.balance - roundedAmount).toFixed(2));
      if (projectedBalance < 0) {
        throw new AppError(
          'Saldo insuficiente na conta para realizar esta operação (saldo não pode ficar negativo)',
          422,
          'INSUFFICIENT_FUNDS'
        );
      }
      account.balance = projectedBalance;
    } else if (CREDIT_TYPES.includes(normalizedType)) {
      account.balance = Number((account.balance + roundedAmount).toFixed(2));
    }

    await account.save();
  }

  // 5. Persistência da Transação em arquivo local
  const transaction = await Transaction.create({
    merchantId,
    accountId: account._id,
    type: normalizedType,
    amount: roundedAmount,
    currency: String(currency).toUpperCase().trim(),
    status: normalizedStatus,
    description: description ? String(description).trim() : '',
    idempotencyKey,
    metadata
  });

  // 6. Disparo lógico de Webhook conforme status da transação
  let webhookDeliveries = [];
  if (normalizedStatus === 'PAID') {
    webhookDeliveries = await triggerEventForMerchant(
      merchantId,
      'transaction.paid',
      transaction.toJSON()
    );
  } else if (normalizedStatus === 'FAILED') {
    webhookDeliveries = await triggerEventForMerchant(
      merchantId,
      'transaction.failed',
      transaction.toJSON()
    );
  }

  return {
    transaction,
    accountBalance: account.balance,
    idempotentReplayed: false,
    webhookDeliveries
  };
};

export const listTransactions = async (merchantId, query = {}) => {
  const filter = { merchantId };

  if (query.accountId) {
    filter.accountId = query.accountId;
  }

  if (query.status) {
    filter.status = String(query.status).toUpperCase().trim();
  }

  if (query.type) {
    filter.type = String(query.type).toUpperCase().trim();
  }

  return Transaction.find(filter);
};

export const getTransactionById = async (merchantId, transactionId) => {
  const transaction = await Transaction.findOne({
    _id: transactionId,
    merchantId
  });

  if (!transaction) {
    throw new AppError(
      'Transação não encontrada para o lojista autenticado',
      404,
      'TRANSACTION_NOT_FOUND'
    );
  }

  return transaction;
};

export const refundTransaction = async (
  merchantId,
  transactionId,
  payload = {}
) => {
  const transaction = await Transaction.findOne({
    _id: transactionId,
    merchantId
  });

  if (!transaction) {
    throw new AppError(
      'Transação não encontrada para o lojista autenticado',
      404,
      'TRANSACTION_NOT_FOUND'
    );
  }

  // Máquina de Estados: apenas transações PAID podem ser estornadas (REFUNDED)
  if (transaction.status === 'REFUNDED') {
    throw new AppError(
      'Transição de estado inválida: esta transação já se encontra com status REFUNDED',
      422,
      'TRANSACTION_ALREADY_REFUNDED'
    );
  }

  if (transaction.status !== 'PAID') {
    throw new AppError(
      `Transição de estado inválida: não é permitido estornar uma transação com status ${transaction.status}. Apenas transações com status PAID podem ser estornadas.`,
      422,
      'INVALID_STATE_TRANSITION'
    );
  }

  const account = await Account.findOne({
    _id: transaction.accountId,
    merchantId
  });

  if (!account) {
    throw new AppError(
      'Conta associada à transação não encontrada',
      404,
      'ACCOUNT_NOT_FOUND'
    );
  }

  // Reversão financeira respeitando a trava de saldo não negativo
  if (CREDIT_TYPES.includes(transaction.type)) {
    const projectedBalance = Number(
      (account.balance - transaction.amount).toFixed(2)
    );
    if (projectedBalance < 0) {
      throw new AppError(
        'Saldo insuficiente na conta para estornar esta cobrança sem negativar a carteira',
        422,
        'INSUFFICIENT_FUNDS_FOR_REFUND'
      );
    }
    account.balance = projectedBalance;
  } else if (DEBIT_TYPES.includes(transaction.type)) {
    account.balance = Number(
      (account.balance + transaction.amount).toFixed(2)
    );
  }

  await account.save();

  transaction.status = 'REFUNDED';
  transaction.refundedAt = new Date().toISOString();
  transaction.refundReason = payload.reason
    ? String(payload.reason).trim()
    : 'Estorno solicitado pelo lojista';

  await transaction.save();

  const webhookDeliveries = await triggerEventForMerchant(
    merchantId,
    'transaction.refunded',
    transaction.toJSON()
  );

  return {
    transaction,
    accountBalance: account.balance,
    webhookDeliveries
  };
};
