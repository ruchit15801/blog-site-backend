import { Router } from 'express';
import { authMiddleware } from '../security/auth.js';
import {
    getBalance,
    getTransactions,
    getStatistics,
} from '../controllers/wallet.controller.js';

const router = Router();

// All wallet routes require authentication
router.use(authMiddleware);

// Wallet endpoints
router.get('/balance', getBalance);
router.get('/transactions', getTransactions);
router.get('/statistics', getStatistics);

export default router;







