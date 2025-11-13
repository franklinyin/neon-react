import { useState, useEffect, useRef, useCallback } from 'react';

/**
 * ViewBox class for managing SVG viewBox
 * Based on SingleView/Zoom.ts
 */
class ViewBox {
  a: number;
  b: number;
  c: number;
  d: number;
  imageHeight: number;
  imageWidth: number;

  constructor(imageWidth: number, imageHeight: number) {
    this.a = 0;
    this.b = 0;
    this.c = imageWidth;
    this.d = imageHeight;
    this.imageWidth = imageWidth;
    this.imageHeight = imageHeight;
  }

  set(w: number, x: number, y: number, z: number): void {
    this.a = w;
    this.b = x;
    this.c = y;
    this.d = z;
  }

  get(): string {
    return `${this.a} ${this.b} ${this.c} ${this.d}`;
  }

  zoomTo(k: number): void {
    const zoomHeight = this.imageHeight / k;
    const zoomWidth = this.imageWidth / k;
    this.c = zoomWidth;
    this.d = zoomHeight;
  }

  getZoom(): number {
    return this.imageWidth / this.c;
  }

  translate(xDiff: number, yDiff: number): void {
    this.a += xDiff;
    this.b += yDiff;
  }
}

/**
 * Custom hook for zoom functionality
 * Based on ZoomHandler from SingleView/Zoom.ts
 */
export const useZoom = (imageWidth?: number, imageHeight?: number) => {
  const [zoom, setZoom] = useState(100);
  const viewBoxRef = useRef<ViewBox | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);

  // Initialize viewBox when image dimensions are available
  useEffect(() => {
    if (imageWidth && imageHeight && !viewBoxRef.current) {
      viewBoxRef.current = new ViewBox(imageWidth, imageHeight);
      updateViewBox();
    }
  }, [imageWidth, imageHeight]);

  const updateViewBox = useCallback(() => {
    if (viewBoxRef.current && svgRef.current) {
      const viewBoxString = viewBoxRef.current.get();
      svgRef.current.setAttribute('viewBox', viewBoxString);
    }
  }, []);

  const getViewBox = useCallback(() => {
    if (!svgRef.current) return;
    
    if (!viewBoxRef.current && imageWidth && imageHeight) {
      viewBoxRef.current = new ViewBox(imageWidth, imageHeight);
    }

    if (viewBoxRef.current && svgRef.current) {
      const rawViewBox = svgRef.current.getAttribute('viewBox');
      if (rawViewBox) {
        const [a, b, c, d] = rawViewBox.split(' ').map(Number);
        viewBoxRef.current.set(a, b, c, d);
      }
    }
  }, [imageWidth, imageHeight]);

  const zoomTo = useCallback((k: number) => {
    getViewBox();
    if (viewBoxRef.current) {
      viewBoxRef.current.zoomTo(k);
      updateViewBox();
      setZoom(Math.round(k * 100));
    }
  }, [getViewBox, updateViewBox]);

  const resetZoomAndPan = useCallback(() => {
    if (imageWidth && imageHeight) {
      viewBoxRef.current = new ViewBox(imageWidth, imageHeight);
      updateViewBox();
      setZoom(100);
    }
  }, [imageWidth, imageHeight, updateViewBox]);

  const translate = useCallback((xDiff: number, yDiff: number) => {
    getViewBox();
    if (viewBoxRef.current) {
      viewBoxRef.current.translate(xDiff, yDiff);
      updateViewBox();
    }
  }, [getViewBox, updateViewBox]);

  const startDrag = useCallback((clientX: number, clientY: number) => {
    if (!svgRef.current) return null;
    
    const group = svgRef.current;
    const point = group.createSVGPoint();
    point.x = clientX;
    point.y = clientY;
    
    const matrix = group.getScreenCTM()?.inverse();
    if (!matrix) return null;
    
    return { point, matrix };
  }, []);

  const dragging = useCallback((
    startData: { point: DOMPoint; matrix: DOMMatrix } | null,
    currentX: number,
    currentY: number
  ) => {
    if (!startData || !svgRef.current) return;
    
    const group = svgRef.current;
    const newPoint = group.createSVGPoint();
    newPoint.x = currentX;
    newPoint.y = currentY;
    
    const newTransform = newPoint.matrixTransform(startData.matrix);
    const dragTransform = startData.point.matrixTransform(startData.matrix);
    
    translate(-newTransform.x + dragTransform.x, -newTransform.y + dragTransform.y);
  }, [translate]);

  return {
    zoom,
    zoomTo,
    resetZoomAndPan,
    translate,
    startDrag,
    dragging,
    setSvgRef: (svg: SVGSVGElement | null) => {
      svgRef.current = svg;
    },
  };
};

