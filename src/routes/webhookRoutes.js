import { Router } from 'express';
import * as webhookController from '../controllers/webhookController.js';
import { authMiddleware } from '../middlewares/authMiddleware.js';

const router = Router();

router.use(authMiddleware);

router.post('/', webhookController.createWebhook);
router.get('/', webhookController.listWebhooks);
router.post('/test', webhookController.testWebhook);

export default router;

