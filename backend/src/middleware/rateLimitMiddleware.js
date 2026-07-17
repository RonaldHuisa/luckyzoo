const { getClientIp } = require("../services/securityService");

function toPositiveNumber(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function normalizePath(pathname = "") {
  return String(pathname || "")
    .replace(/\?.*$/, "")
    .replace(/\/+/g, "/")
    .slice(0, 160);
}

function createRateLimiter({
  name = "rate-limit",
  windowMs = 60 * 1000,
  max = 120,
  blockMs = 0,
  message = "Demasiadas solicitudes. Intenta nuevamente en unos minutos.",
  keyPrefix = "global",
  perRoute = false,
  skip = null,
} = {}) {
  const hits = new Map();
  let lastCleanupAt = Date.now();

  function cleanup(now) {
    if (now - lastCleanupAt < Math.max(windowMs, 60 * 1000)) return;
    lastCleanupAt = now;

    for (const [key, bucket] of hits.entries()) {
      const windowExpired = now - bucket.windowStart > windowMs;
      const blockExpired = !bucket.blockedUntil || now > bucket.blockedUntil;

      if (windowExpired && blockExpired) {
        hits.delete(key);
      }
    }
  }

  return function rateLimiter(req, res, next) {
    if (req.method === "OPTIONS") return next();
    if (typeof skip === "function" && skip(req)) return next();

    const now = Date.now();
    cleanup(now);

    const ip = getClientIp(req) || "unknown";
    const routeKey = perRoute ? normalizePath(req.originalUrl || req.url) : "*";
    const key = `${keyPrefix}:${ip}:${routeKey}`;

    let bucket = hits.get(key);

    if (!bucket || now - bucket.windowStart > windowMs) {
      bucket = {
        count: 0,
        windowStart: now,
        blockedUntil: 0,
      };
      hits.set(key, bucket);
    }

    if (bucket.blockedUntil && now < bucket.blockedUntil) {
      const retryAfterSeconds = Math.max(1, Math.ceil((bucket.blockedUntil - now) / 1000));
      res.set("Retry-After", String(retryAfterSeconds));
      return res.status(429).json({
        message,
        code: "RATE_LIMITED",
      });
    }

    bucket.count += 1;

    const remaining = Math.max(0, max - bucket.count);
    res.set("X-RateLimit-Limit", String(max));
    res.set("X-RateLimit-Remaining", String(remaining));

    if (bucket.count > max) {
      bucket.blockedUntil = blockMs > 0 ? now + blockMs : now + windowMs;
      const retryAfterSeconds = Math.max(1, Math.ceil((bucket.blockedUntil - now) / 1000));
      res.set("Retry-After", String(retryAfterSeconds));

      console.warn("RATE LIMIT BLOCKED:", {
        name,
        ip,
        route: routeKey,
        count: bucket.count,
        max,
        retryAfterSeconds,
      });

      return res.status(429).json({
        message,
        code: "RATE_LIMITED",
      });
    }

    return next();
  };
}

const apiRateLimiter = createRateLimiter({
  name: "api-general",
  keyPrefix: "api",
  windowMs: toPositiveNumber(process.env.API_RATE_LIMIT_WINDOW_MS, 60 * 1000),
  max: toPositiveNumber(process.env.API_RATE_LIMIT_MAX, 180),
  blockMs: toPositiveNumber(process.env.API_RATE_LIMIT_BLOCK_MS, 2 * 60 * 1000),
  message: "Demasiadas solicitudes. Intenta nuevamente en unos minutos.",
  perRoute: false,
  skip: (req) => String(req.originalUrl || req.url || "").startsWith("/api/webhooks/alchemy"),
});

const registerRateLimiter = createRateLimiter({
  name: "auth-register",
  keyPrefix: "register",
  windowMs: toPositiveNumber(process.env.REGISTER_RATE_LIMIT_WINDOW_MS, 15 * 60 * 1000),
  max: toPositiveNumber(process.env.REGISTER_RATE_LIMIT_MAX, 8),
  blockMs: toPositiveNumber(process.env.REGISTER_RATE_LIMIT_BLOCK_MS, 30 * 60 * 1000),
  message: "No se puede completar el registro en este momento. Intenta nuevamente más tarde.",
  perRoute: false,
});

const loginRateLimiter = createRateLimiter({
  name: "auth-login",
  keyPrefix: "login",
  windowMs: toPositiveNumber(process.env.LOGIN_RATE_LIMIT_WINDOW_MS, 15 * 60 * 1000),
  max: toPositiveNumber(process.env.LOGIN_RATE_LIMIT_MAX, 25),
  blockMs: toPositiveNumber(process.env.LOGIN_RATE_LIMIT_BLOCK_MS, 15 * 60 * 1000),
  message: "Demasiados intentos de inicio de sesión. Intenta nuevamente más tarde.",
  perRoute: false,
});

module.exports = {
  createRateLimiter,
  apiRateLimiter,
  registerRateLimiter,
  loginRateLimiter,
};
