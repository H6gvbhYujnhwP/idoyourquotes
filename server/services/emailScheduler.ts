/**
 * Email Scheduler
 * Runs every hour to send automated emails:
 * - Day 3: Check-in email
 * - Day 12: Trial expiry reminder (2 days before end)
 * 
 * Uses a JSON field on the org to track which emails have been sent,
 * preventing duplicates without needing a new table.
 * 
 * Register in server/_core/index.ts:
 *   import { startEmailScheduler } from "../services/emailScheduler";
 *   startEmailScheduler();
 */
import { getDb } from "../db";
import { sendCheckInEmail, sendTrialExpiryReminder, sendTrialEndedEmail } from "./emailService";

const ONE_HOUR = 60 * 60 * 1000;

/**
 * Check all trial orgs and send appropriate emails
 */
async function processScheduledEmails(): Promise<void> {
  console.log("[EmailScheduler] Running scheduled email check...");

  try {
    const db = await getDb();
    if (!db) return;

    const { organizations, orgMembers, users } = await import("../../drizzle/schema");
    const { eq, and, isNull, isNotNull } = await import("drizzle-orm");

    // Find all trial organizations that haven't been cancelled
    const trialOrgs = await db.select()
      .from(organizations)
      .where(
        and(
          eq(organizations.subscriptionTier as any, 'trial'),
          isNotNull(organizations.trialStartsAt as any)
        )
      );

    console.log(`[EmailScheduler] Found ${trialOrgs.length} trial orgs`);

    for (const org of trialOrgs) {
      const orgAny = org as any;
      const trialStart = orgAny.trialStartsAt ? new Date(orgAny.trialStartsAt) : null;
      if (!trialStart) continue;

      // E.21 (May 2026) — Skip orgs that registered via the E.18
      // "domain previously used → no trial" path. For those orgs,
      // createUser sets trialEndsAt equal to the registration moment
      // (= trialStartsAt), so the trial window is effectively zero
      // length. Without this guard the scheduler would fire a
      // "trial ends in 1 day" reminder 12 days after registration to
      // a user who never actually had a trial — and a generic Day 3
      // check-in encouraging them to "try uploading a tender document"
      // when they can't because they need to subscribe first. We
      // detect zero-length trials by checking trialEndsAt is on or
      // before trialStartsAt + 1 hour (the +1 hour is slack to
      // handle any minor clock skew or DB timestamp rounding).
      const trialEnd = orgAny.trialEndsAt ? new Date(orgAny.trialEndsAt) : null;
      if (trialEnd) {
        const trialWindowMs = trialEnd.getTime() - trialStart.getTime();
        const ONE_HOUR_MS = 60 * 60 * 1000;
        if (trialWindowMs <= ONE_HOUR_MS) {
          // Zero-length trial — skip both check-in and reminder.
          continue;
        }
      }

      const daysSinceStart = (Date.now() - trialStart.getTime()) / (1000 * 60 * 60 * 24);
      
      // Track sent emails in the org's metadata
      // We use aiCreditsRemaining as a bitmask (hacky but avoids schema changes)
      // Bit 1 (value 1): check-in sent
      // Bit 2 (value 2): trial reminder sent
      // Actually, let's use a cleaner approach with a JSON field
      // We'll store sent email flags in defaultDayWorkRates._emailsSent (piggyback on existing JSON)
      // Better: use a simple approach — check the org's billing email field for markers
      
      // Clean approach: use metadata stored in the org record
      // Since we can't easily add fields, we'll track via a dedicated query
      // Check if emails were already sent by looking for recent email logs
      
      // Simplest approach: store in the organization's defaultExclusions field? No, too hacky.
      // Let's just use a separate tracking mechanism via the users table's emailVerificationToken
      // as a state tracker after verification... also hacky.
      
      // Cleanest: Add a simple JSON tracking to the org. We already have json fields.
      // Use defaultDayWorkRates which is a JSON field — add _emailFlags to it
      
      const dayWorkRates = (orgAny.defaultDayWorkRates || {}) as Record<string, any>;
      const emailFlags = dayWorkRates._emailFlags || {};

      // Get the org owner's email
      const [ownerMembership] = await db.select()
        .from(orgMembers)
        .where(
          and(
            eq(orgMembers.orgId, org.id),
            eq(orgMembers.role as any, 'owner')
          )
        )
        .limit(1);

      if (!ownerMembership) continue;

      const [owner] = await db.select()
        .from(users)
        .where(eq(users.id, BigInt(ownerMembership.userId) as any))
        .limit(1);

      if (!owner) continue;

      // E.24 (May 2026) — previously this clause also skipped users
      // where !owner.emailVerified. With email verification removed as
      // a hard gate at registration, that skip is no longer correct —
      // it would suppress all trial-lifecycle emails (Day 3, Day 12,
      // Day 14) for any pre-E.24 user who never clicked their old
      // verification link, AND for any team-invited owner whose
      // verification flag is in the team-invite "pending" state. The
      // owner check above already filters out missing owner records,
      // which is the only filter we actually need at this layer.

      let flagsChanged = false;

      // Day 3 check-in (send between day 3 and day 5)
      if (daysSinceStart >= 3 && daysSinceStart < 5 && !emailFlags.checkInSent) {
        console.log(`[EmailScheduler] Sending check-in to ${owner.email} (day ${Math.floor(daysSinceStart)})`);
        const sent = await sendCheckInEmail({
          to: owner.email,
          name: owner.name || undefined,
        });
        if (sent) {
          emailFlags.checkInSent = new Date().toISOString();
          flagsChanged = true;
        }
      }

      // Day 12 trial reminder (send between day 12 and day 13)
      if (daysSinceStart >= 12 && daysSinceStart < 13 && !emailFlags.trialReminderSent) {
        const trialEndForReminder = orgAny.trialEndsAt ? new Date(orgAny.trialEndsAt) : null;
        const daysLeft = trialEndForReminder ? Math.ceil((trialEndForReminder.getTime() - Date.now()) / (1000 * 60 * 60 * 24)) : 2;

        console.log(`[EmailScheduler] Sending trial reminder to ${owner.email} (${daysLeft} days left)`);
        const sent = await sendTrialExpiryReminder({
          to: owner.email,
          name: owner.name || undefined,
          daysLeft: Math.max(1, daysLeft),
        });
        if (sent) {
          emailFlags.trialReminderSent = new Date().toISOString();
          flagsChanged = true;
        }
      }

      // E.22 (May 2026) — Day 14 trial-ended email.
      //
      // Fires once the trial window has actually elapsed. We trigger off
      // trialEndsAt rather than daysSinceStart so the email tracks the
      // real end timestamp (which the E.18 trial-fix now sets correctly
      // for first-time signups). The 48-hour window after expiry gives
      // the hourly scheduler two cycles of opportunity to fire — single
      // missed tick during a deploy or Resend hiccup won't drop the
      // email entirely. Deduped via emailFlags.trialEndedSent.
      //
      // Skipped for zero-length-trial orgs by the guard at the top of
      // this loop (orgs created via the E.18 "domain previously used"
      // path already `continue` before reaching here).
      if (trialEnd && !emailFlags.trialEndedSent) {
        const msSinceEnd = Date.now() - trialEnd.getTime();
        const FORTY_EIGHT_HOURS_MS = 48 * 60 * 60 * 1000;
        if (msSinceEnd >= 0 && msSinceEnd <= FORTY_EIGHT_HOURS_MS) {
          console.log(`[EmailScheduler] Sending trial-ended email to ${owner.email}`);
          const sent = await sendTrialEndedEmail({
            to: owner.email,
            name: owner.name || undefined,
          });
          if (sent) {
            emailFlags.trialEndedSent = new Date().toISOString();
            flagsChanged = true;
          }
        }
      }

      // Save flags back to org
      if (flagsChanged) {
        const updatedRates = { ...dayWorkRates, _emailFlags: emailFlags };
        await db.update(organizations)
          .set({ defaultDayWorkRates: updatedRates as any, updatedAt: new Date() })
          .where(eq(organizations.id, org.id));
      }
    }

    console.log("[EmailScheduler] Completed");
  } catch (err) {
    console.error("[EmailScheduler] Error:", err);
  }
}

/**
 * Start the email scheduler — call once on server startup
 */
export function startEmailScheduler(): void {
  // Run first check after 30 seconds (let server finish starting)
  setTimeout(() => {
    processScheduledEmails();
  }, 30 * 1000);

  // Then run every hour
  setInterval(() => {
    processScheduledEmails();
  }, ONE_HOUR);

  console.log("[EmailScheduler] Started — checking every hour");
}
