const { rateLimit, ipKeyGenerator } = require('express-rate-limit');

function jsonHandler(message) {
  return (req, res) => {
    res.status(429).json({ error: message });
  };
}

// Login/register/reset-password-token: the highest-value targets for
// credential stuffing, brute-forcing, and account-enumeration abuse. Keyed
// by IP (the default) since these requests happen before anyone is
// authenticated.
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 15,
  standardHeaders: true,
  legacyHeaders: false,
  handler: jsonHandler('Too many authentication attempts. Please wait a while before trying again.'),
});

// AI Assistant: protects the Gemini API token quota, not the server itself —
// keyed per signed-in user (authMiddleware runs before this in ai.js, so
// req.user is already populated) so one heavy user's usage can't eat into
// everyone else's shared per-IP bucket. ipKeyGenerator normalizes the IP
// fallback for IPv6 safety, matching what this package does internally for
// its own default keying.
const aiLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 12,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => (req.user?.id ? `user:${req.user.id}` : ipKeyGenerator(req)),
  handler: jsonHandler('Too many AI requests. Please wait a moment before trying again.'),
});

// Blanket ceiling across the rest of the REST API — applied on top of, not
// instead of, the stricter limiters above (a request to /api/auth/login
// counts against both its own bucket and this one).
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 200,
  standardHeaders: true,
  legacyHeaders: false,
  handler: jsonHandler('Too many requests. Please slow down and try again shortly.'),
});

module.exports = { authLimiter, aiLimiter, generalLimiter };
