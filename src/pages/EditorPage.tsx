import { useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTabs, useActiveTabId, useAppStore } from '../store/useAppStore';
import { useKeyboardShortcuts } from '../hooks/useKeyboardShortcuts';
import { saveDrawing } from '../services/fileService';
import { getTabSnapshot } from '../components/Canvas';
import TabBar from '../components/TabBar';
import Canvas from '../components/Canvas';
import Toolbar from '../components/Toolbar';
import './EditorPage.css';

// Auto-save interval in milliseconds (5 minutes as per SRS RL-002)
const AUTO_SAVE_INTERVAL = 5 * 60 * 1000;

export default function EditorPage() {
  const navigate = useNavigate();
  const tabs = useTabs();
  const activeTabId = useActiveTabId();
  const setTabDirty = useAppStore((state) => state.setTabDirty);
  const lastAutoSaveRef = useRef<number>(Date.now());

  // Register keyboard shortcuts
  useKeyboardShortcuts();

  // Auto-save dirty tabs that have file paths
  const autoSave = useCallback(async () => {
    const dirtyTabs = tabs.filter((tab) => tab.isDirty && tab.filePath);
    
    if (dirtyTabs.length === 0) return;
    
    console.log('[AutoSave] Saving', dirtyTabs.length, 'dirty tab(s)...');
    
    for (const tab of dirtyTabs) {
      try {
        const snapshot = getTabSnapshot(tab.id);
        if (snapshot && tab.filePath) {
          await saveDrawing(tab.filePath, tab.name, snapshot, tab.cloudId);
          setTabDirty(tab.id, false);
          console.log('[AutoSave] Saved:', tab.name);
        }
      } catch (error) {
        console.error('[AutoSave] Failed to save:', tab.name, error);
      }
    }
    
    lastAutoSaveRef.current = Date.now();
  }, [tabs, setTabDirty]);

  // Set up auto-save interval
  useEffect(() => {
    const interval = setInterval(() => {
      autoSave();
    }, AUTO_SAVE_INTERVAL);

    return () => {
      clearInterval(interval);
    };
  }, [autoSave]);

  // Save on beforeunload (browser/app close)
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      const hasUnsaved = tabs.some((tab) => tab.isDirty);
      if (hasUnsaved) {
        e.preventDefault();
        e.returnValue = '';
        // Attempt to auto-save
        autoSave();
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [tabs, autoSave]);

  // Redirect to welcome if no tabs
  useEffect(() => {
    if (tabs.length === 0) {
      navigate('/');
    }
  }, [tabs.length, navigate]);

  if (tabs.length === 0) {
    return null;
  }

  return (
    <div className="editor-page">
      <Toolbar />
      <TabBar />
      <div className="editor-canvas-container">
        {tabs.map((tab) => (
          <div
            key={tab.id}
            className={`canvas-wrapper ${tab.id === activeTabId ? 'active' : ''}`}
          >
            <Canvas tabId={tab.id} />
          </div>
        ))}
      </div>
    </div>
  );
}
