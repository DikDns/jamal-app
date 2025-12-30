import { useState, useEffect, useCallback } from 'react';
import { useActiveTab, useAppStore, useIsOnline } from '../store/useAppStore';
import { createDrawing } from '../services/cloudApi';
import { getTabSnapshot } from './Canvas';
import { getCollabSocket } from '../services/collabSocket';
import './PublishModal.css';

interface PublishModalProps {
  isOpen: boolean;
  onClose: () => void;
  onPublished?: (roomId: string) => void;
}

type ModalStep = 'confirm' | 'publishing' | 'success' | 'error';

export default function PublishModal({ isOpen, onClose, onPublished }: PublishModalProps) {
  const activeTab = useActiveTab();
  const isOnline = useIsOnline();
  const updateTab = useAppStore((state) => state.updateTab);
  
  const [step, setStep] = useState<ModalStep>('confirm');
  const [roomId, setRoomId] = useState<string | null>(null);
  const [collabLink, setCollabLink] = useState<string>('');
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [copied, setCopied] = useState(false);

  // Reset state when modal opens
  useEffect(() => {
    if (isOpen) {
      // If already published, show success with existing link
      if (activeTab?.cloudId) {
        setRoomId(activeTab.cloudId);
        setCollabLink(generateCollabLink(activeTab.cloudId));
        setStep('success');
      } else {
        setStep('confirm');
        setRoomId(null);
        setCollabLink('');
      }
      setErrorMessage('');
      setCopied(false);
    }
  }, [isOpen, activeTab?.cloudId]);

  const generateCollabLink = (id: string): string => {
    // Generate both deep link and web fallback
    return `jamal://session/${id}`;
  };

  const generateWebLink = (id: string): string => {
    return `https://jamal.rplupiproject.com/join/${id}`;
  };

  const handlePublish = useCallback(async () => {
    if (!activeTab || !isOnline) return;

    setStep('publishing');

    try {
      // Get current snapshot from the canvas
      // getTabSnapshot returns TLEditorSnapshot, not TLStoreSnapshot
      const editorSnapshot = getTabSnapshot(activeTab.id);
      if (!editorSnapshot) {
        throw new Error('Could not get canvas snapshot');
      }

      // TLEditorSnapshot structure is { document: { store, schema }, session }
      // Access the store records properly
      const storeRecords = (editorSnapshot as any).document?.store || (editorSnapshot as any).store || {};
      console.log('[Publish] Store records count:', Object.keys(storeRecords).length);
      
      // Convert TLDraw snapshot to API format
      const storeData = {
        schemaVersion: 1,
        records: storeRecords as Record<string, unknown>,
      };

      // Create drawing on server
      const drawing = await createDrawing({
        name: activeTab.name,
        store: storeData,
      });

      // Update tab with cloud ID
      updateTab(activeTab.id, { cloudId: drawing.id });

      // Generate collaboration link
      const link = generateCollabLink(drawing.id);
      setRoomId(drawing.id);
      setCollabLink(link);
      setStep('success');

      // Connect to WebSocket and join room
      const socket = getCollabSocket();
      if (!socket.isConnected()) {
        socket.connect();
      }
      // Wait a bit for connection then join
      setTimeout(() => {
        socket.join(drawing.id);
      }, 500);

      onPublished?.(drawing.id);
    } catch (error) {
      console.error('Failed to publish:', error);
      setErrorMessage(error instanceof Error ? error.message : 'Failed to publish canvas');
      setStep('error');
    }
  }, [activeTab, isOnline, updateTab, onPublished]);

  const handleCopyLink = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(collabLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      console.error('Failed to copy:', error);
    }
  }, [collabLink]);

  const handleCopyWebLink = useCallback(async () => {
    if (!roomId) return;
    try {
      await navigator.clipboard.writeText(generateWebLink(roomId));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      console.error('Failed to copy:', error);
    }
  }, [roomId]);

  const handleClose = () => {
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={handleClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        {/* Confirm Step */}
        {step === 'confirm' && (
          <>
            <div className="modal-header">
              <div className="modal-icon publish-icon">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
                  <polyline points="16 6 12 2 8 6" />
                  <line x1="12" y1="2" x2="12" y2="15" />
                </svg>
              </div>
              <h2>Publish Canvas</h2>
            </div>
            <div className="modal-body">
              <p className="modal-warning">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                  <line x1="12" y1="9" x2="12" y2="13" />
                  <line x1="12" y1="17" x2="12.01" y2="17" />
                </svg>
                <span>
                  Anyone with the link will be able to view and edit this canvas in real-time.
                </span>
              </p>
              {!isOnline && (
                <p className="modal-error">
                  You are currently offline. Please connect to the internet to publish.
                </p>
              )}
            </div>
            <div className="modal-actions">
              <button className="modal-btn secondary" onClick={handleClose}>
                Cancel
              </button>
              <button 
                className="modal-btn primary" 
                onClick={handlePublish}
                disabled={!isOnline}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
                  <polyline points="16 6 12 2 8 6" />
                  <line x1="12" y1="2" x2="12" y2="15" />
                </svg>
                Publish
              </button>
            </div>
          </>
        )}

        {/* Publishing Step */}
        {step === 'publishing' && (
          <>
            <div className="modal-header">
              <div className="modal-icon loading">
                <div className="spinner" />
              </div>
              <h2>Publishing...</h2>
            </div>
            <div className="modal-body">
              <p>Uploading your canvas to the cloud...</p>
            </div>
          </>
        )}

        {/* Success Step */}
        {step === 'success' && (
          <>
            <div className="modal-header">
              <div className="modal-icon success-icon">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                  <polyline points="22 4 12 14.01 9 11.01" />
                </svg>
              </div>
              <h2>Published!</h2>
            </div>
            <div className="modal-body">
              <p>Your canvas is now live. Share this link with others to collaborate:</p>
              
              <div className="link-section">
                <label>App Link (for JAMAL users)</label>
                <div className="link-input-group">
                  <input 
                    type="text" 
                    value={collabLink} 
                    readOnly 
                    className="link-input"
                  />
                  <button 
                    className="copy-btn" 
                    onClick={handleCopyLink}
                    title="Copy link"
                  >
                    {copied ? (
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                    ) : (
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                        <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                      </svg>
                    )}
                  </button>
                </div>
              </div>

              <div className="link-section">
                <label>Web Link (for sharing)</label>
                <div className="link-input-group">
                  <input 
                    type="text" 
                    value={roomId ? generateWebLink(roomId) : ''} 
                    readOnly 
                    className="link-input"
                  />
                  <button 
                    className="copy-btn" 
                    onClick={handleCopyWebLink}
                    title="Copy web link"
                  >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                    </svg>
                  </button>
                </div>
              </div>
            </div>
            <div className="modal-actions">
              <button className="modal-btn primary" onClick={handleClose}>
                Done
              </button>
            </div>
          </>
        )}

        {/* Error Step */}
        {step === 'error' && (
          <>
            <div className="modal-header">
              <div className="modal-icon error-icon">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="10" />
                  <line x1="15" y1="9" x2="9" y2="15" />
                  <line x1="9" y1="9" x2="15" y2="15" />
                </svg>
              </div>
              <h2>Failed to Publish</h2>
            </div>
            <div className="modal-body">
              <p className="modal-error">{errorMessage}</p>
            </div>
            <div className="modal-actions">
              <button className="modal-btn secondary" onClick={handleClose}>
                Cancel
              </button>
              <button className="modal-btn primary" onClick={() => setStep('confirm')}>
                Try Again
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

