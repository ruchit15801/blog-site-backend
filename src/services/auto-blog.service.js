import slugify from 'slugify';
import sanitizeHtml from 'sanitize-html';
import { init, getAuthToken } from '@heyputer/puter.js/src/init.cjs';
import OpenAI from 'openai';
import BlogPost from '../models/BlogPost.model.js';
import Category from '../models/Category.model.js';
import AutoBlogConfig from '../models/AutoBlogConfig.model.js';
import AutoGenJob from '../models/AutoGenJob.model.js';
import User from '../models/User.model.js';
import { uploadBufferToS3 } from '../utils/s3.js';
import { computeReadTimeMinutesFromHtml } from '../utils/readtime.js';
import { regenerateSitemap } from './sitemap.service.js';

const PUTER_MODEL = process.env.PUTER_CHAT_MODEL || 'gpt-5-mini';
const PUTER_IMAGE_MODEL = process.env.PUTER_IMAGE_MODEL || 'gpt-image-1-mini';
const OPENAI_CHAT_MODEL = process.env.OPENAI_CHAT_MODEL || 'gpt-4.1-mini';
const OPENAI_IMAGE_MODEL = process.env.OPENAI_IMAGE_MODEL || 'gpt-image-1';
let cachedPuterAuthToken = null;

function parseJsonFromText(text) {
  const source = String(text || '');
  const fencedMatch = source.match(/```json\s*([\s\S]*?)```/i) || source.match(/```\s*([\s\S]*?)```/i);
  const payload = fencedMatch ? fencedMatch[1] : source;
  return JSON.parse(payload.trim());
}

function stripHtml(input = '') {
  return String(input).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

function asText(chatResponse) {
  if (typeof chatResponse === 'string') return chatResponse;
  if (chatResponse?.message?.content) return chatResponse.message.content.toString();
  if (chatResponse?.content) return chatResponse.content.toString();
  return String(chatResponse || '');
}

function extractTextFromOpenAIResponse(response) {
  const outputText = response?.output_text;
  if (outputText) return String(outputText);
  const outputs = Array.isArray(response?.output) ? response.output : [];
  for (const item of outputs) {
    const content = Array.isArray(item?.content) ? item.content : [];
    for (const block of content) {
      if (block?.type === 'output_text' && block?.text) return String(block.text);
    }
  }
  return '';
}

function decodeImageResultToBuffer(result) {
  if (Buffer.isBuffer(result)) return result;
  if (typeof result === 'string') {
    const dataUrlMatch = result.match(/^data:image\/[a-zA-Z]+;base64,(.+)$/);
    if (dataUrlMatch) return Buffer.from(dataUrlMatch[1], 'base64');
  }
  if (result?.src && typeof result.src === 'string') {
    const dataUrlMatch = result.src.match(/^data:image\/[a-zA-Z]+;base64,(.+)$/);
    if (dataUrlMatch) return Buffer.from(dataUrlMatch[1], 'base64');
  }
  if (result?.b64_json) return Buffer.from(result.b64_json, 'base64');
  throw new Error('Unable to decode image returned by Puter');
}

function buildImagePrompt(blogData, categoryName) {
  return [
    'Generate a modern editorial featured image for a technology/news blog.',
    `Category: ${categoryName}`,
    `Title: ${blogData.seoTitle || blogData.metaTitle}`,
    `Context: ${blogData.summary || ''}`,
    'STRICT RELEVANCE REQUIREMENT: the image subject must directly represent the blog topic/title/context.',
    'Do not return generic abstract art unrelated to the topic.',
    'Requirements: high quality, no text, no watermark, human-like style, website hero banner composition.',
  ].join('\n');
}

async function getPuterClient() {
  if (process.env.PUTER_AUTH_TOKEN) {
    return init(process.env.PUTER_AUTH_TOKEN);
  }

  // Local/dev fallback: open browser login and fetch token once.
  // Useful when PUTER_AUTH_TOKEN is not set and admin runs "run-now".
  if (cachedPuterAuthToken) {
    return init(cachedPuterAuthToken);
  }

  const allowBrowserAuth = String(process.env.PUTER_ALLOW_BROWSER_AUTH || 'true').toLowerCase() === 'true';
  if (!allowBrowserAuth) {
    throw new Error('Missing PUTER_AUTH_TOKEN and browser auth is disabled');
  }

  const token = await getAuthToken();
  if (!token) {
    throw new Error('Puter browser authentication failed to return token');
  }
  cachedPuterAuthToken = token;
  return init(token);
}

function getOpenAIClient() {
  if (!process.env.OPENAI_API_KEY) return null;
  return new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
}

async function ensureConfig() {
  let config = await AutoBlogConfig.findOne({});
  if (!config) {
    config = await AutoBlogConfig.create({});
  }
  return config;
}

async function pickCategory(config) {
  const selectedCategories = Array.isArray(config.categories) && config.categories.length > 0
    ? await Category.find({ _id: { $in: config.categories } }).lean()
    : await Category.find({}).lean();
  if (!selectedCategories.length) {
    throw new Error('No categories available for auto-blog generation');
  }

  const categoryIds = selectedCategories.map((c) => c._id);
  const distribution = await BlogPost.aggregate([
    { $match: { category: { $in: categoryIds }, status: 'published' } },
    { $group: { _id: '$category', count: { $sum: 1 } } },
  ]);
  const countsByCategory = new Map(distribution.map((d) => [String(d._id), d.count]));

  const sorted = selectedCategories
    .slice()
    .sort((a, b) => (countsByCategory.get(String(a._id)) || 0) - (countsByCategory.get(String(b._id)) || 0));

  const withoutLast = sorted.filter((c) => String(c._id) !== String(config.lastCategoryUsed || ''));
  return (withoutLast[0] || sorted[0]);
}

async function createTrendingTopic(puter, categoryName) {
  const prompt = [
    'You are a senior SEO editor.',
    `Find one highly relevant trending topic for the category: "${categoryName}".`,
    'Source signals to consider: current news, search trends, and industry relevance.',
    'Return ONLY JSON with keys: topic, primaryKeyword, secondaryKeywords (array of 5), intent, angle.',
    'Make topic specific and current for this week.',
  ].join('\n');
  const response = await puter.ai.chat(prompt, { model: PUTER_MODEL });
  return parseJsonFromText(asText(response));
}

async function createTrendingTopicWithOpenAI(openai, categoryName) {
  const prompt = [
    'You are a senior SEO editor.',
    `Find one highly relevant trending topic for the category: "${categoryName}".`,
    'Source signals to consider: current news, search trends, and industry relevance.',
    'Return ONLY JSON with keys: topic, primaryKeyword, secondaryKeywords (array of 5), intent, angle.',
    'Make topic specific and current for this week.',
  ].join('\n');
  const response = await openai.responses.create({
    model: OPENAI_CHAT_MODEL,
    input: prompt,
  });
  return parseJsonFromText(extractTextFromOpenAIResponse(response));
}

async function createBlogDraft(puter, payload) {
  const prompt = [
    'You are an expert long-form blog writer and SEO strategist.',
    `Category: ${payload.categoryName}`,
    `Topic: ${payload.topic}`,
    `Primary keyword: ${payload.primaryKeyword}`,
    `Secondary keywords: ${(payload.secondaryKeywords || []).join(', ')}`,
    `Search intent: ${payload.intent}`,
    `Editorial angle: ${payload.angle}`,
    'Write a full-length SEO blog (minimum 1400 words) with excellent readability.',
    'Use clear introduction, multiple H2/H3 sections, and conclusion.',
    'Return ONLY JSON keys:',
    'seoTitle, metaTitle, metaDescription, slug, keywords (array), tags (array), summary, contentHtml.',
    'contentHtml must include one H1 at top and structured headings and paragraphs.',
  ].join('\n');
  const response = await puter.ai.chat(prompt, { model: PUTER_MODEL });
  return parseJsonFromText(asText(response));
}

async function createBlogDraftWithOpenAI(openai, payload) {
  const prompt = [
    'You are an expert long-form blog writer and SEO strategist.',
    `Category: ${payload.categoryName}`,
    `Topic: ${payload.topic}`,
    `Primary keyword: ${payload.primaryKeyword}`,
    `Secondary keywords: ${(payload.secondaryKeywords || []).join(', ')}`,
    `Search intent: ${payload.intent}`,
    `Editorial angle: ${payload.angle}`,
    'Write a full-length SEO blog (minimum 1400 words) with excellent readability.',
    'Use clear introduction, multiple H2/H3 sections, and conclusion.',
    'Return ONLY JSON keys:',
    'seoTitle, metaTitle, metaDescription, slug, keywords (array), tags (array), summary, contentHtml.',
    'contentHtml must include one H1 at top and structured headings and paragraphs.',
  ].join('\n');
  const response = await openai.responses.create({
    model: OPENAI_CHAT_MODEL,
    input: prompt,
  });
  return parseJsonFromText(extractTextFromOpenAIResponse(response));
}

async function createFeaturedImage(puter, blogData, categoryName) {
  const prompt = buildImagePrompt(blogData, categoryName);

  let lastError = null;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const imageResult = await puter.ai.txt2img({
        prompt,
        provider: 'openai-image-generation',
        model: PUTER_IMAGE_MODEL,
        quality: 'high',
        ratio: { w: 16, h: 9 },
      });
      const buffer = decodeImageResultToBuffer(imageResult);
      if (!buffer || !buffer.length) {
        throw new Error('Empty image returned by Puter');
      }
      return buffer;
    } catch (error) {
      lastError = error;
    }
  }
  throw new Error(`Featured image generation failed after retries: ${lastError?.message || 'unknown error'}`);
}

async function createFeaturedImageWithOpenAI(openai, blogData, categoryName) {
  const prompt = buildImagePrompt(blogData, categoryName);
  let lastError = null;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
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
    } catch (error) {
      lastError = error;
    }
  }
  throw new Error(`OpenAI featured image generation failed after retries: ${lastError?.message || 'unknown error'}`);
}

async function ensureUniqueSlug(base) {
  let slug = slugify(base || 'daily-trending-blog', { lower: true, strict: true });
  if (!slug) slug = `daily-trending-blog-${Date.now()}`;
  let uniqueSlug = slug;
  let n = 1;
  while (await BlogPost.exists({ slug: uniqueSlug })) {
    uniqueSlug = `${slug}-${n++}`;
  }
  return uniqueSlug;
}

async function selectAuthorId() {
  const admin = await User.findOne({ role: 'admin' }).select('_id').lean();
  if (!admin?._id) {
    throw new Error('Auto-blog generation requires at least one admin user');
  }
  return admin._id;
}

export async function getAutoBlogConfig() {
  return ensureConfig();
}

export async function connectPuterForAutomation() {
  const client = await getPuterClient();
  return { connected: Boolean(client) };
}

export async function updateAutoBlogConfig(input = {}) {
  const config = await ensureConfig();
  if (typeof input.enabled === 'boolean') config.enabled = input.enabled;
  if (Array.isArray(input.categories)) config.categories = input.categories;
  if (typeof input.runAtHourUTC === 'number') config.runAtHourUTC = input.runAtHourUTC;
  if (typeof input.runAtMinuteUTC === 'number') config.runAtMinuteUTC = input.runAtMinuteUTC;
  await config.save();
  return config;
}

export async function runAutoBlogGeneration({ force = false } = {}) {
  const config = await ensureConfig();
  if (!config.enabled && !force) return { skipped: true, reason: 'disabled' };

  const today = new Date();
  const dayStart = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate(), 0, 0, 0, 0));
  const existingJob = await AutoGenJob.findOne({ jobDate: dayStart });
  if (existingJob && !force) return { skipped: true, reason: 'already_run_today' };

  const job = existingJob || await AutoGenJob.create({ jobDate: dayStart, status: 'pending' });

  try {
    const openai = getOpenAIClient();
    let puter = null;
    try {
      puter = await getPuterClient();
    } catch (err) {
      if (!openai) throw err;
    }

    const category = await pickCategory(config);
    let topicData = null;
    let blogProvider = 'puter';
    try {
      if (!puter) throw new Error('Puter unavailable');
      topicData = await createTrendingTopic(puter, category.name);
    } catch (err) {
      if (!openai) throw err;
      topicData = await createTrendingTopicWithOpenAI(openai, category.name);
      blogProvider = 'openai-fallback';
    }

    job.topic = topicData.topic;
    job.categoryName = category.name;
    const duplicateTopic = await BlogPost.exists({
      title: new RegExp(topicData.topic || '', 'i'),
      createdAt: { $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) },
    });
    if (duplicateTopic && !force) {
      throw new Error(`Duplicate topic detected for recent period: ${topicData.topic}`);
    }

    let draft = null;
    try {
      if (blogProvider !== 'puter' || !puter) throw new Error('Switching to OpenAI for blog draft');
      draft = await createBlogDraft(puter, { ...topicData, categoryName: category.name });
    } catch (err) {
      if (!openai) throw err;
      draft = await createBlogDraftWithOpenAI(openai, { ...topicData, categoryName: category.name });
      blogProvider = 'openai-fallback';
    }
    const contentHtml = sanitizeHtml(String(draft.contentHtml || ''), {
      allowedTags: sanitizeHtml.defaults.allowedTags.concat(['h1', 'h2', 'h3', 'img']),
      allowedAttributes: {
        a: ['href', 'name', 'target', 'rel'],
        img: ['src', 'alt'],
      },
    });
    if (stripHtml(contentHtml).length < 3000) {
      throw new Error('Generated content is too short');
    }

    let imageBuffer = null;
    let imageProvider = 'puter';
    try {
      if (!puter) throw new Error('Puter unavailable');
      imageBuffer = await createFeaturedImage(puter, draft, category.name);
    } catch (err) {
      if (!openai) throw err;
      imageBuffer = await createFeaturedImageWithOpenAI(openai, draft, category.name);
      imageProvider = 'openai-fallback';
    }
    const uploaded = await uploadBufferToS3({
      buffer: imageBuffer,
      contentType: 'image/png',
      keyPrefix: 'post-banners/auto-generated',
    });
    if (!uploaded?.publicUrl) {
      throw new Error('Featured image upload failed, blog publish blocked');
    }

    const slug = await ensureUniqueSlug(draft.slug || draft.seoTitle || topicData.topic);
    const authorId = await selectAuthorId();
    const post = await BlogPost.create({
      title: draft.seoTitle || topicData.topic,
      subtitle: topicData.angle,
      contentHtml,
      summary: draft.summary || stripHtml(contentHtml).slice(0, 260),
      bannerImageUrl: uploaded.publicUrl,
      imageUrls: [uploaded.publicUrl],
      category: category._id,
      tags: Array.isArray(draft.tags) ? draft.tags.slice(0, 10) : [],
      author: authorId,
      status: 'published',
      publishedAt: new Date(),
      slug,
      readingTimeMinutes: computeReadTimeMinutesFromHtml(contentHtml),
      metaTitle: draft.metaTitle || draft.seoTitle || topicData.topic,
      metaDescription: draft.metaDescription || draft.summary || '',
      seoKeywords: Array.isArray(draft.keywords) ? draft.keywords.slice(0, 15) : [],
      autoGeneratedBy: `blog:${blogProvider};image:${imageProvider}`,
    });

    config.lastCategoryUsed = category._id;
    config.lastRunAt = new Date();
    await config.save();

    job.status = 'success';
    job.postId = post._id;
    job.error = null;
    await job.save();

    await regenerateSitemap();

    return { skipped: false, postId: post._id, category: category.name, topic: topicData.topic };
  } catch (error) {
    job.status = 'failed';
    job.error = error.message;
    await job.save();
    throw error;
  }
}
