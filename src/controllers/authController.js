import * as authService from '../services/authService.js';

export const register = async (req, res, next) => {
  try {
    const result = await authService.registerMerchant(req.body);
    return res.status(201).json({
      message: 'Lojista registrado com sucesso',
      ...result
    });
  } catch (error) {
    return next(error);
  }
};

export const login = async (req, res, next) => {
  try {
    const result = await authService.loginMerchant(req.body);
    return res.status(200).json({
      message: 'Autenticação realizada com sucesso',
      ...result
    });
  } catch (error) {
    return next(error);
  }
};

