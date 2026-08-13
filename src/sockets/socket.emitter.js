/**
 * Services need to push events without importing Socket.IO themselves —
 * that would mean every service touching a socket also has to know about
 * `io`, room names, and connection lifecycle. Instead, `sockets/index.js`
 * calls `setIo` once at startup, and services just call `emitToUser`,
 * the same way they already call `logger` or `redis` without caring how
 * those are wired up.
 *
 * `ioInstance` starts null so importing this module (e.g. in a unit test
 * that never boots the socket server) never crashes — emits become silent
 * no-ops instead of throwing.
 */
let ioInstance = null;

export function setIo(io) {
  ioInstance = io;
}

export function emitToUser(userId, event, payload) {
  ioInstance?.to(`user:${userId}`).emit(event, payload);
}
