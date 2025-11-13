import { useEffect, useRef, useState, useCallback } from 'react';
import { useZoom } from '../hooks/useZoom';

/**
 * ImageViewer Component
 * Displays the manuscript image in the container
 * Based on SingleView.ts - creates SVG with background image
 */
const ImageViewer: React.FC<{ imagePath?: string; onZoomReady?: (zoom: ReturnType<typeof useZoom>) => void }> = ({ 
  imagePath = '/SK-001.png',
  onZoomReady 
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [imageDimensions, setImageDimensions] = useState<{ width: number; height: number } | null>(null);
  const zoom = useZoom(imageDimensions?.width, imageDimensions?.height);
  const dragStartDataRef = useRef<{ point: DOMPoint; matrix: DOMMatrix } | null>(null);
  const isDraggingRef = useRef(false);
  const [isShiftPressed, setIsShiftPressed] = useState(false);

  useEffect(() => {
    if (svgRef.current) {
      zoom.setSvgRef(svgRef.current);
    }
  }, [zoom, svgRef.current, imageDimensions]);

  useEffect(() => {
    if (onZoomReady && imageDimensions) {
      onZoomReady(zoom);
    }
  }, [onZoomReady, zoom, imageDimensions]);

  useEffect(() => {
    if (!containerRef.current) return;

    // Create SVG group (matching SingleView structure)
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.id = 'svg_group';
    svg.setAttribute('height', window.innerHeight.toString());
    svg.setAttribute('width', '100%');
    svgRef.current = svg;

    // Create background image element
    const bg = document.createElementNS('http://www.w3.org/2000/svg', 'image');
    bg.id = 'bgimg';
    bg.classList.add('background');
    bg.setAttribute('x', '0');
    bg.setAttribute('y', '0');

    // Load image and set href
    const img = new Image();
    img.onload = () => {
      bg.setAttributeNS('http://www.w3.org/1999/xlink', 'href', imagePath);
      bg.setAttribute('width', img.width.toString());
      bg.setAttribute('height', img.height.toString());
      
      setImageDimensions({ width: img.width, height: img.height });
      
      // Set initial viewBox based on image dimensions
      if (!svg.hasAttribute('viewBox')) {
        svg.setAttribute('viewBox', `0 0 ${img.width} ${img.height}`);
      }
      
      // Set SVG ref after image loads
      if (svgRef.current !== svg) {
        svgRef.current = svg;
        zoom.setSvgRef(svg);
      }
    };
    img.src = imagePath;

    // Create MEI output container (for future MEI overlay)
    const mei = document.createElementNS('http://www.w3.org/2000/svg', 'svg') as SVGSVGElement;
    mei.id = 'mei_output';
    mei.classList.add('neon-container', 'active-page');

    svg.appendChild(bg);
    svg.appendChild(mei);
    svg.style.cursor = 'default';
    containerRef.current.appendChild(svg);

    // Cleanup
    return () => {
      if (containerRef.current && svg.parentNode) {
        svg.parentNode.removeChild(svg);
      }
      svgRef.current = null;
    };
  }, [imagePath]);

  // Drag handlers for panning
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    // Only drag when Shift is held (matching original behavior)
    if (e.shiftKey && svgRef.current) {
      e.preventDefault();
      const startData = zoom.startDrag(e.clientX, e.clientY);
      if (startData) {
        dragStartDataRef.current = startData;
        isDraggingRef.current = true;
      }
    }
  }, [zoom]);

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (isDraggingRef.current && dragStartDataRef.current) {
      e.preventDefault();
      zoom.dragging(dragStartDataRef.current, e.clientX, e.clientY);
      // Update the start point for next move
      if (svgRef.current) {
        const newPoint = svgRef.current.createSVGPoint();
        newPoint.x = e.clientX;
        newPoint.y = e.clientY;
        dragStartDataRef.current.point = newPoint;
      }
    }
  }, [zoom]);

  const handleMouseUp = useCallback(() => {
    isDraggingRef.current = false;
    dragStartDataRef.current = null;
  }, []);

  // Touch handlers for mobile
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    if (e.touches.length === 2 && svgRef.current) {
      e.preventDefault();
      const touch = e.touches[0];
      const startData = zoom.startDrag(touch.clientX, touch.clientY);
      if (startData) {
        dragStartDataRef.current = startData;
        isDraggingRef.current = true;
      }
    }
  }, [zoom]);

  const handleTouchMove = useCallback((e: TouchEvent) => {
    if (isDraggingRef.current && dragStartDataRef.current && e.touches.length === 2) {
      e.preventDefault();
      const touch = e.touches[0];
      zoom.dragging(dragStartDataRef.current, touch.clientX, touch.clientY);
      // Update the start point for next move
      if (svgRef.current) {
        const newPoint = svgRef.current.createSVGPoint();
        newPoint.x = touch.clientX;
        newPoint.y = touch.clientY;
        dragStartDataRef.current.point = newPoint;
      }
    }
  }, [zoom]);

  const handleTouchEnd = useCallback(() => {
    isDraggingRef.current = false;
    dragStartDataRef.current = null;
  }, []);

  // Set up global mouse event listeners
  useEffect(() => {
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    document.addEventListener('touchmove', handleTouchMove);
    document.addEventListener('touchend', handleTouchEnd);

    // Handle Shift key for drag mode
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Shift') {
        setIsShiftPressed(true);
        if (svgRef.current) {
          svgRef.current.style.cursor = 'move';
        }
        if (containerRef.current) {
          containerRef.current.style.cursor = 'move';
        }
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.key === 'Shift') {
        setIsShiftPressed(false);
        isDraggingRef.current = false;
        dragStartDataRef.current = null;
        if (svgRef.current) {
          svgRef.current.style.cursor = 'default';
        }
        if (containerRef.current) {
          containerRef.current.style.cursor = 'default';
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('keyup', handleKeyUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.removeEventListener('touchmove', handleTouchMove);
      document.removeEventListener('touchend', handleTouchEnd);
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('keyup', handleKeyUp);
    };
  }, [handleMouseMove, handleMouseUp, handleTouchMove, handleTouchEnd]);

  return (
    <div 
      ref={containerRef} 
      id="container-content" 
      style={{ width: '100%', height: '100%', cursor: isShiftPressed ? 'move' : 'default' }}
      onMouseDown={handleMouseDown}
      onTouchStart={handleTouchStart}
    />
  );
};

export default ImageViewer;

