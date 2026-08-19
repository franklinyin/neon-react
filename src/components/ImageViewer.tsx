import { useEffect, useRef, useState, useCallback } from 'react';
import { useZoom } from '../hooks/useZoom';
import { measureRenderedStaffs } from '../lib/schenker/geometry';

export type ScorePoint = {
  x: number;
  y: number;
};

export type ScoreHit = {
  point: ScorePoint;
  /**
   * xml:id of the nearest ancestor `.note` group, or null if the click
   * missed a note (staff lines, blank page, etc.).
   *
   * Stage-1 CF-005 assumption: every rendered `.note` is a Structural Note.
   * That is not a general future rule.
   */
  noteId: string | null;
  /** xml:id of the nearest `.beam` when the beam bar itself is clicked. */
  beamId: string | null;
  additive: boolean;
};

const SELECTED_NOTE_CLASS = 'selected-schenker-note';
const SELECTED_BEAM_CLASS = 'selected-schenker-beam';

function selectionFromEvent(event: React.MouseEvent): { noteId: string | null; beamId: string | null } {
  const candidates: Element[] = [];
  if (event.target instanceof Element) {
    candidates.push(event.target);
  }
  const fromPoint = document.elementFromPoint(event.clientX, event.clientY);
  if (fromPoint instanceof Element && !candidates.includes(fromPoint)) {
    candidates.push(fromPoint);
  }
  for (const el of candidates) {
    const note = el.closest('.note');
    if (note?.id) {
      return { noteId: note.id, beamId: null };
    }
    const beam = el.closest('.beam');
    if (beam?.id) {
      return { noteId: null, beamId: beam.id };
    }
  }
  return { noteId: null, beamId: null };
}

function applyNoteSelection(overlay: SVGSVGElement, selectedNoteIds: string[]): void {
  overlay.querySelectorAll(`.note.${SELECTED_NOTE_CLASS}`).forEach((note) => {
    note.classList.remove(SELECTED_NOTE_CLASS, 'selected');
  });
  for (const id of selectedNoteIds) {
    if (!id) {
      continue;
    }
    const note = overlay.querySelector(`#${CSS.escape(id)}.note`);
    if (note) {
      note.classList.add(SELECTED_NOTE_CLASS, 'selected');
    }
  }
}

function applyBeamSelection(overlay: SVGSVGElement, selectedBeamId: string | null): void {
  overlay.querySelectorAll(`.beam.${SELECTED_BEAM_CLASS}`).forEach((beam) => {
    beam.classList.remove(SELECTED_BEAM_CLASS, 'selected');
  });
  if (!selectedBeamId) {
    return;
  }
  const beam = overlay.querySelector(`#${CSS.escape(selectedBeamId)}.beam`);
  if (beam) {
    beam.classList.add(SELECTED_BEAM_CLASS, 'selected');
  }
}

function clientToPageCoords(
  svgGroup: SVGSVGElement,
  clientX: number,
  clientY: number,
): ScorePoint | null {
  const overlay = svgGroup.querySelector<SVGSVGElement>('.neon-container.active-page');
  if (!overlay) {
    return null;
  }
  const definitionScale =
    overlay.querySelector<SVGGraphicsElement>(':scope > .definition-scale') ||
    overlay.querySelector<SVGGraphicsElement>('.definition-scale');
  if (!definitionScale) {
    return null;
  }
  const pageMargin = definitionScale.querySelector<SVGGElement>('.page-margin');
  if (!pageMargin) {
    return null;
  }
  const ctm = pageMargin.getScreenCTM();
  if (!ctm) {
    return null;
  }
  const pt = new DOMPoint(clientX, clientY).matrixTransform(ctm.inverse());
  return { x: pt.x, y: pt.y };
}

function pageToClientCoords(
  svgGroup: SVGSVGElement,
  x: number,
  y: number,
): ScorePoint | null {
  const overlay = svgGroup.querySelector<SVGSVGElement>('.neon-container.active-page');
  const pageMargin = overlay?.querySelector<SVGGElement>('.page-margin');
  const ctm = pageMargin?.getScreenCTM();
  if (!ctm) {
    return null;
  }
  const pt = new DOMPoint(x, y).matrixTransform(ctm);
  return { x: pt.x, y: pt.y };
}

function pageBounds(svgGroup: SVGSVGElement, fallback?: { width: number; height: number } | null) {
  const bg = svgGroup.querySelector<SVGImageElement>('#bgimg');
  const width = Number(bg?.getAttribute('width')) || fallback?.width || 0;
  const height = Number(bg?.getAttribute('height')) || fallback?.height || 0;
  return { width, height };
}

/**
 * ImageViewer Component
 * Displays the manuscript image in the container
 * Based on SingleView.ts - creates SVG with background image
 */
const ImageViewer: React.FC<{
  imagePath?: string;
  meiSvg?: string | null;
  selectedNoteIds?: string[];
  selectedBeamId?: string | null;
  onScoreClick?: (hit: ScoreHit) => void;
  onZoomReady?: (zoom: ReturnType<typeof useZoom>) => void;
}> = ({
  imagePath = '/SK-001.png',
  meiSvg = null,
  selectedNoteIds = [],
  selectedBeamId = null,
  onScoreClick,
  onZoomReady,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [imageDimensions, setImageDimensions] = useState<{ width: number; height: number } | null>(null);
  const zoom = useZoom(imageDimensions?.width, imageDimensions?.height);
  const dragStartDataRef = useRef<{ point: DOMPoint; matrix: DOMMatrix } | null>(null);
  const isDraggingRef = useRef(false);
  const didPanRef = useRef(false);
  const [isShiftPressed, setIsShiftPressed] = useState(false);
  const zoomReadySentRef = useRef(false);
  const onScoreClickRef = useRef(onScoreClick);
  onScoreClickRef.current = onScoreClick;
  const selectedNoteIdsRef = useRef(selectedNoteIds);
  selectedNoteIdsRef.current = selectedNoteIds;
  const selectedBeamIdRef = useRef(selectedBeamId);
  selectedBeamIdRef.current = selectedBeamId;

  useEffect(() => {
    if (svgRef.current) {
      zoom.setSvgRef(svgRef.current);
    }
  }, [zoom, imageDimensions]);

  useEffect(() => {
    if (onZoomReady && imageDimensions && !zoomReadySentRef.current) {
      zoomReadySentRef.current = true;
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
    let cancelled = false;
    const img = new Image();
    img.onload = () => {
      if (cancelled) {
        return;
      }
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

    const mei = document.createElementNS('http://www.w3.org/2000/svg', 'svg') as SVGSVGElement;
    mei.id = 'mei_output';
    mei.classList.add('neon-container', 'active-page');

    svg.appendChild(bg);
    svg.appendChild(mei);
    svg.style.cursor = 'default';
    containerRef.current.appendChild(svg);

    return () => {
      cancelled = true;
      if (containerRef.current && svg.parentNode) {
        svg.parentNode.removeChild(svg);
      }
      svgRef.current = null;
      zoomReadySentRef.current = false;
    };
  }, [imagePath]);

  useEffect(() => {
    const group = svgRef.current;
    if (!group || !meiSvg) {
      return;
    }

    const existing = group.querySelector('#mei_output, .neon-container.active-page');
    if (!existing) {
      return;
    }

    const parsed = new DOMParser().parseFromString(meiSvg, 'image/svg+xml');
    const root = parsed.documentElement;
    if (root.querySelector('parsererror') || root.localName === 'parsererror') {
      console.error('Failed to parse Verovio SVG overlay');
      return;
    }

    const overlay = document.importNode(root, true);
    if (!(overlay instanceof SVGSVGElement)) {
      console.error('Verovio overlay root is not an SVG element');
      return;
    }
    // Keep Verovio's root xml:id. Its embedded CSS is scoped to that id
    // (`#xxxx path { stroke: currentColor }`). Overwriting it as mei_output
    // made staff-line paths compute to stroke:none while clef <use> glyphs
    // still painted via fill.
    overlay.classList.add('neon-container', 'active-page');
    overlay.style.overflow = 'visible';

    const nestedViewBox = overlay.getAttribute('viewBox')
      || overlay.querySelector('svg[viewBox]')?.getAttribute('viewBox');
    if (!overlay.getAttribute('viewBox') && nestedViewBox) {
      overlay.setAttribute('viewBox', nestedViewBox);
    }

    group.replaceChild(overlay, existing);

    applyNoteSelection(overlay, selectedNoteIdsRef.current);
    applyBeamSelection(overlay, selectedBeamIdRef.current);

    if (import.meta.env.DEV) {
      const staffs = measureRenderedStaffs(overlay);
      const viewBox = overlay.getAttribute('viewBox');
      const pathCount = overlay.querySelectorAll('.staff path').length;
      const noteCount = overlay.querySelectorAll('.note').length;
      const xmlId = overlay.getAttribute('xml:id') || overlay.id;
      console.log('[phase3] overlay mounted', { viewBox, xmlId, pathCount, noteCount, staffs });
      const w = window as Window & {
        __PHASE3_STAFFS__?: typeof staffs;
        __PHASE3_OVERLAY__?: { viewBox: string | null; xmlId: string; pathCount: number; noteCount: number };
      };
      w.__PHASE3_STAFFS__ = staffs;
      w.__PHASE3_OVERLAY__ = { viewBox, xmlId, pathCount, noteCount };
    }
  }, [meiSvg, imageDimensions]);

  useEffect(() => {
    const overlay = svgRef.current?.querySelector<SVGSVGElement>(
      '.neon-container.active-page',
    );
    if (!overlay) {
      return;
    }
    applyNoteSelection(overlay, selectedNoteIds);
    applyBeamSelection(overlay, selectedBeamId);
  }, [selectedNoteIds, selectedBeamId]);

  useEffect(() => {
    if (!import.meta.env.DEV) {
      return;
    }
    const w = window as Window & {
      __PHASE3_CLICK_PAGE__?: (x: number, y: number) => boolean;
    };
    w.__PHASE3_CLICK_PAGE__ = (x: number, y: number): boolean => {
      const svg = svgRef.current;
      const container = containerRef.current;
      if (!svg || !container) {
        return false;
      }
      const client = pageToClientCoords(svg, x, y);
      if (!client) {
        return false;
      }
      container.dispatchEvent(
        new MouseEvent('click', {
          bubbles: true,
          cancelable: true,
          clientX: client.x,
          clientY: client.y,
        }),
      );
      return true;
    };
    return () => {
      delete w.__PHASE3_CLICK_PAGE__;
    };
  }, []);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.shiftKey && svgRef.current) {
      e.preventDefault();
      const startData = zoom.startDrag(e.clientX, e.clientY);
      if (startData) {
        dragStartDataRef.current = startData;
        isDraggingRef.current = true;
        didPanRef.current = false;
      }
    }
  }, [zoom]);

  const handleClick = useCallback((e: React.MouseEvent) => {
    if (!onScoreClickRef.current) {
      return;
    }
    if (e.shiftKey || isDraggingRef.current || didPanRef.current) {
      didPanRef.current = false;
      return;
    }
    if (e.button !== 0) {
      return;
    }
    const svg = svgRef.current;
    if (!svg) {
      return;
    }
    const point = clientToPageCoords(svg, e.clientX, e.clientY);
    if (!point) {
      return;
    }
    const { width, height } = pageBounds(svg, imageDimensions);
    if (!width || !height) {
      return;
    }
    if (point.x <= 0 || point.x >= width || point.y <= 0 || point.y >= height) {
      return;
    }
    const selection = selectionFromEvent(e);
    onScoreClickRef.current({
      point,
      noteId: selection.noteId,
      beamId: selection.beamId,
      additive: e.metaKey || e.ctrlKey,
    });
  }, [imageDimensions]);

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (isDraggingRef.current && dragStartDataRef.current) {
      e.preventDefault();
      didPanRef.current = true;
      zoom.dragging(dragStartDataRef.current, e.clientX, e.clientY);
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

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    if (e.touches.length === 2 && svgRef.current) {
      e.preventDefault();
      const touch = e.touches[0];
      const startData = zoom.startDrag(touch.clientX, touch.clientY);
      if (startData) {
        dragStartDataRef.current = startData;
        isDraggingRef.current = true;
        didPanRef.current = false;
      }
    }
  }, [zoom]);

  const handleTouchMove = useCallback((e: TouchEvent) => {
    if (isDraggingRef.current && dragStartDataRef.current && e.touches.length === 2) {
      e.preventDefault();
      didPanRef.current = true;
      const touch = e.touches[0];
      zoom.dragging(dragStartDataRef.current, touch.clientX, touch.clientY);
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

  useEffect(() => {
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    document.addEventListener('touchmove', handleTouchMove);
    document.addEventListener('touchend', handleTouchEnd);

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
      onClick={handleClick}
      onTouchStart={handleTouchStart}
    />
  );
};

export default ImageViewer;
