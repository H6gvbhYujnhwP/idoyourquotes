/**
 * BrochureUploadModal.tsx
 *
 * Phase 4B Delivery B. The single brochure-upload modal used by:
 *   - The Settings → Company Brochure tab (Delivery B)
 *   - The Tile 3 ("Branded with your artwork and company story")
 *     first-run flow (Delivery C, when the user picks the tile and has
 *     no brochure yet).
 *
 * Both call sites pass the same onUploaded callback and get the same
 * three states:
 *   1. Idle — drop-zone, file constraints visible.
 *   2. Uploading — disabled drop-zone with progress copy. Two phases:
 *      - "Uploading" while the base64 is in flight.
 *      - "Reading your brochure…" while the server runs Claude.
 *      We can't measure progress on the second phase from the client
 *      (it's an opaque mutation), so we show a spinner with rolling
 *      copy that swaps every few seconds.
 *   3. Done — calls onUploaded with the result and the modal closes
 *      itself (the parent controls open/closed via the open prop).
 *
 * Validation happens twice:
 *   - Client-side: file type (must be PDF), size (≤25 MB), basic
 *     fast-fail before we burn bandwidth.
 *   - Server-side: same checks plus page count (≤30 pages — pdf-lib
 *     getPageCount() runs on the buffer before we hit Claude).
 *   The page-count check is only on the server because we'd need to
 *   ship pdf-lib to the browser to do it client-side, and that's not
 *   worth the bundle weight for a one-time validation.
 *
 * Tier gating is done at the call site. By the time this modal opens
 * we assume the user is allowed to upload — but the server still
 * enforces, so an outdated client cache won't bypass the gate.
 */

import { useEffect, useRef, useState } from "react";
import { Upload, FileText, Loader2, X, AlertTriangle } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc";

const MAX_FILE_SIZE_BYTES = 25 * 1024 * 1024;

const ROLLING_PROGRESS_COPY = [
  "Reading your brochure…",
  "Spotting your About Us page…",
  "Picking out your USPs…",
  "Pulling out the facts…",
  "Tagging each page…",
  "Almost done…",
];

export interface BrochureUploadResult {
  filename: string;
  fileUrl: string | null;
  fileSize: number;
  pageCount: number;
  extractedAt: Date | null;
  knowledge: any; // BrochureKnowledge — server type, kept loose here
  thinness: { thin: boolean; reasons: string[] };
  reUploadedSameFile: boolean;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Called with the upload result on success. The modal closes itself. */
  onUploaded?: (result: BrochureUploadResult) => void;
  /**
   * Title shown at the top of the modal. Settings tab uses
   * "Upload your company brochure"; the Tile 3 first-run flow can use
   * something more inviting like "First, let's add your brochure".
   */
  title?: string;
  /**
   * Optional helper sentence under the title. Defaults to a generic
   * description; Tile 3 first-run can override with a line specific
   * to the proposal-generation context.
   */
  description?: string;
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      const comma = result.indexOf(",");
      resolve(comma >= 0 ? result.slice(comma + 1) : result);
    };
    reader.onerror = () => reject(reader.error || new Error("Read failed"));
    reader.readAsDataURL(file);
  });
}

export default function BrochureUploadModal({
  open,
  onOpenChange,
  onUploaded,
  title,
  description,
}: Props) {
  const utils = trpc.useUtils();
  const upload = trpc.brochure.upload.useMutation();

  const [dragOver, setDragOver] = useState(false);
  const [phase, setPhase] = useState<"idle" | "uploading" | "extracting">("idle");
  const [error, setError] = useState<string | null>(null);
  const [rollingIdx, setRollingIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  // Reset state when the modal closes/opens
  useEffect(() => {
    if (!open) {
      setPhase("idle");
      setError(null);
      setRollingIdx(0);
    }
  }, [open]);

  // Cycle the rolling-copy index while extracting
  useEffect(() => {
    if (phase !== "extracting") return;
    const id = setInterval(() => {
      setRollingIdx((i) => (i + 1) % ROLLING_PROGRESS_COPY.length);
    }, 4000);
    return () => clearInterval(id);
  }, [phase]);

  function validateClientSide(file: File): string | null {
    const isPdfMime = file.type === "application/pdf";
    const isPdfExt = file.name.toLowerCase().endsWith(".pdf");
    if (!isPdfMime && !isPdfExt) return "Brochure must be a PDF.";
    if (file.size > MAX_FILE_SIZE_BYTES) {
      return `Brochure too large (${(file.size / 1024 / 1024).toFixed(1)} MB). Max is 25 MB.`;
    }
    if (file.size < 1024) return "That file looks empty.";
    return null;
  }

  async function handleFile(file: File) {
    setError(null);
    const localErr = validateClientSide(file);
    if (localErr) {
      setError(localErr);
      return;
    }

    setPhase("uploading");
    let base64: string;
    try {
      base64 = await fileToBase64(file);
    } catch {
      setPhase("idle");
      setError("Couldn't read that file. Try again.");
      return;
    }

    setPhase("extracting");
    try {
      const result = await upload.mutateAsync({
        filename: file.name,
        base64Data: base64,
      });
      // Refresh the cached brochure.get query so any open Settings tab
      // sees the new state immediately.
      await utils.brochure.get.invalidate();
      onUploaded?.(result as BrochureUploadResult);
      onOpenChange(false);
    } catch (err: any) {
      setPhase("idle");
      setError(err?.message || "Upload failed. Try again.");
    }
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    if (phase !== "idle") return;
    const file = e.dataTransfer.files?.[0];
    if (file) handleFile(file);
  }

  function handleBrowse() {
    if (phase !== "idle") return;
    inputRef.current?.click();
  }

  function handleInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
    // Reset so the same file can be re-selected after an error
    if (inputRef.current) inputRef.current.value = "";
  }

  const busy = phase !== "idle";

  return (
    <Dialog open={open} onOpenChange={(v) => (busy ? null : onOpenChange(v))}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{title || "Upload your company brochure"}</DialogTitle>
          <DialogDescription>
            {description ||
              "We'll read your brochure once and pull out your About Us, USPs, and infographics — then weave them into every Branded Proposal. Upload once, reuse forever."}
          </DialogDescription>
        </DialogHeader>

        {/* Drop zone */}
        <div
          onDragOver={(e) => {
            e.preventDefault();
            if (!busy) setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          onClick={handleBrowse}
          className={`relative border-2 border-dashed rounded-lg p-10 text-center transition-colors ${
            busy
              ? "border-muted bg-muted/30 cursor-default"
              : dragOver
              ? "border-primary bg-primary/5 cursor-pointer"
              : "border-muted hover:border-primary/40 hover:bg-muted/40 cursor-pointer"
          }`}
        >
          <input
            ref={inputRef}
            type="file"
            accept="application/pdf,.pdf"
            className="hidden"
            onChange={handleInputChange}
            disabled={busy}
          />

          {phase === "idle" && (
            <>
              <div className="mx-auto h-11 w-11 rounded-full bg-background border flex items-center justify-center mb-3">
                <Upload className="h-5 w-5 text-muted-foreground" />
              </div>
              <p className="text-sm font-medium">
                Drop your brochure here, or click to browse
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                PDF only · max 30 pages · max 25 MB
              </p>
            </>
          )}

          {phase === "uploading" && (
            <>
              <div className="mx-auto h-11 w-11 rounded-full bg-background border flex items-center justify-center mb-3">
                <Loader2 className="h-5 w-5 animate-spin text-primary" />
              </div>
              <p className="text-sm font-medium">Uploading…</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Sending the file to the server
              </p>
            </>
          )}

          {phase === "extracting" && (
            <>
              <div className="mx-auto h-11 w-11 rounded-full bg-background border flex items-center justify-center mb-3">
                <Loader2 className="h-5 w-5 animate-spin text-primary" />
              </div>
              <p className="text-sm font-medium">
                {ROLLING_PROGRESS_COPY[rollingIdx]}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                Usually takes 15–30 seconds. Don't close this window.
              </p>
            </>
          )}
        </div>

        {/* Best-results hint (only when idle) */}
        {phase === "idle" && (
          <div className="rounded-md bg-muted/50 p-3 text-xs text-muted-foreground">
            <div className="flex items-start gap-2">
              <FileText className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
              <div>
                <p className="font-medium text-foreground mb-0.5">
                  Best results when your brochure has
                </p>
                <p>
                  An About Us section, a Why Choose Us / USPs page, branded
                  infographics, and clear contact details.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Error surface */}
        {error && (
          <div className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive flex items-start gap-2">
            <AlertTriangle className="h-4 w-4 mt-0.5 flex-shrink-0" />
            <div className="flex-1">{error}</div>
          </div>
        )}

        <DialogFooter className="flex sm:justify-between gap-2">
          <p className="text-xs text-muted-foreground self-center hidden sm:block">
            You can change or replace this anytime in Settings.
          </p>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={busy}
          >
            <X className="h-4 w-4 mr-1.5" />
            {busy ? "Working…" : "Cancel"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
