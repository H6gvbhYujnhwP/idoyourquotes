// ── Admin bridge ─────────────────────────────────────────────────────────────
//
// Lets a trusted first-party companion app embed this app's admin panel in an
// iframe without a second login. The companion's BACKEND signs a short-lived
// HMAC ticket with a shared secret; this endpoint verifies it, mints a real
// session cookie for a dedicated bridge admin user, and redirects to the admin
// panel.
//
// HISTORY (Delivery 2.9, 14 Sep 2026)
//   This code used to live inline in _core/index.ts and was wired to one
//   specific companion app, whose name and domain were baked into the comments
//   and whose settings were named after it. The owner asked for that bridge to
//   be removed outright while keeping the mechanism available for a different
//   companion app later. So: the handler moved here, the naming is generic, and
//   the route is only registered when BOTH settings below are present. With the
//   settings absent — which is the state after this delivery — the route does
//   not exist at all, and the secret the old companion app holds is worthless.
//
// TO BRING A BRIDGE BACK
//   1. Generate a fresh secret (never reuse a retired one):
//        node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
//   2. Create a dedicated admin user in this app for the bridge to log in as —
//      its own email address, role='admin', is_active=true. Never point the
//      bridge at a human's account.
//   3. Set both environment variables (below) on Render and redeploy.
//   4. Give the same secret to the companion app's BACKEND only. A secret that
//      reaches browser code is a permanent admin key for anyone who views
//      source.
//
// ENVIRONMENT VARIABLES (both required — either missing = no route)
//   ADMIN_BRIDGE_SECRET       long random hex, shared with the companion app's
//                             backend
//   ADMIN_BRIDGE_ADMIN_EMAIL  email of the dedicated bridge admin user in this
//                             app's `users` table
//
// TICKET FORMAT
//   <expiry-unix-seconds>.<nonce>.<HMAC-SHA256-hex>
//   HMAC is computed over "<expiry>.<nonce>" using the shared secret.
//   The companion app should mint tickets with a short life (60s is plenty) —
//   a ticket is a bearer admin credential for as long as it is valid.
//
// POSITION
//   Register AFTER the body parsers and BEFORE serveStatic, or the SPA static
//   handler intercepts the route in production.

import type { Express } from "express";
import crypto from "crypto";
import { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";
import { sdk } from "./sdk";
import { getSessionCookieOptions } from "./cookies";

/** Where a verified bridge ticket lands. */
const ADMIN_PANEL_PATH = "/manage-7k9x2m4q8r";

export function registerAdminBridge(app: Express): void {
  const secret = process.env.ADMIN_BRIDGE_SECRET;
  const bridgeEmail = process.env.ADMIN_BRIDGE_ADMIN_EMAIL;

  // Not configured: register nothing. Deliberately different from the previous
  // behaviour, which always mounted the route and answered 500 when unset —
  // that advertised the bridge's existence and left a live endpoint to probe.
  if (!secret || !bridgeEmail) {
    return;
  }

  console.log("[admin-bridge] enabled");

  app.get("/admin-bridge", async (req, res) => {
    try {
      const ticket = String((req.query as any).ticket || "").trim();
      if (!ticket) {
        res.status(400).send("Missing ticket");
        return;
      }

      const parts = ticket.split(".");
      if (parts.length !== 3) {
        console.warn("[admin-bridge] Malformed ticket");
        res.status(400).send("Malformed ticket");
        return;
      }
      const [expiryStr, nonce, signature] = parts;

      // Constant-time comparison to avoid timing leaks.
      const expectedSig = crypto
        .createHmac("sha256", secret)
        .update(`${expiryStr}.${nonce}`)
        .digest("hex");
      const sigBuf = Buffer.from(signature, "hex");
      const expBuf = Buffer.from(expectedSig, "hex");
      if (
        sigBuf.length !== expBuf.length ||
        !crypto.timingSafeEqual(sigBuf, expBuf)
      ) {
        console.warn("[admin-bridge] Invalid signature");
        res.status(403).send("Invalid ticket");
        return;
      }

      const expiry = parseInt(expiryStr, 10);
      if (!Number.isFinite(expiry) || expiry < Math.floor(Date.now() / 1000)) {
        console.warn("[admin-bridge] Expired ticket");
        res
          .status(403)
          .send("Expired ticket — reload the embed to mint a fresh one");
        return;
      }

      // Look up the bridge admin user. Lazy-import the db helper to mirror the
      // file-proxy pattern and avoid pulling drizzle into module init.
      const { getUserByEmail } = await import("../db");
      const user = await getUserByEmail(bridgeEmail);
      if (!user || (user as any).role !== "admin" || !(user as any).isActive) {
        console.warn(
          `[admin-bridge] Bridge user ${bridgeEmail} not found, not admin, or inactive`,
        );
        res.status(403).send("Bridge user invalid");
        return;
      }

      // Mint a real session cookie for the bridge user. Same path as a normal
      // login — no separate session type, so the existing adminProcedure
      // middleware accepts it without changes.
      const token = await sdk.createSessionToken(Number(user.id), user.email, {
        name: user.name || "",
      });
      const cookieOpts = getSessionCookieOptions(req as any);
      res.cookie(COOKIE_NAME, token, { ...cookieOpts, maxAge: ONE_YEAR_MS });

      res.redirect(ADMIN_PANEL_PATH);
    } catch (err: any) {
      console.error("[admin-bridge] error:", err?.message || err);
      if (!res.headersSent) {
        res.status(500).send("Bridge error");
      }
    }
  });
}
