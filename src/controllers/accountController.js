import * as accountService from '../services/accountService.js';

export const createAccount = async (req, res, next) => {
  try {
    const account = await accountService.createAccount(req.user.id, req.body);
    return res.status(201).json({
      message: 'Conta criada com sucesso',
      account
    });
  } catch (error) {
    return next(error);
  }
};

export const listAccounts = async (req, res, next) => {
  try {
    const accounts = await accountService.listAccounts(req.user.id);
    return res.status(200).json({
      total: accounts.length,
      accounts
    });
  } catch (error) {
    return next(error);
  }
};

export const getAccountById = async (req, res, next) => {
  try {
    const account = await accountService.getAccountById(
      req.user.id,
      req.params.id
    );
    return res.status(200).json({ account });
  } catch (error) {
    return next(error);
  }
};

