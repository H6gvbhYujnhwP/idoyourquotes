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

/**
 * Send Day 3 check-in email
 */
export async function sendCheckInEmail(params: {
  to: string;
  name?: string;
}): Promise<boolean> {
  const firstName = params.name?.split(' ')[0] || 'there';

  try {
    const { error } = await resend.emails.send({
      from: FROM_EMAIL,
      to: params.to,
      subject: `How's it going, ${firstName}?`,
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
        Hey ${firstName}, how's it going?
      </h1>
      <p style="font-size: 15px; color: #475569; line-height: 1.6; margin: 0 0 16px;">
        You've been using IdoYourQuotes for a few days now. We'd love to know how you're finding it.
      </p>
      <p style="font-size: 15px; color: #475569; line-height: 1.6; margin: 0 0 16px;">
        Have you tried uploading a tender document yet? Our AI can interpret PDFs, images, audio recordings, and emails — then generate a professional quote for you to review and send.
      </p>
      <p style="font-size: 15px; color: #475569; line-height: 1.6; margin: 0 0 24px;">
        If you have any questions or need help getting started, just reply to this email or contact our support team — we're here to help.
      </p>

      <div style="text-align: center; margin: 28px 0;">
        <a href="${APP_URL}/dashboard" style="display: inline-block; background-color: #1a2b4a; color: white; font-size: 15px; font-weight: 700; text-decoration: none; padding: 14px 32px; border-radius: 8px;">
          Go to Dashboard
        </a>
      </div>

      <div style="border-top: 1px solid #e2e8f0; padding-top: 16px; margin-top: 24px;">
        <p style="font-size: 13px; color: #64748b; margin: 0 0 4px; font-weight: 600;">Need help?</p>
        <p style="font-size: 13px; color: #64748b; margin: 0;">
          Email us at <a href="mailto:support@idoyourquotes.com" style="color: #0d9488; text-decoration: none;">support@idoyourquotes.com</a>
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
      console.error('[Email] Check-in send failed:', error);
      return false;
    }

    console.log(`[Email] Check-in sent to ${params.to}`);
    return true;
  } catch (err) {
    console.error('[Email] Check-in send error:', err);
    return false;
  }
}

/**
 * Send trial expiry reminder (2 days before)
 */
export async function sendTrialExpiryReminder(params: {
  to: string;
  name?: string;
  daysLeft: number;
}): Promise<boolean> {
  const firstName = params.name?.split(' ')[0] || 'there';

  try {
    const { error } = await resend.emails.send({
      from: FROM_EMAIL,
      to: params.to,
      subject: `${firstName}, your free trial ends in ${params.daysLeft} days`,
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
      <div style="background: #fef3c7; border-radius: 8px; padding: 12px 16px; margin-bottom: 24px;">
        <p style="font-size: 14px; font-weight: 600; color: #92400e; margin: 0;">
          ⏰ Your free trial ends in ${params.daysLeft} day${params.daysLeft !== 1 ? 's' : ''}
        </p>
      </div>

      <h1 style="font-size: 22px; font-weight: 700; color: #1a2b4a; margin: 0 0 16px;">
        Don't lose your quoting superpowers
      </h1>
      <p style="font-size: 15px; color: #475569; line-height: 1.6; margin: 0 0 16px;">
        Hey ${firstName}, your IdoYourQuotes trial is almost up. To keep creating professional quotes with AI, choose a plan that works for you.
      </p>
      <p style="font-size: 15px; color: #475569; line-height: 1.6; margin: 0 0 24px;">
        Plans start from just <strong>£59/month</strong> — and you'll keep all the quotes and data you've already created.
      </p>

      <div style="text-align: center; margin: 28px 0;">
        <a href="${APP_URL}/pricing" style="display: inline-block; background-color: #0d9488; color: white; font-size: 15px; font-weight: 700; text-decoration: none; padding: 14px 32px; border-radius: 8px;">
          Choose a Plan
        </a>
      </div>

      <div style="background: #f0fdfa; border-radius: 8px; padding: 16px; margin-top: 16px;">
        <p style="font-size: 13px; color: #0d9488; font-weight: 600; margin: 0 0 8px;">What you get:</p>
        <p style="font-size: 13px; color: #475569; line-height: 1.8; margin: 0;">
          ✓ AI-powered document interpretation<br>
          ✓ Electrical symbol counting &amp; takeoff<br>
          ✓ Professional quote generation<br>
          ✓ PDF export &amp; email proposals<br>
          ✓ All your existing data kept safe
        </p>
      </div>

      <div style="border-top: 1px solid #e2e8f0; padding-top: 16px; margin-top: 24px;">
        <p style="font-size: 13px; color: #64748b; margin: 0 0 4px; font-weight: 600;">Questions?</p>
        <p style="font-size: 13px; color: #64748b; margin: 0;">
          Email us at <a href="mailto:support@idoyourquotes.com" style="color: #0d9488; text-decoration: none;">support@idoyourquotes.com</a> — we're happy to help.
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
      console.error('[Email] Trial reminder send failed:', error);
      return false;
    }

    console.log(`[Email] Trial reminder sent to ${params.to}`);
    return true;
  } catch (err) {
    console.error('[Email] Trial reminder send error:', err);
    return false;
  }
}
