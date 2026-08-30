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
  const { name, description, language } = req.body || {};

  if (!name || !name.trim()) {
    return res.status(400).json({ error: 'Workspace name is required' });
  }

  try {
    const roomCode = await generateRoomCode();
    const template = STARTER_TEMPLATES[language] || STARTER_TEMPLATES.javascript;
    const starterLanguage = STARTER_TEMPLATES[language] ? language : 'javascript';

    const wsResult = await db.query(
      `INSERT INTO workspaces (id, title, description, owner_id, language)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING ${WORKSPACE_COLUMNS}`,
      [roomCode, name.trim(), description ? description.trim() : null, req.user.id, starterLanguage]
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
    const wsResult = await db.query(
      `SELECT ${WORKSPACE_COLUMNS} FROM workspaces WHERE owner_id = $1 OR co_owner_id = $1 ORDER BY created_at DESC`,
      [req.user.id]
    );

    const enriched = await Promise.all(
      wsResult.rows.map(async (ws) => {
        const fileRows = await db.query('SELECT language FROM files WHERE workspace_id = $1', [ws.id]);
        const languages = [...new Set(fileRows.rows.map((f) => f.language).filter(Boolean))];
        return { ...ws, languages, fileCount: fileRows.rows.length };
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
    res.json({ workspace, files: filesResult.rows, roles, presentationMode, myRole });
  } catch (err) {
    console.error(`[workspaces] get failed: ${err.message}`);
    res.status(500).json({ error: 'Failed to load workspace' });
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
