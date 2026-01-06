import { useEffect, useCallback, useRef, useState } from 'react';
import { Editor, loadSnapshot, getSnapshot, TLStoreEventInfo, TLStoreSnapshot } from 'tldraw';
import { initCollabSocket, CollabSocket } from '../services/collabSocket';
import { useIsOnline } from '../store/useAppStore';
import { mergeWithLWW, hasChanges, createTimestamp, compareTimestamps, type RecordMap, type TimestampMap, type LogicalTimestamp } from '../utils/lwwMerge';
import type { WSStoreStateResponse, WSErrorResponse, WSPresenceUpdatedResponse, PresenceData } from '../types';

// Constants for batching - debounced approach for smooth dragging
const BATCH_DEBOUNCE_MS = 30; // Send after 30ms of no changes (end of drag)
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
  isResolvingConflict: boolean; // New: indicates conflict resolution in progress
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

  // Track if we are currently sending a batch (Outbox Pattern)
  const isSendingRef = useRef(false);

  // Track the batch currently in flight (to restore if send fails)
  const inflightBatchRef = useRef<{
    put: Record<string, unknown>[];
    update: Array<{ id: string; after: Record<string, unknown> }>;
    remove: Array<{ id: string }>;
  } | null>(null);

  // Presence state
  const clientIdRef = useRef(generateClientId());
  const userColorRef = useRef(userColor || generateUserColor());
  const lastPresenceUpdateRef = useRef(0);

  // Sync safety: timeout for the syncing flag
  const syncTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Track recently sent record IDs to prevent echo updates
  const recentlySentRecordsRef = useRef<Set<string>>(new Set());

  // Update ID tracking for reliable echo prevention (like Figma)
  const currentUpdateIdRef = useRef<string | null>(null);
  const pendingUpdateIdsRef = useRef<Set<string>>(new Set());

  // Conflict recovery state
  const isRecoveringFromConflictRef = useRef(false);
  const [isResolvingConflict, setIsResolvingConflict] = useState(false);
  const pendingLocalChangesRef = useRef<RecordMap | null>(null);

  // Exponential backoff for conflict retries
  const conflictRetryCountRef = useRef(0);

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
        setIsResolvingConflict(true);
        const serverTimestamps: TimestampMap = {};
        // Server records get current time as timestamp (they're authoritative)
        for (const id of Object.keys(records || {})) {
          serverTimestamps[id] = createTimestamp('server');
        }

        const { records: mergedRecords, timestamps: mergedTimestamps } = mergeWithLWW(
          pendingLocalChangesRef.current,
          localTimestampsRef.current,
          records || {},
          serverTimestamps,
          clientIdRef.current
        );

        records = mergedRecords;
        localTimestampsRef.current = mergedTimestamps;
        pendingLocalChangesRef.current = null;
        isRecoveringFromConflictRef.current = false;
        setIsResolvingConflict(false);
        conflictRetryCountRef.current = 0; // Reset retry count on success
      } else if (offlineChange) {
        // Merge offline changes
        console.log('[Collab] Merging offline changes with server state');
        const offlineRecords = (offlineChange.snapshot as any)?.records || {};
        const offlineTimestamps = offlineChange.timestamps || {};

        const serverTimestamps: TimestampMap = {};
        for (const id of Object.keys(records || {})) {
          serverTimestamps[id] = createTimestamp('server');
        }

        const { records: mergedRecords, timestamps: mergedTimestamps } = mergeWithLWW(
          offlineRecords,
          offlineTimestamps as TimestampMap,
          records || {},
          serverTimestamps,
          clientIdRef.current
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

    // IMPROVED: Check updateId for definitive echo prevention (like Figma)
    // If this update has our updateId, it's definitely our own echoed back
    if (data.updateId && pendingUpdateIdsRef.current.has(data.updateId)) {
      console.log('[Collab] Received own update echo, updateId:', data.updateId);
      pendingUpdateIdsRef.current.delete(data.updateId);
      isSyncingRef.current = false;
      setIsSyncing(false);
      // Reset conflict resolution state on successful echo
      setIsResolvingConflict(false);
      conflictRetryCountRef.current = 0;
      if (syncTimeoutRef.current) {
        clearTimeout(syncTimeoutRef.current);
        syncTimeoutRef.current = null;
      }
      return;
    }

    // Fallback: If this is our own update echoed back (by version), it's a confirmation
    if (data.version === versionRef.current) {
      console.log('[Collab] Received own update confirmation, version:', data.version);
      isSyncingRef.current = false;
      setIsSyncing(false);
      // Reset conflict resolution state on successful confirmation
      setIsResolvingConflict(false);
      conflictRetryCountRef.current = 0;
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
      const remoteTs = createTimestamp('remote');

      // Only process records that are actually different
      // Skip user-specific records (camera, instance, pointer)
      const shouldApply = (id: string) => {
        if (id.startsWith('camera:')) return false;
        if (id.startsWith('instance:')) return false;
        if (id.startsWith('pointer:')) return false;
        if (id.startsWith('instance_page_state:')) return false;
        return true;
      };

      for (const [id, remoteRecord] of Object.entries(remoteRecords)) {
        // Skip user-specific records
        if (!shouldApply(id)) continue;

        // Skip if we just sent this record (echo prevention)
        if (recentlySentRecordsRef.current.has(id)) {
          continue;
        }

        const localTs = localTimestampsRef.current[id];
        const defaultLocalTs: LogicalTimestamp = { time: 0, clientId: clientIdRef.current };

        // Only apply if remote is newer (LWW) - compare using logical timestamps
        if (compareTimestamps(remoteTs, localTs || defaultLocalTs) > 0) {
          // Use tldraw's put API for incremental updates (much faster than loadSnapshot)
          try {
            // Wrap in mergeRemoteChanges to prevent triggering local listener
            editor.store.mergeRemoteChanges(() => {
              editor.store.put([remoteRecord as any]);
            });
            localTimestampsRef.current[id] = remoteTs;
          } catch (err) {
            // Record might be invalid, skip it
            console.warn('[Collab] Failed to apply record:', id, err);
          }
        }
      }

      // Handle deletions - check if any local records are missing from remote
      const localRecords = getStoreRecords();
      for (const id of Object.keys(localRecords)) {
        // Skip user-specific records
        if (!shouldApply(id)) continue;

        const localTs = localTimestampsRef.current[id];
        if (!remoteRecords[id] && localTs && compareTimestamps(remoteTs, localTs) > 0) {
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
      console.warn('[Collab] Version conflict - will retry with exponential backoff');

      // Show conflict resolution status in UI
      setIsResolvingConflict(true);

      // 1. Restore inflight batch to pending
      const inflight = inflightBatchRef.current;
      if (inflight) {
        pendingBatchRef.current = {
          put: [...inflight.put, ...pendingBatchRef.current.put],
          update: [...inflight.update, ...pendingBatchRef.current.update],
          remove: [...inflight.remove, ...pendingBatchRef.current.remove],
        };
        inflightBatchRef.current = null;
      }

      // 2. Unlock sender so we can try again
      isSendingRef.current = false;

      // 3. Apply exponential backoff for retries (50ms, 100ms, 200ms, 400ms, 800ms, 1600ms, max 2000ms)
      const backoffMs = Math.min(50 * Math.pow(2, conflictRetryCountRef.current), 2000);
      conflictRetryCountRef.current++;

      console.log(`[Collab] Retrying in ${backoffMs}ms (attempt ${conflictRetryCountRef.current})`);

      // 4. Trigger retry after backoff delay
      setTimeout(() => {
        sendBatch();
      }, backoffMs);

      return;
    } else if (err.code === 'UNAUTHENTICATED') {
      setError('Authentication failed');
      setIsConnected(false);
    } else {
      setError(err.message);
    }

    // Always reset syncing state on error to avoid hang
    isSyncingRef.current = false;
    isSendingRef.current = false; // Safety unlock
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

    // Success! Clear inflight batch
    inflightBatchRef.current = null;

    // Unlock sender
    isSendingRef.current = false;

    // Reset conflict resolution state on success
    setIsResolvingConflict(false);
    conflictRetryCountRef.current = 0;

    // If pending changes accumulated while inflight, send them now
    if (hasChanges(pendingBatchRef.current)) {
      sendBatch();
    }

    if (syncTimeoutRef.current) {
      clearTimeout(syncTimeoutRef.current);
      syncTimeoutRef.current = null;
    }
  }, [roomId]);

  // Send batched changes - non-blocking for smooth performance
  const sendBatch = useCallback(() => {
    if (!editor || !roomId || !socketRef.current?.isConnected()) return;

    const batch = pendingBatchRef.current;
    if (!hasChanges(batch)) return;

    // Outbox Pattern: Enforce sequential sending
    // If we're already sending, wait. The confirmation or error will trigger next send.
    if (isSendingRef.current) return;

    // Lock the sender
    isSendingRef.current = true;

    // Move pending to inflight
    inflightBatchRef.current = batch;
    pendingBatchRef.current = { put: [], update: [], remove: [] };

    // Generate unique update ID for echo prevention (like Figma)
    const updateId = `${clientIdRef.current}-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;
    currentUpdateIdRef.current = updateId;
    pendingUpdateIdsRef.current.add(updateId);

    try {
      const changes = {
        put: batch.put as any[],
        update: batch.update as any[],
        remove: batch.remove,
      };

      socketRef.current.patchStore(roomId, versionRef.current, changes, updateId);

      // Set safety timeout - if no confirmation/error in 5s, reset lock and retry
      if (syncTimeoutRef.current) clearTimeout(syncTimeoutRef.current);

      syncTimeoutRef.current = setTimeout(() => {
        console.warn('[Collab] Sync timeout - resetting send lock');

        // Restore inflight batch for retry
        const inflight = inflightBatchRef.current;
        if (inflight) {
          pendingBatchRef.current = {
            put: [...inflight.put, ...pendingBatchRef.current.put],
            update: [...inflight.update, ...pendingBatchRef.current.update],
            remove: [...inflight.remove, ...pendingBatchRef.current.remove],
          };
          inflightBatchRef.current = null;
        }

        console.log('[Collab] UNLOCK: Sync timeout - releasing sender lock');
        isSendingRef.current = false;
        isSyncingRef.current = false;
        setIsSyncing(false);

        // Schedule retry
        setTimeout(() => sendBatch(), 100);
      }, 5000);

      // DO NOT increment version optimistically.
      // Wait for server confirmation or updated event.

      // Update last synced records for echo prevention
      const currentRecords = getStoreRecords();
      lastSyncedRecordsRef.current = currentRecords;

    } catch (err) {
      console.error('[Collab] Failed to send batch:', err);
      // Restore on synchronous error
      const inflight = inflightBatchRef.current;
      if (inflight) {
        pendingBatchRef.current = {
          put: [...inflight.put, ...pendingBatchRef.current.put],
          update: [...inflight.update, ...pendingBatchRef.current.update],
          remove: [...inflight.remove, ...pendingBatchRef.current.remove],
        };
        inflightBatchRef.current = null;
      }
      isSendingRef.current = false;
    }
  }, [editor, roomId, getStoreRecords]);

  // Queue a change for batching - THROTTLED approach
  const queueChange = useCallback((event: TLStoreEventInfo) => {
    if (!editor || !roomId) return;

    const localTs = createTimestamp(clientIdRef.current);
    const batch = pendingBatchRef.current;

    // Track all changed record IDs to prevent echo
    const changedIds = new Set<string>();

    // Process changes from the event
    // Filter out user-specific records that shouldn't sync (camera, instance, pointer)
    const shouldSync = (id: string) => {
      // Camera records control viewport - each user has their own view
      if (id.startsWith('camera:')) return false;
      // Instance records are user-specific state
      if (id.startsWith('instance:')) return false;
      // Pointer records are ephemeral cursor positions (handled by presence)
      if (id.startsWith('pointer:')) return false;
      // Instance page state is user-specific
      if (id.startsWith('instance_page_state:')) return false;
      return true;
    };

    let addedCount = 0, updatedCount = 0, removedCount = 0;
    for (const [id, change] of Object.entries(event.changes.added)) {
      if (!shouldSync(id)) continue;
      localTimestampsRef.current[id] = localTs;
      batch.put.push(change as unknown as Record<string, unknown>);
      changedIds.add(id);
      addedCount++;
    }

    for (const [id, change] of Object.entries(event.changes.updated)) {
      if (!shouldSync(id)) continue;
      localTimestampsRef.current[id] = localTs;
      batch.update.push({ id, after: change[1] as unknown as Record<string, unknown> });
      changedIds.add(id);
      updatedCount++;
    }

    for (const id of Object.keys(event.changes.removed)) {
      if (!shouldSync(id)) continue;
      delete localTimestampsRef.current[id];
      batch.remove.push({ id });
      changedIds.add(id);
      removedCount++;
    }

    // Add to recently sent set and clear after 1 second
    changedIds.forEach(id => recentlySentRecordsRef.current.add(id));
    setTimeout(() => {
      changedIds.forEach(id => recentlySentRecordsRef.current.delete(id));
    }, 1000);

    // DEBOUNCED BATCHING: Send after 30ms of no changes (end of drag)
    // This eliminates mid-drag blocking - changes accumulate locally
    // and only sync once the user pauses/stops
    if (socketRef.current?.isConnected()) {
      // Clear existing debounce timer
      if (batchThrottleRef.current) {
        clearTimeout(batchThrottleRef.current);
      }

      // Schedule send after debounce period
      batchThrottleRef.current = setTimeout(() => {
        batchThrottleRef.current = null;
        sendBatch();
      }, BATCH_DEBOUNCE_MS);
    }

    // If not connected, save for offline replay
    if (!socketRef.current?.isConnected()) {
      const storeRecords = getStoreRecords();
      saveOfflineChange({
        tabId,
        roomId,
        timestamp: Date.now(),
        snapshot: { schemaVersion: 1, records: storeRecords },
        timestamps: localTimestampsRef.current as any, // Offline saves use serialized format
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

        // RESET SYNC STATE on connection/reconnection
        // This prevents "stuck locks" if the previous connection died while sending
        isSendingRef.current = false;
        inflightBatchRef.current = null;
        if (syncTimeoutRef.current) {
          clearTimeout(syncTimeoutRef.current);
          syncTimeoutRef.current = null;
        }

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
    isResolvingConflict,
    version,
    error,
    hasPendingChanges,
    remotePresences,
    connect,
    disconnect,
  };
}
