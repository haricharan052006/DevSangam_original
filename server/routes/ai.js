const express = require('express');
const authMiddleware = require('../middleware/auth');
const { aiLimiter } = require('../middleware/rateLimiter');
const { analyzeCode, isAiConfigured, VALID_ACTIONS } = require('../services/aiService');

const router = express.Router();
// authMiddleware first so req.user is populated by the time aiLimiter keys
// its bucket off the signed-in user (falling back to IP otherwise).
router.use(authMiddleware);
router.use(aiLimiter);

router.post('/analyze', async (req, res) => {
  const { code, language, action, selection } = req.body || {};

  if (!VALID_ACTIONS.includes(action)) {
    return res.status(400).json({ error: `action must be one of: ${VALID_ACTIONS.join(', ')}` });
  }
  if (!code || !String(code).trim()) {
    return res.status(400).json({ error: 'code is required' });
  }
  if (!isAiConfigured()) {
    console.log('[ai] analyze rejected: GEMINI_API_KEY is not configured');
    return res.status(503).json({ error: 'AI Assistant is not configured on this server (missing GEMINI_API_KEY)' });
  }

  try {
    const markdown = await analyzeCode({ code, language: language || 'plaintext', action, selection });
    res.json({ markdown });
  } catch (err) {
    console.error(`[ai] analyze failed (action=${action}): ${err.message}`);
    res.status(502).json({ error: 'The AI request failed. Please try again in a moment.' });
  }
});

module.exports = router;
