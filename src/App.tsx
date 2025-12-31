import { BrowserRouter, Routes, Route, useNavigate } from 'react-router-dom';
import { useEffect, useCallback } from 'react';
import { onOpenUrl } from '@tauri-apps/plugin-deep-link';
import WelcomePage from './pages/WelcomePage';
import EditorPage from './pages/EditorPage';
import NotFoundPage from './pages/NotFoundPage';
import { useAppStore } from './store/useAppStore';
import { getDrawingById } from './services/cloudApi';
import { generateId } from './services/fileService';
import type { Tab } from './types';
import './App.css';

// Deep link handler component (needs to be inside Router)
function DeepLinkHandler() {
  const navigate = useNavigate();
  const addTab = useAppStore((state) => state.addTab);
  const isOnline = useAppStore((state) => state.isOnline);

  // Handle deep link URL
  const handleDeepLink = useCallback(async (urls: string[]) => {
    for (const url of urls) {
      console.log('[DeepLink] Received:', url);

      // Parse jamal://session/{roomId}
      const match = url.match(/^jamal:\/\/session\/(.+)$/);
      if (match) {
        const roomId = match[1];
        console.log('[DeepLink] Joining room:', roomId);

        if (!isOnline) {
          console.warn('[DeepLink] Cannot join room while offline');
          // TODO: Show notification
          return;
        }

        try {
          // Try to fetch the drawing from the server
          const drawing = await getDrawingById(roomId);

          // Create a new tab with the cloud drawing
          const newTab: Tab = {
            id: generateId(),
            name: drawing.name || 'Shared Canvas',
            filePath: null,
            isDirty: false,
            store: null, // Will be loaded by collaboration hook
            cloudId: roomId,
          };

          addTab(newTab);
          navigate('/editor');
        } catch (error) {
          console.error('[DeepLink] Failed to join room:', error);
          // TODO: Show error notification
        }
      }
    }
  }, [navigate, addTab, isOnline]);

  // Listen for deep link events
  useEffect(() => {
    let unlisten: (() => void) | undefined;

    const setupDeepLinkListener = async () => {
      try {
        unlisten = await onOpenUrl(handleDeepLink);
      } catch (error) {
        // Deep link plugin might not be available in dev mode
        console.log('[DeepLink] Plugin not available:', error);
      }
    };

    setupDeepLinkListener();

    return () => {
      unlisten?.();
    };
  }, [handleDeepLink]);

  return null;
}

function App() {
  const setOnline = useAppStore((state) => state.setOnline);

  // Track online/offline status
  useEffect(() => {
    const handleOnline = () => setOnline(true);
    const handleOffline = () => setOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [setOnline]);

  return (
    <BrowserRouter>
      <DeepLinkHandler />
      <Routes>
        <Route path="/" element={<WelcomePage />} />
        <Route path="/editor" element={<EditorPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
