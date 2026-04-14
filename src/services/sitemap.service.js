import fs from 'fs/promises';
import path from 'path';
import BlogPost from '../models/BlogPost.model.js';

const PUBLIC_DIR = path.resolve(process.cwd(), 'public');
const SITEMAP_PATH = path.resolve(PUBLIC_DIR, 'sitemap.xml');
const SITE_URL = (process.env.SITE_URL || process.env.FRONTEND_URL || 'http://localhost:3000').replace(/\/+$/, '');

function escapeXml(input = '') {
  return String(input)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export async function regenerateSitemap() {
  const posts = await BlogPost.find({ status: 'published' })
    .select('slug title updatedAt publishedAt')
    .sort({ publishedAt: -1 })
    .lean();

  const urls = posts
    .filter((post) => post.slug)
    .map((post) => {
      const loc = `${SITE_URL}/blog/${post.slug}`;
      const lastModDate = post.updatedAt || post.publishedAt || new Date();
      const lastMod = new Date(lastModDate).toISOString();
      return [
        '  <url>',
        `    <loc>${escapeXml(loc)}</loc>`,
        `    <lastmod>${escapeXml(lastMod)}</lastmod>`,
        `    <news:title>${escapeXml(post.title || '')}</news:title>`,
        '  </url>',
      ].join('\n');
    });

  const xml = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:news="http://www.google.com/schemas/sitemap-news/0.9">',
    ...urls,
    '</urlset>',
    '',
  ].join('\n');

  await fs.mkdir(PUBLIC_DIR, { recursive: true });
  await fs.writeFile(SITEMAP_PATH, xml, 'utf8');
  return { path: SITEMAP_PATH, count: urls.length };
}
