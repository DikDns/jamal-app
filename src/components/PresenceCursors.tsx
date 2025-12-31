import type { PresenceData } from '../types';

interface PresenceCursorsProps {
    presences: Map<string, PresenceData>;
    viewportTransform?: {
        x: number;
        y: number;
        scale: number;
    };
}

/**
 * Renders remote user cursors on the canvas.
 * Each cursor shows the user's position with their assigned color and name.
 */
export function PresenceCursors({ presences, viewportTransform }: PresenceCursorsProps) {
    const transform = viewportTransform || { x: 0, y: 0, scale: 1 };

    return (
        <div
            style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                height: '100%',
                pointerEvents: 'none',
                zIndex: 9999,
                overflow: 'hidden',
            }}
        >
            {Array.from(presences.values()).map((presence) => {
                if (!presence.cursor) return null;

                // Transform page coordinates to screen coordinates
                const screenX = presence.cursor.x * transform.scale + transform.x;
                const screenY = presence.cursor.y * transform.scale + transform.y;

                return (
                    <div
                        key={presence.odId}
                        style={{
                            position: 'absolute',
                            left: screenX,
                            top: screenY,
                            transform: 'translate(-2px, -2px)',
                            transition: 'left 0.05s ease-out, top 0.05s ease-out',
                        }}
                    >
                        {/* Cursor SVG */}
                        <svg
                            width="24"
                            height="24"
                            viewBox="0 0 24 24"
                            fill="none"
                            style={{ filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.3))' }}
                        >
                            <path
                                d="M5.5 3.21V20.8c0 .45.54.67.85.35l4.86-4.86a.5.5 0 0 1 .35-.15h6.87a.5.5 0 0 0 .35-.85L6.35 2.85a.5.5 0 0 0-.85.36z"
                                fill={presence.color}
                                stroke="white"
                                strokeWidth="1.5"
                            />
                        </svg>

                        {/* Name label */}
                        <div
                            style={{
                                position: 'absolute',
                                left: 16,
                                top: 16,
                                background: presence.color,
                                color: 'white',
                                fontSize: '12px',
                                fontWeight: 500,
                                padding: '2px 8px',
                                borderRadius: '4px',
                                whiteSpace: 'nowrap',
                                boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
                            }}
                        >
                            {presence.name}
                        </div>
                    </div>
                );
            })}
        </div>
    );
}

export default PresenceCursors;
