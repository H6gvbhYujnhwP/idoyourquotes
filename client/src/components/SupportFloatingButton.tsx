/**
 * SupportFloatingButton — Phase 4B Delivery E.13.
 *
 * Round teal button pinned to the bottom-right corner of every signed-
 * in page. Lives inside DashboardLayout so every authenticated route
 * inherits it without per-page wiring. Hidden on the AdminPanel
 * because /manage-7k9x2m4q8r is rendered without DashboardLayout.
 *
 * Click opens the SupportDrawer (right-side Sheet, ~400px wide) which
 * houses the chat. The button stays mounted while the drawer is open
 * so closing the drawer (X or click-outside) returns focus naturally.
 *
 * Z-index sits above page content but below shadcn dialogs (which use
 * z-50). The button uses z-40 so an open Quote-export modal will not
 * be obscured by it.
 */

import { useState } from "react";
import { Headphones } from "lucide-react";
import { brand } from "@/lib/brandTheme";
import SupportDrawer from "./SupportDrawer";

export default function SupportFloatingButton() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Open support chat"
        title="Need help?"
        style={{
          position: "fixed",
          right: 24,
          bottom: 24,
          width: 56,
          height: 56,
          borderRadius: 9999,
          background: brand.teal,
          border: "none",
          color: "#ffffff",
          cursor: "pointer",
          boxShadow: "0 8px 24px rgba(13,148,136,0.35)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          zIndex: 40,
          transition: "transform 150ms ease, background-color 150ms ease",
        }}
        onMouseEnter={(e) => {
          (e.currentTarget as HTMLButtonElement).style.background = brand.tealLight;
          (e.currentTarget as HTMLButtonElement).style.transform = "scale(1.05)";
        }}
        onMouseLeave={(e) => {
          (e.currentTarget as HTMLButtonElement).style.background = brand.teal;
          (e.currentTarget as HTMLButtonElement).style.transform = "scale(1)";
        }}
      >
        <Headphones size={24} />
      </button>

      <SupportDrawer open={open} onOpenChange={setOpen} />
    </>
  );
}
