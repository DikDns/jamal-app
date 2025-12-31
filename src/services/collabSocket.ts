import { io, Socket } from 'socket.io-client';
import type {
  WSJoinPayload,
  WSStoreGetPayload,
  WSStoreSetPayload,
  WSStorePatchPayload,
  WSStoreStateResponse,
  WSErrorResponse,
  WSPresenceUpdatePayload,
  WSPresenceUpdatedResponse,
} from '../types';

// Production WebSocket URL - can be overridden with VITE_WS_URL env var
const COLLAB_URL = import.meta.env.VITE_WS_URL || 'wss://api.jamal.rplupiproject.com/collab';

// Get API key from environment variable
const ENV_API_KEY = import.meta.env.VITE_COLLAB_API_KEY || null;

type StoreStateCallback = (data: WSStoreStateResponse) => void;
type StoreUpdatedCallback = (data: WSStoreStateResponse) => void;
type StoreConfirmedCallback = (data: { roomId: string; version: number }) => void;
type PresenceUpdatedCallback = (data: WSPresenceUpdatedResponse) => void;
type ErrorCallback = (error: WSErrorResponse) => void;
type ConnectedCallback = () => void;
type DisconnectedCallback = () => void;

interface CollabSocketOptions {
  apiKey?: string;
  onStoreState?: StoreStateCallback;
  onStoreUpdated?: StoreUpdatedCallback;
  onStoreConfirmed?: StoreConfirmedCallback;
  onPresenceUpdated?: PresenceUpdatedCallback;
  onError?: ErrorCallback;
  onConnected?: ConnectedCallback;
  onDisconnected?: DisconnectedCallback;
}

export class CollabSocket {
  private socket: Socket | null = null;
  private options: CollabSocketOptions;
  private currentRoomId: string | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;

  constructor(options: CollabSocketOptions = {}) {
    this.options = options;
  }

  connect(): void {
    if (this.socket?.connected) {
      return;
    }

    // Use provided apiKey or fall back to environment variable
    const apiKey = this.options.apiKey || ENV_API_KEY;
    const auth: Record<string, string> = {};
    if (apiKey) {
      auth.apiKey = apiKey;
    }

    console.log('[CollabSocket] Connecting with API key:', apiKey ? 'Yes' : 'No');

    this.socket = io(COLLAB_URL, {
      auth,
      transports: ['websocket'],
      reconnection: true,
      reconnectionAttempts: this.maxReconnectAttempts,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
    });

    this.setupEventListeners();
  }

  private setupEventListeners(): void {
    if (!this.socket) return;

    this.socket.on('connect', () => {
      console.log('[CollabSocket] Connected');
      this.reconnectAttempts = 0;
      this.options.onConnected?.();

      // Rejoin room if we were in one
      if (this.currentRoomId) {
        this.join(this.currentRoomId);
      }
    });

    this.socket.on('disconnect', (reason) => {
      console.log('[CollabSocket] Disconnected:', reason);
      this.options.onDisconnected?.();
    });

    this.socket.on('connected', (data: { ok: boolean }) => {
      console.log('[CollabSocket] Server confirmed connection:', data);
    });

    this.socket.on('store:state', (data: WSStoreStateResponse) => {
      console.log('[CollabSocket] Received store state:', data.roomId);
      this.options.onStoreState?.(data);
    });

    this.socket.on('store:updated', (data: WSStoreStateResponse) => {
      console.log('[CollabSocket] Store updated:', data.roomId, 'version:', data.version);
      this.options.onStoreUpdated?.(data);
    });

    this.socket.on('store:confirmed', (data: { roomId: string; version: number }) => {
      console.log('[CollabSocket] Store confirmed:', data.roomId, 'version:', data.version);
      this.options.onStoreConfirmed?.(data);
    });

    this.socket.on('presence:updated', (data: WSPresenceUpdatedResponse) => {
      this.options.onPresenceUpdated?.(data);
    });

    this.socket.on('error', (error: WSErrorResponse) => {
      console.error('[CollabSocket] Error:', error);
      this.options.onError?.(error);
    });

    this.socket.on('connect_error', (error) => {
      console.error('[CollabSocket] Connection error:', error);
      this.reconnectAttempts++;
    });
  }

  disconnect(): void {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
      this.currentRoomId = null;
    }
  }

  isConnected(): boolean {
    return this.socket?.connected ?? false;
  }

  // Join a collaboration room
  join(roomId: string): void {
    if (!this.socket?.connected) {
      console.warn('[CollabSocket] Cannot join: not connected');
      return;
    }

    this.currentRoomId = roomId;
    const payload: WSJoinPayload = { roomId };
    this.socket.emit('join', payload);
    console.log('[CollabSocket] Joining room:', roomId);
  }

  // Leave current room
  leave(): void {
    this.currentRoomId = null;
  }

  // Request current store state
  getStore(roomId: string): void {
    if (!this.socket?.connected) {
      console.warn('[CollabSocket] Cannot get store: not connected');
      return;
    }

    const payload: WSStoreGetPayload = { roomId };
    this.socket.emit('store:get', payload);
  }

  // Replace entire store (full sync)
  setStore(roomId: string, version: number, store: WSStoreSetPayload['store']): void {
    if (!this.socket?.connected) {
      console.warn('[CollabSocket] Cannot set store: not connected');
      return;
    }

    const payload: WSStoreSetPayload = { roomId, version, store };
    this.socket.emit('store:set', payload);
    console.log('[CollabSocket] Sending full store, version:', version);
  }

  // Send incremental changes
  patchStore(
    roomId: string,
    baseVersion: number,
    changes: WSStorePatchPayload['changes']
  ): void {
    if (!this.socket?.connected) {
      console.warn('[CollabSocket] Cannot patch store: not connected');
      return;
    }

    const payload: WSStorePatchPayload = { roomId, baseVersion, changes };
    this.socket.emit('store:patch', payload);
    console.log('[CollabSocket] Sending patch, base version:', baseVersion);
  }

  // Send presence update (cursor position)
  updatePresence(
    roomId: string,
    odId: string,
    name: string,
    color: string,
    cursor: { x: number; y: number } | null
  ): void {
    if (!this.socket?.connected) {
      return; // Silently ignore - presence is ephemeral
    }

    const payload: WSPresenceUpdatePayload = { roomId, odId, name, color, cursor };
    this.socket.emit('presence:update', payload);
  }

  // Update callbacks
  setCallbacks(options: Partial<CollabSocketOptions>): void {
    this.options = { ...this.options, ...options };
  }

  getCurrentRoomId(): string | null {
    return this.currentRoomId;
  }
}

// Singleton instance for the app
let collabSocketInstance: CollabSocket | null = null;

export function getCollabSocket(): CollabSocket {
  if (!collabSocketInstance) {
    collabSocketInstance = new CollabSocket();
  }
  return collabSocketInstance;
}

export function initCollabSocket(options: CollabSocketOptions): CollabSocket {
  if (collabSocketInstance) {
    collabSocketInstance.disconnect();
  }
  collabSocketInstance = new CollabSocket(options);
  return collabSocketInstance;
}

