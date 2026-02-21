/**
 * Email Service — Resend
 * Handles transactional emails (verification, notifications)
 */
import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY || '');

const FROM_EMAIL = 'IdoYourQuotes <noreply@idoyourquotes.com>';
const APP_URL = process.env.APP_URL || 'https://idoyourquotes.com';

/**
 * Send email verification link
 */
export async function sendVerificationEmail(params: {
  to: string;
  name?: string;
  token: string;
}): Promise<boolean> {
  const verifyUrl = `${APP_URL}/api/auth/verify-email?token=${params.token}`;
  const firstName = params.name?.split(' ')[0] || 'there';

  try {
    const { error } = await resend.emails.send({
      from: FROM_EMAIL,
      to: params.to,
      subject: 'Verify your email — IdoYourQuotes',
      html: `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #f8fafc;">
  <div style="max-width: 480px; margin: 0 auto; padding: 40px 20px;">
    
    <div style="text-align: center; margin-bottom: 32px;">
      <img src="https://files.manuscdn.com/user_upload_by_module/session_file/310519663048135071/uMprjfIbjwvxZRuj.png" alt="IdoYourQuotes" style="height: 48px;" />
    </div>

    <div style="background: white; border-radius: 12px; padding: 32px; border: 1px solid #e2e8f0;">
      <h1 style="font-size: 22px; font-weight: 700; color: #1a2b4a; margin: 0 0 16px;">
        Hey ${firstName}, verify your email
      </h1>
      <p style="font-size: 15px; color: #475569; line-height: 1.6; margin: 0 0 24px;">
        Thanks for signing up to IdoYourQuotes. Click the button below to verify your email and activate your <strong>14-day free trial</strong>.
      </p>
      
      <div style="text-align: center; margin: 28px 0;">
        <a href="${verifyUrl}" style="display: inline-block; background-color: #0d9488; color: white; font-size: 15px; font-weight: 700; text-decoration: none; padding: 14px 32px; border-radius: 8px;">
          Verify My Email
        </a>
      </div>

      <p style="font-size: 13px; color: #94a3b8; line-height: 1.5; margin: 0 0 16px;">
        Or copy and paste this link into your browser:
      </p>
      <p style="font-size: 12px; color: #0d9488; word-break: break-all; margin: 0 0 24px;">
        ${verifyUrl}
      </p>

      <div style="border-top: 1px solid #e2e8f0; padding-top: 16px;">
        <p style="font-size: 12px; color: #94a3b8; margin: 0;">
          This link expires in 24 hours. If you didn't create an account, you can safely ignore this email.
        </p>
      </div>
    </div>

    <div style="text-align: center; margin-top: 24px;">
      <p style="font-size: 12px; color: #94a3b8;">
        &copy; ${new Date().getFullYear()} IdoYourQuotes. All rights reserved.
      </p>
    </div>
  </div>
</body>
</html>`,
    });

    if (error) {
      console.error('[Email] Verification send failed:', error);
      return false;
    }

    console.log(`[Email] Verification sent to ${params.to}`);
    return true;
  } catch (err) {
    console.error('[Email] Verification send error:', err);
    return false;
  }
}

/**
 * Send welcome email after verification
 */
export async function sendWelcomeEmail(params: {
  to: string;
  name?: string;
}): Promise<boolean> {
  const firstName = params.name?.split(' ')[0] || 'there';

  try {
    const { error } = await resend.emails.send({
      from: FROM_EMAIL,
      to: params.to,
      subject: 'Welcome to IdoYourQuotes — your 14-day trial is active!',
      html: `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #f8fafc;">
  <div style="max-width: 480px; margin: 0 auto; padding: 40px 20px;">
    
    <div style="text-align: center; margin-bottom: 32px;">
      <img src="https://files.manuscdn.com/user_upload_by_module/session_file/310519663048135071/uMprjfIbjwvxZRuj.png" alt="IdoYourQuotes" style="height: 48px;" />
    </div>

    <div style="background: white; border-radius: 12px; padding: 32px; border: 1px solid #e2e8f0;">
      <h1 style="font-size: 22px; font-weight: 700; color: #1a2b4a; margin: 0 0 16px;">
        Welcome, ${firstName}!
      </h1>
      <p style="font-size: 15px; color: #475569; line-height: 1.6; margin: 0 0 16px;">
        Your email is verified and your <strong>14-day free trial</strong> is now active. You've got full access to all features — no credit card needed.
      </p>
      <p style="font-size: 15px; color: #475569; line-height: 1.6; margin: 0 0 24px;">
        Only enter card details after 14 days if you're happy — we know you'll love it.
      </p>
      
      <div style="text-align: center; margin: 28px 0;">
        <a href="${APP_URL}/dashboard" style="display: inline-block; background-color: #1a2b4a; color: white; font-size: 15px; font-weight: 700; text-decoration: none; padding: 14px 32px; border-radius: 8px;">
          Go to Dashboard
        </a>
      </div>

      <div style="background: #f0fdfa; border-radius: 8px; padding: 16px; margin-top: 16px;">
        <p style="font-size: 13px; color: #0d9488; font-weight: 600; margin: 0 0 8px;">Quick start:</p>
        <p style="font-size: 13px; color: #475569; line-height: 1.6; margin: 0;">
          1. Create a new quote<br>
          2. Upload a tender document, PDF, image, or audio<br>
          3. Let AI interpret and generate your quote<br>
          4. Review, edit, and send
        </p>
      </div>
    </div>

    <div style="text-align: center; margin-top: 24px;">
      <p style="font-size: 12px; color: #94a3b8;">
        &copy; ${new Date().getFullYear()} IdoYourQuotes. All rights reserved.
      </p>
    </div>
  </div>
</body>
</html>`,
    });

    if (error) {
      console.error('[Email] Welcome send failed:', error);
      return false;
    }

    console.log(`[Email] Welcome sent to ${params.to}`);
    return true;
  } catch (err) {
    console.error('[Email] Welcome send error:', err);
    return false;
  }
}
