import mongoose from 'mongoose';
import Wallet from '../models/Wallet.model.js';
import WalletTransaction from '../models/WalletTransaction.model.js';

/**
 * Get or create wallet for a user
 */
export async function getOrCreateWallet(userId) {
    let wallet = await Wallet.findOne({ user: userId });
    if (!wallet) {
        wallet = await Wallet.create({
            user: userId,
            balance: 0,
            currency: 'USD',
        });
    }
    return wallet;
}

/**
 * Credit wallet amount atomically using MongoDB transactions
 * @param {string} userId - User ID
 * @param {number} amount - Amount to credit (must be positive)
 * @param {object} options - Transaction options
 * @param {string} options.reason - Reason for credit
 * @param {string} options.description - Description of the transaction
 * @param {string} options.relatedPostId - Related post ID if applicable
 * @param {object} options.metadata - Additional metadata
 * @returns {Promise<{wallet: object, transaction: object}>}
 */
export async function creditWallet(userId, amount, options = {}) {
    if (amount <= 0) {
        throw new Error('Credit amount must be positive');
    }

    const session = await mongoose.startSession();
    session.startTransaction();

    try {
        // Get or create wallet
        let wallet = await Wallet.findOne({ user: userId }).session(session);
        if (!wallet) {
            wallet = await Wallet.create(
                [
                    {
                        user: userId,
                        balance: 0,
                        currency: 'USD',
                    },
                ],
                { session }
            );
            wallet = wallet[0];
        }

        // Update balance
        const newBalance = wallet.balance + amount;
        await Wallet.updateOne(
            { _id: wallet._id },
            {
                $set: {
                    balance: newBalance,
                    lastTransactionAt: new Date(),
                },
            }
        ).session(session);

        // Create transaction record
        const transaction = await WalletTransaction.create(
            [
                {
                    wallet: wallet._id,
                    user: userId,
                    type: 'credit',
                    amount,
                    balanceAfter: newBalance,
                    reason: options.reason || 'blog_post_reward',
                    description: options.description || 'Wallet credit',
                    relatedPost: options.relatedPostId || null,
                    status: 'completed',
                    metadata: options.metadata || {},
                },
            ],
            { session }
        );

        await session.commitTransaction();

        // Fetch updated wallet with populated fields
        const updatedWallet = await Wallet.findById(wallet._id);
        const createdTransaction = await WalletTransaction.findById(transaction[0]._id);

        return {
            wallet: updatedWallet,
            transaction: createdTransaction,
        };
    } catch (error) {
        await session.abortTransaction();
        throw error;
    } finally {
        session.endSession();
    }
}

/**
 * Get wallet balance for a user
 */
export async function getWalletBalance(userId) {
    const wallet = await getOrCreateWallet(userId);
    return wallet.balance;
}

/**
 * Get transaction history for a user
 */
export async function getTransactionHistory(userId, options = {}) {
    const { page = 1, limit = 50, reason, startDate, endDate } = options;
    const skip = (page - 1) * limit;

    const query = { user: userId };

    if (reason) {
        query.reason = reason;
    }

    if (startDate || endDate) {
        query.createdAt = {};
        if (startDate) query.createdAt.$gte = new Date(startDate);
        if (endDate) query.createdAt.$lte = new Date(endDate);
    }

    const [transactions, total] = await Promise.all([
        WalletTransaction.find(query)
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit)
            .populate('relatedPost', 'title slug')
            .lean(),
        WalletTransaction.countDocuments(query),
    ]);

    return {
        transactions,
        pagination: {
            page,
            limit,
            total,
            totalPages: Math.ceil(total / limit),
        },
    };
}

/**
 * Get wallet statistics for a user
 */
export async function getWalletStatistics(userId) {
    const wallet = await getOrCreateWallet(userId);

    const stats = await WalletTransaction.aggregate([
        {
            $match: {
                user: new mongoose.Types.ObjectId(userId),
                status: 'completed',
            },
        },
        {
            $group: {
                _id: null,
                totalCredits: {
                    $sum: {
                        $cond: [{ $eq: ['$type', 'credit'] }, '$amount', 0],
                    },
                },
                totalDebits: {
                    $sum: {
                        $cond: [{ $eq: ['$type', 'debit'] }, '$amount', 0],
                    },
                },
                blogPostRewards: {
                    $sum: {
                        $cond: [
                            { $eq: ['$reason', 'blog_post_reward'] },
                            '$amount',
                            0,
                        ],
                    },
                },
                totalTransactions: { $sum: 1 },
            },
        },
    ]);

    const statistics = stats[0] || {
        totalCredits: 0,
        totalDebits: 0,
        blogPostRewards: 0,
        totalTransactions: 0,
    };

    return {
        balance: wallet.balance,
        currency: wallet.currency,
        totalCredits: statistics.totalCredits,
        totalDebits: statistics.totalDebits,
        blogPostRewards: statistics.blogPostRewards,
        totalTransactions: statistics.totalTransactions,
        lastTransactionAt: wallet.lastTransactionAt,
    };
}







