import mongoose from 'mongoose';
import dotenv from 'dotenv';
import OpenAI from 'openai';

import { connectMongo } from '../src/config/mongo.js';
import BlogPost from '../src/models/BlogPost.model.js';
import { uploadBufferToS3 } from '../src/utils/s3.js';

dotenv.config();

const CURRENT_BUCKET = process.env.S3_BUCKET;
const IMAGE_MODEL = process.env.OPENAI_IMAGE_MODEL || 'gpt-image-1';
const IMAGE_SIZE = process.env.OPENAI_IMAGE_SIZE || '1536x1024';
const IMAGE_QUALITY = process.env.OPENAI_IMAGE_QUALITY || 'high';
const BATCH_LIMIT = Number(process.env.BLOG_IMAGE_REGEN_LIMIT || 0);

function stripHtml(input = '') {
  return String(input).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

function shouldRegenerate(post) {
  if (!post.bannerImageUrl) return true;
  if (!CURRENT_BUCKET) return true;
  return !post.bannerImageUrl.includes(`://${CURRENT_BUCKET}.s3.`);
}

function buildPrompt(post) {
  const description = stripHtml(post.summary || post.contentHtml).slice(0, 700);
  return [
    'Create a photorealistic, human-style editorial blog hero image.',
    `Blog title: ${post.title}`,
    `Blog description/context: ${description}`,
    'Style requirements: modern, natural lighting, emotionally engaging, no text, no logos, no watermark.',
    'Composition: wide hero banner suitable for a technology/news blog.',
  ].join('\n');
}

async function generateImageBuffer(openai, post) {
  const prompt = buildPrompt(post);
  const result = await openai.images.generate({
    model: IMAGE_MODEL,
    prompt,
    size: IMAGE_SIZE,
    quality: IMAGE_QUALITY,
  });

  const first = result?.data?.[0];
  if (!first?.b64_json) {
    throw new Error('OpenAI did not return image data');
  }

  return Buffer.from(first.b64_json, 'base64');
}

async function regenerateBlogImages() {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error('Missing OPENAI_API_KEY in environment');
  }
  if (!process.env.S3_BUCKET || !process.env.S3_REGION || !process.env.S3_ACCESS_KEY || !process.env.S3_SECRET_KEY) {
    throw new Error('Missing S3 env vars (S3_BUCKET, S3_REGION, S3_ACCESS_KEY, S3_SECRET_KEY)');
  }

  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  await connectMongo();
  console.log('Connected to MongoDB');

  const posts = await BlogPost.find({
    isDeleted: { $ne: true },
    title: { $exists: true, $ne: '' },
    contentHtml: { $exists: true, $ne: '' },
  }).sort({ createdAt: -1 });

  const selected = posts.filter(shouldRegenerate);
  const finalPosts = BATCH_LIMIT > 0 ? selected.slice(0, BATCH_LIMIT) : selected;

  console.log(`Found ${posts.length} blogs, ${selected.length} need image regeneration.`);
  if (BATCH_LIMIT > 0) {
    console.log(`Processing limited batch: ${finalPosts.length}`);
  }

  let success = 0;
  let failed = 0;

  for (const post of finalPosts) {
    try {
      console.log(`\nGenerating image for: ${post.title}`);
      const imageBuffer = await generateImageBuffer(openai, post);

      const uploaded = await uploadBufferToS3({
        buffer: imageBuffer,
        contentType: 'image/png',
        keyPrefix: 'post-banners/ai-generated',
      });

      post.bannerImageUrl = uploaded.publicUrl;

      if (!Array.isArray(post.imageUrls) || post.imageUrls.length === 0) {
        post.imageUrls = [uploaded.publicUrl];
      } else {
        post.imageUrls[0] = uploaded.publicUrl;
      }

      await post.save();
      success += 1;
      console.log(`Updated blog ${post._id} with new banner: ${uploaded.publicUrl}`);
    } catch (error) {
      failed += 1;
      console.error(`Failed for blog ${post._id} (${post.title})`);
      console.error(error.message);
    }
  }

  console.log('\nDone.');
  console.log(`Success: ${success}`);
  console.log(`Failed: ${failed}`);
}

regenerateBlogImages()
  .catch((error) => {
    console.error('Script failed:', error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    if (mongoose.connection.readyState === 1) {
      await mongoose.connection.close();
      console.log('MongoDB connection closed');
    }
  });
