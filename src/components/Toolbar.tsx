import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppStore, useActiveTab, useIsOnline } from '../store/useAppStore';
import {
  saveDrawing,
  saveFileDialog,
  exportDialog,
  savePng,
  saveSvg,
} from '../services/fileService';
import { getTabSnapshot, getEditorInstance } from './Canvas';
import { getCollabSocket } from '../services/collabSocket';
import PublishModal from './PublishModal';
import CollaboratorAvatars from './CollaboratorAvatars';
import './Toolbar.css';

export default function Toolbar() {
  const navigate = useNavigate();
  const activeTab = useActiveTab();
  const isOnline = useIsOnline();
  const { updateTab, setTabDirty } = useAppStore();
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [showPublishModal, setShowPublishModal] = useState(false);
  const [isCollabConnected, setIsCollabConnected] = useState(false);
  const exportMenuRef = useRef<HTMLDivElement>(null);

  // Track collab connection status
  useEffect(() => {
    if (!activeTab?.cloudId) {
      setIsCollabConnected(false);
      return;
    }

    const socket = getCollabSocket();
    
    const checkConnection = () => {
      setIsCollabConnected(socket.isConnected());
    };

    // Check immediately
    checkConnection();

    // Set up listeners
    socket.setCallbacks({
      onConnected: () => setIsCollabConnected(true),
      onDisconnected: () => setIsCollabConnected(false),
    });

    // Poll connection status
    const interval = setInterval(checkConnection, 2000);

    return () => {
      clearInterval(interval);
    };
  }, [activeTab?.cloudId]);

  const handleHome = () => {
    navigate('/');
  };

  const handleSave = async () => {
    if (!activeTab) return;

    const snapshot = getTabSnapshot(activeTab.id);
    if (!snapshot) return;

    let path = activeTab.filePath;
    if (!path) {
      path = await saveFileDialog(activeTab.name);
      if (!path) return;
    }

    try {
      await saveDrawing(path, activeTab.name, snapshot, activeTab.cloudId);
      updateTab(activeTab.id, { filePath: path });
      setTabDirty(activeTab.id, false);
    } catch (error) {
      console.error('Failed to save:', error);
    }
  };

  const handleSaveAs = async () => {
    if (!activeTab) return;

    const snapshot = getTabSnapshot(activeTab.id);
    if (!snapshot) return;

    const path = await saveFileDialog(activeTab.name);
    if (!path) return;

    try {
      await saveDrawing(path, activeTab.name, snapshot, activeTab.cloudId);
      updateTab(activeTab.id, { filePath: path });
      setTabDirty(activeTab.id, false);
    } catch (error) {
      console.error('Failed to save:', error);
    }
  };

  const handleExport = useCallback(async (type: 'png' | 'svg') => {
    setShowExportMenu(false);
    if (!activeTab) return;

    const path = await exportDialog(type);
    if (!path) return;

    try {
      // Get the editor instance for this tab
      const editor = getEditorInstance(activeTab.id);
      
      let svgData: string;
      let width = 800;
      let height = 600;

      if (editor) {
        // Get all shape IDs on the current page
        const shapeIds = editor.getCurrentPageShapeIds();
        
        if (shapeIds.size > 0) {
          // Export shapes to SVG
          const result = await editor.getSvgString([...shapeIds]);
          if (result) {
            svgData = result.svg;
            width = Math.ceil(result.width) || 800;
            height = Math.ceil(result.height) || 600;
          } else {
            throw new Error('Failed to generate SVG from canvas');
          }
        } else {
          // Empty canvas - create a placeholder
          svgData = `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600">
            <rect width="100%" height="100%" fill="#1e1e2e"/>
            <text x="400" y="300" text-anchor="middle" fill="#6c7086" font-family="sans-serif">Empty Canvas</text>
          </svg>`;
        }
      } else {
        // Fallback if no editor
        svgData = `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600">
          <rect width="100%" height="100%" fill="#1e1e2e"/>
          <text x="400" y="300" text-anchor="middle" fill="#6c7086" font-family="sans-serif">Canvas Export</text>
        </svg>`;
      }

      if (type === 'png') {
        await savePng(path, svgData, width, height);
      } else {
        await saveSvg(path, svgData);
      }
    } catch (error) {
      console.error('Failed to export:', error);
    }
  }, [activeTab]);

  const handlePublish = () => {
    setShowPublishModal(true);
  };

  const handlePublished = useCallback((roomId: string) => {
    // Socket connection is handled in the modal
    console.log('Published to room:', roomId);
  }, []);

  // Close export menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (exportMenuRef.current && !exportMenuRef.current.contains(e.target as Node)) {
        setShowExportMenu(false);
      }
    };

    if (showExportMenu) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showExportMenu]);

  return (
    <>
      <header className="toolbar">
        {/* Left Section */}
        <div className="toolbar-left">
          <button className="toolbar-btn logo-btn" onClick={handleHome} title="Home">
            <img src="/logo.svg" alt="Jamal" width="22" height="22" />
          </button>

          <div className="toolbar-divider" />

          <button className="toolbar-btn" onClick={handleSave} title="Save (Ctrl+S)">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
              <polyline points="17 21 17 13 7 13 7 21" />
              <polyline points="7 3 7 8 15 8" />
            </svg>
            <span>Save</span>
          </button>

          <button className="toolbar-btn" onClick={handleSaveAs} title="Save As (Ctrl+Shift+S)">
            <span>Save As</span>
          </button>

          {/* Export Menu */}
          <div className="export-menu-container" ref={exportMenuRef}>
            <button
              className="toolbar-btn"
              onClick={() => setShowExportMenu(!showExportMenu)}
              title="Export"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="17 8 12 3 7 8" />
                <line x1="12" y1="3" x2="12" y2="15" />
              </svg>
              <span>Export</span>
            </button>

            {showExportMenu && (
              <div className="export-menu">
                <button onClick={() => handleExport('png')}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <rect x="3" y="3" width="18" height="18" rx="2" />
                    <circle cx="8.5" cy="8.5" r="1.5" />
                    <polyline points="21 15 16 10 5 21" />
                  </svg>
                  PNG Image
                </button>
                <button onClick={() => handleExport('svg')}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                    <path d="M14 2v6h6" />
                  </svg>
                  SVG Vector
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Center - Title */}
        <div className="toolbar-center">
          {activeTab && (
            <span className="file-title">
              {activeTab.name}
              {activeTab.isDirty && <span className="unsaved-dot">●</span>}
              {activeTab.cloudId && <span className="cloud-badge">Cloud</span>}
            </span>
          )}
        </div>

        {/* Right Section */}
        <div className="toolbar-right">
          {/* Collaborator Avatars (shown when connected to a room) */}
          <CollaboratorAvatars 
            roomId={activeTab?.cloudId ?? null} 
            isConnected={isCollabConnected} 
          />

          {/* Publish Button */}
          <button 
            className={`toolbar-btn publish-btn ${activeTab?.cloudId ? 'published' : ''}`}
            onClick={handlePublish}
            title={activeTab?.cloudId ? 'Manage collaboration' : 'Publish to collaborate'}
            disabled={!activeTab}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
              <polyline points="16 6 12 2 8 6" />
              <line x1="12" y1="2" x2="12" y2="15" />
            </svg>
            <span>{activeTab?.cloudId ? 'Share' : 'Publish'}</span>
          </button>

          <div className="toolbar-divider" />

          {/* Online Status */}
          <div className={`status-indicator ${isOnline ? 'online' : 'offline'}`}>
            <span className="status-dot" />
            <span className="status-text">{isOnline ? 'Online' : 'Offline'}</span>
          </div>

          <button className="toolbar-btn icon-only" title="Settings">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
            </svg>
          </button>
        </div>
      </header>

      {/* Publish Modal */}
      <PublishModal 
        isOpen={showPublishModal}
        onClose={() => setShowPublishModal(false)}
        onPublished={handlePublished}
      />
    </>
  );
}
