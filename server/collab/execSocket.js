const jwt = require('jsonwebtoken');
const { WebSocketServer } = require('ws');
const db = require('../db');
const { runCode } = require('../services/executionService');
const governance = require('./governance');

// A room-scoped ephemeral event bus: execution results, moderation commands,
// and WebRTC signaling are all broadcast/relay events, not shared document
// state — no CRDT reconciliation needed, so this stays a plain JSON protocol
// over a raw websocket rather than another Yjs channel or Socket.io.
const WS_PATH = '/exec';

const rooms = new Map(); // roomCode -> Map<userId, Set<ws>>  (Set supports multiple tabs per user)
const activeRuns = new Map(); // roomCode -> { write(text) } for the in-flight execution, if any
const voiceParticipants = new Map(); // roomCode -> Set<userId>

async function getWorkspace(roomCode) {
  const result = await db.query(`SELECT ${db.WORKSPACE_COLUMNS} FROM workspaces WHERE id = $1`, [roomCode]);
  return result.rows[0];
}

function broadcast(roomCode, payload, exceptUserId) {
  const conns = rooms.get(roomCode);
  if (!conns) return;
  const message = JSON.stringify(payload);
  conns.forEach((wsSet, userId) => {
    if (userId === exceptUserId) return;
    wsSet.forEach((ws) => {
      if (ws.readyState === ws.OPEN) ws.send(message);
    });
  });
}

function sendToUser(roomCode, userId, payload) {
  const wsSet = rooms.get(roomCode)?.get(userId);
  if (!wsSet) return;
  const message = JSON.stringify(payload);
  wsSet.forEach((ws) => {
    if (ws.readyState === ws.OPEN) ws.send(message);
  });
}

function sendTo(ws, payload) {
  if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(payload));
}

function sendError(ws, message) {
  sendTo(ws, { type: 'error', message });
}

// ---- code execution -------------------------------------------------------

async function handleCodeRun(roomCode, user, msg) {
  if (activeRuns.has(roomCode)) {
    sendToUser(roomCode, user.id, {
      type: 'code:output',
      fileId: msg.fileId,
      runnerName: user.name,
      runnerId: user.id,
      stdout: '',
      stderr: 'Another execution is already running in this workspace — please wait for it to finish.',
      exitCode: 1,
      durationMs: 0,
      timedOut: false,
      mode: 'error',
      rejected: true,
    });
    return;
  }

  const { fileId, language, code, stdin } = msg;

  broadcast(roomCode, {
    type: 'code:running',
    fileId,
    runnerName: user.name,
    runnerId: user.id,
    startedAt: Date.now(),
  });

  try {
    const session = runCode({
      language,
      code,
      stdin,
      onStdout: (text) => broadcast(roomCode, { type: 'code:chunk', fileId, stream: 'stdout', text }),
      onStderr: (text) => broadcast(roomCode, { type: 'code:chunk', fileId, stream: 'stderr', text }),
    });
    activeRuns.set(roomCode, session);

    const result = await session.result;
    broadcast(roomCode, { type: 'code:output', fileId, runnerName: user.name, runnerId: user.id, ...result });
  } catch (err) {
    broadcast(roomCode, {
      type: 'code:output',
      fileId,
      runnerName: user.name,
      runnerId: user.id,
      stdout: '',
      stderr: `Internal execution error: ${err.message}`,
      exitCode: 1,
      durationMs: 0,
      timedOut: false,
      mode: 'error',
    });
  } finally {
    activeRuns.delete(roomCode);
  }
}

// Forwards a line of interactive input to whichever process is currently
// running in this room (if any) and echoes it back to everyone watching, the
// same way code:running/code:output already broadcast to the whole room —
// keeps the terminal a shared view, consistent with the rest of this app's
// collaborative model.
function handleStdin(roomCode, user, msg) {
  const session = activeRuns.get(roomCode);
  if (!session) {
    sendToUser(roomCode, user.id, { type: 'error', message: 'No execution is currently running' });
    return;
  }
  const text = typeof msg.text === 'string' ? msg.text : '';
  if (!text) return;

  session.write(text);
  broadcast(roomCode, { type: 'code:stdin-echo', fileId: msg.fileId, text, userId: user.id, userName: user.name });
}

// ---- governance -------------------------------------------------------

async function requireModerator(roomCode, user, ws, action) {
  const workspace = await getWorkspace(roomCode);
  if (!workspace) return null;
  const role = governance.getEffectiveRole(workspace, user.id);
  if (!governance.isModerator(role)) {
    sendError(ws, `Only the owner or co-owner can ${action}`);
    return null;
  }
  return workspace;
}

async function handleSetRole(roomCode, user, msg, ws) {
  const workspace = await requireModerator(roomCode, user, ws, 'change member roles');
  if (!workspace) return;
  if (msg.targetUserId === workspace.ownerId) return sendError(ws, "Cannot change the owner's role");
  if (!['editor', 'viewer'].includes(msg.role)) return;
  governance.setRole(roomCode, msg.targetUserId, msg.role);
  broadcast(roomCode, { type: 'role:updated', targetUserId: msg.targetUserId, role: msg.role, byUserId: user.id });
}

async function handleKick(roomCode, user, msg, ws) {
  const workspace = await requireModerator(roomCode, user, ws, 'kick members');
  if (!workspace) return;
  if (msg.targetUserId === workspace.ownerId) return sendError(ws, 'Cannot kick the owner');
  governance.kick(roomCode, msg.targetUserId);
  broadcast(roomCode, { type: 'member:kicked', targetUserId: msg.targetUserId, byUserId: user.id });
}

async function handleMute(roomCode, user, msg, ws) {
  const workspace = await requireModerator(roomCode, user, ws, 'mute members');
  if (!workspace) return;
  if (msg.targetUserId === workspace.ownerId) return sendError(ws, 'Cannot mute the owner');
  const muted = msg.muted !== false;
  governance.setMuted(roomCode, msg.targetUserId, muted);
  broadcast(roomCode, { type: 'member:muted', targetUserId: msg.targetUserId, muted, byUserId: user.id });
}

async function handleMuteAll(roomCode, user, ws) {
  const workspace = await requireModerator(roomCode, user, ws, 'mute all members');
  if (!workspace) return;
  const connectedUserIds = Array.from(rooms.get(roomCode)?.keys() || []).filter(
    (id) => id !== workspace.ownerId && id !== user.id
  );
  governance.muteAll(roomCode, connectedUserIds);
  broadcast(roomCode, { type: 'member:mute-all', mutedUserIds: connectedUserIds, byUserId: user.id });
}

async function handleUnmuteAll(roomCode, user, ws) {
  const workspace = await requireModerator(roomCode, user, ws, 'unmute all members');
  if (!workspace) return;
  governance.unmuteAll(roomCode);
  broadcast(roomCode, { type: 'member:unmute-all', byUserId: user.id });
}

async function handleTogglePresentation(roomCode, user, msg, ws) {
  const workspace = await requireModerator(roomCode, user, ws, 'toggle presentation mode');
  if (!workspace) return;
  const enabled = Boolean(msg.enabled);
  governance.setPresentationMode(roomCode, enabled);
  broadcast(roomCode, { type: 'presentation:updated', enabled, byUserId: user.id });
}

// ---- WebRTC voice signaling (mesh: new joiner offers to everyone already there) --

function handleVoiceJoin(roomCode, user) {
  if (!voiceParticipants.has(roomCode)) voiceParticipants.set(roomCode, new Set());
  const participants = voiceParticipants.get(roomCode);
  const roster = Array.from(participants).filter((id) => id !== user.id);
  participants.add(user.id);
  sendToUser(roomCode, user.id, { type: 'voice:roster', peers: roster });
  broadcast(roomCode, { type: 'voice:peer-joined', userId: user.id }, user.id);
}

function handleVoiceLeave(roomCode, user) {
  voiceParticipants.get(roomCode)?.delete(user.id);
  broadcast(roomCode, { type: 'voice:peer-left', userId: user.id });
}

function handleVoiceSignal(roomCode, user, msg) {
  if (!msg.targetUserId || !msg.signal) return;
  sendToUser(roomCode, msg.targetUserId, { type: 'voice:signal', fromUserId: user.id, signal: msg.signal });
}

// ---- connection lifecycle -------------------------------------------------------

function setupExecConnection(ws, roomCode, user) {
  if (!rooms.has(roomCode)) rooms.set(roomCode, new Map());
  const roomConns = rooms.get(roomCode);
  if (!roomConns.has(user.id)) roomConns.set(user.id, new Set());
  const isFirstConnectionForUser = roomConns.get(user.id).size === 0;
  roomConns.get(user.id).add(ws);

  if (isFirstConnectionForUser) {
    broadcast(roomCode, { type: 'member:joined', userId: user.id }, user.id);
  }

  ws.on('message', async (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      return;
    }

    switch (msg.type) {
      case 'code:run':
        await handleCodeRun(roomCode, user, msg);
        break;
      case 'stdin':
        handleStdin(roomCode, user, msg);
        break;
      case 'governance:set-role':
        await handleSetRole(roomCode, user, msg, ws);
        break;
      case 'governance:kick':
        await handleKick(roomCode, user, msg, ws);
        break;
      case 'governance:mute':
        await handleMute(roomCode, user, msg, ws);
        break;
      case 'governance:mute-all':
        await handleMuteAll(roomCode, user, ws);
        break;
      case 'governance:unmute-all':
        await handleUnmuteAll(roomCode, user, ws);
        break;
      case 'governance:toggle-presentation':
        await handleTogglePresentation(roomCode, user, msg, ws);
        break;
      case 'voice:join':
        handleVoiceJoin(roomCode, user);
        break;
      case 'voice:leave':
        handleVoiceLeave(roomCode, user);
        break;
      case 'voice:signal':
        handleVoiceSignal(roomCode, user, msg);
        break;
      default:
        break;
    }
  });

  ws.on('close', () => {
    const userConns = roomConns.get(user.id);
    if (!userConns) return;
    userConns.delete(ws);
    if (userConns.size === 0) {
      roomConns.delete(user.id);
      broadcast(roomCode, { type: 'member:left', userId: user.id });
      if (voiceParticipants.get(roomCode)?.has(user.id)) {
        voiceParticipants.get(roomCode).delete(user.id);
        broadcast(roomCode, { type: 'voice:peer-left', userId: user.id });
      }
    }
    if (roomConns.size === 0) {
      rooms.delete(roomCode);
      // Nobody left to see output or answer prompts — kill any in-flight
      // run instead of leaving it as an orphaned process. handleCodeRun's
      // finally block still clears activeRuns once the kill resolves.
      activeRuns.get(roomCode)?.kill();
    }
  });
}

function attachExecServer(httpServer) {
  const wss = new WebSocketServer({ noServer: true });

  httpServer.on('upgrade', (request, socket, head) => {
    let url;
    try {
      url = new URL(request.url, 'http://localhost');
    } catch {
      return;
    }

    if (!url.pathname.startsWith(`${WS_PATH}/`)) {
      return; // not ours — leave it for /yjs's listener
    }

    const token = url.searchParams.get('token');
    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET);
    } catch {
      console.log('[exec] rejected connection: invalid or missing token');
      wss.handleUpgrade(request, socket, head, (ws) => {
        ws.close(4401, 'invalid token');
      });
      return;
    }

    const roomCode = decodeURIComponent(url.pathname.slice(WS_PATH.length + 1));

    if (governance.isKicked(roomCode, decoded.id)) {
      wss.handleUpgrade(request, socket, head, (ws) => {
        ws.close(4403, 'kicked from this room');
      });
      return;
    }

    wss.handleUpgrade(request, socket, head, (ws) => {
      console.log(`[exec] user ${decoded.id} connected to room "${roomCode}"`);
      setupExecConnection(ws, roomCode, decoded);
    });
  });

  console.log(`[exec] websocket pipeline attached at ${WS_PATH}`);
}

module.exports = { attachExecServer, broadcastToRoom: broadcast };
