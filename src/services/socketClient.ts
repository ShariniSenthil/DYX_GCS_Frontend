/**
 * socketClient — Singleton Socket.IO manager for 4WD_SERVER.
 *
 * Features:
 * - Connects with `auth: { token }` from AuthContext via injected getter
 * - Reconnects automatically; re-passes fresh token on each connect
 * - Named listener registration prevents duplicate handlers
 * - Exposes connection change subscription for ConnectionContext
 * - Broadcasts to all registered connection-change listeners on state change
 *
 * Usage:
 *   socketClient.configure(getToken);
 *   socketClient.connect(url);
 *   const off = socketClient.on('telemetry', handler);
 *   // ...
 *   off(); // deregister
 */

import io, { Socket } from 'socket.io-client';
import { SOCKET_CONFIG } from '../config';

// ── Types ─────────────────────────────────────────────────────────────────────

type GetTokenFn = () => string | null;
type ConnectionChangeFn = (connected: boolean, socket: Socket | null) => void;
type EventHandler = (...args: unknown[]) => void;

export type SocketConnectionState = 'disconnected' | 'connecting' | 'connected' | 'error';

// ── Singleton state ───────────────────────────────────────────────────────────

let _socket: Socket | null = null;
let _getToken: GetTokenFn = () => null;
let _connectionState: SocketConnectionState = 'disconnected';

/** Set of functions to call when connection state changes. */
const _connectionListeners = new Set<ConnectionChangeFn>();

/** Named listener map — key = `${event}::${id}`, value = handler. */
const _namedListeners = new Map<string, EventHandler>();

// ── Internal helpers ──────────────────────────────────────────────────────────

function notifyConnectionListeners(): void {
  const isConnected = _connectionState === 'connected';
  _connectionListeners.forEach((fn) => fn(isConnected, _socket));
}

function attachCoreHandlers(socket: Socket): void {
  socket.on('connect', () => {
    _connectionState = 'connected';
    notifyConnectionListeners();
  });

  socket.on('disconnect', (reason: string) => {
    _connectionState = 'disconnected';
    notifyConnectionListeners();
    console.log('[socketClient] Disconnected:', reason);
  });

  socket.on('connect_error', (err: Error) => {
    _connectionState = 'error';
    notifyConnectionListeners();
    console.warn('[socketClient] Connect error:', err.message);
  });

  // Re-auth on each reconnect attempt — Socket.IO v4 passes auth on reconnect
  socket.io.on('reconnect_attempt', () => {
    const token = _getToken();
    if (token && socket.auth) {
      (socket.auth as Record<string, unknown>).token = token;
    }
  });
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Inject the token getter (call once from AuthContext on mount).
 * This breaks the circular import: socketClient → AuthContext.
 */
export function configure(getToken: GetTokenFn): void {
  _getToken = getToken;
}

/** Connect to a backend URL. If already connected to the same URL, no-op. */
export function connect(backendUrl: string): void {
  const currentSocket = _socket;
  // Check if we're already connected — use io.uri which is the internal manager URI
  if (currentSocket?.connected) {
    try {
      const managerUri = (currentSocket.io as any)?.uri ?? (currentSocket.io as any)?.opts?.hostname;
      if (managerUri && backendUrl.includes(managerUri)) {
        return; // Already connected to same host
      }
    } catch { /* ignore */ }
  }

  disconnect(); // Clean up previous connection

  const token = _getToken();
  _connectionState = 'connecting';

  _socket = io(backendUrl, {
    ...SOCKET_CONFIG,
    autoConnect: true,
    auth: token ? { token } : undefined,
  } as Parameters<typeof io>[1]);

  attachCoreHandlers(_socket);

  // Re-register any named listeners onto the new socket
  _namedListeners.forEach((handler, key) => {
    const eventName = key.split('::')[0];
    _socket!.on(eventName, handler);
  });

  notifyConnectionListeners();
}

/** Disconnect and clean up. */
export function disconnect(): void {
  if (_socket) {
    _socket.removeAllListeners();
    _socket.disconnect();
    _socket = null;
  }
  _connectionState = 'disconnected';
  notifyConnectionListeners();
}

/** Get current socket (null if not connected). */
export function getSocket(): Socket | null {
  return _socket;
}

/** Get current connection state. */
export function getConnectionState(): SocketConnectionState {
  return _connectionState;
}

/**
 * Register a named event listener.
 * If a listener with the same name already exists it is replaced (no duplicates).
 * Returns an unsubscribe function.
 *
 * @param event    Socket.IO event name
 * @param handler  Callback function
 * @param id       Unique ID for this registration (prevents duplicates)
 */
export function on(
  event: string,
  handler: EventHandler,
  id = event,
): () => void {
  const key = `${event}::${id}`;

  // Remove previous listener with same key
  if (_namedListeners.has(key)) {
    const old = _namedListeners.get(key)!;
    _socket?.off(event, old);
  }

  _namedListeners.set(key, handler);
  _socket?.on(event, handler);

  return () => off(event, id);
}

/** Deregister a named listener. */
export function off(event: string, id = event): void {
  const key = `${event}::${id}`;
  const handler = _namedListeners.get(key);
  if (handler) {
    _socket?.off(event, handler);
    _namedListeners.delete(key);
  }
}

/** Emit a socket event (no-op if not connected). */
export function emit(event: string, ...args: unknown[]): void {
  if (_socket?.connected) {
    _socket.emit(event, ...args);
  } else {
    console.warn(`[socketClient] emit('${event}') called while not connected`);
  }
}

/**
 * Subscribe to connection state changes.
 * Returns an unsubscribe function.
 */
export function onConnectionChange(fn: ConnectionChangeFn): () => void {
  _connectionListeners.add(fn);
  // Immediately notify with current state
  fn(_connectionState === 'connected', _socket);
  return () => _connectionListeners.delete(fn);
}

export const socketClient = {
  configure,
  connect,
  disconnect,
  getSocket,
  getConnectionState,
  on,
  off,
  emit,
  onConnectionChange,
};

export default socketClient;
