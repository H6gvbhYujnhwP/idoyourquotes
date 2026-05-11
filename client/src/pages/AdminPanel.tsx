/**
 * Admin Panel — Platform Administration
 *
 * Obscured URL: /manage-7k9x2m4q8r
 * Double-gated: client-side role check + server-side adminProcedure
 *
 * Layout:
 *   - Top-level tabs: Organisations | Conversations
 *   - Organisations:
 *       - List view: clickable rows → org detail
 *       - Org detail: internal tabs Overview | Quotes | Catalog
 *           - Overview: company info, billing, members, manage actions, danger zone
 *           - Quotes:   paginated list → quote inspector (inputs + AI draft + outputs)
 *           - Catalog:  customer's catalog with diff vs sector seed
 *   - Conversations: support thread list → thread detail (transcript + escalation)
 *
 * Capabilities (every existing one preserved):
 *   - Platform stats (orgs, users, quotes, paying)
 *   - Search across org name / company / slug / member email
 *   - Set subscription tier (trial/solo/pro/team)
 *   - Extend trial end date
 *   - Change monthly quote quota
 *   - Reset member password
 *   - Remove member from org (soft or hard delete)
 *   - Delete entire organisation (with type-DELETE confirmation, optional hard-delete users)
 *   - Mark support thread resolved / re-open
 *
 * New in this delivery (read-only, additive):
 *   - Per-org quote inspector showing inputs, AI draft fields, line items
 *     with stock/modified/added/adhoc source badges, assumptions, terms.
 *   - Per-org catalog diff against the sector seed: stock/modified/added/disabled.
 *
 * Visual style:
 *   - Modern Option B palette local to this surface (modern.* below). brandTheme
 *     is still imported in case any shared accent is needed but isn't required
 *     for the new layout. Tier colours are produced by tierMeta() locally.
 */
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import React, { useState, useMemo } from "react";
import {
  Search, ChevronLeft, ChevronRight, RotateCcw,
  Shield, Clock, Hash, Trash2, UserX, MessageSquare, CheckCircle2, FileText,
  Mic, Image as ImageIcon, FileType, Mail, AlignLeft, Sparkles, ExternalLink,
  Layers, AlertTriangle,
} from "lucide-react";

// ─── Modern admin palette (local to this file) ──────────────────────────────
const modern = {
  bg:          "#fafafa",
  surface:     "#ffffff",
  border:      "#e4e4e7",
  borderLight: "#f4f4f5",
  text:        "#0a0a0a",
  textMuted:   "#71717a",
  textFaint:   "#a1a1aa",
  modified: { bg: "#fffbeb", border: "#fde68a", text: "#b45309", strong: "#92400e" },
  added:    { bg: "#f0fdf4", border: "#bbf7d0", text: "#15803d", strong: "#166534" },
  disabled: { bg: "#f4f4f5", border: "#e4e4e7", text: "#71717a" },
  stock:    { bg: "#f4f4f5", border: "#e4e4e7", text: "#52525b" },
  adhoc:    { bg: "#eff6ff", border: "#bfdbfe", text: "#1d4ed8" },
  danger:   { bg: "#fef2f2", border: "#fecaca", text: "#991b1b", strong: "#7f1d1d" },
};

// ─── Helpers ─────────────────────────────────────────────────────────────────
function formatDate(d: string | Date | null | undefined): string {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}
function formatDateTime(d: string | Date | null | undefined): string {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}
function timeAgo(d: string | Date | null | undefined): string {
  if (!d) return "Never";
  const diff = Date.now() - new Date(d).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return formatDate(d);
}
function formatMoney(v: any): string {
  if (v === null || v === undefined || v === "") return "—";
  const n = typeof v === "string" ? parseFloat(v) : Number(v);
  if (!Number.isFinite(n)) return "—";
  return new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP", minimumFractionDigits: n % 1 === 0 ? 0 : 2 }).format(n);
}

function tierMeta(tier: string): { bg: string; soft: string; text: string; label: string } {
  switch (tier) {
    case "solo": return { bg: "#3b82f6", soft: "#dbeafe", text: "#1d4ed8", label: "Solo" };
    case "pro":  return { bg: "#7c3aed", soft: "#f5f3ff", text: "#6d28d9", label: "Pro" };
    case "team": return { bg: "#f59e0b", soft: "#fef3c7", text: "#92400e", label: "Team" };
    default:     return { bg: "#0d9488", soft: "#f0fdfa", text: "#0f766e", label: "Trial" };
  }
}

function statusBadge(status: string, cancelAtPeriodEnd?: boolean): { label: string; bg: string; text: string } {
  if (cancelAtPeriodEnd && status === "active") return { label: "Cancelling", bg: "#fef3c7", text: "#92400e" };
  switch (status) {
    case "active":   return { label: "Active",    bg: "#dcfce7", text: "#166534" };
    case "trialing": return { label: "Trialing",  bg: "#f0fdfa", text: "#0f766e" };
    case "past_due": return { label: "Past Due",  bg: "#fef3c7", text: "#92400e" };
    case "canceled": return { label: "Cancelled", bg: "#fee2e2", text: "#991b1b" };
    case "unpaid":   return { label: "Unpaid",    bg: "#fee2e2", text: "#991b1b" };
    default:         return { label: status,      bg: "#f1f5f9", text: "#475569" };
  }
}

function SourceBadge({ source }: { source: "stock" | "modified" | "added" | "adhoc" }) {
  const palette = source === "modified" ? modern.modified
                : source === "added"    ? modern.added
                : source === "adhoc"    ? modern.adhoc
                : modern.stock;
  return (
    <span style={{
      display: "inline-block", padding: "1px 7px", borderRadius: 5, fontSize: 10,
      background: palette.bg, color: palette.text, border: `0.5px solid ${palette.border}`,
      textAlign: "center", whiteSpace: "nowrap",
    }}>{source}</span>
  );
}

function InitialsChip({ name, tier, size = 30 }: { name: string; tier: string; size?: number }) {
  const t = tierMeta(tier);
  const initials = useMemo(() => {
    const trimmed = (name || "").trim();
    if (!trimmed) return "—";
    const parts = trimmed.split(/\s+/).filter(Boolean);
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }, [name]);
  return (
    <div style={{
      width: size, height: size, borderRadius: size <= 32 ? 8 : 10,
      background: t.soft, color: t.text,
      display: "flex", alignItems: "center", justifyContent: "center",
      fontSize: size <= 32 ? 11 : 16, fontWeight: 500, flexShrink: 0,
    }}>{initials}</div>
  );
}

// ─── Platform stats bar ─────────────────────────────────────────────────────
function PlatformStats({ stats }: { stats: any }) {
  if (!stats) return null;
  const tierCounts = stats.tierCounts || {};
  const paying = (tierCounts.solo || 0) + (tierCounts.pro || 0) + (tierCounts.team || 0);
  const cards = [
    { label: "Organisations", value: stats.totalOrgs },
    { label: "Users",         value: stats.totalUsers },
    { label: "Quotes",        value: stats.totalQuotes },
    { label: "Paying",        value: `${paying}`, sub: `/ ${stats.totalOrgs}` },
  ];
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10, marginBottom: 18 }}>
      {cards.map((c) => (
        <div key={c.label} style={{
          background: modern.surface, border: `0.5px solid ${modern.border}`,
          borderRadius: 10, padding: "12px 14px",
        }}>
          <div style={{ fontSize: 11, color: modern.textMuted, marginBottom: 4 }}>{c.label}</div>
          <div style={{ fontSize: 24, fontWeight: 500, color: modern.text, letterSpacing: -0.4 }}>
            {c.value}
            {(c as any).sub && <span style={{ fontSize: 13, color: modern.textMuted, fontWeight: 400, marginLeft: 3 }}>{(c as any).sub}</span>}
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Organisation list ──────────────────────────────────────────────────────
function OrgList({ onSelectOrg }: { onSelectOrg: (id: number) => void }) {
  const [search, setSearch] = useState("");
  const [page, setPage]     = useState(1);

  const { data, isLoading } = trpc.admin.listOrganizations.useQuery(
    { search: search || undefined, page, limit: 50 },
    { keepPreviousData: true }
  );

  const orgs = data?.orgs || [];
  const total = data?.total || 0;
  const totalPages = Math.max(1, Math.ceil(total / 50));

  return (
    <div>
      <div style={{ position: "relative", marginBottom: 14 }}>
        <Search size={15} style={{ position: "absolute", left: 13, top: 11, color: modern.textMuted }} />
        <input
          type="text"
          placeholder="Search by org name, company, slug, member email…"
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          style={{
            width: "100%", padding: "10px 14px 10px 36px", borderRadius: 10,
            border: `0.5px solid ${modern.border}`, fontSize: 13, outline: "none",
            background: modern.surface, color: modern.text,
          }}
          onFocus={(e) => e.target.style.borderColor = "#0a0a0a"}
          onBlur={(e) => e.target.style.borderColor = modern.border}
        />
      </div>

      <div style={{
        background: modern.surface, border: `0.5px solid ${modern.border}`,
        borderRadius: 12, overflow: "hidden",
      }}>
        {isLoading ? (
          <div style={{ padding: 40, textAlign: "center", color: modern.textMuted, fontSize: 13 }}>Loading…</div>
        ) : orgs.length === 0 ? (
          <div style={{ padding: 40, textAlign: "center", color: modern.textMuted, fontSize: 13 }}>No organisations found</div>
        ) : orgs.map((org: any) => {
          const t = tierMeta(org.tier);
          const sb = statusBadge(org.status, org.cancelAtPeriodEnd);
          return (
            <div
              key={org.id}
              role="button" tabIndex={0}
              onClick={() => onSelectOrg(org.id)}
              onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") onSelectOrg(org.id); }}
              style={{
                display: "flex", alignItems: "center", padding: "11px 16px",
                borderBottom: `0.5px solid ${modern.borderLight}`, gap: 12, cursor: "pointer",
                transition: "background 0.12s",
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = modern.borderLight)}
              onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
            >
              <InitialsChip name={org.companyName || org.name} tier={org.tier} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 500, color: modern.text }}>{org.companyName || org.name}</div>
                <div style={{ fontSize: 11, color: modern.textMuted, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {org.owner?.email || "—"} · {org.memberCount} member{org.memberCount === 1 ? "" : "s"} · {org.totalQuotes} quote{org.totalQuotes === 1 ? "" : "s"}
                </div>
              </div>
              <span style={{ padding: "3px 10px", borderRadius: 6, fontSize: 10, fontWeight: 500, background: t.bg, color: "#fff" }}>{t.label}</span>
              <span style={{ padding: "3px 10px", borderRadius: 6, fontSize: 10, fontWeight: 500, background: sb.bg, color: sb.text }}>{sb.label}</span>
              <ChevronRight size={14} color={modern.textFaint} style={{ marginLeft: 4 }} />
            </div>
          );
        })}
      </div>

      {totalPages > 1 && (
        <div style={{
          display: "flex", justifyContent: "space-between", alignItems: "center",
          padding: "12px 4px", fontSize: 12, color: modern.textMuted,
        }}>
          <span>Page {page} of {totalPages} · {total} total</span>
          <div style={{ display: "flex", gap: 6 }}>
            <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1}
              style={{ padding: "5px 10px", borderRadius: 6, border: `0.5px solid ${modern.border}`, background: modern.surface, cursor: page <= 1 ? "not-allowed" : "pointer", opacity: page <= 1 ? 0.5 : 1, fontSize: 12 }}>Prev</button>
            <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page >= totalPages}
              style={{ padding: "5px 10px", borderRadius: 6, border: `0.5px solid ${modern.border}`, background: modern.surface, cursor: page >= totalPages ? "not-allowed" : "pointer", opacity: page >= totalPages ? 0.5 : 1, fontSize: 12 }}>Next</button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Org detail with internal tabs ─────────────────────────────────────────
type OrgTab = "overview" | "quotes" | "catalog";

function OrgDetail({ orgId, onBack }: { orgId: number; onBack: () => void }) {
  const [tab, setTab] = useState<OrgTab>("overview");
  const [selectedQuoteId, setSelectedQuoteId] = useState<number | null>(null);

  const { data: org, isLoading } = trpc.admin.getOrganizationDetail.useQuery({ orgId });

  if (isLoading || !org) {
    return (
      <div style={{ background: modern.surface, padding: 40, borderRadius: 12, textAlign: "center", color: modern.textMuted, fontSize: 13, border: `0.5px solid ${modern.border}` }}>
        Loading…
      </div>
    );
  }

  const t  = tierMeta((org as any).tier);
  const sb = statusBadge((org as any).status, (org as any).cancelAtPeriodEnd);

  if (selectedQuoteId !== null) {
    return (
      <QuoteDetail
        quoteId={selectedQuoteId}
        orgName={(org as any).companyName || (org as any).name}
        onBack={() => setSelectedQuoteId(null)}
      />
    );
  }

  return (
    <div>
      <button
        onClick={onBack}
        style={{
          display: "flex", alignItems: "center", gap: 6, background: "transparent",
          border: "none", padding: 0, fontSize: 12, color: modern.textMuted,
          cursor: "pointer", marginBottom: 14, fontFamily: "inherit",
        }}
      >
        <ChevronLeft size={13} /> Back to organisations
      </button>

      <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 18 }}>
        <InitialsChip name={(org as any).companyName || (org as any).name} tier={(org as any).tier} size={48} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <div style={{ fontSize: 19, fontWeight: 500, color: modern.text, letterSpacing: -0.3 }}>
              {(org as any).companyName || (org as any).name}
            </div>
            <span style={{ padding: "3px 10px", borderRadius: 6, fontSize: 11, fontWeight: 500, background: t.bg, color: "#fff" }}>{t.label}</span>
            <span style={{ padding: "3px 10px", borderRadius: 6, fontSize: 11, fontWeight: 500, background: sb.bg, color: sb.text }}>{sb.label}</span>
          </div>
          <div style={{ fontSize: 12, color: modern.textMuted, marginTop: 2 }}>
            {(org as any).companyEmail || (org as any).billingEmail || (org as any).slug} · created {formatDate((org as any).createdAt)} · ID {(org as any).id}
          </div>
        </div>
      </div>

      <div style={{ display: "flex", gap: 0, marginBottom: 16, borderBottom: `0.5px solid ${modern.border}` }}>
        {([
          { id: "overview" as const, label: "Overview" },
          { id: "quotes"   as const, label: "Quotes",  count: (org as any).totalQuotes },
          { id: "catalog"  as const, label: "Catalog", count: (org as any).catalogItemCount },
        ]).map((entry) => {
          const active = tab === entry.id;
          return (
            <button
              key={entry.id}
              onClick={() => setTab(entry.id)}
              style={{
                padding: "8px 14px", fontSize: 12,
                fontWeight: active ? 500 : 400,
                color: active ? modern.text : modern.textMuted,
                background: "transparent", border: "none",
                borderBottom: `2px solid ${active ? modern.text : "transparent"}`,
                marginBottom: -1, cursor: "pointer", fontFamily: "inherit",
              }}
            >
              {entry.label}
              {(entry as any).count !== undefined && (
                <span style={{ marginLeft: 4, color: modern.textMuted, fontWeight: 400 }}>{(entry as any).count}</span>
              )}
            </button>
          );
        })}
      </div>

      {tab === "overview" && <OrgOverview org={org} />}
      {tab === "quotes"   && <OrgQuotes  orgId={orgId} onSelectQuote={setSelectedQuoteId} />}
      {tab === "catalog"  && <OrgCatalog orgId={orgId} />}
    </div>
  );
}

// ─── Org overview tab ──────────────────────────────────────────────────────
function OrgOverview({ org }: { org: any }) {
  const utils = trpc.useUtils();

  const [resetUserId, setResetUserId]       = useState<number | null>(null);
  const [newPassword, setNewPassword]       = useState("");
  const [pwResult, setPwResult]             = useState<string | null>(null);
  const [trialDate, setTrialDate]           = useState("");
  const [trialResult, setTrialResult]       = useState<string | null>(null);
  const [quotaValue, setQuotaValue]         = useState("");
  const [quotaResult, setQuotaResult]       = useState<string | null>(null);
  const [tierValue, setTierValue]           = useState("");
  const [tierResult, setTierResult]         = useState<string | null>(null);
  const [showDelete, setShowDelete]         = useState(false);
  const [deleteConfirm, setDeleteConfirm]   = useState("");
  const [hardDeleteUsers, setHardDeleteUsers] = useState(false);
  const [deleteResult, setDeleteResult]     = useState<string | null>(null);
  const [deletingUser, setDeletingUser]     = useState<{ userId: number; email: string } | null>(null);
  const [hardDeleteUser, setHardDeleteUser] = useState(false);

  const resetPwMut = trpc.admin.resetUserPassword.useMutation({
    onSuccess: (data: any) => { setPwResult(`✓ ${data.message || "Password reset"}`); setNewPassword(""); },
    onError:   (e)         => { setPwResult(`Error: ${e.message}`); },
  });
  const updateTrialMut = trpc.admin.updateTrialEnd.useMutation({
    onSuccess: () => { setTrialResult("✓ Trial end updated"); utils.admin.getOrganizationDetail.invalidate(); },
    onError:   (e) => { setTrialResult(`Error: ${e.message}`); },
  });
  const updateQuotaMut = trpc.admin.updateQuotaLimit.useMutation({
    onSuccess: () => { setQuotaResult("✓ Quota updated"); utils.admin.getOrganizationDetail.invalidate(); },
    onError:   (e) => { setQuotaResult(`Error: ${e.message}`); },
  });
  const setTierMut = trpc.admin.setSubscriptionTier.useMutation({
    onSuccess: () => { setTierResult("✓ Tier updated"); utils.admin.getOrganizationDetail.invalidate(); utils.admin.platformStats.invalidate(); },
    onError:   (e) => { setTierResult(`Error: ${e.message}`); },
  });
  const deleteOrgMut = trpc.admin.deleteOrganization.useMutation({
    onSuccess: () => {
      setDeleteResult("✓ Organisation deleted");
      utils.admin.listOrganizations.invalidate();
      utils.admin.platformStats.invalidate();
      setTimeout(() => { window.history.back(); }, 600);
    },
    onError: (e) => { setDeleteResult(`Error: ${e.message}`); },
  });
  const deleteUserMut = trpc.admin.deleteUser.useMutation({
    onSuccess: () => {
      setDeletingUser(null);
      setHardDeleteUser(false);
      utils.admin.getOrganizationDetail.invalidate();
      utils.admin.listOrganizations.invalidate();
      utils.admin.platformStats.invalidate();
    },
  });

  const trialEndsAt = org.trialEndsAt ? new Date(org.trialEndsAt) : null;
  const trialExpired = trialEndsAt ? trialEndsAt.getTime() < Date.now() : false;
  const trialDaysLeft = trialEndsAt ? Math.ceil((trialEndsAt.getTime() - Date.now()) / 86_400_000) : 0;

  const card: React.CSSProperties = { background: modern.surface, border: `0.5px solid ${modern.border}`, borderRadius: 12, padding: "16px 18px", marginBottom: 14 };
  const sectionLabel: React.CSSProperties = { fontSize: 11, color: modern.textMuted, fontWeight: 500, textTransform: "uppercase", letterSpacing: 0.05, marginBottom: 8 };
  const fieldRow: React.CSSProperties = { display: "flex", justifyContent: "space-between", padding: "6px 0", fontSize: 13, borderBottom: `0.5px solid ${modern.borderLight}` };
  const fieldLabel: React.CSSProperties = { color: modern.textMuted };
  const fieldValue: React.CSSProperties = { color: modern.text, fontWeight: 500, textAlign: "right" as const };

  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
      <div>
        <div style={card}>
          <div style={sectionLabel}>Company info</div>
          <div style={fieldRow}><span style={fieldLabel}>Company</span><span style={fieldValue}>{org.companyName || "—"}</span></div>
          <div style={fieldRow}><span style={fieldLabel}>Email</span><span style={fieldValue}>{org.companyEmail || org.billingEmail || "—"}</span></div>
          <div style={fieldRow}><span style={fieldLabel}>Phone</span><span style={fieldValue}>{org.companyPhone || "—"}</span></div>
          <div style={fieldRow}><span style={fieldLabel}>Address</span><span style={fieldValue}>{org.companyAddress || "—"}</span></div>
          <div style={fieldRow}><span style={fieldLabel}>Slug</span><span style={fieldValue}>{org.slug || "—"}</span></div>
          <div style={fieldRow}><span style={fieldLabel}>Created</span><span style={fieldValue}>{formatDateTime(org.createdAt)}</span></div>
          <div style={{ ...fieldRow, borderBottom: "none" }}><span style={fieldLabel}>Last updated</span><span style={fieldValue}>{formatDateTime(org.updatedAt)}</span></div>
        </div>

        <div style={card}>
          <div style={sectionLabel}>Billing &amp; subscription</div>
          <div style={fieldRow}><span style={fieldLabel}>Tier</span><span style={fieldValue}>{org.tier}</span></div>
          <div style={fieldRow}><span style={fieldLabel}>Status</span><span style={fieldValue}>{org.status}{org.cancelAtPeriodEnd ? " (cancelling)" : ""}</span></div>
          <div style={fieldRow}><span style={fieldLabel}>Stripe customer</span><span style={{ ...fieldValue, fontSize: 11, fontFamily: "ui-monospace, monospace" }}>{org.stripeCustomerId || "—"}</span></div>
          <div style={fieldRow}><span style={fieldLabel}>Stripe subscription</span><span style={{ ...fieldValue, fontSize: 11, fontFamily: "ui-monospace, monospace" }}>{org.stripeSubscriptionId || "—"}</span></div>
          <div style={fieldRow}><span style={fieldLabel}>Period start</span><span style={fieldValue}>{formatDate(org.currentPeriodStart)}</span></div>
          <div style={fieldRow}><span style={fieldLabel}>Period end</span><span style={fieldValue}>{formatDate(org.currentPeriodEnd)}</span></div>
          {org.tier === "trial" && (
            <>
              <div style={fieldRow}><span style={fieldLabel}>Trial started</span><span style={fieldValue}>{formatDate(org.trialStartsAt)}</span></div>
              <div style={{ ...fieldRow, borderBottom: "none" }}>
                <span style={fieldLabel}>Trial ends</span>
                <span style={{
                  ...fieldValue,
                  color: trialExpired ? "#dc2626" : trialDaysLeft <= 3 ? "#f59e0b" : modern.text,
                }}>
                  {formatDate(org.trialEndsAt)}
                  {trialEndsAt ? (trialExpired ? " (EXPIRED)" : ` (${trialDaysLeft}d left)`) : ""}
                </span>
              </div>
            </>
          )}
        </div>

        <div style={card}>
          <div style={sectionLabel}>Quotes &amp; limits</div>
          <div style={fieldRow}><span style={fieldLabel}>Total quotes</span><span style={fieldValue}>{org.totalQuotes}</span></div>
          <div style={fieldRow}><span style={fieldLabel}>This month</span><span style={fieldValue}>{org.monthlyQuoteCount} / {org.maxQuotesPerMonth === -1 ? "∞" : org.maxQuotesPerMonth}</span></div>
          <div style={fieldRow}><span style={fieldLabel}>Draft</span><span style={fieldValue}>{org.quotesByStatus?.draft ?? 0}</span></div>
          <div style={fieldRow}><span style={fieldLabel}>Sent</span><span style={fieldValue}>{org.quotesByStatus?.sent ?? 0}</span></div>
          <div style={fieldRow}><span style={fieldLabel}>Accepted</span><span style={fieldValue}>{org.quotesByStatus?.accepted ?? 0}</span></div>
          <div style={fieldRow}><span style={fieldLabel}>Declined</span><span style={fieldValue}>{org.quotesByStatus?.declined ?? 0}</span></div>
          <div style={fieldRow}><span style={fieldLabel}>Catalog items</span><span style={fieldValue}>{org.catalogItemCount}</span></div>
          <div style={{ ...fieldRow, borderBottom: "none" }}><span style={fieldLabel}>Max members</span><span style={fieldValue}>{org.maxUsers}</span></div>
        </div>
      </div>

      <div>
        <div style={card}>
          <div style={sectionLabel}>Members ({org.members.length})</div>
          {org.members.map((m: any) => {
            const roleColors: Record<string, { bg: string; text: string }> = {
              owner:  { bg: "#fef3c7", text: "#92400e" },
              admin:  { bg: "#dbeafe", text: "#1e40af" },
              member: { bg: "#f4f4f5", text: "#52525b" },
            };
            const rc = roleColors[m.role] || roleColors.member;
            return (
              <div key={m.userId} style={{
                padding: "10px 0", borderBottom: `0.5px solid ${modern.borderLight}`,
                display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8,
              }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 500, color: modern.text, display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                    <span>{m.name || "Unnamed"}</span>
                    <span style={{ fontSize: 9, fontWeight: 500, padding: "1px 6px", borderRadius: 4, background: rc.bg, color: rc.text, textTransform: "uppercase" }}>{m.role}</span>
                    {!m.isActive && <span style={{ fontSize: 9, fontWeight: 500, padding: "1px 6px", borderRadius: 4, background: "#fee2e2", color: "#991b1b" }}>DEACTIVATED</span>}
                  </div>
                  <div style={{ fontSize: 12, color: modern.textMuted }}>{m.email}</div>
                  <div style={{ fontSize: 11, color: modern.textMuted, marginTop: 2 }}>
                    Joined {formatDate(m.createdAt)} · last active {timeAgo(m.lastSignedIn)}
                    {m.defaultTradeSector && ` · ${m.defaultTradeSector}`}
                  </div>
                </div>
                <div style={{ display: "flex", gap: 6 }}>
                  <button
                    onClick={(e) => { e.stopPropagation(); setResetUserId(m.userId); setNewPassword(""); setPwResult(null); }}
                    style={{ padding: "4px 10px", borderRadius: 6, border: `0.5px solid ${modern.border}`, background: modern.surface, cursor: "pointer", fontSize: 11, color: modern.text, display: "flex", alignItems: "center", gap: 4, whiteSpace: "nowrap" }}
                  >
                    <RotateCcw size={11} /> Reset PW
                  </button>
                  {m.role !== "owner" && (
                    <button
                      onClick={(e) => { e.stopPropagation(); setDeletingUser({ userId: m.userId, email: m.email }); setHardDeleteUser(false); }}
                      style={{ padding: "4px 10px", borderRadius: 6, border: `0.5px solid ${modern.danger.border}`, background: modern.danger.bg, cursor: "pointer", fontSize: 11, color: modern.danger.text, display: "flex", alignItems: "center", gap: 4, whiteSpace: "nowrap" }}
                    >
                      <UserX size={11} /> Remove
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {resetUserId && (
          <div style={{ ...card, background: "#fffbeb", border: `0.5px solid #fde68a` }}>
            <div style={{ ...sectionLabel, color: "#92400e", display: "flex", alignItems: "center", gap: 6 }}>
              <Shield size={12} /> Reset password — {org.members.find((m: any) => m.userId === resetUserId)?.email}
            </div>
            <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
              <input type="text" placeholder="New password (min 8 chars)" value={newPassword} onChange={(e) => setNewPassword(e.target.value)}
                style={{ flex: 1, padding: "8px 12px", borderRadius: 6, border: "0.5px solid #fde68a", fontSize: 13, outline: "none", background: "white" }} />
              <button onClick={() => resetPwMut.mutate({ userId: resetUserId!, newPassword })} disabled={newPassword.length < 8 || resetPwMut.isPending}
                style={{ padding: "8px 14px", borderRadius: 6, border: "none", background: newPassword.length >= 8 ? "#92400e" : "#d4d4d8", color: "white", cursor: newPassword.length >= 8 ? "pointer" : "default", fontSize: 12, fontWeight: 500 }}>Reset</button>
              <button onClick={() => { setResetUserId(null); setNewPassword(""); setPwResult(null); }}
                style={{ padding: "8px 12px", borderRadius: 6, border: "0.5px solid #fde68a", background: "white", cursor: "pointer", fontSize: 12 }}>Cancel</button>
            </div>
            {pwResult && <div style={{ marginTop: 6, fontSize: 12, color: pwResult.startsWith("Error") ? "#991b1b" : "#15803d" }}>{pwResult}</div>}
          </div>
        )}

        {deletingUser && (
          <div style={{ ...card, background: modern.danger.bg, border: `0.5px solid ${modern.danger.border}` }}>
            <div style={{ ...sectionLabel, color: modern.danger.text, display: "flex", alignItems: "center", gap: 6 }}>
              <UserX size={12} /> Remove user — {deletingUser.email}
            </div>
            <label style={{ display: "flex", alignItems: "flex-start", gap: 8, marginTop: 6, marginBottom: 10, cursor: "pointer", color: modern.danger.strong, fontSize: 12, lineHeight: 1.5 }}>
              <input type="checkbox" checked={hardDeleteUser} onChange={(e) => setHardDeleteUser(e.target.checked)} style={{ width: 13, height: 13, marginTop: 2 }} />
              <span><strong style={{ fontWeight: 500 }}>Hard delete</strong> — remove from database entirely (frees email domain for new trials)</span>
            </label>
            <div style={{ display: "flex", gap: 6 }}>
              <button onClick={() => deleteUserMut.mutate({ userId: deletingUser.userId, orgId: org.id, hardDelete: hardDeleteUser })} disabled={deleteUserMut.isPending}
                style={{ padding: "8px 14px", borderRadius: 6, border: "none", background: modern.danger.text, color: "white", cursor: "pointer", fontSize: 12, fontWeight: 500 }}>
                {deleteUserMut.isPending ? "Removing…" : "Remove user"}
              </button>
              <button onClick={() => { setDeletingUser(null); setHardDeleteUser(false); }}
                style={{ padding: "8px 12px", borderRadius: 6, border: `0.5px solid ${modern.danger.border}`, background: "white", cursor: "pointer", fontSize: 12 }}>Cancel</button>
            </div>
            {deleteUserMut.isError && <div style={{ marginTop: 6, fontSize: 12, color: modern.danger.text }}>Error: {deleteUserMut.error?.message}</div>}
          </div>
        )}

        <div style={card}>
          <div style={sectionLabel}>Manage</div>

          <div style={{ marginBottom: 14 }}>
            <label style={{ fontSize: 11, fontWeight: 500, color: modern.textMuted, display: "block", marginBottom: 6 }}>
              <Clock size={11} style={{ display: "inline", marginRight: 4, verticalAlign: "-1px" }} />
              Trial end date {org.tier === "trial" && <>(current: {formatDate(org.trialEndsAt)})</>}
            </label>
            <div style={{ display: "flex", gap: 6 }}>
              <input type="date" value={trialDate} onChange={(e) => setTrialDate(e.target.value)}
                style={{ flex: 1, padding: "8px 12px", borderRadius: 6, border: `0.5px solid ${modern.border}`, fontSize: 13, outline: "none", background: modern.surface }} />
              <button
                onClick={() => {
                  if (!trialDate) return;
                  const endOfDay = new Date(trialDate + "T23:59:59.000Z");
                  updateTrialMut.mutate({ orgId: org.id, trialEndsAt: endOfDay.toISOString() });
                }}
                disabled={!trialDate || updateTrialMut.isPending}
                style={{ padding: "8px 14px", borderRadius: 6, border: "none", background: trialDate ? "#0a0a0a" : "#d4d4d8", color: "white", cursor: trialDate ? "pointer" : "default", fontSize: 12, fontWeight: 500 }}
              >Set</button>
            </div>
            {trialResult && <div style={{ marginTop: 6, fontSize: 11, color: trialResult.startsWith("Error") ? "#991b1b" : "#15803d" }}>{trialResult}</div>}
          </div>

          <div style={{ marginBottom: 14 }}>
            <label style={{ fontSize: 11, fontWeight: 500, color: modern.textMuted, display: "block", marginBottom: 6 }}>
              <Hash size={11} style={{ display: "inline", marginRight: 4, verticalAlign: "-1px" }} />
              Max quotes per month (current: {org.maxQuotesPerMonth === -1 ? "Unlimited" : org.maxQuotesPerMonth})
            </label>
            <div style={{ display: "flex", gap: 6 }}>
              <input type="number" min={0} placeholder={String(org.maxQuotesPerMonth)} value={quotaValue} onChange={(e) => setQuotaValue(e.target.value)}
                style={{ flex: 1, padding: "8px 12px", borderRadius: 6, border: `0.5px solid ${modern.border}`, fontSize: 13, outline: "none", background: modern.surface }} />
              <button
                onClick={() => {
                  const val = parseInt(quotaValue);
                  if (isNaN(val) || val < 0) return;
                  updateQuotaMut.mutate({ orgId: org.id, maxQuotesPerMonth: val });
                }}
                disabled={!quotaValue || isNaN(parseInt(quotaValue)) || updateQuotaMut.isPending}
                style={{ padding: "8px 14px", borderRadius: 6, border: "none", background: quotaValue && !isNaN(parseInt(quotaValue)) ? "#0a0a0a" : "#d4d4d8", color: "white", cursor: quotaValue ? "pointer" : "default", fontSize: 12, fontWeight: 500 }}
              >Set</button>
            </div>
            {quotaResult && <div style={{ marginTop: 6, fontSize: 11, color: quotaResult.startsWith("Error") ? "#991b1b" : "#15803d" }}>{quotaResult}</div>}
          </div>

          <div>
            <label style={{ fontSize: 11, fontWeight: 500, color: modern.textMuted, display: "block", marginBottom: 6 }}>
              Set subscription tier (current: <strong style={{ fontWeight: 500, color: modern.text }}>{org.tier}</strong>)
            </label>
            <div style={{ display: "flex", gap: 6 }}>
              <select value={tierValue} onChange={(e) => setTierValue(e.target.value)}
                style={{ flex: 1, padding: "8px 12px", borderRadius: 6, border: `0.5px solid ${modern.border}`, fontSize: 13, outline: "none", background: modern.surface }}>
                <option value="">— select tier —</option>
                <option value="trial">Trial</option>
                <option value="solo">Solo</option>
                <option value="pro">Pro</option>
                <option value="team">Team</option>
              </select>
              <button
                onClick={() => { if (!tierValue) return; setTierMut.mutate({ orgId: org.id, tier: tierValue as any }); }}
                disabled={!tierValue || setTierMut.isPending}
                style={{ padding: "8px 14px", borderRadius: 6, border: "none", background: tierValue ? "#0a0a0a" : "#d4d4d8", color: "white", cursor: tierValue ? "pointer" : "default", fontSize: 12, fontWeight: 500 }}
              >Set</button>
            </div>
            {tierResult && <div style={{ marginTop: 6, fontSize: 11, color: tierResult.startsWith("Error") ? "#991b1b" : "#15803d" }}>{tierResult}</div>}
          </div>
        </div>

        <div style={{ ...card, background: modern.danger.bg, border: `0.5px solid ${modern.danger.border}` }}>
          <div style={{ ...sectionLabel, color: modern.danger.text }}>Danger zone</div>
          {!showDelete ? (
            <button
              onClick={() => setShowDelete(true)}
              style={{ width: "100%", padding: "9px 14px", borderRadius: 7, border: `0.5px solid ${modern.danger.border}`, background: modern.surface, cursor: "pointer", fontSize: 12, fontWeight: 500, color: modern.danger.text, display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}
            >
              <Trash2 size={12} /> Delete this organisation
            </button>
          ) : (
            <div>
              <p style={{ fontSize: 12, color: modern.danger.strong, marginBottom: 10, lineHeight: 1.5 }}>
                Permanently deletes <strong style={{ fontWeight: 500 }}>{org.companyName || org.name}</strong> and all associated data: quotes, documents, uploads, catalog items, team memberships, and cancels any Stripe subscription.
              </p>
              <div style={{ marginBottom: 10 }}>
                <label style={{ display: "flex", alignItems: "flex-start", gap: 8, fontSize: 12, color: modern.danger.strong, cursor: "pointer", lineHeight: 1.5 }}>
                  <input type="checkbox" checked={hardDeleteUsers} onChange={(e) => setHardDeleteUsers(e.target.checked)} style={{ width: 13, height: 13, marginTop: 2 }} />
                  <span><strong style={{ fontWeight: 500 }}>Hard delete user records</strong> — removes users from the database entirely, freeing their email domain for new trial signups. Leave unchecked to just deactivate (preserves anti-gaming).</span>
                </label>
              </div>
              <div style={{ marginBottom: 10 }}>
                <label style={{ fontSize: 11, fontWeight: 500, color: modern.danger.strong, display: "block", marginBottom: 4 }}>Type DELETE to confirm</label>
                <input type="text" placeholder="DELETE" value={deleteConfirm} onChange={(e) => setDeleteConfirm(e.target.value)}
                  style={{ width: "100%", padding: "8px 12px", borderRadius: 6, border: `0.5px solid ${modern.danger.border}`, fontSize: 13, outline: "none", background: modern.surface }} />
              </div>
              <div style={{ display: "flex", gap: 6 }}>
                <button
                  onClick={() => { if (deleteConfirm !== "DELETE") return; deleteOrgMut.mutate({ orgId: org.id, hardDeleteUsers }); }}
                  disabled={deleteConfirm !== "DELETE" || deleteOrgMut.isPending}
                  style={{ flex: 1, padding: "10px 14px", borderRadius: 6, border: "none", background: deleteConfirm === "DELETE" ? modern.danger.text : "#d4d4d8", color: "white", cursor: deleteConfirm === "DELETE" ? "pointer" : "default", fontSize: 13, fontWeight: 500 }}
                >{deleteOrgMut.isPending ? "Deleting…" : "Permanently delete"}</button>
                <button onClick={() => { setShowDelete(false); setDeleteConfirm(""); setHardDeleteUsers(false); }}
                  style={{ padding: "10px 14px", borderRadius: 6, border: `0.5px solid ${modern.danger.border}`, background: modern.surface, cursor: "pointer", fontSize: 12 }}>Cancel</button>
              </div>
              {deleteResult && (
                <div style={{ marginTop: 10, fontSize: 11, padding: "6px 10px", borderRadius: 6, color: deleteResult.startsWith("Error") ? modern.danger.text : "#166534", background: deleteResult.startsWith("Error") ? "#fee2e2" : "#dcfce7" }}>{deleteResult}</div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Org quotes tab ────────────────────────────────────────────────────────
function OrgQuotes({ orgId, onSelectQuote }: { orgId: number; onSelectQuote: (quoteId: number) => void }) {
  const [page, setPage] = useState(1);
  const { data, isLoading } = trpc.admin.getOrgQuotes.useQuery({ orgId, page, limit: 20 });

  const quotes = data?.quotes || [];
  const total = data?.total || 0;
  const totalPages = Math.max(1, Math.ceil(total / 20));

  const statusBg = (status: string): { bg: string; text: string } => {
    switch (status) {
      case "draft":    return { bg: "#f4f4f5", text: "#52525b" };
      case "sent":     return { bg: "#f0fdfa", text: "#0f766e" };
      case "accepted": return { bg: "#dcfce7", text: "#166534" };
      case "declined": return { bg: "#fee2e2", text: "#991b1b" };
      default:         return { bg: "#f4f4f5", text: "#52525b" };
    }
  };

  return (
    <div>
      <div style={{ background: modern.surface, border: `0.5px solid ${modern.border}`, borderRadius: 12, overflow: "hidden" }}>
        {isLoading ? (
          <div style={{ padding: 40, textAlign: "center", color: modern.textMuted, fontSize: 13 }}>Loading…</div>
        ) : quotes.length === 0 ? (
          <div style={{ padding: 40, textAlign: "center", color: modern.textMuted, fontSize: 13 }}>
            <FileText size={26} style={{ opacity: 0.3, marginBottom: 8 }} />
            <div>This organisation has no quotes yet.</div>
          </div>
        ) : quotes.map((q: any) => {
          const sb = statusBg(q.status);
          const monthly = parseFloat(q.monthlyTotal || "0");
          const annual  = parseFloat(q.annualTotal  || "0");
          const oneOff  = parseFloat(q.total        || "0");
          let display = formatMoney(oneOff);
          if (monthly > 0) display = `${formatMoney(monthly)}/mo`;
          else if (annual > 0) display = `${formatMoney(annual)}/yr`;
          return (
            <div
              key={q.id}
              role="button" tabIndex={0}
              onClick={() => onSelectQuote(q.id)}
              onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") onSelectQuote(q.id); }}
              style={{
                display: "flex", alignItems: "center", padding: "11px 16px",
                borderBottom: `0.5px solid ${modern.borderLight}`, gap: 12, cursor: "pointer",
                transition: "background 0.12s",
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = modern.borderLight)}
              onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 500, color: modern.text }}>{q.title || q.reference || `Quote #${q.id}`}</div>
                <div style={{ fontSize: 11, color: modern.textMuted, marginTop: 1 }}>
                  {q.clientName ? `${q.clientName} · ` : ""}{q.tradePreset || q.quoteMode} · {formatDate(q.createdAt)} · {q.lineItemCount} line item{q.lineItemCount === 1 ? "" : "s"} · {q.inputCount} input{q.inputCount === 1 ? "" : "s"}
                </div>
              </div>
              <div style={{ fontSize: 13, fontWeight: 500, color: modern.text, minWidth: 90, textAlign: "right" }}>{display}</div>
              <span style={{ padding: "3px 10px", borderRadius: 6, fontSize: 10, fontWeight: 500, background: sb.bg, color: sb.text }}>{q.status}</span>
              <ChevronRight size={14} color={modern.textFaint} style={{ marginLeft: 4 }} />
            </div>
          );
        })}
      </div>

      {totalPages > 1 && (
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 4px", fontSize: 12, color: modern.textMuted }}>
          <span>Page {page} of {totalPages} · {total} total</span>
          <div style={{ display: "flex", gap: 6 }}>
            <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1}
              style={{ padding: "5px 10px", borderRadius: 6, border: `0.5px solid ${modern.border}`, background: modern.surface, cursor: page <= 1 ? "not-allowed" : "pointer", opacity: page <= 1 ? 0.5 : 1, fontSize: 12 }}>Prev</button>
            <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page >= totalPages}
              style={{ padding: "5px 10px", borderRadius: 6, border: `0.5px solid ${modern.border}`, background: modern.surface, cursor: page >= totalPages ? "not-allowed" : "pointer", opacity: page >= totalPages ? 0.5 : 1, fontSize: 12 }}>Next</button>
          </div>
        </div>
      )}

      <div style={{ fontSize: 11, color: modern.textMuted, marginTop: 10, padding: "0 4px" }}>
        Click any quote to see what was fed in, what the AI understood, and what came out.
      </div>
    </div>
  );
}

// ─── Quote inspector ───────────────────────────────────────────────────────
function QuoteDetail({ quoteId, orgName, onBack }: { quoteId: number; orgName: string; onBack: () => void }) {
  const { data, isLoading } = trpc.admin.getQuoteDetail.useQuery({ quoteId });

  if (isLoading || !data) {
    return (
      <div style={{ background: modern.surface, padding: 40, borderRadius: 12, textAlign: "center", color: modern.textMuted, fontSize: 13, border: `0.5px solid ${modern.border}` }}>
        Loading…
      </div>
    );
  }

  const q = (data as any).quote;
  const lineItems: any[] = (data as any).lineItems || [];
  const inputs: any[]    = (data as any).inputs || [];
  const orgSector: string | null = (data as any).orgSector;
  const hasSeedForSector: boolean = (data as any).hasSeedForSector;

  const sb = (() => {
    switch (q.status) {
      case "draft":    return { bg: "#f4f4f5", text: "#52525b", label: "Draft" };
      case "sent":     return { bg: "#f0fdfa", text: "#0f766e", label: "Sent" };
      case "accepted": return { bg: "#dcfce7", text: "#166534", label: "Accepted" };
      case "declined": return { bg: "#fee2e2", text: "#991b1b", label: "Declined" };
      default:         return { bg: "#f4f4f5", text: "#52525b", label: q.status };
    }
  })();

  const monthly = parseFloat(q.monthlyTotal || "0");
  const annual  = parseFloat(q.annualTotal  || "0");
  const oneOff  = parseFloat(q.total        || "0");
  let displayTotal = formatMoney(oneOff);
  if (monthly > 0) displayTotal = `${formatMoney(monthly)}/mo`;
  else if (annual > 0) displayTotal = `${formatMoney(annual)}/yr`;

  const cfg: any = q.comprehensiveConfig || {};
  const draftRows: Array<{ key: string; value: string }> = [];
  if (q.tradePreset)       draftRows.push({ key: "Sector",       value: String(q.tradePreset) });
  if (q.clientName)        draftRows.push({ key: "Customer",     value: q.clientName });
  if (q.contactName)       draftRows.push({ key: "Contact",      value: q.contactName });
  if (q.clientEmail)       draftRows.push({ key: "Client email", value: q.clientEmail });
  if (cfg.scope)           draftRows.push({ key: "Scope",        value: String(cfg.scope) });
  if (cfg.users)           draftRows.push({ key: "Users",        value: String(cfg.users) });
  if (cfg.coverage)        draftRows.push({ key: "Coverage",     value: String(cfg.coverage) });
  if (cfg.environment)     draftRows.push({ key: "Environment",  value: String(cfg.environment) });
  if (cfg.contractType)    draftRows.push({ key: "Contract",     value: String(cfg.contractType) });
  if (cfg.specialRequests) draftRows.push({ key: "Special",      value: String(cfg.specialRequests) });
  if (q.quoteMode)         draftRows.push({ key: "Mode",         value: q.quoteMode });

  const card: React.CSSProperties = { background: modern.surface, border: `0.5px solid ${modern.border}`, borderRadius: 12, padding: "16px 18px", marginBottom: 14 };
  const sectionLabel: React.CSSProperties = { fontSize: 11, color: modern.textMuted, fontWeight: 500, textTransform: "uppercase", letterSpacing: 0.05, marginBottom: 8, display: "flex", alignItems: "center", gap: 6 };

  return (
    <div>
      <button onClick={onBack}
        style={{ display: "flex", alignItems: "center", gap: 6, background: "transparent", border: "none", padding: 0, fontSize: 12, color: modern.textMuted, cursor: "pointer", marginBottom: 14, fontFamily: "inherit" }}>
        <ChevronLeft size={13} /> Back to {orgName}
      </button>

      <div style={{ marginBottom: 18 }}>
        <div style={{ fontSize: 18, fontWeight: 500, color: modern.text, letterSpacing: -0.3, marginBottom: 6 }}>
          {q.title || q.reference || `Quote #${q.id}`}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12, fontSize: 12, color: modern.textMuted, flexWrap: "wrap" }}>
          <span style={{ padding: "3px 10px", borderRadius: 6, fontSize: 11, fontWeight: 500, background: sb.bg, color: sb.text }}>{sb.label}</span>
          <span>{displayTotal}</span>
          <span>created {formatDate(q.createdAt)}</span>
          {q.sentAt && <span>sent {formatDate(q.sentAt)}</span>}
          {q.clientName && <span>· {q.clientName}</span>}
        </div>
      </div>

      <div style={sectionLabel}>Inputs <span style={{ color: modern.text, fontWeight: 500 }}>{inputs.length}</span></div>
      <div style={{ ...card, padding: 6 }}>
        {inputs.length === 0 ? (
          <div style={{ padding: 18, textAlign: "center", color: modern.textMuted, fontSize: 12 }}>No inputs recorded for this quote.</div>
        ) : inputs.map((inp) => <InputRow key={inp.id} input={inp} />)}
      </div>

      {(draftRows.length > 0 || q.userPrompt || q.processingInstructions) && (
        <>
          <div style={sectionLabel}>
            <Sparkles size={13} color="#7c3aed" /> AI draft summary
          </div>
          <div style={card}>
            {draftRows.length > 0 && (
              <div style={{ marginBottom: q.userPrompt || q.processingInstructions ? 12 : 0 }}>
                {draftRows.map((r) => (
                  <div key={r.key} style={{ display: "grid", gridTemplateColumns: "120px 1fr", padding: "6px 0", fontSize: 12, borderBottom: `0.5px solid ${modern.borderLight}` }}>
                    <div style={{ color: modern.textMuted }}>{r.key}</div>
                    <div style={{ color: modern.text, fontWeight: 500 }}>{r.value}</div>
                  </div>
                ))}
              </div>
            )}
            {q.userPrompt && (
              <div style={{ marginBottom: q.processingInstructions ? 10 : 0 }}>
                <div style={{ fontSize: 11, color: modern.textMuted, marginBottom: 4 }}>User prompt</div>
                <div style={{ fontSize: 12, color: modern.text, lineHeight: 1.5, whiteSpace: "pre-wrap", padding: 10, background: modern.borderLight, borderRadius: 8 }}>{q.userPrompt}</div>
              </div>
            )}
            {q.processingInstructions && (
              <div>
                <div style={{ fontSize: 11, color: modern.textMuted, marginBottom: 4 }}>Processing instructions</div>
                <div style={{ fontSize: 12, color: modern.text, lineHeight: 1.5, whiteSpace: "pre-wrap", padding: 10, background: modern.borderLight, borderRadius: 8 }}>{q.processingInstructions}</div>
              </div>
            )}
            <div style={{ marginTop: 10, paddingTop: 10, borderTop: `0.5px solid ${modern.borderLight}`, fontSize: 11, color: modern.textMuted, lineHeight: 1.5 }}>
              What the AI extracted from the inputs before generating line items. Most diagnostic block — if the line items look wrong, this is usually where the misread shows up.
            </div>
          </div>
        </>
      )}

      <div style={sectionLabel}>Output — line items <span style={{ color: modern.text, fontWeight: 500 }}>{lineItems.length}</span></div>
      <div style={{ ...card, padding: 0, overflow: "hidden" }}>
        {lineItems.length === 0 ? (
          <div style={{ padding: 24, textAlign: "center", color: modern.textMuted, fontSize: 12 }}>No line items.</div>
        ) : (
          <>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 80px 110px 90px 80px", gap: 10, padding: "9px 16px", background: modern.bg, borderBottom: `0.5px solid ${modern.borderLight}`, fontSize: 10, color: modern.textMuted, textTransform: "uppercase", letterSpacing: 0.05, fontWeight: 500 }}>
              <span>Item</span><span>Qty</span><span>Rate</span><span style={{ textAlign: "right" }}>Amount</span><span></span>
            </div>
            {lineItems.map((li) => (
              <div key={li.id} style={{ display: "grid", gridTemplateColumns: "1fr 80px 110px 90px 80px", gap: 10, padding: "10px 16px", borderBottom: `0.5px solid ${modern.borderLight}`, fontSize: 12, color: modern.text, alignItems: "center" }}>
                <span>
                  <div style={{ fontWeight: 500 }}>{li.itemName || li.description?.split("\n")[0] || "(no name)"}</div>
                  {li.itemName && li.description && li.description !== li.itemName && (
                    <div style={{ fontSize: 11, color: modern.textMuted, marginTop: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{li.description.split("\n")[0]}</div>
                  )}
                </span>
                <span style={{ color: modern.textMuted }}>{li.quantity} {li.unit !== "each" ? li.unit : ""}</span>
                <span style={{ color: modern.textMuted }}>{formatMoney(li.rate)}{li.pricingType === "monthly" ? "/mo" : li.pricingType === "annual" ? "/yr" : ""}</span>
                <span style={{ textAlign: "right", fontWeight: 500 }}>{formatMoney(li.total)}</span>
                <span><SourceBadge source={li.source} /></span>
              </div>
            ))}
            <div style={{ display: "flex", justifyContent: "flex-end", padding: "11px 16px", background: modern.bg, gap: 14 }}>
              <span style={{ fontSize: 12, fontWeight: 500, color: modern.textMuted }}>Total</span>
              <span style={{ fontSize: 13, fontWeight: 500, color: modern.text, minWidth: 90, textAlign: "right" }}>{displayTotal}</span>
            </div>
          </>
        )}
        {!hasSeedForSector && lineItems.length > 0 && (
          <div style={{ padding: "8px 16px", fontSize: 11, color: modern.textMuted, background: "#fffbeb", borderTop: `0.5px solid ${modern.borderLight}`, display: "flex", alignItems: "center", gap: 6 }}>
            <AlertTriangle size={11} color="#b45309" />
            No sector seed available{orgSector ? ` for "${orgSector}"` : ""} — source matching falls back to "added" / "adhoc" only.
          </div>
        )}
      </div>

      {(q.description || q.terms) && (
        <div style={{ display: "grid", gridTemplateColumns: q.description && q.terms ? "1fr 1fr" : "1fr", gap: 12 }}>
          {q.description && (
            <div>
              <div style={sectionLabel}>Output — description &amp; assumptions</div>
              <div style={{ ...card, fontSize: 12, color: modern.text, lineHeight: 1.55, whiteSpace: "pre-wrap" }}>{q.description}</div>
            </div>
          )}
          {q.terms && (
            <div>
              <div style={sectionLabel}>Output — terms</div>
              <div style={{ ...card, fontSize: 12, color: modern.text, lineHeight: 1.55, whiteSpace: "pre-wrap" }}>{q.terms}</div>
            </div>
          )}
        </div>
      )}
      {q.paymentTerms && (
        <div>
          <div style={sectionLabel}>Output — payment terms</div>
          <div style={{ ...card, fontSize: 12, color: modern.text, lineHeight: 1.55, whiteSpace: "pre-wrap" }}>{q.paymentTerms}</div>
        </div>
      )}
    </div>
  );
}

// ─── Single input row inside the QuoteDetail inputs section ──────────────
function InputRow({ input }: { input: any }) {
  const meta = (() => {
    switch (input.type) {
      case "audio":    return { icon: Mic,       bg: "#fef3c7", fg: "#b45309", label: "Voice" };
      case "image":    return { icon: ImageIcon, bg: "#dbeafe", fg: "#1d4ed8", label: "Photo" };
      case "pdf":      return { icon: FileType,  bg: "#fce7f3", fg: "#9d174d", label: "PDF" };
      case "document": return { icon: FileType,  bg: "#fce7f3", fg: "#9d174d", label: "Doc" };
      case "email":    return { icon: Mail,      bg: "#e0e7ff", fg: "#3730a3", label: "Email" };
      case "text":     return { icon: AlignLeft, bg: "#f4f4f5", fg: "#52525b", label: "Text" };
      default:         return { icon: AlignLeft, bg: "#f4f4f5", fg: "#52525b", label: input.type };
    }
  })();
  const Icon = meta.icon;

  const isText = input.type === "text" && !input.fileKey;
  const fileViewUrl = input.fileKey ? `/api/file/${encodeURIComponent(input.fileKey)}` : input.fileUrl || null;

  return (
    <div style={{ display: "flex", alignItems: "center", padding: "9px 10px", borderRadius: 8, gap: 11 }}>
      <div style={{ width: 32, height: 32, borderRadius: 8, background: meta.bg, color: meta.fg, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
        <Icon size={15} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12, fontWeight: 500, color: modern.text }}>
          {isText ? `${meta.label} note` : (input.filename || `${meta.label} #${input.id}`)}
        </div>
        <div style={{ fontSize: 11, color: modern.textMuted, marginTop: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {isText && input.content
            ? `"${input.content.slice(0, 120)}${input.content.length > 120 ? "…" : ""}"`
            : <>{input.processingStatus === "completed" ? "processed" : input.processingStatus || "pending"}{input.mimeType ? ` · ${input.mimeType}` : ""}{" · "}{formatDate(input.createdAt)}</>
          }
        </div>
      </div>
      {fileViewUrl && (
        <a href={fileViewUrl} target="_blank" rel="noopener noreferrer"
          style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "5px 11px", fontSize: 11, color: modern.text, background: "transparent", border: `0.5px solid ${modern.border}`, borderRadius: 7, textDecoration: "none" }}>
          <ExternalLink size={11} /> View
        </a>
      )}
    </div>
  );
}

// ─── Org catalog tab — diff vs sector seed ────────────────────────────────
function OrgCatalog({ orgId }: { orgId: number }) {
  const [filter, setFilter] = useState<"customised" | "all" | "stock">("customised");
  const { data, isLoading } = trpc.admin.getOrgCatalog.useQuery({ orgId });

  if (isLoading || !data) {
    return (
      <div style={{ background: modern.surface, padding: 40, borderRadius: 12, textAlign: "center", color: modern.textMuted, fontSize: 13, border: `0.5px solid ${modern.border}` }}>
        Loading…
      </div>
    );
  }

  const items: any[] = (data as any).items || [];
  const stats = (data as any).stats || { total: 0, stock: 0, modified: 0, added: 0, disabled: 0 };
  const orgSector: string | null = (data as any).sector;
  const hasSeed: boolean = (data as any).hasSeedForSector;

  const modified = items.filter((i) => i.status === "modified");
  const added    = items.filter((i) => i.status === "added");
  const disabled = items.filter((i) => i.status === "disabled");
  const stock    = items.filter((i) => i.status === "stock");

  const showModified = filter !== "stock";
  const showAdded    = filter !== "stock";
  const showDisabled = filter !== "stock";
  const showStock    = filter === "all" || filter === "stock";

  const card: React.CSSProperties = { background: modern.surface, border: `0.5px solid ${modern.border}`, borderRadius: 10, padding: "10px 14px" };

  return (
    <div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 8, marginBottom: 14 }}>
        <div style={card}>
          <div style={{ fontSize: 11, color: modern.textMuted, marginBottom: 3 }}>Total</div>
          <div style={{ fontSize: 18, fontWeight: 500, color: modern.text }}>{stats.total}</div>
        </div>
        <div style={card}>
          <div style={{ fontSize: 11, color: modern.textMuted, marginBottom: 3 }}>Stock</div>
          <div style={{ fontSize: 18, fontWeight: 500, color: modern.text }}>{stats.stock}</div>
        </div>
        <div style={{ ...card, border: `0.5px solid ${modern.modified.border}` }}>
          <div style={{ fontSize: 11, color: modern.modified.text, fontWeight: 500, marginBottom: 3 }}>Modified</div>
          <div style={{ fontSize: 18, fontWeight: 500, color: modern.modified.strong }}>{stats.modified}</div>
        </div>
        <div style={{ ...card, border: `0.5px solid ${modern.added.border}` }}>
          <div style={{ fontSize: 11, color: modern.added.text, fontWeight: 500, marginBottom: 3 }}>Added</div>
          <div style={{ fontSize: 18, fontWeight: 500, color: modern.added.strong }}>{stats.added}</div>
        </div>
        <div style={card}>
          <div style={{ fontSize: 11, color: modern.textMuted, fontWeight: 500, marginBottom: 3, textDecoration: "line-through" }}>Disabled</div>
          <div style={{ fontSize: 18, fontWeight: 500, color: modern.textFaint }}>{stats.disabled}</div>
        </div>
      </div>

      <div style={{ display: "flex", gap: 6, marginBottom: 14 }}>
        {([
          { id: "customised" as const, label: "Customised" },
          { id: "all"        as const, label: `All ${stats.total}` },
          { id: "stock"      as const, label: "Stock only" },
        ]).map((c) => {
          const active = filter === c.id;
          return (
            <button key={c.id} onClick={() => setFilter(c.id)}
              style={{ padding: "5px 11px", fontSize: 11, fontWeight: active ? 500 : 400, background: active ? "#0a0a0a" : "transparent", color: active ? "#fff" : modern.textMuted, border: active ? "none" : `0.5px solid ${modern.border}`, borderRadius: 7, cursor: "pointer", fontFamily: "inherit" }}>
              {c.label}
            </button>
          );
        })}
      </div>

      {!hasSeed && (
        <div style={{ padding: "10px 14px", marginBottom: 14, fontSize: 12, lineHeight: 1.5, background: "#fffbeb", border: "0.5px solid #fde68a", borderRadius: 8, color: "#92400e", display: "flex", alignItems: "flex-start", gap: 8 }}>
          <AlertTriangle size={14} style={{ flexShrink: 0, marginTop: 1 }} />
          <span>No sector seed available{orgSector ? ` for "${orgSector}"` : ""} — every item shows as "Added" since there's nothing to diff against. Configure the org's owner with a `defaultTradeSector` matching a seed key (it_services / commercial_cleaning / website_marketing / pest_control) to enable proper diffing.</span>
        </div>
      )}

      {showModified && modified.length > 0 && (
        <>
          <div style={{ fontSize: 10, color: modern.modified.text, textTransform: "uppercase", letterSpacing: 0.05, fontWeight: 500, marginBottom: 6, paddingLeft: 2 }}>Modified · {modified.length}</div>
          <div style={{ background: modern.surface, border: `0.5px solid ${modern.modified.border}`, borderRadius: 10, overflow: "hidden", marginBottom: 14 }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 130px 130px 80px", gap: 10, padding: "9px 14px", background: "#fffbeb", borderBottom: `0.5px solid ${modern.modified.border}`, fontSize: 10, color: modern.modified.text, textTransform: "uppercase", letterSpacing: 0.05, fontWeight: 500 }}>
              <span>Item</span><span>Stock value</span><span>Customer's value</span><span style={{ textAlign: "right" }}>Changed</span>
            </div>
            {modified.map((item) => (
              <div key={item.id} style={{ display: "grid", gridTemplateColumns: "1fr 130px 130px 80px", gap: 10, padding: "10px 14px", borderBottom: `0.5px solid #fef3c7`, fontSize: 12, color: modern.text }}>
                <span>
                  <div style={{ fontWeight: 500 }}>{item.name}</div>
                  {item.category && <div style={{ fontSize: 11, color: modern.textMuted, marginTop: 1 }}>{item.category}</div>}
                </span>
                <span style={{ color: modern.textMuted, textDecoration: "line-through" }}>{formatMoney(item.seedValue?.defaultRate)}{item.pricingType === "monthly" ? "/mo" : item.pricingType === "annual" ? "/yr" : ""}</span>
                <span style={{ color: modern.text, fontWeight: 500 }}>{formatMoney(item.defaultRate)}{item.pricingType === "monthly" ? "/mo" : item.pricingType === "annual" ? "/yr" : ""}</span>
                <span style={{ textAlign: "right", color: modern.textMuted, fontSize: 11 }}>{timeAgo(item.updatedAt)}</span>
              </div>
            ))}
          </div>
        </>
      )}

      {showAdded && added.length > 0 && (
        <>
          <div style={{ fontSize: 10, color: modern.added.strong, textTransform: "uppercase", letterSpacing: 0.05, fontWeight: 500, marginBottom: 6, paddingLeft: 2 }}>Added · {added.length}</div>
          <div style={{ background: modern.surface, border: `0.5px solid ${modern.added.border}`, borderRadius: 10, overflow: "hidden", marginBottom: 14 }}>
            {added.map((item) => (
              <div key={item.id} style={{ display: "grid", gridTemplateColumns: "1fr 130px 80px", gap: 10, padding: "10px 14px", borderBottom: `0.5px solid #dcfce7`, fontSize: 12, color: modern.text }}>
                <div>
                  <span style={{ fontWeight: 500 }}>{item.name}</span>
                  {item.description && <div style={{ fontSize: 11, color: modern.textMuted, marginTop: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.description}</div>}
                </div>
                <span style={{ color: modern.text, fontWeight: 500 }}>{formatMoney(item.defaultRate)}{item.pricingType === "monthly" ? "/mo" : item.pricingType === "annual" ? "/yr" : ""}</span>
                <span style={{ textAlign: "right", color: modern.textMuted, fontSize: 11 }}>{timeAgo(item.createdAt)}</span>
              </div>
            ))}
          </div>
        </>
      )}

      {showDisabled && disabled.length > 0 && (
        <>
          <div style={{ fontSize: 10, color: modern.textMuted, textTransform: "uppercase", letterSpacing: 0.05, fontWeight: 500, marginBottom: 6, paddingLeft: 2 }}>Disabled · {disabled.length}</div>
          <div style={{ background: modern.surface, border: `0.5px solid ${modern.border}`, borderRadius: 10, padding: 0, marginBottom: 14, opacity: 0.7 }}>
            {disabled.map((item) => (
              <div key={item.id} style={{ display: "grid", gridTemplateColumns: "1fr 130px 80px", gap: 10, padding: "10px 14px", fontSize: 12, color: modern.textMuted, alignItems: "center", borderBottom: `0.5px solid ${modern.borderLight}` }}>
                <span style={{ textDecoration: "line-through" }}>{item.name}</span>
                <span style={{ textDecoration: "line-through" }}>{formatMoney(item.defaultRate)}</span>
                <span style={{ textAlign: "right", fontSize: 11 }}>{timeAgo(item.updatedAt)}</span>
              </div>
            ))}
          </div>
        </>
      )}

      {!showStock && stock.length > 0 && (
        <button onClick={() => setFilter("all")}
          style={{ width: "100%", padding: 10, fontSize: 12, color: modern.textMuted, background: "transparent", border: `0.5px dashed ${modern.border}`, borderRadius: 10, cursor: "pointer", fontFamily: "inherit" }}>
          Show {stock.length} stock items (untouched from defaults)
        </button>
      )}

      {showStock && stock.length > 0 && (
        <>
          <div style={{ fontSize: 10, color: modern.textMuted, textTransform: "uppercase", letterSpacing: 0.05, fontWeight: 500, marginBottom: 6, paddingLeft: 2 }}>Stock · {stock.length}</div>
          <div style={{ background: modern.surface, border: `0.5px solid ${modern.border}`, borderRadius: 10, overflow: "hidden" }}>
            {stock.map((item) => (
              <div key={item.id} style={{ display: "grid", gridTemplateColumns: "1fr 130px", gap: 10, padding: "9px 14px", borderBottom: `0.5px solid ${modern.borderLight}`, fontSize: 12, color: modern.text }}>
                <span>
                  {item.name}
                  {item.category && <span style={{ marginLeft: 8, fontSize: 11, color: modern.textMuted }}>· {item.category}</span>}
                </span>
                <span style={{ color: modern.textMuted }}>{formatMoney(item.defaultRate)}{item.pricingType === "monthly" ? "/mo" : item.pricingType === "annual" ? "/yr" : ""}</span>
              </div>
            ))}
          </div>
        </>
      )}

      {items.length === 0 && (
        <div style={{ background: modern.surface, padding: 40, borderRadius: 12, textAlign: "center", color: modern.textMuted, fontSize: 13, border: `0.5px solid ${modern.border}` }}>
          <Layers size={26} style={{ opacity: 0.3, marginBottom: 8 }} />
          <div>No catalog items for this organisation yet.</div>
        </div>
      )}
    </div>
  );
}

// ─── Support thread list ──────────────────────────────────────────────────
function threadStatusBadge(status: string): { label: string; bg: string; text: string } {
  switch (status) {
    case "open":      return { label: "Open",      bg: "#f0fdfa", text: "#0f766e" };
    case "escalated": return { label: "Escalated", bg: "#fef3c7", text: "#92400e" };
    case "resolved":  return { label: "Resolved",  bg: "#dcfce7", text: "#166534" };
    default:          return { label: status,      bg: "#f1f5f9", text: "#475569" };
  }
}

function SupportThreadList({ onSelectThread }: { onSelectThread: (id: number) => void }) {
  const [statusFilter, setStatusFilter] = useState<"all" | "open" | "escalated" | "resolved">("all");
  const [page, setPage] = useState(1);

  const { data, isLoading } = trpc.admin.listSupportThreads.useQuery({ status: statusFilter, page, limit: 50 });

  const threads = (data?.threads || []) as any[];
  const total = data?.total || 0;
  const totalPages = Math.max(1, Math.ceil(total / 50));

  return (
    <div style={{ background: modern.surface, border: `0.5px solid ${modern.border}`, borderRadius: 12, overflow: "hidden" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 16px", borderBottom: `0.5px solid ${modern.border}` }}>
        <div style={{ display: "flex", gap: 6 }}>
          {(["all", "open", "escalated", "resolved"] as const).map((s) => {
            const active = statusFilter === s;
            return (
              <button key={s} onClick={() => { setStatusFilter(s); setPage(1); }}
                style={{ padding: "5px 11px", fontSize: 11, fontWeight: active ? 500 : 400, borderRadius: 7, background: active ? "#0a0a0a" : "transparent", color: active ? "#fff" : modern.textMuted, border: active ? "none" : `0.5px solid ${modern.border}`, cursor: "pointer", textTransform: "capitalize", fontFamily: "inherit" }}>
                {s === "all" ? "All" : s}
              </button>
            );
          })}
        </div>
        <div style={{ fontSize: 12, color: modern.textMuted }}>{total} thread{total === 1 ? "" : "s"}</div>
      </div>

      {isLoading ? (
        <div style={{ padding: 40, textAlign: "center", color: modern.textMuted, fontSize: 13 }}>Loading…</div>
      ) : threads.length === 0 ? (
        <div style={{ padding: 40, textAlign: "center", color: modern.textMuted, fontSize: 13 }}>
          <MessageSquare size={26} style={{ opacity: 0.3, marginBottom: 8 }} />
          <div>No conversations {statusFilter !== "all" ? `with status "${statusFilter}"` : "yet"}.</div>
        </div>
      ) : threads.map((t) => {
        const badge = threadStatusBadge(t.status);
        return (
          <div key={t.id} role="button" tabIndex={0}
            onClick={() => onSelectThread(t.id)}
            onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") onSelectThread(t.id); }}
            style={{ display: "grid", gridTemplateColumns: "1fr 90px 80px 60px 1fr 90px", gap: 12, padding: "11px 16px", borderBottom: `0.5px solid ${modern.borderLight}`, cursor: "pointer", alignItems: "center", transition: "background 0.12s" }}
            onMouseEnter={(e) => (e.currentTarget.style.background = modern.borderLight)}
            onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 500, color: modern.text }}>{t.userName || t.userEmail || "—"}</div>
              <div style={{ fontSize: 11, color: modern.textMuted }}>{t.orgCompanyName || t.orgName || "—"}</div>
            </div>
            <span style={{ padding: "3px 10px", borderRadius: 999, fontSize: 11, fontWeight: 500, background: badge.bg, color: badge.text, justifySelf: "start" }}>{badge.label}</span>
            <span style={{ fontSize: 12, color: modern.textMuted, textTransform: "capitalize" }}>{t.orgTier || "—"}</span>
            <span style={{ fontSize: 12, color: modern.textMuted, textAlign: "center" }}>{t.messageCount}</span>
            <span style={{ fontSize: 12, color: modern.textMuted, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.lastMessagePreview || "—"}</span>
            <span style={{ fontSize: 11, color: modern.textMuted, textAlign: "right" }}>{timeAgo(t.updatedAt)}</span>
          </div>
        );
      })}

      {totalPages > 1 && (
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 16px", borderTop: `0.5px solid ${modern.border}`, fontSize: 12, color: modern.textMuted }}>
          <span>Page {page} of {totalPages}</span>
          <div style={{ display: "flex", gap: 6 }}>
            <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1}
              style={{ padding: "4px 10px", borderRadius: 6, border: `0.5px solid ${modern.border}`, background: modern.surface, cursor: page <= 1 ? "not-allowed" : "pointer", opacity: page <= 1 ? 0.5 : 1, fontSize: 12 }}>Prev</button>
            <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page >= totalPages}
              style={{ padding: "4px 10px", borderRadius: 6, border: `0.5px solid ${modern.border}`, background: modern.surface, cursor: page >= totalPages ? "not-allowed" : "pointer", opacity: page >= totalPages ? 0.5 : 1, fontSize: 12 }}>Next</button>
          </div>
        </div>
      )}
    </div>
  );
}

function SupportThreadDetail({ threadId, onBack }: { threadId: number; onBack: () => void }) {
  const { data, isLoading, refetch } = trpc.admin.getSupportThread.useQuery({ threadId });
  const utils = trpc.useUtils();
  const resolveMut = trpc.admin.markSupportThreadResolved.useMutation({
    onSuccess: () => { refetch(); utils.admin.listSupportThreads.invalidate(); },
  });

  if (isLoading || !data) {
    return (
      <div style={{ background: modern.surface, padding: 40, borderRadius: 12, textAlign: "center", color: modern.textMuted, fontSize: 13, border: `0.5px solid ${modern.border}` }}>
        Loading…
      </div>
    );
  }

  const t = data.thread as any;
  const messages = data.messages as any[];
  const badge = threadStatusBadge(t.status);
  const isResolved = t.status === "resolved";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <button onClick={onBack}
        style={{ alignSelf: "flex-start", display: "flex", alignItems: "center", gap: 6, padding: 0, fontSize: 12, fontWeight: 400, background: "transparent", border: "none", color: modern.textMuted, cursor: "pointer", fontFamily: "inherit" }}>
        <ChevronLeft size={13} /> Back to conversations
      </button>

      <div style={{ background: modern.surface, padding: 18, borderRadius: 12, border: `0.5px solid ${modern.border}` }}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16, marginBottom: 14 }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
              <h2 style={{ fontSize: 17, fontWeight: 500, color: modern.text, margin: 0, letterSpacing: -0.2 }}>Thread #{t.id}</h2>
              <span style={{ padding: "3px 10px", fontSize: 11, fontWeight: 500, background: badge.bg, color: badge.text, borderRadius: 999 }}>{badge.label}</span>
            </div>
            <div style={{ fontSize: 12, color: modern.textMuted }}>
              Started {formatDateTime(t.createdAt)} · last update {timeAgo(t.updatedAt)}
            </div>
          </div>
          <button onClick={() => resolveMut.mutate({ threadId: t.id, resolved: !isResolved })} disabled={resolveMut.isPending}
            style={{ padding: "8px 14px", fontSize: 12, fontWeight: 500, borderRadius: 7, background: isResolved ? modern.surface : "#0a0a0a", color: isResolved ? modern.text : "#fff", border: isResolved ? `0.5px solid ${modern.border}` : "none", cursor: "pointer", display: "flex", alignItems: "center", gap: 6 }}>
            {isResolved ? <RotateCcw size={13} /> : <CheckCircle2 size={13} />}
            {isResolved ? "Re-open" : "Mark resolved"}
          </button>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 10, fontSize: 12 }}>
          <ContextField label="User">{t.userName || "—"}</ContextField>
          <ContextField label="User email">
            {t.userEmail ? <a href={`mailto:${t.userEmail}`} style={{ color: "#0d9488" }}>{t.userEmail}</a> : "—"}
          </ContextField>
          <ContextField label="Org">{t.orgCompanyName || t.orgName || "—"}</ContextField>
          <ContextField label="Plan">{t.orgTier || "—"}</ContextField>
          <ContextField label="Sector">{t.userSector || "—"}</ContextField>
          <ContextField label="Started on">{t.startPagePath || "—"}</ContextField>
          <ContextField label="Last on">{t.lastPagePath || "—"}</ContextField>
        </div>

        {t.status !== "open" && t.escalationContactName && (
          <div style={{ marginTop: 14, padding: 12, borderRadius: 8, background: "#f0fdfa", border: "0.5px solid #99f6e4" }}>
            <div style={{ fontSize: 10, fontWeight: 500, color: "#0d9488", textTransform: "uppercase", letterSpacing: 0.05, marginBottom: 8 }}>
              Escalation contact (captured {formatDateTime(t.escalatedAt)})
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 8, fontSize: 12 }}>
              <ContextField label="Name">{t.escalationContactName || "—"}</ContextField>
              <ContextField label="Business">{t.escalationBusinessName || "—"}</ContextField>
              <ContextField label="Email">
                {t.escalationEmail ? <a href={`mailto:${t.escalationEmail}`} style={{ color: "#0d9488" }}>{t.escalationEmail}</a> : "—"}
              </ContextField>
              <ContextField label="Phone">{t.escalationPhone || "—"}</ContextField>
            </div>
            {t.summary && (
              <div style={{ marginTop: 10, fontSize: 12, color: modern.text }}>
                <strong style={{ fontWeight: 500 }}>Summary: </strong>{t.summary}
              </div>
            )}
          </div>
        )}
      </div>

      <div style={{ background: modern.surface, padding: 18, borderRadius: 12, border: `0.5px solid ${modern.border}` }}>
        <h3 style={{ fontSize: 13, fontWeight: 500, color: modern.text, margin: "0 0 10px" }}>
          Transcript ({messages.length} message{messages.length === 1 ? "" : "s"})
        </h3>
        {messages.length === 0 ? (
          <div style={{ color: modern.textMuted, fontSize: 12 }}>No messages yet.</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {messages.map((m) => (
              <div key={m.id} style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <div style={{ fontSize: 11, color: modern.textMuted }}>
                  <strong style={{ color: m.role === "user" ? modern.text : "#0d9488", fontWeight: 500 }}>
                    {m.role === "user" ? "User" : "Bot"}
                  </strong>
                  {" · "}{formatDateTime(m.createdAt)}
                  {m.helpful === true && <span style={{ marginLeft: 8, color: "#0d9488" }}>· marked helpful</span>}
                </div>
                <div style={{
                  padding: "10px 14px", borderRadius: 8,
                  background: m.role === "user" ? "#f0fdfa" : modern.borderLight,
                  border: `0.5px solid ${m.role === "user" ? "#99f6e4" : modern.border}`,
                  color: modern.text, fontSize: 12, lineHeight: 1.5, whiteSpace: "pre-wrap",
                }}>
                  {m.content}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function ContextField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div style={{ fontSize: 10, color: modern.textMuted, marginBottom: 2, textTransform: "uppercase", letterSpacing: 0.05 }}>{label}</div>
      <div style={{ color: modern.text, fontSize: 12 }}>{children}</div>
    </div>
  );
}

// ─── Root component ─────────────────────────────────────────────────────────
export default function AdminPanel() {
  const { user, loading } = useAuth();
  const [selectedOrgId, setSelectedOrgId]       = useState<number | null>(null);
  const [activeView, setActiveView]             = useState<"orgs" | "conversations">("orgs");
  const [selectedThreadId, setSelectedThreadId] = useState<number | null>(null);

  const { data: stats } = trpc.admin.platformStats.useQuery(undefined, {
    enabled: !!(user && (user as any).role === "admin"),
  });

  if (loading) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: modern.bg, color: modern.textMuted, fontSize: 13 }}>
        Loading…
      </div>
    );
  }

  if (!user || (user as any).role !== "admin") {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: modern.bg }}>
        <div style={{ background: modern.surface, padding: 40, borderRadius: 12, textAlign: "center", border: `0.5px solid ${modern.border}`, maxWidth: 400 }}>
          <Shield size={36} color="#dc2626" style={{ marginBottom: 14 }} />
          <h2 style={{ fontSize: 17, fontWeight: 500, color: modern.text, marginBottom: 6 }}>Access denied</h2>
          <p style={{ fontSize: 13, color: modern.textMuted, margin: 0 }}>You do not have permission to view this page.</p>
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100vh", background: modern.bg, padding: "20px 28px" }}>
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ fontSize: 19, fontWeight: 500, color: modern.text, margin: 0, letterSpacing: -0.3 }}>Admin</h1>
        <p style={{ fontSize: 12, color: modern.textMuted, margin: "3px 0 0" }}>
          Manage organisations, users, and support · signed in as {(user as any).email}
        </p>
      </div>

      <PlatformStats stats={stats} />

      <div style={{ display: "flex", gap: 0, marginBottom: 16, borderBottom: `0.5px solid ${modern.border}` }}>
        {([
          { id: "orgs"          as const, label: "Organisations" },
          { id: "conversations" as const, label: "Conversations" },
        ]).map((tab) => {
          const active = activeView === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => { setActiveView(tab.id); setSelectedOrgId(null); setSelectedThreadId(null); }}
              style={{
                padding: "9px 16px", fontSize: 12,
                fontWeight: active ? 500 : 400,
                color: active ? modern.text : modern.textMuted,
                background: "transparent", border: "none",
                borderBottom: `2px solid ${active ? modern.text : "transparent"}`,
                cursor: "pointer", marginBottom: -1, fontFamily: "inherit",
              }}
            >{tab.label}</button>
          );
        })}
      </div>

      {activeView === "orgs" ? (
        selectedOrgId ? (
          <OrgDetail orgId={selectedOrgId} onBack={() => setSelectedOrgId(null)} />
        ) : (
          <OrgList onSelectOrg={setSelectedOrgId} />
        )
      ) : selectedThreadId ? (
        <SupportThreadDetail threadId={selectedThreadId} onBack={() => setSelectedThreadId(null)} />
      ) : (
        <SupportThreadList onSelectThread={setSelectedThreadId} />
      )}
    </div>
  );
}
