import mongoose from 'mongoose';

const walletSchema = new mongoose.Schema(
    {
        user: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: true,
            unique: true,
            index: true,
        },
        balance: {
            type: Number,
            default: 0,
            min: 0,
            required: true,
        },
        currency: {
            type: String,
            default: 'USD',
            enum: ['USD'],
        },
        lastTransactionAt: {
            type: Date,
        },
    },
    { timestamps: true }
);

// Ensure one wallet per user
walletSchema.index({ user: 1 }, { unique: true });

export default mongoose.model('Wallet', walletSchema);







