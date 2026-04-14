import { Resend } from 'resend';

// Initialize Resend - must have RESEND_API in environment
const resend = new Resend(process.env.RESEND_API);

export async function sendEmail({ to, subject, html, text }) {
    const from = process.env.SMTP_FROM || process.env.RESEND_FROM || 'info@blogcafeai.com';

    try {
        console.log(`Sending email via Resend to ${to}...`);
        const { data, error } = await resend.emails.send({
            from: `BlogCafeAi <${from}>`,
            to: [to],
            subject,
            html,
            text,
        });

        if (error) {
            console.error('Resend error:', error);
            throw error;
        }

        return data;
    } catch (err) {
        console.error('Resend execution error:', err);
        throw err;
    }
}




