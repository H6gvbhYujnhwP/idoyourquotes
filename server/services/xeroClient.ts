/**
 * Xero client — connection layer only.
 *
 * Delivery 2.11. Everything needed to hold a working connection to a
 * Xero organisation and nothing that writes to one. The invoice work
 * builds on getValidAccessToken() and xeroFetch().
 *
 * CONFIGURATION (Render → idoyourquotes service):
 *   XERO_CLIENT_ID      from the app's Configuration page
 *   XERO_CLIENT_SECRET  generated there; shown once
 *   XERO_REDIRECT_URI   https://idoyourquotes.com/api/xero/callback
 *
 * The redirect URI is a setting rather than a constant so a staging
 * deploy can point elsewhere without a code change. Xero compares it
 * character for character against the app's registered URI, so a
 * trailing slash or an http:// will fail the handshake with an
 * unhelpful message.
 *
 * SCOPES — the narrowest set that does the job. The IDYQ app was
 * created after 2 March 2026, so it has access ONLY to Xero's granular
 * scopes; the broad accounting.transactions that older guides mention
 * does not exist for us. Repeating invoices live under
 * accounting.invoices.
 *
 *   offline_access            keep the connection alive past the first
 *                             30 minutes without re-consent
 *   accounting.settings.read  read-only; tax rates and org details
 *   accounting.contacts       find and create the customer
 *   accounting.invoices       invoices and repeating invoices
 *
 * Deliberately NOT requested: payments, bank transactions, payroll,
 * reports, files, projects, journals.
 *
 * TOKEN LIFETIMES: access tokens last 30 minutes. Refresh tokens last
 * 60 days and ROTATE — every refresh returns a new one and invalidates
 * the old. The new pair must be persisted immediately or the connection
 * is dead, which is why refreshAccessToken writes before it returns.
 */
import {
  encryptToken,
  decryptToken,
} from "./xeroTokens";
import {
  getXeroConnectionByOrgId,
  upsertXeroConnection,
  deleteXeroConnectionByOrgId,
} from "../db";

export const XERO_SCOPES = [
  "offline_access",
  "accounting.settings.read",
  "accounting.contacts",
  "accounting.invoices",
].join(" ");

const AUTHORIZE_URL = "https://login.xero.com/identity/connect/authorize";
const TOKEN_URL = "https://identity.xero.com/connect/token";
const CONNECTIONS_URL = "https://api.xero.com/connections";
const API_BASE = "https://api.xero.com/api.xro/2.0";

/** Refresh this far before expiry rather than waiting for a 401. */
const REFRESH_SKEW_MS = 60_000;

export interface XeroConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}

/**
 * Null when the app hasn't been configured. Every caller treats that as
 * "Xero isn't set up on this server" and shows the user something
 * sensible rather than throwing.
 */
export function getXeroConfig(): XeroConfig | null {
  const clientId = process.env.XERO_CLIENT_ID?.trim();
  const clientSecret = process.env.XERO_CLIENT_SECRET?.trim();
  const redirectUri = process.env.XERO_REDIRECT_URI?.trim();
  if (!clientId || !clientSecret || !redirectUri) return null;
  return { clientId, clientSecret, redirectUri };
}

export function isXeroConfigured(): boolean {
  return getXeroConfig() !== null;
}

export function buildAuthorizeUrl(cfg: XeroConfig, state: string): string {
  const params = new URLSearchParams({
    response_type: "code",
    client_id: cfg.clientId,
    redirect_uri: cfg.redirectUri,
    scope: XERO_SCOPES,
    state,
  });
  return `${AUTHORIZE_URL}?${params.toString()}`;
}

function basicAuth(cfg: XeroConfig): string {
  return (
    "Basic " +
    Buffer.from(`${cfg.clientId}:${cfg.clientSecret}`).toString("base64")
  );
}

interface TokenResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  scope?: string;
}

export async function exchangeCodeForTokens(
  cfg: XeroConfig,
  code: string,
): Promise<TokenResponse> {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: {
      Authorization: basicAuth(cfg),
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: cfg.redirectUri,
    }).toString(),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Xero token exchange failed (${res.status}): ${text}`);
  }
  return (await res.json()) as TokenResponse;
}

async function refreshTokens(
  cfg: XeroConfig,
  refreshToken: string,
): Promise<TokenResponse> {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: {
      Authorization: basicAuth(cfg),
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    }).toString(),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Xero token refresh failed (${res.status}): ${text}`);
  }
  return (await res.json()) as TokenResponse;
}

export interface XeroTenant {
  tenantId: string;
  tenantName: string;
}

/**
 * Which Xero organisations this token can reach. A user may tick more
 * than one on the consent screen; we take the first, because the
 * product's model is one Xero organisation per IDYQ organisation and
 * offering a picker for a case that shouldn't happen adds a screen
 * nobody needs. If Sweetbyte ever needs two, this is where it changes.
 */
export async function fetchTenants(accessToken: string): Promise<XeroTenant[]> {
  const res = await fetch(CONNECTIONS_URL, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Xero connections lookup failed (${res.status}): ${text}`);
  }
  const rows = (await res.json()) as Array<{
    tenantId: string;
    tenantName: string;
    tenantType?: string;
  }>;
  return (rows ?? [])
    .filter((r) => !r.tenantType || r.tenantType === "ORGANISATION")
    .map((r) => ({ tenantId: r.tenantId, tenantName: r.tenantName }));
}

export interface XeroTaxRate {
  taxType: string;
  name: string;
  effectiveRate: number;
}

/**
 * The tenant's active SALES tax rates.
 *
 * Read rather than assumed. The UK standard rate is normally OUTPUT2,
 * but the code is a property of the organisation's own tax rates, and a
 * rate is only valid on the side of the ledger it belongs to — a 20%
 * expense rate on a sales line is rejected by Xero. Filtering to output
 * rates here means the invoice work can never pick an expense code.
 */
export async function fetchSalesTaxRates(
  accessToken: string,
  tenantId: string,
): Promise<XeroTaxRate[]> {
  const res = await fetch(`${API_BASE}/TaxRates`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Xero-Tenant-Id": tenantId,
      Accept: "application/json",
    },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Xero tax rate lookup failed (${res.status}): ${text}`);
  }
  const body = (await res.json()) as {
    TaxRates?: Array<{
      Name?: string;
      TaxType?: string;
      Status?: string;
      ReportTaxType?: string;
      EffectiveRate?: number;
      CanApplyToRevenue?: boolean;
    }>;
  };
  return (body.TaxRates ?? [])
    .filter(
      (r) =>
        (r.Status ?? "ACTIVE") === "ACTIVE" &&
        !!r.TaxType &&
        (r.CanApplyToRevenue === true || r.ReportTaxType === "OUTPUT"),
    )
    .map((r) => ({
      taxType: String(r.TaxType),
      name: String(r.Name ?? r.TaxType),
      effectiveRate: Number(r.EffectiveRate ?? 0),
    }));
}

/**
 * The tenant's code for the organisation's VAT rate.
 *
 * Matched on the rate itself, not on the name — "20% (VAT on Income)"
 * is the usual label but names are editable in Xero and a match on text
 * would break silently. Returns null when the tenant has no output rate
 * at that percentage, which is a legitimate answer for an organisation
 * that isn't VAT registered.
 */
export function pickSalesTaxType(
  rates: XeroTaxRate[],
  ratePercent: number,
): string | null {
  if (!Number.isFinite(ratePercent) || ratePercent <= 0) return null;
  const match = rates.find(
    (r) => Math.abs(r.effectiveRate - ratePercent) < 0.001,
  );
  return match ? match.taxType : null;
}

/**
 * A usable access token for this org, refreshing first if it is within
 * a minute of expiry. Returns null when the org isn't connected, the
 * stored tokens can't be decrypted (JWT_SECRET rotated), or the refresh
 * is rejected — all of which mean the same thing to a caller: ask the
 * user to reconnect.
 *
 * On a rejected refresh the connection row is DELETED. Xero refresh
 * tokens rotate and expire after 60 days of disuse; keeping a dead row
 * would leave Settings claiming a connection that cannot work.
 */
export async function getValidAccessToken(
  orgId: number,
): Promise<{ accessToken: string; tenantId: string } | null> {
  const cfg = getXeroConfig();
  if (!cfg) return null;

  const conn = await getXeroConnectionByOrgId(orgId);
  if (!conn) return null;

  const access = decryptToken(conn.accessToken);
  const refresh = decryptToken(conn.refreshToken);
  if (!access || !refresh) return null;

  const expiresAt = new Date(conn.expiresAt).getTime();
  if (Number.isFinite(expiresAt) && expiresAt - REFRESH_SKEW_MS > Date.now()) {
    return { accessToken: access, tenantId: conn.tenantId };
  }

  try {
    const fresh = await refreshTokens(cfg, refresh);
    await upsertXeroConnection({
      orgId,
      tenantId: conn.tenantId,
      tenantName: conn.tenantName ?? null,
      accessToken: encryptToken(fresh.access_token),
      refreshToken: encryptToken(fresh.refresh_token),
      expiresAt: new Date(Date.now() + (fresh.expires_in ?? 1800) * 1000),
      scopes: fresh.scope ?? conn.scopes ?? null,
      salesTaxType: conn.salesTaxType ?? null,
      taxRates: conn.taxRates ?? null,
      connectedByUserId: conn.connectedByUserId ?? null,
    });
    return { accessToken: fresh.access_token, tenantId: conn.tenantId };
  } catch (err: any) {
    console.error(
      `[xero] refresh failed for org ${orgId}, dropping connection:`,
      err?.message || err,
    );
    await deleteXeroConnectionByOrgId(orgId).catch(() => {});
    return null;
  }
}

/**
 * Authenticated call against the Xero Accounting API for an org.
 * Unused by this delivery beyond the tax-rate re-read — it exists so
 * the invoice work has one place that handles auth, the tenant header
 * and error shape.
 */
export async function xeroFetch(
  orgId: number,
  path: string,
  init?: RequestInit,
): Promise<Response> {
  const token = await getValidAccessToken(orgId);
  if (!token) throw new Error("Xero is not connected for this organisation");
  return fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      ...(init?.headers ?? {}),
      Authorization: `Bearer ${token.accessToken}`,
      "Xero-Tenant-Id": token.tenantId,
      Accept: "application/json",
    },
  });
}

// ─── Contacts, accounts and documents (delivery 2.12) ────────────────

export interface XeroContactSummary {
  contactId: string;
  name: string;
  email?: string | null;
  isArchived?: boolean;
}

function mapContact(c: any): XeroContactSummary {
  return {
    contactId: String(c.ContactID),
    name: String(c.Name ?? ""),
    email: c.EmailAddress ?? null,
    isArchived: c.ContactStatus === "ARCHIVED",
  };
}

/**
 * Search the tenant's contacts by name.
 *
 * Xero's searchTerm does a partial match across name and contact person,
 * which is what we want: "Sorrells" should find "Sorrells Custom Wine
 * Cellars Ltd" so the user can reuse it rather than creating a near
 * duplicate. Archived contacts are returned but flagged — reusing one
 * silently would be worse than showing it.
 */
export async function searchContacts(
  orgId: number,
  term: string,
): Promise<XeroContactSummary[]> {
  const q = encodeURIComponent(term.trim());
  if (!q) return [];
  const res = await xeroFetch(orgId, `/Contacts?searchTerm=${q}&page=1`);
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Xero contact search failed (${res.status}): ${text}`);
  }
  const body = (await res.json()) as { Contacts?: any[] };
  return (body.Contacts ?? []).map(mapContact);
}

export interface NewContactInput {
  name: string;
  contactPerson?: string | null;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
}

/**
 * Create a contact. Every field is whatever the user confirmed on the
 * preview screen — the quote only ever pre-fills it, because a typo here
 * becomes a permanent record in someone's accounts.
 *
 * The quote holds one free-text address block, so it is split across
 * Xero's address lines rather than guessed at: the last line becomes the
 * postcode only if it looks like one.
 */
export async function createContact(
  orgId: number,
  input: NewContactInput,
): Promise<XeroContactSummary> {
  const contact: Record<string, unknown> = { Name: input.name.trim() };

  if (input.email?.trim()) contact.EmailAddress = input.email.trim();

  if (input.contactPerson?.trim()) {
    const parts = input.contactPerson.trim().split(/\s+/);
    contact.FirstName = parts[0];
    if (parts.length > 1) contact.LastName = parts.slice(1).join(" ");
  }

  if (input.phone?.trim()) {
    contact.Phones = [
      { PhoneType: "DEFAULT", PhoneNumber: input.phone.trim() },
    ];
  }

  if (input.address?.trim()) {
    const lines = input.address
      .split(/\r?\n|,/)
      .map((l) => l.trim())
      .filter(Boolean);
    const looksLikePostcode = (v: string) =>
      /^[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}$/i.test(v);
    const postal =
      lines.length > 0 && looksLikePostcode(lines[lines.length - 1])
        ? lines.pop()
        : undefined;
    contact.Addresses = [
      {
        AddressType: "STREET",
        AddressLine1: lines[0] ?? "",
        AddressLine2: lines[1] ?? "",
        AddressLine3: lines[2] ?? "",
        AddressLine4: lines[3] ?? "",
        City: lines.length > 1 ? lines[lines.length - 1] : "",
        PostalCode: postal ?? "",
      },
    ];
  }

  const res = await xeroFetch(orgId, "/Contacts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ Contacts: [contact] }),
  });
  if (!res.ok) {
    throw new Error(await describeXeroError(res, "create the customer"));
  }
  const body = (await res.json()) as { Contacts?: any[] };
  const created = (body.Contacts ?? [])[0];
  if (!created) throw new Error("Xero accepted the customer but returned nothing");
  return mapContact(created);
}

export interface XeroAccountSummary {
  code: string;
  name: string;
  taxType?: string | null;
}

/**
 * Revenue accounts only — the codes a sales line may legitimately use.
 * Offering an expense account would produce a Xero rejection the user
 * couldn't diagnose.
 */
export async function fetchRevenueAccounts(
  orgId: number,
): Promise<XeroAccountSummary[]> {
  const res = await xeroFetch(orgId, "/Accounts");
  if (!res.ok) {
    throw new Error(await describeXeroError(res, "read the account list"));
  }
  const body = (await res.json()) as { Accounts?: any[] };
  return (body.Accounts ?? [])
    .filter(
      (a) =>
        (a.Status ?? "ACTIVE") === "ACTIVE" &&
        ["REVENUE", "SALES", "OTHERINCOME"].includes(String(a.Type ?? "")),
    )
    .map((a) => ({
      code: String(a.Code ?? ""),
      name: String(a.Name ?? ""),
      taxType: a.TaxType ?? null,
    }))
    .filter((a) => a.code.length > 0);
}

/**
 * Xero's validation errors arrive nested and are useless verbatim. Pull
 * out the messages that actually say what is wrong, so the user sees
 * "Account code must be specified" rather than a 400.
 */
async function describeXeroError(res: Response, doing: string): Promise<string> {
  let detail = "";
  try {
    const body: any = await res.json();
    const messages: string[] = [];
    const walk = (node: any) => {
      if (!node || typeof node !== "object") return;
      if (Array.isArray(node)) {
        node.forEach(walk);
        return;
      }
      if (typeof node.Message === "string") messages.push(node.Message);
      Object.values(node).forEach(walk);
    };
    walk(body);
    detail = Array.from(new Set(messages)).slice(0, 4).join(" · ");
    if (!detail && typeof body?.Detail === "string") detail = body.Detail;
  } catch {
    detail = await res.text().catch(() => "");
  }
  return `Xero refused to ${doing} (${res.status})${detail ? `: ${detail}` : ""}`;
}

export async function createRepeatingInvoice(
  orgId: number,
  payload: Record<string, unknown>,
): Promise<{ id: string }> {
  const res = await xeroFetch(orgId, "/RepeatingInvoices", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ RepeatingInvoices: [payload] }),
  });
  if (!res.ok) {
    throw new Error(await describeXeroError(res, "create the repeating invoice"));
  }
  const body = (await res.json()) as { RepeatingInvoices?: any[] };
  const created = (body.RepeatingInvoices ?? [])[0];
  if (!created?.RepeatingInvoiceID) {
    throw new Error("Xero accepted the repeating invoice but returned no id");
  }
  return { id: String(created.RepeatingInvoiceID) };
}

export async function updateRepeatingInvoice(
  orgId: number,
  repeatingInvoiceId: string,
  payload: Record<string, unknown>,
): Promise<{ id: string }> {
  const res = await xeroFetch(orgId, "/RepeatingInvoices", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      RepeatingInvoices: [
        { ...payload, RepeatingInvoiceID: repeatingInvoiceId },
      ],
    }),
  });
  if (!res.ok) {
    throw new Error(await describeXeroError(res, "update the repeating invoice"));
  }
  return { id: repeatingInvoiceId };
}

export async function getRepeatingInvoice(
  orgId: number,
  repeatingInvoiceId: string,
): Promise<any | null> {
  const res = await xeroFetch(
    orgId,
    `/RepeatingInvoices/${encodeURIComponent(repeatingInvoiceId)}`,
  );
  if (res.status === 404) return null;
  if (!res.ok) return null;
  const body = (await res.json()) as { RepeatingInvoices?: any[] };
  return (body.RepeatingInvoices ?? [])[0] ?? null;
}

export async function createInvoice(
  orgId: number,
  payload: Record<string, unknown>,
): Promise<{ id: string; number: string | null }> {
  const res = await xeroFetch(orgId, "/Invoices", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ Invoices: [payload] }),
  });
  if (!res.ok) {
    throw new Error(await describeXeroError(res, "create the invoice"));
  }
  const body = (await res.json()) as { Invoices?: any[] };
  const created = (body.Invoices ?? [])[0];
  if (!created?.InvoiceID) {
    throw new Error("Xero accepted the invoice but returned no id");
  }
  return {
    id: String(created.InvoiceID),
    number: created.InvoiceNumber ? String(created.InvoiceNumber) : null,
  };
}
