import { logoUrl, logoWidth, logoHeight } from '../utils/logoUrl.js';

/**
 * World-Class AI-Powered Newsletter Template (Deep Content Version)
 */
export function newsletterTemplate({ trendingPosts, aiEditorial, yearRange }) {


    return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>BlogCafeAi Deep Dive Digest</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@400;600;700&display=swap');
    
    body {
      margin: 0;
      padding: 0;
      font-family: 'Outfit', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background-color: #f0f2f5;
      color: #1a202c;
    }
    
    .wrapper {
      width: 100%;
      background-color: #f0f2f5;
      padding: 40px 0;
    }
    
    .container {
      max-width: 650px;
      margin: 0 auto;
      background-color: #ffffff;
      border-radius: 32px;
      overflow: hidden;
      box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.15);
    }
    
    .header {
      padding: 48px 40px;
      background: linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%);
      text-align: center;
      color: #ffffff;
    }
    
    .logo {
      margin-bottom: 24px;
      filter: drop-shadow(0 4px 6px rgba(0,0,0,0.1));
    }
    
    .hero-title {
      font-size: 32px;
      font-weight: 700;
      margin: 0;
      letter-spacing: -0.02em;
    }
    
    .editorial-section {
      padding: 48px 40px;
      background-color: #ffffff;
      border-bottom: 1px solid #f1f5f9;
    }
    
    .editorial-header {
      display: flex;
      align-items: center;
      margin-bottom: 24px;
    }
    
    .ai-badge {
      background-color: #7c3aed;
      color: white;
      font-size: 11px;
      font-weight: 700;
      padding: 4px 12px;
      border-radius: 100px;
      text-transform: uppercase;
      letter-spacing: 0.1em;
      margin-right: 12px;
    }
    
    .editorial-title {
      font-size: 14px;
      font-weight: 700;
      color: #94a3b8;
      text-transform: uppercase;
      letter-spacing: 0.1em;
    }
    
    .editorial-content {
      font-size: 17px;
      line-height: 1.8;
      color: #334155;
      white-space: pre-line;
    }
    
    .section-title {
      font-size: 14px;
      font-weight: 700;
      color: #94a3b8;
      text-transform: uppercase;
      letter-spacing: 0.2em;
      margin: 40px 40px 24px;
      text-align: center;
    }
    
    .post-card {
      margin: 0 40px 48px;
      border-radius: 24px;
      overflow: hidden;
      border: 1px solid #f1f5f9;
      background-color: #ffffff;
      text-decoration: none;
      display: block;
      box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);
    }
    
    .post-image {
      width: 100%;
      height: 280px;
      object-fit: cover;
    }
    
    .post-content {
      padding: 32px;
    }
    
    .post-title {
      font-size: 24px;
      font-weight: 700;
      color: #1e293b;
      margin: 0 0 16px;
      line-height: 1.3;
    }
    
    .post-deep-dive {
      background-color: #f8fafc;
      padding: 20px;
      border-radius: 16px;
      margin-bottom: 24px;
      border-left: 4px solid #4f46e5;
    }
    
    .deep-dive-title {
      font-size: 13px;
      font-weight: 700;
      color: #4f46e5;
      text-transform: uppercase;
      margin-bottom: 8px;
    }
    
    .deep-dive-text {
      font-size: 15px;
      line-height: 1.6;
      color: #475569;
      margin: 0;
    }
    
    .btn {
      display: inline-block;
      background-color: #4f46e5;
      color: #ffffff !important;
      padding: 14px 28px;
      border-radius: 14px;
      text-decoration: none;
      font-weight: 600;
      font-size: 15px;
      text-align: center;
    }
    
    .footer {
      padding: 64px 40px;
      background-color: #f8fafc;
      text-align: center;
      color: #64748b;
    }
    
    .social-links {
      margin-bottom: 24px;
    }
    
    .social-link {
      display: inline-block;
      margin: 0 12px;
      color: #94a3b8;
      text-decoration: none;
    }
    
    .footer-note {
      font-size: 12px;
      line-height: 1.8;
      margin-top: 24px;
    }
    
    .unsubscribe {
      color: #4f46e5;
      text-decoration: none;
      font-weight: 600;
    }
  </style>
</head>
<body>
  <div class="wrapper">
    <div class="container">
      <div class="header">
        <img src="${logoUrl}" alt="BlogCafeAi" class="logo" width="${logoWidth}" height="${logoHeight}">
        <h1 class="hero-title">Inside the Intelligence</h1>
      </div>
      
      <div class="editorial-section">
        <div class="editorial-header">
          <span class="ai-badge">Editorial</span>
          <span class="editorial-title">Weekly Deep Dive</span>
        </div>
        <div class="editorial-content">
          ${aiEditorial}
        </div>
      </div>
      
      <div class="section-title">Trending Post Analysis</div>
      
      ${trendingPosts.map(post => `
        <div class="post-card">
          <img src="${post.bannerImageUrl || 'https://images.unsplash.com/photo-1485827404703-89b55fcc595e?auto=format&fit=crop&w=800&q=80'}" alt="${post.title}" class="post-image">
          <div class="post-content">
            <h3 class="post-title">${post.title}</h3>
            
            <div class="post-deep-dive">
              <div class="deep-dive-title">Why this matters</div>
              <p class="deep-dive-text">${post.aiAnalysis || post.summary || post.subtitle || ''}</p>
            </div>
            
            <a href="https://blogcafeai.com/posts/${post.slug}" class="btn">Read Full Article</a>
          </div>
        </div>
      `).join('')}
      
      <div class="footer">
        <div class="social-links">
          <a href="#" class="social-link">Twitter</a>
          <a href="#" class="social-link">LinkedIn</a>
          <a href="#" class="social-link">Instagram</a>
        </div>
        <p class="footer-text">
          © ${yearRange} BlogCafeAi. All rights reserved.
        </p>
        <p class="footer-note">
          Empowering your digital journey with AI-driven insights.<br>
          You are receiving this because you subscribed to BlogCafeAi updates.<br>
          <a href="#" class="unsubscribe">Unsubscribe</a> from this list.
        </p>
      </div>
    </div>
  </div>
</body>
</html>
    `;
}
