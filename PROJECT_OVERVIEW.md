# DevSangam — Comprehensive Project Overview

> **"The Confluence of Developers"** — A real-time collaborative code editor with CRDT-synced editing, sandboxed multi-language execution, role-based governance, AI-assisted code review, and WebRTC voice communication.

---

## Table of Contents

1. [Executive Summary & Architecture Overview](#1-executive-summary--architecture-overview)
2. [Frontend Deep Dive (`/client`)](#2-frontend-deep-dive-client)
3. [Backend Deep Dive (`/server`)](#3-backend-deep-dive-server)
4. [Authentication & Security](#4-authentication--security)
5. [API Reference & WebSocket Protocols](#5-api-reference--websocket-protocols)
6. [Deployment & Environment Configurations](#6-deployment--environment-configurations)

---

## 1. Executive Summary & Architecture Overview

### 1.1 Purpose

DevSangam is a **functional-first, $0-budget** real-time collaborative code editor. Multiple developers connect to a shared workspace via a room code (`DS-XXXX-YYYY`), see each other's cursors and keystrokes in real time (CRDT-synchronized via Yjs), execute code in sandboxed environments (Docker containers or local interpreters), communicate over WebRTC mesh voice channels, and manage access through a lightweight RBAC governance system — all from the browser.

### 1.2 Technology Stack

| Layer | Technology |
|---|---|
| **Frontend** | React 19 (Vite 8), Tailwind CSS v4, Lucide React, React Router v7, react-hot-toast |
| **Editor** | Monaco Editor (`@monaco-editor/react`), custom Y.Text ↔ Monaco binding |
| **Real-time Sync** | Yjs v13 CRDTs, `y-websocket` client, custom `y-protocols`/`ws` server |
| **Backend** | Node.js, Express 5, `ws` WebSocket library (raw, no Socket.io) |
| **Database** | Supabase-hosted PostgreSQL (`pg` driver, connection pooling with SSL) |
| **Auth** | JWT (`jsonwebtoken`), bcryptjs, Passport.js + Google OAuth 2.0 |
| **Sandbox Execution** | Docker (ephemeral containers) / local interpreters / mock fallback |
| **AI Assistant** | Google Gemini API (`@google/genai`) |
| **Voice Chat** | WebRTC native mesh audio with server-side signaling relay |
| **Dev Tooling** | Concurrently (monorepo scripts), Nodemon, OxLint |

### 1.3 System Architecture

```
┌───────────────────────────────────────────────────────────────────────────────────────┐
│                                  CLIENT (Vercel SPA)                                  │
│                                                                                       │
│   React + Vite + Tailwind CSS 4 + Monaco Editor + Yjs Client + WebRTC Mesh Audio     │
│                                                                                       │
│   ┌──────────────────┐  ┌──────────────────────┐  ┌────────────────────────────────┐  │
│   │  REST API calls   │  │  ws:// /yjs/:docName │  │   ws:// /exec/:roomCode       │  │
│   │  (fetch → JSON)   │  │  (binary Yjs sync    │  │   (JSON event bus:            │  │
│   │                   │  │   + awareness)        │  │   exec, governance, voice     │  │
│   └────────┬──────────┘  └──────────┬───────────┘  │   signaling, member events)   │  │
│            │                        │               └──────────────┬─────────────────┘  │
└────────────┼────────────────────────┼──────────────────────────────┼────────────────────┘
             │  HTTPS                 │  WSS                        │  WSS
             ▼                        ▼                             ▼
┌───────────────────────────────────────────────────────────────────────────────────────┐
│                            SERVER (Render / Node.js)                                  │
│                                                                                       │
│   ┌─────────────┐   ┌─────────────────┐   ┌─────────────────────────────────────┐    │
│   │  Express 5   │   │  Yjs WS Server  │   │  Exec/Gov/Voice WS Server          │    │
│   │  REST API    │   │  (y-protocols,  │   │  (JSON message router,             │    │
│   │  + Passport  │   │   sync+aware)   │   │   code execution, RBAC,           │    │
│   │  + JWT Auth  │   │                 │   │   WebRTC signal relay)             │    │
│   └──────┬───────┘   └────────┬────────┘   └────────┬────────────────────────────┘    │
│          │                    │                      │                                 │
│          ▼                    ▼                      ▼                                 │
│   ┌──────────────────────────────────────────────────────────────┐                     │
│   │                 PostgreSQL (Supabase)                         │                     │
│   │   users • workspaces • files • workspace_members             │                     │
│   └──────────────────────────────────────────────────────────────┘                     │
│                                                                                       │
│          ┌──────────────────────────────────────────────────┐                          │
│          │  Execution Engine (child_process)                 │                          │
│          │  ┌──────────┐  ┌────────────┐  ┌──────────────┐  │                          │
│          │  │  Docker   │  │  Local     │  │  Mock        │  │                          │
│          │  │  sandbox  │  │  runtime   │  │  response    │  │                          │
│          │  └──────────┘  └────────────┘  └──────────────┘  │                          │
│          └──────────────────────────────────────────────────┘                          │
└───────────────────────────────────────────────────────────────────────────────────────┘
```

### 1.4 Data Flow Summary

1. **Editing**: Keystrokes → Monaco model → `onDidChangeContent` → Yjs `Y.Text` transaction → `y-protocols` sync → WebSocket → all peers.
2. **Execution**: `code:run` JSON message → Exec WebSocket → `executionService.runCode()` → Docker/local/mock → stdout/stderr chunks streamed back → `code:chunk` → `code:output` broadcast.
3. **Voice**: `voice:join` → server assigns to roster → WebRTC offer/answer/ICE candidates relayed via `voice:signal` messages → peer-to-peer audio streams.
4. **Governance**: `governance:*` messages → in-memory role/mute/kick/presentation state → broadcast to room.

---

## 2. Frontend Deep Dive (`/client`)

### 2.1 Build & Dev Setup

| Config | Value |
|---|---|
| **Build tool** | Vite 8 (`vite.config.js`) |
| **Framework** | React 19 (`@vitejs/plugin-react`) |
| **Styling** | Tailwind CSS v4 (`@tailwindcss/vite` plugin) |
| **Linting** | OxLint (`.oxlintrc.json`) |
| **Dev port** | `5173` (Vite default, configured in `vite.config.js`) |
| **Module system** | ESM (`"type": "module"`) |

### 2.2 Entry Point & Providers

**`main.jsx`** mounts the app inside:

```
<StrictMode>
  <BrowserRouter>
    <AuthProvider>
      <App />
      <Toaster position="bottom-right" ... />
    </AuthProvider>
  </BrowserRouter>
</StrictMode>
```

- **`AuthProvider`** (`context/AuthContext.jsx`): Manages JWT token + user object in React state backed by `localStorage` (`ds_token`, `ds_user`). Handles Google OAuth token hydration from `?token=` query params on redirect.
- **`Toaster`**: Global notification system via `react-hot-toast` with dark-themed styling.

### 2.3 Routing (`App.jsx`)

| Route | Component | Auth Required | Layout |
|---|---|---|---|
| `/` | `Landing` (or redirect → `/dashboard`) | No* | `PublicLayout` |
| `/login` | `Login` | No | `PublicLayout` |
| `/register` | `Register` | No | `PublicLayout` |
| `/forgot-password` | `ForgotPassword` | No | `PublicLayout` |
| `/reset-password` | `ResetPassword` | No | `PublicLayout` |
| `/dashboard` | `Dashboard` | **Yes** | None |
| `/workspace/:code` | `Workspace` | **Yes** | None |
| `*` (catch-all) | Redirect → `/dashboard` | — | — |

\* Authenticated users on `/` are redirected to `/dashboard` via `HomeRoute`.

**`PublicLayout`** renders a shared `<ParticleBackground>` canvas (animated dot-field) at `z-0` behind all public pages, which use `bg-transparent` + `z-10` to sit above it.

**`ProtectedRoute`** checks `isAuthenticated` from `AuthContext` and redirects to `/login` if false.

### 2.4 Design System & Styling

#### 2.4.1 Color Tokens (`index.css` → `@theme`)

| Token | Hex | Usage |
|---|---|---|
| `void` | `#000000` | Page backgrounds, deep backdrop |
| `carbon` | `#0d0d0f` | Card/panel backgrounds, editor bg |
| `graphite` | `#232529` | Hover states, secondary panels |
| `panel` | `#2b2f33` | Raised surfaces |
| `iron` | `#41464c` | Borders, line numbers |
| `steel` | `#565e66` | Muted text, placeholders |
| `fog` | `#6c757f` | Secondary text |
| `ice` | `#d8eaff` | Primary text |
| `electric-violet` | `#8b5cf6` | Brand primary, active states |
| `bright-violet` | `#a855f7` | Hover accent |
| `deep-violet` | `#7c3aed` | Deep accent |
| `signal-orange` | `#ff4105` | CTA buttons (outlined only) |

#### 2.4.2 Typography

| Stack | Fonts | Usage |
|---|---|---|
| `--font-sans` | Inter, system stack | Body text |
| `--font-display` | Syne, Inter | Headings, hero text |
| `--font-mono` | JetBrains Mono | Code, labels, terminal |

#### 2.4.3 Utility Classes

- **`.label-mono`**: 10px uppercase monospace micro-label (status badges, metadata).
- **`.observatory-grid`**: Dot-grid CSS background pattern with radial vignette mask.
- **`.ai-markdown`**: Scoped styles for rendered AI assistant Markdown output.
- **`.vim-status-bar`**: Styled container for `monaco-vim`'s status bar DOM.
- **`.yjs-cursor-label`**: Floating name tag for remote collaborator cursors.

### 2.5 State Management

DevSangam uses **no global state library** (no Redux, Zustand, or Jotai). State is managed through:

1. **React Context** — `AuthContext` for authentication (token, user, login/register/logout).
2. **Custom Hooks** — Each concern has a dedicated hook that encapsulates its WebSocket subscription and local state:
   - `useRoomSocket` — Single shared WebSocket per room for exec/governance/voice.
   - `useExecution` — Running state, result, live stdout/stderr/stdin events.
   - `useGovernance` — Roles, co-owner, presentation mode, muted users.
   - `useVoiceChat` — WebRTC peer connections, join/leave, mute, speaking detection.
   - `useWorkspacePresence` — Yjs awareness peers, live file list, connection status.
   - `usePreferences` — Editor settings (fontSize, tabSize, keybinding, etc.) from `localStorage`.
   - `useAiAssistant` — AI code analysis loading state, result markdown, errors.
3. **`localStorage` Pub/Sub** — `lib/preferences.js` implements a tiny in-tab pub/sub so changes in `AccountSettingsModal` propagate to the Monaco editor without context/props.

### 2.6 Pages — Detailed Breakdown

#### 2.6.1 Landing Page (`pages/Landing.jsx`)

A full marketing page with five sections:

| Section | Content |
|---|---|
| **Header** | Sticky navbar with Logo, nav links (Features, Architecture, Connect, FAQ), Sign In / Get Started CTA. Compresses on scroll (40px threshold). |
| **Hero** | Tagline "CODE. COLLABORATE. CREATE.", subtitle, room-code join input, "create an instant workspace" CTA. |
| **Features** | Three `FeatureCard` components: Real-Time CRDT Sync, Isolated Docker Sandbox, Presence & Telemetry. Scroll-reveal animations via `<Reveal>`. |
| **Architecture** | Visual diagram with `DiagramNode` components: Monaco Editor → Yjs/WebSocket → Exec Socket → Docker Engine. |
| **Connect** | Developer contact cards (Email, LinkedIn, GitHub) with hover effects. |
| **FAQ** | Five expandable accordion items covering CRDT, sandboxing, languages, accounts, horizontal scaling. |
| **Footer** | Logo + copyright. |

#### 2.6.2 Login Page (`pages/Login.jsx`)

- Wrapped in `<AuthCard>` (glassmorphic card with logo, title, subtitle, footer).
- Email + password fields with `<FormField>` components, password visibility toggle.
- "Forgot password?" link → `/forgot-password`.
- `<GoogleButton>` for OAuth login (`GET /api/auth/google`).
- Error/info banner components for reset success, Google auth failure.

#### 2.6.3 Register Page (`pages/Register.jsx`)

- Display Name (≤60 chars), Email (regex validated), Password (≥6 chars), Confirm Password.
- Client-side validation before API call.
- Google OAuth sign-up via same `GET /api/auth/google` endpoint.

#### 2.6.4 Forgot Password Page (`pages/ForgotPassword.jsx`)

- Instructions to verify via Google OAuth for password reset.
- `<GoogleButton>` links to `GET /api/auth/google/recover`.
- Handles error query params (`no_matching_account`, `google_no_email`).

#### 2.6.5 Reset Password Page (`pages/ResetPassword.jsx`)

- Receives `?resetToken=...&email=...` from Google OAuth recovery redirect.
- New password + confirm password form.
- Calls `POST /api/auth/reset-password-token`, then navigates to `/login` with success state.

#### 2.6.6 Dashboard Page (`pages/Dashboard.jsx`)

- **Header**: Logo, welcome message, Account Settings button, Logout button.
- **Controls**: Search bar (filters by name or language), room-code join input, "Create workspace" CTA.
- **Workspace Grid**: Cards showing name, description, language badges, room code (copy button), creation date.
- **Modals**: `CreateWorkspaceModal`, `LogoutConfirmModal`, `AccountSettingsModal`.

#### 2.6.7 Workspace Page (`pages/Workspace.jsx`) — The Core

The largest component (~904 lines). Orchestrates:

**Header Bar**:
- Logo link, back-to-dashboard button.
- Workspace name, copyable room code, creation timestamp.
- Presence avatars, connection badge (connected/reconnecting/offline).
- VoiceBar (join/leave voice, mute toggle, speaking indicators).
- Presentation Mode toggle (moderators only).
- Members modal trigger, Keyboard shortcuts modal, AI Assistant panel toggle.
- Run Code button (Ctrl/Cmd+Enter), Theme toggle (dark/light), Export .zip, Account Settings, Logout.

**Left Sidebar** (`FileSidebar`):
- File tree with language icons.
- New file / delete file actions.
- Read-only indicator when user lacks edit permission.

**Editor Area**:
- Monaco Editor with custom `devsangam-dark` theme.
- Per-file Yjs CRDT binding via `bindYTextToModel()`.
- Remote cursor labels and selection decorations via awareness.
- Vim/Emacs keybinding modes (dynamically loaded).
- Copy editor content button.
- Vim status bar (conditional).

**Terminal Panel** (`TerminalPanel`):
- Live stdout/stderr/stdin streaming during execution.
- Interactive stdin input field.
- Final result display (exit code, duration, mode).
- Clear console button.

**AI Assistant Panel** (`AIAssistantPanel`):
- Review / Optimize / Explain actions.
- Rendered Markdown response with syntax highlighting.
- "Apply" button to replace editor content with AI suggestion.

### 2.7 Real-Time Collaborative Editor Integration

#### 2.7.1 Yjs CRDT Binding (`lib/yBinding.js`)

A hand-rolled `Y.Text ↔ Monaco ITextModel` binding (replacing `y-monaco` to avoid dual Monaco instances):

- **Mutex-guarded bidirectional sync**: A `lib0/mutex` prevents the echo loop where a local edit triggers a Yjs observe callback that tries to re-edit the model.
- **Remote → Model**: `ytext.observe()` processes `delta` ops (retain/insert/delete) and applies them via `model.applyEdits()`.
- **Model → Remote**: `model.onDidChangeContent()` sorts changes in reverse offset order and applies `ytext.delete()` + `ytext.insert()` inside a `ydoc.transact()`.
- **`claimRoomBinding()`**: Enforces at most one live binding per Yjs room name, tearing down stale bindings on duplicate claims (StrictMode/HMR safety).

#### 2.7.2 Remote Cursors & Selection (`lib/remoteCursors.js`)

- **Selection highlighting**: Dynamically injects `<style>` rules with per-color CSS classes (e.g., `.yjs-sel-8b5cf6`) for colored selection backgrounds.
- **Cursor position decoding**: Converts Yjs `RelativePosition` back to absolute indices via `Y.createAbsolutePositionFromRelativePosition()`.
- **Content widgets**: Monaco `ContentWidget` API renders floating name labels at each remote cursor position.

#### 2.7.3 Presence & File List (`hooks/useWorkspacePresence.js`)

- Connects a dedicated `WebsocketProvider` to the `{roomCode}::presence` Yjs doc.
- **Awareness**: Publishes `{ id, name, color }` and observes all peers' states to build the avatar list.
- **Shared file list**: A `Y.Map('files')` keyed by file ID (not a Y.Array — idempotent on server restart).
- **Connection state**: Tracks `connected | reconnecting | offline` using provider status events + `navigator.onLine`.

### 2.8 Audio/Voice Chat (`hooks/useVoiceChat.js`)

Full WebRTC mesh audio implementation:

1. **Join**: `getUserMedia({ audio: true })` → `voice:join` message → server returns `voice:roster` with existing peer IDs.
2. **Connection**: Creates `RTCPeerConnection` with Google STUN server, adds local audio tracks, creates offer/answer exchanged via `voice:signal` messages through the server relay.
3. **ICE Candidates**: Queued if received before remote description is set, then flushed.
4. **Speaking Detection**: Per-peer `AudioContext` + `AnalyserNode` measures frequency data average against a threshold (12).
5. **Mute**: Self-mute toggles `track.enabled`; admin-mute (`member:muted` / `member:mute-all` / `member:unmute-all`) is received via the room socket.
6. **Cleanup**: Peers, audio elements, AudioContexts, and requestAnimationFrame loops are torn down on leave/disconnect.

### 2.9 Terminal & Output Components (`components/TerminalPanel.jsx`)

- Renders `liveEvents` array (merged `code:chunk` events) as color-coded `<pre>` blocks.
- Stdin input: Form with text input, sends `sendStdin(text, fileId)` over exec WebSocket.
- Stdin echo events show sender name.
- Final result: Exit code, duration, execution mode badge.
- Status indicators: "Running..." with elapsed timer, or "Idle" when no execution.

### 2.10 Components Directory

| Component | Purpose |
|---|---|
| `AIAssistantPanel` | Slide-out panel with Review/Optimize/Explain buttons, Markdown renderer, Apply button |
| `AccountSettingsModal` | Display name editing, editor preferences (font size, tab size, keybinding, minimap, line numbers, word wrap, cursor color, default language, auto-clear console) |
| `AuthCard` | Reusable glassmorphic card wrapper for auth pages |
| `BrandIcons` | SVG icon components for GitHub and LinkedIn |
| `ConnectionBadge` | Color-coded connection status indicator |
| `CreateWorkspaceModal` | Form with workspace name, description, language selector |
| `DeleteFileModal` | Confirmation modal requiring filename re-typing |
| `FileSidebar` | Left sidebar with file list, new/delete actions |
| `FormBits` | Reusable `ErrorBox`, `InfoBox`, `SubmitButton` components |
| `FormField` | Labeled input field with icon + optional right element |
| `GoogleButton` | Styled link to Google OAuth endpoint |
| `Logo` | DevSangam logo with animated "Dev" / "Sangam" text stack |
| `LogoutConfirmModal` | Confirmation dialog before logout |
| `MembersModal` | List of room participants with role badges, RBAC controls |
| `Modal` | Generic overlay + centered card container |
| `NewFileModal` | File name + language picker for creating new files |
| `ParticleBackground` | Canvas-based animated particle field |
| `PresenceAvatars` | Row of colored initials circles for online peers |
| `ProtectedRoute` | Route guard that redirects unauthenticated users |
| `Reveal` | Intersection Observer scroll-reveal animation wrapper |
| `ShortcutsModal` | Keyboard shortcuts reference card |
| `TerminalPanel` | Shared execution output console with stdin |
| `ToggleSwitch` | Styled boolean toggle switch |
| `VoiceBar` | Voice channel controls (join/leave, mute, speaking indicators) |

### 2.11 Utility Libraries (`lib/`)

| Module | Purpose |
|---|---|
| `api.js` | Typed REST API client wrapping `fetch()` with auth headers |
| `collab.js` | `getUserColor(userId)` — deterministic color palette by user ID hash |
| `formatDate.js` | `formatLocalDateTime()` / `formatDateOnly()` — locale-aware timestamp formatting with UTC normalization |
| `languages.js` | `LANGUAGE_OPTIONS` array + `getLanguageMeta()` — language metadata (value, label, extension, Monaco language ID, badge classes) |
| `preferences.js` | Editor preferences store: `loadPreferences()`, `savePreferences()`, `subscribePreferences()` with in-tab pub/sub |
| `remoteCursors.js` | Dynamic CSS injection for remote selection colors + Yjs relative-to-absolute position conversion |
| `yBinding.js` | `bindYTextToModel()` + `claimRoomBinding()` — hand-rolled Y.Text ↔ Monaco model sync |

---

## 3. Backend Deep Dive (`/server`)

### 3.1 Server Bootstrap (`index.js`)

1. **Environment**: `dotenv.config()` with `__dirname`-relative `.env` path resolution.
2. **Express app**: Creates Express 5 instance, configures CORS (from `CORS_ORIGIN` env, comma-separated, falling back to `CLIENT_URL`), JSON body parser, Passport.js initialization.
3. **Health check**: `GET /api/health` → `{ status: "ok", timestamp }`.
4. **Rate limiting**: Global `generalLimiter` on `/api/*`.
5. **Route mounting**: `/api/auth`, `/api/workspaces`, `/api/ai`.
6. **HTTP server**: `http.createServer(app)` (shared between Express and both WebSocket servers).
7. **WebSocket attachment**: `attachYjsServer(server)` at `/yjs`, `attachExecServer(server)` at `/exec`.
8. **Database init**: `db.initDb()` runs schema DDL, then server listens on `PORT`.

### 3.2 Express Middleware Stack

| Middleware | Scope | Purpose |
|---|---|---|
| `cors()` | Global | Origin allow-list from `CORS_ORIGIN` or `CLIENT_URL` env |
| `express.json()` | Global | JSON request body parsing |
| `passport.initialize()` | Global | Passport.js setup (no session — JWT-only) |
| `generalLimiter` | `/api/*` | 200 requests / 15min blanket ceiling |
| `authLimiter` | `/api/auth/login`, `/register`, `/reset-password-token` | 15 requests / 15min for auth endpoints |
| `aiLimiter` | `/api/ai/*` | 12 requests / 1min, keyed per signed-in user ID |
| `authMiddleware` | Per-route (`/api/auth/me`, `/api/workspaces/*`, `/api/ai/*`) | JWT `Bearer` token verification, sets `req.user` |

### 3.3 Real-Time Infrastructure

#### 3.3.1 Yjs WebSocket Server (`collab/yjs.js`)

A **reimplementation of the y-websocket reference server**, built against yjs v13 + y-protocols for wire compatibility.

**Architecture**:
- `WebSocketServer` (`ws`) in `noServer` mode, handling `upgrade` events on paths starting with `/yjs/`.
- JWT authentication on connection (token from query params). Invalid tokens receive a `4401` close code to prevent reconnect loops.
- Governance kick check: Kicked users receive a `4403` close code.

**Document Management**:
- `docs` Map: `docName → WSSharedDoc` (hydrated, in-memory Yjs documents).
- `docPromises` Map: Caches in-flight hydration promises to prevent concurrent connections from double-hydrating.
- Two document types:
  - **File documents** (`{roomCode}::{fileId}`): Hydrated from `files.content` in Postgres, with a `ytext.observe()` that debounce-persists edits back to the DB (1500ms).
  - **Presence documents** (`{roomCode}::presence`): Hydrated from the file list (`files` table), stored in a `Y.Map('files')` keyed by file ID for sidebar sync.

**Protocol**:
- Binary message types: `0 = MESSAGE_SYNC`, `1 = MESSAGE_AWARENESS`.
- Sync: Standard y-protocols `readSyncMessage()` / `writeSyncStep1()` / `writeUpdate()`.
- Awareness: `applyAwarenessUpdate()` / `encodeAwarenessUpdate()` for cursor/presence data.
- Ping/pong health check every 30 seconds.

**Persistence**:
- `schedulePersist()`: Debounced (1500ms) `UPDATE files SET content = $1` query on every Yjs text change.
- File list mutations (`broadcastFileCreated` / `broadcastFileDeleted`): Directly mutate the `Y.Map('files')` on the presence doc, triggering Yjs sync broadcast to all connected clients.

#### 3.3.2 Exec/Governance/Voice WebSocket Server (`collab/execSocket.js`)

A **room-scoped JSON event bus** for everything that doesn't need CRDT reconciliation.

**Architecture**:
- Separate `WebSocketServer` in `noServer` mode at `/exec/`.
- JWT authentication + governance kick check (same as Yjs server).
- Room state: `rooms` Map → `roomCode → Map<userId, Set<ws>>` (supports multiple tabs per user).
- `activeRuns` Map → `roomCode → { write, kill }` session handle.
- `voiceParticipants` Map → `roomCode → Set<userId>`.

**Message Router** (`ws.onmessage` switch):

| Message Type | Handler | Description |
|---|---|---|
| `code:run` | `handleCodeRun` | Start code execution |
| `stdin` | `handleStdin` | Forward interactive input |
| `governance:set-role` | `handleSetRole` | Change member role |
| `governance:kick` | `handleKick` | Remove member from room |
| `governance:mute` | `handleMute` | Mute/unmute a member |
| `governance:mute-all` | `handleMuteAll` | Mute all non-moderators |
| `governance:unmute-all` | `handleUnmuteAll` | Unmute everyone |
| `governance:toggle-presentation` | `handleTogglePresentation` | Enable/disable presentation mode |
| `voice:join` | `handleVoiceJoin` | Join voice channel |
| `voice:leave` | `handleVoiceLeave` | Leave voice channel |
| `voice:signal` | `handleVoiceSignal` | Relay WebRTC signaling data |

**Connection Lifecycle**:
- `member:joined` broadcast on first connection for a user.
- `member:left` broadcast when last connection for a user closes.
- Orphaned execution is killed when the last user leaves the room.

#### 3.3.3 Governance Module (`collab/governance.js`)

In-memory, session-scoped role management:

| State | Storage | Lifetime |
|---|---|---|
| Per-user roles (editor/viewer) | `rolesByRoom` Map | Session |
| Presentation mode | `presentationModeByRoom` Map | Session |
| Muted users | `mutedByRoom` Map | Session |
| Kicked users | `kickedByRoom` Map | Session |
| Owner / Co-Owner | `workspaces.owner_id` / `co_owner_id` | Persisted |

**Role Hierarchy**: `owner > coOwner > editor > viewer`

- `getEffectiveRole(workspace, userId)`: Returns the most authoritative role (owner > coOwner > session role > default 'editor').
- `isModerator(role)`: Only `owner` and `coOwner` can perform governance actions.
- Kicked users are blocked at the WebSocket `upgrade` handler level (cannot reconnect).

### 3.4 Execution Sandbox Engine (`services/executionService.js`)

The most complex server module (~670 lines). Supports five languages with three execution modes.

#### 3.4.1 Supported Languages (Runner Registry)

| Language | Docker Image | Source File | Compile Step | Unbuffered I/O |
|---|---|---|---|---|
| Python | `python:3.10-alpine` | `main.py` | None | `-u` flag |
| JavaScript | `node:18-alpine` | `main.js` | None | N/A (Node streams) |
| C | `cpp-sandbox:alpine` | `main.c` | `gcc main.c -o main.out` | Constructor preamble (`setvbuf`) |
| C++ | `cpp-sandbox:alpine` | `main.cpp` | `g++ main.cpp -o main.out` | Constructor preamble (`setvbuf`) |
| Java | `eclipse-temurin:17-alpine` | `Main.java` | `javac Main.java` | N/A |

#### 3.4.2 Execution Modes

| Mode | Trigger | Description |
|---|---|---|
| `docker` | Default when Docker daemon is reachable | Ephemeral container with strict resource limits |
| `local` | Docker unavailable, or `EXECUTION_MODE=local` | Host interpreter/compiler via `child_process.spawn()` |
| `mock` | `EXECUTION_MODE=mock`, or no Docker + no local runtime | Returns a simulated result string |
| `auto` | `EXECUTION_MODE=auto` (default) | Docker → local → mock fallback chain |

#### 3.4.3 Docker Sandbox Resource Limits

| Constraint | Value |
|---|---|
| Memory | 128 MB (`--memory 128m`) |
| CPU | 0.5 cores (`--cpus 0.5`) |
| Network | Disabled (`--network none`) |
| Root FS | Read-only (`--read-only`) |
| Temp FS | 16 MB writable `/tmp` (`--tmpfs /tmp:rw,size=16m`) |
| Container | Ephemeral (`--rm`) |

#### 3.4.4 Timeout Model (Dual-Clock System)

Rather than a single rigid wall-clock cutoff, two independent timeout clocks govern execution:

| Clock | Default | Purpose | Behavior |
|---|---|---|---|
| **CPU timeout** | 10s | Catches infinite loops | Armed on process start and after each stdin write. **Cleared** by any stdout/stderr output. |
| **Idle timeout** | 60s | Catches abandoned sessions | Armed on start, reset by any activity (output or input). |
| **Compile timeout** | 10s | Caps compilation time | Separate fixed budget for compile step only. |

This means a program that prints a prompt and waits on `input()` will not be killed by the CPU timeout (the prompt output clears it), and only the 60s idle timeout governs the wait.

#### 3.4.5 Interactive I/O

- `runInteractiveStep()`: Spawns the program with open stdin, returns `{ write(text), kill(), done: Promise }`.
- `runInteractiveDocker()`: Same interface but via `docker run -i`.
- `handleStdin()` in the exec socket: Forwards text to the active session's `write()`, echoes to all room members.
- Buffered write queue: stdin sent before the process exists (e.g., during Docker probe) is queued and flushed once the session starts.

#### 3.4.6 Process Lifecycle

1. Create temp directory (`os.tmpdir()/devsangam-exec-*`).
2. Write source file (with unbuffered-I/O preamble for C/C++).
3. Probe Docker availability (cached after first check).
4. **Docker mode**: `docker run --rm -i -v ... <image> sh -c "<shellCmd>"`.
5. **Local mode**: Optional compile step (`runBatchStep`), then interactive run (`runInteractiveStep`).
6. Stream `onStdout` / `onStderr` callbacks for live terminal output.
7. On completion: return `{ stdout, stderr, exitCode, durationMs, timedOut, mode }`.
8. Cleanup: `fs.rm(tempDir, { recursive: true })` in `finally` block.
9. Graceful kill: `SIGTERM` → 2s grace → `SIGKILL` (or `docker stop --time 2`).

#### 3.4.7 Output Limits

- `MAX_OUTPUT_CHARS = 20000`: stdout/stderr truncated with `...[output truncated]` marker.
- Processes exceeding this are gracefully killed.

### 3.5 AI Service (`services/aiService.js`)

- **Provider**: Google Gemini API via `@google/genai`.
- **Model**: Configurable via `GEMINI_MODEL` env (default: `gemini-3.6-flash`).
- **Code limit**: 20,000 characters max per request.
- **Actions**: `review`, `optimize`, `explain` — each with a tailored prompt template.
- **Selection support**: If the user has selected text, the prompt includes both the selection and the full file for context.
- **Graceful degradation**: If `GEMINI_API_KEY` is not set, `POST /api/ai/analyze` returns `503` instead of crashing.

### 3.6 Database Layer (`db/index.js`)

#### 3.6.1 Connection

- `pg.Pool` with `DATABASE_URL` connection string and SSL (`rejectUnauthorized: false` for Supabase).
- Idle-client error handler to prevent process crashes on dropped connections.
- Exposed as `module.exports.query(text, params)` for direct pool queries.

#### 3.6.2 Schema (Auto-Created via `initDb()`)

```sql
CREATE TABLE IF NOT EXISTS users (
    id              SERIAL PRIMARY KEY,
    name            VARCHAR(255) NOT NULL,
    email           VARCHAR(255) UNIQUE NOT NULL,
    password_hash   VARCHAR(255),              -- NULL for Google-only accounts
    google_id       VARCHAR(255) UNIQUE,
    avatar_url      TEXT,
    created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS workspaces (
    id              VARCHAR(255) PRIMARY KEY,   -- Room code IS the PK (e.g. "DS-AB12-2026")
    title           VARCHAR(255) NOT NULL,
    description     TEXT,
    owner_id        INTEGER REFERENCES users(id) ON DELETE CASCADE,
    co_owner_id     INTEGER REFERENCES users(id) ON DELETE SET NULL,
    language        VARCHAR(50),
    settings        JSONB DEFAULT '{}',
    created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS files (
    id              SERIAL PRIMARY KEY,
    workspace_id    VARCHAR(255) REFERENCES workspaces(id) ON DELETE CASCADE,
    filename        VARCHAR(255) NOT NULL,
    path            VARCHAR(255) NOT NULL,
    content         TEXT DEFAULT '',
    language        VARCHAR(50),
    updated_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS workspace_members (
    id              SERIAL PRIMARY KEY,
    workspace_id    VARCHAR(255) REFERENCES workspaces(id) ON DELETE CASCADE,
    user_id         INTEGER REFERENCES users(id) ON DELETE CASCADE,
    role            VARCHAR(50) DEFAULT 'editor',
    joined_at       TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

#### 3.6.3 Column Aliasing

All `SELECT` queries alias snake_case Postgres columns to camelCase JavaScript field names:

```sql
-- USER_COLUMNS
id, name, email, password_hash AS "passwordHash",
google_id AS "googleId", avatar_url AS "avatarUrl", created_at AS "createdAt"

-- WORKSPACE_COLUMNS
id, id AS "roomCode", title AS name, description, owner_id AS "ownerId",
co_owner_id AS "coOwnerId", language, settings, created_at AS "createdAt",
updated_at AS "updatedAt"

-- FILE_COLUMNS
id, workspace_id AS "workspaceId", filename AS "fileName", path, content,
language, updated_at AS "updatedAt"
```

#### 3.6.4 Migrations

`migrateUsersTable()`: Auto-detects and migrates legacy `full_name` → `name` rename and `username` column removal.

### 3.7 Rate Limiting (`middleware/rateLimiter.js`)

| Limiter | Window | Limit | Key | Applied To |
|---|---|---|---|---|
| `authLimiter` | 15 min | 15 req | IP (default) | `/api/auth/login`, `/register`, `/reset-password-token` |
| `aiLimiter` | 1 min | 12 req | `user:${id}` (or IP fallback) | `/api/ai/*` |
| `generalLimiter` | 15 min | 200 req | IP (default) | `/api/*` (blanket ceiling) |

All return `429` with JSON `{ error: "..." }` message. `express-rate-limit` v8 with standard headers.

---

## 4. Authentication & Security

### 4.1 Authentication Flows

#### 4.1.1 Email/Password Registration

```
Client                              Server
  │                                    │
  │  POST /api/auth/register           │
  │  { name, email, password }         │
  │ ──────────────────────────────────► │
  │                                    │ ── Validate fields
  │                                    │ ── Check email uniqueness
  │                                    │ ── bcrypt.hashSync(password, 10)
  │                                    │ ── INSERT INTO users
  │                                    │ ── jwt.sign({ id, name, email })
  │  { token, user }                   │
  │ ◄────────────────────────────────── │
  │                                    │
  │  localStorage: ds_token, ds_user   │
  │  Navigate → /dashboard             │
```

#### 4.1.2 Email/Password Login

```
Client                              Server
  │                                    │
  │  POST /api/auth/login              │
  │  { email, password }               │
  │ ──────────────────────────────────► │
  │                                    │ ── Lookup user by email
  │                                    │ ── bcrypt.compareSync(password, hash)
  │                                    │ ── jwt.sign({ id, name, email })
  │  { token, user }                   │
  │ ◄────────────────────────────────── │
```

#### 4.1.3 Google OAuth 2.0 Login Flow

```
Client                        Server                          Google
  │                              │                               │
  │  Click "Sign in with Google" │                               │
  │  ────────────────────────────┤                               │
  │                              │                               │
  │  GET /api/auth/google        │                               │
  │  ──────────────────────────► │                               │
  │                              │  302 Redirect to Google       │
  │                              │  (scope: profile, email)      │
  │                              │  (state: "login")             │
  │                              │  ────────────────────────────► │
  │  ◄───────────────────────────┤                               │
  │  (browser follows redirect)  │                               │
  │                              │                               │
  │  ───────────────────────────────────────────────────────────► │
  │  (user consents)             │                               │
  │  ◄────────────────────────────────────────────────────────── │
  │                              │                               │
  │  GET /api/auth/google/callback?code=...&state=login          │
  │  ──────────────────────────► │                               │
  │                              │ ── passport.authenticate()    │
  │                              │ ── Lookup/create user by      │
  │                              │    google_id or email          │
  │                              │ ── jwt.sign(user)              │
  │                              │                               │
  │  302 → CLIENT_URL/login?token=<jwt>                          │
  │  ◄────────────────────────── │                               │
  │                              │                               │
  │  AuthContext reads ?token    │                               │
  │  GET /api/auth/me (Bearer)   │                               │
  │  ──────────────────────────► │                               │
  │  { user }                    │                               │
  │  ◄────────────────────────── │                               │
  │  localStorage + navigate     │                               │
```

#### 4.1.4 Google OAuth Password Recovery

Same flow as login but:
- Initiated via `GET /api/auth/google/recover` (state: `"recover"`).
- Callback looks up user by email, generates a short-lived reset token (`jwt.sign({ purpose: 'password-reset' }, { expiresIn: '15m' })`).
- Redirects to `CLIENT_URL/reset-password?resetToken=...&email=...`.
- User sets new password via `POST /api/auth/reset-password-token`.

### 4.2 JWT Token Structure

**Payload**:

```json
{
  "id": 1,
  "name": "Jane Doe",
  "email": "jane@example.com",
  "iat": 1693500000,
  "exp": 1694104800
}
```

**Configuration**:

| Parameter | Value |
|---|---|
| Signing algorithm | HS256 (default) |
| Secret | `JWT_SECRET` env var |
| Session token expiry | `JWT_EXPIRES_IN` env (default: `7d`) |
| Reset token expiry | `15m` (hardcoded) |
| Reset token `purpose` | `"password-reset"` |

### 4.3 Route Protection

- **REST API**: `authMiddleware` extracts `Bearer` token from `Authorization` header, verifies with `jwt.verify()`, sets `req.user`.
- **WebSocket**: Both `/yjs` and `/exec` WebSocket servers verify JWT from the `?token=` query parameter during the `upgrade` handshake.
- **Governance**: Kicked users are rejected at the WebSocket `upgrade` level (close code `4403`).

### 4.4 Password Security

- **Hashing**: `bcrypt.hashSync(password, 10)` — 10 salt rounds.
- **Google-only accounts**: `password_hash` is `NULL` — password login returns generic "Invalid credentials" to avoid account enumeration.
- **Email normalization**: `String(email).trim().toLowerCase()` applied consistently.

### 4.5 Environment Variables

See [Section 6.3](#63-environment-variables-reference) for the complete reference.

---

## 5. API Reference & WebSocket Protocols

### 5.1 REST API Endpoints

All endpoints are prefixed with `/api`. JSON request/response bodies unless noted.

#### 5.1.1 Health Check

| Method | Path | Auth | Rate Limit | Description |
|---|---|---|---|---|
| `GET` | `/api/health` | None | None | Server health check |

**Response** `200`:
```json
{ "status": "ok", "timestamp": "2026-09-01T12:00:00.000Z" }
```

---

#### 5.1.2 Authentication (`/api/auth`)

| Method | Path | Auth | Rate Limit | Description |
|---|---|---|---|---|
| `POST` | `/api/auth/register` | None | `authLimiter` | Create new account |
| `POST` | `/api/auth/login` | None | `authLimiter` | Sign in |
| `GET` | `/api/auth/me` | Bearer JWT | `generalLimiter` | Get current user profile |
| `PUT` | `/api/auth/update-name` | Bearer JWT | `generalLimiter` | Update display name |
| `GET` | `/api/auth/google` | None | None | Initiate Google OAuth login |
| `GET` | `/api/auth/google/recover` | None | None | Initiate Google OAuth password recovery |
| `GET` | `/api/auth/google/callback` | None | None | Google OAuth callback (not called directly) |
| `POST` | `/api/auth/reset-password-token` | None | `authLimiter` | Reset password with token |

**`POST /api/auth/register`**

Request:
```json
{ "name": "Jane Doe", "email": "jane@example.com", "password": "secret123" }
```

| Validation | Rule |
|---|---|
| `name` | Required, trimmed, ≤ 60 characters |
| `email` | Required, valid format, unique |
| `password` | Required, ≥ 6 characters |

Response `201`:
```json
{
  "token": "eyJhbGciOi...",
  "user": { "id": 1, "name": "Jane Doe", "email": "jane@example.com", "googleId": null, "avatarUrl": null, "createdAt": "..." }
}
```

Errors: `400` (validation), `409` (email taken), `500` (server error).

---

**`POST /api/auth/login`**

Request:
```json
{ "email": "jane@example.com", "password": "secret123" }
```

Response `200`:
```json
{ "token": "eyJhbGciOi...", "user": { ... } }
```

Errors: `400` (missing fields), `401` (invalid credentials), `500`.

---

**`GET /api/auth/me`**

Headers: `Authorization: Bearer <token>`

Response `200`:
```json
{ "user": { "id": 1, "name": "Jane Doe", "email": "jane@example.com", ... } }
```

Errors: `401` (no/invalid token), `404` (user not found), `500`.

---

**`PUT /api/auth/update-name`**

Headers: `Authorization: Bearer <token>`

Request:
```json
{ "name": "Jane D." }
```

Response `200`:
```json
{ "user": { "id": 1, "name": "Jane D.", "email": "jane@example.com", "avatarUrl": null } }
```

Errors: `400` (missing/too long), `401`, `404`, `500`.

---

**`POST /api/auth/reset-password-token`**

Request:
```json
{ "resetToken": "eyJhbGciOi...", "newPassword": "newsecret123" }
```

Response `200`:
```json
{ "message": "Password reset successful" }
```

Errors: `400` (missing/invalid token, short password), `404`, `500`.

---

#### 5.1.3 Workspaces (`/api/workspaces`)

All workspace endpoints require `Bearer JWT` auth.

| Method | Path | Description |
|---|---|---|
| `POST` | `/api/workspaces` | Create workspace |
| `GET` | `/api/workspaces` | List user's workspaces |
| `GET` | `/api/workspaces/:roomCode` | Get workspace + files |
| `PATCH` | `/api/workspaces/:roomCode/co-owner` | Set/remove co-owner |
| `POST` | `/api/workspaces/:roomCode/files` | Create file in workspace |
| `DELETE` | `/api/workspaces/:roomCode/files/:fileId` | Delete file |

**`POST /api/workspaces`**

Request:
```json
{ "name": "My Project", "description": "Optional desc", "language": "python" }
```

Response `201`:
```json
{
  "workspace": { "id": "DS-AB12-2026", "roomCode": "DS-AB12-2026", "name": "My Project", ... },
  "files": [{ "id": 1, "fileName": "main.py", "language": "python", "content": "print(\"Hello from DevSangam!\")\n", ... }]
}
```

Room code format: `DS-{4 chars}-{year}` using charset `ABCDEFGHJKLMNPQRSTUVWXYZ23456789` (no 0/O/1/I).

Starter templates: Python (`main.py`), JavaScript (`index.js`), C++ (`main.cpp`), C (`main.c`), Java (`Main.java`).

---

**`GET /api/workspaces`**

Response `200`:
```json
{
  "workspaces": [
    {
      "id": "DS-AB12-2026", "roomCode": "DS-AB12-2026", "name": "My Project",
      "languages": ["python"], "fileCount": 2, "ownerId": 1, "createdAt": "..."
    }
  ]
}
```

---

**`GET /api/workspaces/:roomCode`**

Response `200`:
```json
{
  "workspace": { ... },
  "files": [ ... ],
  "roles": { "3": "viewer" },
  "presentationMode": false,
  "myRole": "owner"
}
```

Errors: `404` (workspace not found), `500`.

---

**`PATCH /api/workspaces/:roomCode/co-owner`**

Request:
```json
{ "userId": 2 }
```
(Pass `{ "userId": null }` to remove co-owner.)

Response `200`:
```json
{ "coOwnerId": 2 }
```

Authorization: Only the workspace owner.

Errors: `400` (invalid userId, owner self-promotion), `403` (not owner), `404`, `500`.

---

**`POST /api/workspaces/:roomCode/files`**

Request:
```json
{ "fileName": "utils.py", "language": "python", "content": "# optional content" }
```

Response `201`:
```json
{ "file": { "id": 3, "fileName": "utils.py", "language": "python", ... } }
```

Errors: `400` (missing filename), `404`, `409` (duplicate filename), `500`.

---

**`DELETE /api/workspaces/:roomCode/files/:fileId`**

Response `200`:
```json
{ "message": "File deleted" }
```

Errors: `400` (last remaining file), `404`, `500`.

---

#### 5.1.4 AI Assistant (`/api/ai`)

Requires `Bearer JWT` auth + `aiLimiter`.

| Method | Path | Description |
|---|---|---|
| `POST` | `/api/ai/analyze` | Analyze code with Gemini AI |

**`POST /api/ai/analyze`**

Request:
```json
{
  "code": "def foo(): ...",
  "language": "python",
  "action": "review",
  "selection": "optional selected text"
}
```

| Field | Required | Values |
|---|---|---|
| `code` | Yes | Source code string (max 20K chars) |
| `language` | No | Language identifier (default: `plaintext`) |
| `action` | Yes | `review` \| `optimize` \| `explain` |
| `selection` | No | Selected text for focused analysis |

Response `200`:
```json
{ "markdown": "## Issues Found\n- ..." }
```

Errors: `400` (invalid action, missing code), `429` (rate limit), `502` (Gemini API failure), `503` (GEMINI_API_KEY not configured).

---

### 5.2 WebSocket Protocols

#### 5.2.1 Yjs Document Sync (`/yjs`)

**Connection URL**: `ws(s)://<host>/yjs/<docName>?token=<jwt>`

**Document naming convention**:
- File editing: `{roomCode}::{fileId}` (e.g., `DS-AB12-2026::42`)
- Presence/file list: `{roomCode}::presence` (e.g., `DS-AB12-2026::presence`)

**Binary protocol** (y-protocols v1):

| Byte 0 (VarUint) | Payload | Direction |
|---|---|---|
| `0` (MESSAGE_SYNC) | y-protocols sync step 1/2/update | Bidirectional |
| `1` (MESSAGE_AWARENESS) | Awareness state update | Bidirectional |

**Awareness state shape** (per client):
```json
{
  "user": { "id": 1, "name": "Jane", "color": "#8b5cf6" },
  "selection": {
    "anchor": { /* Y.RelativePosition */ },
    "head":   { /* Y.RelativePosition */ }
  }
}
```

**Close codes**:

| Code | Meaning |
|---|---|
| `4401` | Invalid or missing JWT token |
| `4403` | Kicked from this room |
| `1011` | Internal server error during setup |

---

#### 5.2.2 Exec/Governance/Voice Event Bus (`/exec`)

**Connection URL**: `ws(s)://<host>/exec/<roomCode>?token=<jwt>`

**Protocol**: JSON messages with a `type` field.

##### Client → Server Messages

| Type | Payload | Description |
|---|---|---|
| `code:run` | `{ fileId, language, code, stdin }` | Start code execution |
| `stdin` | `{ text, fileId }` | Send interactive stdin input |
| `governance:set-role` | `{ targetUserId, role }` | Set member role (`editor` / `viewer`) |
| `governance:kick` | `{ targetUserId }` | Kick member from room |
| `governance:mute` | `{ targetUserId, muted }` | Mute/unmute member |
| `governance:mute-all` | `{}` | Mute all non-moderators |
| `governance:unmute-all` | `{}` | Unmute everyone |
| `governance:toggle-presentation` | `{ enabled }` | Toggle presentation mode |
| `voice:join` | `{}` | Join voice channel |
| `voice:leave` | `{}` | Leave voice channel |
| `voice:signal` | `{ targetUserId, signal }` | WebRTC signaling data |

##### Server → Client Messages

| Type | Payload | Description |
|---|---|---|
| `code:running` | `{ fileId, runnerName, runnerId, startedAt }` | Execution started |
| `code:chunk` | `{ fileId, stream: "stdout"\|"stderr", text }` | Live output chunk |
| `code:stdin-echo` | `{ fileId, text, userId, userName }` | Stdin echoed to room |
| `code:output` | `{ fileId, runnerName, runnerId, stdout, stderr, exitCode, durationMs, timedOut, mode }` | Execution completed |
| `member:joined` | `{ userId }` | User connected to room |
| `member:left` | `{ userId }` | User disconnected from room |
| `member:kicked` | `{ targetUserId, byUserId }` | User was kicked |
| `member:muted` | `{ targetUserId, muted, byUserId }` | User muted/unmuted |
| `member:mute-all` | `{ mutedUserIds, byUserId }` | All muted |
| `member:unmute-all` | `{ byUserId }` | All unmuted |
| `role:updated` | `{ targetUserId, role, byUserId }` | Role changed |
| `coowner:updated` | `{ coOwnerId, byUserId }` | Co-owner changed |
| `presentation:updated` | `{ enabled, byUserId }` | Presentation mode toggled |
| `voice:roster` | `{ peers: [userId, ...] }` | Current voice participants |
| `voice:peer-joined` | `{ userId }` | Peer joined voice |
| `voice:peer-left` | `{ userId }` | Peer left voice |
| `voice:signal` | `{ fromUserId, signal }` | Relayed WebRTC signaling |
| `error` | `{ message }` | Error notification |

**`code:output` result shape**:
```json
{
  "fileId": 1,
  "runnerName": "Jane",
  "runnerId": 1,
  "stdout": "Hello from DevSangam!\n",
  "stderr": "",
  "exitCode": 0,
  "durationMs": 342,
  "timedOut": false,
  "mode": "docker",
  "rejected": false
}
```

**`voice:signal` payload**:
```json
{
  "targetUserId": 2,
  "signal": {
    "sdp": { "type": "offer", "sdp": "v=0\r\n..." }
  }
}
// or
{
  "targetUserId": 2,
  "signal": {
    "candidate": { "candidate": "candidate:...", "sdpMid": "0", "sdpMLineIndex": 0 }
  }
}
```

---

## 6. Deployment & Environment Configurations

### 6.1 Vercel SPA Deployment (`vercel.json`)

```json
{
  "rewrites": [
    { "source": "/(.*)", "destination": "/" }
  ]
}
```

- **Purpose**: Routes all paths to `index.html` for React Router's client-side routing.
- **Build output**: Vite's `dist/` directory.
- Both root and `client/` contain identical `vercel.json` files.

### 6.2 Render Deployment (Server)

The server is deployed as a **Web Service** on Render:

| Setting | Value |
|---|---|
| **Build command** | `npm install` |
| **Start command** | `node index.js` |
| **Node version** | 18+ (required for Express 5) |
| **Environment** | Set all env vars from `.env.example` |

### 6.3 Environment Variables Reference

#### Server (`/server/.env`)

| Variable | Required | Default | Description |
|---|---|---|---|
| `PORT` | No | `5000` | HTTP server port |
| `NODE_ENV` | No | `development` | Environment mode |
| `JWT_SECRET` | **Yes** | — | Secret key for JWT signing |
| `JWT_EXPIRES_IN` | No | `7d` | JWT session token expiry |
| `DATABASE_URL` | **Yes** | — | PostgreSQL connection string (Supabase transaction pooler) |
| `EXECUTION_MODE` | No | `auto` | `auto` \| `docker` \| `local` \| `mock` |
| `EXECUTION_CPU_TIMEOUT_MS` | No | `10000` | CPU-burst timeout (ms) |
| `EXECUTION_IDLE_TIMEOUT_MS` | No | `60000` | Idle timeout (ms) |
| `EXECUTION_COMPILE_TIMEOUT_MS` | No | `10000` | Compilation timeout (ms) |
| `CORS_ORIGIN` | No | (falls back to `CLIENT_URL`) | Comma-separated allowed frontend origins |
| `CLIENT_URL` | No | `http://localhost:5173` | Frontend URL (OAuth redirects + CORS fallback) |
| `GEMINI_API_KEY` | No | — | Google Gemini API key (leave blank to disable AI) |
| `GEMINI_MODEL` | No | `gemini-3.6-flash` | Gemini model name |
| `GOOGLE_CLIENT_ID` | No* | — | Google OAuth client ID |
| `GOOGLE_CLIENT_SECRET` | No* | — | Google OAuth client secret |
| `GOOGLE_CALLBACK_URL` | No | `http://localhost:5000/api/auth/google/callback` | Google OAuth redirect URI |

\* Required only if Google OAuth login/recovery is desired.

#### Client (`/client/.env`)

| Variable | Required | Default | Description |
|---|---|---|---|
| `VITE_API_BASE_URL` | No | `http://localhost:5000` | Backend REST API origin (no trailing slash) |
| `VITE_WS_URL` | No | `ws://localhost:5000` | Backend WebSocket origin (no trailing slash) |

### 6.4 Monorepo Scripts (Root `package.json`)

| Script | Command | Purpose |
|---|---|---|
| `install:all` | `npm install && npm install --prefix server && npm install --prefix client` | Install all dependencies |
| `dev` | `concurrently -n server,client -c blue,magenta "npm run dev --prefix server" "npm run dev --prefix client"` | Run both server (Nodemon) and client (Vite) in parallel |
| `dev:server` | `npm run dev --prefix server` | Run only the server |
| `dev:client` | `npm run dev --prefix client` | Run only the client |

### 6.5 Development Setup

```bash
# 1. Clone the repository
git clone https://github.com/haricharan052006/DevSangam.git
cd DevSangam

# 2. Install all dependencies
npm run install:all

# 3. Configure environment variables
cp server/.env.example server/.env    # Edit with your values
cp client/.env.example client/.env    # Edit if needed

# 4. Start development servers
npm run dev
# → Server at http://localhost:5000
# → Client at http://localhost:5173
```

**Minimum requirements for basic operation**:
- `JWT_SECRET` — any long random string.
- `DATABASE_URL` — Supabase PostgreSQL connection string.
- `EXECUTION_MODE=mock` — if Docker is not available.

---

## Appendix: File Tree

```
DevSangam/
├── package.json                  # Monorepo scripts (concurrently)
├── vercel.json                   # SPA rewrite rules
├── PROJECT_SPEC.md               # Original spec document
│
├── client/
│   ├── index.html                # SPA entry point (fonts, meta, inlined bg)
│   ├── package.json              # Client dependencies
│   ├── vite.config.js            # Vite + React + Tailwind plugins
│   ├── vercel.json               # SPA rewrite rules (client copy)
│   ├── .env.example              # Client env template
│   ├── public/                   # Static assets (logo.png)
│   └── src/
│       ├── main.jsx              # React root mount
│       ├── App.jsx               # Router + layouts
│       ├── index.css             # Tailwind + design tokens + custom classes
│       ├── config/
│       │   └── api.js            # Base URLs (REST, WS, OAuth)
│       ├── context/
│       │   └── AuthContext.jsx   # Auth state provider + Google OAuth hydration
│       ├── hooks/
│       │   ├── useAiAssistant.js
│       │   ├── useExecution.js
│       │   ├── useGovernance.js
│       │   ├── usePreferences.js
│       │   ├── useRoomSocket.js
│       │   ├── useVoiceChat.js
│       │   └── useWorkspacePresence.js
│       ├── lib/
│       │   ├── api.js            # REST API client
│       │   ├── collab.js         # User color palette
│       │   ├── formatDate.js     # Date formatting
│       │   ├── languages.js      # Language metadata
│       │   ├── preferences.js    # Editor preferences store
│       │   ├── remoteCursors.js  # Remote cursor CSS + position decoding
│       │   └── yBinding.js       # Y.Text ↔ Monaco model binding
│       ├── pages/
│       │   ├── Dashboard.jsx
│       │   ├── ForgotPassword.jsx
│       │   ├── Landing.jsx
│       │   ├── Login.jsx
│       │   ├── Register.jsx
│       │   ├── ResetPassword.jsx
│       │   └── Workspace.jsx     # Core editor page (~904 lines)
│       ├── components/
│       │   ├── AIAssistantPanel.jsx
│       │   ├── AccountSettingsModal.jsx
│       │   ├── AuthCard.jsx
│       │   ├── BrandIcons.jsx
│       │   ├── ConnectionBadge.jsx
│       │   ├── CreateWorkspaceModal.jsx
│       │   ├── DeleteFileModal.jsx
│       │   ├── FileSidebar.jsx
│       │   ├── FormBits.jsx
│       │   ├── FormField.jsx
│       │   ├── GoogleButton.jsx
│       │   ├── Logo.jsx
│       │   ├── LogoutConfirmModal.jsx
│       │   ├── MembersModal.jsx
│       │   ├── Modal.jsx
│       │   ├── NewFileModal.jsx
│       │   ├── ParticleBackground.jsx
│       │   ├── PresenceAvatars.jsx
│       │   ├── ProtectedRoute.jsx
│       │   ├── Reveal.jsx
│       │   ├── ShortcutsModal.jsx
│       │   ├── TerminalPanel.jsx
│       │   ├── ToggleSwitch.jsx
│       │   └── VoiceBar.jsx
│       └── assets/
│           ├── hero.png
│           ├── react.svg
│           └── vite.svg
│
└── server/
    ├── index.js                  # Server entry point
    ├── package.json              # Server dependencies
    ├── nodemon.json              # Dev watch config
    ├── .env.example              # Server env template
    ├── config/
    │   └── passport.js           # Google OAuth strategy
    ├── db/
    │   └── index.js              # PostgreSQL pool, schema DDL, migrations
    ├── middleware/
    │   ├── auth.js               # JWT verification middleware
    │   └── rateLimiter.js        # Rate limiters (auth, AI, general)
    ├── routes/
    │   ├── auth.js               # Auth endpoints (register, login, OAuth, reset)
    │   ├── workspaces.js         # Workspace CRUD + file management
    │   └── ai.js                 # AI code analysis endpoint
    ├── collab/
    │   ├── yjs.js                # Yjs WebSocket server + doc persistence
    │   ├── execSocket.js         # Exec/governance/voice WebSocket server
    │   └── governance.js         # In-memory RBAC state
    └── services/
        ├── executionService.js   # Code execution engine (~670 lines)
        └── aiService.js          # Gemini AI integration
```

---

*Generated on September 1, 2026. This document reflects the codebase as of this date.*
