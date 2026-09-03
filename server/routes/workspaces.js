const express = require('express');
const db = require('../db');
const authMiddleware = require('../middleware/auth');
const { broadcastFileCreated, broadcastFileDeleted } = require('../collab/yjs');
const { broadcastToRoom } = require('../collab/execSocket');
const governance = require('../collab/governance');

const router = express.Router();
router.use(authMiddleware);

const { WORKSPACE_COLUMNS, FILE_COLUMNS } = db;

const ROOM_CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O/1/I to avoid ambiguity

const STARTER_TEMPLATES = {
  python: { fileName: 'main.py', content: 'print("Hello from DevSangam!")\n' },
  javascript: { fileName: 'index.js', content: 'console.log("Hello from DevSangam!");\n' },
  cpp: {
    fileName: 'main.cpp',
    content: '#include <iostream>\n\nint main() {\n    std::cout << "Hello from DevSangam!" << std::endl;\n    return 0;\n}\n',
  },
  c: {
    fileName: 'main.c',
    content: '#include <stdio.h>\n\nint main() {\n    printf("Hello from DevSangam!\\n");\n    return 0;\n}\n',
  },
  java: {
    fileName: 'Main.java',
    content: 'public class Main {\n    public static void main(String[] args) {\n        System.out.println("Hello from DevSangam!");\n    }\n}\n',
  },
};

function randomSegment(length) {
  let out = '';
  for (let i = 0; i < length; i += 1) {
    out += ROOM_CODE_CHARS[Math.floor(Math.random() * ROOM_CODE_CHARS.length)];
  }
  return out;
}

// workspaces.id is the room code itself (a VARCHAR primary key, not a
// surrogate SERIAL) — this loop is really just retrying on the rare case two
// concurrently-created workspaces roll the same 4-char segment in the same year.
async function generateRoomCode() {
  const year = new Date().getFullYear();
  let code;
  let attempts = 0;
  let taken = true;
  do {
    code = `DS-${randomSegment(4)}-${year}`;
    attempts += 1;
    const result = await db.query('SELECT id FROM workspaces WHERE id = $1', [code]);
    taken = Boolean(result.rows[0]);
  } while (taken && attempts < 50);
  return code;
}

async function getWorkspaceByCode(roomCode) {
  const result = await db.query(`SELECT ${WORKSPACE_COLUMNS} FROM workspaces WHERE id = $1`, [roomCode]);
  return result.rows[0];
}

router.post('/', async (req, res) => {
  const { name, description, language, allowMemberSave } = req.body || {};

  if (!name || !name.trim()) {
    return res.status(400).json({ error: 'Workspace name is required' });
  }

  try {
    const roomCode = await generateRoomCode();
    const template = STARTER_TEMPLATES[language] || STARTER_TEMPLATES.javascript;
    const starterLanguage = STARTER_TEMPLATES[language] ? language : 'javascript';
    const settings = { allowMemberSave: Boolean(allowMemberSave) };

    const wsResult = await db.query(
      `INSERT INTO workspaces (id, title, description, owner_id, language, settings)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING ${WORKSPACE_COLUMNS}`,
      [roomCode, name.trim(), description ? description.trim() : null, req.user.id, starterLanguage, JSON.stringify(settings)]
    );
    const workspace = wsResult.rows[0];

    await db.query(
      `INSERT INTO files (workspace_id, filename, path, language, content) VALUES ($1, $2, $3, $4, $5)`,
      [roomCode, template.fileName, `/${template.fileName}`, starterLanguage, template.content]
    );

    const filesResult = await db.query(`SELECT ${FILE_COLUMNS} FROM files WHERE workspace_id = $1`, [roomCode]);

    console.log(`[workspaces] created "${workspace.name}" (${roomCode}) by user ${req.user.id}`);

    res.status(201).json({ workspace, files: filesResult.rows });
  } catch (err) {
    console.error(`[workspaces] create failed: ${err.message}`);
    res.status(500).json({ error: 'Failed to create workspace' });
  }
});

router.get('/', async (req, res) => {
  try {
    // Owned, co-owned, or explicitly saved via workspace_members (the
    // "Add to Dashboard" flow below) — one query against `workspaces`, so no
    // join/dedup is needed even though a row can satisfy more than one of
    // those conditions at once.
    const wsResult = await db.query(
      `SELECT ${WORKSPACE_COLUMNS}
       FROM workspaces
       WHERE owner_id = $1
          OR co_owner_id = $1
          OR id IN (SELECT workspace_id FROM workspace_members WHERE user_id = $1)
       ORDER BY created_at DESC`,
      [req.user.id]
    );

    const enriched = await Promise.all(
      wsResult.rows.map(async (ws) => {
        const fileRows = await db.query('SELECT language FROM files WHERE workspace_id = $1', [ws.id]);
        const languages = [...new Set(fileRows.rows.map((f) => f.language).filter(Boolean))];
        const role = ws.ownerId === req.user.id ? 'owner' : ws.coOwnerId === req.user.id ? 'coOwner' : 'member';
        return { ...ws, languages, fileCount: fileRows.rows.length, isOwner: role === 'owner', role };
      })
    );

    res.json({ workspaces: enriched });
  } catch (err) {
    console.error(`[workspaces] list failed: ${err.message}`);
    res.status(500).json({ error: 'Failed to load workspaces' });
  }
});

router.get('/:roomCode', async (req, res) => {
  try {
    const workspace = await getWorkspaceByCode(req.params.roomCode);
    if (!workspace) {
      console.log(`[workspaces] lookup failed: no workspace for room code "${req.params.roomCode}"`);
      return res.status(404).json({ error: 'Workspace not found' });
    }
    const filesResult = await db.query(`SELECT ${FILE_COLUMNS} FROM files WHERE workspace_id = $1 ORDER BY id ASC`, [workspace.id]);
    const roles = governance.getAllRoles(workspace.roomCode);
    const presentationMode = governance.getPresentationMode(workspace.roomCode);
    const myRole = governance.getEffectiveRole(workspace, req.user.id);
    const savedResult = await db.query('SELECT 1 FROM workspace_members WHERE workspace_id = $1 AND user_id = $2', [
      workspace.id,
      req.user.id,
    ]);
    const isSaved = savedResult.rows.length > 0;
    res.json({ workspace, files: filesResult.rows, roles, presentationMode, myRole, isSaved });
  } catch (err) {
    console.error(`[workspaces] get failed: ${err.message}`);
    res.status(500).json({ error: 'Failed to load workspace' });
  }
});

// Lets a non-owner collaborator pin a workspace they were invited into (via
// room code) onto their own dashboard, gated by the owner's per-workspace
// `settings.allowMemberSave` flag set at creation time (CreateWorkspaceModal).
router.post('/:roomCode/save', async (req, res) => {
  try {
    const workspace = await getWorkspaceByCode(req.params.roomCode);
    if (!workspace) {
      return res.status(404).json({ error: 'Workspace not found' });
    }

    // The owner's own workspaces already surface on their dashboard via
    // `owner_id = $1` in GET / — nothing to save.
    if (workspace.ownerId === req.user.id) {
      return res.json({ success: true, message: 'Workspace added to dashboard' });
    }

    if (!workspace.settings?.allowMemberSave) {
      return res.status(403).json({ error: 'Owner has disabled saving this workspace to dashboard' });
    }

    await db.query(
      `INSERT INTO workspace_members (workspace_id, user_id, role)
       VALUES ($1, $2, 'editor')
       ON CONFLICT (workspace_id, user_id) DO NOTHING`,
      [workspace.id, req.user.id]
    );

    console.log(`[workspaces] user ${req.user.id} saved workspace ${workspace.roomCode} to their dashboard`);
    res.json({ success: true, message: 'Workspace added to dashboard' });
  } catch (err) {
    console.error(`[workspaces] save failed: ${err.message}`);
    res.status(500).json({ error: 'Failed to save workspace' });
  }
});

router.patch('/:roomCode', async (req, res) => {
  try {
    const workspace = await getWorkspaceByCode(req.params.roomCode);
    if (!workspace) {
      return res.status(404).json({ error: 'Workspace not found' });
    }

    const role = governance.getEffectiveRole(workspace, req.user.id);
    if (!governance.isModerator(role)) {
      return res.status(403).json({ error: 'Only the owner or co-owner can edit this workspace' });
    }

    const { name, description } = req.body || {};
    const trimmedName = typeof name === 'string' ? name.trim() : '';
    if (!trimmedName || trimmedName.length > 60) {
      return res.status(400).json({ error: 'Workspace name must be between 1 and 60 characters' });
    }
    // `description` is optional on this endpoint — omitting it (as the
    // inline header-title editor in Workspace.jsx does, which only ever
    // changes the name) leaves the existing description untouched rather
    // than nulling it out; an explicit empty string still clears it.
    const trimmedDescription = description === undefined ? workspace.description : String(description).trim() || null;

    const updated = await db.query(
      `UPDATE workspaces SET title = $1, description = $2, updated_at = CURRENT_TIMESTAMP
       WHERE id = $3
       RETURNING ${WORKSPACE_COLUMNS}`,
      [trimmedName, trimmedDescription, workspace.id]
    );
    const nextWorkspace = updated.rows[0];

    broadcastToRoom(workspace.roomCode, { type: 'workspace:updated', workspace: nextWorkspace, byUserId: req.user.id });
    console.log(`[workspaces] ${workspace.roomCode} renamed to "${trimmedName}" by user ${req.user.id}`);

    res.json({ workspace: nextWorkspace });
  } catch (err) {
    console.error(`[workspaces] update failed: ${err.message}`);
    res.status(500).json({ error: 'Failed to update workspace' });
  }
});

router.delete('/:roomCode/member', async (req, res) => {
  try {
    const workspace = await getWorkspaceByCode(req.params.roomCode);
    if (!workspace) {
      return res.status(404).json({ error: 'Workspace not found' });
    }

    await db.query('DELETE FROM workspace_members WHERE workspace_id = $1 AND user_id = $2', [
      workspace.id,
      req.user.id,
    ]);
    console.log(`[workspaces] user ${req.user.id} removed workspace ${workspace.roomCode} from their dashboard`);
    res.json({ message: 'Removed from dashboard' });
  } catch (err) {
    console.error(`[workspaces] remove member failed: ${err.message}`);
    res.status(500).json({ error: 'Failed to remove workspace from dashboard' });
  }
});

router.delete('/:roomCode', async (req, res) => {
  try {
    const workspace = await getWorkspaceByCode(req.params.roomCode);
    if (!workspace) {
      return res.status(404).json({ error: 'Workspace not found' });
    }
    if (workspace.ownerId !== req.user.id) {
      return res.status(403).json({ error: 'Only the owner can delete this workspace' });
    }

    // Broadcast before the row (and its cascaded files/members) is actually
    // gone, so every connected peer's Workspace.jsx still has a live socket
    // to receive it on and can navigate itself away — see the
    // 'workspace:deleted' handler there.
    broadcastToRoom(workspace.roomCode, { type: 'workspace:deleted', byUserId: req.user.id });

    // ON DELETE CASCADE on files.workspace_id and workspace_members.workspace_id
    // (see server/db/index.js SCHEMA_SQL) takes care of both in the same statement.
    await db.query('DELETE FROM workspaces WHERE id = $1', [workspace.id]);
    console.log(`[workspaces] deleted workspace ${workspace.roomCode} by user ${req.user.id}`);

    res.json({ message: 'Workspace deleted' });
  } catch (err) {
    console.error(`[workspaces] delete failed: ${err.message}`);
    res.status(500).json({ error: 'Failed to delete workspace' });
  }
});

router.patch('/:roomCode/co-owner', async (req, res) => {
  try {
    const workspace = await getWorkspaceByCode(req.params.roomCode);
    if (!workspace) {
      return res.status(404).json({ error: 'Workspace not found' });
    }
    if (workspace.ownerId !== req.user.id) {
      return res.status(403).json({ error: 'Only the owner can assign a co-owner' });
    }

    const { userId } = req.body || {};
    const newCoOwnerId = userId === null || userId === undefined ? null : Number(userId);
    if (newCoOwnerId != null && Number.isNaN(newCoOwnerId)) {
      return res.status(400).json({ error: 'Invalid userId' });
    }
    if (newCoOwnerId === workspace.ownerId) {
      return res.status(400).json({ error: 'The owner cannot also be co-owner' });
    }

    await db.query('UPDATE workspaces SET co_owner_id = $1 WHERE id = $2', [newCoOwnerId, workspace.id]);
    broadcastToRoom(workspace.roomCode, { type: 'coowner:updated', coOwnerId: newCoOwnerId, byUserId: req.user.id });
    console.log(`[workspaces] co-owner of ${workspace.roomCode} set to user ${newCoOwnerId ?? '(none)'} by user ${req.user.id}`);

    res.json({ coOwnerId: newCoOwnerId });
  } catch (err) {
    console.error(`[workspaces] co-owner update failed: ${err.message}`);
    res.status(500).json({ error: 'Failed to update co-owner' });
  }
});

router.post('/:roomCode/files', async (req, res) => {
  try {
    const workspace = await getWorkspaceByCode(req.params.roomCode);
    if (!workspace) {
      return res.status(404).json({ error: 'Workspace not found' });
    }

    const { fileName, language, content } = req.body || {};
    if (!fileName || !fileName.trim()) {
      return res.status(400).json({ error: 'fileName is required' });
    }

    const trimmedName = fileName.trim();
    const existing = await db.query('SELECT id FROM files WHERE workspace_id = $1 AND filename = $2', [workspace.id, trimmedName]);
    if (existing.rows[0]) {
      return res.status(409).json({ error: 'A file with that name already exists in this workspace' });
    }

    const template = STARTER_TEMPLATES[language];
    const finalContent = content === undefined ? (template ? template.content : '') : content;

    const inserted = await db.query(
      `INSERT INTO files (workspace_id, filename, path, language, content)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING ${FILE_COLUMNS}`,
      [workspace.id, trimmedName, `/${trimmedName}`, language || null, finalContent]
    );
    const file = inserted.rows[0];
    await broadcastFileCreated(workspace.roomCode, file);
    res.status(201).json({ file });
  } catch (err) {
    console.error(`[workspaces] add file failed: ${err.message}`);
    res.status(500).json({ error: 'Failed to create file' });
  }
});

router.delete('/:roomCode/files/:fileId', async (req, res) => {
  try {
    const workspace = await getWorkspaceByCode(req.params.roomCode);
    if (!workspace) {
      return res.status(404).json({ error: 'Workspace not found' });
    }

    const fileResult = await db.query(`SELECT ${FILE_COLUMNS} FROM files WHERE id = $1 AND workspace_id = $2`, [
      req.params.fileId,
      workspace.id,
    ]);
    const file = fileResult.rows[0];
    if (!file) {
      return res.status(404).json({ error: 'File not found in this workspace' });
    }

    const countResult = await db.query('SELECT COUNT(*) AS count FROM files WHERE workspace_id = $1', [workspace.id]);
    const fileCount = Number(countResult.rows[0].count);
    if (fileCount <= 1) {
      console.log(`[workspaces] refused to delete last file "${file.fileName}" in workspace ${workspace.roomCode}`);
      return res.status(400).json({ error: 'Cannot delete the last remaining file in a workspace' });
    }

    await db.query('DELETE FROM files WHERE id = $1', [file.id]);
    await broadcastFileDeleted(workspace.roomCode, file.id);
    console.log(`[workspaces] deleted file "${file.fileName}" from workspace ${workspace.roomCode}`);
    res.json({ message: 'File deleted' });
  } catch (err) {
    console.error(`[workspaces] delete file failed: ${err.message}`);
    res.status(500).json({ error: 'Failed to delete file' });
  }
});

module.exports = router;
