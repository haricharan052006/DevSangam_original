# DevSangam ("The Confluence of Developers") — Master Technical Specification

## 1. Project Overview
- **Type**: Real-time collaborative code editor with sandboxed execution, role governance, and WebRTC voice communication.
- **Target**: Functional-first, robust MVP with a $0 budget stack.

## 2. Technology Stack
- **Frontend**: React (Vite), Tailwind CSS, Lucide React, React Router v6.
- **Editor & Sync**: Monaco Editor (`@monaco-editor/react`), Yjs, `y-websocket`, `socket.io-client`.
- **Backend**: Node.js, Express.js, Socket.io, `dotenv`, `cors`, JWT (`jsonwebtoken`), `bcryptjs`.
- **Database**: SQLite (via `better-sqlite3` or `sqlite3`) with schema migrations.
- **Sandboxed Execution**: Ephemeral Docker containers (`docker run`) with strict resource constraints (128MB RAM, 0.5 CPU, 5s timeout, read-only root). Cloud production fallback: `EXECUTION_MODE=mock`.
- **Voice Communication**: WebRTC native mesh audio with Socket.io signaling.

## 3. Database Schema
- **users**: `id` (PK), `fullName`, `username` (unique), `email` (unique), `passwordHash`, `createdAt`
- **workspaces**: `id` (PK), `name`, `description`, `roomCode` (unique, format: `DS-XXXX-YYYY`), `ownerId` (FK), `coOwnerId` (FK, nullable), `createdAt`
- **files**: `id` (PK), `workspaceId` (FK), `fileName`, `language`, `content`, `updatedAt`
- **otps**: `id` (PK), `email`, `otpCode` (6 digits), `expiresAt`

## 4. Key Functional Requirements
1. **Auth & Guards**: JWT token flow, protected routes (`/dashboard`, `/workspace/:code`), OTP password recovery.
2. **Dashboard**: Workspace search, create workspace modal with collision-free room codes.
3. **Workspace & Editor**: Multi-file explorer, file deletion safeguard (type name to confirm), Monaco syntax highlighting, `.zip` workspace export.
4. **Real-Time Collaboration**: Yjs CRDT synchronization, presence avatars, color-coded cursors, connection status badge.
5. **Sandboxed Runner**: Node.js `child_process` invoking Docker runtimes (Python, JavaScript, C, C++, Java), streaming `stdout`/`stderr` back over WebSockets.
6. **Governance (RBAC)**: Roles (Owner, Co-Owner, Editor, Viewer), Presentation Mode (read-only lock), and host kick/mute controls.
7. **WebRTC Voice**: In-app mesh voice channels with global and individual mute functionality.