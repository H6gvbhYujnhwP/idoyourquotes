/**
 * Stripe Webhook Route
 * Register this in server/_core/index.ts
 * 
 * Add to index.ts:
 *   import { registerStripeWebhook } from "../services/stripeWebhook";
 *   registerStripeWebhook(app);
 * 
 * IMPORTANT: This must be registered BEFORE the JSON body parser
 * because Stripe needs the raw body for signature verification.
 */
import type { Express, Request, Response } from "express";
import { stripe, handleStripeWebhook } from "../services/stripe";

export function registerStripeWebhook(app: Express) {
  app.post(
    "/api/stripe/webhook",
    // Use raw body for Stripe signature verification
    (req: Request, res: Response) => {
      const sig = req.headers["stripe-signature"] as string;
      const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

      if (!webhookSecret) {
        console.error("[Stripe Webhook] STRIPE_WEBHOOK_SECRET not configured");
        res.status(500).json({ error: "Webhook not configured" });
        return;
      }

      let event;
      try {
        // req.body should be a Buffer when using express.raw()
        // We need the raw body middleware registered for this route
        const rawBody = (req as any).rawBody || req.body;
        event = stripe.webhooks.constructEvent(rawBody, sig, webhookSecret);
      } catch (err: any) {
        console.error("[Stripe Webhook] Signature verification failed:", err.message);
        res.status(400).json({ error: `Webhook signature failed: ${err.message}` });
        return;
      }

      // Process the event asynchronously
      handleStripeWebhook(event)
        .then(() => {
          res.json({ received: true });
        })
        .catch((err) => {
          console.error("[Stripe Webhook] Processing error:", err);
          res.status(500).json({ error: "Webhook processing failed" });
        });
    }
  );
}
