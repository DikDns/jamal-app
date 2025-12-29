import { useRef, useState } from 'react';
import { useAppStore, useTabs, useActiveTabId } from '../store/useAppStore';
import {
  saveDrawing,
  saveFileDialog,
  generateId,
  openFileDialog,
  openDrawing,
} from '../services/fileService';
import { getTabSnapshot } from './Canvas';
import type { Tab } from '../types';
import './TabBar.css';

export default function TabBar() {
  const tabs = useTabs();
  const activeTabId = useActiveTabId();
  const { setActiveTab, removeTab, addTab, updateTab, setTabDirty } = useAppStore();
  const [editingTabId, setEditingTabId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const handleTabClick = (tabId: string) => {
    setActiveTab(tabId);
  };

  const handleCloseTab = async (e: React.MouseEvent, tab: Tab) => {
    e.stopPropagation();

    // If dirty, prompt to save
    if (tab.isDirty) {
      const shouldSave = window.confirm(
        `"${tab.name}" has unsaved changes. Save before closing?`
      );
      if (shouldSave) {
        await handleSaveTab(tab);
      }
    }

    removeTab(tab.id);
  };

  const handleSaveTab = async (tab: Tab) => {
    const snapshot = getTabSnapshot(tab.id);
    if (!snapshot) return;

    let path = tab.filePath;
    if (!path) {
      path = await saveFileDialog(tab.name);
      if (!path) return;
    }

    try {
      await saveDrawing(path, tab.name, snapshot, tab.cloudId);
      updateTab(tab.id, { filePath: path });
      setTabDirty(tab.id, false);
    } catch (error) {
      console.error('Failed to save:', error);
    }
  };

  const handleNewTab = () => {
    const newTab: Tab = {
      id: generateId(),
      name: 'Untitled',
      filePath: null,
      isDirty: false,
      store: null,
      cloudId: null,
    };
    addTab(newTab);
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
    } catch (error) {
      console.error('Failed to open file:', error);
    }
  };

  const handleDoubleClick = (tab: Tab) => {
    setEditingTabId(tab.id);
    setEditingName(tab.name);
    setTimeout(() => inputRef.current?.select(), 0);
  };

  const handleNameSubmit = (tabId: string) => {
    if (editingName.trim()) {
      updateTab(tabId, { name: editingName.trim() });
      setTabDirty(tabId, true);
    }
    setEditingTabId(null);
  };

  const handleKeyDown = (e: React.KeyboardEvent, tabId: string) => {
    if (e.key === 'Enter') {
      handleNameSubmit(tabId);
    } else if (e.key === 'Escape') {
      setEditingTabId(null);
    }
  };

  return (
    <div className="tab-bar">
      <div className="tabs-container">
        {tabs.map((tab) => (
          <div
            key={tab.id}
            className={`tab ${tab.id === activeTabId ? 'active' : ''} ${
              tab.isDirty ? 'dirty' : ''
            }`}
            onClick={() => handleTabClick(tab.id)}
            onDoubleClick={() => handleDoubleClick(tab)}
          >
            {editingTabId === tab.id ? (
              <input
                ref={inputRef}
                className="tab-name-input"
                value={editingName}
                onChange={(e) => setEditingName(e.target.value)}
                onBlur={() => handleNameSubmit(tab.id)}
                onKeyDown={(e) => handleKeyDown(e, tab.id)}
                onClick={(e) => e.stopPropagation()}
                autoFocus
              />
            ) : (
              <>
                <span className="tab-name">
                  {tab.isDirty && <span className="dirty-indicator">●</span>}
                  {tab.name}
                </span>
                <button
                  className="tab-close"
                  onClick={(e) => handleCloseTab(e, tab)}
                  aria-label="Close tab"
                >
                  <svg
                    width="12"
                    height="12"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <line x1="18" y1="6" x2="6" y2="18" />
                    <line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>
              </>
            )}
          </div>
        ))}

        {/* New Tab Button */}
        <button className="new-tab-btn" onClick={handleNewTab} aria-label="New tab">
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
        </button>
      </div>

      {/* Tab Actions */}
      <div className="tab-actions">
        <button className="tab-action-btn" onClick={handleOpenFile} title="Open File">
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <polyline points="14 2 14 8 20 8" />
          </svg>
        </button>
      </div>
    </div>
  );
}

