import { z } from 'zod';
import {
    getWalletBalance,
    getTransactionHistory,
    getWalletStatistics,
} from '../services/wallet.service.js';

/**
 * Get current wallet balance
 */
export async function getBalance(req, res, next) {
    try {
        const userId = req.user.id;
        const balance = await getWalletBalance(userId);
        res.json({
            success: true,
            data: {
                balance,
                currency: 'USD',
            },
        });
    } catch (err) {
        return next(err);
    }
}

/**
 * Get transaction history with pagination and filters
 */
export async function getTransactions(req, res, next) {
    try {
        const userId = req.user.id;
        const schema = z.object({
            page: z.string().optional(),
            limit: z.string().optional(),
            reason: z
                .enum([
                    'blog_post_reward',
                    'admin_credit',
                    'admin_debit',
                    'withdrawal',
                    'refund',
                ])
                .optional(),
            startDate: z.string().optional(),
            endDate: z.string().optional(),
        });

        const input = schema.parse(req.query);
        const page = Math.max(parseInt(input.page || '1', 10), 1);
        const limit = Math.min(Math.max(parseInt(input.limit || '50', 10), 1), 100);

        const result = await getTransactionHistory(userId, {
            page,
            limit,
            reason: input.reason,
            startDate: input.startDate,
            endDate: input.endDate,
        });

        res.json({
            success: true,
            data: result.transactions,
            pagination: result.pagination,
        });
    } catch (err) {
        if (err instanceof z.ZodError) {
            return res.status(422).json({
                success: false,
                error: {
                    code: 'VALIDATION_ERROR',
                    message: 'Invalid query parameters',
                    details: err.flatten(),
                },
            });
        }
        return next(err);
    }
}

/**
 * Get wallet statistics
 */
export async function getStatistics(req, res, next) {
    try {
        const userId = req.user.id;
        const statistics = await getWalletStatistics(userId);
        res.json({
            success: true,
            data: statistics,
        });
    } catch (err) {
        return next(err);
    }
}







