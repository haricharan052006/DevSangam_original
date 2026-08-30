const path = require('path');

// Resolve .env relative to this file, not process.cwd() — cwd varies with how
// the process is launched (plain `node index.js` from /server, `npm run dev
// --prefix server` from the repo root via concurrently, nodemon, etc.), and a
// cwd-relative `dotenv.config()` silently loading zero vars (or the wrong
// file) is exactly the kind of thing that looks like "the .env isn't being
// read" when it's actually just being read from the wrong place.
require('dotenv').config({ path: path.resolve(__dirname, '.env') });

const http = require('http');
const express = require('express');
const cors = require('cors');
const passport = require('./config/passport');

const db = require('./db');
const authRoutes = require('./routes/auth');
const workspaceRoutes = require('./routes/workspaces');
const aiRoutes = require('./routes/ai');
const { attachYjsServer } = require('./collab/yjs');
const { attachExecServer } = require('./collab/execSocket');
const { generalLimiter } = require('./middleware/rateLimiter');

const app = express();
const PORT = process.env.PORT || 5000;

// Comma-separated allow-list for production (e.g. your Vercel client URL)
// takes priority when set. Otherwise falls back to CLIENT_URL — the same
// origin Google OAuth redirects back to — so CORS tracks wherever the
// client is actually configured to run instead of reflecting any origin.
const corsOrigins = process.env.CORS_ORIGIN
  ? process.env.CORS_ORIGIN.split(',').map((s) => s.trim())
  : process.env.CLIENT_URL || 'http://localhost:5173';

app.use(cors({ origin: corsOrigins }));
app.use(express.json());
app.use(passport.initialize());

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Blanket rate-limit ceiling across the whole REST API; routes/auth.js and
// routes/ai.js layer their own stricter limiters on top of specific paths.
app.use('/api', generalLimiter);

app.use('/api/auth', authRoutes);
app.use('/api/workspaces', workspaceRoutes);
app.use('/api/ai', aiRoutes);

const server = http.createServer(app);
attachYjsServer(server);
attachExecServer(server);

db.initDb()
  .then(() => {
    server.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
    });
  })
  .catch((err) => {
    console.error('[db] failed to initialize Postgres schema — server not started:', err.message);
    process.exit(1);
  });
