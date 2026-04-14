import { creditWallet } from '../services/wallet.service.js';
import WalletTransaction from '../models/WalletTransaction.model.js';
import User from '../models/User.model.js';

const BLOG_POST_REWARD_AMOUNT = 0.1; // $0.10

/**
 * Credit wallet for a published blog post
 * Prevents duplicate credits by checking if transaction already exists
 * @param {string} postId - Blog post ID
 * @param {string} authorId - Author user ID
 * @returns {Promise<{credited: boolean, transaction: object | null, message: string}>}
 */
export async function creditBlogPostReward(postId, authorId) {
    try {
        // Check if user is admin (admins don't get rewards)
        const author = await User.findById(authorId).select('role');
        if (author && author.role === 'admin') {
            return {
                credited: false,
                transaction: null,
                message: 'Admin users do not receive blog post rewards',
            };
        }

        // Check if transaction already exists for this post
        const existingTransaction = await WalletTransaction.findOne({
            relatedPost: postId,
            reason: 'blog_post_reward',
            user: authorId,
            status: 'completed',
        });

        if (existingTransaction) {
            return {
                credited: false,
                transaction: existingTransaction,
                message: 'Reward already credited for this post',
            };
        }

        // Credit the wallet
        const result = await creditWallet(authorId, BLOG_POST_REWARD_AMOUNT, {
            reason: 'blog_post_reward',
            description: 'Blog post creation reward',
            relatedPostId: postId,
            metadata: {
                rewardAmount: BLOG_POST_REWARD_AMOUNT,
            },
        });

        return {
            credited: true,
            transaction: result.transaction,
            message: 'Reward credited successfully',
        };
    } catch (error) {
        // Log error but don't throw (non-blocking)
        console.error('Error crediting blog post reward:', error);
        return {
            credited: false,
            transaction: null,
            message: `Error crediting reward: ${error.message}`,
            error: error.message,
        };
    }
}







