/**
 * Rate limiting for public auth endpoints.
 *
 * Mounted on /api/auth/login and /api/auth/register only — all other
 * routes are unaffected. Uses the IP address as the bucket key, which
 * Render's reverse proxy surfaces via X-Forwarded-For — we tell Express
 * to trust the proxy in index.ts (`app.set('trust proxy', 1)`) so
 * req.ip is the real client IP and not the proxy's.
 *
 * Limits:
 *   - 10 attempts per 15 min per IP
 *   - successful requests do not count against the quota
 *     (skipSuccessfulRequests: true) — a user who logs in fine, signs
 *     out, and logs back in 5 times in a row will not get rate-limited
 *   - only failures count, which is the brute-force vector we care about
 *
 * On limit-exceeded the limiter sends a 429 with a JSON body shaped to
 * match the existing auth error responses { error: string }, so the
 * existing login/register form error handler renders the message
 * straight into the UI without any client-side change.
 */
import rateLimit from "express-rate-limit";

export const authRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,           // 15 minutes
  limit: 10,                          // 10 requests per windowMs per IP
  standardHeaders: "draft-7",         // RateLimit-* headers (IETF draft 7)
  legacyHeaders: false,               // disable X-RateLimit-* legacy headers
  skipSuccessfulRequests: true,       // only count failed attempts
  // Custom 429 handler so the response body matches the existing
  // { error: string } shape that the auth form already understands.
  handler: (req, res, _next, options) => {
    res.status(options.statusCode).json({
      error: "Too many attempts, please try again in 15 minutes.",
    });
  },
});
