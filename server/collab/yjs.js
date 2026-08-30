const jwt = require('jsonwebtoken');
const Y = require('yjs');
const syncProtocol = require('y-protocols/sync');
const awarenessProtocol = require('y-protocols/awareness');
const encoding = require('lib0/encoding');
const decoding = require('lib0/decoding');
const { WebSocketServer } = require('ws');
const db = require('../db');
const governance = require('./governance');

// This mirrors the well-known y-websocket server reference implementation
// (formerly y-websocket/bin/utils.js, now split into @y/websocket-server),
// reimplemented here against yjs v13 + y-protocols to stay wire-compatible
// with the v13 client stack (@y/websocket-server currently bundles a yjs v14
// pre-release, which is not guaranteed compatible).

const WS_PATH = '/yjs';
const PING_TIMEOUT = 30000;
const PERSIST_DEBOUNCE_MS = 1500;

const MESSAGE_SYNC = 0;
const MESSAGE_AWARENESS = 1;

const docs = new Map(); // docName -> WSSharedDoc (fully hydrated from Postgres)
const docPromises = new Map(); // docName -> Promise<WSSharedDoc> (hydration in flight)
const persistTimers = new Map(); // docName -> Timeout

function send(doc, conn, message) {
  if (conn.readyState !== conn.CONNECTING && conn.readyState !== conn.OPEN) {
    closeConn(doc, conn);
    return;
  }
  try {
    conn.send(message, {}, (err) => {
      if (err != null) closeConn(doc, conn);
    });
  } catch (err) {
    closeConn(doc, conn);
  }
}

function closeConn(doc, conn) {
  if (doc.conns.has(conn)) {
    const controlledIds = doc.conns.get(conn);
    doc.conns.delete(conn);
    awarenessProtocol.removeAwarenessStates(doc.awareness, Array.from(controlledIds), null);
  }
  conn.close();
}

class WSSharedDoc extends Y.Doc {
  constructor(name) {
    super({ gc: true });
    this.name = name;
    this.conns = new Map();
    this.awareness = new awarenessProtocol.Awareness(this);
    this.awareness.setLocalState(null);

    this.awareness.on('update', ({ added, updated, removed }, conn) => {
      const changedClients = added.concat(updated, removed);
      if (conn !== null) {
        const controlledIds = this.conns.get(conn);
        if (controlledIds !== undefined) {
          added.forEach((clientId) => controlledIds.add(clientId));
          removed.forEach((clientId) => controlledIds.delete(clientId));
        }
      }
      const encoder = encoding.createEncoder();
      encoding.writeVarUint(encoder, MESSAGE_AWARENESS);
      encoding.writeVarUint8Array(encoder, awarenessProtocol.encodeAwarenessUpdate(this.awareness, changedClients));
      const message = encoding.toUint8Array(encoder);
      this.conns.forEach((_, c) => send(this, c, message));
    });

    this.on('update', (update) => {
      const encoder = encoding.createEncoder();
      encoding.writeVarUint(encoder, MESSAGE_SYNC);
      syncProtocol.writeUpdate(encoder, update);
      const message = encoding.toUint8Array(encoder);
      this.conns.forEach((_, conn) => send(this, conn, message));
    });
  }
}

const PRESENCE_SUFFIX = '::presence';

function presenceDocName(roomCode) {
  return `${roomCode}${PRESENCE_SUFFIX}`;
}

function extractFileId(docName) {
  const idPart = docName.split('::').pop();
  const id = Number(idPart);
  return Number.isInteger(id) ? id : null;
}

function schedulePersist(docName, fileId, ytext) {
  clearTimeout(persistTimers.get(docName));
  const timer = setTimeout(async () => {
    try {
      await db.query('UPDATE files SET content = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2', [ytext.toString(), fileId]);
    } catch (err) {
      console.error(`[yjs] failed to persist file ${fileId}: ${err.message}`);
    }
  }, PERSIST_DEBOUNCE_MS);
  persistTimers.set(docName, timer);
}

function fileMetadata(file) {
  return { id: file.id, fileName: file.fileName, language: file.language };
}

async function seedFileList(doc, roomCode) {
  const yFiles = doc.getMap('files');
  // files.workspace_id already IS the room code (workspaces.id is the room
  // code itself), so this needs no join against workspaces.
  const result = await db.query(
    `SELECT id, filename AS "fileName", language FROM files WHERE workspace_id = $1 ORDER BY id ASC`,
    [roomCode]
  );
  // .set() is idempotent per key, so re-seeding a doc recreated after a
  // server restart merges cleanly with whatever a long-lived client tab
  // already has for these same ids — no duplicate entries. A Y.Array here
  // would instead permanently record a second, indistinguishable positional
  // insert for every file on every restart-while-connected, which is exactly
  // what caused the sidebar duplication bug.
  result.rows.forEach((row) => yFiles.set(String(row.id), fileMetadata(row)));
}

// Always returns a Promise, even for an already-hydrated doc — every caller
// awaits it. That's deliberate: docs.set() used to happen synchronously
// before any DB read, so a second concurrent connection to the same room
// would reuse the same (still-hydrating) doc instance safely. Now that
// hydration is itself async, docPromises caches the in-flight hydration
// promise so concurrent callers await the *same* hydration instead of one of
// them proceeding — and sending Yjs sync messages — against a doc that
// hasn't loaded its persisted content yet.
function getYDoc(docName) {
  const existing = docs.get(docName);
  if (existing) return Promise.resolve(existing);

  const pending = docPromises.get(docName);
  if (pending) return pending;

  const promise = (async () => {
    const doc = new WSSharedDoc(docName);

    if (docName.endsWith(PRESENCE_SUFFIX)) {
      await seedFileList(doc, docName.slice(0, -PRESENCE_SUFFIX.length));
    } else {
      const fileId = extractFileId(docName);
      if (fileId != null) {
        const ytext = doc.getText('content');
        const result = await db.query('SELECT content FROM files WHERE id = $1', [fileId]);
        const file = result.rows[0];
        if (file && file.content) {
          ytext.insert(0, file.content);
        }
        ytext.observe(() => schedulePersist(docName, fileId, ytext));
      }
    }

    docs.set(docName, doc);
    docPromises.delete(docName);
    return doc;
  })();

  docPromises.set(docName, promise);
  return promise;
}

// Called from the REST file routes (not a websocket connection) right after a
// DB write. Mutating the shared Y.Array here fires the same doc 'update' ->
// broadcast-to-all-conns path a real client edit would, so every connected
// tab picks up the change instantly — no separate pub/sub layer needed.
async function broadcastFileCreated(roomCode, file) {
  const doc = await getYDoc(presenceDocName(roomCode));
  doc.getMap('files').set(String(file.id), fileMetadata(file));
}

async function broadcastFileDeleted(roomCode, fileId) {
  const doc = await getYDoc(presenceDocName(roomCode));
  doc.getMap('files').delete(String(fileId));
}

function messageListener(conn, doc, message) {
  try {
    const encoder = encoding.createEncoder();
    const decoder = decoding.createDecoder(message);
    const messageType = decoding.readVarUint(decoder);

    switch (messageType) {
      case MESSAGE_SYNC:
        encoding.writeVarUint(encoder, MESSAGE_SYNC);
        syncProtocol.readSyncMessage(decoder, encoder, doc, conn);
        if (encoding.length(encoder) > 1) {
          send(doc, conn, encoding.toUint8Array(encoder));
        }
        break;
      case MESSAGE_AWARENESS:
        awarenessProtocol.applyAwarenessUpdate(doc.awareness, decoding.readVarUint8Array(decoder), conn);
        break;
      default:
        break;
    }
  } catch (err) {
    console.error('[yjs] message handling error:', err.message);
  }
}

// getYDoc's DB read means a connection can now have messages arrive (the
// y-websocket client sends its own sync step 1 the instant the socket opens,
// without waiting on us) before hydration finishes. message/close listeners
// go on synchronously, before the await, so nothing is dropped in that
// window; anything that arrives early is queued and flushed in order once
// the doc is ready.
async function setupConnection(conn, docName) {
  conn.binaryType = 'arraybuffer';

  let doc = null;
  let closed = false;
  let pingInterval = null;
  const pending = [];

  conn.on('message', (message) => {
    const data = new Uint8Array(message);
    if (doc) messageListener(conn, doc, data);
    else pending.push(data);
  });

  conn.on('close', () => {
    closed = true;
    if (doc) closeConn(doc, conn);
    if (pingInterval) clearInterval(pingInterval);
  });

  doc = await getYDoc(docName);
  if (closed) return; // connection already gone before hydration finished

  doc.conns.set(conn, new Set());
  pending.splice(0).forEach((data) => messageListener(conn, doc, data));

  let pongReceived = true;
  pingInterval = setInterval(() => {
    if (!pongReceived) {
      if (doc.conns.has(conn)) closeConn(doc, conn);
      clearInterval(pingInterval);
      return;
    }
    if (doc.conns.has(conn)) {
      pongReceived = false;
      try {
        conn.ping();
      } catch (err) {
        closeConn(doc, conn);
        clearInterval(pingInterval);
      }
    }
  }, PING_TIMEOUT);

  conn.on('pong', () => {
    pongReceived = true;
  });

  // initial sync step 1 + current awareness snapshot
  const syncEncoder = encoding.createEncoder();
  encoding.writeVarUint(syncEncoder, MESSAGE_SYNC);
  syncProtocol.writeSyncStep1(syncEncoder, doc);
  send(doc, conn, encoding.toUint8Array(syncEncoder));

  const awarenessStates = doc.awareness.getStates();
  if (awarenessStates.size > 0) {
    const awarenessEncoder = encoding.createEncoder();
    encoding.writeVarUint(awarenessEncoder, MESSAGE_AWARENESS);
    encoding.writeVarUint8Array(
      awarenessEncoder,
      awarenessProtocol.encodeAwarenessUpdate(doc.awareness, Array.from(awarenessStates.keys()))
    );
    send(doc, conn, encoding.toUint8Array(awarenessEncoder));
  }
}

function attachYjsServer(httpServer) {
  const wss = new WebSocketServer({ noServer: true });

  httpServer.on('upgrade', (request, socket, head) => {
    let url;
    try {
      url = new URL(request.url, 'http://localhost');
    } catch (err) {
      socket.destroy();
      return;
    }

    if (!url.pathname.startsWith(`${WS_PATH}/`)) {
      // not ours — leave it for another 'upgrade' listener (e.g. /exec)
      return;
    }

    const token = url.searchParams.get('token');
    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET);
    } catch (err) {
      console.log('[yjs] rejected connection: invalid or missing token');
      // Complete the handshake, then close with a permanent (4400-4499) code so the
      // client's default shouldReconnect stops retrying instead of looping forever
      // (rejecting the raw upgrade is invisible to the browser's WebSocket API).
      wss.handleUpgrade(request, socket, head, (ws) => {
        ws.close(4401, 'invalid token');
      });
      return;
    }

    const docName = decodeURIComponent(url.pathname.slice(WS_PATH.length + 1));
    const roomCode = docName.split('::')[0];

    if (governance.isKicked(roomCode, decoded.id)) {
      wss.handleUpgrade(request, socket, head, (ws) => {
        ws.close(4403, 'kicked from this room');
      });
      return;
    }

    wss.handleUpgrade(request, socket, head, (ws) => {
      console.log(`[yjs] user ${decoded.id} connected to doc "${docName}"`);
      setupConnection(ws, docName).catch((err) => {
        console.error(`[yjs] failed to set up connection for doc "${docName}": ${err.message}`);
        try {
          ws.close(1011, 'internal error');
        } catch {
          // already closed
        }
      });
    });
  });

  console.log(`[yjs] websocket sync attached at ${WS_PATH}`);
}

module.exports = { attachYjsServer, broadcastFileCreated, broadcastFileDeleted };
