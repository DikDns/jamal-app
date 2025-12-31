import { useEffect, useCallback, useRef, useState } from 'react';
import { Editor, loadSnapshot, getSnapshot, TLStoreEventInfo, TLStoreSnapshot } from 'tldraw';
import { initCollabSocket, CollabSocket } from '../services/collabSocket';
import { useIsOnline } from '../store/useAppStore';
import { mergeWithLWW, hasChanges, type RecordMap, type TimestampMap } from '../utils/lwwMerge';
import type { WSStoreStateResponse, WSErrorResponse, WSPresenceUpdatedResponse, PresenceData } from '../types';

// Constants for batching - throttled approach for instant feedback
const BATCH_THROTTLE_MS = 30; // Send immediately, then throttle for 30ms
const PRESENCE_THROTTLE_MS = 50; // Throttle cursor updates

interface UseCollaborationOptions {
  tabId: string;
  roomId: string | null;
  editor: Editor | null;
  userName?: string;
  userColor?: string;
}

interface UseCollaborationReturn {
  isConnected: boolean;
  isSyncing: boolean;
  version: number;
  error: string | null;
  hasPendingChanges: boolean;
  remotePresences: Map<string, PresenceData>;
  connect: () => void;
  disconnect: () => void;
}

// Storage key for offline changes
const OFFLINE_CHANGES_KEY = 'jamal_offline_changes';

interface OfflineChange {
  tabId: string;
  roomId: string;
  timestamp: number;
  snapshot: unknown;
  timestamps: TimestampMap;
}

// Persist offline changes to localStorage
function saveOfflineChange(change: OfflineChange) {
  try {
    const existing = localStorage.getItem(OFFLINE_CHANGES_KEY);
    const changes: OfflineChange[] = existing ? JSON.parse(existing) : [];

    const index = changes.findIndex(
      (c) => c.tabId === change.tabId && c.roomId === change.roomId
    );

    if (index >= 0) {
      changes[index] = change;
    } else {
      changes.push(change);
    }

    localStorage.setItem(OFFLINE_CHANGES_KEY, JSON.stringify(changes));
  } catch (err) {
    console.error('[Collab] Failed to save offline change:', err);
  }
}

// Get offline changes for a room
function getOfflineChanges(roomId: string): OfflineChange | null {
  try {
    const existing = localStorage.getItem(OFFLINE_CHANGES_KEY);
    if (!existing) return null;

    const changes: OfflineChange[] = JSON.parse(existing);
    return changes.find((c) => c.roomId === roomId) || null;
  } catch {
    return null;
  }
}

// Clear offline changes for a room
function clearOfflineChanges(roomId: string) {
  try {
    const existing = localStorage.getItem(OFFLINE_CHANGES_KEY);
    if (!existing) return;

    const changes: OfflineChange[] = JSON.parse(existing);
    const filtered = changes.filter((c) => c.roomId !== roomId);
    localStorage.setItem(OFFLINE_CHANGES_KEY, JSON.stringify(filtered));
  } catch {
    // Ignore
  }
}

// Generate a random user color
function generateUserColor(): string {
  const colors = [
    '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4',
    '#FFEAA7', '#DDA0DD', '#98D8C8', '#F7DC6F',
  ];
  return colors[Math.floor(Math.random() * colors.length)];
}

// Generate a unique ID for this client
function generateClientId(): string {
  return `client-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

export function useCollaboration({
  tabId,
  roomId,
  editor,
  userName = 'Anonymous',
  userColor,
}: UseCollaborationOptions): UseCollaborationReturn {
  const isOnline = useIsOnline();

  const [isConnected, setIsConnected] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [version, setVersion] = useState(0);
  const [hasPendingChanges, setHasPendingChanges] = useState(false);
  const [remotePresences, setRemotePresences] = useState<Map<string, PresenceData>>(new Map());

  const socketRef = useRef<CollabSocket | null>(null);
  const versionRef = useRef(0);
  const isApplyingRemoteRef = useRef(false);
  const wasConnectedRef = useRef(false);

  // LWW timestamp tracking
  const localTimestampsRef = useRef<TimestampMap>({});
  const lastSyncedRecordsRef = useRef<RecordMap>({});

  // Batching state
  const pendingBatchRef = useRef<{
    put: Record<string, unknown>[];
    update: Array<{ id: string; after: Record<string, unknown> }>;
    remove: Array<{ id: string }>;
  }>({ put: [], update: [], remove: [] });
  const batchIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const batchThrottleRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isSyncingRef = useRef(false);

  // Track the version we're currently sending to detect conflicts
  const pendingSendVersionRef = useRef<number | null>(null);

  // Presence state
  const clientIdRef = useRef(generateClientId());
  const userColorRef = useRef(userColor || generateUserColor());
  const lastPresenceUpdateRef = useRef(0);

  // Sync safety: timeout for the syncing flag
  const syncTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Track recently sent record IDs to prevent echo updates
  const recentlySentRecordsRef = useRef<Set<string>>(new Set());

  // Conflict recovery state
  const isRecoveringFromConflictRef = useRef(false);
  const pendingLocalChangesRef = useRef<RecordMap | null>(null);

  // Check for offline changes on mount
  useEffect(() => {
    if (roomId) {
      const offlineChange = getOfflineChanges(roomId);
      setHasPendingChanges(!!offlineChange);
      if (offlineChange?.timestamps) {
        localTimestampsRef.current = offlineChange.timestamps;
      }
    }
  }, [roomId]);

  // Get current store records
  const getStoreRecords = useCallback((): RecordMap => {
    if (!editor) return {};
    try {
      const editorSnapshot = getSnapshot(editor.store);
      const storeRecords = (editorSnapshot as any).document?.store || (editorSnapshot as any).store || {};
      return storeRecords as RecordMap;
    } catch {
      return {};
    }
  }, [editor]);

  // Handle incoming store state (initial sync after join)
  const handleStoreState = useCallback((data: WSStoreStateResponse) => {
    if (!editor) {
      console.log('[Collab] Store state received but editor not ready');
      return;
    }
    if (data.roomId !== roomId) {
      return;
    }

    console.log('[Collab] Received initial store state, version:', data.version);

    const offlineChange = getOfflineChanges(roomId);

    isApplyingRemoteRef.current = true;
    try {
      let records: RecordMap | null = null;

      if (data.store?.records && typeof data.store.records === 'object') {
        records = data.store.records as RecordMap;
      } else if (data.store && typeof data.store === 'object' && !data.store.schemaVersion) {
        records = data.store as unknown as RecordMap;
      }

      // Handle conflict recovery with LWW merge
      if (isRecoveringFromConflictRef.current && pendingLocalChangesRef.current) {
        console.log('[Collab] Applying LWW merge for conflict recovery');
        const serverTimestamps: TimestampMap = {};
        // Server records get current time as timestamp (they're authoritative)
        const now = Date.now();
        for (const id of Object.keys(records || {})) {
          serverTimestamps[id] = now - 1; // Slightly older so local wins ties
        }

        const { records: mergedRecords, timestamps: mergedTimestamps } = mergeWithLWW(
          pendingLocalChangesRef.current,
          localTimestampsRef.current,
          records || {},
          serverTimestamps
        );

        records = mergedRecords;
        localTimestampsRef.current = mergedTimestamps;
        pendingLocalChangesRef.current = null;
        isRecoveringFromConflictRef.current = false;
      } else if (offlineChange) {
        // Merge offline changes
        console.log('[Collab] Merging offline changes with server state');
        const offlineRecords = (offlineChange.snapshot as any)?.records || {};
        const offlineTimestamps = offlineChange.timestamps || {};

        const serverTimestamps: TimestampMap = {};
        const now = Date.now();
        for (const id of Object.keys(records || {})) {
          serverTimestamps[id] = now - 1;
        }

        const { records: mergedRecords, timestamps: mergedTimestamps } = mergeWithLWW(
          offlineRecords,
          offlineTimestamps,
          records || {},
          serverTimestamps
        );

        records = mergedRecords;
        localTimestampsRef.current = mergedTimestamps;
      }

      if (records && Object.keys(records).length > 0) {
        const snapshot: TLStoreSnapshot = {
          store: records as unknown as TLStoreSnapshot['store'],
          schema: editor.store.schema.serialize(),
        };

        loadSnapshot(editor.store, snapshot);
        console.log('[Collab] Successfully loaded snapshot');
      }

      lastSyncedRecordsRef.current = records || {};
      versionRef.current = data.version;
      setVersion(data.version);
      setError(null);

      // Clear offline changes after successful merge
      clearOfflineChanges(roomId);
      setHasPendingChanges(false);

      // Reset syncing flag - receiving full state means we are in sync
      isSyncingRef.current = false;
      setIsSyncing(false);
      if (syncTimeoutRef.current) {
        clearTimeout(syncTimeoutRef.current);
        syncTimeoutRef.current = null;
      }
    } catch (err) {
      console.error('[Collab] Failed to apply store state:', err);
      setError('Failed to sync canvas');
    } finally {
      isApplyingRemoteRef.current = false;
    }
  }, [editor, roomId, getStoreRecords]);

  // Handle store updates from other users with LWW
  const handleStoreUpdated = useCallback((data: WSStoreStateResponse) => {
    if (!editor || data.roomId !== roomId) return;

    // Fix: If this is our own update echoed back, it's a confirmation
    if (data.version === versionRef.current) {
      console.log('[Collab] Received own update confirmation, version:', data.version);
      isSyncingRef.current = false;
      setIsSyncing(false);
      if (syncTimeoutRef.current) {
        clearTimeout(syncTimeoutRef.current);
        syncTimeoutRef.current = null;
      }
      return;
    }

    // Also handle if version skipped past us (e.g. concurrent updates on server)
    if (data.version > versionRef.current) {
      console.log('[Collab] Received remote update, version:', data.version, 'current version:', versionRef.current);
    } else {
      console.log('[Collab] Ignoring stale update, version:', data.version);
      return;
    }

    isApplyingRemoteRef.current = true;
    try {
      let remoteRecords: RecordMap | null = null;

      if (data.store?.records && typeof data.store.records === 'object') {
        remoteRecords = data.store.records as RecordMap;
      } else if (data.store && typeof data.store === 'object' && !data.store.schemaVersion) {
        remoteRecords = data.store as unknown as RecordMap;
      }

      if (!remoteRecords) return;

      // PERFORMANCE: Apply incremental updates instead of full snapshot
      const now = Date.now();
      const remoteTimestamp = now - 10; // Remote is slightly older so local wins ties

      // Only process records that are actually different
      for (const [id, remoteRecord] of Object.entries(remoteRecords)) {
        // Skip if we just sent this record (echo prevention)
        if (recentlySentRecordsRef.current.has(id)) {
          continue;
        }

        const localTimestamp = localTimestampsRef.current[id] || 0;

        // Only apply if remote is newer (LWW)
        if (remoteTimestamp > localTimestamp) {
          // Use tldraw's put API for incremental updates (much faster than loadSnapshot)
          try {
            // Wrap in mergeRemoteChanges to prevent triggering local listener
            editor.store.mergeRemoteChanges(() => {
              editor.store.put([remoteRecord as any]);
            });
            localTimestampsRef.current[id] = remoteTimestamp;
          } catch (err) {
            // Record might be invalid, skip it
            console.warn('[Collab] Failed to apply record:', id, err);
          }
        }
      }

      // Handle deletions - check if any local records are missing from remote
      const localRecords = getStoreRecords();
      for (const id of Object.keys(localRecords)) {
        if (!remoteRecords[id] && localTimestampsRef.current[id] < remoteTimestamp) {
          // Remote deleted this record
          try {
            editor.store.remove([id as any]);
            delete localTimestampsRef.current[id];
          } catch (err) {
            console.warn('[Collab] Failed to remove record:', id, err);
          }
        }
      }

      versionRef.current = data.version;
      setVersion(data.version);

      // Clear sync timeout since we got a version update (acts as confirmation)
      if (syncTimeoutRef.current) {
        clearTimeout(syncTimeoutRef.current);
        syncTimeoutRef.current = null;
      }

      // Also clear syncing flag if this update moved us forward
      if (isSyncingRef.current) {
        isSyncingRef.current = false;
        setIsSyncing(false);
      }
    } catch (err) {
      console.error('[Collab] Failed to apply remote update:', err);
    } finally {
      isApplyingRemoteRef.current = false;
    }
  }, [editor, roomId, getStoreRecords]);

  // Handle presence updates
  const handlePresenceUpdated = useCallback((data: WSPresenceUpdatedResponse) => {
    if (data.roomId !== roomId) return;
    if (data.odId === clientIdRef.current) return; // Skip self

    setRemotePresences((prev) => {
      const next = new Map(prev);
      next.set(data.odId, {
        odId: data.odId,
        name: data.name,
        color: data.color,
        cursor: data.cursor,
        lastUpdated: Date.now(),
      });
      return next;
    });
  }, [roomId]);

  // Handle WebSocket errors
  const handleError = useCallback((err: WSErrorResponse) => {
    console.error('[Collab] WebSocket error:', err);

    if (err.code === 'VERSION_CONFLICT') {
      console.log('[Collab] Version conflict, initiating recovery...');

      // Store current local changes for merge after re-fetch
      pendingLocalChangesRef.current = getStoreRecords();
      isRecoveringFromConflictRef.current = true;

      // Re-fetch latest state
      const socket = socketRef.current;
      if (socket && roomId) {
        socket.getStore(roomId);
      }
    } else if (err.code === 'UNAUTHENTICATED') {
      setError('Authentication failed');
      setIsConnected(false);
    } else {
      setError(err.message);
    }

    // Always reset syncing state on error to avoid hang
    isSyncingRef.current = false;
    setIsSyncing(false);
    if (syncTimeoutRef.current) {
      clearTimeout(syncTimeoutRef.current);
      syncTimeoutRef.current = null;
    }
  }, [roomId, getStoreRecords]);

  // Handle store confirmed (version update confirmation)
  const handleStoreConfirmed = useCallback((data: { roomId: string; version: number }) => {
    if (data.roomId !== roomId) return;
    console.log('[Collab] Received server confirmation for version:', data.version);
    versionRef.current = data.version;
    setVersion(data.version);

    // Clear pending send version
    if (pendingSendVersionRef.current !== null && data.version >= pendingSendVersionRef.current) {
      pendingSendVersionRef.current = null;
    }

    if (syncTimeoutRef.current) {
      clearTimeout(syncTimeoutRef.current);
      syncTimeoutRef.current = null;
    }
  }, [roomId]);

  // Send batched changes
  const sendBatch = useCallback(() => {
    if (!editor || !roomId || !socketRef.current?.isConnected()) return;

    const batch = pendingBatchRef.current;
    if (!hasChanges(batch)) return;

    // Allow sending if not currently syncing, OR if batch is getting large (force send)
    const batchSize = batch.put.length + batch.update.length + batch.remove.length;
    const shouldForceSend = batchSize > 20; // Force send if more than 20 changes queued

    if (isSyncingRef.current && !shouldForceSend) return;

    isSyncingRef.current = true;
    setIsSyncing(true);

    try {
      const changes = {
        put: batch.put as any[],
        update: batch.update as any[],
        remove: batch.remove,
      };

      socketRef.current.patchStore(roomId, versionRef.current, changes);

      // Clear pending version when we get confirmation
      // No timeout needed - conflicts are handled gracefully

      // Update last synced records
      const currentRecords = getStoreRecords();
      lastSyncedRecordsRef.current = currentRecords;

      // Clear batch
      pendingBatchRef.current = { put: [], update: [], remove: [] };
    } catch (err) {
      console.error('[Collab] Failed to send batch:', err);
      pendingSendVersionRef.current = null;
    }
  }, [editor, roomId, getStoreRecords]);

  // Queue a change for batching - THROTTLED approach
  const queueChange = useCallback((event: TLStoreEventInfo) => {
    if (!editor || !roomId) return;

    const now = Date.now();
    const batch = pendingBatchRef.current;

    // Track all changed record IDs to prevent echo
    const changedIds = new Set<string>();

    // Process changes from the event
    for (const [id, change] of Object.entries(event.changes.added)) {
      localTimestampsRef.current[id] = now;
      batch.put.push(change as unknown as Record<string, unknown>);
      changedIds.add(id);
    }

    for (const [id, change] of Object.entries(event.changes.updated)) {
      localTimestampsRef.current[id] = now;
      batch.update.push({ id, after: change[1] as unknown as Record<string, unknown> });
      changedIds.add(id);
    }

    for (const id of Object.keys(event.changes.removed)) {
      delete localTimestampsRef.current[id];
      batch.remove.push({ id });
      changedIds.add(id);
    }

    // Add to recently sent set and clear after 1 second
    changedIds.forEach(id => recentlySentRecordsRef.current.add(id));
    setTimeout(() => {
      changedIds.forEach(id => recentlySentRecordsRef.current.delete(id));
    }, 1000);

    // THROTTLED BATCHING: Send immediately if not throttled, otherwise schedule
    if (!batchThrottleRef.current && socketRef.current?.isConnected()) {
      // Send immediately on first change
      sendBatch();

      // Set throttle - prevent sending for next 30ms
      batchThrottleRef.current = setTimeout(() => {
        batchThrottleRef.current = null;
        // If there are more changes queued, send them
        if (hasChanges(pendingBatchRef.current)) {
          sendBatch();
        }
      }, BATCH_THROTTLE_MS);
    }

    // If not connected, save for offline replay
    if (!socketRef.current?.isConnected()) {
      const storeRecords = getStoreRecords();
      saveOfflineChange({
        tabId,
        roomId,
        timestamp: now,
        snapshot: { schemaVersion: 1, records: storeRecords },
        timestamps: localTimestampsRef.current,
      });
      setHasPendingChanges(true);
    }
  }, [editor, roomId, tabId, getStoreRecords]);

  // Send presence update
  const sendPresence = useCallback((cursor: { x: number; y: number } | null) => {
    if (!roomId || !socketRef.current?.isConnected()) return;

    const now = Date.now();
    if (now - lastPresenceUpdateRef.current < PRESENCE_THROTTLE_MS) return;
    lastPresenceUpdateRef.current = now;

    socketRef.current.updatePresence(
      roomId,
      clientIdRef.current,
      userName,
      userColorRef.current,
      cursor
    );
  }, [roomId, userName]);

  // Connect to collaboration room
  const connect = useCallback(() => {
    if (!roomId || !isOnline) return;

    console.log('[Collab] Connecting to room:', roomId);

    const socket = initCollabSocket({
      onStoreState: handleStoreState,
      onStoreUpdated: handleStoreUpdated,
      onStoreConfirmed: handleStoreConfirmed,
      onPresenceUpdated: handlePresenceUpdated,
      onError: handleError,
      onConnected: () => {
        console.log('[Collab] Connected');
        setIsConnected(true);
        setError(null);
        wasConnectedRef.current = true;
        socket.join(roomId);
        // Request store only if we don't have it yet to avoid redundant loads
        if (editor && !hasRequestedStoreRef.current) {
          hasRequestedStoreRef.current = true;
          socket.getStore(roomId);
        }
      },
      onDisconnected: () => {
        console.log('[Collab] Disconnected');
        setIsConnected(false);
      },
    });

    socketRef.current = socket;
    socket.connect();
  }, [roomId, isOnline, editor, handleStoreState, handleStoreUpdated, handleStoreConfirmed, handlePresenceUpdated, handleError]);

  // Disconnect from collaboration
  const disconnect = useCallback(() => {
    if (batchIntervalRef.current) {
      clearInterval(batchIntervalRef.current);
      batchIntervalRef.current = null;
    }
    if (socketRef.current) {
      socketRef.current.disconnect();
      socketRef.current = null;
    }
    setIsConnected(false);
    setRemotePresences(new Map());
  }, []);

  // Set up store listener when editor is available (NO interval, throttled instead)
  useEffect(() => {
    if (!editor || !roomId) return;

    // Listen for local changes
    const unsubscribe = editor.store.listen(
      (event) => {
        if (isApplyingRemoteRef.current) return;
        if (event.source !== 'user') return;

        queueChange(event);
      },
      { source: 'user', scope: 'document' }
    );

    // Listen for pointer moves for presence
    const handlePointerMove = (e: PointerEvent) => {
      if (!editor) return;
      const point = editor.screenToPage({ x: e.clientX, y: e.clientY });
      sendPresence(point);
    };

    window.addEventListener('pointermove', handlePointerMove);

    return () => {
      unsubscribe();
      window.removeEventListener('pointermove', handlePointerMove);
      if (batchThrottleRef.current) {
        clearTimeout(batchThrottleRef.current);
        batchThrottleRef.current = null;
      }
    };
  }, [editor, roomId, queueChange, sendPresence]);

  // Auto-connect when roomId is set, online, AND editor is available
  useEffect(() => {
    if (roomId && isOnline && !isConnected && editor) {
      connect();
    }

    return () => {
      disconnect();
    };
  }, [roomId, isOnline, editor]);

  // Re-request store if we're connected but just got an editor
  const hasRequestedStoreRef = useRef(false);
  useEffect(() => {
    if (editor && isConnected && roomId && !hasRequestedStoreRef.current) {
      console.log('[Collab] Editor now available, requesting store state...');
      hasRequestedStoreRef.current = true;
      socketRef.current?.getStore(roomId);
    }

    if (!isConnected) {
      hasRequestedStoreRef.current = false;
    }
  }, [editor, isConnected, roomId]);

  // Handle going offline/online
  useEffect(() => {
    if (!isOnline && isConnected) {
      console.log('[Collab] Went offline, disconnecting...');
      setError('You are offline. Changes will be synced when you reconnect.');
      disconnect();
    } else if (isOnline && !isConnected && roomId && wasConnectedRef.current) {
      console.log('[Collab] Back online, reconnecting...');
      setError(null);
      connect();
    }
  }, [isOnline, isConnected, roomId, disconnect, connect]);

  // Cleanup stale remote presences (older than 10 seconds)
  useEffect(() => {
    const cleanupInterval = setInterval(() => {
      const now = Date.now();
      setRemotePresences((prev) => {
        const next = new Map(prev);
        for (const [id, presence] of next) {
          if (now - presence.lastUpdated > 10000) {
            next.delete(id);
          }
        }
        return next;
      });
    }, 5000);

    return () => clearInterval(cleanupInterval);
  }, []);

  return {
    isConnected,
    isSyncing,
    version,
    error,
    hasPendingChanges,
    remotePresences,
    connect,
    disconnect,
  };
}
