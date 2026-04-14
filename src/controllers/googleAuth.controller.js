import { OAuth2Client } from 'google-auth-library';
import User from '../models/User.model.js';
import { signAccessToken, signRefreshToken } from '../security/auth.js';

const client = new OAuth2Client(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
);

/**
 * Get Google OAuth authorization URL
 * Frontend should redirect user to this URL
 */
export async function getGoogleAuthUrl(req, res, next) {
    try {
        const authUrl = client.generateAuthUrl({
            access_type: 'offline',
            scope: [
                'https://www.googleapis.com/auth/userinfo.email',
                'https://www.googleapis.com/auth/userinfo.profile',
            ],
            prompt: 'consent', // Force consent screen to get refresh token
            redirect_uri: process.env.GOOGLE_REDIRECT_URI,
        });

        res.json({
            success: true,
            authUrl,
        });
    } catch (err) {
        return next(err);
    }
}

/**
 * Handle Google OAuth callback
 * This endpoint receives the authorization code from Google
 */
export async function googleCallback(req, res, next) {
    try {
        console.log('🔵 Google OAuth callback received');
        console.log('   Query params:', req.query);
        console.log('   URL:', req.url);

        const { code, error: googleError } = req.query;

        // Handle Google OAuth errors
        if (googleError) {
            console.error('❌ Google OAuth error:', googleError);
            const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
            const redirectUrl = `${frontendUrl}/auth/google/callback?success=false&error=${encodeURIComponent(googleError)}`;
            return res.redirect(redirectUrl);
        }

        if (!code) {
            console.error('❌ Missing authorization code');
            const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
            const redirectUrl = `${frontendUrl}/auth/google/callback?success=false&error=${encodeURIComponent('Authorization code is required')}`;
            return res.redirect(redirectUrl);
        }

        console.log('✅ Authorization code received, exchanging for tokens...');

        // Exchange code for tokens
        const { tokens } = await client.getToken(code);
        client.setCredentials(tokens);

        // Get user info from Google
        const ticket = await client.verifyIdToken({
            idToken: tokens.id_token,
            audience: process.env.GOOGLE_CLIENT_ID,
        });

        const payload = ticket.getPayload();
        if (!payload) {
            return res.status(400).json({
                success: false,
                error: {
                    code: 'INVALID_TOKEN',
                    message: 'Failed to verify Google token',
                },
            });
        }

        const { sub: googleId, email, name, picture } = payload;

        if (!email) {
            return res.status(400).json({
                success: false,
                error: {
                    code: 'EMAIL_REQUIRED',
                    message: 'Google account email is required',
                },
            });
        }

        // Check if user exists with this Google ID
        let user = await User.findOne({ googleId });

        // If not found, check if user exists with this email
        if (!user) {
            user = await User.findOne({ email: email.toLowerCase() });

            if (user) {
                // User exists with email but not Google ID - link the account
                user.googleId = googleId;
                user.authProvider = 'google';
                if (!user.avatarUrl && picture) {
                    user.avatarUrl = picture;
                }
                if (!user.isEmailVerified) {
                    user.isEmailVerified = true; // Google emails are verified
                }
                await user.save();
            } else {
                // New user - create account
                user = await User.create({
                    email: email.toLowerCase(),
                    fullName: name || email.split('@')[0],
                    googleId,
                    authProvider: 'google',
                    avatarUrl: picture || null,
                    isEmailVerified: true, // Google emails are verified
                    passwordHash: null, // No password for OAuth users
                });
            }
        } else {
            // Update user info if needed
            if (picture && !user.avatarUrl) {
                user.avatarUrl = picture;
            }
            if (!user.isEmailVerified) {
                user.isEmailVerified = true;
            }
            await user.save();
        }

        // Generate JWT tokens
        const token = signAccessToken({ id: user._id, role: user.role });
        const refreshToken = signRefreshToken({ id: user._id, role: user.role });

        // Redirect to frontend with tokens
        const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
        // In your backend googleCallback function, update this:
        const redirectUrl = `${frontendUrl}/auth/google/callback?token=${encodeURIComponent(token)}&refreshToken=${encodeURIComponent(refreshToken)}&success=true`;
        res.redirect(redirectUrl);
    } catch (err) {
        console.error('Google OAuth callback error:', err);
        const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
        const redirectUrl = `${frontendUrl}/auth/google/callback?success=false&error=${encodeURIComponent(err.message)}`;
        res.redirect(redirectUrl);
    }
}

/**
 * Verify Google ID token and authenticate user
 * Alternative flow: Frontend sends ID token directly
 */
export async function verifyGoogleToken(req, res, next) {
    try {
        const { idToken } = req.body;

        if (!idToken) {
            return res.status(400).json({
                success: false,
                error: {
                    code: 'MISSING_TOKEN',
                    message: 'Google ID token is required',
                },
            });
        }

        // Verify the token
        const ticket = await client.verifyIdToken({
            idToken,
            audience: process.env.GOOGLE_CLIENT_ID,
        });

        const payload = ticket.getPayload();
        if (!payload) {
            return res.status(400).json({
                success: false,
                error: {
                    code: 'INVALID_TOKEN',
                    message: 'Failed to verify Google token',
                },
            });
        }

        const { sub: googleId, email, name, picture } = payload;

        if (!email) {
            return res.status(400).json({
                success: false,
                error: {
                    code: 'EMAIL_REQUIRED',
                    message: 'Google account email is required',
                },
            });
        }

        // Check if user exists with this Google ID
        let user = await User.findOne({ googleId });

        // If not found, check if user exists with this email
        if (!user) {
            user = await User.findOne({ email: email.toLowerCase() });

            if (user) {
                // User exists with email but not Google ID - link the account
                user.googleId = googleId;
                user.authProvider = 'google';
                if (!user.avatarUrl && picture) {
                    user.avatarUrl = picture;
                }
                if (!user.isEmailVerified) {
                    user.isEmailVerified = true;
                }
                await user.save();
            } else {
                // New user - create account
                user = await User.create({
                    email: email.toLowerCase(),
                    fullName: name || email.split('@')[0],
                    googleId,
                    authProvider: 'google',
                    avatarUrl: picture || null,
                    isEmailVerified: true,
                    passwordHash: null,
                });
            }
        } else {
            // Update user info if needed
            if (picture && !user.avatarUrl) {
                user.avatarUrl = picture;
            }
            if (!user.isEmailVerified) {
                user.isEmailVerified = true;
            }
            await user.save();
        }

        // Generate JWT tokens
        const token = signAccessToken({ id: user._id, role: user.role });
        const refreshToken = signRefreshToken({ id: user._id, role: user.role });

        res.json({
            success: true,
            user: sanitizeUser(user),
            token,
            refreshToken,
        });
    } catch (err) {
        console.error('Google token verification error:', err);
        return next(err);
    }
}

function sanitizeUser(user) {
    return {
        _id: user._id,
        fullName: user.fullName,
        email: user.email,
        role: user.role,
        avatarUrl: user.avatarUrl,
        isEmailVerified: user.isEmailVerified,
        authProvider: user.authProvider,
    };
}






