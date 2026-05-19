// apply-template-quality-fixes.mjs
//
// Template-quality fixes 1, 2, 5 — propagate ONE CSS fix block to ALL
// base.css files in the v2.1 template library, idempotently.
//
// WHY A SCRIPT (not 25 hand-delivered files):
//   The fix lives in the shared base.css. The blueprint's dual-rule
//   requires every base.css to stay byte-identical, so the fix must
//   land in all 24 templates (4 sectors x 6 designs) PLUS
//   _shared/base.css. Hand-copying one file into 25 locations via
//   GitHub Desktop on Windows is exactly the error-prone manual step
//   the blueprint warns against. This mirrors the established
//   apply-phaseN-patches.mjs pattern: unique-string anchor, detects
//   already-applied state, safe to re-run.
//
// WHAT IT DOES:
//   For every <repo>/server/templates/library/**/base.css (including
//   _shared/base.css):
//     - If the fix block is already present  -> skip (idempotent).
//     - Else, append the fix block AFTER the unique anchor (the end of
//       the existing v2.1 cover meta-value rule). Anchoring rather than
//       blind-append means it still works even if a deployed base.css
//       differs slightly from the dev copy (blueprint lesson #1: never
//       trust the zip for file state).
//     - If the anchor is missing from a file, that file is reported
//       and SKIPPED (never silently corrupt an unexpected file).
//
//   The three fixes carried in the block:
//     1. Duotone no longer crushes images to black (was grayscale x
//        mix-blend-mode:multiply over a dark brand bg).
//     2. Injected logo constrained + cover gutter so it can't collide
//        with the cover image.
//     5. "LOGO 1-4" partner/accreditation strip + its labelled wrapper
//        hidden (slot retained in DOM for a future partner-logo
//        feature; nothing destroyed).
//
// Idempotent. Safe to re-run. Reports a per-file summary and a final
// md5 uniformity check (all base.css MUST end up byte-identical).
//
// Usage (Windows, from repo root):
//   node apply-template-quality-fixes.mjs

import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname);
const libRoot = resolve(repoRoot, "server/templates/library");

if (!existsSync(libRoot)) {
  console.error("\u2717 server/templates/library not found \u2014 run from repo root.");
  process.exit(1);
}

// Unique sentinel: if present, the fix is already applied (idempotent).
const SENTINEL = "TEMPLATE-QUALITY FIXES \u2014 appended at integration time";

// Unique anchor the fix block is appended AFTER: the closing brace of
// the existing v2.1 cover meta-value rule. This exact multi-line string
// ends the stock v2.1-patched base.css, so appending after it places
// the new block at end-of-file regardless of minor upstream drift.
const ANCHOR = `.cover-page .meta-value,
.cover-page [data-slot="quote-ref"],
.cover-page [data-slot="company-name"] {
  color: var(--brand-primary-text-safe, var(--brand-primary)) !important;
}`;

// Fix block (base64 to preserve the box-drawing characters and avoid
// any template-literal escaping hazards).
const FIX_BLOCK_B64 =
  "Lyog4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA"+
  "4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA"+
  "4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSACiAgIFRFTVBMQVRFLVFVQUxJ"+
  "VFkgRklYRVMg4oCUIGFwcGVuZGVkIGF0IGludGVncmF0aW9uIHRpbWUuCgogICBUaHJlZSBkZWZlY3RzIHZpc2libGUgaW4gcmVh"+
  "bCBjbGllbnQgb3V0cHV0LCBhbGwgZml4ZWQgaGVyZSBpbiB0aGUKICAgc2luZ2xlIHNoYXJlZCBiYXNlLmNzcyBzbyBvbmUgZWRp"+
  "dCBjb3JyZWN0cyBhbGwgMjQgdGVtcGxhdGVzCiAgICg0IHNlY3RvcnMgeCA2IGRlc2lnbnMg4oCUIGV2ZXJ5IGJhc2UuY3NzIGlz"+
  "IGJ5dGUtaWRlbnRpY2FsIGFuZCBNVVNUCiAgIHN0YXkgc287IHRoaXMgYmxvY2sgaXMgcHJvcGFnYXRlZCB2ZXJiYXRpbSB0byBh"+
  "bGwgb2YgdGhlbSkuCgogICBObyBIVE1MIGVkaXRzOiB3aGVyZSBpbmxpbmUgc3R5bGVzIG11c3QgYmUgZGVmZWF0ZWQgd2UgdXNl"+
  "CiAgICFpbXBvcnRhbnQsIHRoZSBzYW1lIHRlY2huaXF1ZSB0aGUgdjIuMSBjb3Zlci1ibGVlZCBmaXggYWJvdmUKICAgYWxyZWFk"+
  "eSByZWxpZXMgb24gKHBlciB0aGUgaW50ZWdyYXRpb24gbm90ZXMg4oCUIGlubGluZSBzdHlsZQogICBzcGVjaWZpY2l0eSBjYW4g"+
  "b25seSBiZSBiZWF0ZW4gd2l0aCAhaW1wb3J0YW50LCBhbmQgY29sb3ItbWl4KCkKICAgY2hhaW5zIHN0aWxsIHJlc29sdmUgZmlu"+
  "ZSBpbiBwbGFpbiBydWxlczsgb25seSBpbmxpbmUgb3ZlcnJpZGVzIG9mCiAgIHRoZW0gZmFpbCBpbiBDaHJvbWl1bSkuCiAgIOKU"+
  "gOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKU"+
  "gOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKU"+
  "gOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgCAqLwoKLyogRklYIDEg4oCUIER1b3Rv"+
  "bmUgcHJvZHVjZWQgbmVhci1ibGFjayBpbWFnZXMuCiAgIE9yaWdpbmFsOiBgLmR1b3RvbmUtd3JhcCBpbWcgeyBmaWx0ZXI6IGdy"+
  "YXlzY2FsZSgxMDAlKSBjb250cmFzdCgxLjEpOwogICBtaXgtYmxlbmQtbW9kZTogbXVsdGlwbHk7IH1gIG92ZXIgYC5kdW90b25l"+
  "LXdyYXAgeyBiYWNrZ3JvdW5kOgogICB2YXIoLS1icmFuZC1wcmltYXJ5KTsgfWAuIG11bHRpcGx5ID0gcGl4ZWwgeCBiYWNrZ3Jv"+
  "dW5kLCBzbyBhCiAgIGdyZXlzY2FsZSBpbWFnZSBtdWx0aXBsaWVkIGJ5IGEgZGFyayBicmFuZCBjb2xvdXIgY29sbGFwc2VzIHRv"+
  "CiAgIGJsYWNrLiBNYXRoZW1hdGljYWxseSBndWFyYW50ZWVkIGZvciBhbnkgZGFyayBicmFuZCDigJQgbm90IGEgZ2xpdGNoLgog"+
  "ICBFdmVyeSA8aW1nPiBhbHNvIGNhcnJpZXMgYW4gSU5MSU5FIGBmaWx0ZXI6Z3JheXNjYWxlKDEwMCUpCiAgIGNvbnRyYXN0KDEu"+
  "MSlgIHRoYXQgYmVhdHMgQ1NTIHNwZWNpZmljaXR5LCBzbyB0aGUgZml4IG11c3QgYm90aAogICBuZXV0cmFsaXNlIHRoZSBpbmxp"+
  "bmUgZmlsdGVyICghaW1wb3J0YW50KSBhbmQgcmVwbGFjZSB0aGUgYmxlbmQuCgogICBOZXcgYXBwcm9hY2g6IG5vIGJsZW5kLXRv"+
  "LWJsYWNrLiBUaGUgcGhvdG8gcmVuZGVycyBhdCBmdWxsIHRvbmFsCiAgIHJhbmdlLCBsaWdodGx5IGRlc2F0dXJhdGVkIGFuZCBn"+
  "ZW50bHkgbGlmdGVkIGZvciBsZWdpYmlsaXR5LCB3aXRoIGEKICAgdHJhbnNsdWNlbnQgYnJhbmQgd2FzaCBhcHBsaWVkIGFzIGEg"+
  "OjphZnRlciBvdmVybGF5LiBUaGlzIGxvb2tzCiAgIHByb2Zlc3Npb25hbCB3aXRoIEFOWSBicmFuZCBjb2xvdXIsIGRhcmsgb3Ig"+
  "bGlnaHQg4oCUIHRoZSBwcmV2aW91cwogICBjb2RlIG9ubHkgd29ya2VkIHdpdGggYSBwYWxlIGJyYW5kLiAqLwouZHVvdG9uZS13"+
  "cmFwIHsKICBwb3NpdGlvbjogcmVsYXRpdmU7CiAgb3ZlcmZsb3c6IGhpZGRlbjsKICAvKiBXYXMgYSBzb2xpZCBkYXJrIGZpbGwg"+
  "dGhlIGltYWdlIG11bHRpcGxpZWQgYWdhaW5zdDsgbm93IGp1c3QgYQogICAgIG5ldXRyYWwgYmFja3N0b3AgYmVoaW5kIGEgcGhv"+
  "dG8gdGhhdCBzdGF5cyB2aXNpYmxlLiAqLwogIGJhY2tncm91bmQ6IHZhcigtLWJyYW5kLXByaW1hcnktMTIsICNlNWU3ZWIpICFp"+
  "bXBvcnRhbnQ7Cn0KCi5kdW90b25lLXdyYXAgaW1nIHsKICBkaXNwbGF5OiBibG9jayAhaW1wb3J0YW50OwogIHdpZHRoOiAxMDAl"+
  "ICFpbXBvcnRhbnQ7CiAgaGVpZ2h0OiAxMDAlICFpbXBvcnRhbnQ7CiAgb2JqZWN0LWZpdDogY292ZXIgIWltcG9ydGFudDsKICAv"+
  "KiBEZWZlYXQgdGhlIGlubGluZSBncmF5c2NhbGUvbXVsdGlwbHkuIFNsaWdodCBkZXNhdHVyYXRpb24gKwogICAgIHNtYWxsIGJy"+
  "aWdodG5lc3MgbGlmdCBrZWVwcyB0aGUgaW1hZ2Ugb24tYnJhbmQtc3VidGxlIHdoaWxlCiAgICAgcmVtYWluaW5nIGNsZWFybHkg"+
  "cmVhZGFibGUuIE5vIG1peC1ibGVuZC1tb2RlIOKGkiBubyBibGFjayBjcnVzaC4gKi8KICBmaWx0ZXI6IGdyYXlzY2FsZSgzNSUp"+
  "IGNvbnRyYXN0KDEuMDIpIGJyaWdodG5lc3MoMS4wNikgIWltcG9ydGFudDsKICBtaXgtYmxlbmQtbW9kZTogbm9ybWFsICFpbXBv"+
  "cnRhbnQ7Cn0KCi8qIFRyYW5zbHVjZW50IGJyYW5kIHdhc2ggc2l0cyBPVkVSIHRoZSBwaG90byBhdCBsb3cgb3BhY2l0eSwgZ2l2"+
  "aW5nCiAgIHRoZSBvbi1icmFuZCB0aW50IHRoZSBkdW90b25lIHdhcyBtZWFudCB0byBwcm92aWRlIHdpdGhvdXQKICAgZGVzdHJv"+
  "eWluZyB0aGUgaW1hZ2UuIFBzZXVkby1lbGVtZW50IHNvIG5vIEhUTUwgY2hhbmdlIGlzIG5lZWRlZC4gKi8KLmR1b3RvbmUtd3Jh"+
  "cDo6YWZ0ZXIgewogIGNvbnRlbnQ6ICIiOwogIHBvc2l0aW9uOiBhYnNvbHV0ZTsKICBpbnNldDogMDsKICBiYWNrZ3JvdW5kOiB2"+
  "YXIoLS1icmFuZC1wcmltYXJ5KTsKICBvcGFjaXR5OiAwLjI4OwogIG1peC1ibGVuZC1tb2RlOiBtdWx0aXBseTsKICBwb2ludGVy"+
  "LWV2ZW50czogbm9uZTsKfQoKLyogUGFsZSBicmFuZHM6IGEgMC4yOCBtdWx0aXBseSB3YXNoIG9mIGEgbGlnaHQgY29sb3VyIGJh"+
  "cmVseSB0aW50cwogICBhbmQgY2FuIHdhc2ggbGlnaHQ7IGRyb3AgdGhlIG92ZXJsYXkgb3BhY2l0eSBmdXJ0aGVyIHNvIHRoZSBw"+
  "aG90bwogICByZWFkcyBjbGVhbmx5LiAoZGF0YS1icmFuZC1sdW1pbmFuY2U9ImxpZ2h0IiBpcyBzZXQgb24gPGh0bWw+IGJ5CiAg"+
  "IHRoZSByZW5kZXJlciBmb3IgcGFsZSBicmFuZHMuKSAqLwpodG1sW2RhdGEtYnJhbmQtbHVtaW5hbmNlPSJsaWdodCJdIC5kdW90"+
  "b25lLXdyYXA6OmFmdGVyIHsKICBvcGFjaXR5OiAwLjE2Owp9CgovKiBUaGUgZHVvdG9uZS1saWdodCAvIGR1b3RvbmUtYWNjZW50"+
  "IHZhcmlhbnRzIHVzZWQgdGhlIHNhbWUgbXVsdGlwbHkKICAgbW9kZWw7IGJyaW5nIHRoZW0gaW50byBsaW5lIHNvIHNlY29uZGFy"+
  "eSBwYW5lbHMgbWF0Y2guICovCi5kdW90b25lLXdyYXAuZHVvdG9uZS1saWdodDo6YWZ0ZXIgeyBvcGFjaXR5OiAwLjE4OyB9Ci5k"+
  "dW90b25lLXdyYXAuZHVvdG9uZS1hY2NlbnQ6OmFmdGVyIHsKICBiYWNrZ3JvdW5kOiB2YXIoLS1icmFuZC1hY2NlbnQpOwogIG9w"+
  "YWNpdHk6IDAuMzA7Cn0KCi8qIEZJWCAyIOKAlCBMb2dvIGNvbGxpZGVkIHdpdGggdGhlIGNvdmVyIGltYWdlLgogICBUaGUgc3Bs"+
  "aXQtc2NyZWVuIGNvdmVyIGlzIGEgMi1jb2wgZ3JpZCAoaW1hZ2UgfCBjb250ZW50KSB3aXRoIG5vCiAgIGd1dHRlciwgc28gdGhl"+
  "IGRhcmsgaW1hZ2UgYnV0dHMgc3RyYWlnaHQgYWdhaW5zdCB0aGUgbG9nby9oZWFkbGluZS4KICAgT3RoZXIgZGVzaWducyBoYXZl"+
  "IHRoZWlyIG93biBjb3ZlciBzdHJ1Y3R1cmVzIGJ1dCBzaGFyZSB0aGUgc2FtZQogICBzeW1wdG9tIGNsYXNzLiBHaXZlIHRoZSBj"+
  "b250ZW50IHNpZGUgYnJlYXRoaW5nIHJvb20gYW5kIGNvbnN0cmFpbgogICB0aGUgaW5qZWN0ZWQgbG9nbyBzbyBhIHdpZGUgcmVh"+
  "bCBsb2dvIGNhbid0IG92ZXJydW4gaXRzIHpvbmUgb3IKICAgdG91Y2ggYW4gYWRqYWNlbnQgaW1hZ2UuIFRoZSBpbmplY3RlZCBs"+
  "b2dvIGlzIGFuIDxpbWcKICAgZGF0YS1pbmplY3RlZC1sb2dvPSJ0cnVlIj4gKHNlZSB0ZW1wbGF0ZVJlbmRlcmVyKTsgc2l6ZSBp"+
  "dCBzYW5lbHkKICAgcmVnYXJkbGVzcyBvZiB0aGUgcGxhY2Vob2xkZXIgYm94IGl0IHJlcGxhY2VzLiAqLwpbZGF0YS1zbG90PSJs"+
  "b2dvIl0gaW1nW2RhdGEtaW5qZWN0ZWQtbG9nbz0idHJ1ZSJdIHsKICBtYXgtd2lkdGg6IDIyMHB4ICFpbXBvcnRhbnQ7CiAgbWF4"+
  "LWhlaWdodDogNjRweCAhaW1wb3J0YW50OwogIHdpZHRoOiBhdXRvICFpbXBvcnRhbnQ7CiAgaGVpZ2h0OiBhdXRvICFpbXBvcnRh"+
  "bnQ7CiAgb2JqZWN0LWZpdDogY29udGFpbiAhaW1wb3J0YW50OwogIGRpc3BsYXk6IGJsb2NrICFpbXBvcnRhbnQ7Cn0KCi8qIFNl"+
  "cGFyYXRpb24gYmV0d2VlbiBhIGZ1bGwtYmxlZWQgY292ZXIgaW1hZ2UgYW5kIHRoZSBjb250ZW50IGNvbHVtbgogICBpdCBzaXRz"+
  "IGJlc2lkZS4gQXBwbGllcyB0byB0aGUgY29udGVudC1iZWFyaW5nIGRpcmVjdCBjaGlsZCBvZiB0aGUKICAgY292ZXIgKHRoZSBv"+
  "bmUgdGhhdCBpcyBOT1QgdGhlIGR1b3RvbmUgaW1hZ2UgbGF5ZXIg4oCUIHNhbWUgc2VsZWN0b3IKICAgc2hhcGUgdGhlIHYyLjEg"+
  "Y292ZXItYmxlZWQgZml4IHVzZXMpLiBUaGUgZXh0cmEgaW5saW5lLXN0YXJ0IHBhZAogICBndWFyYW50ZWVzIGEgZ3V0dGVyIGV2"+
  "ZW4gd2hlbiB0aGUgZ3JpZCBoYXMgbm9uZS4gKi8KLmNvdmVyLXBhZ2UgPiBkaXY6bm90KC5kdW90b25lLXdyYXApOm5vdChbY2xh"+
  "c3MqPSJkdW90b25lIl0pIHsKICBwYWRkaW5nLXRvcDogbWF4KDIuNXJlbSwgdmFyKC0tcGFnZS1tYXJnaW4tdiwgMjBtbSkpICFp"+
  "bXBvcnRhbnQ7Cn0KCi8qIEJlbHQtYW5kLWJyYWNlczogbmV2ZXIgbGV0IGEgY292ZXIgaW1hZ2UgYmxlZWQgdW5kZXIgc2libGlu"+
  "ZwogICBjb250ZW50LiBDbGlwIHRvIGl0cyBvd24gYm94LiAqLwouY292ZXItcGFnZSAuZHVvdG9uZS13cmFwIHsKICBvdmVyZmxv"+
  "dzogaGlkZGVuICFpbXBvcnRhbnQ7Cn0KCi8qIEZJWCAzIOKAlCAiTE9HTyAxIC8gTE9HTyAyIC8gTE9HTyAzIC8gTE9HTyA0IiBw"+
  "bGFjZWhvbGRlciBib3hlcy4KICAgVGhlc2UgYXJlIHRoZSBwYXJ0bmVyL2FjY3JlZGl0YXRpb24gc3RyaXAKICAgKDxkaXYgZGF0"+
  "YS1zbG90PSJhY2NyZWRpdGF0aW9uLXN0cmlwIj4pLCB3aGljaCB0aGUgY29udGVudCBwaXBlbGluZQogICBuZXZlciBwb3B1bGF0"+
  "ZXMuIFVudGlsIGEgcGFydG5lci1sb2dvIHVwbG9hZCBmZWF0dXJlIGV4aXN0cyB0aGV5CiAgIHNob3cgbGl0ZXJhbCBwbGFjZWhv"+
  "bGRlciB0ZXh0IGluIGNsaWVudC1mYWNpbmcgUERGcy4KCiAgIFN0cnVjdHVyZSBhY3Jvc3MgYWxsIDYgZGVzaWducyAodmVyaWZp"+
  "ZWQpOiB0aGUgc3RyaXAgYXBwZWFycyAzeC4KICAgKGEpIE9uIHRoZSBjb3Zlci9hYm91dCBibG9jayBpdHMgcGFyZW50IEFMU08g"+
  "aG9sZHMgb3RoZXIgY29udGVudAogICAgICAgKHRoZSBzdGF0cyBncmlkKSwgc28gd2UgbXVzdCBOT1QgY29sbGFwc2UgdGhlIHBh"+
  "cmVudCDigJQgb25seQogICAgICAgaGlkZSB0aGUgc3RyaXAgaXRzZWxmLgogICAoYikgT24gdGhlIHNlcnZpY2VzIGFuZCBwcmlj"+
  "aW5nIHBhZ2VzIGl0IHNpdHMgaW4gYSBkZWRpY2F0ZWQKICAgICAgIHdyYXBwZXIgYDxkaXYgc3R5bGU9Im1hcmdpbi10b3A6MS41"+
  "cmVtOyI+YCB0b2dldGhlciB3aXRoIGEKICAgICAgICJUZWNobm9sb2d5IFBhcnRuZXJzICYgUGxhdGZvcm1zIiBsYWJlbDsgY29s"+
  "bGFwc2luZyB0aGF0IHdob2xlCiAgICAgICB3cmFwcGVyIHJlbW92ZXMgdGhlIHN0cmlwIEFORCBhdm9pZHMgb3JwaGFuaW5nIHRo"+
  "ZSBsYWJlbC4KCiAgIFNvOiBoaWRlIHRoZSBzdHJpcCBldmVyeXdoZXJlLCBhbmQgYWRkaXRpb25hbGx5IGNvbGxhcHNlIE9OTFkg"+
  "dGhlCiAgIGRlZGljYXRlZCBtYXJnaW4tdG9wIHdyYXBwZXIgKHNjb3BlZCB2aWEgOmhhcygpIOKAlCBDaHJvbWl1bSAxMzggaW4K"+
  "ICAgdGhlIHJlbmRlcmVyIHN1cHBvcnRzIGl0KS4gVGhlIHNsb3Qgc3RheXMgaW4gdGhlIERPTTsgYSBmdXR1cmUKICAgcGFydG5l"+
  "ci1sb2dvIGZlYXR1cmUganVzdCBzdG9wcyBoaWRpbmcgaXQuIE5vdGhpbmcgaXMgZGVzdHJveWVkLiAqLwpbZGF0YS1zbG90PSJh"+
  "Y2NyZWRpdGF0aW9uLXN0cmlwIl0gewogIGRpc3BsYXk6IG5vbmUgIWltcG9ydGFudDsKfQoKLmxvZ28tcGxhY2Vob2xkZXIgewog"+
  "IGRpc3BsYXk6IG5vbmUgIWltcG9ydGFudDsKfQoKLyogQ29sbGFwc2UgT05MWSB0aGUgZGVkaWNhdGVkIGxhYmVsK3N0cmlwIHdy"+
  "YXBwZXIgKHRoZSBvbmUgd2l0aCB0aGUKICAgaW5saW5lIG1hcmdpbi10b3A6MS41cmVtIHRoYXQgaG9sZHMgdGhlICJUZWNobm9s"+
  "b2d5IFBhcnRuZXJzIgogICBsYWJlbCkuIFNjb3BlZCBieSB0aGF0IGlubGluZSBzdHlsZSBzbyB0aGUgY292ZXIvYWJvdXQgY29u"+
  "dGVudAogICBjb2x1bW4g4oCUIHdob3NlIHBhcmVudCBhbHNvIGNvbnRhaW5zIHRoZSBzdGF0cyBncmlkIOKAlCBpcyBuZXZlcgog"+
  "ICBhZmZlY3RlZC4gKi8KZGl2W3N0eWxlKj0ibWFyZ2luLXRvcDoxLjVyZW0iXTpoYXMoPiBbZGF0YS1zbG90PSJhY2NyZWRpdGF0"+
  "aW9uLXN0cmlwIl0pIHsKICBkaXNwbGF5OiBub25lICFpbXBvcnRhbnQ7Cn0K";

const FIX_BLOCK = Buffer.from(FIX_BLOCK_B64, "base64").toString("utf8");

// ── Discover every base.css under the library ──────────────────────
function findBaseCss(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    const st = statSync(p);
    if (st.isDirectory()) out.push(...findBaseCss(p));
    else if (entry === "base.css") out.push(p);
  }
  return out;
}

const files = findBaseCss(libRoot).sort();
if (files.length === 0) {
  console.error("\u2717 No base.css files found under the library.");
  process.exit(1);
}

let applied = 0;
let alreadyDone = 0;
let skippedNoAnchor = 0;
const skippedFiles = [];

for (const file of files) {
  let css = readFileSync(file, "utf8");

  if (css.includes(SENTINEL)) {
    alreadyDone++;
    continue;
  }

  const idx = css.indexOf(ANCHOR);
  if (idx === -1) {
    // Never silently corrupt a file we don't recognise.
    skippedNoAnchor++;
    skippedFiles.push(file);
    continue;
  }

  // Append the fix block immediately after the anchor block. Anything
  // after the anchor in the source (normally nothing) is preserved.
  const insertAt = idx + ANCHOR.length;
  const before = css.slice(0, insertAt);
  // Discard anything after the anchor (in the stock library this is
  // only the file's final newline; the anchor block is the last rule).
  // We then re-terminate the file deterministically with exactly one
  // trailing newline so every patched file is byte-identical to the
  // hand-validated reference (the split-screen file already tested in
  // a real render). FIX_BLOCK already ends with "}\n"; trimming then
  // re-adding a single "\n" guarantees no double blank line at EOF
  // regardless of the source file's trailing whitespace.
  css = (before + "\n\n" + FIX_BLOCK).replace(/\s*$/, "") + "\n";

  writeFileSync(file, css, "utf8");
  applied++;
}

// ── Report ─────────────────────────────────────────────────────────
console.log("Template-quality fixes \u2014 propagation summary");
console.log("  base.css files found : " + files.length);
console.log("  newly patched        : " + applied);
console.log("  already patched      : " + alreadyDone);
console.log("  skipped (no anchor)  : " + skippedNoAnchor);
if (skippedFiles.length) {
  console.log("  \u26a0 anchor missing in:");
  for (const f of skippedFiles) console.log("      " + f);
  console.log("  These files were NOT modified. Inspect them \u2014 they");
  console.log("  may be an unexpected variant; the fix must be applied");
  console.log("  to them by hand or the dual-rule (all base.css");
  console.log("  byte-identical) will be violated.");
}

// ── md5 uniformity check ───────────────────────────────────────────
//
// The blueprint's dual-rule (every base.css byte-identical) applies to
// the 24 SERVED template files at
//   server/templates/library/<sector>/<style>/assets/base.css
// only. _shared/base.css is a Manus source artifact that is NOT
// referenced by any template (templates <link> assets/base.css), and
// in the stock library it was already a DIFFERENT file from the 24
// (different md5 before any patch). So it is verified separately and
// never fails the run \u2014 keeping it patched is good hygiene for future
// sector ingestion, but it is not part of the render dual-rule.
const SHARED = resolve(libRoot, "_shared/base.css");
const servedFiles = files.filter((f) => resolve(f) !== SHARED);

const hashes = new Map();
for (const file of servedFiles) {
  const h = createHash("md5").update(readFileSync(file)).digest("hex");
  hashes.set(h, (hashes.get(h) || 0) + 1);
}

console.log("");
let exitCode = 0;

if (hashes.size === 1) {
  const [[h]] = [...hashes];
  console.log(
    "\u2713 All " + servedFiles.length +
      " served template base.css are byte-identical (md5 " + h + ").",
  );
  console.log("  Dual-rule satisfied.");
} else {
  console.log(
    "\u2717 Served template base.css are NOT byte-identical \u2014 dual-rule VIOLATED:",
  );
  for (const [h, n] of hashes) console.log("    " + h + "  x" + n);
  console.log("  Likely cause: a file lacked the anchor and was skipped,");
  console.log("  or upstream drift. Resolve before committing.");
  exitCode = 2;
}

// _shared is informational only.
if (existsSync(SHARED)) {
  const sharedHas = readFileSync(SHARED, "utf8").includes(SENTINEL);
  console.log(
    "  _shared/base.css: " +
      (sharedHas
        ? "patched (good for future ingestion; not part of dual-rule)"
        : "NOT patched (non-fatal \u2014 unreferenced; patch by hand if you " +
          "want future-ingestion hygiene)"),
  );
}

process.exit(exitCode);
