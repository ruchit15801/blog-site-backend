import crypto from 'crypto';
import bcrypt from 'bcrypt';
import { z } from 'zod';
import { sendEmail } from '../utils/mailer.js';
import { logoUrl, logoWidth, logoHeight } from '../utils/logoUrl.js';

import User from '../models/User.model.js';
import PasswordResetToken from '../models/PasswordResetToken.model.js';

const forgotSchema = z.object({ email: z.string().email() });
// Updated to OTP-based reset to align with new flow
const resetSchema = z.object({ email: z.string().email(), otp: z.string().min(4).max(6), newPassword: z.string().min(6) });

export async function forgotPassword(req, res, next) {
    try {
        const input = forgotSchema.parse(req.body);
        const user = await User.findOne({ email: input.email });
        if (!user) return res.json({ success: true });
        const tokenPlain = crypto.randomBytes(32).toString('hex');
        const tokenHash = crypto.createHash('sha256').update(tokenPlain).digest('hex');
        const expiresAt = new Date(Date.now() + 1000 * 60 * 30);
        await PasswordResetToken.create({ email: input.email, tokenHash, expiresAt });
        // TODO: send via email provider. For now, return token in dev only
        const payload = { success: true };
        if (process.env.NODE_ENV !== 'production') payload.token = tokenPlain;
        res.json(payload);
    } catch (err) {
        if (err instanceof z.ZodError) return res.status(422).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Invalid input', details: err.flatten() } });
        return next(err);
    }
}

export async function resetPassword(req, res, next) {
    try {
        const input = resetSchema.parse(req.body);
        const tokenHash = crypto.createHash('sha256').update(input.otp).digest('hex');
        const record = await PasswordResetToken.findOne({ email: input.email, tokenHash, used: false, expiresAt: { $gt: new Date() } });
        if (!record) return res.status(400).json({ success: false, error: { code: 'INVALID_OTP', message: 'Invalid or expired OTP' } });
        const user = await User.findOne({ email: input.email });
        if (!user) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'User not found' } });
        user.passwordHash = await bcrypt.hash(input.newPassword, 10);
        await user.save();
        record.used = true;
        await record.save();
        res.json({ success: true });
    } catch (err) {
        if (err instanceof z.ZodError) return res.status(422).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Invalid input', details: err.flatten() } });
        return next(err);
    }
}

// ===== OTP FLOW (email OTP with Nodemailer) =====
const emailSchema = z.object({ email: z.string().email() });
const verifySchema = z.object({ email: z.string().email(), otp: z.string().min(4).max(6) });
const changeSchema = z.object({ email: z.string().email(), otp: z.string().min(4).max(6), newPassword: z.string().min(6) });

function generateOtp() {
    return String(Math.floor(100000 + Math.random() * 900000));
}

function otpEmailHtml(userName, otp) {
    const currentYear = new Date().getFullYear();
    const prevYear = currentYear - 1;
    const yearRange = `${prevYear} - ${currentYear}`;


    return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Reset Your Password - BlogCafeAi</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&display=swap');
    body {
      margin: 0;
      padding: 0;
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
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
      box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1);
      border: 1px solid #e2e8f0;
    }
    .header {
      padding: 40px 40px 20px;
      text-align: center;
    }
    .content {
      padding: 0 40px 40px;
    }
    .logo {
      display: block;
      margin: 0 auto;
      margin-bottom: 24px;
    }
    .greeting {
      font-size: 18px;
      font-weight: 600;
      color: #0f172a;
      margin-bottom: 16px;
    }
    .text {
      font-size: 16px;
      line-height: 1.6;
      color: #475569;
      margin-bottom: 32px;
    }
    .otp-container {
      background: linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%);
      padding: 32px;
      border-radius: 20px;
      text-align: center;
      margin-bottom: 32px;
      box-shadow: 0 10px 15px -3px rgba(79, 70, 229, 0.3);
    }
    .otp-code {
      font-size: 40px;
      font-weight: 700;
      letter-spacing: 12px;
      color: #ffffff;
      margin: 0;
      text-shadow: 0 2px 4px rgba(0,0,0,0.1);
    }
    .otp-label {
      font-size: 12px;
      text-transform: uppercase;
      letter-spacing: 2px;
      color: rgba(255, 255, 255, 0.8);
      margin-bottom: 8px;
      font-weight: 600;
    }
    .footer {
      padding: 32px 40px;
      background-color: #f1f5f9;
      text-align: center;
      border-top: 1px solid #e2e8f0;
    }
    .footer-text {
      font-size: 13px;
      color: #64748b;
      margin: 0;
      line-height: 1.5;
    }
    .social-links {
      margin-bottom: 16px;
    }
    .social-icon {
      display: inline-block;
      margin: 0 8px;
      color: #94a3b8;
      text-decoration: none;
    }
    .expiry-note {
      font-size: 14px;
      color: #94a3b8;
      margin-top: 24px;
      font-style: italic;
    }
  </style>
</head>
<body>
  <div class="wrapper">
    <div class="container">
      <div class="header">
        <img src="${logoUrl}" alt="BlogCafeAi" width="${logoWidth}" height="${logoHeight}" style="display: block; margin: 0 auto;" />
      </div>
      <div class="content">
        <div class="greeting">Hi ${userName},</div>
        <div class="text">
          We received a request to access your BlogCafeAi account. Use the verification code below to complete your password reset.
        </div>
        
        <div class="otp-container">
          <div class="otp-label">Verification Code</div>
          <div class="otp-code">${otp}</div>
        </div>
        
        <div class="text" style="margin-bottom: 12px;">
          This code will expire in <strong>10 minutes</strong>.
        </div>
        <div class="text">
          If you didn't request this, you can safely ignore this email. Your password will remain unchanged.
        </div>
        
        <div class="text" style="margin-top: 40px; border-top: 1px solid #f1f5f9; padding-top: 24px;">
          Best regards,<br/>
          <strong>Team BlogCafeAi</strong>
        </div>
      </div>
      <div class="footer">
        <p class="footer-text">
          © ${yearRange} BlogCafeAi. All rights reserved.
        </p>
        <p class="footer-text" style="margin-top: 8px;">
          Empowering your digital journey with AI-driven insights.
        </p>
      </div>
    </div>
  </div>
</body>
</html>
`;
}



export async function forgotPasswordOtp(req, res, next) {
    try {
        const { email } = emailSchema.parse(req.body);
        const user = await User.findOne({ email });
        if (!user) return res.json({ success: true });
        const otp = generateOtp();
        const tokenHash = crypto.createHash('sha256').update(otp).digest('hex');
        const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
        await PasswordResetToken.create({ email, tokenHash, expiresAt, used: false });

        const html = otpEmailHtml(user.fullName || user.name || user.email, otp);
        await sendEmail({ to: email, subject: 'Your Password Reset Code', html });


        const payload = { success: true };
        if (process.env.NODE_ENV !== 'production') payload.debugOtp = otp;
        res.json(payload);
    } catch (err) {
        if (err instanceof z.ZodError) return res.status(422).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Invalid input', details: err.flatten() } });
        return next(err);
    }
}

export async function resendOtp(req, res, next) {
    try {
        const { email } = emailSchema.parse(req.body);
        const user = await User.findOne({ email });
        if (!user) return res.json({ success: true });
        const otp = generateOtp();
        const tokenHash = crypto.createHash('sha256').update(otp).digest('hex');
        const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
        await PasswordResetToken.create({ email, tokenHash, expiresAt, used: false });

        const html = otpEmailHtml(user.fullName || user.name || user.email, otp);
        await sendEmail({ to: email, subject: 'Your Password Reset Code (Resent)', html });


        const payload = { success: true };
        if (process.env.NODE_ENV !== 'production') payload.debugOtp = otp;
        res.json(payload);
    } catch (err) {
        if (err instanceof z.ZodError) return res.status(422).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Invalid input', details: err.flatten() } });
        return next(err);
    }
}

export async function verifyOtp(req, res, next) {
    try {
        const { email, otp } = verifySchema.parse(req.body);
        const tokenHash = crypto.createHash('sha256').update(otp).digest('hex');
        const record = await PasswordResetToken.findOne({ email, tokenHash, used: false, expiresAt: { $gt: new Date() } });
        if (!record) return res.status(400).json({ success: false, error: { code: 'INVALID_OTP', message: 'Invalid or expired OTP' } });
        res.json({ success: true, verified: true });
    } catch (err) {
        if (err instanceof z.ZodError) return res.status(422).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Invalid input', details: err.flatten() } });
        return next(err);
    }
}

export async function changePassword(req, res, next) {
    try {
        const { email, otp, newPassword } = changeSchema.parse(req.body);
        const tokenHash = crypto.createHash('sha256').update(otp).digest('hex');
        const record = await PasswordResetToken.findOne({ email, tokenHash, used: false, expiresAt: { $gt: new Date() } });
        if (!record) return res.status(400).json({ success: false, error: { code: 'INVALID_OTP', message: 'Invalid or expired OTP' } });
        const user = await User.findOne({ email });
        if (!user) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'User not found' } });
        user.passwordHash = await bcrypt.hash(newPassword, 10);
        await user.save();
        record.used = true;
        await record.save();
        res.json({ success: true });
    } catch (err) {
        if (err instanceof z.ZodError) return res.status(422).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Invalid input', details: err.flatten() } });
        return next(err);
    }
}
