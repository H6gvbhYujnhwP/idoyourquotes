/**
 * MetaPixelTracker — fires fbq('track', 'PageView') on every wouter
 * route change after the initial page load.
 *
 * Why this is needed:
 *   The Meta Pixel base snippet in client/index.html runs once on
 *   first page load and fires the initial PageView. After that, this
 *   app is a single-page application — wouter route changes do NOT
 *   reload the document, so without this tracker, navigations from
 *   /pricing → /features → /register would silently not be tracked.
 *   Meta would see one page view per session instead of every page
 *   the visitor actually viewed, which severely undercounts traffic
 *   for ad audiences and weakens conversion attribution.
 *
 * Behaviour:
 *   - Skips the very first render. The base snippet in index.html
 *     has already fired the initial PageView for that location;
 *     firing again here would double-count it.
 *   - On every subsequent wouter location change, fires
 *     fbq('track', 'PageView').
 *   - Defensive: only calls fbq if it's actually loaded on window.
 *     If Meta is blocked by an ad-blocker or fbevents.js fails to
 *     load, the tracker is silently inert rather than throwing.
 *
 * Mount once near the top of the component tree in App.tsx. The
 * component renders nothing.
 */
import { useEffect, useRef } from "react";
import { useLocation } from "wouter";

declare global {
  interface Window {
    fbq?: (...args: unknown[]) => void;
  }
}

export default function MetaPixelTracker() {
  const [location] = useLocation();
  const isFirstRender = useRef(true);

  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    if (typeof window !== "undefined" && typeof window.fbq === "function") {
      window.fbq("track", "PageView");
    }
  }, [location]);

  return null;
}
