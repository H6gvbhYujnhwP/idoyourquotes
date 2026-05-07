/**
 * SupportEscalationModal — Phase 4B Delivery E.13.
 *
 * Modal that opens when the user (or the bot) decides the chat should
 * be sent to the team. Four contact fields plus a one-line summary,
 * all pre-filled from the user/org records via support.prefillContact.
 *
 * Submit calls support.escalate which:
 *   - persists the contact details on the thread row
 *   - flips status to escalated
 *   - sends the email via SMTP (Google Workspace path, separate from
 *     Resend) — Reply-To set to the customer's email
 *
 * Returns whether the email actually went out so we can show "ticket
 * recorded but email failed" if SMTP misfires (e.g. env vars not yet
 * set on Render at launch).
 */

import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Loader2, Mail, AlertTriangle, Check } from "lucide-react";
import { brand } from "@/lib/brandTheme";
import { trpc } from "@/lib/trpc";

export default function SupportEscalationModal({
  open,
  threadId,
  onOpenChange,
  onComplete,
}: {
  open: boolean;
  threadId: number | null;
  onOpenChange: (open: boolean) => void;
  onComplete: () => void;
}) {
  const prefillQuery = trpc.support.prefillContact.useQuery(undefined, {
    enabled: open,
    refetchOnWindowFocus: false,
  });
  const escalateMut = trpc.support.escalate.useMutation();

  const [contactName, setContactName] = useState("");
  const [businessName, setBusinessName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [summary, setSummary] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<
    | { kind: "ok"; emailSent: boolean }
    | { kind: "error"; message: string }
    | null
  >(null);

  // Hydrate from the prefill query when the modal opens
  useEffect(() => {
    if (!open) return;
    if (!prefillQuery.data) return;
    // Only seed empty fields — preserve user edits if they re-open
    setContactName((v) => v || prefillQuery.data!.contactName);
    setBusinessName((v) => v || prefillQuery.data!.businessName);
    setEmail((v) => v || prefillQuery.data!.email);
    setPhone((v) => v || prefillQuery.data!.phone);
  }, [open, prefillQuery.data]);

  // Reset transient state when modal closes
  useEffect(() => {
    if (!open) {
      setSubmitting(false);
      // Don't clear form values — let the user re-open without retyping
      setResult(null);
    }
  }, [open]);

  const canSubmit =
    !!threadId &&
    contactName.trim().length > 0 &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) &&
    !submitting;

  const handleSubmit = async () => {
    if (!canSubmit || !threadId) return;
    setSubmitting(true);
    setResult(null);
    try {
      const res = await escalateMut.mutateAsync({
        threadId,
        contactName: contactName.trim(),
        businessName: businessName.trim(),
        email: email.trim(),
        phone: phone.trim(),
        summary: summary.trim(),
      });
      setResult({ kind: "ok", emailSent: res.emailSent });
      // Auto-close on success after a short delay so the user sees the tick
      setTimeout(() => {
        onComplete();
      }, 1200);
    } catch (err: any) {
      setResult({
        kind: "error",
        message: err?.message || "Failed to send. Try again, or email support@idoyourquotes.com directly.",
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2" style={{ color: brand.navy }}>
            <Mail size={18} style={{ color: brand.teal }} />
            Send to support
          </DialogTitle>
          <DialogDescription style={{ fontSize: 13 }}>
            We&rsquo;ll forward your conversation to the team. Confirm your details below — we&rsquo;ll
            reply over email.
          </DialogDescription>
        </DialogHeader>

        {result?.kind === "ok" ? (
          <div
            className="flex items-start gap-3 rounded-md p-4"
            style={{ background: brand.tealBg, border: `1px solid ${brand.tealBorder}` }}
          >
            <Check size={18} style={{ color: brand.teal, flexShrink: 0, marginTop: 2 }} />
            <div style={{ fontSize: 13, color: brand.navy }}>
              <div style={{ fontWeight: 500, marginBottom: 4 }}>Sent</div>
              {result.emailSent ? (
                <span>
                  We&rsquo;ve received your message and will get back to you over email.
                </span>
              ) : (
                <span>
                  Your ticket is recorded — the team will see it shortly. (Email delivery
                  hiccup; the conversation is safely logged.)
                </span>
              )}
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            <div>
              <Label htmlFor="esc-name" style={{ fontSize: 12, color: brand.navyMuted }}>
                Your name <span style={{ color: "#dc2626" }}>*</span>
              </Label>
              <Input
                id="esc-name"
                value={contactName}
                onChange={(e) => setContactName(e.target.value)}
                placeholder="e.g. Wez Chamberlain"
                disabled={submitting}
              />
            </div>

            <div>
              <Label htmlFor="esc-business" style={{ fontSize: 12, color: brand.navyMuted }}>
                Business name
              </Label>
              <Input
                id="esc-business"
                value={businessName}
                onChange={(e) => setBusinessName(e.target.value)}
                placeholder="e.g. Sweetbyte IT"
                disabled={submitting}
              />
            </div>

            <div>
              <Label htmlFor="esc-email" style={{ fontSize: 12, color: brand.navyMuted }}>
                Email <span style={{ color: "#dc2626" }}>*</span>
              </Label>
              <Input
                id="esc-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.co.uk"
                disabled={submitting}
              />
            </div>

            <div>
              <Label htmlFor="esc-phone" style={{ fontSize: 12, color: brand.navyMuted }}>
                Phone
              </Label>
              <Input
                id="esc-phone"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="07…"
                disabled={submitting}
              />
            </div>

            <div>
              <Label htmlFor="esc-summary" style={{ fontSize: 12, color: brand.navyMuted }}>
                What&rsquo;s this about? <span style={{ fontStyle: "italic", opacity: 0.7 }}>(optional)</span>
              </Label>
              <Textarea
                id="esc-summary"
                value={summary}
                onChange={(e) => setSummary(e.target.value)}
                placeholder="One-line summary, e.g. 'Branded proposal cover not picking up my logo'"
                disabled={submitting}
                rows={2}
                style={{ fontSize: 13 }}
              />
            </div>

            {result?.kind === "error" && (
              <div
                className="flex items-start gap-2 rounded-md p-3"
                style={{ background: "#fef2f2", border: "1px solid #fecaca", color: "#991b1b", fontSize: 12 }}
              >
                <AlertTriangle size={14} style={{ flexShrink: 0, marginTop: 2 }} />
                <span>{result.message}</span>
              </div>
            )}
          </div>
        )}

        {result?.kind !== "ok" && (
          <DialogFooter className="gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={submitting}
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={handleSubmit}
              disabled={!canSubmit}
              style={{ background: brand.teal, color: "#fff", border: "none" }}
            >
              {submitting ? (
                <>
                  <Loader2 size={14} className="mr-2 animate-spin" /> Sending…
                </>
              ) : (
                <>
                  <Mail size={14} className="mr-2" /> Send to support
                </>
              )}
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}
