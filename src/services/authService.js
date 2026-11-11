import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import Merchant from '../models/Merchant.js';
import { AppError } from '../middlewares/errorHandler.js';

const generateToken = (merchant) => {
  const secret = process.env.JWT_SECRET || 'pulsar_super_secret_jwt_key_2026';
  const expiresIn = process.env.JWT_EXPIRES_IN || '1d';

  const token = jwt.sign(
    {
      sub: String(merchant._id),
      email: merchant.email,
      name: merchant.name
    },
    secret,
    { expiresIn }
  );

  return { token, expiresIn };
};

export const registerMerchant = async ({ name, email, password, document }) => {
  if (!name || !email || !password) {
    throw new AppError(
      'Os campos name, email e password são obrigatórios',
      400,
      'VALIDATION_ERROR'
    );
  }

  if (String(password).length < 6) {
    throw new AppError(
      'A senha deve possuir no mínimo 6 caracteres',
      400,
      'WEAK_PASSWORD'
    );
  }

  const normalizedEmail = String(email).toLowerCase().trim();
  const existingMerchant = await Merchant.findOne({ email: normalizedEmail });

  if (existingMerchant) {
    throw new AppError(
      'Já existe um lojista cadastrado com este e-mail',
      409,
      'EMAIL_ALREADY_EXISTS'
    );
  }

  const passwordHash = await bcrypt.hash(String(password), 10);

  const merchant = await Merchant.create({
    name: String(name).trim(),
    email: normalizedEmail,
    document: document ? String(document).trim() : null,
    password: passwordHash
  });

  const { token, expiresIn } = generateToken(merchant);

  return {
    merchant: merchant.toJSON(),
    token,
    expiresIn
  };
};

export const loginMerchant = async ({ email, password }) => {
  if (!email || !password) {
    throw new AppError(
      'Os campos email e password são obrigatórios para autenticação',
      400,
      'VALIDATION_ERROR'
    );
  }

  const normalizedEmail = String(email).toLowerCase().trim();
  const merchant = await Merchant.findOne({ email: normalizedEmail });

  if (!merchant) {
    throw new AppError(
      'Credenciais inválidas: e-mail ou senha incorretos',
      401,
      'INVALID_CREDENTIALS'
    );
  }

  const isPasswordValid = await bcrypt.compare(String(password), merchant.password);

  if (!isPasswordValid) {
    throw new AppError(
      'Credenciais inválidas: e-mail ou senha incorretos',
      401,
      'INVALID_CREDENTIALS'
    );
  }

  const { token, expiresIn } = generateToken(merchant);

  return {
    token,
    type: 'Bearer',
    expiresIn,
    merchant: merchant.toJSON()
  };
};
