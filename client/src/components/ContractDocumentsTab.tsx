/**
 * ContractDocumentsTab.tsx
 *
 * Contract-button delivery, stage 2b — the Settings screen where the
 * organisation's contract documents are authored.
 *
 * CONTRACTS-PER-BUSINESS DELIVERY (delivery 2 of the Xero sequence):
 *   Gold and Silver are Sweetbyte's own documents and now appear only for
 *   organisations on the server's CONTRACT_SEED_ORG_IDS list. Every other
 *   organisation starts with none and uses "Add contract" to create its
 *   own, named however it likes. Contracts can be deleted. "Reset to
 *   default" only shows on documents that have a shipped version
 *   (data.shippedDefaults), so another business is never offered
 *   Sweetbyte's wording.
 *
 * Rendered from the "Contracts" tab in client/src/pages/Settings.tsx,
 * following the same self-contained pattern as BrochureSettingsTab: the
 * parent renders <ContractDocumentsTab /> and this file owns all of its
 * own data fetching, state and mutations.
 *
 * WHAT THE USER SEES:
 *   - A switcher across the org's contract documents (Sweetbyte: Gold /
 *     Silver) plus "Add contract". Each is an entirely separate document,
 *     not one document with variants — confirmed with Wez, because
 *     Sweetbyte's SLA, support hours, onsite allowance and clause wording
 *     differ between packages.
 *   - With no documents yet: an "Add your first contract" prompt.
 *   - The numbered clauses, each independently editable, with add,
 *     delete and reorder. Editing clause 6 must not mean scrolling
 *     through three pages of legal text hunting for it.
 *   - The four contract-only texts: acceptance paragraph, Next Steps,
 *     thank-you line, and the pricing caveat that replaces the
 *     proposal's "estimated and may change" wording.
 *   - Signatory name, title and signature image. Both live Sweetbyte
 *     contracts carry a signed provider block; without these three the
 *     contract cannot assemble itself.
 *
 * DIRTY-STATE HANDLING: edits are held locally and written only on
 * Save. A legal document should not autosave on every keystroke — a
 * half-typed clause reaching the database is worse than an extra
 * click. The Save button enables only when something has changed, and
 * a warning appears if the user switches package with unsaved edits.
 *
 * SEEDING: allow-listed organisations (Sweetbyte) are seeded server-side
 * on first read with the twelve clauses transcribed from the live
 * Howgates and Sorrells contracts. Everyone else starts empty.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import {
  FileSignature,
  Plus,
  Trash2,
  ArrowUp,
  ArrowDown,
  RotateCcw,
  Upload,
  X,
  Info,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { brand } from "@/lib/brandTheme";

interface Clause {
  number: number;
  heading: string;
  body: string;
}

interface DocumentDraft {
  tier: string;
  displayName: string;
  clauses: Clause[];
  acceptanceBody: string;
  nextStepsBody: string;
  thankYouBody: string;
  pricingCaveatBody: string;
}

/** Short labels for Sweetbyte's shipped tier ids. Any other document is
 *  labelled with the name its owner gave it. */
const TIER_LABELS: Record<string, string> = {
  gold: "Gold",
  silver: "Silver",
};

/** The label shown on switchers and buttons for one document. */
function docLabel(doc: { tier: string; displayName?: string | null }): string {
  return TIER_LABELS[doc.tier] ?? (doc.displayName?.trim() || doc.tier);
}

/**
 * The placeholders the renderer substitutes at generation time. Shown
 * to the user so they know what they can type into a clause — without
 * this list they would have no way of discovering that
 * {{commencementDate}} does anything.
 */
const PLACEHOLDERS: Array<{ token: string; meaning: string }> = [
  { token: "{{providerName}}", meaning: "your company name" },
  { token: "{{customerName}}", meaning: "the client on the quote" },
  { token: "{{commencementDate}}", meaning: "the start date you type" },
  { token: "{{firstInvoiceMonth}}", meaning: "month of the first invoice" },
  // VAT fix delivery — the whole fee phrase with the right VAT wording:
  // "£X + VAT (£Y including VAT at 20%)", or "£X (no VAT applicable)"
  // for a business that is not VAT registered. Recommended over the
  // three separate figures below.
  { token: "{{monthlyFee}}", meaning: "monthly fee, worded for your VAT status" },
  { token: "{{monthlyFeeExVat}}", meaning: "monthly total, excluding VAT" },
  { token: "{{monthlyFeeIncVat}}", meaning: "monthly total, including VAT" },
  { token: "{{vatRate}}", meaning: "the VAT percentage" },
];

function toDraft(doc: any): DocumentDraft {
  return {
    tier: doc.tier,
    displayName: doc.displayName ?? "",
    clauses: Array.isArray(doc.clauses) ? doc.clauses : [],
    acceptanceBody: doc.acceptanceBody ?? "",
    nextStepsBody: doc.nextStepsBody ?? "",
    thankYouBody: doc.thankYouBody ?? "",
    pricingCaveatBody: doc.pricingCaveatBody ?? "",
  };
}

export default function ContractDocumentsTab() {
  const utils = trpc.useUtils();
  const { data, isLoading } = trpc.contractDocument.list.useQuery();

  const [activeTier, setActiveTier] = useState<string | null>(null);
  const [draft, setDraft] = useState<DocumentDraft | null>(null);
  const [signatoryName, setSignatoryName] = useState("");
  const [signatoryTitle, setSignatoryTitle] = useState("");
  const [newName, setNewName] = useState("");
  const [adding, setAdding] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── Load server state into local editing state ───────────────────
  // Only seeds the draft when the tier changes or nothing is loaded
  // yet, so a refetch (after saving the signatory, say) never wipes
  // clause edits the user is part-way through typing.
  //
  // Contracts-per-business delivery: also handles an org with no
  // documents (draft stays null, the empty state shows) and a document
  // that has just been deleted (falls back to the first remaining one).
  useEffect(() => {
    if (!data) return;
    const docs: any[] = data.documents ?? [];
    if (docs.length === 0) {
      if (activeTier !== null) setActiveTier(null);
      setDraft(null);
      return;
    }
    const stillThere =
      activeTier !== null && docs.some((d: any) => d.tier === activeTier);
    const tier = stillThere ? (activeTier as string) : docs[0].tier;
    if (tier !== activeTier) setActiveTier(tier);
    setDraft((prev) => {
      if (prev && prev.tier === tier) return prev;
      const doc = docs.find((d: any) => d.tier === tier);
      return doc ? toDraft(doc) : prev;
    });
  }, [data, activeTier]);

  useEffect(() => {
    if (!data?.signatory) return;
    setSignatoryName((prev) => (prev === "" ? data.signatory.name ?? "" : prev));
    setSignatoryTitle((prev) =>
      prev === "" ? data.signatory.title ?? "" : prev,
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data?.signatory?.name, data?.signatory?.title]);

  const serverDoc = useMemo(
    () => data?.documents?.find((d: any) => d.tier === activeTier),
    [data, activeTier],
  );

  const isDirty = useMemo(() => {
    if (!draft || !serverDoc) return false;
    return JSON.stringify(draft) !== JSON.stringify(toDraft(serverDoc));
  }, [draft, serverDoc]);

  // ── Mutations ────────────────────────────────────────────────────
  const save = trpc.contractDocument.save.useMutation({
    onSuccess: () => {
      toast.success("Contract document saved");
      utils.contractDocument.list.invalidate();
    },
    onError: (e: any) => toast.error("Could not save: " + e.message),
  });

  const resetTier = trpc.contractDocument.resetTier.useMutation({
    onSuccess: (restored: any) => {
      toast.success("Restored to the shipped default");
      setDraft(toDraft(restored));
      utils.contractDocument.list.invalidate();
    },
    onError: (e: any) => toast.error("Could not reset: " + e.message),
  });

  // Contracts-per-business delivery — add and delete. Both wait for the
  // list to refetch before moving the selection, so the effect above
  // never sees a selection that the cached list doesn't yet contain.
  const createDoc = trpc.contractDocument.create.useMutation({
    onSuccess: async (created: any) => {
      await utils.contractDocument.list.invalidate();
      setActiveTier(created.tier);
      setDraft(toDraft(created));
      setNewName("");
      setAdding(false);
      toast.success(`"${docLabel(created)}" added — now write its terms`);
    },
    onError: (e: any) => toast.error("Could not add: " + e.message),
  });

  const removeDoc = trpc.contractDocument.remove.useMutation({
    onSuccess: async () => {
      await utils.contractDocument.list.invalidate();
      setActiveTier(null);
      setDraft(null);
      toast.success("Contract deleted");
    },
    onError: (e: any) => toast.error("Could not delete: " + e.message),
  });

  const saveSignatory = trpc.contractDocument.saveSignatory.useMutation({
    onSuccess: () => {
      toast.success("Signatory saved");
      utils.contractDocument.list.invalidate();
    },
    onError: (e: any) => toast.error("Could not save: " + e.message),
  });

  const uploadSignature = trpc.contractDocument.uploadSignature.useMutation({
    onSuccess: () => {
      toast.success("Signature uploaded");
      utils.contractDocument.list.invalidate();
    },
    onError: (e: any) => toast.error("Upload failed: " + e.message),
  });

  const deleteSignature = trpc.contractDocument.deleteSignature.useMutation({
    onSuccess: () => {
      toast.success("Signature removed");
      utils.contractDocument.list.invalidate();
    },
    onError: (e: any) => toast.error("Could not remove: " + e.message),
  });

  // ── Handlers ─────────────────────────────────────────────────────

  const switchTier = (tier: string) => {
    if (isDirty) {
      const ok = window.confirm(
        "You have unsaved changes to this contract. Switching will discard them. Continue?",
      );
      if (!ok) return;
    }
    setActiveTier(tier);
    const doc = data?.documents?.find((d: any) => d.tier === tier);
    if (doc) setDraft(toDraft(doc));
  };

  const patchClause = (index: number, patch: Partial<Clause>) => {
    setDraft((prev) => {
      if (!prev) return prev;
      const clauses = prev.clauses.map((c, i) =>
        i === index ? { ...c, ...patch } : c,
      );
      return { ...prev, clauses };
    });
  };

  const addClause = () => {
    setDraft((prev) => {
      if (!prev) return prev;
      const nextNumber =
        prev.clauses.reduce((max, c) => Math.max(max, c.number), 0) + 1;
      return {
        ...prev,
        clauses: [
          ...prev.clauses,
          { number: nextNumber, heading: "", body: "" },
        ],
      };
    });
  };

  const removeClause = (index: number) => {
    const clause = draft?.clauses[index];
    const ok = window.confirm(
      `Delete clause ${clause?.number}${clause?.heading ? ` — ${clause.heading}` : ""}? This cannot be undone once you save.`,
    );
    if (!ok) return;
    setDraft((prev) =>
      prev
        ? { ...prev, clauses: prev.clauses.filter((_, i) => i !== index) }
        : prev,
    );
  };

  /**
   * Move a clause up or down.
   *
   * Deliberately moves the clause WITHOUT renumbering. The number is
   * part of the clause's identity in a signed document — a client
   * referring to "clause 6" must still find the security clause. If the
   * user wants the numbers to follow the new order they renumber by
   * hand, which is a conscious act rather than a side effect.
   */
  const moveClause = (index: number, direction: -1 | 1) => {
    setDraft((prev) => {
      if (!prev) return prev;
      const target = index + direction;
      if (target < 0 || target >= prev.clauses.length) return prev;
      const clauses = prev.clauses.slice();
      const [moved] = clauses.splice(index, 1);
      clauses.splice(target, 0, moved);
      return { ...prev, clauses };
    });
  };

  const handleSave = () => {
    if (!draft) return;
    const blankHeading = draft.clauses.findIndex((c) => !c.heading.trim());
    if (blankHeading !== -1) {
      toast.error(`Clause ${blankHeading + 1} needs a heading`);
      return;
    }
    save.mutate({
      tier: draft.tier,
      displayName: draft.displayName,
      clauses: draft.clauses,
      acceptanceBody: draft.acceptanceBody,
      nextStepsBody: draft.nextStepsBody,
      thankYouBody: draft.thankYouBody,
      pricingCaveatBody: draft.pricingCaveatBody,
    });
  };

  const handleReset = () => {
    if (!draft) return;
    const ok = window.confirm(
      `Restore the ${docLabel(draft)} contract to the shipped default? Your edits to it will be lost.`,
    );
    if (!ok) return;
    resetTier.mutate({ tier: draft.tier });
  };

  const handleAdd = () => {
    const name = newName.trim();
    if (!name) {
      toast.error("Give the contract a name first");
      return;
    }
    if (isDirty) {
      const ok = window.confirm(
        "You have unsaved changes to this contract. Adding a new one will discard them. Continue?",
      );
      if (!ok) return;
    }
    createDoc.mutate({ displayName: name });
  };

  const handleDelete = () => {
    if (!draft) return;
    const ok = window.confirm(
      `Delete "${docLabel(draft)}"? Its clauses and wording are removed for good. Contracts you have already sent are not affected.`,
    );
    if (!ok) return;
    removeDoc.mutate({ tier: draft.tier });
  };

  const handleSignatureFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      toast.error("Signature image must be under 2MB");
      return;
    }
    const reader = new FileReader();
    reader.onloadend = () => {
      uploadSignature.mutate({
        base64: String(reader.result),
        filename: file.name,
        contentType: file.type,
      });
    };
    reader.readAsDataURL(file);
  };

  // ── Render ───────────────────────────────────────────────────────

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 py-12 text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading your contract documents…
      </div>
    );
  }

  if (!data) {
    return (
      <p className="py-12 text-muted-foreground">
        Your contract documents couldn&rsquo;t be loaded. Refresh the page to
        try again.
      </p>
    );
  }

  const documents: any[] = data.documents ?? [];
  const shippedDefaults: string[] = (data as any).shippedDefaults ?? [];

  // The inline "name your contract" form, shared by the empty state and
  // the "Add contract" button.
  const addForm = (
    <div className="flex flex-col sm:flex-row gap-2">
      <Input
        value={newName}
        placeholder="e.g. Managed Services Agreement"
        maxLength={255}
        onChange={(e) => setNewName(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") handleAdd();
        }}
        className="sm:max-w-sm"
      />
      <Button onClick={handleAdd} disabled={createDoc.isPending}>
        {createDoc.isPending ? (
          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
        ) : (
          <Plus className="h-4 w-4 mr-2" />
        )}
        Add contract
      </Button>
      {documents.length > 0 && (
        <Button
          variant="outline"
          onClick={() => {
            setAdding(false);
            setNewName("");
          }}
        >
          Cancel
        </Button>
      )}
    </div>
  );

  return (
    <div className="space-y-6">
      {/* Tier gate notice — reads stay open to all tiers so a Solo user
          can see what they'd get, but generation is Pro/Team. */}
      {!data.canGenerateContracts && (
        <div
          className="rounded-lg border p-4 text-sm"
          style={{ background: "#fffbeb", borderColor: "#fcd34d" }}
        >
          <strong>Contracts are available on Pro and Team plans.</strong> You
          can read and edit your documents here, but turning a proposal into a
          contract needs an upgrade.
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileSignature className="h-5 w-5" />
            Contract documents
          </CardTitle>
          <CardDescription>
            Your terms, written once and used word-for-word on every contract.
            Each contract is a separate document.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {documents.length === 0 ? (
            /* Empty state — every organisation except the allow-listed
               ones starts here. */
            <div className="space-y-3">
              <div>
                <p className="font-medium">Add your first contract</p>
                <p className="text-sm text-muted-foreground">
                  Name it, then write your own clauses. It&rsquo;s printed on
                  every contract you issue from a branded proposal.
                </p>
              </div>
              {addForm}
            </div>
          ) : (
          <>
          {/* Contract switcher */}
          <div className="flex flex-wrap gap-2">
            {documents.map((doc: any) => (
              <button
                key={doc.tier}
                type="button"
                onClick={() => switchTier(doc.tier)}
                className="px-4 py-2 text-sm font-medium rounded-md border transition-colors"
                style={
                  activeTier === doc.tier
                    ? {
                        background: brand.navy,
                        color: "white",
                        borderColor: brand.navy,
                      }
                    : { background: "white", borderColor: "#d1d5db" }
                }
              >
                {docLabel(doc)}
              </button>
            ))}
            {!adding && (
              <button
                type="button"
                onClick={() => setAdding(true)}
                className="px-4 py-2 text-sm font-medium rounded-md border border-dashed transition-colors inline-flex items-center"
                style={{ background: "white", borderColor: "#d1d5db" }}
              >
                <Plus className="h-3.5 w-3.5 mr-1.5" />
                Add contract
              </button>
            )}
          </div>

          {adding && addForm}

          {draft && (
          <>
          <div className="space-y-2">
            <Label htmlFor="displayName">Document title</Label>
            <Input
              id="displayName"
              value={draft.displayName}
              onChange={(e) =>
                setDraft({ ...draft, displayName: e.target.value })
              }
            />
            <p className="text-xs text-muted-foreground">
              Printed as the heading on the terms pages.
            </p>
          </div>

          {/* Placeholder reference */}
          <div
            className="rounded-lg border p-3 text-xs"
            style={{ background: "#f8fafc", borderColor: "#e2e8f0" }}
          >
            <div className="flex items-center gap-1.5 font-medium mb-2">
              <Info className="h-3.5 w-3.5" />
              These fill in automatically when a contract is generated
            </div>
            <div className="grid sm:grid-cols-2 gap-x-4 gap-y-1">
              {PLACEHOLDERS.map((p) => (
                <div key={p.token}>
                  <code style={{ color: brand.navy }}>{p.token}</code>
                  <span className="text-muted-foreground"> — {p.meaning}</span>
                </div>
              ))}
            </div>
          </div>
          </>
          )}
          </>
          )}
        </CardContent>
      </Card>

      {draft && (
      <>
      {/* Clauses */}
      <Card>
        <CardHeader>
          <CardTitle>Terms &amp; conditions</CardTitle>
          <CardDescription>
            {draft.clauses.length} clause
            {draft.clauses.length === 1 ? "" : "s"}, printed in the order below.
            Reordering does not renumber, so a client referring to
            &ldquo;clause 6&rdquo; still finds the same clause.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {draft.clauses.map((clause, index) => (
            <div
              key={index}
              className="rounded-lg border p-4 space-y-3"
              style={{ borderColor: "#e5e7eb" }}
            >
              <div className="flex items-start gap-3">
                <div className="w-20 shrink-0 space-y-1">
                  <Label className="text-xs">Number</Label>
                  <Input
                    type="number"
                    min={1}
                    value={clause.number}
                    onChange={(e) =>
                      patchClause(index, {
                        number: parseInt(e.target.value, 10) || 1,
                      })
                    }
                  />
                </div>
                <div className="flex-1 space-y-1">
                  <Label className="text-xs">Heading</Label>
                  <Input
                    value={clause.heading}
                    placeholder="e.g. Payment"
                    onChange={(e) =>
                      patchClause(index, { heading: e.target.value })
                    }
                  />
                </div>
                <div className="flex gap-1 pt-6">
                  <button
                    type="button"
                    title="Move up"
                    onClick={() => moveClause(index, -1)}
                    disabled={index === 0}
                    className="p-1.5 rounded hover:bg-gray-100 disabled:opacity-30"
                  >
                    <ArrowUp className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    title="Move down"
                    onClick={() => moveClause(index, 1)}
                    disabled={index === draft.clauses.length - 1}
                    className="p-1.5 rounded hover:bg-gray-100 disabled:opacity-30"
                  >
                    <ArrowDown className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    title="Delete clause"
                    onClick={() => removeClause(index)}
                    className="p-1.5 rounded hover:bg-red-50"
                  >
                    <Trash2 className="h-3.5 w-3.5" style={{ color: "#dc2626" }} />
                  </button>
                </div>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Clause text</Label>
                <Textarea
                  rows={6}
                  value={clause.body}
                  onChange={(e) => patchClause(index, { body: e.target.value })}
                />
              </div>
            </div>
          ))}

          <Button variant="outline" onClick={addClause} className="w-full">
            <Plus className="h-4 w-4 mr-2" />
            Add a clause
          </Button>
        </CardContent>
      </Card>

      {/* Contract-only texts */}
      <Card>
        <CardHeader>
          <CardTitle>Contract-only wording</CardTitle>
          <CardDescription>
            These appear on contracts, never on proposals.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Acceptance paragraph</Label>
            <Textarea
              rows={5}
              value={draft.acceptanceBody}
              onChange={(e) =>
                setDraft({ ...draft, acceptanceBody: e.target.value })
              }
            />
            <p className="text-xs text-muted-foreground">
              Opens the signature page. The start date and monthly fee fill in
              automatically.
            </p>
          </div>
          <div className="space-y-2">
            <Label>Next steps</Label>
            <Textarea
              rows={4}
              value={draft.nextStepsBody}
              onChange={(e) =>
                setDraft({ ...draft, nextStepsBody: e.target.value })
              }
            />
            <p className="text-xs text-muted-foreground">
              Replaces the proposal&rsquo;s &ldquo;let&rsquo;s arrange a
              call&rdquo; wording, which reads oddly on a signed document.
            </p>
          </div>
          <div className="space-y-2">
            <Label>Pricing note</Label>
            <Textarea
              rows={3}
              value={draft.pricingCaveatBody}
              onChange={(e) =>
                setDraft({ ...draft, pricingCaveatBody: e.target.value })
              }
            />
            <p className="text-xs text-muted-foreground">
              Replaces the proposal&rsquo;s &ldquo;estimated and may
              change&rdquo; note, which says the opposite of what a contract
              needs.
            </p>
          </div>
          <div className="space-y-2">
            <Label>Closing line</Label>
            <Textarea
              rows={3}
              value={draft.thankYouBody}
              onChange={(e) =>
                setDraft({ ...draft, thankYouBody: e.target.value })
              }
            />
          </div>
        </CardContent>
      </Card>

      {/* Save / reset / delete */}
      <div className="flex flex-wrap items-center gap-3">
        <Button onClick={handleSave} disabled={!isDirty || save.isPending}>
          {save.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
          Save {docLabel(draft)} contract
        </Button>
        {/* Only documents with a shipped version can be reset — in
            practice Sweetbyte's Gold and Silver. */}
        {shippedDefaults.includes(draft.tier) && (
          <Button
            variant="outline"
            onClick={handleReset}
            disabled={resetTier.isPending}
          >
            <RotateCcw className="h-4 w-4 mr-2" />
            Reset to default
          </Button>
        )}
        <Button
          variant="outline"
          onClick={handleDelete}
          disabled={removeDoc.isPending}
          className="text-red-600 hover:text-red-700"
        >
          <Trash2 className="h-4 w-4 mr-2" />
          Delete contract
        </Button>
        {isDirty && (
          <span className="text-xs text-muted-foreground">Unsaved changes</span>
        )}
      </div>
      </>
      )}

      {/* Signatory */}
      <Card>
        <CardHeader>
          <CardTitle>Who signs</CardTitle>
          <CardDescription>
            Printed in the provider signature block. Shared by all your contracts.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="signatoryName">Name</Label>
              <Input
                id="signatoryName"
                value={signatoryName}
                placeholder="e.g. Westley Sweetman"
                onChange={(e) => setSignatoryName(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="signatoryTitle">Title</Label>
              <Input
                id="signatoryTitle"
                value={signatoryTitle}
                placeholder="e.g. Director"
                onChange={(e) => setSignatoryTitle(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Signature image</Label>
            {data.signatory.signatureImage ? (
              <div className="flex items-center gap-4">
                <img
                  src={data.signatory.signatureImage}
                  alt="Signature"
                  style={{
                    maxHeight: 60,
                    maxWidth: 220,
                    objectFit: "contain",
                    border: "1px solid #e5e7eb",
                    borderRadius: 6,
                    padding: 6,
                    background: "white",
                  }}
                />
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => deleteSignature.mutate()}
                  disabled={deleteSignature.isPending}
                >
                  <X className="h-3.5 w-3.5 mr-1.5" />
                  Remove
                </Button>
              </div>
            ) : (
              <div>
                <Button
                  variant="outline"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploadSignature.isPending}
                >
                  {uploadSignature.isPending ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Upload className="h-4 w-4 mr-2" />
                  )}
                  Upload signature
                </Button>
                <p className="text-xs text-muted-foreground mt-2">
                  PNG, JPEG or WebP, under 2MB. A transparent PNG looks best.
                  Without one, contracts print a blank line to sign by hand.
                </p>
              </div>
            )}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="hidden"
              onChange={handleSignatureFile}
            />
          </div>

          <Button
            variant="outline"
            onClick={() =>
              saveSignatory.mutate({
                name: signatoryName,
                title: signatoryTitle,
              })
            }
            disabled={saveSignatory.isPending}
          >
            {saveSignatory.isPending && (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            )}
            Save signatory
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
