// ── WorkTrackr bridge ────────────────────────────────────────────────────────
// Read-only, server-to-server endpoints that let WorkTrackr PULL a single IDYQ
// org's catalogue and quotes. Mirrors the Studio admin-bridge verification style
// (constant-time HMAC + expiry), but binds the signature to the HTTP method and
// path and reads it from the X-WT-Signature header.
//
// WorkTrackr signs:  payload = "<expiry>.<nonce>.<METHOD>.<PATH>"
//                    hmac    = HMAC_SHA256(payload, WORKTRACKR_BRIDGE_SECRET) hex
//                    header  = X-WT-Signature: <expiry>.<nonce>.<hmac>
// PATH is the request path WITHOUT the query string (matches WorkTrackr's signer).
//
// SCOPING (per org): WorkTrackr sends an `X-WT-Org` header naming WHICH IDYQ org
// to read — either the org slug or its numeric id. Each WorkTrackr org sets this
// at connect time, so different WorkTrackr orgs read different IDYQ orgs. No
// server-wide email setting is needed.
//
// Env vars (Render → idoyourquotes service):
//   WORKTRACKR_BRIDGE_SECRET — long random hex; MUST match WorkTrackr's value;
//                              separate from STUDIO_BRIDGE_SECRET.
//
// Endpoints:
//   GET /api/external/catalogue?since=&page=     (header: X-WT-Org)
//   GET /api/external/quotes?since=&status=&page= (header: X-WT-Org)
//   GET /api/external/quotes/:id                  (header: X-WT-Org)
//
// SECURITY NOTE: any caller holding WORKTRACKR_BRIDGE_SECRET may request any org
// via X-WT-Org. That's fine while WorkTrackr's backend is the only secret-holder.
// Before onboarding third-party customers, add an allow-list of permitted org
// refs here so one tenant can't read another's data.
//
// Position: register AFTER body parsers and BEFORE serveStatic (same as the
// Studio bridge), so the SPA handler doesn't intercept these routes.

import type { Express, Request, Response } from "express";
import crypto from "crypto";
import {
  getOrganizationById,
  getOrganizationBySlug,
  getQuotesByOrgId,
  getQuoteByIdAndOrg,
  getCatalogItemsByOrgId,
  getLineItemsByQuoteId,
} from "../db";
import type { CatalogItem, Quote, QuoteLineItem } from "../../drizzle/schema";

const DEFAULT_PAGE_SIZE = 100;
const MAX_PAGE_SIZE = 500;
// Accept tickets valid for up to ~120s ahead (WorkTrackr default expiry is 90s),
// plus a little clock skew. Bounds the replay window.
const MAX_FUTURE_SECONDS = 130;

const CURRENCY = "GBP"; // IDYQ stores no per-row currency; this is a UK (VAT) app.

type SigResult = { ok: true } | { ok: false; reason: string };

function verifyWtSignature(req: Request, secret: string): SigResult {
  const header = String(req.header("x-wt-signature") || "").trim();
  if (!header) return { ok: false, reason: "missing signature" };

  const parts = header.split(".");
  if (parts.length !== 3) return { ok: false, reason: "malformed" };
  const [expiryStr, nonce, signature] = parts;

  const method = req.method.toUpperCase();
  const path = req.path; // full path without query string — matches WorkTrackr
  const payload = `${expiryStr}.${nonce}.${method}.${path}`;
  const expected = crypto.createHmac("sha256", secret).update(payload).digest("hex");

  let sigBuf: Buffer;
  let expBuf: Buffer;
  try {
    sigBuf = Buffer.from(signature, "hex");
    expBuf = Buffer.from(expected, "hex");
  } catch {
    return { ok: false, reason: "bad signature encoding" };
  }
  if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
    return { ok: false, reason: "invalid signature" };
  }

  const expiry = parseInt(expiryStr, 10);
  const now = Math.floor(Date.now() / 1000);
  if (!Number.isFinite(expiry) || expiry < now) return { ok: false, reason: "expired" };
  if (expiry > now + MAX_FUTURE_SECONDS) return { ok: false, reason: "expiry too far in future" };

  return { ok: true };
}

// Reject the request if the signature is bad. Returns true if the caller may proceed.
function authed(req: Request, res: Response): boolean {
  const secret = process.env.WORKTRACKR_BRIDGE_SECRET;
  if (!secret) {
    console.warn("[wt-bridge] WORKTRACKR_BRIDGE_SECRET not configured");
    res.status(500).json({ error: "Bridge not configured on this server" });
    return false;
  }
  const result = verifyWtSignature(req, secret);
  if (!result.ok) {
    console.warn(`[wt-bridge] rejected: ${result.reason}`);
    res.status(403).json({ error: "Invalid signature", reason: result.reason });
    return false;
  }
  return true;
}

// Resolve which IDYQ org to serve from the X-WT-Org header (slug or numeric id).
async function resolveOrg(req: Request): Promise<{ orgId: number } | null> {
  const ref = String(req.header("x-wt-org") || "").trim();
  if (!ref) return null;
  const org = /^\d+$/.test(ref)
    ? await getOrganizationById(Number(ref))
    : await getOrganizationBySlug(ref);
  return org ? { orgId: Number(org.id) } : null;
}

// ── mappers (DB row -> the shape WorkTrackr expects) ─────────────────────────

function iso(d: Date | string | null | undefined): string | null {
  if (!d) return null;
  const dt = d instanceof Date ? d : new Date(d);
  return Number.isNaN(dt.getTime()) ? null : dt.toISOString();
}
function num(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isNaN(n) ? null : n;
}

function mapProduct(c: CatalogItem) {
  return {
    id: c.id,
    sku: null, // IDYQ catalogue items have no SKU column
    name: c.name,
    description: c.description ?? null,
    unit_price: num(c.defaultRate),
    currency: CURRENCY,
    category: c.category ?? null,
    active: Number((c as any).isActive ?? 1) !== 0,
    updated_at: iso(c.updatedAt),
  };
}

function mapLine(l: QuoteLineItem) {
  return {
    product_id: null, // IDYQ line items aren't linked to catalogue items
    sku: null,
    description: l.description ?? (l as any).itemName ?? null,
    qty: num(l.quantity),
    unit_price: num(l.rate),
    line_total: num(l.total),
  };
}

function mapQuote(q: Quote, lines: QuoteLineItem[]) {
  return {
    id: q.id,
    quote_number: q.reference ?? null,
    status: q.status,
    currency: CURRENCY,
    total: num(q.total),
    // IDYQ stores a single flat client name (no separate company field). It's
    // mapped to both name and company; if you add a client-company column later,
    // point `company` at it.
    customer: {
      name: q.clientName ?? null,
      email: q.clientEmail ?? null,
      company: q.clientName ?? null,
    },
    line_items: lines.map(mapLine),
    created_at: iso(q.createdAt),
    updated_at: iso(q.updatedAt),
  };
}

// ── helpers ──────────────────────────────────────────────────────────────────

function parseSince(raw: unknown): number | null {
  if (!raw) return null;
  const t = new Date(String(raw)).getTime();
  return Number.isNaN(t) ? null : t;
}
function pageParams(req: Request): { page: number; pageSize: number } {
  const page = Math.max(1, parseInt(String(req.query.page || "1"), 10) || 1);
  let pageSize = parseInt(String(req.query.page_size || DEFAULT_PAGE_SIZE), 10) || DEFAULT_PAGE_SIZE;
  pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, pageSize));
  return { page, pageSize };
}
function paginate<T>(items: T[], page: number, pageSize: number) {
  const total = items.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const start = (page - 1) * pageSize;
  return {
    slice: items.slice(start, start + pageSize),
    meta: { page, page_size: pageSize, total, total_pages: totalPages, has_more: page < totalPages },
  };
}

function badOrg(res: Response): void {
  res.status(400).json({ error: "Missing or unknown X-WT-Org (IDYQ org slug or id)" });
}

export function registerWorktrackrBridge(app: Express): void {
  // GET /api/external/catalogue?since=&page=
  app.get("/api/external/catalogue", async (req, res) => {
    if (!authed(req, res)) return;
    try {
      const org = await resolveOrg(req);
      if (!org) {
        badOrg(res);
        return;
      }

      let items: CatalogItem[] = await getCatalogItemsByOrgId(org.orgId);

      const sinceTs = parseSince(req.query.since);
      if (sinceTs !== null) {
        items = items.filter((c) => {
          const u = c.updatedAt ? new Date(c.updatedAt).getTime() : 0;
          return u >= sinceTs;
        });
      }
      items.sort((a, b) => Number(a.id) - Number(b.id));

      const { page, pageSize } = pageParams(req);
      const { slice, meta } = paginate(items, page, pageSize);
      res.json({ products: slice.map(mapProduct), ...meta });
    } catch (err: any) {
      console.error("[wt-bridge] catalogue error:", err?.message || err);
      res.status(500).json({ error: "Failed to load catalogue" });
    }
  });

  // GET /api/external/quotes?since=&status=&page=
  app.get("/api/external/quotes", async (req, res) => {
    if (!authed(req, res)) return;
    try {
      const org = await resolveOrg(req);
      if (!org) {
        badOrg(res);
        return;
      }

      let quoteRows: Quote[] = await getQuotesByOrgId(org.orgId);

      const statusFilter = req.query.status ? String(req.query.status) : null;
      if (statusFilter) quoteRows = quoteRows.filter((q) => q.status === statusFilter);

      const sinceTs = parseSince(req.query.since);
      if (sinceTs !== null) {
        quoteRows = quoteRows.filter((q) => {
          const u = q.updatedAt ? new Date(q.updatedAt).getTime() : 0;
          return u >= sinceTs;
        });
      }
      quoteRows.sort((a, b) => {
        const ua = a.updatedAt ? new Date(a.updatedAt).getTime() : 0;
        const ub = b.updatedAt ? new Date(b.updatedAt).getTime() : 0;
        return ub - ua;
      });

      const { page, pageSize } = pageParams(req);
      const { slice, meta } = paginate(quoteRows, page, pageSize);
      const full = await Promise.all(
        slice.map(async (q) => mapQuote(q, await getLineItemsByQuoteId(Number(q.id))))
      );
      res.json({ quotes: full, ...meta });
    } catch (err: any) {
      console.error("[wt-bridge] quotes error:", err?.message || err);
      res.status(500).json({ error: "Failed to load quotes" });
    }
  });

  // GET /api/external/quotes/:id
  app.get("/api/external/quotes/:id", async (req, res) => {
    if (!authed(req, res)) return;
    try {
      const org = await resolveOrg(req);
      if (!org) {
        badOrg(res);
        return;
      }

      const quoteId = parseInt(req.params.id, 10);
      if (!Number.isFinite(quoteId)) {
        res.status(400).json({ error: "Bad quote id" });
        return;
      }

      const quote = await getQuoteByIdAndOrg(quoteId, org.orgId);
      if (!quote) {
        res.status(404).json({ error: "Quote not found" });
        return;
      }

      const lines = await getLineItemsByQuoteId(quoteId);
      res.json({ quote: mapQuote(quote, lines) });
    } catch (err: any) {
      console.error("[wt-bridge] quote error:", err?.message || err);
      res.status(500).json({ error: "Failed to load quote" });
    }
  });
}
