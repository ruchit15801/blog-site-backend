import dotenv from 'dotenv';
dotenv.config();

// Get environment variables
const port = process.env.PORT || 4000;
const redirectUri = process.env.GOOGLE_REDIRECT_URI;
const backendUrl = process.env.BACKEND_URL || `http://localhost:${port}`;

console.log('\n=== Google OAuth Redirect URI Configuration ===\n');
console.log('Current Configuration:');
console.log('  Backend URL:', backendUrl);
console.log('  Port:', port);
console.log('  GOOGLE_REDIRECT_URI from .env:', redirectUri || '(NOT SET)');
console.log('\nExpected Redirect URI Format:');
console.log('  Local:', `http://localhost:${port}/api/auth/google/callback`);
console.log('  Production:', `${backendUrl}/api/auth/google/callback`);
console.log('\n⚠️  IMPORTANT: Add this EXACT URL in Google Cloud Console:');
console.log(`  ${redirectUri || `${backendUrl}/api/auth/google/callback`}`);
console.log('\nSteps to fix in GCP:');
console.log('  1. Go to Google Cloud Console');
console.log('  2. Navigate to APIs & Services > Credentials');
console.log('  3. Click on your OAuth 2.0 Client ID');
console.log('  4. Under "Authorized redirect URIs", add:');
console.log(`     ${redirectUri || `${backendUrl}/api/auth/google/callback`}`);
console.log('  5. Save the changes');
console.log('\n===============================================\n');
