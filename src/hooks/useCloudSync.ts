import { useEffect, useCallback, useRef, useState } from 'react';
import { getCollabSocket, CollabSocket } from '../services/collabSocket';
import * as cloudApi from '../services/cloudApi';
import { useAppStore, useIsOnline } from '../store/useAppStore';
import type { WSStoreStateResponse, CloudDrawing } from '../types';
import type { TLStoreSnapshot } from 'tldraw';

interface UseCloudSyncOptions {
  tabId: string;
  cloudId: string | null;
  enabled?: boolean;
}

interface UseCloudSyncReturn {
  isConnected: boolean;
  isSyncing: boolean;
  lastSyncedAt: number | null;
  syncToCloud: (store: TLStoreSnapshot) => Promise<string | null>;
  loadFromCloud: (cloudId: string) => Promise<TLStoreSnapshot | null>;
  disconnect: () => void;
}

export function useCloudSync({
  tabId,
  cloudId,
  enabled = true,
}: UseCloudSyncOptions): UseCloudSyncReturn {
  const isOnline = useIsOnline();
  const updateTab = useAppStore((state) => state.updateTab);
  
  const [isConnected, setIsConnected] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSyncedAt, setLastSyncedAt] = useState<number | null>(null);
  
  const socketRef = useRef<CollabSocket | null>(null);
  const versionRef = useRef<number>(0);

  // Handle incoming store state from WebSocket
  const handleStoreState = useCallback((data: WSStoreStateResponse) => {
    if (data.roomId === cloudId) {
      versionRef.current = data.version;
      setLastSyncedAt(Date.now());
      // The store update would be handled by the Canvas component
      // through the store's listener system
    }
  }, [cloudId]);

  // Handle store updates from other collaborators
  const handleStoreUpdated = useCallback((data: WSStoreStateResponse) => {
    if (data.roomId === cloudId) {
      versionRef.current = data.version;
      setLastSyncedAt(Date.now());
    }
  }, [cloudId]);

  // Initialize WebSocket connection
  useEffect(() => {
    if (!enabled || !cloudId || !isOnline) {
      return;
    }

    const socket = getCollabSocket();
    socketRef.current = socket;

    socket.setCallbacks({
      onStoreState: handleStoreState,
      onStoreUpdated: handleStoreUpdated,
      onConnected: () => setIsConnected(true),
      onDisconnected: () => setIsConnected(false),
    });

    if (!socket.isConnected()) {
      socket.connect();
    }

    // Join the room for this drawing
    socket.join(cloudId);

    return () => {
      socket.leave();
    };
  }, [enabled, cloudId, isOnline, handleStoreState, handleStoreUpdated]);

  // Sync current store to cloud
  const syncToCloud = useCallback(async (store: TLStoreSnapshot): Promise<string | null> => {
    if (!isOnline) {
      console.log('[CloudSync] Offline - skipping sync');
      return null;
    }

    setIsSyncing(true);

    try {
      // Convert TLDraw snapshot to API format
      const storeData = {
        schemaVersion: 1,
        records: store.store as Record<string, unknown>,
      };

      let drawing: CloudDrawing;

      if (cloudId) {
        // Update existing drawing
        drawing = await cloudApi.updateDrawing(cloudId, { store: storeData });
      } else {
        // Create new drawing
        const tab = useAppStore.getState().tabs.find((t) => t.id === tabId);
        drawing = await cloudApi.createDrawing({
          name: tab?.name ?? 'Untitled',
          store: storeData,
        });

        // Update tab with cloud ID
        updateTab(tabId, { cloudId: drawing.id });
      }

      setLastSyncedAt(Date.now());
      return drawing.id;
    } catch (error) {
      console.error('[CloudSync] Failed to sync:', error);
      return null;
    } finally {
      setIsSyncing(false);
    }
  }, [isOnline, cloudId, tabId, updateTab]);

  // Load drawing from cloud
  const loadFromCloud = useCallback(async (id: string): Promise<TLStoreSnapshot | null> => {
    if (!isOnline) {
      console.log('[CloudSync] Offline - cannot load from cloud');
      return null;
    }

    setIsSyncing(true);

    try {
      const drawing = await cloudApi.getDrawingById(id);
      
      // Convert API format to TLDraw snapshot
      // We use type assertion since the actual schema will be handled by TLDraw
      const snapshot = {
        store: drawing.store.records,
        schema: {
          schemaVersion: 1 as const,
          storeVersion: 4,
          recordVersions: {},
        },
      } as TLStoreSnapshot;

      setLastSyncedAt(Date.now());
      return snapshot;
    } catch (error) {
      console.error('[CloudSync] Failed to load:', error);
      return null;
    } finally {
      setIsSyncing(false);
    }
  }, [isOnline]);

  // Disconnect from cloud
  const disconnect = useCallback(() => {
    if (socketRef.current) {
      socketRef.current.leave();
    }
    setIsConnected(false);
  }, []);

  return {
    isConnected,
    isSyncing,
    lastSyncedAt,
    syncToCloud,
    loadFromCloud,
    disconnect,
  };
}

