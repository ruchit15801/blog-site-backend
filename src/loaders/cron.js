import cron from 'node-cron';
import { runNewsletterAutomation } from '../services/newsletterAutomation.service.js';

/**
 * Initializes all cron jobs for the application
 */
export function initCronJobs() {
    console.log('🗓️ Initializing Cron Jobs...');

    // Schedule Newsletter: Every Tuesday and Friday at 9:00 AM IST
    // IST is UTC+5:30. So 9:00 AM IST is 3:30 AM UTC.
    // Cron format: 'minute hour dayOfMonth month dayOfWeek'
    // '30 3 * * 2,5' -> 3:30 AM every Tuesday (2) and Friday (5)
    cron.schedule('30 3 * * 2,5', async () => {
        try {
            await runNewsletterAutomation();
        } catch (err) {
            console.error('❌ Newsletter Cron Error:', err.message);
        }
    }, {
        timezone: "UTC"
    });

    console.log('✅ Cron Jobs scheduled: Newsletter (Tue & Fri 9:00 AM IST)');
}
