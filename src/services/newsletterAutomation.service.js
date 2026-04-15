import OpenAI from 'openai';
import BlogPost from '../models/BlogPost.model.js';
import User from '../models/User.model.js';
import NewsletterSubscriber from '../models/NewsletterSubscriber.model.js';
import { sendEmail } from '../utils/mailer.js';
import { newsletterTemplate } from '../templates/newsletter.template.js';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

/**
 * Automatically generates and sends the newsletter
 */
export async function runNewsletterAutomation() {
    try {
        console.log('🚀 Starting Newsletter Automation...');

        // 1. Fetch trending posts (top 5 by trendScore and views from last 14 days)
        const trendingPosts = await BlogPost.find({
            status: 'published',
            publishedAt: { $gte: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000) }
        })
        .sort({ trendScore: -1, views: -1 })
        .limit(5)
        .lean();

        if (!trendingPosts || trendingPosts.length === 0) {
            console.log('⚠️ No trending posts found for this period. Skipping newsletter.');
            return;
        }

        // 2. Use AI to generate a Deep Editorial and detailed analysis
        const postSummaries = trendingPosts.map(p => `ID: ${p._id}\nTitle: ${p.title}\nSummary: ${p.summary || p.subtitle}`).join('\n\n');
        
        const aiResponse = await openai.chat.completions.create({
            model: "gpt-4o",
            messages: [
                {
                    role: "system",
                    content: "You are a world-class viral newsletter editor for 'BlogCafeAi'. Your goal is to provide deep value through long-form editorial insights and critical analysis of trending topics."
                },
                {
                    role: "user",
                    content: `Here are our trending posts for the week:\n${postSummaries}\n
Tasks:
1. subject: Create a provocative, high-CTR email subject line.
2. editorial: Write a 500-600 word deep-dive editorial about the overarching trends revealed by these posts. Be bold, insightful, and provocative.
3. analyses: For each post ID, provide a 100-word 'Why this matters' analysis.

Return ONLY JSON with keys: 'subject', 'editorial', 'analyses' (each an entry with 'id' and 'text').`
                }
            ],
            response_format: { type: "json_object" }
        });

        const { subject, editorial, analyses } = JSON.parse(aiResponse.choices[0].message.content);
        
        // Map analyses back to posts
        const postsWithAnalysis = trendingPosts.map(p => ({
            ...p,
            aiAnalysis: (analyses.find(a => String(a.id) === String(p._id)) || {}).text || p.summary || p.subtitle
        }));

        const yearRange = `${new Date().getFullYear() - 1} - ${new Date().getFullYear()}`;

        // 3. Fetch all recipients (Registered Users + Newsletter Subscribers)
        const [users, subscribers] = await Promise.all([
            User.find({}).select('email').lean(),
            NewsletterSubscriber.find({}).select('email').lean()
        ]);

        const recipientEmails = [...new Set([
            ...users.map(u => u.email),
            ...subscribers.map(s => s.email)
        ])];

        console.log(`📧 Sending deep-content newsletter to ${recipientEmails.length} recipients...`);

        // 4. Generate HTML and Send
        for (const email of recipientEmails) {
            try {
                const html = newsletterTemplate({
                    trendingPosts: postsWithAnalysis,
                    aiEditorial: editorial,
                    yearRange
                });

                await sendEmail({
                    to: email,
                    subject: subject || 'BlogCafeAi | Weekly Deep Intelligence',
                    html
                });
            } catch (err) {
                console.error(`❌ Failed to send newsletter to ${email}:`, err.message);
            }
        }

        console.log('✅ Newsletter Automation completed successfully.');
    } catch (error) {
        console.error('❌ Newsletter Automation Error:', error);
    }
}
