# DevSangam

**Real-time collaborative coding platform with conflict-free CRDT syncing and isolated Docker code execution.**

🔗 **Live Demo:** [dev-sangam-original.vercel.app](https://dev-sangam-original.vercel.app/)

---

## Overview

DevSangam is an open-source collaborative IDE built for pair programming, technical mock interviews, and student study groups. It combines low-latency multi-user code editing with isolated server-side code execution and persistent workspace management.

### Key Features
* **Conflict-Free Real-Time Sync:** Powered by **Yjs CRDTs** over WebSockets so multiple users can type simultaneously without merge conflicts or cursor drift.
* **Sandboxed Remote Code Execution:** User code runs inside **isolated, ephemeral Docker containers** on the backend to prevent host-system interference.
* **Workspace Management:** Save, rename, edit descriptions, and organize coding sessions with a 4-second undo-deletion safeguard.
* **Granular Sharing & Auth:** Authenticated sessions and role-based workspace sharing permissions backed by **Supabase (PostgreSQL)**.

---

## Architecture & Tech Stack

| Layer | Technology |
| :--- | :--- |
| **Frontend** | React, CodeMirror, Tailwind CSS (Hosted on **Vercel**) |
| **Real-Time Engine** | Yjs (CRDT), `y-websocket` |
| **Backend & Execution** | Node.js, Express, WebSockets, Docker Engine API (Hosted on **Render**) |
| **Database & Auth** | Supabase (PostgreSQL, Row-Level Security, Auth) |

```text
┌──────────────────────┐       WebSockets (Yjs CRDT)       ┌──────────────────────────┐
│   React + CodeMirror │ ◄───────────────────────────────► │  Node.js / Express Server │
│      (Vercel)        │                                   │         (Render)          │
└──────────┬───────────┘                                   └────────────┬─────────────┘
           │                                                            │
           │ REST / Auth                                                │ Spawns Ephemeral
           ▼                                                            ▼ Containers
┌──────────────────────┐                                   ┌──────────────────────────┐
│ Supabase PostgreSQL  │                                   │  Isolated Docker Sandbox │
└──────────────────────┘                                   └──────────────────────────┘
