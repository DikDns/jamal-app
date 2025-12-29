import { useEffect, useCallback, useRef, useState } from 'react';
import { Editor, loadSnapshot, getSnapshot, TLStoreEventInfo } from 'tldraw';
import { getCollabSocket, initCollabSocket, CollabSocket } from '../services/collabSocket';
import { useIsOnline } from '../store/useAppStore';
import type { WSStoreStateResponse, WSErrorResponse } from '../types';

interface UseCollaborationOptions {
  tabId: string;
  roomId: string | null;
  editor: Editor | null;
}

interface UseCollaborationReturn {
  isConnected: boolean;
  isSyncing: boolean;
  version: number;
  error: string | null;
  hasPendingChanges: boolean;
  connect: () => void;
  disconnect: () => void;
}

// Debounce helper
function debounce<T extends (...args: unknown[]) => void>(fn: T, delay: number): T {
  let timeoutId: ReturnType<typeof setTimeout>;
  return ((...args: unknown[]) => {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => fn(...args), delay);
  }) as T;
}

// Storage key for offline changes
const OFFLINE_CHANGES_KEY = 'jamal_offline_changes';

interface OfflineChange {
  tabId: string;
  roomId: string;
  timestamp: number;
  snapshot: unknown;
}

// Persist offline changes to localStorage
function saveOfflineChange(change: OfflineChange) {
  try {
    const existing = localStorage.getItem(OFFLINE_CHANGES_KEY);
    const changes: OfflineChange[] = existing ? JSON.parse(existing) : [];
    
    // Replace existing change for same tab/room or add new
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

export function useCollaboration({
  tabId,
  roomId,
  editor,
}: UseCollaborationOptions): UseCollaborationReturn {
  const isOnline = useIsOnline();
  
  const [isConnected, setIsConnected] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [version, setVersion] = useState(0);
  const [hasPendingChanges, setHasPendingChanges] = useState(false);
  
  const socketRef = useRef<CollabSocket | null>(null);
  const versionRef = useRef(0);
  const isApplyingRemoteRef = useRef(false);
  const pendingChangesRef = useRef<TLStoreEventInfo[]>([]);
  const hasLocalChangesRef = useRef(false);
  const wasConnectedRef = useRef(false);

  // Check for offline changes on mount
  useEffect(() => {
    if (roomId) {
      const offlineChange = getOfflineChanges(roomId);
      setHasPendingChanges(!!offlineChange);
    }
  }, [roomId]);

  // Handle incoming store state (initial sync after join)
  const handleStoreState = useCallback((data: WSStoreStateResponse) => {
    if (!editor || data.roomId !== roomId) return;
    
    console.log('[Collab] Received initial store state, version:', data.version);
    
    // Check for offline changes that need to be merged
    const offlineChange = getOfflineChanges(roomId);
    
    isApplyingRemoteRef.current = true;
    try {
      if (offlineChange && hasLocalChangesRef.current) {
        // We have offline changes - user needs to decide
        console.log('[Collab] Found offline changes, will sync after applying server state');
        // For now, apply server state first, then send our changes
        // A more sophisticated merge could be implemented here
      }
      
      // Convert server format to TLDraw snapshot format
      const snapshot = {
        store: data.store.records,
        schema: editor.store.schema.serialize(),
      };
      
      loadSnapshot(editor.store, snapshot);
      versionRef.current = data.version;
      setVersion(data.version);
      setError(null);
      
      // If we had offline changes, send them now
      if (offlineChange && hasLocalChangesRef.current) {
        console.log('[Collab] Replaying offline changes...');
        // Queue a sync after applying remote state
        setTimeout(() => {
          hasLocalChangesRef.current = true;
          pendingChangesRef.current.push({} as TLStoreEventInfo); // Trigger sync
          sendChanges();
          clearOfflineChanges(roomId);
          setHasPendingChanges(false);
        }, 100);
      } else {
        clearOfflineChanges(roomId);
        setHasPendingChanges(false);
      }
    } catch (err) {
      console.error('[Collab] Failed to apply store state:', err);
      setError('Failed to sync canvas');
    } finally {
      isApplyingRemoteRef.current = false;
    }
  }, [editor, roomId]);

  // Handle store updates from other users
  const handleStoreUpdated = useCallback((data: WSStoreStateResponse) => {
    if (!editor || data.roomId !== roomId) return;
    
    // Skip if this is our own update echoed back
    if (data.version === versionRef.current) return;
    
    console.log('[Collab] Received remote update, version:', data.version);
    
    isApplyingRemoteRef.current = true;
    try {
      // Convert server format to TLDraw snapshot format
      const snapshot = {
        store: data.store.records,
        schema: editor.store.schema.serialize(),
      };
      
      loadSnapshot(editor.store, snapshot);
      versionRef.current = data.version;
      setVersion(data.version);
    } catch (err) {
      console.error('[Collab] Failed to apply remote update:', err);
    } finally {
      isApplyingRemoteRef.current = false;
    }
  }, [editor, roomId]);

  // Handle WebSocket errors
  const handleError = useCallback((err: WSErrorResponse) => {
    console.error('[Collab] WebSocket error:', err);
    
    if (err.code === 'VERSION_CONFLICT') {
      // Re-sync on version conflict
      console.log('[Collab] Version conflict, re-syncing...');
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
  }, [roomId]);

  // Send local changes to server
  const sendChanges = useCallback(() => {
    if (!editor || !roomId) return;
    
    // If not connected, save for offline replay
    if (!socketRef.current?.isConnected()) {
      console.log('[Collab] Offline - saving changes for later sync');
      const snapshot = getSnapshot(editor.store);
      saveOfflineChange({
        tabId,
        roomId,
        timestamp: Date.now(),
        snapshot: {
          schemaVersion: 1,
          records: snapshot.store,
        },
      });
      setHasPendingChanges(true);
      hasLocalChangesRef.current = true;
      return;
    }
    
    if (pendingChangesRef.current.length === 0 && !hasLocalChangesRef.current) return;
    
    setIsSyncing(true);
    
    try {
      // Get current snapshot
      const snapshot = getSnapshot(editor.store);
      const storeData = {
        schemaVersion: 1,
        records: snapshot.store as Record<string, unknown>,
      };
      
      // Send full store update
      const newVersion = versionRef.current + 1;
      socketRef.current!.setStore(roomId, newVersion, storeData);
      versionRef.current = newVersion;
      setVersion(newVersion);
      
      // Clear pending changes
      pendingChangesRef.current = [];
      hasLocalChangesRef.current = false;
    } catch (err) {
      console.error('[Collab] Failed to send changes:', err);
    } finally {
      setIsSyncing(false);
    }
  }, [editor, roomId, tabId]);

  // Debounced send to avoid flooding the server
  const debouncedSend = useCallback(
    debounce(() => sendChanges(), 300),
    [sendChanges]
  );

  // Connect to collaboration room
  const connect = useCallback(() => {
    if (!roomId || !isOnline) return;
    
    console.log('[Collab] Connecting to room:', roomId);
    
    const socket = initCollabSocket({
      onStoreState: handleStoreState,
      onStoreUpdated: handleStoreUpdated,
      onError: handleError,
      onConnected: () => {
        console.log('[Collab] Connected');
        setIsConnected(true);
        setError(null);
        wasConnectedRef.current = true;
        // Join the room
        socket.join(roomId);
      },
      onDisconnected: () => {
        console.log('[Collab] Disconnected');
        setIsConnected(false);
      },
    });
    
    socketRef.current = socket;
    socket.connect();
  }, [roomId, isOnline, handleStoreState, handleStoreUpdated, handleError]);

  // Disconnect from collaboration
  const disconnect = useCallback(() => {
    if (socketRef.current) {
      socketRef.current.disconnect();
      socketRef.current = null;
    }
    setIsConnected(false);
  }, []);

  // Set up store listener when editor is available
  useEffect(() => {
    if (!editor || !roomId) return;
    
    // Listen for local changes
    const unsubscribe = editor.store.listen(
      (event) => {
        // Skip changes from remote sync
        if (isApplyingRemoteRef.current) return;
        
        // Skip presence/session changes
        if (event.source !== 'user') return;
        
        // Queue the change
        pendingChangesRef.current.push(event);
        hasLocalChangesRef.current = true;
        
        // If connected, debounced send. If offline, save immediately
        if (isConnected) {
          debouncedSend();
        } else {
          sendChanges(); // This will save to localStorage
        }
      },
      { source: 'user', scope: 'document' }
    );
    
    return () => {
      unsubscribe();
    };
  }, [editor, roomId, isConnected, debouncedSend, sendChanges]);

  // Auto-connect when roomId is set and online
  useEffect(() => {
    if (roomId && isOnline && !isConnected) {
      connect();
    }
    
    return () => {
      disconnect();
    };
  }, [roomId, isOnline]);

  // Handle going offline/online
  useEffect(() => {
    if (!isOnline && isConnected) {
      console.log('[Collab] Went offline, disconnecting...');
      setError('You are offline. Changes will be synced when you reconnect.');
      disconnect();
    } else if (isOnline && !isConnected && roomId && wasConnectedRef.current) {
      // Reconnect when coming back online
      console.log('[Collab] Back online, reconnecting...');
      setError(null);
      connect();
    }
  }, [isOnline, isConnected, roomId, disconnect, connect]);

  return {
    isConnected,
    isSyncing,
    version,
    error,
    hasPendingChanges,
    connect,
    disconnect,
  };
}
