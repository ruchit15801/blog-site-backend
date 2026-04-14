import dotenv from 'dotenv';
import mongoose from 'mongoose';
import OpenAI from 'openai';
import { init, getAuthToken } from '@heyputer/puter.js/src/init.cjs';

import { connectMongo } from '../src/config/mongo.js';
import Category from '../src/models/Category.model.js';
import { uploadBufferToS3 } from '../src/utils/s3.js';

dotenv.config();

const FORCE_ALL = String(process.env.CATEGORY_IMAGE_FORCE_ALL || 'true').toLowerCase() === 'true';
const OPENAI_IMAGE_MODEL = process.env.OPENAI_IMAGE_MODEL || 'gpt-image-1';
const PUTER_IMAGE_MODEL = process.env.PUTER_IMAGE_MODEL || 'gpt-image-1-mini';
const PUTER_PROVIDER = process.env.PUTER_IMAGE_PROVIDER || 'openai-image-generation';
let cachedPuterAuthToken = null;

function buildPrompt(category) {
  return [
    'Create a high-quality category cover image for a blog platform.',
    `Category name: ${category.name}`,
    `Category description: ${category.description || 'General blog category image.'}`,
    'STRICT RELEVANCE: image must clearly represent this specific category.',
    'No text, no logos, no watermark, no UI elements.',
    'Editorial, modern, realistic style. Hero/cover friendly composition.',
  ].join('\n');
}

async function getPuterClient() {
  if (process.env.PUTER_AUTH_TOKEN) return init(process.env.PUTER_AUTH_TOKEN);
  const allowBrowserAuth = String(process.env.PUTER_ALLOW_BROWSER_AUTH || 'true').toLowerCase() === 'true';
  if (!allowBrowserAuth) return null;
  if (cachedPuterAuthToken) return init(cachedPuterAuthToken);
  try {
    const token = await getAuthToken();
    cachedPuterAuthToken = token;
    return init(token);
  } catch {
    return null;
  }
}

function decodePuterImageToBuffer(result) {
  if (result?.src && typeof result.src === 'string') {
    const match = result.src.match(/^data:image\/[a-zA-Z]+;base64,(.+)$/);
    if (match) return Buffer.from(match[1], 'base64');
  }
  if (typeof result === 'string') {
    const match = result.match(/^data:image\/[a-zA-Z]+;base64,(.+)$/);
    if (match) return Buffer.from(match[1], 'base64');
  }
  if (result?.b64_json) return Buffer.from(result.b64_json, 'base64');
  throw new Error('Unable to decode Puter image response');
}

async function generateWithPuter(puter, prompt) {
  if (!puter) throw new Error('Puter client unavailable');
  const result = await puter.ai.txt2img({
    prompt,
    provider: PUTER_PROVIDER,
    model: PUTER_IMAGE_MODEL,
    quality: 'high',
    ratio: { w: 16, h: 9 },
  });
  return decodePuterImageToBuffer(result);
}

async function generateWithOpenAI(openai, prompt) {
  const result = await openai.images.generate({
    model: OPENAI_IMAGE_MODEL,
    prompt,
    size: '1536x1024',
    quality: 'high',
  });
  const first = result?.data?.[0];
  if (!first?.b64_json) {
    throw new Error('OpenAI did not return image data');
  }
  return Buffer.from(first.b64_json, 'base64');
}

async function regenerateCategoryImages() {
  if (!process.env.S3_BUCKET || !process.env.S3_REGION || !process.env.S3_ACCESS_KEY || !process.env.S3_SECRET_KEY) {
    throw new Error('Missing S3 env vars (S3_BUCKET, S3_REGION, S3_ACCESS_KEY, S3_SECRET_KEY)');
  }
  const openai = process.env.OPENAI_API_KEY ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY }) : null;
  const puter = await getPuterClient();

  if (!openai && !puter) {
    throw new Error('No image provider available (Puter and OpenAI both unavailable)');
  }

  await connectMongo();
  console.log('Connected to MongoDB');

  const categories = await Category.find({}).sort({ createdAt: -1 });
  const selected = FORCE_ALL ? categories : categories.filter((c) => !c.imageUrl);
  console.log(`Found ${categories.length} categories. Processing ${selected.length} categories.`);

  let success = 0;
  let failed = 0;

  for (const category of selected) {
    const prompt = buildPrompt(category);
    try {
      console.log(`\nGenerating image for category: ${category.name}`);
      let buffer = null;
      let providerUsed = 'puter';
      try {
        buffer = await generateWithPuter(puter, prompt);
      } catch (err) {
        if (!openai) throw err;
        providerUsed = 'openai-fallback';
        buffer = await generateWithOpenAI(openai, prompt);
      }

      const uploaded = await uploadBufferToS3({
        buffer,
        contentType: 'image/png',
        keyPrefix: 'category-images/ai-generated',
      });
      category.imageUrl = uploaded.publicUrl;
      await category.save();

      success += 1;
      console.log(`Updated category "${category.name}" with ${providerUsed} image: ${uploaded.publicUrl}`);
    } catch (error) {
      failed += 1;
      console.error(`Failed category "${category.name}"`);
      console.error(error.message);
    }
  }

  console.log('\nDone.');
  console.log(`Success: ${success}`);
  console.log(`Failed: ${failed}`);
}

regenerateCategoryImages()
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
