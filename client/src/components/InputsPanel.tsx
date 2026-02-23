import { useState, useEffect } from "react";
import { brand } from "@/lib/brandTheme";
import { Check, AlertTriangle, Loader2, X, Zap, Mic, FileText } from "lucide-react";
import FileIcon from "@/components/FileIcon";
import TakeoffPanel from "@/components/TakeoffPanel";

interface QuoteInput {
  id: number;
  inputType: string;
  filename: string | null;
  content: string | null;
  fileUrl: string | null;
  mimeType: string | null;
  processingStatus: string | null;
  processingError: string | null;
  createdAt: string;
}

interface TakeoffData {
  id: number;
  inputId: number;
  status: string;
  counts: Record<string, number>;
  symbolDescriptions?: Record<string, string>;
}

interface InputsPanelProps {
  inputs: QuoteInput[];
  selectedInputId: number | null;
  onSelectInput: (id: number | null) => void;
  getTakeoffForInput: (inputId: number) => TakeoffData | null;
  onProcessInput: (input: QuoteInput) => void;
  onDeleteInput: (input: QuoteInput) => void;
  onTriggerVoiceAnalysis: () => void;
  onTakeoffChanged: () => void; // Called when takeoff data changes (symbol excluded, approved, etc.)
  processingInputId: number | null;
  quoteId: number;
  userPrompt: string;
}

function useIsMobile(breakpoint = 768) {
  const [isMobile, setIsMobile] = useState(
    typeof window !== "undefined" ? window.innerWidth < breakpoint : false
  );
  useEffect(() => {
    const handler = () => setIsMobile(window.innerWidth < breakpoint);
    window.addEventListener("resize", handler);
    return () => window.removeEventListener("resize", handler);
  }, [breakpoint]);
  return isMobile;
}

// Derive the current processing stage for an input
function getProcessingStage(input: QuoteInput, takeoff: TakeoffData | null): {
  label: string;
  color: string;
  bgColor: string;
  animate: boolean;
  icon: "spinner" | "check" | "warning" | "zap" | "mic" | "dash";
} {
  const isApproved = takeoff?.status === "verified" || takeoff?.status === "locked";
  const totalCount = takeoff?.counts ? Object.values(takeoff.counts).reduce((s, v) => s + v, 0) : 0;
  const isVoiceNote = input.inputType === "audio" && input.content && !input.fileUrl;
  const isPdf = input.inputType === "pdf";

  // Voice notes — no processing needed
  if (isVoiceNote) {
    return { label: "Ready", color: brand.teal, bgColor: `${brand.teal}12`, animate: false, icon: "check" };
  }

  // Failed
  if (input.processingStatus === "failed" || input.processingStatus === "error") {
    return { label: "Analysis Failed", color: "#dc2626", bgColor: "#fef2f2", animate: false, icon: "warning" };
  }

  // Currently processing (AI analysis stage)
  if (input.processingStatus === "processing") {
    return { label: "AI Analysis in progress…", color: "#3b82f6", bgColor: "#eff6ff", animate: true, icon: "spinner" };
  }

  // Completed analysis
  if (input.processingStatus === "completed") {
    // PDF: check takeoff state
    if (isPdf) {
      if (!takeoff) {
        // Takeoff auto-running (TakeoffPanel auto-triggers when no takeoff exists)
        return { label: "Symbol Takeoff in progress…", color: "#8b5cf6", bgColor: "#f5f3ff", animate: true, icon: "zap" };
      }
      if (takeoff.status === "processing" || takeoff.status === "pending") {
        return { label: "Symbol Takeoff in progress…", color: "#8b5cf6", bgColor: "#f5f3ff", animate: true, icon: "zap" };
      }
      if (isApproved && totalCount > 0) {
        return { label: `${totalCount} items ✓`, color: brand.teal, bgColor: `${brand.teal}12`, animate: false, icon: "check" };
      }
      if (totalCount > 0) {
        return { label: `${totalCount} items — Review`, color: "#d97706", bgColor: "#fffbeb", animate: false, icon: "zap" };
      }
      return { label: "Analysed", color: brand.teal, bgColor: `${brand.teal}12`, animate: false, icon: "check" };
    }
    // Non-PDF completed
    return { label: "Analysed", color: brand.teal, bgColor: `${brand.teal}12`, animate: false, icon: "check" };
  }

  // Not yet processed
  return { label: "Pending", color: brand.navyMuted, bgColor: `${brand.navy}06`, animate: false, icon: "dash" };
}

// Animated status indicator for the file list
function StatusIndicator({ input, takeoff, compact = false }: { input: QuoteInput; takeoff: TakeoffData | null; compact?: boolean }) {
  const stage = getProcessingStage(input, takeoff);

  const iconSize = compact ? "w-3 h-3" : "w-3.5 h-3.5";
  const textSize = compact ? "text-[10px]" : "text-[11px]";

  return (
    <div
      className={`flex items-center gap-1.5 rounded-md ${compact ? "px-2 py-0.5" : "px-2.5 py-1"}`}
      style={{ backgroundColor: stage.bgColor }}
    >
      {stage.icon === "spinner" && (
        <Loader2 className={`${iconSize} animate-spin`} style={{ color: stage.color }} />
      )}
      {stage.icon === "check" && (
        <Check className={iconSize} style={{ color: stage.color }} />
      )}
      {stage.icon === "warning" && (
        <AlertTriangle className={iconSize} style={{ color: stage.color }} />
      )}
      {stage.icon === "zap" && (
        <Zap className={iconSize} style={{ color: stage.color }} />
      )}
      {stage.icon === "mic" && (
        <Mic className={iconSize} style={{ color: stage.color }} />
      )}
      {stage.icon === "dash" && (
        <span className={`${iconSize} flex items-center justify-center text-[9px]`} style={{ color: stage.color }}>—</span>
      )}
      <span
        className={`${textSize} font-bold whitespace-nowrap ${stage.animate ? "animate-pulse" : ""}`}
        style={{ color: stage.color }}
      >
        {stage.label}
      </span>
    </div>
  );
}

// Detail content shown for a selected input
function DetailContent({
  input,
  takeoff,
  onProcess,
  onDelete,
  onClose,
  onTriggerVoiceAnalysis,
  processingInputId,
  quoteId,
  userPrompt,
  isMobile,
}: {
  input: QuoteInput;
  takeoff: TakeoffData | null;
  onProcess: (input: QuoteInput) => void;
  onDelete: (input: QuoteInput) => void;
  onClose: () => void;
  onTriggerVoiceAnalysis: () => void;
  processingInputId: number | null;
  quoteId: number;
  userPrompt: string;
  isMobile: boolean;
}) {
  const isApproved = takeoff?.status === "verified" || takeoff?.status === "locked";
  const isVoiceNote = input.inputType === "audio" && input.content && !input.fileUrl;

  return (
    <div className="flex flex-col h-full">
      {/* Navy header */}
      <div className="px-4 py-3 flex-shrink-0" style={{ background: `linear-gradient(135deg, ${brand.navy} 0%, #1e3a5f 100%)` }}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3 min-w-0">
            <FileIcon type={input.inputType} size="sm" approved={isApproved} />
            <div className="min-w-0">
              <h4 className="text-sm font-extrabold text-white truncate">
                {input.filename || "Input"}
              </h4>
              <p className="text-[10px] font-medium text-white/50 mt-0.5">
                {input.mimeType ? input.mimeType.split("/").pop()?.toUpperCase() : ""}
                {" • "}
                {new Date(input.createdAt).toLocaleDateString("en-GB")}
                {input.processingStatus === "completed" && (
                  <span className="text-teal-300 font-bold"> • Analysed</span>
                )}
                {input.processingStatus === "processing" && (
                  <span className="text-blue-300 font-bold"> • Processing…</span>
                )}
                {(input.processingStatus === "failed" || input.processingStatus === "error") && (
                  <span className="text-red-300 font-bold"> • Failed</span>
                )}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            {/* Retry button */}
            {(input.processingStatus === "failed" || input.processingStatus === "error") && (
              <button
                onClick={() => onProcess(input)}
                disabled={processingInputId === input.id}
                className="text-[11px] font-bold px-3 py-1.5 rounded-lg text-red-300 bg-white/10 hover:bg-white/15 border border-white/15 transition-colors"
              >
                Retry
              </button>
            )}
            {/* Re-analyse button */}
            {input.processingStatus === "completed" && (
              <button
                onClick={() => onProcess(input)}
                disabled={processingInputId === input.id}
                className="text-[11px] font-bold px-3 py-1.5 rounded-lg text-teal-300 bg-white/10 hover:bg-white/15 border border-white/15 transition-colors"
              >
                Re-analyse
              </button>
            )}
            {/* Edit Summary for voice notes */}
            {isVoiceNote && (
              <button
                onClick={onTriggerVoiceAnalysis}
                className="text-[11px] font-bold px-3 py-1.5 rounded-lg text-amber-300 bg-white/10 hover:bg-white/15 border border-white/15 transition-colors"
              >
                Edit Summary
              </button>
            )}
            {/* Open File */}
            {input.fileUrl && (
              <button
                onClick={() => window.open(input.fileUrl!, "_blank")}
                className="text-[11px] font-bold px-3 py-1.5 rounded-lg text-white/70 bg-white/5 hover:bg-white/10 border border-white/10 transition-colors"
              >
                Open File
              </button>
            )}
            {/* Delete */}
            <button
              onClick={() => {
                if (window.confirm(`Delete "${input.filename || "this input"}"?`)) {
                  onDelete(input);
                }
              }}
              className="text-[11px] font-bold px-3 py-1.5 rounded-lg text-red-300 bg-red-500/10 hover:bg-red-500/20 border border-red-400/20 transition-colors"
            >
              Delete
            </button>
            {/* Close (mobile only, or always as X) */}
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-white/40 hover:text-white/70 hover:bg-white/10 transition-colors"
              title="Close"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Content area */}
      <div className="flex-1 overflow-y-auto" style={{ backgroundColor: brand.white }}>
        {/* TakeoffPanel for PDFs */}
        {input.inputType === "pdf" && input.processingStatus === "completed" && (
          <TakeoffPanel
            inputId={input.id}
            quoteId={quoteId}
            filename={input.filename || "Drawing"}
            fileUrl={input.fileUrl || undefined}
            processingInstructions={userPrompt}
          />
        )}

        {/* Processing state */}
        {input.processingStatus === "processing" && (
          <div className="px-5 py-4 flex items-center gap-3">
            <Loader2 className="h-4 w-4 animate-spin" style={{ color: brand.teal }} />
            <span className="text-xs font-medium" style={{ color: brand.navy }}>
              Analysing document, this may take up to a minute…
            </span>
          </div>
        )}

        {/* Failed state */}
        {(input.processingStatus === "failed" || input.processingStatus === "error") && (
          <div className="px-5 py-3 flex items-center gap-2" style={{ backgroundColor: "#fef2f2" }}>
            <AlertTriangle className="w-4 h-4 text-red-500" />
            <span className="text-xs text-red-700">
              {input.processingError || "Analysis failed — try re-uploading."}
            </span>
          </div>
        )}

        {/* Voice/text content preview */}
        {input.content && (
          <div className="px-5 py-3" style={{ borderTop: `1px solid ${brand.border}` }}>
            <p className="text-[11px] font-bold mb-1" style={{ color: brand.navy }}>Content</p>
            <p className="text-xs leading-relaxed" style={{ color: brand.navyMuted }}>
              {input.content}
            </p>
          </div>
        )}

        {/* Empty state for unprocessed */}
        {!input.content && input.processingStatus !== "processing" && input.processingStatus !== "completed" && input.processingStatus !== "failed" && input.processingStatus !== "error" && (
          <div className="px-5 py-8 text-center">
            <p className="text-sm font-medium" style={{ color: brand.navyMuted }}>
              Not yet analysed
            </p>
            <button
              onClick={() => onProcess(input)}
              className="mt-3 text-xs font-bold px-4 py-2 rounded-lg transition-colors"
              style={{ backgroundColor: brand.teal, color: "#fff" }}
            >
              Analyse Now
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ==================== MAIN COMPONENT ====================
export default function InputsPanel({
  inputs,
  selectedInputId,
  onSelectInput,
  getTakeoffForInput,
  onProcessInput,
  onDeleteInput,
  onTriggerVoiceAnalysis,
  onTakeoffChanged,
  processingInputId,
  quoteId,
  userPrompt,
}: InputsPanelProps) {
  const isMobile = useIsMobile();
  const selectedInput = inputs.find((i) => i.id === selectedInputId) || null;

  // Auto-select first input on desktop if none selected
  useEffect(() => {
    if (!isMobile && !selectedInputId && inputs.length > 0) {
      onSelectInput(inputs[0].id);
    }
  }, [inputs.length]); // eslint-disable-line react-hooks/exhaustive-deps

  if (inputs.length === 0) return null;

  // ==================== MOBILE: ACCORDION ====================
  if (isMobile) {
    return (
      <div>
        <div className="flex items-center gap-2 mb-3">
          <span className="text-sm font-extrabold" style={{ color: brand.navy }}>Added Inputs</span>
          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ backgroundColor: brand.tealBg, color: brand.teal }}>
            {inputs.length}
          </span>
        </div>
        <div className="flex flex-col gap-2">
          {inputs.map((input) => {
            const isExpanded = selectedInputId === input.id;
            const takeoff = getTakeoffForInput(input.id);

            return (
              <div
                key={input.id}
                className="rounded-xl overflow-hidden transition-all"
                style={{
                  border: `1.5px solid ${isExpanded ? brand.tealBorder : brand.border}`,
                  boxShadow: isExpanded ? `0 4px 16px rgba(13,148,136,0.1)` : "0 1px 3px rgba(0,0,0,0.04)",
                }}
              >
                {/* Collapsed row — always visible */}
                <div
                  onClick={() => onSelectInput(isExpanded ? null : input.id)}
                  className="flex items-center gap-3 px-4 py-3 cursor-pointer transition-colors"
                  style={{ backgroundColor: isExpanded ? brand.tealBg : brand.white }}
                >
                  <FileIcon type={input.inputType} size="sm" approved={takeoff?.status === "verified" || takeoff?.status === "locked"} />
                  <div className="flex-1 min-w-0">
                    <p className="text-[12px] font-bold truncate" style={{ color: brand.navy }}>
                      {input.filename || "Input"}
                    </p>
                    <p className="text-[10px] mt-0.5" style={{ color: brand.navyMuted }}>
                      {new Date(input.createdAt).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
                    </p>
                  </div>
                  <StatusIndicator input={input} takeoff={takeoff} />
                  <svg
                    width="14" height="14" viewBox="0 0 14 14"
                    className="transition-transform"
                    style={{ transform: isExpanded ? "rotate(180deg)" : "rotate(0)" }}
                  >
                    <path d="M3 5 L7 9 L11 5" stroke={brand.navyMuted} strokeWidth="2" fill="none" strokeLinecap="round" />
                  </svg>
                </div>

                {/* Expanded content */}
                {isExpanded && (
                  <DetailContent
                    input={input}
                    takeoff={takeoff}
                    onProcess={onProcessInput}
                    onDelete={(inp) => {
                      onDeleteInput(inp);
                      onSelectInput(null);
                    }}
                    onClose={() => onSelectInput(null)}
                    onTriggerVoiceAnalysis={onTriggerVoiceAnalysis}
                    processingInputId={processingInputId}
                    quoteId={quoteId}
                    userPrompt={userPrompt}
                    isMobile={true}
                  />
                )}
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  // ==================== DESKTOP: SPLIT VIEW ====================
  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <span className="text-sm font-extrabold" style={{ color: brand.navy }}>Added Inputs</span>
        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ backgroundColor: brand.tealBg, color: brand.teal }}>
          {inputs.length}
        </span>
      </div>

      <div
        className="rounded-xl overflow-hidden flex"
        style={{
          border: `1.5px solid ${brand.border}`,
          minHeight: 300,
          maxHeight: "calc(100vh - 320px)",
        }}
      >
        {/* Left sidebar — file list */}
        <div
          className="flex-shrink-0 overflow-y-auto"
          style={{
            width: 240,
            borderRight: `1px solid ${brand.border}`,
            backgroundColor: brand.slate,
          }}
        >
          {inputs.map((input) => {
            const isSelected = selectedInputId === input.id;
            const takeoff = getTakeoffForInput(input.id);
            const isVoiceNote = input.inputType === "audio" && input.content && !input.fileUrl;

            return (
              <div
                key={input.id}
                onClick={() => onSelectInput(input.id)}
                className="flex items-center gap-3 px-3 py-2.5 cursor-pointer transition-all"
                style={{
                  backgroundColor: isSelected ? brand.white : "transparent",
                  borderLeft: `3px solid ${isSelected ? brand.teal : "transparent"}`,
                  borderBottom: `1px solid ${brand.border}`,
                }}
              >
                <div className="flex-shrink-0">
                  <FileIcon type={input.inputType} size="sm" approved={takeoff?.status === "verified" || takeoff?.status === "locked"} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[11px] font-bold truncate" style={{ color: brand.navy }}>
                    {input.filename || "Input"}
                  </p>
                  <p className="text-[9px] mt-0.5" style={{ color: brand.navyMuted }}>
                    {new Date(input.createdAt).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
                  </p>
                  {/* Voice note content preview */}
                  {isVoiceNote && (
                    <p className="text-[8px] mt-0.5 line-clamp-1" style={{ color: brand.navyMuted }}>
                      {input.content}
                    </p>
                  )}
                  {/* Status indicator */}
                  <div className="mt-1">
                    <StatusIndicator input={input} takeoff={takeoff} />
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Right panel — detail */}
        <div className="flex-1 flex flex-col overflow-hidden" style={{ backgroundColor: brand.white }}>
          {selectedInput ? (
            <DetailContent
              input={selectedInput}
              takeoff={getTakeoffForInput(selectedInput.id)}
              onProcess={onProcessInput}
              onDelete={(inp) => {
                onDeleteInput(inp);
                // Select next input or null
                const remaining = inputs.filter((i) => i.id !== inp.id);
                onSelectInput(remaining.length > 0 ? remaining[0].id : null);
              }}
              onClose={() => onSelectInput(null)}
              onTriggerVoiceAnalysis={onTriggerVoiceAnalysis}
              processingInputId={processingInputId}
              quoteId={quoteId}
              userPrompt={userPrompt}
              isMobile={false}
            />
          ) : (
            <div className="flex-1 flex items-center justify-center" style={{ color: brand.navyMuted }}>
              <div className="text-center">
                <FileText className="w-8 h-8 mx-auto mb-2 opacity-30" />
                <p className="text-sm font-medium">Select an input to view details</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
