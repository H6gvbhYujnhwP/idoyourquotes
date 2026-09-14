import "dotenv/config";
import express from "express";
import { createServer } from "http";
import net from "net";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerOAuthRoutes } from "./oauth";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { sdk } from "./sdk";
import { serveStatic, setupVite } from "./vite";
import { registerStripeWebhook } from "../services/stripeWebhook";
import { startEmailScheduler } from "../services/emailScheduler";
import { registerWorktrackrBridge } from "./worktrackrBridge";
import { registerAdminBridge } from "./adminBridge";
import { registerXeroRoutes } from "../services/xeroRoutes";

function isPortAvailable(port: number): Promise<boolean> {
  return new Promise(resolve => {
    const server = net.createServer();
    server.listen(port, () => {
      server.close(() => resolve(true));
    });
    server.on("error", () => resolve(false));
  });
}

async function findAvailablePort(startPort: number = 3000): Promise<number> {
  for (let port = startPort; port < startPort + 20; port++) {
    if (await isPortAvailable(port)) {
      return port;
    }
  }
  throw new Error(`No available port found starting from ${startPort}`);
}

async function startServer() {
  const app = express();
  // Trust Render's reverse proxy — req.ip resolves to the real client IP
  // from X-Forwarded-For, which the auth rate limiter buckets by.
  // Without this, every request would appear to originate from the proxy's
  // IP and rate limiting would block all traffic together. The "1" tells
  // Express to trust exactly one proxy hop (Render's edge), which is the
  // correct setting for our deployment topology.
  app.set("trust proxy", 1);
  const server = createServer(app);

  // Stripe webhook MUST be registered BEFORE body parsers (needs raw body)
  app.use('/api/stripe/webhook', express.raw({ type: 'application/json' }));
  registerStripeWebhook(app);

  // Configure body parser with larger size limit for file uploads
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));
  // OAuth callback under /api/oauth/callback
  registerOAuthRoutes(app);

  // ── Admin bridge ────────────────────────────────────────────────────────────
  // Delivery 2.9 — the companion-app bridge that used to be defined inline here
  // has been retired. The mechanism now lives in ./adminBridge and registers
  // ONLY when ADMIN_BRIDGE_SECRET and ADMIN_BRIDGE_ADMIN_EMAIL are both set;
  // with them unset there is no /admin-bridge route at all. See that file for
  // how to stand a new bridge up.
  //
  // Position: must be AFTER body parsers and BEFORE the SPA static handler
  // (otherwise serveStatic would intercept the route in production).
  registerAdminBridge(app);

  // ── File proxy ──────────────────────────────────────────────────────────────
  // Serves R2 files via an authenticated Express route.
  // Files are stored in R2 with private ACLs; the DB holds /api/file/{key}
  // as the permanent URL. This route authenticates the session cookie and
  // streams the file buffer from R2 on every request — no signed URLs expire.
  // Must be AFTER body parsers and BEFORE tRPC.
  app.get("/api/file/*", async (req, res) => {
    try {
      // Authenticate via session cookie (same mechanism as tRPC context)
      let user = null;
      try {
        user = await sdk.authenticateRequest(req as any);
      } catch {
        // fall through to 401
      }
      if (!user) {
        res.status(401).json({ error: "Unauthorised" });
        return;
      }

      // Extract the R2 key from the URL — everything after /api/file/
      const key = (req.params as any)[0] as string;
      if (!key) {
        res.status(400).json({ error: "Missing file key" });
        return;
      }

      const { getFileBuffer } = await import("../r2Storage");
      const buffer = await getFileBuffer(key);

      // Infer content-type from key extension — browsers need this to display inline
      const ext = key.split(".").pop()?.toLowerCase() || "";
      const mimeMap: Record<string, string> = {
        pdf: "application/pdf",
        png: "image/png",
        jpg: "image/jpeg",
        jpeg: "image/jpeg",
        gif: "image/gif",
        webp: "image/webp",
        svg: "image/svg+xml",
        mp3: "audio/mpeg",
        mp4: "video/mp4",
        wav: "audio/wav",
        m4a: "audio/mp4",
        webm: "audio/webm",
        ogg: "audio/ogg",
        doc: "application/msword",
        docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        xls: "application/vnd.ms-excel",
        xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      };
      const contentType = mimeMap[ext] || "application/octet-stream";

      res.setHeader("Content-Type", contentType);
      res.setHeader("Content-Length", buffer.length);
      // Cache for 5 minutes — balances performance vs freshness after logo updates
      res.setHeader("Cache-Control", "private, max-age=300");
      res.send(buffer);
    } catch (err: any) {
      console.error("[FileProxy] Error serving file:", err?.message || err);
      if (!res.headersSent) {
        res.status(404).json({ error: "File not found" });
      }
    }
  });

  // ── WorkTrackr bridge ───────────────────────────────────────────────────────
  // Read-only catalogue + quotes pull for WorkTrackr. Verifies X-WT-Signature
  // against WORKTRACKR_BRIDGE_SECRET and scopes to WORKTRACKR_BRIDGE_ADMIN_EMAIL's
  // account. Must be before serveStatic so the SPA handler doesn't intercept it.
  registerWorktrackrBridge(app);

  // ── Xero OAuth ──────────────────────────────────────────────────────────────
  // Delivery 2.11 — /api/xero/connect and /api/xero/callback. Full-page
  // browser redirects, so Express rather than tRPC. Must be before
  // serveStatic or the SPA handler intercepts the callback and Xero's
  // response is swallowed by a 404 page.
  registerXeroRoutes(app);

  // tRPC API
  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext,
    })
  );
  // development mode uses Vite, production mode uses static files
  if (process.env.NODE_ENV === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  const preferredPort = parseInt(process.env.PORT || "3000");
  const port = await findAvailablePort(preferredPort);

  if (port !== preferredPort) {
    console.log(`Port ${preferredPort} is busy, using port ${port} instead`);
  }

  server.listen(port, () => {
    console.log(`Server running on http://localhost:${port}/`);
  });

  // Start automated email scheduler
  startEmailScheduler();
}

startServer().catch(console.error);
