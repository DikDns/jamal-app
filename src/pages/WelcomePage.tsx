import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppStore, useRecentFiles } from '../store/useAppStore';
import {
  getRecentFiles,
  openFileDialog,
  openDrawing,
  generateId,
  removeRecentFile as removeRecentFileService,
  clearRecentFiles as clearRecentFilesService,
} from '../services/fileService';
import type { Tab } from '../types';
import './WelcomePage.css';

export default function WelcomePage() {
  const navigate = useNavigate();
  const recentFiles = useRecentFiles();
  const { setRecentFiles, addTab, removeRecentFile, clearRecentFiles } = useAppStore();

  // Load recent files on mount
  useEffect(() => {
    loadRecentFiles();
  }, []);

  const loadRecentFiles = async () => {
    try {
      const files = await getRecentFiles();
      setRecentFiles(files);
    } catch (error) {
      console.error('Failed to load recent files:', error);
    }
  };

  const handleNewCanvas = () => {
    const newTab: Tab = {
      id: generateId(),
      name: 'Untitled',
      filePath: null,
      isDirty: false,
      store: null,
      cloudId: null,
    };
    addTab(newTab);
    navigate('/editor');
  };

  const handleOpenFile = async () => {
    try {
      const path = await openFileDialog();
      if (!path) return;

      const file = await openDrawing(path);
      const newTab: Tab = {
        id: generateId(),
        name: file.name,
        filePath: path,
        isDirty: false,
        store: file.store,
        cloudId: file.cloudId || null,
      };
      addTab(newTab);
      navigate('/editor');
    } catch (error) {
      console.error('Failed to open file:', error);
      // TODO: Show error toast
    }
  };

  const handleOpenRecent = async (path: string) => {
    try {
      const file = await openDrawing(path);
      const newTab: Tab = {
        id: generateId(),
        name: file.name,
        filePath: path,
        isDirty: false,
        store: file.store,
        cloudId: file.cloudId || null,
      };
      addTab(newTab);
      navigate('/editor');
    } catch (error) {
      console.error('Failed to open recent file:', error);
      // File might not exist anymore, remove from recent
      await removeRecentFileService(path);
      removeRecentFile(path);
    }
  };

  const handleRemoveRecent = async (e: React.MouseEvent, path: string) => {
    e.stopPropagation();
    try {
      await removeRecentFileService(path);
      removeRecentFile(path);
    } catch (error) {
      console.error('Failed to remove recent file:', error);
    }
  };

  const handleClearRecent = async () => {
    try {
      await clearRecentFilesService();
      clearRecentFiles();
    } catch (error) {
      console.error('Failed to clear recent files:', error);
    }
  };

  const formatDate = (timestamp: number) => {
    const date = new Date(timestamp * 1000);
    return date.toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  return (
    <div className="welcome-page">
      {/* Header */}
      <header className="welcome-header">
        <div className="logo">
          <img src="/logo.svg" alt="Jamal" width="28" height="28" />
          <span className="logo-text">Jamal</span>
        </div>
        <button className="icon-btn" aria-label="Settings">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
          </svg>
        </button>
      </header>

      {/* Main Content */}
      <main className="welcome-main">
        {/* Hero Section */}
        <section className="hero-section">
          <h1 className="hero-title">
            Welcome to<span className="highlight">, Jamal.</span>
          </h1>
          <p className="hero-subtitle">
            Create beautiful drawings and collaborate in real-time, even offline.
          </p>

          {/* Action Buttons */}
          <div className="action-buttons">
            <button className="action-btn primary" onClick={handleNewCanvas}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
              <span>New Canvas</span>
            </button>
            <button className="action-btn secondary" onClick={handleOpenFile}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <polyline points="14 2 14 8 20 8" />
              </svg>
              <span>Open File</span>
            </button>
          </div>
        </section>

        {/* Recent Files Section */}
        {recentFiles.length > 0 && (
          <section className="recent-section">
            <div className="recent-header">
              <h2 className="recent-title">Recent</h2>
              <button className="clear-btn" onClick={handleClearRecent}>
                Clear all
              </button>
            </div>
            <div className="recent-grid">
              {recentFiles.map((file) => (
                <div
                  key={file.path}
                  className="recent-card"
                  onClick={() => handleOpenRecent(file.path)}
                >
                  <button
                    className="remove-btn"
                    onClick={(e) => handleRemoveRecent(e, file.path)}
                    aria-label="Remove from recent"
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <line x1="18" y1="6" x2="6" y2="18" />
                      <line x1="6" y1="6" x2="18" y2="18" />
                    </svg>
                  </button>
                  <div className="recent-thumbnail">
                    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                      <rect x="3" y="3" width="18" height="18" rx="2" />
                      <circle cx="8.5" cy="8.5" r="1.5" />
                      <polyline points="21 15 16 10 5 21" />
                    </svg>
                  </div>
                  <div className="recent-info">
                    <span className="recent-name">{file.name}</span>
                    <span className="recent-date">{formatDate(file.lastOpened)}</span>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}
      </main>
    </div>
  );
}

