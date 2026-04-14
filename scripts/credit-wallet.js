import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { connectMongo } from '../src/config/mongo.js';
import User from '../src/models/User.model.js';
import { creditWallet, getWalletBalance } from '../src/services/wallet.service.js';

// Load environment variables
dotenv.config();

/**
 * Script to credit $1200 to a user's wallet by email
 * Creates multiple transactions that sum up to the total amount
 * Usage: node scripts/credit-wallet.js
 */

const USER_EMAIL = 'Jonnycorne@gmail.com';
const TOTAL_AMOUNT = 1200;
const REASON = 'admin_credit';

// Define transaction splits - amounts that will sum to TOTAL_AMOUNT
// You can customize these amounts as needed
const TRANSACTION_AMOUNTS = [
    200,  // Transaction 1: $200
    300,  // Transaction 2: $300
    250,  // Transaction 3: $250
    200,  // Transaction 4: $200
    150,  // Transaction 5: $150
    100,  // Transaction 6: $100
];
// These sum to $1200

// Alternative: Use equal splits
// const NUMBER_OF_TRANSACTIONS = 5;
// const TRANSACTION_AMOUNTS = Array(NUMBER_OF_TRANSACTIONS).fill(TOTAL_AMOUNT / NUMBER_OF_TRANSACTIONS);

async function creditUserWallet() {
    try {
        console.log('🔄 Connecting to MongoDB...');
        await connectMongo();
        console.log('✅ Connected to MongoDB\n');

        // Validate transaction amounts sum to total
        const calculatedTotal = TRANSACTION_AMOUNTS.reduce((sum, amount) => sum + amount, 0);
        if (Math.abs(calculatedTotal - TOTAL_AMOUNT) > 0.01) {
            console.error(`❌ Error: Transaction amounts sum to $${calculatedTotal.toFixed(2)}, but expected $${TOTAL_AMOUNT.toFixed(2)}`);
            process.exit(1);
        }

        // Find user by email
        console.log(`🔍 Searching for user with email: ${USER_EMAIL}`);
        const user = await User.findOne({ email: USER_EMAIL.toLowerCase().trim() });

        if (!user) {
            console.error(`❌ Error: User with email "${USER_EMAIL}" not found.`);
            console.log('\nAvailable users (first 5):');
            const allUsers = await User.find({}).limit(5).select('email fullName');
            allUsers.forEach(u => {
                console.log(`  - ${u.email} (${u.fullName})`);
            });
            process.exit(1);
        }

        console.log(`✅ Found user: ${user.fullName} (${user.email})`);
        console.log(`   User ID: ${user._id}\n`);

        // Check current balance
        const initialBalance = await getWalletBalance(user._id);
        console.log(`💰 Current wallet balance: $${initialBalance.toFixed(2)}\n`);

        // Show plan
        console.log(`📋 Transaction Plan:`);
        console.log(`   Total amount to credit: $${TOTAL_AMOUNT.toFixed(2)}`);
        console.log(`   Number of transactions: ${TRANSACTION_AMOUNTS.length}`);
        console.log(`   Transaction amounts: ${TRANSACTION_AMOUNTS.map(a => `$${a.toFixed(2)}`).join(', ')}`);
        console.log(`   Final balance will be: $${(initialBalance + TOTAL_AMOUNT).toFixed(2)}\n`);

        // Process each transaction
        console.log('🔄 Processing transactions...\n');
        const transactions = [];
        let currentBalance = initialBalance;

        for (let i = 0; i < TRANSACTION_AMOUNTS.length; i++) {
            const amount = TRANSACTION_AMOUNTS[i];
            const transactionNumber = i + 1;

            console.log(`   Processing transaction ${transactionNumber}/${TRANSACTION_AMOUNTS.length}: $${amount.toFixed(2)}...`);

            // Add small delay between transactions to ensure proper timestamps
            if (i > 0) {
                await new Promise(resolve => setTimeout(resolve, 100));
            }

            const result = await creditWallet(user._id, amount, {
                reason: REASON,
                description: `Admin credit - Transaction ${transactionNumber}/${TRANSACTION_AMOUNTS.length} - $${amount.toFixed(2)}`,
                metadata: {
                    creditedBy: 'admin_script',
                    creditedAt: new Date().toISOString(),
                    amount: amount,
                    transactionNumber: transactionNumber,
                    totalAmount: TOTAL_AMOUNT,
                    partOf: 'multi_transaction_credit',
                },
            });

            transactions.push(result.transaction);
            currentBalance = result.transaction.balanceAfter;

            console.log(`   ✅ Transaction ${transactionNumber} completed: Balance now $${currentBalance.toFixed(2)}`);
        }

        console.log('\n✅ All transactions processed successfully!\n');

        // Get final balance
        const finalBalance = await getWalletBalance(user._id);

        // Display summary
        console.log('📊 Transaction Summary:');
        console.log('━'.repeat(80));
        transactions.forEach((tx, index) => {
            console.log(`\n   Transaction ${index + 1}:`);
            console.log(`      ID: ${tx._id}`);
            console.log(`      Amount: $${tx.amount.toFixed(2)}`);
            console.log(`      Balance After: $${tx.balanceAfter.toFixed(2)}`);
            console.log(`      Description: ${tx.description}`);
            console.log(`      Created At: ${new Date(tx.createdAt).toLocaleString()}`);
        });

        console.log('\n' + '━'.repeat(80));
        console.log('\n💳 Final Wallet Status:');
        console.log(`   User: ${user.fullName} (${user.email})`);
        console.log(`   Initial Balance: $${initialBalance.toFixed(2)}`);
        console.log(`   Total Credited: $${TOTAL_AMOUNT.toFixed(2)}`);
        console.log(`   Final Balance: $${finalBalance.toFixed(2)}`);
        console.log(`   Number of Transactions: ${transactions.length}`);
        console.log(`   Currency: USD\n`);

        // Verify
        const expectedBalance = initialBalance + TOTAL_AMOUNT;
        if (Math.abs(finalBalance - expectedBalance) < 0.01) {
            console.log('✅ Balance verification: PASSED');
            console.log(`   Expected: $${expectedBalance.toFixed(2)}, Actual: $${finalBalance.toFixed(2)}\n`);
        } else {
            console.log('⚠️  Balance verification: MISMATCH');
            console.log(`   Expected: $${expectedBalance.toFixed(2)}, Actual: $${finalBalance.toFixed(2)}\n`);
        }

        console.log('✅ Script completed successfully!');
        console.log(`📝 ${transactions.length} transaction(s) have been recorded in the database.\n`);

    } catch (error) {
        console.error('\n❌ Error occurred:');
        console.error(error.message);
        if (error.stack) {
            console.error('\nStack trace:');
            console.error(error.stack);
        }
        process.exit(1);
    } finally {
        // Close MongoDB connection
        if (mongoose.connection.readyState === 1) {
            await mongoose.connection.close();
            console.log('🔌 MongoDB connection closed.');
        }
        process.exit(0);
    }
}

// Run the script
creditUserWallet();

