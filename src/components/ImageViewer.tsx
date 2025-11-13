import { useEffect, useRef, useState } from 'react';
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
    containerRef.current.appendChild(svg);

    // Cleanup
    return () => {
      if (containerRef.current && svg.parentNode) {
        svg.parentNode.removeChild(svg);
      }
      svgRef.current = null;
    };
  }, [imagePath]);

  return <div ref={containerRef} id="container-content" style={{ width: '100%', height: '100%' }} />;
};

export default ImageViewer;

