import { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";
import type { Express, Request, Response } from "express";
import { getSessionCookieOptions } from "./cookies";
import { sdk } from "./sdk";
import { sendVerificationEmail, sendWelcomeEmail } from "../services/emailService";
import { getDb, getUserPrimaryOrg } from "../db";
import crypto from "crypto";

// Free email providers — treat each address as its own domain for trial limits
const FREE_EMAIL_PROVIDERS = new Set([
  'gmail.com', 'googlemail.com', 'yahoo.com', 'yahoo.co.uk', 'hotmail.com',
  'hotmail.co.uk', 'outlook.com', 'live.com', 'live.co.uk', 'icloud.com',
  'me.com', 'aol.com', 'protonmail.com', 'proton.me', 'mail.com',
  'zoho.com', 'ymail.com', 'gmx.com', 'gmx.co.uk', 'fastmail.com',
]);

/**
 * Domains in the ANTI_GAMING_BYPASS_DOMAINS env var get a fresh trial
 * every time, regardless of whether the domain has been seen before.
 *
 * Comma-separated list, e.g. "thegreenagents.co.uk,sweetbyte.co.uk".
 * Set this in Render's environment for any domain you (the platform
 * owner) use for testing the signup / trial flow.
 *
 * Empty / unset env var => no bypass, normal anti-gaming for every
 * business domain.
 */
function getAntiGamingBypassDomains(): Set<string> {
  const raw = process.env.ANTI_GAMING_BYPASS_DOMAINS;
  if (!raw) return new Set();
  return new Set(
    raw.split(',').map(d => d.trim().toLowerCase()).filter(d => d.length > 0)
  );
}

/**
 * Check if an email domain already has a trial account.
 *
 * For business domains: previously we returned true and the register
 * endpoint hard-rejected the signup. Now we still return true so the
 * caller knows the domain has been used, but the register endpoint
 * uses that signal to skip the free trial rather than reject — the
 * user can still register, they just go straight to "must subscribe"
 * with no trial period (trialEndsAt set to registration moment).
 *
 * For free email providers: no domain restriction (each gmail address
 * is treated as its own business — trial-per-address).
 *
 * For domains listed in ANTI_GAMING_BYPASS_DOMAINS: always returns
 * false so the caller grants a fresh 14-day trial (testing override).
 */
async function isDomainTrialUsed(email: string): Promise<boolean> {
  const domain = email.toLowerCase().split('@')[1];
  if (!domain) return false;

  // Free email providers — skip domain check (allow multiple gmail signups etc.)
  if (FREE_EMAIL_PROVIDERS.has(domain)) return false;

  // Owner-configured bypass list — always treat as fresh
  const bypass = getAntiGamingBypassDomains();
  if (bypass.has(domain)) {
    console.log(`[Auth] Domain ${domain} is on ANTI_GAMING_BYPASS_DOMAINS — granting fresh trial`);
    return false;
  }

  const db = await getDb();
  if (!db) return false;

  // Check if any user with this domain already exists
  const { users } = await import("../../drizzle/schema");
  const { like } = await import("drizzle-orm");
  const existing = await db.select({ id: users.id })
    .from(users)
    .where(like(users.email, `%@${domain}`))
    .limit(1);

  return existing.length > 0;
}

export function registerOAuthRoutes(app: Express) {
  // Login endpoint
  app.post("/api/auth/login", async (req: Request, res: Response) => {
    const { email, password } = req.body;

    if (!email || !password) {
      res.status(400).json({ error: "Email and password are required" });
      return;
    }

    try {
      const result = await sdk.login(email, password);
      
      if (!result) {
        res.status(401).json({ error: "Invalid email or password" });
        return;
      }

      const cookieOptions = getSessionCookieOptions(req);
      res.cookie(COOKIE_NAME, result.token, { ...cookieOptions, maxAge: ONE_YEAR_MS });

      res.json({ 
        success: true, 
        user: {
          id: result.user.id,
          email: result.user.email,
          name: result.user.name,
          role: result.user.role,
        }
      });
    } catch (error) {
      console.error("[Auth] Login failed", error);
      res.status(500).json({ error: "Login failed" });
    }
  });

  // Register endpoint — with anti-gaming
  app.post("/api/auth/register", async (req: Request, res: Response) => {
    const { email, password, name, companyName, defaultTradeSector } = req.body;

    if (!email || !password) {
      res.status(400).json({ error: "Email and password are required" });
      return;
    }

    // Company name is required for new registrations
    if (!companyName || companyName.trim().length === 0) {
      res.status(400).json({ error: "Company/Organization name is required" });
      return;
    }

    // Basic email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      res.status(400).json({ error: "Invalid email format" });
      return;
    }

    // Password strength validation
    if (password.length < 8) {
      res.status(400).json({ error: "Password must be at least 8 characters" });
      return;
    }

    // Anti-gaming: check whether this business domain has been used before.
    //
    // Previous behaviour: hard-rejected signup with 409.
    // New behaviour: still register, but skip the free trial — the new
    // org's trialEndsAt is set to the registration moment, so the user
    // lands on the "Trial expired — choose a plan" UX immediately.
    //
    // Free email providers (gmail etc.) and bypass-list domains return
    // false here, so they get a fresh 14-day trial as normal.
    let skipTrial = false;
    try {
      skipTrial = await isDomainTrialUsed(email);
      if (skipTrial) {
        console.log(`[Auth] Domain previously used for ${email} — registering without free trial`);
      }
    } catch (err) {
      console.error("[Auth] Domain check failed, granting trial:", err);
      // Don't block registration if check fails — better to over-grant a trial
      // than to under-grant and reject a legitimate user.
      skipTrial = false;
    }

    try {
      const result = await sdk.register(email, password, name, companyName.trim(), defaultTradeSector, skipTrial);
      
      if (!result) {
        res.status(409).json({ error: "An account with this email already exists" });
        return;
      }

      // Generate verification token
      const token = crypto.randomBytes(32).toString('hex');
      
      // Save token to user record
      const db = await getDb();
      if (db) {
        const { users } = await import("../../drizzle/schema");
        const { eq } = await import("drizzle-orm");
        await db.update(users).set({
          emailVerificationToken: token,
          emailVerificationSentAt: new Date(),
        }).where(eq(users.id, result.user.id));
      }

      // Send verification email (non-blocking)
      sendVerificationEmail({
        to: email,
        name: name || undefined,
        token,
      }).catch(err => console.error("[Auth] Failed to send verification email:", err));

      // Still log them in immediately — they can use the app but see a verification banner
      const cookieOptions = getSessionCookieOptions(req);
      res.cookie(COOKIE_NAME, result.token, { ...cookieOptions, maxAge: ONE_YEAR_MS });

      res.json({ 
        success: true, 
        user: {
          id: result.user.id,
          email: result.user.email,
          name: result.user.name,
          role: result.user.role,
        },
        requiresVerification: true,
        // True when the new org was registered without a free trial because
        // the business domain had been used previously. The client uses this
        // to redirect to /pricing with an explanatory banner instead of
        // dropping the user on an empty dashboard with a red expired bar.
        noTrial: skipTrial,
      });
    } catch (error) {
      console.error("[Auth] Registration failed", error);
      res.status(500).json({ error: "Registration failed" });
    }
  });

  // Email verification endpoint
  app.get("/api/auth/verify-email", async (req: Request, res: Response) => {
    const { token } = req.query;

    if (!token || typeof token !== 'string') {
      res.redirect('/?error=invalid-token');
      return;
    }

    try {
      const db = await getDb();
      if (!db) {
        res.redirect('/?error=server-error');
        return;
      }

      const { users } = await import("../../drizzle/schema");
      const { eq } = await import("drizzle-orm");

      // Find user by token
      const [user] = await db.select()
        .from(users)
        .where(eq(users.emailVerificationToken, token))
        .limit(1);

      if (!user) {
        res.redirect('/login?error=invalid-token');
        return;
      }

      // Check token isn't expired (24 hours)
      if (user.emailVerificationSentAt) {
        const hoursSinceSent = (Date.now() - new Date(user.emailVerificationSentAt).getTime()) / (1000 * 60 * 60);
        if (hoursSinceSent > 24) {
          res.redirect('/login?error=token-expired');
          return;
        }
      }

      // Mark as verified
      await db.update(users).set({
        emailVerified: true,
        emailVerificationToken: null,
      }).where(eq(users.id, user.id));

      console.log(`[Auth] Email verified for user ${user.id} (${user.email})`);

      // Send welcome email (non-blocking).
      //
      // E.21 (May 2026) — the welcome email is now state-aware. We look
      // up the user's primary org to decide which copy to send:
      //
      //   - paid-active : org is on a paid tier with active/trialing
      //                   status (user paid for a plan before clicking
      //                   the verification link)
      //   - trial-active: org is on the trial tier with trialEndsAt
      //                   in the future (the standard happy path)
      //   - no-trial    : org is on the trial tier but trialEndsAt has
      //                   already passed — typically the E.18
      //                   "domain previously used" path where
      //                   trialEndsAt was set equal to trialStartsAt
      //
      // Failure to look up the org is non-fatal — we fall through to
      // 'trial-active' as a sensible default rather than crash the
      // verification flow.
      let welcomeState: 'trial-active' | 'paid-active' | 'no-trial' = 'trial-active';
      let welcomeTierName: string | undefined;
      try {
        const primaryOrg = await getUserPrimaryOrg(user.id);
        if (primaryOrg) {
          const orgAny = primaryOrg as any;
          const tier = (orgAny.subscriptionTier || 'trial') as string;
          const status = (orgAny.subscriptionStatus || 'trialing') as string;
          const trialEndsAt = orgAny.trialEndsAt ? new Date(orgAny.trialEndsAt) : null;

          if (tier !== 'trial' && (status === 'active' || status === 'trialing')) {
            welcomeState = 'paid-active';
            // Capitalise tier label for the subject + body (e.g. "Pro")
            welcomeTierName = tier.charAt(0).toUpperCase() + tier.slice(1);
          } else if (tier === 'trial' && trialEndsAt && trialEndsAt.getTime() > Date.now()) {
            welcomeState = 'trial-active';
          } else {
            welcomeState = 'no-trial';
          }
        }
      } catch (lookupErr) {
        console.error("[Auth] Failed to resolve welcome email state — defaulting to trial-active:", lookupErr);
      }

      sendWelcomeEmail({
        to: user.email,
        name: user.name || undefined,
        state: welcomeState,
        tierName: welcomeTierName,
      }).catch(err => console.error("[Auth] Failed to send welcome email:", err));

      // Redirect to dashboard with success
      res.redirect('/dashboard?verified=true');
    } catch (error) {
      console.error("[Auth] Verification failed", error);
      res.redirect('/?error=verification-failed');
    }
  });

  // Resend verification email
  app.post("/api/auth/resend-verification", async (req: Request, res: Response) => {
    const { email } = req.body;
    if (!email) {
      res.status(400).json({ error: "Email is required" });
      return;
    }

    try {
      const db = await getDb();
      if (!db) {
        res.status(500).json({ error: "Server error" });
        return;
      }

      const { users } = await import("../../drizzle/schema");
      const { eq } = await import("drizzle-orm");

      const [user] = await db.select()
        .from(users)
        .where(eq(users.email, email.toLowerCase()))
        .limit(1);

      if (!user || user.emailVerified) {
        // Don't reveal whether email exists
        res.json({ success: true });
        return;
      }

      // Rate limit: only allow resend every 2 minutes
      if (user.emailVerificationSentAt) {
        const minutesSinceSent = (Date.now() - new Date(user.emailVerificationSentAt).getTime()) / (1000 * 60);
        if (minutesSinceSent < 2) {
          res.status(429).json({ error: "Please wait a moment before requesting another email" });
          return;
        }
      }

      // Generate new token
      const token = crypto.randomBytes(32).toString('hex');
      await db.update(users).set({
        emailVerificationToken: token,
        emailVerificationSentAt: new Date(),
      }).where(eq(users.id, user.id));

      await sendVerificationEmail({
        to: user.email,
        name: user.name || undefined,
        token,
      });

      res.json({ success: true });
    } catch (error) {
      console.error("[Auth] Resend verification failed", error);
      res.status(500).json({ error: "Failed to resend" });
    }
  });

  // Validate invite token (check it's still valid before showing set-password form)
  app.get("/api/auth/validate-invite", async (req: Request, res: Response) => {
    const { token } = req.query;

    if (!token || typeof token !== "string") {
      res.status(400).json({ valid: false, error: "Missing token" });
      return;
    }

    try {
      const db = await getDb();
      if (!db) {
        res.status(500).json({ valid: false, error: "Server error" });
        return;
      }

      const { users } = await import("../../drizzle/schema");
      const { eq } = await import("drizzle-orm");

      const [user] = await db.select({
        id: users.id,
        email: users.email,
        emailVerified: users.emailVerified,
        emailVerificationSentAt: users.emailVerificationSentAt,
      })
        .from(users)
        .where(eq(users.emailVerificationToken, token))
        .limit(1);

      if (!user) {
        res.status(404).json({ valid: false, error: "Invalid or expired invitation link" });
        return;
      }

      // Already set their password
      if (user.emailVerified) {
        res.status(400).json({ valid: false, error: "This invitation has already been used. Please log in instead." });
        return;
      }

      // Check token age (7 days for invites)
      if (user.emailVerificationSentAt) {
        const daysSinceSent = (Date.now() - new Date(user.emailVerificationSentAt).getTime()) / (1000 * 60 * 60 * 24);
        if (daysSinceSent > 7) {
          res.status(410).json({ valid: false, error: "This invitation has expired. Ask your team admin to invite you again." });
          return;
        }
      }

      res.json({ valid: true, email: user.email });
    } catch (error) {
      console.error("[Auth] Validate invite failed", error);
      res.status(500).json({ valid: false, error: "Server error" });
    }
  });

  // Set password for invited team members
  app.post("/api/auth/set-password", async (req: Request, res: Response) => {
    const { token, password, name } = req.body;

    if (!token || !password) {
      res.status(400).json({ error: "Token and password are required" });
      return;
    }

    if (password.length < 8) {
      res.status(400).json({ error: "Password must be at least 8 characters" });
      return;
    }

    try {
      const db = await getDb();
      if (!db) {
        res.status(500).json({ error: "Server error" });
        return;
      }

      const { users } = await import("../../drizzle/schema");
      const { eq } = await import("drizzle-orm");
      const bcryptModule = await import("bcryptjs");

      // Find user by token
      const [user] = await db.select()
        .from(users)
        .where(eq(users.emailVerificationToken, token))
        .limit(1);

      if (!user) {
        res.status(404).json({ error: "Invalid or expired invitation link" });
        return;
      }

      // Already activated
      if (user.emailVerified) {
        res.status(400).json({ error: "This invitation has already been used. Please log in instead." });
        return;
      }

      // Check token age (7 days)
      if (user.emailVerificationSentAt) {
        const daysSinceSent = (Date.now() - new Date(user.emailVerificationSentAt).getTime()) / (1000 * 60 * 60 * 24);
        if (daysSinceSent > 7) {
          res.status(410).json({ error: "This invitation has expired. Ask your team admin to invite you again." });
          return;
        }
      }

      // Hash the new password and activate the account
      const passwordHash = await bcryptModule.default.hash(password, 12);
      await db.update(users).set({
        passwordHash,
        name: name?.trim() || null,
        emailVerified: true,
        emailVerificationToken: null,
        updatedAt: new Date(),
      } as any).where(eq(users.id, user.id));

      console.log(`[Auth] Invited user ${user.id} (${user.email}) set password and activated`);

      // Auto-login: create session token
      const sessionToken = await sdk.createSessionToken(user.id, user.email, { name: name?.trim() || "" });
      const cookieOptions = getSessionCookieOptions(req);
      res.cookie(COOKIE_NAME, sessionToken, { ...cookieOptions, maxAge: ONE_YEAR_MS });

      res.json({ success: true });
    } catch (error) {
      console.error("[Auth] Set password failed", error);
      res.status(500).json({ error: "Failed to set password" });
    }
  });
}
