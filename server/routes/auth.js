const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../db');
const authMiddleware = require('../middleware/auth');
const { authLimiter } = require('../middleware/rateLimiter');
const passport = require('../config/passport');

const router = express.Router();

const { USER_COLUMNS } = db;

const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';
const RESET_TOKEN_EXPIRES_IN = '15m';
const CLIENT_URL = process.env.CLIENT_URL || 'http://localhost:5173';
const RESET_TOKEN_PURPOSE = 'password-reset';
const MAX_NAME_LENGTH = 60;

function signToken(user) {
  return jwt.sign(
    { id: user.id, name: user.name, email: user.email },
    process.env.JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN }
  );
}

function signResetToken(user) {
  return jwt.sign(
    { purpose: RESET_TOKEN_PURPOSE, id: user.id, email: user.email },
    process.env.JWT_SECRET,
    { expiresIn: RESET_TOKEN_EXPIRES_IN }
  );
}

function sanitizeUser(user) {
  const { passwordHash, ...safe } = user;
  return safe;
}

function normalizeEmail(email) {
  return String(email).trim().toLowerCase();
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

router.post('/register', authLimiter, async (req, res) => {
  const { name, email, password } = req.body || {};

  if (!name || !String(name).trim() || !password || !email) {
    return res.status(400).json({ error: 'name, email and password are required' });
  }
  const trimmedName = String(name).trim();
  if (trimmedName.length > MAX_NAME_LENGTH) {
    return res.status(400).json({ error: `Name must be ${MAX_NAME_LENGTH} characters or fewer` });
  }
  const trimmedEmail = String(email).trim();
  if (!EMAIL_RE.test(trimmedEmail)) {
    return res.status(400).json({ error: 'Please enter a valid email address' });
  }
  if (password.length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters' });
  }

  const normalizedEmail = normalizeEmail(trimmedEmail);

  try {
    const emailTaken = await db.query('SELECT id FROM users WHERE email = $1', [normalizedEmail]);
    if (emailTaken.rows[0]) {
      console.log(`[auth] register failed: email already in use (${normalizedEmail})`);
      return res.status(409).json({ error: 'An account with this email is already registered.' });
    }

    const passwordHash = bcrypt.hashSync(password, 10);
    const result = await db.query(
      `INSERT INTO users (name, email, password_hash)
       VALUES ($1, $2, $3)
       RETURNING ${USER_COLUMNS}`,
      [trimmedName, normalizedEmail, passwordHash]
    );
    const user = result.rows[0];
    const token = signToken(user);

    res.status(201).json({ token, user: sanitizeUser(user) });
  } catch (err) {
    console.error(`[auth] register failed unexpectedly: ${err.message}`);
    res.status(500).json({ error: 'Registration failed. Please try again.' });
  }
});

router.post('/login', authLimiter, async (req, res) => {
  const { email, password } = req.body || {};

  if (!email || !password) {
    return res.status(400).json({ error: 'email and password are required' });
  }

  const normalizedEmail = normalizeEmail(email);

  try {
    const result = await db.query(`SELECT ${USER_COLUMNS} FROM users WHERE email = $1`, [normalizedEmail]);
    const user = result.rows[0];

    if (!user) {
      console.log(`[auth] login failed: no user found for email "${normalizedEmail}"`);
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Google-only accounts have no passwordHash — password login is never
    // valid for them (they aren't told which providers are available, same
    // as any other "Invalid credentials" case, to avoid leaking account state).
    if (!user.passwordHash || !bcrypt.compareSync(password, user.passwordHash)) {
      console.log(`[auth] login failed: password mismatch for user "${user.email}" (id ${user.id})`);
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const token = signToken(user);
    res.json({ token, user: sanitizeUser(user) });
  } catch (err) {
    console.error(`[auth] login failed unexpectedly: ${err.message}`);
    res.status(500).json({ error: 'Login failed. Please try again.' });
  }
});

router.get('/me', authMiddleware, async (req, res) => {
  try {
    const result = await db.query(`SELECT ${USER_COLUMNS} FROM users WHERE id = $1`, [req.user.id]);
    const user = result.rows[0];
    if (!user) {
      console.log(`[auth] /me failed: no user found for id ${req.user.id}`);
      return res.status(404).json({ error: 'User not found' });
    }
    res.json({ user: sanitizeUser(user) });
  } catch (err) {
    console.error(`[auth] /me failed unexpectedly: ${err.message}`);
    res.status(500).json({ error: 'Failed to load account' });
  }
});

// Display name only — not a login handle, so there's nothing to check for
// uniqueness. Any signed-in user can set it to whatever they like.
router.put('/update-name', authMiddleware, async (req, res) => {
  const { name } = req.body || {};

  if (!name || !String(name).trim()) {
    return res.status(400).json({ error: 'name is required' });
  }
  const trimmed = String(name).trim();
  if (trimmed.length > MAX_NAME_LENGTH) {
    return res.status(400).json({ error: `Name must be ${MAX_NAME_LENGTH} characters or fewer` });
  }

  try {
    const result = await db.query(
      `UPDATE users SET name = $1 WHERE id = $2 RETURNING id, name, email, avatar_url AS "avatarUrl"`,
      [trimmed, req.user.id]
    );
    const user = result.rows[0];
    if (!user) {
      console.log(`[auth] update-name failed: no user found for id ${req.user.id}`);
      return res.status(404).json({ error: 'User not found' });
    }

    console.log(`[auth] display name updated for user ${user.id}: "${trimmed}"`);
    res.json({ user });
  } catch (err) {
    console.error(`[auth] update-name failed unexpectedly: ${err.message}`);
    res.status(500).json({ error: 'Failed to update display name' });
  }
});

// ---- Google OAuth: sign in / sign up, and "Recover with Google" reset ----
//
// One Google strategy, two intents, distinguished by the `state` param that
// round-trips through the OAuth flow untouched: /google kicks off a normal
// sign-in/sign-up, /google/recover kicks off account recovery. Both land on
// the same /google/callback, which branches on req.query.state.

router.get('/google', passport.authenticate('google', { scope: ['profile', 'email'], session: false, state: 'login' }));

router.get(
  '/google/recover',
  passport.authenticate('google', { scope: ['profile', 'email'], session: false, state: 'recover' })
);

router.get(
  '/google/callback',
  passport.authenticate('google', { session: false, failureRedirect: `${CLIENT_URL}/login?error=google_auth_failed` }),
  async (req, res) => {
    const profile = req.user;
    const intent = req.query.state === 'recover' ? 'recover' : 'login';

    const googleId = profile.id;
    const rawEmail = profile.emails?.[0]?.value;
    const email = rawEmail ? normalizeEmail(rawEmail) : null;
    const avatarUrl = profile.photos?.[0]?.value || null;
    const name = profile.displayName || (rawEmail ? rawEmail.split('@')[0] : 'DevSangam User');

    if (!email) {
      const errorPath = intent === 'recover' ? '/forgot-password' : '/login';
      console.log('[auth] google callback failed: profile had no email (was the "email" scope granted?)');
      return res.redirect(`${CLIENT_URL}${errorPath}?error=google_no_email`);
    }

    try {
      if (intent === 'recover') {
        const result = await db.query(`SELECT ${USER_COLUMNS} FROM users WHERE email = $1`, [email]);
        const user = result.rows[0];
        if (!user) {
          console.log(`[auth] google recover failed: no account for email "${email}"`);
          return res.redirect(`${CLIENT_URL}/forgot-password?error=no_matching_account`);
        }
        const resetToken = signResetToken(user);
        console.log(`[auth] google recover: issued reset token for user ${user.id}`);
        return res.redirect(`${CLIENT_URL}/reset-password?resetToken=${resetToken}&email=${encodeURIComponent(user.email)}`);
      }

      const lookup = await db.query(`SELECT ${USER_COLUMNS} FROM users WHERE google_id = $1 OR email = $2`, [googleId, email]);
      let user = lookup.rows[0];
      if (user) {
        if (user.googleId !== googleId) {
          const updated = await db.query(
            `UPDATE users SET google_id = $1 WHERE id = $2 RETURNING ${USER_COLUMNS}`,
            [googleId, user.id]
          );
          user = updated.rows[0];
        }
      } else {
        const inserted = await db.query(
          `INSERT INTO users (name, email, google_id, avatar_url)
           VALUES ($1, $2, $3, $4)
           RETURNING ${USER_COLUMNS}`,
          [name, email, googleId, avatarUrl]
        );
        user = inserted.rows[0];
        console.log(`[auth] google login: created new account ${user.id} (${email})`);
      }

      const token = signToken(user);
      return res.redirect(`${CLIENT_URL}/login?token=${token}`);
    } catch (err) {
      console.error(`[auth] google callback failed unexpectedly: ${err.message}`);
      return res.redirect(`${CLIENT_URL}/login?error=google_auth_failed`);
    }
  }
);

router.post('/reset-password-token', authLimiter, async (req, res) => {
  const { resetToken, newPassword } = req.body || {};

  if (!resetToken || !newPassword) {
    return res.status(400).json({ error: 'resetToken and newPassword are required' });
  }
  if (newPassword.length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters' });
  }

  let payload;
  try {
    payload = jwt.verify(resetToken, process.env.JWT_SECRET);
  } catch {
    return res.status(400).json({ error: 'Reset link is invalid or has expired' });
  }
  if (payload.purpose !== RESET_TOKEN_PURPOSE || !payload.id) {
    return res.status(400).json({ error: 'Reset link is invalid or has expired' });
  }

  try {
    const passwordHash = bcrypt.hashSync(newPassword, 10);
    const result = await db.query('UPDATE users SET password_hash = $1 WHERE id = $2 RETURNING id', [passwordHash, payload.id]);
    if (!result.rows[0]) {
      console.log(`[auth] reset-password-token failed: no user found for id ${payload.id}`);
      return res.status(404).json({ error: 'Account not found' });
    }

    console.log(`[auth] password reset via Google recovery for user ${payload.id}`);
    res.json({ message: 'Password reset successful' });
  } catch (err) {
    console.error(`[auth] reset-password-token failed unexpectedly: ${err.message}`);
    res.status(500).json({ error: 'Failed to reset password' });
  }
});

module.exports = router;
