import "dotenv/config";
import express from "express";
import { createServer } from "http";
import net from "net";
import crypto from "crypto";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";
import { registerOAuthRoutes } from "./oauth";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { sdk } from "./sdk";
import { getSessionCookieOptions } from "./cookies";
import { serveStatic, setupVite } from "./vite";
import { registerStripeWebhook } from "../services/stripeWebhook";
import { startEmailScheduler } from "../services/emailScheduler";

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

  // ── Studio bridge ───────────────────────────────────────────────────────────
  // Allows TGA Studio (studio.thegreenagents.com) to embed this app's admin
  // panel without a second login. Studio's backend signs a 60-second HMAC
  // ticket with the shared STUDIO_BRIDGE_SECRET; this endpoint verifies the
  // ticket, mints a real session cookie for the dedicated bridge admin user
  // (STUDIO_BRIDGE_ADMIN_EMAIL), and redirects to /manage-7k9x2m4q8r.
  //
  // Ticket format: <expiry-unix-seconds>.<nonce>.<HMAC-SHA256-hex>
  // HMAC is computed over "<expiry>.<nonce>" using the shared secret.
  //
  // Env vars (both required):
  //   STUDIO_BRIDGE_SECRET       — long random hex, must match
  //                                IDYQ_BRIDGE_SECRET on Studio's Render env
  //   STUDIO_BRIDGE_ADMIN_EMAIL  — email of the dedicated bridge admin user
  //                                in this app's `users` table; user must
  //                                have role='admin' and is_active=true
  //
  // Position: must be AFTER body parsers and BEFORE the SPA static handler
  // (otherwise serveStatic would intercept the route in production).
  app.get("/admin-bridge", async (req, res) => {
    try {
      const secret = process.env.STUDIO_BRIDGE_SECRET;
      const bridgeEmail = process.env.STUDIO_BRIDGE_ADMIN_EMAIL;
      if (!secret || !bridgeEmail) {
        console.warn("[admin-bridge] STUDIO_BRIDGE_SECRET or STUDIO_BRIDGE_ADMIN_EMAIL not configured");
        res.status(500).send("Bridge not configured on this server");
        return;
      }

      const ticket = String((req.query as any).ticket || "").trim();
      if (!ticket) {
        res.status(400).send("Missing ticket");
        return;
      }

      const parts = ticket.split(".");
      if (parts.length !== 3) {
        console.warn("[admin-bridge] Malformed ticket");
        res.status(400).send("Malformed ticket");
        return;
      }
      const [expiryStr, nonce, signature] = parts;

      // Verify signature with constant-time comparison to avoid timing leaks
      const expectedSig = crypto.createHmac("sha256", secret).update(`${expiryStr}.${nonce}`).digest("hex");
      const sigBuf = Buffer.from(signature, "hex");
      const expBuf = Buffer.from(expectedSig, "hex");
      if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
        console.warn("[admin-bridge] Invalid signature");
        res.status(403).send("Invalid ticket");
        return;
      }

      // Verify expiry
      const expiry = parseInt(expiryStr, 10);
      if (!Number.isFinite(expiry) || expiry < Math.floor(Date.now() / 1000)) {
        console.warn("[admin-bridge] Expired ticket");
        res.status(403).send("Expired ticket — reload the embed in Studio to mint a fresh one");
        return;
      }

      // Look up the bridge admin user. Lazy-import the db helper to mirror the
      // file-proxy pattern below and avoid pulling drizzle into module init.
      const { getUserByEmail } = await import("../db");
      const user = await getUserByEmail(bridgeEmail);
      if (!user || (user as any).role !== "admin" || !(user as any).isActive) {
        console.warn(`[admin-bridge] Bridge user ${bridgeEmail} not found, not admin, or inactive`);
        res.status(403).send("Bridge user invalid");
        return;
      }

      // Mint a real session cookie for the bridge user. Same path as a
      // normal login — no separate session type, so the existing
      // adminProcedure middleware accepts it without changes.
      const token = await sdk.createSessionToken(Number(user.id), user.email, { name: user.name || "" });
      const cookieOpts = getSessionCookieOptions(req as any);
      res.cookie(COOKIE_NAME, token, { ...cookieOpts, maxAge: ONE_YEAR_MS });

      // 302 to the admin panel. Cookie is now set; AdminPanel renders normally.
      res.redirect("/manage-7k9x2m4q8r");
    } catch (err: any) {
      console.error("[admin-bridge] error:", err?.message || err);
      if (!res.headersSent) {
        res.status(500).send("Bridge error");
      }
    }
  });

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
