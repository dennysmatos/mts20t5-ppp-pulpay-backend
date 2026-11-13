import * as transactionService from '../services/transactionService.js';

export const createTransaction = async (req, res, next) => {
  try {
    const idempotencyKey = req.headers['idempotency-key'];
    const result = await transactionService.createTransaction(
      req.user.id,
      req.body,
      idempotencyKey
    );

    const statusCode = result.idempotentReplayed ? 200 : 201;
    const message = result.idempotentReplayed
      ? 'Requisição idempotente: retornando transação processada anteriormente'
      : 'Transação processada com sucesso';

    return res.status(statusCode).json({
      message,
      ...result
    });
  } catch (error) {
    return next(error);
  }
};

export const listTransactions = async (req, res, next) => {
  try {
    const transactions = await transactionService.listTransactions(
      req.user.id,
      req.query
    );
    return res.status(200).json({
      total: transactions.length,
      transactions
    });
  } catch (error) {
    return next(error);
  }
};

export const getTransactionById = async (req, res, next) => {
  try {
    const transaction = await transactionService.getTransactionById(
      req.user.id,
      req.params.id
    );
    return res.status(200).json({ transaction });
  } catch (error) {
    return next(error);
  }
};

export const refundTransaction = async (req, res, next) => {
  try {
    const result = await transactionService.refundTransaction(
      req.user.id,
      req.params.id,
      req.body
    );
    return res.status(200).json({
      message: 'Estorno de transação realizado com sucesso',
      ...result
    });
  } catch (error) {
    return next(error);
  }
};

