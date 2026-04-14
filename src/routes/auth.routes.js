import { Router } from 'express';
import { signup, login, refresh, me } from '../controllers/auth.controller.js';
import { getGoogleAuthUrl, googleCallback, verifyGoogleToken } from '../controllers/googleAuth.controller.js';
import { authMiddleware } from '../security/auth.js';

const router = Router();

// Standard auth routes
router.post('/signup', signup);
router.post('/login', login);
router.post('/refresh', refresh);
router.get('/me', authMiddleware, me);

// Google OAuth routes
router.get('/google/url', getGoogleAuthUrl);
// Important: Handle callback with explicit logging
router.get('/google/callback', (req, res, next) => {
    console.log('🔵 Google callback route hit!');
    console.log('   Method:', req.method);
    console.log('   URL:', req.url);
    console.log('   Full URL:', req.protocol + '://' + req.get('host') + req.originalUrl);
    googleCallback(req, res, next);
});
router.post('/google/verify', verifyGoogleToken);

// Debug route to test if routes are accessible
router.get('/google/test', (req, res) => {
    res.json({ 
        success: true, 
        message: 'Google OAuth routes are working', 
        path: '/api/auth/google/callback',
        backendPort: process.env.PORT || 4000,
        redirectUri: process.env.GOOGLE_REDIRECT_URI,
        frontendUrl: process.env.FRONTEND_URL
    });
});

export default router;


