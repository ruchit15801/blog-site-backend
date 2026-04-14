import dotenv from 'dotenv';
import mongoose from 'mongoose';
import OpenAI from 'openai';
import { init, getAuthToken } from '@heyputer/puter.js/src/init.cjs';

import { connectMongo } from '../src/config/mongo.js';
import User from '../src/models/User.model.js';
import { uploadBufferToS3 } from '../src/utils/s3.js';

dotenv.config();

const FORCE_ALL = String(process.env.USER_AVATAR_FORCE_ALL || 'true').toLowerCase() === 'true';
const PUTER_IMAGE_MODEL = process.env.PUTER_AVATAR_MODEL || process.env.PUTER_IMAGE_MODEL || 'gpt-image-1-mini';
const OPENAI_IMAGE_MODEL = process.env.OPENAI_AVATAR_MODEL || process.env.OPENAI_IMAGE_MODEL || 'gpt-image-1';
const PUTER_PROVIDER = process.env.PUTER_IMAGE_PROVIDER || 'openai-image-generation';
const OPENAI_CHAT_MODEL = process.env.OPENAI_CHAT_MODEL || 'gpt-4.1-mini';

let cachedPuterAuthToken = null;

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

async function inferGender(openai, fullName) {
  if (!openai || !fullName) return 'unknown';
  try {
    const prompt = [
      'Infer likely gender presentation from name only.',
      `Name: ${fullName}`,
      'Return ONLY one word: male, female, or unknown.',
      'If not confident, return unknown.',
    ].join('\n');
    const response = await openai.responses.create({
      model: OPENAI_CHAT_MODEL,
      input: prompt,
    });
    const text = String(response.output_text || '').trim().toLowerCase();
    if (text.includes('female')) return 'female';
    if (text.includes('male')) return 'male';
    return 'unknown';
  } catch {
    return 'unknown';
  }
}

function resolvePromptGender(value) {
  if (value === 'male') return 'male';
  if (value === 'female') return 'female';
  return 'neutral';
}

function buildPrompt(user, promptGender) {
  const roleLabel = user.role === 'admin' ? 'blog admin/author' : 'blog community user';
  return [
    'Create a realistic professional profile avatar portrait for a blog platform user.',
    `User name: ${user.fullName || 'User'}`,
    `Role: ${roleLabel}`,
    `Gender presentation guidance: ${promptGender}`,
    'Headshot only, centered face, studio-quality lighting, clean background.',
    'No text, no logo, no watermark, no extra hands, no distortion.',
    'Natural human look, suitable for profile picture.',
  ].join('\n');
}

async function generateWithPuter(puter, prompt) {
  if (!puter) throw new Error('Puter client unavailable');
  const result = await puter.ai.txt2img({
    prompt,
    provider: PUTER_PROVIDER,
    model: PUTER_IMAGE_MODEL,
    quality: 'high',
    ratio: { w: 1, h: 1 },
  });
  return decodePuterImageToBuffer(result);
}

async function generateWithOpenAI(openai, prompt) {
  if (!openai) throw new Error('OpenAI client unavailable');
  const result = await openai.images.generate({
    model: OPENAI_IMAGE_MODEL,
    prompt,
    size: '1024x1024',
    quality: 'high',
  });
  const first = result?.data?.[0];
  if (!first?.b64_json) throw new Error('OpenAI did not return image data');
  return Buffer.from(first.b64_json, 'base64');
}

async function regenerateUserAvatars() {
  if (!process.env.S3_BUCKET || !process.env.S3_REGION || !process.env.S3_ACCESS_KEY || !process.env.S3_SECRET_KEY) {
    throw new Error('Missing S3 env vars (S3_BUCKET, S3_REGION, S3_ACCESS_KEY, S3_SECRET_KEY)');
  }

  const openai = process.env.OPENAI_API_KEY ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY }) : null;
  const puter = await getPuterClient();
  if (!openai && !puter) {
    throw new Error('No provider available for avatar generation');
  }

  await connectMongo();
  console.log('Connected to MongoDB');

  const users = await User.find({}).sort({ createdAt: -1 });
  const selected = FORCE_ALL
    ? users
    : users.filter((u) => !u.avatarUrl || !String(u.avatarUrl).trim());

  console.log(`Found ${users.length} users. Processing ${selected.length} users.`);

  let success = 0;
  let failed = 0;
  for (const user of selected) {
    try {
      const resolvedGender = (user.gender && user.gender !== 'unknown')
        ? user.gender
        : await inferGender(openai, user.fullName);
      const promptGender = resolvePromptGender(resolvedGender);
      const prompt = buildPrompt(user, promptGender);

      let buffer = null;
      let providerUsed = 'puter';
      try {
        buffer = await generateWithPuter(puter, prompt);
      } catch (err) {
        if (!openai) throw err;
        buffer = await generateWithOpenAI(openai, prompt);
        providerUsed = 'openai-fallback';
      }

      const uploaded = await uploadBufferToS3({
        buffer,
        contentType: 'image/png',
        keyPrefix: 'avatars/ai-generated',
      });

      user.avatarUrl = uploaded.publicUrl;
      user.avatar = uploaded.publicUrl;
      if (!user.gender || user.gender === 'unknown') {
        user.gender = resolvedGender === 'unknown' ? 'unknown' : resolvedGender;
      }
      await user.save();

      success += 1;
      console.log(`Updated ${user.email} (${providerUsed}, ${promptGender}) -> ${uploaded.publicUrl}`);
    } catch (error) {
      failed += 1;
      console.error(`Failed user ${user.email}: ${error.message}`);
    }
  }

  console.log('\nDone.');
  console.log(`Success: ${success}`);
  console.log(`Failed: ${failed}`);
}

regenerateUserAvatars()
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
