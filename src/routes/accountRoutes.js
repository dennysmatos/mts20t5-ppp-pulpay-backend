import { Router } from 'express';
import * as accountController from '../controllers/accountController.js';
import { authMiddleware } from '../middlewares/authMiddleware.js';

const router = Router();

router.use(authMiddleware);

router.post('/', accountController.createAccount);
router.get('/', accountController.listAccounts);
router.get('/:id', accountController.getAccountById);

export default router;

