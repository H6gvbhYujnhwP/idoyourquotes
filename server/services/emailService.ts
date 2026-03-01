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

/**
 * Send limit reached / approaching warning email
 */
export async function sendLimitWarningEmail(params: {
  to: string;
  name?: string;
  limitType: 'quotes' | 'users' | 'catalog';
  currentUsage: number;
  maxAllowed: number;
  currentTierName: string;
  suggestedTierName?: string;
  suggestedTierPrice?: number;
  newLimit?: string;
  isHardLimit: boolean; // true = at limit, false = approaching (80%+)
}): Promise<boolean> {
  const firstName = params.name?.split(' ')[0] || 'there';
  
  const limitLabels: Record<string, string> = {
    quotes: 'monthly quotes',
    users: 'team members',
    catalog: 'catalogue items',
  };
  const limitLabel = limitLabels[params.limitType] || params.limitType;

  const subject = params.isHardLimit
    ? `You've reached your ${limitLabel} limit — IdoYourQuotes`
    : `You're approaching your ${limitLabel} limit — IdoYourQuotes`;

  const headline = params.isHardLimit
    ? `You've hit your ${limitLabel} limit`
    : `You're running low on ${limitLabel}`;

  const description = params.isHardLimit
    ? `You've used all <strong>${params.maxAllowed} ${limitLabel}</strong> included in your <strong>${params.currentTierName}</strong> plan this month.`
    : `You've used <strong>${params.currentUsage} of ${params.maxAllowed} ${limitLabel}</strong> on your <strong>${params.currentTierName}</strong> plan.`;

  const upgradeBlock = params.suggestedTierName
    ? `
      <div style="background: #f0fdfa; border-radius: 8px; padding: 16px; margin-top: 16px;">
        <p style="font-size: 13px; color: #0d9488; font-weight: 600; margin: 0 0 8px;">Upgrade to ${params.suggestedTierName}</p>
        <p style="font-size: 13px; color: #475569; line-height: 1.6; margin: 0;">
          Get ${params.newLimit || 'higher limits'} for just <strong>£${params.suggestedTierPrice || '—'}/month</strong>. 
          Upgrade instantly from your settings — no data lost.
        </p>
      </div>
      <div style="text-align: center; margin: 28px 0;">
        <a href="${APP_URL}/pricing" style="display: inline-block; background-color: #0d9488; color: white; font-size: 15px; font-weight: 700; text-decoration: none; padding: 14px 32px; border-radius: 8px;">
          View Plans & Upgrade
        </a>
      </div>`
    : `
      <div style="text-align: center; margin: 28px 0;">
        <a href="${APP_URL}/settings?tab=billing" style="display: inline-block; background-color: #1a2b4a; color: white; font-size: 15px; font-weight: 700; text-decoration: none; padding: 14px 32px; border-radius: 8px;">
          Manage Billing
        </a>
      </div>`;

  try {
    const { error } = await resend.emails.send({
      from: FROM_EMAIL,
      to: params.to,
      subject,
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
      <div style="background: ${params.isHardLimit ? '#fef2f2' : '#fef3c7'}; border-radius: 8px; padding: 12px 16px; margin-bottom: 24px;">
        <p style="font-size: 14px; font-weight: 600; color: ${params.isHardLimit ? '#991b1b' : '#92400e'}; margin: 0;">
          ${params.isHardLimit ? '🚫' : '⚠️'} ${params.currentUsage} of ${params.maxAllowed} ${limitLabel} used
        </p>
      </div>

      <h1 style="font-size: 22px; font-weight: 700; color: #1a2b4a; margin: 0 0 16px;">
        ${headline}
      </h1>
      <p style="font-size: 15px; color: #475569; line-height: 1.6; margin: 0 0 16px;">
        Hey ${firstName}, ${description}
      </p>
      ${params.isHardLimit ? `<p style="font-size: 15px; color: #475569; line-height: 1.6; margin: 0 0 24px;">
        You won't be able to create new ${limitLabel === 'monthly quotes' ? 'quotes' : limitLabel} until your limit resets or you upgrade to a higher plan.
      </p>` : `<p style="font-size: 15px; color: #475569; line-height: 1.6; margin: 0 0 24px;">
        You're getting close to your limit. Consider upgrading to avoid any interruption.
      </p>`}

      ${upgradeBlock}

      <div style="border-top: 1px solid #e2e8f0; padding-top: 16px; margin-top: 24px;">
        <p style="font-size: 13px; color: #64748b; margin: 0 0 4px; font-weight: 600;">Questions?</p>
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
      console.error('[Email] Limit warning send failed:', error);
      return false;
    }

    console.log(`[Email] Limit warning (${params.limitType}, hard=${params.isHardLimit}) sent to ${params.to}`);
    return true;
  } catch (err) {
    console.error('[Email] Limit warning send error:', err);
    return false;
  }
}

/**
 * Send tier change confirmation email (upgrade or downgrade)
 */
export async function sendTierChangeEmail(params: {
  to: string;
  name?: string;
  oldTierName: string;
  newTierName: string;
  isUpgrade: boolean;
  newMaxQuotes: number;
  newMaxUsers: number;
  newPrice: number;
}): Promise<boolean> {
  const firstName = params.name?.split(' ')[0] || 'there';
  const quotesLabel = params.newMaxQuotes === -1 ? 'Unlimited' : String(params.newMaxQuotes);

  const subject = params.isUpgrade
    ? `Welcome to ${params.newTierName} — you're upgraded!`
    : `Your plan has changed to ${params.newTierName}`;

  const headline = params.isUpgrade
    ? `You've upgraded to ${params.newTierName}!`
    : `Your plan is now ${params.newTierName}`;

  const body = params.isUpgrade
    ? `Great news — your plan has been upgraded from <strong>${params.oldTierName}</strong> to <strong>${params.newTierName}</strong>. Your new limits are active immediately.`
    : `Your plan has changed from <strong>${params.oldTierName}</strong> to <strong>${params.newTierName}</strong>. Your new limits are now in effect.`;

  try {
    const { error } = await resend.emails.send({
      from: FROM_EMAIL,
      to: params.to,
      subject,
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
      <div style="background: ${params.isUpgrade ? '#f0fdfa' : '#fef3c7'}; border-radius: 8px; padding: 12px 16px; margin-bottom: 24px;">
        <p style="font-size: 14px; font-weight: 600; color: ${params.isUpgrade ? '#065f46' : '#92400e'}; margin: 0;">
          ${params.isUpgrade ? '🎉' : 'ℹ️'} ${params.oldTierName} → ${params.newTierName}
        </p>
      </div>

      <h1 style="font-size: 22px; font-weight: 700; color: #1a2b4a; margin: 0 0 16px;">
        ${headline}
      </h1>
      <p style="font-size: 15px; color: #475569; line-height: 1.6; margin: 0 0 24px;">
        Hey ${firstName}, ${body}
      </p>

      <div style="background: #f8fafc; border-radius: 8px; padding: 16px;">
        <p style="font-size: 13px; color: #1a2b4a; font-weight: 600; margin: 0 0 12px;">Your ${params.newTierName} plan:</p>
        <table style="width: 100%; font-size: 13px; color: #475569;">
          <tr><td style="padding: 4px 0;">Monthly quotes</td><td style="padding: 4px 0; text-align: right; font-weight: 600;">${quotesLabel}</td></tr>
          <tr><td style="padding: 4px 0;">Team members</td><td style="padding: 4px 0; text-align: right; font-weight: 600;">Up to ${params.newMaxUsers}</td></tr>
          <tr><td style="padding: 4px 0;">Price</td><td style="padding: 4px 0; text-align: right; font-weight: 600;">£${params.newPrice}/month + VAT</td></tr>
        </table>
      </div>

      ${!params.isUpgrade ? `
      <div style="background: #fef3c7; border-radius: 8px; padding: 12px 16px; margin-top: 16px;">
        <p style="font-size: 13px; color: #92400e; margin: 0;">
          <strong>Note:</strong> If you currently have more team members than your new plan allows, existing members won't be removed but you won't be able to add new ones until you're within the limit.
        </p>
      </div>` : ''}

      <div style="text-align: center; margin: 28px 0;">
        <a href="${APP_URL}/dashboard" style="display: inline-block; background-color: #1a2b4a; color: white; font-size: 15px; font-weight: 700; text-decoration: none; padding: 14px 32px; border-radius: 8px;">
          Go to Dashboard
        </a>
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
      console.error('[Email] Tier change send failed:', error);
      return false;
    }

    console.log(`[Email] Tier change (${params.isUpgrade ? 'upgrade' : 'downgrade'}) sent to ${params.to}`);
    return true;
  } catch (err) {
    console.error('[Email] Tier change send error:', err);
    return false;
  }
}

/**
 * Send account deletion goodbye email to the user
 */
export async function sendAccountDeletedEmail(params: {
  to: string;
  name?: string;
}): Promise<boolean> {
  const firstName = params.name?.split(' ')[0] || 'there';
  
  try {
    const { error } = await resend.emails.send({
      from: FROM_EMAIL,
      to: params.to,
      subject: 'Your IdoYourQuotes account has been deleted',
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

    <div style="background: white; border-radius: 12px; padding: 32px; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
      <h2 style="font-size: 20px; font-weight: 700; color: #1a2b4a; margin: 0 0 16px;">Sorry to see you go, ${firstName}</h2>
      
      <p style="font-size: 14px; color: #475569; line-height: 1.6; margin: 0 0 16px;">
        Your IdoYourQuotes account has been deleted. Here's what's happened:
      </p>
      
      <div style="background: #f8fafc; border-radius: 8px; padding: 16px; margin-bottom: 16px;">
        <ul style="margin: 0; padding-left: 20px; font-size: 13px; color: #475569; line-height: 1.8;">
          <li>Your subscription has been cancelled — you won't be charged again</li>
          <li>All quotes, documents, and uploaded files have been permanently deleted</li>
          <li>Your catalog and settings have been removed</li>
        </ul>
      </div>
      
      <p style="font-size: 14px; color: #475569; line-height: 1.6; margin: 0 0 16px;">
        If you ever change your mind, we'd love to have you back. You can sign up again at any time at 
        <a href="${APP_URL}" style="color: #0d9488; text-decoration: none; font-weight: 600;">idoyourquotes.com</a>.
      </p>
      
      <p style="font-size: 14px; color: #475569; line-height: 1.6; margin: 0;">
        Thank you for trying IdoYourQuotes. We wish you all the best.
      </p>
    </div>
    
    <div style="text-align: center; margin-top: 24px;">
      <p style="font-size: 11px; color: #94a3b8;">
        IdoYourQuotes · Helping tradespeople quote smarter
      </p>
    </div>
  </div>
</body>
</html>`,
    });

    if (error) {
      console.error('[Email] Account deleted send failed:', error);
      return false;
    }

    console.log(`[Email] Account deleted email sent to ${params.to}`);
    return true;
  } catch (err) {
    console.error('[Email] Account deleted send error:', err);
    return false;
  }
}

/**
 * Send exit survey notification to support
 */
export async function sendExitSurveyToSupport(params: {
  userEmail: string;
  userName?: string;
  companyName?: string;
  reason: string;
  tier: string;
}): Promise<boolean> {
  try {
    const { error } = await resend.emails.send({
      from: FROM_EMAIL,
      to: 'support@idoyourquotes.com',
      subject: `Account Deleted — ${params.userName || params.userEmail} (${params.tier})`,
      html: `
<!DOCTYPE html>
<html>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; padding: 20px;">
  <h2 style="color: #1a2b4a;">Account Deletion — Exit Survey</h2>
  <table style="border-collapse: collapse; width: 100%; max-width: 500px;">
    <tr><td style="padding: 8px; font-weight: 600; color: #475569;">User</td><td style="padding: 8px;">${params.userName || 'N/A'}</td></tr>
    <tr><td style="padding: 8px; font-weight: 600; color: #475569;">Email</td><td style="padding: 8px;">${params.userEmail}</td></tr>
    <tr><td style="padding: 8px; font-weight: 600; color: #475569;">Company</td><td style="padding: 8px;">${params.companyName || 'N/A'}</td></tr>
    <tr><td style="padding: 8px; font-weight: 600; color: #475569;">Plan</td><td style="padding: 8px;">${params.tier}</td></tr>
  </table>
  <h3 style="color: #1a2b4a; margin-top: 24px;">Reason for leaving</h3>
  <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 16px; white-space: pre-wrap; font-size: 14px; color: #334155;">
${params.reason || 'No reason provided'}
  </div>
</body>
</html>`,
    });

    if (error) {
      console.error('[Email] Exit survey send failed:', error);
      return false;
    }

    console.log(`[Email] Exit survey sent to support for ${params.userEmail}`);
    return true;
  } catch (err) {
    console.error('[Email] Exit survey send error:', err);
    return false;
  }
}
