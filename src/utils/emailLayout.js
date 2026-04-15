import { logoUrl, logoWidth, logoHeight } from './logoUrl.js';

/**
 * Wraps any HTML content in a branded BlogCafeAi layout
 */
export function brandedLayout(content, yearRange) {

    
    return `
<!DOCTYPE html>
<html lang="en">
<head>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@400;600;700&display=swap');
    
    body {
      margin: 0;
      padding: 0;
      font-family: 'Outfit', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background-color: #f8fafc;
      color: #1e293b;
    }
    
    .wrapper {
      width: 100%;
      background-color: #f8fafc;
      padding: 40px 20px;
    }
    
    .container {
      max-width: 600px;
      margin: 0 auto;
      background-color: #ffffff;
      border-radius: 24px;
      overflow: hidden;
      box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
      border: 1px solid #e2e8f0;
    }
    
    .header {
      padding: 32px;
      text-align: center;
      border-bottom: 1px solid #f1f5f9;
    }
    
    .logo {
      display: block;
      margin: 0 auto;
    }
    
    .content {
      padding: 40px;
      line-height: 1.6;
      font-size: 16px;
      color: #475569;
    }
    
    .footer {
      padding: 32px;
      background-color: #f1f5f9;
      text-align: center;
      font-size: 13px;
      color: #64748b;
    }
  </style>
</head>
<body>
  <div class="wrapper">
    <div class="container">
      <div class="header">
        <img src="${logoUrl}" alt="BlogCafeAi" class="logo" width="${logoWidth}" height="${logoHeight}" style="display: block; margin: 0 auto;" />
      </div>
      <div class="content">
        ${content}
      </div>
      <div class="footer">
        © ${yearRange} BlogCafeAi. All rights reserved.
      </div>
    </div>
  </div>
</body>
</html>
    `;
}
