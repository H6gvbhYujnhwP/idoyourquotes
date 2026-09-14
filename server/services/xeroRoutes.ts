/**
 * Xero OAuth routes.
 *
 * Delivery 2.11. Two browser endpoints, both under /api/xero:
 *
 *   GET /api/xero/connect   signed in; sends the user to Xero to approve
 *   GET /api/xero/callback  where Xero sends them back
 *
 * These are Express routes rather than tRPC procedures because both are
 * full-page redirects in the browser's address bar, not JSON calls.
 *
 * WHY STATE MATTERS: the callback is a public URL that anyone can hit.
 * Without a verified state parameter, an attacker could hand a signed-in
 * user a crafted callback link and attach THEIR Xero organisation to the
 * user's IDYQ account — every quote that org pushed would then flow into
 * the attacker's books. State is HMAC-signed with the org and user it
 * was issued for and expires in ten minutes; anything that doesn't
 * verify is refused outright.
 *
 * Position: register AFTER the body parsers and BEFORE serveStatic, or
 * the SPA handler swallows the routes in production.
 */
import type { Express, Request, Response } from "express";
import { sdk } from "../_core/sdk";
import { getUserPrimaryOrg, upsertXeroConnection } from "../db";
import { encryptToken, signState, verifyState } from "./xeroTokens";
import {
  getXeroConfig,
  buildAuthorizeUrl,
  exchangeCodeForTokens,
  fetchTenants,
  fetchSalesTaxRates,
  pickSalesTaxType,
} from "./xeroClient";
import { resolveOrgVatRate } from "./vatRate";

/** Where the user lands afterwards, with an outcome to display. */
function settingsRedirect(res: Response, outcome: string): void {
  res.redirect(`/settings?tab=xero&xero=${encodeURIComponent(outcome)}`);
}

export function registerXeroRoutes(app: Express): void {
  app.get("/api/xero/connect", async (req: Request, res: Response) => {
    try {
      const cfg = getXeroConfig();
      if (!cfg) {
        settingsRedirect(res, "not-configured");
        return;
      }

      let user: any = null;
      try {
        user = await sdk.authenticateRequest(req as any);
      } catch {
        // fall through
      }
      if (!user) {
        res.redirect("/login");
        return;
      }

      const org = await getUserPrimaryOrg(Number(user.id));
      if (!org) {
        settingsRedirect(res, "no-org");
        return;
      }

      const state = signState({ orgId: org.id, userId: Number(user.id) });
      res.redirect(buildAuthorizeUrl(cfg, state));
    } catch (err: any) {
      console.error("[xero/connect]", err?.message || err);
      settingsRedirect(res, "error");
    }
  });

  app.get("/api/xero/callback", async (req: Request, res: Response) => {
    try {
      const cfg = getXeroConfig();
      if (!cfg) {
        settingsRedirect(res, "not-configured");
        return;
      }

      const q = req.query as any;

      // The user pressed Cancel on Xero's consent screen, or Xero
      // refused. Not an error worth alarming anyone about.
      if (q.error) {
        console.warn("[xero/callback] returned error:", String(q.error));
        settingsRedirect(res, "cancelled");
        return;
      }

      const code = String(q.code || "").trim();
      const state = String(q.state || "").trim();
      if (!code || !state) {
        settingsRedirect(res, "bad-callback");
        return;
      }

      const verified = verifyState(state);
      if (!verified) {
        console.warn("[xero/callback] state failed verification");
        settingsRedirect(res, "bad-state");
        return;
      }

      const tokens = await exchangeCodeForTokens(cfg, code);

      const tenants = await fetchTenants(tokens.access_token);
      if (tenants.length === 0) {
        settingsRedirect(res, "no-tenant");
        return;
      }
      // One Xero organisation per IDYQ organisation — see fetchTenants.
      const tenant = tenants[0];

      // Read the tenant's sales tax rates now rather than at push time,
      // so a missing 20% rate surfaces while the user is looking at the
      // Settings page instead of halfway through their first invoice.
      let taxRates: Array<{
        taxType: string;
        name: string;
        effectiveRate: number;
      }> = [];
      let salesTaxType: string | null = null;
      try {
        taxRates = await fetchSalesTaxRates(
          tokens.access_token,
          tenant.tenantId,
        );
        const org = await getUserPrimaryOrg(verified.userId);
        const orgVatRate = resolveOrgVatRate(org as any);
        salesTaxType = pickSalesTaxType(taxRates, orgVatRate);
      } catch (err: any) {
        // A tax-rate read failure must not lose a good connection. The
        // Settings page shows the gap and offers a re-check.
        console.error("[xero/callback] tax rate read:", err?.message || err);
      }

      await upsertXeroConnection({
        orgId: verified.orgId,
        tenantId: tenant.tenantId,
        tenantName: tenant.tenantName,
        accessToken: encryptToken(tokens.access_token),
        refreshToken: encryptToken(tokens.refresh_token),
        expiresAt: new Date(Date.now() + (tokens.expires_in ?? 1800) * 1000),
        scopes: tokens.scope ?? null,
        salesTaxType,
        taxRates,
        connectedByUserId: verified.userId,
        connectedAt: new Date(),
      });

      settingsRedirect(res, "connected");
    } catch (err: any) {
      console.error("[xero/callback]", err?.message || err);
      settingsRedirect(res, "error");
    }
  });
}
