import { Router } from 'express';
import { home, listAllPosts, trendingByCategory, topTrendingAuthors, topTrendingCategories, submitContactMessage, getPostsByAuthorId, getPostsByTag } from '../controllers/home.controller.js';

const router = Router();

router.get('/', home);
router.get('/all-posts', listAllPosts);
router.get('/post-by-authorId/:authorId', getPostsByAuthorId);
router.get('/trending-by-category', trendingByCategory);
router.get('/top-trending-authors', topTrendingAuthors);
router.get('/top-trending-categories', topTrendingCategories);
router.post('/contact', submitContactMessage);
router.get('/post-by-tag', getPostsByTag);

export default router;
