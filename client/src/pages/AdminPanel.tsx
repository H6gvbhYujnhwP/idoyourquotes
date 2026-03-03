/**
 * Admin Panel — Platform Administration
 * 
 * Obscured URL: /manage-7k9x2m4q8r
 * Double-gated: client-side role check + server-side adminProcedure
 * 
 * Features:
 * - Platform stats (total users, orgs, quotes by tier)
 * - Org listing with search, pagination
 * - Org detail: members, quotes, billing info
 * - Actions: reset password, extend trial, change quota
 */
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { brand } from "@/lib/brandTheme";
import { useState } from "react";
import {
  Search, Users, Building2, FileText, ChevronLeft, RotateCcw,
  Shield, Clock, Hash, Eye, Calendar, Mail, ArrowUpDown,
} from "lucide-react";

// ─── Helpers ──────────────────────────────────────────────

function formatDate(d: string | Date | null | undefined): string {
  if (!d) return "—";
  const date = new Date(d);
  return date.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

function formatDateTime(d: string | Date | null | undefined): string {
  if (!d) return "—";
  const date = new Date(d);
  return date.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
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

function tierColor(tier: string): string {
  switch (tier) {
    case "solo": return "#3b82f6";
    case "pro": return "#8b5cf6";
    case "team": return "#f59e0b";
    case "business": return "#ef4444";
    default: return brand.teal;
  }
}

function statusBadge(status: string, cancelAtPeriodEnd?: boolean): { label: string; bg: string; text: string } {
  if (cancelAtPeriodEnd && status === "active") return { label: "Cancelling", bg: "#fef3c7", text: "#92400e" };
  switch (status) {
    case "active": return { label: "Active", bg: "#dcfce7", text: "#166534" };
    case "trialing": return { label: "Trial", bg: brand.tealBg, text: "#065f46" };
    case "past_due": return { label: "Past Due", bg: "#fef3c7", text: "#92400e" };
    case "canceled": return { label: "Cancelled", bg: "#fee2e2", text: "#991b1b" };
    case "unpaid": return { label: "Unpaid", bg: "#fee2e2", text: "#991b1b" };
    default: return { label: status, bg: "#f1f5f9", text: "#475569" };
  }
}

// ─── Platform Stats Bar ──────────────────────────────────

function StatsBar({ stats }: { stats: any }) {
  if (!stats) return null;
  const statItems = [
    { label: "Organisations", value: stats.totalOrgs, icon: Building2 },
    { label: "Users", value: stats.totalUsers, icon: Users },
    { label: "Total Quotes", value: stats.totalQuotes, icon: FileText },
  ];

  const tierItems = Object.entries(stats.tierCounts || {}).map(([tier, count]) => ({
    label: tier.charAt(0).toUpperCase() + tier.slice(1),
    count: count as number,
    color: tierColor(tier),
  }));

  return (
    <div style={{ display: "flex", gap: 16, flexWrap: "wrap", marginBottom: 24 }}>
      {statItems.map((s) => (
        <div key={s.label} style={{
          background: "white", border: `1px solid ${brand.border}`, borderRadius: 10,
          padding: "16px 24px", minWidth: 140, flex: 1,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
            <s.icon size={16} color={brand.navyMuted} />
            <span style={{ fontSize: 12, color: brand.navyMuted, fontWeight: 500 }}>{s.label}</span>
          </div>
          <div style={{ fontSize: 28, fontWeight: 700, color: brand.navy }}>{s.value.toLocaleString()}</div>
        </div>
      ))}
      <div style={{
        background: "white", border: `1px solid ${brand.border}`, borderRadius: 10,
        padding: "16px 24px", minWidth: 200, flex: 1,
      }}>
        <div style={{ fontSize: 12, color: brand.navyMuted, fontWeight: 500, marginBottom: 8 }}>By Tier</div>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          {tierItems.map(t => (
            <div key={t.label} style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <div style={{ width: 8, height: 8, borderRadius: "50%", background: t.color }} />
              <span style={{ fontSize: 13, color: brand.navy, fontWeight: 600 }}>{t.count}</span>
              <span style={{ fontSize: 12, color: brand.navyMuted }}>{t.label}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Org List View ───────────────────────────────────────

function OrgList({ onSelectOrg }: { onSelectOrg: (id: number) => void }) {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);

  const { data, isLoading } = trpc.admin.listOrganizations.useQuery(
    { search: search || undefined, page, limit: 50 },
    { keepPreviousData: true }
  );

  const orgs = data?.orgs || [];
  const total = data?.total || 0;
  const totalPages = Math.ceil(total / 50);

  return (
    <div>
      {/* Search */}
      <div style={{ position: "relative", marginBottom: 16 }}>
        <Search size={16} style={{ position: "absolute", left: 12, top: 11, color: brand.navyMuted }} />
        <input
          type="text"
          placeholder="Search by org name, company, email..."
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          style={{
            width: "100%", padding: "10px 12px 10px 36px", borderRadius: 8,
            border: `1px solid ${brand.border}`, fontSize: 14, outline: "none",
            background: "white", color: brand.navy,
          }}
          onFocus={(e) => e.target.style.borderColor = brand.teal}
          onBlur={(e) => e.target.style.borderColor = brand.border}
        />
      </div>

      {/* Table */}
      <div style={{ background: "white", borderRadius: 10, border: `1px solid ${brand.border}`, overflow: "hidden" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr style={{ background: "#f8fafc" }}>
              {["Organisation", "Owner", "Tier", "Status", "Quotes", "Members", "Created", "Last Active", ""].map(h => (
                <th key={h} style={{
                  padding: "10px 14px", textAlign: "left", fontWeight: 600,
                  color: brand.navyMuted, fontSize: 11, textTransform: "uppercase", letterSpacing: 0.5,
                  borderBottom: `1px solid ${brand.border}`,
                }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr><td colSpan={9} style={{ padding: 40, textAlign: "center", color: brand.navyMuted }}>Loading...</td></tr>
            ) : orgs.length === 0 ? (
              <tr><td colSpan={9} style={{ padding: 40, textAlign: "center", color: brand.navyMuted }}>No organisations found</td></tr>
            ) : orgs.map((org: any) => {
              const badge = statusBadge(org.status, org.cancelAtPeriodEnd);
              return (
                <tr key={org.id} style={{ borderBottom: `1px solid ${brand.borderLight}`, cursor: "pointer" }}
                  onClick={() => onSelectOrg(org.id)}
                  onMouseEnter={(e) => (e.currentTarget.style.background = "#f8fafc")}
                  onMouseLeave={(e) => (e.currentTarget.style.background = "white")}
                >
                  <td style={{ padding: "12px 14px" }}>
                    <div style={{ fontWeight: 600, color: brand.navy }}>{org.companyName || org.name}</div>
                    <div style={{ fontSize: 11, color: brand.navyMuted }}>{org.slug}</div>
                  </td>
                  <td style={{ padding: "12px 14px" }}>
                    <div style={{ color: brand.navy }}>{org.owner?.name || "—"}</div>
                    <div style={{ fontSize: 11, color: brand.navyMuted }}>{org.owner?.email || "—"}</div>
                  </td>
                  <td style={{ padding: "12px 14px" }}>
                    <span style={{
                      display: "inline-block", padding: "2px 8px", borderRadius: 4, fontSize: 11,
                      fontWeight: 700, color: "white", background: tierColor(org.tier),
                      textTransform: "uppercase",
                    }}>{org.tier}</span>
                  </td>
                  <td style={{ padding: "12px 14px" }}>
                    <span style={{
                      display: "inline-block", padding: "2px 8px", borderRadius: 4, fontSize: 11,
                      fontWeight: 600, color: badge.text, background: badge.bg,
                    }}>{badge.label}</span>
                  </td>
                  <td style={{ padding: "12px 14px", color: brand.navy, fontWeight: 600 }}>
                    {org.totalQuotes}
                    <span style={{ fontWeight: 400, color: brand.navyMuted, fontSize: 11 }}> / {org.maxQuotesPerMonth === -1 ? "∞" : `${org.monthlyQuoteCount}mo`}</span>
                  </td>
                  <td style={{ padding: "12px 14px", color: brand.navy }}>{org.memberCount}</td>
                  <td style={{ padding: "12px 14px", color: brand.navyMuted, fontSize: 12 }}>{formatDate(org.createdAt)}</td>
                  <td style={{ padding: "12px 14px", color: brand.navyMuted, fontSize: 12 }}>{timeAgo(org.owner?.lastSignedIn)}</td>
                  <td style={{ padding: "12px 14px" }}>
                    <Eye size={14} color={brand.teal} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div style={{ display: "flex", justifyContent: "center", gap: 8, marginTop: 16 }}>
          <button
            disabled={page <= 1}
            onClick={() => setPage(p => Math.max(1, p - 1))}
            style={{
              padding: "6px 14px", borderRadius: 6, border: `1px solid ${brand.border}`,
              background: "white", cursor: page <= 1 ? "default" : "pointer", opacity: page <= 1 ? 0.4 : 1,
              fontSize: 13, color: brand.navy,
            }}
          >Previous</button>
          <span style={{ padding: "6px 14px", fontSize: 13, color: brand.navyMuted }}>
            Page {page} of {totalPages} ({total} total)
          </span>
          <button
            disabled={page >= totalPages}
            onClick={() => setPage(p => p + 1)}
            style={{
              padding: "6px 14px", borderRadius: 6, border: `1px solid ${brand.border}`,
              background: "white", cursor: page >= totalPages ? "default" : "pointer",
              opacity: page >= totalPages ? 0.4 : 1, fontSize: 13, color: brand.navy,
            }}
          >Next</button>
        </div>
      )}
    </div>
  );
}

// ─── Org Detail View ─────────────────────────────────────

function OrgDetail({ orgId, onBack }: { orgId: number; onBack: () => void }) {
  const utils = trpc.useUtils();
  const { data: org, isLoading, refetch } = trpc.admin.getOrganizationDetail.useQuery({ orgId });

  // Password reset state
  const [resetUserId, setResetUserId] = useState<number | null>(null);
  const [newPassword, setNewPassword] = useState("");
  const [pwResult, setPwResult] = useState<string | null>(null);

  // Trial extension state
  const [trialDate, setTrialDate] = useState("");
  const [trialResult, setTrialResult] = useState<string | null>(null);

  // Quota state
  const [quotaValue, setQuotaValue] = useState("");
  const [quotaResult, setQuotaResult] = useState<string | null>(null);

  const resetPasswordMut = trpc.admin.resetUserPassword.useMutation({
    onSuccess: () => { setPwResult("Password reset successfully"); setNewPassword(""); setResetUserId(null); },
    onError: (err) => setPwResult(`Error: ${err.message}`),
  });

  const updateTrialMut = trpc.admin.updateTrialEnd.useMutation({
    onSuccess: () => { setTrialResult("Trial extended"); refetch(); },
    onError: (err) => setTrialResult(`Error: ${err.message}`),
  });

  const updateQuotaMut = trpc.admin.updateQuotaLimit.useMutation({
    onSuccess: () => { setQuotaResult("Quota updated"); refetch(); },
    onError: (err) => setQuotaResult(`Error: ${err.message}`),
  });

  if (isLoading) return <div style={{ padding: 40, textAlign: "center", color: brand.navyMuted }}>Loading...</div>;
  if (!org) return <div style={{ padding: 40, textAlign: "center", color: brand.navyMuted }}>Organisation not found</div>;

  const badge = statusBadge(org.status, org.cancelAtPeriodEnd);
  const trialEnds = org.trialEndsAt ? new Date(org.trialEndsAt) : null;
  const trialExpired = trialEnds ? trialEnds < new Date() : true;
  const trialDaysLeft = trialEnds ? Math.max(0, Math.ceil((trialEnds.getTime() - Date.now()) / 86400000)) : 0;

  const sectionStyle: React.CSSProperties = {
    background: "white", borderRadius: 10, border: `1px solid ${brand.border}`,
    padding: 24, marginBottom: 16,
  };
  const sectionTitle: React.CSSProperties = {
    fontSize: 14, fontWeight: 700, color: brand.navy, marginBottom: 16,
    paddingBottom: 8, borderBottom: `1px solid ${brand.borderLight}`,
  };
  const fieldRow: React.CSSProperties = {
    display: "flex", justifyContent: "space-between", padding: "6px 0",
    fontSize: 13, borderBottom: `1px solid ${brand.borderLight}`,
  };
  const fieldLabel: React.CSSProperties = { color: brand.navyMuted, fontWeight: 500 };
  const fieldValue: React.CSSProperties = { color: brand.navy, fontWeight: 600, textAlign: "right" as const };

  return (
    <div>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
        <button onClick={onBack} style={{
          padding: "6px 12px", borderRadius: 6, border: `1px solid ${brand.border}`,
          background: "white", cursor: "pointer", display: "flex", alignItems: "center", gap: 4,
          fontSize: 13, color: brand.navyMuted,
        }}>
          <ChevronLeft size={14} /> Back
        </button>
        <div style={{ flex: 1 }}>
          <h2 style={{ fontSize: 20, fontWeight: 700, color: brand.navy, margin: 0 }}>
            {org.companyName || org.name}
          </h2>
          <span style={{ fontSize: 12, color: brand.navyMuted }}>{org.slug} · ID: {org.id}</span>
        </div>
        <span style={{
          padding: "4px 12px", borderRadius: 6, fontWeight: 700, fontSize: 12,
          color: "white", background: tierColor(org.tier), textTransform: "uppercase",
        }}>{org.tier}</span>
        <span style={{
          padding: "4px 12px", borderRadius: 6, fontWeight: 600, fontSize: 12,
          color: badge.text, background: badge.bg,
        }}>{badge.label}</span>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        {/* Left column */}
        <div>
          {/* Company Info */}
          <div style={sectionStyle}>
            <div style={sectionTitle}>Company Info</div>
            <div style={fieldRow}><span style={fieldLabel}>Company</span><span style={fieldValue}>{org.companyName || "—"}</span></div>
            <div style={fieldRow}><span style={fieldLabel}>Email</span><span style={fieldValue}>{org.companyEmail || org.billingEmail || "—"}</span></div>
            <div style={fieldRow}><span style={fieldLabel}>Phone</span><span style={fieldValue}>{org.companyPhone || "—"}</span></div>
            <div style={fieldRow}><span style={fieldLabel}>Address</span><span style={fieldValue}>{org.companyAddress || "—"}</span></div>
            <div style={fieldRow}><span style={fieldLabel}>Created</span><span style={fieldValue}>{formatDateTime(org.createdAt)}</span></div>
            <div style={fieldRow}><span style={fieldLabel}>Last Updated</span><span style={fieldValue}>{formatDateTime(org.updatedAt)}</span></div>
          </div>

          {/* Billing */}
          <div style={sectionStyle}>
            <div style={sectionTitle}>Billing & Subscription</div>
            <div style={fieldRow}><span style={fieldLabel}>Tier</span><span style={fieldValue}>{org.tier}</span></div>
            <div style={fieldRow}><span style={fieldLabel}>Status</span><span style={fieldValue}>{org.status}{org.cancelAtPeriodEnd ? " (cancelling)" : ""}</span></div>
            <div style={fieldRow}><span style={fieldLabel}>Stripe Customer</span><span style={{ ...fieldValue, fontSize: 11 }}>{org.stripeCustomerId || "—"}</span></div>
            <div style={fieldRow}><span style={fieldLabel}>Stripe Subscription</span><span style={{ ...fieldValue, fontSize: 11 }}>{org.stripeSubscriptionId || "—"}</span></div>
            <div style={fieldRow}><span style={fieldLabel}>Period Start</span><span style={fieldValue}>{formatDate(org.currentPeriodStart)}</span></div>
            <div style={fieldRow}><span style={fieldLabel}>Period End</span><span style={fieldValue}>{formatDate(org.currentPeriodEnd)}</span></div>
            {org.tier === "trial" && (
              <>
                <div style={fieldRow}>
                  <span style={fieldLabel}>Trial Started</span>
                  <span style={fieldValue}>{formatDate(org.trialStartsAt)}</span>
                </div>
                <div style={fieldRow}>
                  <span style={fieldLabel}>Trial Ends</span>
                  <span style={{
                    ...fieldValue,
                    color: trialExpired ? "#dc2626" : trialDaysLeft <= 3 ? "#f59e0b" : brand.navy,
                  }}>
                    {formatDate(org.trialEndsAt)}
                    {trialExpired ? " (EXPIRED)" : ` (${trialDaysLeft}d left)`}
                  </span>
                </div>
              </>
            )}
          </div>

          {/* Quotes */}
          <div style={sectionStyle}>
            <div style={sectionTitle}>Quotes</div>
            <div style={fieldRow}><span style={fieldLabel}>Total Quotes</span><span style={fieldValue}>{org.totalQuotes}</span></div>
            <div style={fieldRow}><span style={fieldLabel}>This Month</span><span style={fieldValue}>{org.monthlyQuoteCount} / {org.maxQuotesPerMonth === -1 ? "∞" : org.maxQuotesPerMonth}</span></div>
            <div style={fieldRow}><span style={fieldLabel}>Draft</span><span style={fieldValue}>{org.quotesByStatus.draft}</span></div>
            <div style={fieldRow}><span style={fieldLabel}>Sent</span><span style={fieldValue}>{org.quotesByStatus.sent}</span></div>
            <div style={fieldRow}><span style={fieldLabel}>Accepted</span><span style={fieldValue}>{org.quotesByStatus.accepted}</span></div>
            <div style={fieldRow}><span style={fieldLabel}>Declined</span><span style={fieldValue}>{org.quotesByStatus.declined}</span></div>
            <div style={fieldRow}><span style={fieldLabel}>Catalog Items</span><span style={fieldValue}>{org.catalogItemCount}</span></div>
            <div style={fieldRow}><span style={fieldLabel}>Max Members</span><span style={fieldValue}>{org.maxUsers}</span></div>
          </div>
        </div>

        {/* Right column */}
        <div>
          {/* Members */}
          <div style={sectionStyle}>
            <div style={sectionTitle}>Team Members ({org.members.length})</div>
            {org.members.map((m: any) => (
              <div key={m.userId} style={{
                padding: "10px 0", borderBottom: `1px solid ${brand.borderLight}`,
                display: "flex", justifyContent: "space-between", alignItems: "center",
              }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: brand.navy }}>
                    {m.name || "Unnamed"}
                    <span style={{
                      marginLeft: 8, fontSize: 10, fontWeight: 700, padding: "1px 6px", borderRadius: 3,
                      background: m.role === "owner" ? "#fef3c7" : m.role === "admin" ? "#dbeafe" : "#f1f5f9",
                      color: m.role === "owner" ? "#92400e" : m.role === "admin" ? "#1e40af" : "#475569",
                      textTransform: "uppercase",
                    }}>{m.role}</span>
                    {!m.isActive && <span style={{
                      marginLeft: 6, fontSize: 10, fontWeight: 700, padding: "1px 6px", borderRadius: 3,
                      background: "#fee2e2", color: "#991b1b",
                    }}>DEACTIVATED</span>}
                  </div>
                  <div style={{ fontSize: 12, color: brand.navyMuted }}>{m.email}</div>
                  <div style={{ fontSize: 11, color: brand.navyMuted, marginTop: 2 }}>
                    Joined: {formatDate(m.createdAt)} · Last active: {timeAgo(m.lastSignedIn)}
                    {m.defaultTradeSector && ` · ${m.defaultTradeSector}`}
                  </div>
                </div>
                <button
                  onClick={(e) => { e.stopPropagation(); setResetUserId(m.userId); setNewPassword(""); setPwResult(null); }}
                  style={{
                    padding: "4px 10px", borderRadius: 5, border: `1px solid ${brand.border}`,
                    background: "white", cursor: "pointer", fontSize: 11, color: brand.navyMuted,
                    display: "flex", alignItems: "center", gap: 4, whiteSpace: "nowrap",
                  }}
                >
                  <RotateCcw size={11} /> Reset PW
                </button>
              </div>
            ))}
          </div>

          {/* Password Reset Dialog */}
          {resetUserId && (
            <div style={{
              ...sectionStyle, background: "#fffbeb", border: "1px solid #fbbf24",
            }}>
              <div style={{ ...sectionTitle, borderColor: "#fcd34d" }}>
                <Shield size={14} style={{ display: "inline", marginRight: 6 }} />
                Reset Password — {org.members.find((m: any) => m.userId === resetUserId)?.email}
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <input
                  type="text"
                  placeholder="New password (min 8 chars)"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  style={{
                    flex: 1, padding: "8px 12px", borderRadius: 6, border: "1px solid #fbbf24",
                    fontSize: 13, outline: "none", background: "white",
                  }}
                />
                <button
                  onClick={() => resetPasswordMut.mutate({ userId: resetUserId, newPassword })}
                  disabled={newPassword.length < 8 || resetPasswordMut.isLoading}
                  style={{
                    padding: "8px 16px", borderRadius: 6, border: "none",
                    background: newPassword.length >= 8 ? brand.navy : "#d1d5db",
                    color: "white", cursor: newPassword.length >= 8 ? "pointer" : "default",
                    fontSize: 13, fontWeight: 600,
                  }}
                >Reset</button>
                <button
                  onClick={() => setResetUserId(null)}
                  style={{
                    padding: "8px 12px", borderRadius: 6, border: `1px solid ${brand.border}`,
                    background: "white", cursor: "pointer", fontSize: 13,
                  }}
                >Cancel</button>
              </div>
              {pwResult && <div style={{ marginTop: 8, fontSize: 12, color: pwResult.startsWith("Error") ? "#dc2626" : "#166534" }}>{pwResult}</div>}
            </div>
          )}

          {/* Admin Actions */}
          <div style={sectionStyle}>
            <div style={sectionTitle}>Admin Actions</div>

            {/* Extend Trial */}
            <div style={{ marginBottom: 16 }}>
              <label style={{ fontSize: 12, fontWeight: 600, color: brand.navyMuted, display: "block", marginBottom: 6 }}>
                <Calendar size={12} style={{ display: "inline", marginRight: 4 }} />
                Set Trial End Date
              </label>
              <div style={{ display: "flex", gap: 8 }}>
                <input
                  type="date"
                  value={trialDate}
                  onChange={(e) => setTrialDate(e.target.value)}
                  style={{
                    flex: 1, padding: "8px 12px", borderRadius: 6, border: `1px solid ${brand.border}`,
                    fontSize: 13, outline: "none",
                  }}
                />
                <button
                  onClick={() => {
                    if (!trialDate) return;
                    const endOfDay = new Date(trialDate + "T23:59:59.000Z");
                    updateTrialMut.mutate({ orgId: org.id, trialEndsAt: endOfDay.toISOString() });
                  }}
                  disabled={!trialDate || updateTrialMut.isLoading}
                  style={{
                    padding: "8px 16px", borderRadius: 6, border: "none",
                    background: trialDate ? brand.teal : "#d1d5db",
                    color: "white", cursor: trialDate ? "pointer" : "default",
                    fontSize: 13, fontWeight: 600,
                  }}
                >Set</button>
              </div>
              {trialResult && <div style={{ marginTop: 6, fontSize: 12, color: trialResult.startsWith("Error") ? "#dc2626" : "#166534" }}>{trialResult}</div>}
            </div>

            {/* Change Quote Limit */}
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: brand.navyMuted, display: "block", marginBottom: 6 }}>
                <Hash size={12} style={{ display: "inline", marginRight: 4 }} />
                Max Quotes Per Month (current: {org.maxQuotesPerMonth === -1 ? "Unlimited" : org.maxQuotesPerMonth})
              </label>
              <div style={{ display: "flex", gap: 8 }}>
                <input
                  type="number"
                  min={0}
                  placeholder={String(org.maxQuotesPerMonth)}
                  value={quotaValue}
                  onChange={(e) => setQuotaValue(e.target.value)}
                  style={{
                    flex: 1, padding: "8px 12px", borderRadius: 6, border: `1px solid ${brand.border}`,
                    fontSize: 13, outline: "none",
                  }}
                />
                <button
                  onClick={() => {
                    const val = parseInt(quotaValue);
                    if (isNaN(val) || val < 0) return;
                    updateQuotaMut.mutate({ orgId: org.id, maxQuotesPerMonth: val });
                  }}
                  disabled={!quotaValue || isNaN(parseInt(quotaValue)) || updateQuotaMut.isLoading}
                  style={{
                    padding: "8px 16px", borderRadius: 6, border: "none",
                    background: quotaValue && !isNaN(parseInt(quotaValue)) ? brand.teal : "#d1d5db",
                    color: "white", cursor: quotaValue ? "pointer" : "default",
                    fontSize: 13, fontWeight: 600,
                  }}
                >Set</button>
              </div>
              {quotaResult && <div style={{ marginTop: 6, fontSize: 12, color: quotaResult.startsWith("Error") ? "#dc2626" : "#166534" }}>{quotaResult}</div>}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Main Admin Panel ────────────────────────────────────

export default function AdminPanel() {
  const { user, loading } = useAuth();
  const [selectedOrgId, setSelectedOrgId] = useState<number | null>(null);

  const { data: stats } = trpc.admin.platformStats.useQuery(undefined, {
    enabled: !!(user && (user as any).role === "admin"),
  });

  // Client-side gate: show nothing if not admin
  if (loading) {
    return (
      <div style={{
        minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center",
        background: brand.slate, color: brand.navyMuted,
      }}>Loading...</div>
    );
  }

  if (!user || (user as any).role !== "admin") {
    return (
      <div style={{
        minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center",
        background: brand.slate,
      }}>
        <div style={{
          background: "white", padding: 40, borderRadius: 12, textAlign: "center",
          border: `1px solid ${brand.border}`, maxWidth: 400,
        }}>
          <Shield size={40} color="#dc2626" style={{ marginBottom: 16 }} />
          <h2 style={{ fontSize: 18, fontWeight: 700, color: brand.navy, marginBottom: 8 }}>Access Denied</h2>
          <p style={{ fontSize: 14, color: brand.navyMuted, margin: 0 }}>
            You do not have permission to view this page.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100vh", background: brand.slate, padding: "24px 32px" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 800, color: brand.navy, margin: "0 0 4px" }}>
            <Shield size={20} style={{ display: "inline", marginRight: 8, verticalAlign: "text-bottom" }} />
            Admin Panel
          </h1>
          <p style={{ fontSize: 13, color: brand.navyMuted, margin: 0 }}>
            Platform administration · Logged in as {(user as any).email}
          </p>
        </div>
        <a href="/dashboard" style={{
          padding: "8px 16px", borderRadius: 6, background: brand.navy,
          color: "white", textDecoration: "none", fontSize: 13, fontWeight: 600,
        }}>← Back to App</a>
      </div>

      {/* Stats */}
      <StatsBar stats={stats} />

      {/* Content */}
      {selectedOrgId ? (
        <OrgDetail orgId={selectedOrgId} onBack={() => setSelectedOrgId(null)} />
      ) : (
        <OrgList onSelectOrg={setSelectedOrgId} />
      )}
    </div>
  );
}
