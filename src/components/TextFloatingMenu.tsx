import { useEffect, useState, useCallback, useRef } from 'react';
import { useEditor, TLTextShape, useValue } from 'tldraw';
import './TextFloatingMenu.css';

// TLDraw color palette - uses named colors, not hex values
// Display colors are for rendering, name is what TLDraw expects
const COLORS = [
    { name: 'light-red', display: '#fca5a5' },
    { name: 'red', display: '#ef4444' },
    { name: 'orange', display: '#f97316' },
    { name: 'yellow', display: '#facc15' },
    { name: 'light-green', display: '#86efac' },
    { name: 'green', display: '#22c55e' },
    { name: 'light-blue', display: '#7dd3fc' },
    { name: 'blue', display: '#3b82f6' },
    { name: 'light-violet', display: '#c4b5fd' },
    { name: 'violet', display: '#8b5cf6' },
    { name: 'grey', display: '#9ca3af' },
    { name: 'black', display: '#1f2937' },
    { name: 'white', display: '#ffffff', border: true },
];

const SIZES = ['s', 'm', 'l', 'xl'] as const;
type TLSize = typeof SIZES[number];

export default function TextFloatingMenu() {
    const editor = useEditor();
    const [isVisible, setIsVisible] = useState(false);
    const [menuPosition, setMenuPosition] = useState({ x: 0, y: 0 });
    const [hoveredShapeId, setHoveredShapeId] = useState<string | null>(null);
    const hoverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const menuRef = useRef<HTMLDivElement>(null);

    // Track selected color, size, and alignment - using TLDraw's named values
    const [selectedColor, setSelectedColor] = useState('black');
    const [selectedSize, setSelectedSize] = useState<TLSize>('m');
    const [alignment, setAlignment] = useState<'start' | 'middle' | 'end'>('start');

    // Get hovered shape from editor
    const hoveredShape = useValue('hovered shape', () => {
        const hoveredId = editor.getHoveredShapeId();
        if (!hoveredId) return null;
        const shape = editor.getShape(hoveredId);
        // Check if it's a text shape
        if (shape?.type === 'text') {
            return shape;
        }
        return null;
    }, [editor]);

    // Handle hover with 1 second delay
    useEffect(() => {
        if (hoveredShape) {
            if (hoveredShape.id !== hoveredShapeId) {
                // Clear existing timer
                if (hoverTimerRef.current) {
                    clearTimeout(hoverTimerRef.current);
                }

                // Start new timer for 1 second delay
                hoverTimerRef.current = setTimeout(() => {
                    setHoveredShapeId(hoveredShape.id);

                    // Calculate menu position (above the shape)
                    const bounds = editor.getShapePageBounds(hoveredShape.id);
                    if (bounds) {
                        const viewport = editor.getViewportPageBounds();
                        const zoom = editor.getZoomLevel();

                        // Convert page coordinates to screen coordinates
                        const screenX = (bounds.x - viewport.x) * zoom + bounds.width * zoom / 2;
                        const screenY = (bounds.y - viewport.y) * zoom - 10;

                        setMenuPosition({ x: screenX, y: screenY });
                        setIsVisible(true);

                        // Load current shape properties
                        if (hoveredShape.type === 'text') {
                            const textShape = hoveredShape as TLTextShape;
                            setSelectedColor(textShape.props.color || '#1f2937');
                            setSelectedSize(textShape.props.size as typeof SIZES[number] || 'M');
                            setAlignment(textShape.props.textAlign || 'start');
                        }
                    }
                }, 1000);
            }
        } else {
            // Hide menu when not hovering
            if (hoverTimerRef.current) {
                clearTimeout(hoverTimerRef.current);
            }
            // Small delay before hiding to allow interaction with menu
            setTimeout(() => {
                if (!menuRef.current?.matches(':hover')) {
                    setIsVisible(false);
                    setHoveredShapeId(null);
                }
            }, 200);
        }

        return () => {
            if (hoverTimerRef.current) {
                clearTimeout(hoverTimerRef.current);
            }
        };
    }, [hoveredShape, hoveredShapeId, editor]);

    // Apply color change
    const handleColorChange = useCallback((color: string) => {
        setSelectedColor(color);
        if (hoveredShapeId) {
            editor.updateShape({
                id: hoveredShapeId as any,
                type: 'text',
                props: { color },
            });
        }
    }, [editor, hoveredShapeId]);

    // Apply size change
    const handleSizeChange = useCallback((size: TLSize) => {
        setSelectedSize(size);
        if (hoveredShapeId) {
            editor.updateShape({
                id: hoveredShapeId as any,
                type: 'text',
                props: { size },
            });
        }
    }, [editor, hoveredShapeId]);

    // Apply alignment
    const handleAlignChange = useCallback((align: 'start' | 'middle' | 'end') => {
        setAlignment(align);
        if (hoveredShapeId) {
            editor.updateShape({
                id: hoveredShapeId as any,
                type: 'text',
                props: { textAlign: align },
            });
        }
    }, [editor, hoveredShapeId]);

    if (!isVisible) return null;

    return (
        <div
            ref={menuRef}
            className="text-floating-menu"
            style={{
                left: menuPosition.x,
                top: menuPosition.y,
                transform: 'translate(-50%, -100%)',
            }}
            onMouseEnter={() => setIsVisible(true)}
            onMouseLeave={() => {
                setIsVisible(false);
                setHoveredShapeId(null);
            }}
        >
            {/* Color Row */}
            <div className="menu-row">
                <span className="menu-label">Color</span>
                <div className="color-grid">
                    {COLORS.map((color) => (
                        <button
                            key={color.name}
                            className={`color-swatch ${selectedColor === color.name ? 'selected' : ''} ${color.border ? 'with-border' : ''}`}
                            style={{ backgroundColor: color.display }}
                            onClick={() => handleColorChange(color.name)}
                            title={color.name}
                        />
                    ))}
                </div>
            </div>

            {/* Divider */}
            <div className="menu-divider" />

            {/* Size Row */}
            <div className="menu-row">
                <span className="menu-label">Size</span>
                <div className="size-buttons">
                    {SIZES.map((size) => (
                        <button
                            key={size}
                            className={`size-btn ${selectedSize === size ? 'selected' : ''}`}
                            onClick={() => handleSizeChange(size)}
                        >
                            {size.toUpperCase()}
                        </button>
                    ))}
                </div>
            </div>
            {/* Divider */}
            <div className="menu-divider" />

            {/* Align Row */}
            <div className="menu-row">
                <span className="menu-label">Align</span>
                <div className="align-buttons">
                    <button
                        className={`align-btn ${alignment === 'start' ? 'selected' : ''}`}
                        onClick={() => handleAlignChange('start')}
                        title="Align Left"
                    >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                            <path d="M3 5h18v2H3V5zm0 4h12v2H3V9zm0 4h18v2H3v-2zm0 4h12v2H3v-2z" />
                        </svg>
                    </button>
                    <button
                        className={`align-btn ${alignment === 'middle' ? 'selected' : ''}`}
                        onClick={() => handleAlignChange('middle')}
                        title="Align Center"
                    >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                            <path d="M3 5h18v2H3V5zm3 4h12v2H6V9zm-3 4h18v2H3v-2zm3 4h12v2H6v-2z" />
                        </svg>
                    </button>
                    <button
                        className={`align-btn ${alignment === 'end' ? 'selected' : ''}`}
                        onClick={() => handleAlignChange('end')}
                        title="Align Right"
                    >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                            <path d="M3 5h18v2H3V5zm6 4h12v2H9V9zm-6 4h18v2H3v-2zm6 4h12v2H9v-2z" />
                        </svg>
                    </button>
                </div>
            </div>
        </div>
    );
}
