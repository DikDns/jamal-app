import { useState, useEffect } from 'react';
import { getCollabSocket } from '../services/collabSocket';
import './CollaboratorAvatars.css';

interface Collaborator {
  id: string;
  name: string;
  color: string;
}

// Generate a consistent color from a string (user id)
function stringToColor(str: string): string {
  const colors = [
    '#f38ba8', // Red
    '#fab387', // Peach
    '#f9e2af', // Yellow
    '#a6e3a1', // Green
    '#94e2d5', // Teal
    '#89dceb', // Sky
    '#74c7ec', // Sapphire
    '#89b4fa', // Blue
    '#b4befe', // Lavender
    '#cba6f7', // Mauve
  ];
  
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  
  return colors[Math.abs(hash) % colors.length];
}

// Get initials from name or generate from id
function getInitials(name: string, id: string): string {
  if (name) {
    const parts = name.trim().split(' ');
    if (parts.length >= 2) {
      return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    }
    return name.slice(0, 2).toUpperCase();
  }
  return id.slice(0, 2).toUpperCase();
}

interface CollaboratorAvatarsProps {
  roomId: string | null;
  isConnected: boolean;
}

export default function CollaboratorAvatars({ roomId, isConnected }: CollaboratorAvatarsProps) {
  const [collaborators, setCollaborators] = useState<Collaborator[]>([]);
  const [showTooltip, setShowTooltip] = useState<string | null>(null);

  // Listen for presence updates
  useEffect(() => {
    if (!roomId || !isConnected) {
      setCollaborators([]);
      return;
    }

    // Get socket for future presence events (currently unused but ready)
    const _socket = getCollabSocket();
    void _socket; // Silence unused warning - will be used for presence events
    
    // For now, we'll simulate presence with the current user
    // In a full implementation, the backend would send presence events
    const currentUser: Collaborator = {
      id: 'self',
      name: 'You',
      color: stringToColor('self'),
    };
    
    setCollaborators([currentUser]);

    // TODO: Listen for presence events from server when implemented
    // socket.on('presence:join', (user) => { ... });
    // socket.on('presence:leave', (userId) => { ... });

    return () => {
      setCollaborators([]);
    };
  }, [roomId, isConnected]);

  if (!roomId || collaborators.length === 0) {
    return null;
  }

  const visibleCollaborators = collaborators.slice(0, 4);
  const hiddenCount = collaborators.length - 4;

  return (
    <div className="collaborator-avatars">
      {visibleCollaborators.map((collab, index) => (
        <div
          key={collab.id}
          className="avatar"
          style={{
            backgroundColor: collab.color,
            zIndex: visibleCollaborators.length - index,
          }}
          onMouseEnter={() => setShowTooltip(collab.id)}
          onMouseLeave={() => setShowTooltip(null)}
        >
          {getInitials(collab.name, collab.id)}
          
          {showTooltip === collab.id && (
            <div className="avatar-tooltip">
              {collab.name}
            </div>
          )}
        </div>
      ))}
      
      {hiddenCount > 0 && (
        <div className="avatar avatar-more">
          +{hiddenCount}
        </div>
      )}
      
      {isConnected && (
        <div className="connection-status connected">
          <span className="status-dot" />
          <span className="status-label">Live</span>
        </div>
      )}
    </div>
  );
}

