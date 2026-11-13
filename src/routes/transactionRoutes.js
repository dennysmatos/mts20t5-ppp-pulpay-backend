import { Router } from 'express';
import * as transactionController from '../controllers/transactionController.js';
import { authMiddleware } from '../middlewares/authMiddleware.js';

const router = Router();

router.use(authMiddleware);

router.post('/', transactionController.createTransaction);
router.get('/', transactionController.listTransactions);
router.get('/:id', transactionController.getTransactionById);
router.post('/:id/refund', transactionController.refundTransaction);

export default router;

