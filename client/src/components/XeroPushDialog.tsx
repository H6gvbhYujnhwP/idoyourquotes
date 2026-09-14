/**
 * Send to Xero — preview, then confirm.
 *
 * Delivery 2.12. Opened from the contract dialog. Nothing is created in
 * Xero until the user presses the button at the bottom of this screen,
 * and what they approve here is built from the same function the push
 * uses, so the preview is the payload rather than a description of it.
 *
 * The screen answers, in order: who is this billed to, what will be
 * created, what is deliberately left out, and what it comes to. A quote
 * that has already been pushed shows what would CHANGE instead.
 */
import { useMemo, useState } from "react";
import { toast } from "sonner";
import {
  AlertTriangle,
  Building2,
  CheckCircle2,
  FileText,
  Loader2,
  Repeat,
  UserPlus,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc";

const gbp = (n: number) =>
  new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(
    n,
  );

interface Props {
  quoteId: number;
  commencementDate: string;
  onClose: () => void;
}

type ContactChoice =
  | { mode: "existing"; contactId: string; name: string }
  | { mode: "new" };

export default function XeroPushDialog({
  quoteId,
  commencementDate,
  onClose,
}: Props) {
  const preview = trpc.xero.preview.useQuery({ quoteId, commencementDate });
  const push = trpc.xero.push.useMutation();
  const utils = trpc.useUtils();

  const [choice, setChoice] = useState<ContactChoice | null>(null);
  const [draft, setDraft] = useState<{
    name: string;
    contactPerson: string;
    email: string;
    phone: string;
    address: string;
  } | null>(null);
  const [isPushing, setIsPushing] = useState(false);

  const data = preview.data as any;

  // Pre-select the exact match and pre-fill the new-customer form the
  // first time the preview lands. Never overwrite a user's choice.
  useMemo(() => {
    if (!data || choice) return;
    if (data.contactSuggestion?.exact) {
      setChoice({
        mode: "existing",
        contactId: data.contactSuggestion.exact.contactId,
        name: data.contactSuggestion.exact.name,
      });
    }
    if (!draft && data.contactSuggestion?.draft) {
      setDraft({ ...data.contactSuggestion.draft });
    }
  }, [data]);

  async function handlePush() {
    if (!choice) {
      toast.error("Choose the customer first");
      return;
    }
    setIsPushing(true);
    try {
      const contact =
        choice.mode === "existing"
          ? { mode: "existing" as const, contactId: choice.contactId }
          : {
              mode: "new" as const,
              name: (draft?.name ?? "").trim(),
              contactPerson: draft?.contactPerson,
              email: draft?.email,
              phone: draft?.phone,
              address: draft?.address,
            };
      if (contact.mode === "new" && !contact.name) {
        toast.error("The customer needs a name");
        setIsPushing(false);
        return;
      }
      const result: any = await push.mutateAsync({
        quoteId,
        commencementDate,
        contact,
      });
      await utils.xero.preview.invalidate();
      toast.success(
        `Sent to Xero — ${(result.created ?? []).join(", ") || "nothing to create"}`,
      );
      onClose();
    } catch (err: any) {
      toast.error(err?.message || "The push failed");
    } finally {
      setIsPushing(false);
    }
  }

  const plan = data?.plan;
  const blocked = (plan?.blockers?.length ?? 0) > 0 || !!data?.tenantMismatch;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto p-4"
      style={{ background: "rgba(15,23,42,0.45)" }}
      onClick={() => !isPushing && onClose()}
    >
      <div
        className="w-full max-w-3xl my-8 rounded-xl bg-white p-6 space-y-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-bold">Send to Xero</h2>
            <p className="text-sm text-muted-foreground mt-1">
              Nothing is created until you press the button at the bottom.
              Everything arrives as a draft.
            </p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close">
            <X className="w-4 h-4" />
          </button>
        </div>

        {preview.isLoading && (
          <div className="py-12 flex justify-center">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        )}

        {preview.error && (
          <div className="rounded-md border border-red-300 bg-red-50 p-3 text-sm">
            {preview.error.message}
          </div>
        )}

        {data && (
          <>
            <div className="flex items-center gap-2 text-sm rounded-md border p-3">
              <Building2 className="w-4 h-4 shrink-0 text-muted-foreground" />
              Going to <strong>{data.tenantName || "Xero"}</strong>
            </div>

            {/* Anything that stops the push, stated before the detail. */}
            {data.tenantMismatch && (
              <div className="rounded-md border border-red-300 bg-red-50 p-3 text-sm">
                This quote was already sent to{" "}
                <strong>{data.tenantMismatch.pushedTo}</strong>, but you are
                connected to{" "}
                <strong>{data.tenantMismatch.nowConnectedTo}</strong>. Pushing
                now would bill the same work out of two sets of books.
              </div>
            )}
            {plan?.blockers?.map((b: any) => (
              <div
                key={b.code + b.message}
                className="flex gap-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm"
              >
                <AlertTriangle className="w-4 h-4 shrink-0 text-amber-700 mt-0.5" />
                <span>{b.message}</span>
              </div>
            ))}

            {data.alreadyPushed && !data.tenantMismatch && (
              <div className="rounded-md border p-3 text-sm">
                Already sent to Xero on{" "}
                {new Date(data.alreadyPushed.pushedAt).toLocaleDateString(
                  "en-GB",
                  { day: "numeric", month: "short", year: "numeric" },
                )}{" "}
                as <strong>{data.alreadyPushed.contactName}</strong>. Pushing
                again updates the repeating invoices rather than creating new
                ones.
              </div>
            )}

            {/* ── Customer ───────────────────────────────────────── */}
            <div className="space-y-2">
              <h3 className="text-sm font-semibold">Customer</h3>

              {(data.contactSuggestion?.matches ?? []).map((m: any) => (
                <label
                  key={m.contactId}
                  className="flex items-center gap-2 rounded-md border p-2 text-sm cursor-pointer"
                >
                  <input
                    type="radio"
                    name="xero-contact"
                    checked={
                      choice?.mode === "existing" &&
                      choice.contactId === m.contactId
                    }
                    onChange={() =>
                      setChoice({
                        mode: "existing",
                        contactId: m.contactId,
                        name: m.name,
                      })
                    }
                  />
                  <span>
                    Use existing: <strong>{m.name}</strong>
                    {m.email ? ` · ${m.email}` : ""}
                    {m.isArchived ? " · archived in Xero" : ""}
                  </span>
                </label>
              ))}

              <label className="flex items-center gap-2 rounded-md border p-2 text-sm cursor-pointer">
                <input
                  type="radio"
                  name="xero-contact"
                  checked={choice?.mode === "new"}
                  onChange={() => setChoice({ mode: "new" })}
                />
                <UserPlus className="w-4 h-4" />
                <span>
                  Create a new customer in Xero
                  {(data.contactSuggestion?.matches ?? []).length === 0
                    ? " — no match found for this client"
                    : ""}
                </span>
              </label>

              {choice?.mode === "new" && draft && (
                <div className="rounded-md border p-3 space-y-2">
                  <p className="text-xs text-muted-foreground">
                    Filled in from the quote. Check it — this becomes a
                    permanent record in your accounts.
                  </p>
                  {(
                    [
                      ["name", "Company name"],
                      ["contactPerson", "Contact person"],
                      ["email", "Email"],
                      ["phone", "Phone"],
                    ] as const
                  ).map(([field, label]) => (
                    <div key={field} className="space-y-1">
                      <label className="text-xs font-medium">{label}</label>
                      <input
                        type="text"
                        value={(draft as any)[field]}
                        onChange={(e) =>
                          setDraft({ ...draft, [field]: e.target.value })
                        }
                        className="w-full rounded-md border px-2 py-1.5 text-sm"
                      />
                    </div>
                  ))}
                  <div className="space-y-1">
                    <label className="text-xs font-medium">Address</label>
                    <textarea
                      rows={3}
                      value={draft.address}
                      onChange={(e) =>
                        setDraft({ ...draft, address: e.target.value })
                      }
                      className="w-full rounded-md border px-2 py-1.5 text-sm"
                    />
                  </div>
                </div>
              )}
            </div>

            {/* ── What gets created ──────────────────────────────── */}
            {(plan?.groups ?? []).map((g: any) => (
              <div key={g.cadence} className="rounded-md border">
                <div className="flex items-center gap-2 border-b px-3 py-2 text-sm font-semibold">
                  {g.cadence === "oneOff" ? (
                    <FileText className="w-4 h-4" />
                  ) : (
                    <Repeat className="w-4 h-4" />
                  )}
                  {g.label}
                  {g.cadence !== "oneOff" && plan.startDate
                    ? ` · from ${plan.startDate}`
                    : ""}
                </div>
                <div className="divide-y">
                  {g.lines.map((l: any, i: number) => (
                    <div
                      key={i}
                      className="px-3 py-2 text-sm flex gap-3 items-start"
                    >
                      <span className="flex-1 whitespace-pre-line">
                        {l.Description}
                      </span>
                      <span className="tabular-nums text-right shrink-0">
                        {l.Quantity} × {gbp(l.UnitAmount)}
                        {l.DiscountRate ? ` − ${l.DiscountRate}%` : ""}
                      </span>
                    </div>
                  ))}
                </div>
                <div className="px-3 py-2 text-sm flex justify-between border-t bg-muted/30">
                  <span>Subtotal (ex VAT)</span>
                  <span className="tabular-nums font-semibold">
                    {gbp(g.subTotal)}
                    {plan.vatRate > 0
                      ? ` + ${gbp(g.vat)} VAT (${plan.vatRate}%)`
                      : " · no VAT"}
                  </span>
                </div>
              </div>
            ))}

            {(plan?.excluded ?? []).length > 0 && (
              <div className="rounded-md border p-3 text-sm">
                <p className="font-semibold mb-1">Not sent</p>
                {plan.excluded.map((e: any) => (
                  <div key={e.id} className="text-muted-foreground">
                    {e.name} — {e.reason}
                  </div>
                ))}
              </div>
            )}

            {/* ── What would change, on a re-push ────────────────── */}
            {data.diffs &&
              Object.keys(data.diffs).map((cadence) => {
                const rows = (data.diffs[cadence] ?? []).filter(
                  (d: any) => d.status !== "unchanged",
                );
                if (rows.length === 0) return null;
                return (
                  <div key={cadence} className="rounded-md border p-3 text-sm">
                    <p className="font-semibold mb-1">
                      Changes to the {cadence} invoice already in Xero
                    </p>
                    {rows.map((d: any, i: number) => (
                      <div key={i} className="flex gap-2">
                        <span className="uppercase text-[10px] font-bold mt-0.5 w-16 shrink-0">
                          {d.status}
                        </span>
                        <span>{d.description}</span>
                      </div>
                    ))}
                  </div>
                );
              })}

            <div className="text-xs text-muted-foreground">
              {plan?.taxType
                ? `VAT applied per line using ${plan.taxType}.`
                : "No VAT applied."}{" "}
              {plan?.accountCode
                ? `Coded to account ${plan.accountCode}.`
                : "No account code sent — Xero uses your default."}
            </div>

            <div className="flex justify-end gap-2 pt-1 border-t">
              <Button variant="outline" onClick={onClose} disabled={isPushing}>
                Cancel
              </Button>
              <Button
                onClick={handlePush}
                disabled={isPushing || blocked || !choice}
              >
                {isPushing ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <CheckCircle2 className="w-4 h-4 mr-2" />
                )}
                {data.alreadyPushed ? "Update Xero" : "Create in Xero"}
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
