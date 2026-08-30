// In-memory room governance state: participant roles (editor/viewer),
// presentation mode, muted/kicked sets. Owner and co-owner are the one part
// of the role system that's structurally meaningful enough to persist
// (workspaces.ownerId / coOwnerId, already in the schema) — everything here
// is deliberately session-scoped, consistent with the rest of this app's
// real-time layer (Yjs presence/exec state is already all in-memory).

const rolesByRoom = new Map(); // roomCode -> Map<userId, 'editor'|'viewer'>
const presentationModeByRoom = new Map(); // roomCode -> boolean
const mutedByRoom = new Map(); // roomCode -> Set<userId>
const kickedByRoom = new Map(); // roomCode -> Set<userId>

function getEffectiveRole(workspace, userId) {
  if (workspace.ownerId === userId) return 'owner';
  if (workspace.coOwnerId === userId) return 'coOwner';
  const roomRoles = rolesByRoom.get(workspace.roomCode);
  return roomRoles?.get(userId) || 'editor';
}

function isModerator(role) {
  return role === 'owner' || role === 'coOwner';
}

function setRole(roomCode, userId, role) {
  if (!rolesByRoom.has(roomCode)) rolesByRoom.set(roomCode, new Map());
  rolesByRoom.get(roomCode).set(userId, role);
}

function getAllRoles(roomCode) {
  return Object.fromEntries(rolesByRoom.get(roomCode) || []);
}

function getPresentationMode(roomCode) {
  return presentationModeByRoom.get(roomCode) || false;
}

function setPresentationMode(roomCode, enabled) {
  presentationModeByRoom.set(roomCode, enabled);
}

function isMuted(roomCode, userId) {
  return mutedByRoom.get(roomCode)?.has(userId) || false;
}

function setMuted(roomCode, userId, muted) {
  if (!mutedByRoom.has(roomCode)) mutedByRoom.set(roomCode, new Set());
  const set = mutedByRoom.get(roomCode);
  if (muted) set.add(userId);
  else set.delete(userId);
}

function muteAll(roomCode, userIds) {
  if (!mutedByRoom.has(roomCode)) mutedByRoom.set(roomCode, new Set());
  const set = mutedByRoom.get(roomCode);
  userIds.forEach((id) => set.add(id));
}

function unmuteAll(roomCode) {
  mutedByRoom.set(roomCode, new Set());
}

function isKicked(roomCode, userId) {
  return kickedByRoom.get(roomCode)?.has(userId) || false;
}

function kick(roomCode, userId) {
  if (!kickedByRoom.has(roomCode)) kickedByRoom.set(roomCode, new Set());
  kickedByRoom.get(roomCode).add(userId);
}

module.exports = {
  getEffectiveRole,
  isModerator,
  setRole,
  getAllRoles,
  getPresentationMode,
  setPresentationMode,
  isMuted,
  setMuted,
  muteAll,
  unmuteAll,
  isKicked,
  kick,
};
