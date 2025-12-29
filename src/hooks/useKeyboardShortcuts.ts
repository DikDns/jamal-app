import { useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppStore, useActiveTab } from '../store/useAppStore';
import {
  saveDrawing,
  saveFileDialog,
  openFileDialog,
  openDrawing,
  generateId,
} from '../services/fileService';
import { getTabSnapshot } from '../components/Canvas';
import type { Tab } from '../types';

export function useKeyboardShortcuts() {
  const navigate = useNavigate();
  const activeTab = useActiveTab();
  const { addTab, updateTab, setTabDirty, removeTab, setActiveTab, tabs } = useAppStore();

  const handleSave = useCallback(async () => {
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
  }, [activeTab, updateTab, setTabDirty]);

  const handleSaveAs = useCallback(async () => {
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
  }, [activeTab, updateTab, setTabDirty]);

  const handleOpen = useCallback(async () => {
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
    }
  }, [addTab, navigate]);

  const handleNewCanvas = useCallback(() => {
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
  }, [addTab, navigate]);

  const handleCloseTab = useCallback(async () => {
    if (!activeTab) return;

    if (activeTab.isDirty) {
      const shouldSave = window.confirm(
        `"${activeTab.name}" has unsaved changes. Save before closing?`
      );
      if (shouldSave) {
        await handleSave();
      }
    }

    removeTab(activeTab.id);

    if (tabs.length <= 1) {
      navigate('/');
    }
  }, [activeTab, removeTab, handleSave, tabs.length, navigate]);

  const handleNextTab = useCallback(() => {
    if (tabs.length <= 1) return;
    
    const currentIndex = tabs.findIndex((t) => t.id === activeTab?.id);
    const nextIndex = (currentIndex + 1) % tabs.length;
    setActiveTab(tabs[nextIndex].id);
  }, [tabs, activeTab, setActiveTab]);

  const handlePrevTab = useCallback(() => {
    if (tabs.length <= 1) return;
    
    const currentIndex = tabs.findIndex((t) => t.id === activeTab?.id);
    const prevIndex = (currentIndex - 1 + tabs.length) % tabs.length;
    setActiveTab(tabs[prevIndex].id);
  }, [tabs, activeTab, setActiveTab]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const isMod = e.ctrlKey || e.metaKey;

      // Ctrl/Cmd + S - Save
      if (isMod && e.key === 's' && !e.shiftKey) {
        e.preventDefault();
        handleSave();
        return;
      }

      // Ctrl/Cmd + Shift + S - Save As
      if (isMod && e.key === 's' && e.shiftKey) {
        e.preventDefault();
        handleSaveAs();
        return;
      }

      // Ctrl/Cmd + O - Open
      if (isMod && e.key === 'o') {
        e.preventDefault();
        handleOpen();
        return;
      }

      // Ctrl/Cmd + N - New Canvas
      if (isMod && e.key === 'n') {
        e.preventDefault();
        handleNewCanvas();
        return;
      }

      // Ctrl/Cmd + W - Close Tab
      if (isMod && e.key === 'w') {
        e.preventDefault();
        handleCloseTab();
        return;
      }

      // Ctrl/Cmd + Tab or Ctrl/Cmd + PageDown - Next Tab
      if (isMod && (e.key === 'Tab' || e.key === 'PageDown') && !e.shiftKey) {
        e.preventDefault();
        handleNextTab();
        return;
      }

      // Ctrl/Cmd + Shift + Tab or Ctrl/Cmd + PageUp - Previous Tab
      if (isMod && ((e.key === 'Tab' && e.shiftKey) || e.key === 'PageUp')) {
        e.preventDefault();
        handlePrevTab();
        return;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    handleSave,
    handleSaveAs,
    handleOpen,
    handleNewCanvas,
    handleCloseTab,
    handleNextTab,
    handlePrevTab,
  ]);
}

