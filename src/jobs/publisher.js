import BlogPost from '../models/BlogPost.model.js';
import cron from 'node-cron';
import { creditBlogPostReward } from '../utils/wallet.js';
import { regenerateSitemap } from '../services/sitemap.service.js';

// Runs periodically to publish scheduled posts whose time has come
export async function runPublishTick() {
    const now = new Date();
    const toPublish = await BlogPost.find({ status: 'scheduled', publishedAt: { $lte: now } }).limit(50);
    if (!toPublish.length) return { published: 0 };
    let count = 0;
    for (const post of toPublish) {
        post.status = 'published';
        if (!post.publishedAt) post.publishedAt = now;
        await post.save();

        // Credit wallet for published post (non-blocking)
        creditBlogPostReward(post._id, post.author).catch((err) => {
            console.error(`Failed to credit wallet for post ${post._id}:`, err);
        });

        count += 1;
    }
    if (count > 0) {
        await regenerateSitemap();
    }
    return { published: count };
}

export function startPublisherCron() {
    // Every 1 minute
    const task = cron.schedule('*/1 * * * *', async () => {
        try {
            await runPublishTick();
        } catch (err) {
            // eslint-disable-next-line no-console
            console.error('Publisher cron error:', err);
        }
    }, { scheduled: true });
    return () => task.stop();
}


