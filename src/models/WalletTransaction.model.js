import mongoose from 'mongoose';

const walletTransactionSchema = new mongoose.Schema(
    {
        wallet: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Wallet',
            required: true,
            index: true,
        },
        user: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: true,
            index: true,
        },
        type: {
            type: String,
            enum: ['credit', 'debit'],
            required: true,
            index: true,
        },
        amount: {
            type: Number,
            required: true,
            min: 0,
        },
        balanceAfter: {
            type: Number,
            required: true,
            min: 0,
        },
        reason: {
            type: String,
            required: true,
            enum: [
                'blog_post_reward',
                'admin_credit',
                'admin_debit',
                'withdrawal',
                'refund',
            ],
        },
        description: {
            type: String,
            required: true,
        },
        relatedPost: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'BlogPost',
            index: true,
        },
        status: {
            type: String,
            enum: ['completed', 'pending', 'failed'],
            default: 'completed',
            index: true,
        },
        metadata: {
            type: mongoose.Schema.Types.Mixed,
            default: {},
        },
    },
    { timestamps: true }
);

// Compound indexes for efficient queries
walletTransactionSchema.index({ user: 1, createdAt: -1 });
walletTransactionSchema.index({ wallet: 1, createdAt: -1 });
walletTransactionSchema.index({ relatedPost: 1 });
walletTransactionSchema.index({ reason: 1, createdAt: -1 });

export default mongoose.model('WalletTransaction', walletTransactionSchema);







