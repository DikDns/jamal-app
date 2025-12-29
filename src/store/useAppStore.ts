import { create } from 'zustand';
import type { Tab, RecentFile } from '../types';
import type { TLEditorSnapshot } from 'tldraw';

interface AppStore {
  // State
  tabs: Tab[];
  activeTabId: string | null;
  recentFiles: RecentFile[];
  isOnline: boolean;

  // Tab actions
  addTab: (tab: Tab) => void;
  removeTab: (tabId: string) => void;
  setActiveTab: (tabId: string) => void;
  updateTab: (tabId: string, updates: Partial<Tab>) => void;
  updateTabStore: (tabId: string, store: TLEditorSnapshot) => void;
  setTabDirty: (tabId: string, isDirty: boolean) => void;

  // Recent files actions
  setRecentFiles: (files: RecentFile[]) => void;
  addRecentFile: (file: RecentFile) => void;
  removeRecentFile: (path: string) => void;
  clearRecentFiles: () => void;

  // Network status
  setOnline: (isOnline: boolean) => void;
}

export const useAppStore = create<AppStore>((set) => ({
  // Initial state
  tabs: [],
  activeTabId: null,
  recentFiles: [],
  isOnline: navigator.onLine,

  // Tab actions
  addTab: (tab) => set((state) => ({
    tabs: [...state.tabs, tab],
    activeTabId: tab.id,
  })),

  removeTab: (tabId) => set((state) => {
    const newTabs = state.tabs.filter((t) => t.id !== tabId);
    let newActiveId = state.activeTabId;

    if (state.activeTabId === tabId) {
      const index = state.tabs.findIndex((t) => t.id === tabId);
      if (newTabs.length > 0) {
        newActiveId = newTabs[Math.min(index, newTabs.length - 1)]?.id ?? null;
      } else {
        newActiveId = null;
      }
    }

    return {
      tabs: newTabs,
      activeTabId: newActiveId,
    };
  }),

  setActiveTab: (tabId) => set({ activeTabId: tabId }),

  updateTab: (tabId, updates) => set((state) => ({
    tabs: state.tabs.map((t) =>
      t.id === tabId ? { ...t, ...updates } : t
    ),
  })),

  updateTabStore: (tabId, store) => set((state) => ({
    tabs: state.tabs.map((t) =>
      t.id === tabId ? { ...t, store, isDirty: true } : t
    ),
  })),

  setTabDirty: (tabId, isDirty) => set((state) => ({
    tabs: state.tabs.map((t) =>
      t.id === tabId ? { ...t, isDirty } : t
    ),
  })),

  // Recent files actions
  setRecentFiles: (files) => set({ recentFiles: files }),

  addRecentFile: (file) => set((state) => {
    const filtered = state.recentFiles.filter((f) => f.path !== file.path);
    return {
      recentFiles: [file, ...filtered].slice(0, 20),
    };
  }),

  removeRecentFile: (path) => set((state) => ({
    recentFiles: state.recentFiles.filter((f) => f.path !== path),
  })),

  clearRecentFiles: () => set({ recentFiles: [] }),

  // Network status
  setOnline: (isOnline) => set({ isOnline }),
}));

// Selector helpers
export const useActiveTab = () => {
  const tabs = useAppStore((state) => state.tabs);
  const activeTabId = useAppStore((state) => state.activeTabId);
  return tabs.find((t) => t.id === activeTabId) ?? null;
};

export const useTabs = () => useAppStore((state) => state.tabs);
export const useActiveTabId = () => useAppStore((state) => state.activeTabId);
export const useRecentFiles = () => useAppStore((state) => state.recentFiles);
export const useIsOnline = () => useAppStore((state) => state.isOnline);

