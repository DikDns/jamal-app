import { useEffect, useCallback, useRef, useMemo, useState } from 'react';
import {
  Tldraw,
  createTLStore,
  defaultShapeUtils,
  loadSnapshot,
  getSnapshot,
  Editor,
  TLStore,
  TLComponents,
} from 'tldraw';
import 'tldraw/tldraw.css';
import '../assets/tldraw-custom.css';
import { useAppStore } from '../store/useAppStore';
import { useCollaboration } from '../hooks/useCollaboration';
import { saveDrawing } from '../services/fileService';
import './Canvas.css';
import TextFloatingMenu from './TextFloatingMenu';

interface CanvasProps {
  tabId: string;
}

export default function Canvas({ tabId }: CanvasProps) {
  const tabs = useAppStore((state) => state.tabs);
  const setTabDirty = useAppStore((state) => state.setTabDirty);
  const updateTabStore = useAppStore((state) => state.updateTabStore);

  const tab = tabs.find((t) => t.id === tabId);
  const editorRef = useRef<Editor | null>(null);
  const [editor, setEditor] = useState<Editor | null>(null);

  // Create a fresh store for this tab, keyed by tabId
  const store = useMemo(() => {
    const newStore = createTLStore({
      shapeUtils: defaultShapeUtils,
    });

    // Load existing snapshot if available
    if (tab?.store) {
      try {
        loadSnapshot(newStore, tab.store);
      } catch (error) {
        console.error('Failed to load snapshot:', error);
      }
    }

    return newStore;
    // Only create new store when tabId changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tabId]);

  // Collaboration hook - only active when cloudId is set
  const { isConnected, isSyncing, error: collabError, hasPendingChanges } = useCollaboration({
    tabId,
    roomId: tab?.cloudId ?? null,
    editor,
  });

  // Custom components including the floating menu
  // Hide default StylePanel to avoid duplicate menus
  const components = useMemo<TLComponents>(() => ({
    InFrontOfTheCanvas: TextFloatingMenu,
    StylePanel: null,
  }), []);

  // Save snapshot when unmounting (switching tabs)
  useEffect(() => {
    return () => {
      if (editorRef.current) {
        try {
          const snapshot = getSnapshot(editorRef.current.store);
          updateTabStore(tabId, snapshot);
        } catch (error) {
          console.error('Failed to save snapshot:', error);
        }
      }
    };
  }, [tabId, updateTabStore]);

  // Handle editor mount
  const handleMount = useCallback((mountedEditor: Editor) => {
    editorRef.current = mountedEditor;
    setEditor(mountedEditor);

    // Enable grid background
    mountedEditor.updateInstanceState({ isGridMode: true });

    // Listen for store changes to track dirty state
    const unsubscribe = mountedEditor.store.listen(
      () => {
        setTabDirty(tabId, true);
      },
      { source: 'user', scope: 'document' }
    );

    return () => {
      unsubscribe();
    };
  }, [tabId, setTabDirty]);

  // Update read-only mode based on: published + offline = read-only
  // Published + online = editable, Not published = editable
  useEffect(() => {
    if (!editorRef.current) return;
    
    const isPublished = !!tab?.cloudId;
    const shouldBeReadonly = isPublished && !isConnected;
    
    editorRef.current.updateInstanceState({ isReadonly: shouldBeReadonly });
  }, [tab?.cloudId, isConnected]);

  // Autosave for published canvases - only save when dirty (has changes)
  // Using a longer interval (5 seconds) to reduce I/O overhead
  const COLLAB_AUTOSAVE_INTERVAL_MS = 5000;
  useEffect(() => {
    if (!tab?.cloudId || !isConnected || !tab?.filePath) return;
    
    const interval = setInterval(async () => {
      // Only save if there are actual changes (isDirty)
      if (!editorRef.current || !tab?.filePath || !tab?.isDirty) return;
      
      try {
        const snapshot = getSnapshot(editorRef.current.store);
        await saveDrawing(tab.filePath, tab.name, snapshot, tab.cloudId);
        setTabDirty(tabId, false);
        console.log('[Collab Autosave] Saved:', tab.name);
      } catch (error) {
        console.error('[Autosave] Failed:', error);
      }
    }, COLLAB_AUTOSAVE_INTERVAL_MS);

    return () => clearInterval(interval);
  }, [tab?.cloudId, tab?.filePath, tab?.name, tab?.isDirty, isConnected, tabId, setTabDirty]);

  // Function to get current snapshot (exposed for saving)
  const getEditorSnapshot = useCallback(() => {
    if (editorRef.current) {
      return getSnapshot(editorRef.current.store);
    }
    return null;
  }, []);

  // Expose getSnapshot and editor methods via window for file operations
  useEffect(() => {
    const snapshotKey = `getSnapshot_${tabId}`;
    const editorKey = `getEditor_${tabId}`;
    
    (window as any)[snapshotKey] = getEditorSnapshot;
    (window as any)[editorKey] = () => editorRef.current;
    
    return () => {
      delete (window as any)[snapshotKey];
      delete (window as any)[editorKey];
    };
  }, [tabId, getEditorSnapshot]);

  return (
    <div className="canvas-container">
      {/* Offline read-only banner - only show when published AND offline */}
      {tab?.cloudId && !isConnected && (
        <div className="readonly-banner">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
            <path d="M7 11V7a5 5 0 0 1 10 0v4" />
          </svg>
          <span>Offline — View Only</span>
        </div>
      )}
      
      {/* Collaboration status indicator */}
      {tab?.cloudId && (
        <div className={`collab-status ${isConnected ? 'connected' : 'disconnected'} ${hasPendingChanges ? 'has-pending' : ''}`}>
          {isSyncing && <span className="sync-indicator">Syncing...</span>}
          {!isSyncing && hasPendingChanges && !isConnected && (
            <span className="pending-indicator">Offline changes pending</span>
          )}
          {collabError && !hasPendingChanges && <span className="error-indicator">{collabError}</span>}
        </div>
      )}
      
      <Tldraw
        store={store as TLStore}
        onMount={handleMount}
        components={components}
        autoFocus
      />
    </div>
  );
}

// Helper function to get snapshot from a tab
export function getTabSnapshot(tabId: string) {
  const key = `getSnapshot_${tabId}`;
  const fn = (window as any)[key];
  if (fn) {
    return fn();
  }
  return null;
}

// Helper function to get editor instance from a tab
export function getEditorInstance(tabId: string): Editor | null {
  const key = `getEditor_${tabId}`;
  const fn = (window as any)[key];
  if (fn) {
    return fn();
  }
  return null;
}
