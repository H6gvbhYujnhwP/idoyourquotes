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
import { sendCheckInEmail, sendTrialExpiryReminder } from "./emailService";

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

      if (!owner || !owner.emailVerified) continue;

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
        const trialEnd = orgAny.trialEndsAt ? new Date(orgAny.trialEndsAt) : null;
        const daysLeft = trialEnd ? Math.ceil((trialEnd.getTime() - Date.now()) / (1000 * 60 * 60 * 24)) : 2;

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
