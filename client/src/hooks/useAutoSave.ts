/**
 * useAutoSave — debounced field-level save hook for the unified workspace.
 *
 * The unified QuoteWorkspace writes every field edit to the server with a
 * short debounce so the user never has to hit "Save". The footer
 * "● All changes saved" indicator reflects the drain state of this hook's
 * internal queue.
 *
 * Usage (one hook per field-group / row is fine — they're independent):
 *
 *   const save = useAutoSave(
 *     (patch: Partial<LineItemPatch>) => updateLineItem.mutateAsync({
 *       id: row.id,
 *       quoteId,
 *       ...patch,
 *     }),
 *     500,
 *   );
 *
 *   <input onChange={(e) => save({ description: e.target.value })} />
 *
 * The hook coalesces rapid-fire patches within the debounce window:
 * subsequent calls overwrite fields of the same name and the server
 * receives the most-recent merged patch. Fields not mentioned in later
 * calls are preserved from earlier ones.
 *
 * isPending reflects "unsaved work is queued or in-flight" — use it to
 * drive the footer indicator.
 */
import { useCallback, useEffect, useRef, useState } from "react";

export function useAutoSave<T extends Record<string, unknown>>(
  mutate: (patch: T) => Promise<unknown>,
  debounceMs: number = 500,
) {
  const [isPending, setIsPending] = useState(false);
  const [lastError, setLastError] = useState<string | null>(null);

  // Merged patch accumulated during the debounce window
  const pendingPatchRef = useRef<Partial<T> | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inFlightRef = useRef<boolean>(false);

  const flush = useCallback(async () => {
    if (!pendingPatchRef.current) {
      setIsPending(false);
      return;
    }
    const patch = pendingPatchRef.current;
    pendingPatchRef.current = null;
    inFlightRef.current = true;
    try {
      await mutate(patch as T);
      setLastError(null);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Save failed";
      setLastError(msg);
    } finally {
      inFlightRef.current = false;
      // If more patches queued while this one was in-flight, flush again.
      if (pendingPatchRef.current) {
        void flush();
      } else {
        setIsPending(false);
      }
    }
  }, [mutate]);

  const save = useCallback(
    (patch: Partial<T>) => {
      // Merge into the pending patch (last-write-wins per field)
      pendingPatchRef.current = {
        ...(pendingPatchRef.current || {}),
        ...patch,
      } as Partial<T>;
      setIsPending(true);

      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
      timerRef.current = setTimeout(() => {
        // If a previous flush is in-flight, let its finally-block pick up
        // the queued patch rather than firing concurrently.
        if (!inFlightRef.current) {
          void flush();
        }
      }, debounceMs);
    },
    [debounceMs, flush],
  );

  // Flush on unmount so we don't drop the last edit when the user navigates away.
  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      if (pendingPatchRef.current && !inFlightRef.current) {
        void flush();
      }
    };
  }, [flush]);

  return { save, isPending, lastError };
}
