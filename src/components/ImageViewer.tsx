import { useEffect, useRef, useState, useCallback } from 'react';
import { useZoom } from '../hooks/useZoom';
import { locToY, measureRenderedStaffs, yToLoc } from '../lib/schenker/geometry';
import { canDragSelectedBeam } from '../lib/schenker/beam';
import { canDragSelectedBarLine } from '../lib/schenker/barline';
import { canMoveSchenkerNote } from '../lib/schenker/move';
import { readSchenkerLabelMetadata } from '../lib/schenker/label';
import {
  applyLabelSelection,
  applyLabelSuppression,
  removeLabelPreview,
  renderLabelPreview,
  updateLabelPreviewInPlace,
  type LabelLocalDraft,
} from '../lib/schenker/labelDraft';
import { readSlurBezierFromMetadata, type SlurBezierPoints } from '../lib/schenker/slur';
import {
  buildSlurBezierPathD,
  SLUR_HANDLE_LABELS,
  updateSlurHandlePoint,
} from '../lib/schenker/slurHandles';

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
  /** xml:id of the nearest `.barLine` when a free-X barline is clicked. */
  barLineId: string | null;
  /** xml:id of the nearest `.slur` when the slur path is clicked. */
  slurId: string | null;
  /** xml:id of the nearest native `.dir` label when the label is clicked. */
  labelId: string | null;
  additive: boolean;
};

const SELECTED_NOTE_CLASS = 'selected-schenker-note';
const SELECTED_BEAM_CLASS = 'selected-schenker-beam';
const SELECTED_BARLINE_CLASS = 'selected-schenker-barline';
const SELECTED_SLUR_CLASS = 'selected-schenker-slur';
const SLUR_HANDLES_LAYER_ID = 'schenker-slur-handles';
const SLUR_PREVIEW_LAYER_ID = 'schenker-slur-preview';
const BEAM_HIDE_MARQUEE_ID = 'schenker-beam-hide-marquee';
const SHOW_SLUR_HANDLES = true;
const LABEL_DRAG_THRESHOLD = 5;
const BEAM_HIDE_DRAG_THRESHOLD = 5;

function noteIdInSelectedBeam(event: React.MouseEvent, selectedBeamId: string): string | null {
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
    const beam = note?.closest('.beam');
    if (note?.id && beam?.id === selectedBeamId) {
      return note.id;
    }
  }
  return null;
}

function selectionFromEvent(event: React.MouseEvent): {
  noteId: string | null;
  beamId: string | null;
  barLineId: string | null;
  slurId: string | null;
  labelId: string | null;
} {
  const candidates: Element[] = [];
  if (event.target instanceof Element) {
    candidates.push(event.target);
  }
  const fromPoint = document.elementFromPoint(event.clientX, event.clientY);
  if (fromPoint instanceof Element && !candidates.includes(fromPoint)) {
    candidates.push(fromPoint);
  }
  for (const el of candidates) {
    const slur = el.closest('.slur');
    if (slur?.id && (el.tagName === 'path' || el.closest('.slur') === slur)) {
      return { noteId: null, beamId: null, barLineId: null, slurId: slur.id, labelId: null };
    }
    const dir = el.closest('.dir');
    if (dir?.id) {
      return { noteId: null, beamId: null, barLineId: null, slurId: null, labelId: dir.id };
    }
    // Beam bar / drag hit before notes: note bounding-boxes otherwise swallow the bar.
    const beamFromHit = beamIdFromDragHit(el);
    if (beamFromHit) {
      return { noteId: null, beamId: beamFromHit, barLineId: null, slurId: null, labelId: null };
    }
    if (isBeamBarGraphic(el)) {
      const beam = el.closest('.beam');
      if (beam?.id) {
        return { noteId: null, beamId: beam.id, barLineId: null, slurId: null, labelId: null };
      }
    }
    // Keep a selected beam sticky: presses on its stems stay on the beam so
    // drag can start (and click does not flip selection to a child note).
    const selectedBeam = el.closest(`.beam.${SELECTED_BEAM_CLASS}`);
    if (selectedBeam?.id) {
      return { noteId: null, beamId: selectedBeam.id, barLineId: null, slurId: null, labelId: null };
    }
    const barLine = el.closest('.barLine');
    if (barLine?.id) {
      return { noteId: null, beamId: null, barLineId: barLine.id, slurId: null, labelId: null };
    }
    const note = el.closest('.note');
    if (note?.id) {
      return { noteId: note.id, beamId: null, barLineId: null, slurId: null, labelId: null };
    }
    const beam = el.closest('.beam');
    if (beam?.id) {
      return { noteId: null, beamId: beam.id, barLineId: null, slurId: null, labelId: null };
    }
  }
  return { noteId: null, beamId: null, barLineId: null, slurId: null, labelId: null };
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

function applyBarLineSelection(overlay: SVGSVGElement, selectedBarLineId: string | null): void {
  overlay.querySelectorAll(`.barLine.${SELECTED_BARLINE_CLASS}`).forEach((barLine) => {
    barLine.classList.remove(SELECTED_BARLINE_CLASS, 'selected');
  });
  if (!selectedBarLineId) {
    return;
  }
  const barLine = overlay.querySelector(`#${CSS.escape(selectedBarLineId)}.barLine`);
  if (barLine) {
    barLine.classList.add(SELECTED_BARLINE_CLASS, 'selected');
  }
}

function applySlurSelection(overlay: SVGSVGElement, selectedSlurId: string | null): void {
  overlay.querySelectorAll(`.slur.${SELECTED_SLUR_CLASS}`).forEach((slur) => {
    slur.classList.remove(SELECTED_SLUR_CLASS, 'selected');
  });
  if (!selectedSlurId) {
    return;
  }
  const slur = overlay.querySelector(`#${CSS.escape(selectedSlurId)}.slur`);
  if (slur) {
    slur.classList.add(SELECTED_SLUR_CLASS, 'selected');
  }
}

type SlurLocalDraft = {
  slurId: string;
  points: SlurBezierPoints;
};

function removeSlurPreview(overlay: SVGSVGElement): void {
  overlay.querySelector(`#${SLUR_PREVIEW_LAYER_ID}`)?.remove();
}

function renderSlurPreview(overlay: SVGSVGElement, points: SlurBezierPoints): void {
  removeSlurPreview(overlay);
  const pageMargin = overlay.querySelector<SVGGElement>('.page-margin');
  if (!pageMargin) {
    return;
  }
  const layer = document.createElementNS('http://www.w3.org/2000/svg', 'g');
  layer.id = SLUR_PREVIEW_LAYER_ID;
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', buildSlurBezierPathD(points));
  path.classList.add('schenker-slur-preview');
  layer.appendChild(path);
  pageMargin.appendChild(layer);
}

function applySlurSuppression(overlay: SVGSVGElement, slurId: string | null, suppressed: boolean): void {
  overlay.querySelectorAll('.slur.schenker-slur-suppressed').forEach((slur) => {
    slur.classList.remove('schenker-slur-suppressed');
  });
  if (!suppressed || !slurId) {
    return;
  }
  const slur = overlay.querySelector(`#${CSS.escape(slurId)}.slur`);
  slur?.classList.add('schenker-slur-suppressed');
}

function activeSlurPoints(
  overlay: SVGSVGElement,
  slurId: string,
  localDraft: SlurLocalDraft | null,
): SlurBezierPoints | null {
  if (localDraft?.slurId === slurId) {
    return localDraft.points;
  }
  return readSlurBezierFromMetadata(overlay, slurId);
}

function removeSlurHandles(overlay: SVGSVGElement): void {
  overlay.querySelector(`#${SLUR_HANDLES_LAYER_ID}`)?.remove();
}

function renderSlurHandles(
  overlay: SVGSVGElement,
  points: SlurBezierPoints,
  onHandlePointerDown: (index: number, event: PointerEvent) => void,
): void {
  removeSlurHandles(overlay);
  const pageMargin = overlay.querySelector<SVGGElement>('.page-margin');
  if (!pageMargin) {
    return;
  }

  const layer = document.createElementNS('http://www.w3.org/2000/svg', 'g');
  layer.id = SLUR_HANDLES_LAYER_ID;

  const addLine = (from: ScorePoint, to: ScorePoint) => {
    const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    line.setAttribute('x1', String(from.x));
    line.setAttribute('y1', String(from.y));
    line.setAttribute('x2', String(to.x));
    line.setAttribute('y2', String(to.y));
    line.classList.add('schenker-slur-handle-line');
    layer.appendChild(line);
  };

  addLine(points[0], points[1]);
  addLine(points[2], points[3]);

  const radius = SLUR_HANDLE_RADIUS;
  points.forEach((point, index) => {
    const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    circle.setAttribute('cx', String(point.x));
    circle.setAttribute('cy', String(point.y));
    circle.setAttribute('r', String(radius));
    circle.classList.add('schenker-slur-handle');
    circle.dataset.handleIndex = String(index);
    circle.addEventListener('pointerdown', (event) => {
      event.stopPropagation();
      onHandlePointerDown(index, event);
    });
    layer.appendChild(circle);

    const label = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    label.setAttribute('x', String(point.x + radius + 12));
    label.setAttribute('y', String(point.y - radius - 6));
    label.classList.add('schenker-slur-handle-label');
    label.textContent = SLUR_HANDLE_LABELS[index];
    layer.appendChild(label);
  });

  pageMargin.appendChild(layer);
}

const SLUR_HANDLE_RADIUS = 18;

function updateSlurPreviewPath(overlay: SVGSVGElement, points: SlurBezierPoints): void {
  const path = overlay.querySelector<SVGPathElement>(`#${SLUR_PREVIEW_LAYER_ID} path`);
  if (path) {
    path.setAttribute('d', buildSlurBezierPathD(points));
    return;
  }
  renderSlurPreview(overlay, points);
}

function updateSlurHandlesInPlace(overlay: SVGSVGElement, points: SlurBezierPoints): void {
  const layer = overlay.querySelector<SVGGElement>(`#${SLUR_HANDLES_LAYER_ID}`);
  if (!layer) {
    return;
  }
  const lines = layer.querySelectorAll<SVGLineElement>('line.schenker-slur-handle-line');
  if (lines.length >= 2) {
    lines[0].setAttribute('x1', String(points[0].x));
    lines[0].setAttribute('y1', String(points[0].y));
    lines[0].setAttribute('x2', String(points[1].x));
    lines[0].setAttribute('y2', String(points[1].y));
    lines[1].setAttribute('x1', String(points[2].x));
    lines[1].setAttribute('y1', String(points[2].y));
    lines[1].setAttribute('x2', String(points[3].x));
    lines[1].setAttribute('y2', String(points[3].y));
  }
  const circles = layer.querySelectorAll<SVGCircleElement>('circle.schenker-slur-handle');
  const labels = layer.querySelectorAll<SVGTextElement>('text.schenker-slur-handle-label');
  points.forEach((point, index) => {
    const circle = circles[index];
    const label = labels[index];
    if (circle) {
      circle.setAttribute('cx', String(point.x));
      circle.setAttribute('cy', String(point.y));
    }
    if (label) {
      label.setAttribute('x', String(point.x + SLUR_HANDLE_RADIUS + 12));
      label.setAttribute('y', String(point.y - SLUR_HANDLE_RADIUS - 6));
    }
  });
}

function removeBeamHideMarquee(overlay: SVGSVGElement | null): void {
  overlay?.querySelector(`#${BEAM_HIDE_MARQUEE_ID}`)?.remove();
}

function upsertBeamHideMarquee(
  overlay: SVGSVGElement,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
): void {
  const pageMargin =
    overlay.querySelector<SVGGElement>('.definition-scale .page-margin') ||
    overlay.querySelector<SVGGElement>('.page-margin');
  if (!pageMargin) {
    return;
  }
  let rect = overlay.querySelector<SVGRectElement>(`#${BEAM_HIDE_MARQUEE_ID}`);
  if (!rect) {
    rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    rect.setAttribute('id', BEAM_HIDE_MARQUEE_ID);
    rect.setAttribute('class', 'schenker-beam-hide-marquee');
    rect.setAttribute('pointer-events', 'none');
    pageMargin.appendChild(rect);
  }
  const left = Math.min(x0, x1);
  const top = Math.min(y0, y1);
  const width = Math.abs(x1 - x0);
  const height = Math.abs(y1 - y0);
  rect.setAttribute('x', String(left));
  rect.setAttribute('y', String(top));
  rect.setAttribute('width', String(width));
  rect.setAttribute('height', String(height));
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

function clientCenter(el: Element): ScorePoint {
  const rect = el.getBoundingClientRect();
  return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
}

function noteheadGraphic(note: SVGGElement): SVGGraphicsElement {
  return (
    note.querySelector<SVGGraphicsElement>('.notehead') ||
    note.querySelector<SVGGraphicsElement>('use') ||
    note
  );
}

/** Map a client-pixel point into the user space of `parent` (the space of a child's SVG transform). */
function clientToParentUser(
  parent: SVGGraphicsElement,
  clientX: number,
  clientY: number,
): ScorePoint | null {
  const ctm = parent.getScreenCTM();
  if (!ctm) {
    return null;
  }
  const pt = new DOMPoint(clientX, clientY).matrixTransform(ctm.inverse());
  return { x: pt.x, y: pt.y };
}

function applyNoteDragPreview(
  note: SVGGElement,
  origTransform: string,
  origHeadClient: ScorePoint,
  targetClient: ScorePoint,
): void {
  const parent = note.parentNode;
  if (!(parent instanceof SVGGraphicsElement)) {
    return;
  }
  const from = clientToParentUser(parent, origHeadClient.x, origHeadClient.y);
  const to = clientToParentUser(parent, targetClient.x, targetClient.y);
  if (!from || !to) {
    return;
  }
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  note.setAttribute('transform', origTransform ? `translate(${dx} ${dy}) ${origTransform}` : `translate(${dx} ${dy})`);
}

function applyBarLineDragPreview(barLine: SVGGElement, dx: number): void {
  if (dx === 0) {
    barLine.removeAttribute('transform');
  } else {
    barLine.setAttribute('transform', `translate(${dx} 0)`);
  }
}

function clearBarLineDragPreview(barLine: SVGGElement): void {
  barLine.removeAttribute('transform');
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
const NOTE_DRAG_THRESHOLD = 5;
const BEAM_DRAG_THRESHOLD = 5;
const BARLINE_DRAG_THRESHOLD = 5;
const BEAM_DRAG_HIT_CLASS = 'schenker-beam-drag-hit';
/** Extra stroke width (page units) so the beam bar is easy to grab like a window edge. */
const BEAM_DRAG_HIT_STROKE = 72;

function beamIdContainingTarget(target: EventTarget | null): string | null {
  const el = target instanceof Element ? target : null;
  if (!el) {
    return null;
  }
  const fromHit = el.closest(`.${BEAM_DRAG_HIT_CLASS}`);
  if (fromHit) {
    return fromHit.closest('.beam')?.id || null;
  }
  return el.closest('.beam')?.id || null;
}

function beamIdFromDragHit(el: Element): string | null {
  const hit = el.closest(`.${BEAM_DRAG_HIT_CLASS}`);
  return hit?.closest('.beam')?.id || null;
}

function isBeamBarGraphic(el: Element): boolean {
  if (el.tagName !== 'polygon' && el.tagName !== 'path') {
    return false;
  }
  const beam = el.closest('.beam');
  return Boolean(beam && el.parentElement === beam && !el.classList.contains(BEAM_DRAG_HIT_CLASS));
}

function clearBeamDragHitTargets(overlay: SVGSVGElement | SVGGElement): void {
  overlay.querySelectorAll(`.${BEAM_DRAG_HIT_CLASS}`).forEach((node) => node.remove());
}

function syncBeamDragHitTargets(overlay: SVGSVGElement): void {
  clearBeamDragHitTargets(overlay);
  overlay.querySelectorAll<SVGGElement>('g.beam').forEach((beam) => {
    const polys = beam.querySelectorAll<SVGPolygonElement>(':scope > polygon');
    polys.forEach((poly) => {
      if (poly.classList.contains(BEAM_DRAG_HIT_CLASS)) {
        return;
      }
      const hit = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
      hit.setAttribute('points', poly.getAttribute('points') || '');
      hit.classList.add(BEAM_DRAG_HIT_CLASS);
      hit.setAttribute('fill', 'transparent');
      hit.setAttribute('stroke', 'transparent');
      hit.setAttribute('stroke-width', String(BEAM_DRAG_HIT_STROKE));
      // fill + thick stroke so the thin bar and a window-edge halo are both grabbable
      hit.setAttribute('pointer-events', 'all');
      beam.appendChild(hit);
    });
  });
}

function beamBarCenterY(beam: SVGGElement): number {
  let sum = 0;
  let count = 0;
  beam.querySelectorAll<SVGPolygonElement>(':scope > polygon').forEach((poly) => {
    if (poly.classList.contains(BEAM_DRAG_HIT_CLASS)) {
      return;
    }
    const raw = poly.getAttribute('points') || '';
    const nums = raw.trim().split(/[\s,]+/).map(Number).filter((n) => Number.isFinite(n));
    for (let i = 1; i < nums.length; i += 2) {
      sum += nums[i];
      count += 1;
    }
  });
  return count ? sum / count : 0;
}

function applyBeamDragPreview(beam: SVGGElement, dy: number): void {
  beam.querySelectorAll<SVGPolygonElement>(':scope > polygon').forEach((poly) => {
    if (dy === 0) {
      poly.removeAttribute('transform');
    } else {
      poly.setAttribute('transform', `translate(0 ${dy})`);
    }
  });
  // Ignore drag-hit clones when locating the visual bar.
  const barY = beamBarCenterY(beam);
  beam.querySelectorAll<SVGLineElement>('.stem line').forEach((line) => {
    if (!line.hasAttribute('data-beam-drag-y1')) {
      line.setAttribute('data-beam-drag-y1', line.getAttribute('y1') || '0');
      line.setAttribute('data-beam-drag-y2', line.getAttribute('y2') || '0');
    }
    const o1 = Number(line.getAttribute('data-beam-drag-y1'));
    const o2 = Number(line.getAttribute('data-beam-drag-y2'));
    // Tip is the stem end closer to the beam bar (works for stem-up and stem-down).
    const tipIsY1 = Math.abs(o1 - barY) <= Math.abs(o2 - barY);
    if (tipIsY1) {
      line.setAttribute('y1', String(o1 + dy));
      line.setAttribute('y2', String(o2));
    } else {
      line.setAttribute('y1', String(o1));
      line.setAttribute('y2', String(o2 + dy));
    }
  });
}

function clearBeamDragPreview(beam: SVGGElement): void {
  beam.querySelectorAll<SVGPolygonElement>(':scope > polygon').forEach((poly) => {
    poly.removeAttribute('transform');
  });
  beam.querySelectorAll<SVGLineElement>('.stem line').forEach((line) => {
    if (!line.hasAttribute('data-beam-drag-y1')) {
      return;
    }
    line.setAttribute('y1', line.getAttribute('data-beam-drag-y1') || '0');
    line.setAttribute('y2', line.getAttribute('data-beam-drag-y2') || '0');
    line.removeAttribute('data-beam-drag-y1');
    line.removeAttribute('data-beam-drag-y2');
  });
}

/**
 * Resolve which selected beam (if any) should start a stem-length drag.
 * Prefer an explicit bar/hit target; also allow stems/notes inside the
 * already-selected beam so the drag does not require a pixel-perfect grab.
 */
function resolveBeamDragId(
  target: EventTarget | null,
  selectionBeamId: string | null,
  selectedBeamId: string | null,
): string | null {
  if (!selectedBeamId) {
    return null;
  }
  const hitId = beamIdContainingTarget(target) || selectionBeamId;
  return hitId === selectedBeamId ? selectedBeamId : null;
}

const ImageViewer: React.FC<{
  imagePath?: string;
  meiSvg?: string | null;
  selectedNoteIds?: string[];
  selectedBeamId?: string | null;
  selectedBarLineId?: string | null;
  selectedSlurId?: string | null;
  selectedLabelId?: string | null;
  onScoreClick?: (hit: ScoreHit) => void;
  onSlurCurveCommit?: (slurId: string, points: SlurBezierPoints) => void;
  onNoteMoveCommit?: (noteId: string, loc: number, schenkerX: number) => void;
  onBarLineMoveCommit?: (barLineId: string, schenkerX: number) => void;
  onBeamStemCommit?: (
    beamId: string,
    from: ScorePoint,
    to: ScorePoint,
  ) => void;
  onBeamHideCommit?: (beamId: string, fromX: number, toX: number) => void;
  onBeamPolishCommit?: (beamId: string, x: number, noteId?: string | null) => void;
  onLabelOffsetCommit?: (
    labelId: string,
    from: ScorePoint,
    to: ScorePoint,
  ) => void;
  noteDragEnabled?: boolean;
  beamHideArmed?: boolean;
  beamPolishArmed?: boolean;
  onZoomReady?: (zoom: ReturnType<typeof useZoom>) => void;
}> = ({
  imagePath = '/SK-001.png',
  meiSvg = null,
  selectedNoteIds = [],
  selectedBeamId = null,
  selectedBarLineId = null,
  selectedSlurId = null,
  selectedLabelId = null,
  onScoreClick,
  onSlurCurveCommit,
  onNoteMoveCommit,
  onBarLineMoveCommit,
  onBeamStemCommit,
  onBeamHideCommit,
  onBeamPolishCommit,
  onLabelOffsetCommit,
  noteDragEnabled = false,
  beamHideArmed = false,
  beamPolishArmed = false,
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
  const selectedBarLineIdRef = useRef(selectedBarLineId);
  selectedBarLineIdRef.current = selectedBarLineId;
  const selectedSlurIdRef = useRef(selectedSlurId);
  selectedSlurIdRef.current = selectedSlurId;
  const selectedLabelIdRef = useRef(selectedLabelId);
  selectedLabelIdRef.current = selectedLabelId;
  const slurLocalDraftRef = useRef<SlurLocalDraft | null>(null);
  const [slurLocalDraft, setSlurLocalDraftState] = useState<SlurLocalDraft | null>(null);
  const slurDragRef = useRef<{ handleIndex: number; points: SlurBezierPoints } | null>(null);
  const slurDidDragRef = useRef(false);
  const onSlurCurveCommitRef = useRef(onSlurCurveCommit);
  onSlurCurveCommitRef.current = onSlurCurveCommit;
  const onNoteMoveCommitRef = useRef(onNoteMoveCommit);
  onNoteMoveCommitRef.current = onNoteMoveCommit;
  const onBarLineMoveCommitRef = useRef(onBarLineMoveCommit);
  onBarLineMoveCommitRef.current = onBarLineMoveCommit;
  const onBeamStemCommitRef = useRef(onBeamStemCommit);
  onBeamStemCommitRef.current = onBeamStemCommit;
  const onBeamHideCommitRef = useRef(onBeamHideCommit);
  onBeamHideCommitRef.current = onBeamHideCommit;
  const onBeamPolishCommitRef = useRef(onBeamPolishCommit);
  onBeamPolishCommitRef.current = onBeamPolishCommit;
  const onLabelOffsetCommitRef = useRef(onLabelOffsetCommit);
  onLabelOffsetCommitRef.current = onLabelOffsetCommit;
  const noteDragEnabledRef = useRef(noteDragEnabled);
  noteDragEnabledRef.current = noteDragEnabled;
  const beamHideArmedRef = useRef(beamHideArmed);
  beamHideArmedRef.current = beamHideArmed;
  const beamPolishArmedRef = useRef(beamPolishArmed);
  beamPolishArmedRef.current = beamPolishArmed;
  const noteDragRef = useRef<{
    noteId: string;
    staffId: string;
    origTransform: string;
    origHeadClient: ScorePoint;
    startX: number;
    startY: number;
  } | null>(null);
  const noteDidDragRef = useRef(false);
  const barLineDragRef = useRef<{
    barLineId: string;
    startX: number;
    startY: number;
    dx: number;
  } | null>(null);
  const barLineDidDragRef = useRef(false);
  const beamDragRef = useRef<{
    beamId: string;
    startX: number;
    startY: number;
    dy: number;
  } | null>(null);
  const beamDidDragRef = useRef(false);
  const beamHideDragRef = useRef<{
    beamId: string;
    startX: number;
    startY: number;
    endX: number;
    endY: number;
  } | null>(null);
  const beamHideDidDragRef = useRef(false);
  const labelLocalDraftRef = useRef<LabelLocalDraft | null>(null);
  const [labelLocalDraft, setLabelLocalDraftState] = useState<LabelLocalDraft | null>(null);
  const labelDragRef = useRef<{
    labelId: string;
    grabDx: number;
    grabDy: number;
    fromX: number;
    fromY: number;
  } | null>(null);
  const labelDidDragRef = useRef(false);

  const setSlurLocalDraft = useCallback((draft: SlurLocalDraft | null) => {
    slurLocalDraftRef.current = draft;
    setSlurLocalDraftState(draft);
  }, []);

  const setLabelLocalDraft = useCallback((draft: LabelLocalDraft | null) => {
    labelLocalDraftRef.current = draft;
    setLabelLocalDraftState(draft);
  }, []);

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

    syncBeamDragHitTargets(overlay);
    applyNoteSelection(overlay, selectedNoteIdsRef.current);
    applyBeamSelection(overlay, selectedBeamIdRef.current);
    applyBarLineSelection(overlay, selectedBarLineIdRef.current);
    applySlurSelection(overlay, selectedSlurIdRef.current);
    applyLabelSelection(overlay, selectedLabelIdRef.current);

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
    applyBarLineSelection(overlay, selectedBarLineId);
    applySlurSelection(overlay, selectedSlurId);
    applyLabelSelection(overlay, selectedLabelId);
    overlay.classList.toggle('schenker-beam-hide-armed', Boolean(beamHideArmed && selectedBeamId));
    overlay.classList.toggle('schenker-beam-polish-armed', Boolean(beamPolishArmed && selectedBeamId));
    if (!beamHideArmed) {
      removeBeamHideMarquee(overlay);
      beamHideDragRef.current = null;
      beamHideDidDragRef.current = false;
    }
  }, [
    selectedNoteIds,
    selectedBeamId,
    selectedBarLineId,
    selectedSlurId,
    selectedLabelId,
    beamHideArmed,
    beamPolishArmed,
  ]);

  const syncSlurEditorLayer = useCallback(() => {
    const overlay = svgRef.current?.querySelector<SVGSVGElement>('.neon-container.active-page');
    if (!overlay) {
      return;
    }
    if (!SHOW_SLUR_HANDLES) {
      removeSlurHandles(overlay);
      removeSlurPreview(overlay);
      applySlurSuppression(overlay, null, false);
      return;
    }
    const slurId = selectedSlurIdRef.current;
    const draft = slurLocalDraftRef.current;
    const isDragging = slurDragRef.current !== null;
    const hasDraft = Boolean(slurId && draft?.slurId === slurId);
    const points = slurId ? activeSlurPoints(overlay, slurId, draft) : null;

    applySlurSuppression(overlay, slurId, hasDraft);

    if (!slurId || !points) {
      removeSlurHandles(overlay);
      removeSlurPreview(overlay);
      return;
    }

    if (hasDraft) {
      if (isDragging) {
        updateSlurPreviewPath(overlay, points);
      } else {
        renderSlurPreview(overlay, points);
      }
    } else {
      removeSlurPreview(overlay);
    }

    const onHandlePointerDown = (handleIndex: number, event: PointerEvent) => {
      const currentSlurId = selectedSlurIdRef.current;
      if (!currentSlurId) {
        return;
      }
      const currentPoints = activeSlurPoints(overlay, currentSlurId, slurLocalDraftRef.current);
      if (!currentPoints) {
        return;
      }
      event.preventDefault();
      slurDidDragRef.current = false;
      slurDragRef.current = {
        handleIndex,
        points: currentPoints.map((point) => ({ ...point })) as SlurBezierPoints,
      };
      (event.currentTarget as Element).setPointerCapture(event.pointerId);
    };

    if (isDragging) {
      updateSlurHandlesInPlace(overlay, points);
      return;
    }

    renderSlurHandles(overlay, points, onHandlePointerDown);
  }, [setSlurLocalDraft, slurLocalDraft]);

  useEffect(() => {
    syncSlurEditorLayer();
  }, [syncSlurEditorLayer, selectedSlurId, slurLocalDraft, meiSvg]);

  // Drop local guide when selection changes or Verovio delivers a new SVG
  // (runtime geometry is now in the rendered slur).
  useEffect(() => {
    setSlurLocalDraft(null);
    slurDragRef.current = null;
    slurDidDragRef.current = false;
  }, [selectedSlurId, setSlurLocalDraft]);

  useEffect(() => {
    if (slurDragRef.current) {
      return;
    }
    setSlurLocalDraft(null);
  }, [meiSvg, setSlurLocalDraft]);

  const syncLabelEditorLayer = useCallback(() => {
    const overlay = svgRef.current?.querySelector<SVGSVGElement>('.neon-container.active-page');
    if (!overlay) {
      return;
    }
    const labelId = selectedLabelIdRef.current;
    const draft = labelLocalDraftRef.current;
    const isDragging = labelDragRef.current !== null;
    const hasDraft = Boolean(labelId && draft?.labelId === labelId);

    applyLabelSuppression(overlay, labelId, hasDraft);

    if (!labelId || !hasDraft || !draft) {
      removeLabelPreview(overlay);
      return;
    }

    if (isDragging) {
      updateLabelPreviewInPlace(overlay, draft);
    } else {
      renderLabelPreview(overlay, draft);
    }
  }, [labelLocalDraft]);

  useEffect(() => {
    syncLabelEditorLayer();
  }, [syncLabelEditorLayer, selectedLabelId, labelLocalDraft, meiSvg]);

  useEffect(() => {
    setLabelLocalDraft(null);
    labelDragRef.current = null;
    labelDidDragRef.current = false;
  }, [selectedLabelId, setLabelLocalDraft]);

  useEffect(() => {
    if (labelDragRef.current) {
      return;
    }
    setLabelLocalDraft(null);
  }, [meiSvg, setLabelLocalDraft]);

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
      return;
    }
    if (e.button !== 0 || !svgRef.current) {
      return;
    }
    if (!noteDragEnabledRef.current) {
      return;
    }
    const overlay = svgRef.current.querySelector<SVGSVGElement>('.neon-container.active-page');
    const selection = selectionFromEvent(e);
    if (!overlay) {
      return;
    }
    // Hide-beam mode: drag a box; X range chops the selected beam segment.
    if (beamHideArmedRef.current && selectedBeamIdRef.current) {
      const point = clientToPageCoords(svgRef.current, e.clientX, e.clientY);
      if (!point) {
        return;
      }
      e.preventDefault();
      beamHideDidDragRef.current = false;
      beamHideDragRef.current = {
        beamId: selectedBeamIdRef.current,
        startX: point.x,
        startY: point.y,
        endX: point.x,
        endY: point.y,
      };
      removeBeamHideMarquee(overlay);
      upsertBeamHideMarquee(overlay, point.x, point.y, point.x, point.y);
      return;
    }
    // Polish-vertex mode: wait for click (handled in handleClick); do not start stem drag.
    if (beamPolishArmedRef.current && selectedBeamIdRef.current) {
      return;
    }
    const hitBeamId = resolveBeamDragId(
      e.target,
      selection.beamId,
      selectedBeamIdRef.current,
    );
    if (canDragSelectedBeam(overlay, selectedBeamIdRef.current, hitBeamId)) {
      const point = clientToPageCoords(svgRef.current, e.clientX, e.clientY);
      if (!point || !hitBeamId) {
        return;
      }
      e.preventDefault();
      beamDidDragRef.current = false;
      beamDragRef.current = {
        beamId: hitBeamId,
        startX: point.x,
        startY: point.y,
        dy: 0,
      };
      return;
    }
    const hitBarLineId = selection.barLineId;
    if (canDragSelectedBarLine(overlay, selectedBarLineIdRef.current, hitBarLineId)) {
      const point = clientToPageCoords(svgRef.current, e.clientX, e.clientY);
      if (!point || !hitBarLineId) {
        return;
      }
      e.preventDefault();
      barLineDidDragRef.current = false;
      barLineDragRef.current = {
        barLineId: hitBarLineId,
        startX: point.x,
        startY: point.y,
        dx: 0,
      };
      return;
    }
    if (selection.labelId && selectedLabelIdRef.current === selection.labelId) {
      const point = clientToPageCoords(svgRef.current, e.clientX, e.clientY);
      const meta = readSchenkerLabelMetadata(overlay, selection.labelId);
      const current =
        labelLocalDraftRef.current?.labelId === selection.labelId
          ? labelLocalDraftRef.current
          : meta
            ? { labelId: selection.labelId, x: meta.label.x, y: meta.label.y }
            : null;
      if (!point || !current) {
        return;
      }
      labelDidDragRef.current = false;
      labelDragRef.current = {
        labelId: selection.labelId,
        grabDx: current.x - point.x,
        grabDy: current.y - point.y,
        fromX: current.x,
        fromY: current.y,
      };
      return;
    }
    if (!selection.noteId) {
      return;
    }
    if (!canMoveSchenkerNote(overlay, selectedNoteIdsRef.current, selection.noteId)) {
      return;
    }
    const note = overlay.querySelector<SVGGElement>(`#${CSS.escape(selection.noteId)}.note`);
    const staff = note?.closest<SVGGElement>('.staff');
    const point = clientToPageCoords(svgRef.current, e.clientX, e.clientY);
    if (!note || !staff?.id || !point) {
      return;
    }
    noteDidDragRef.current = false;
    noteDragRef.current = {
      noteId: selection.noteId,
      staffId: staff.id,
      origTransform: note.getAttribute('transform') || '',
      origHeadClient: clientCenter(noteheadGraphic(note)),
      startX: point.x,
      startY: point.y,
    };
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
    if (e.target instanceof Element && e.target.closest('.schenker-slur-handle')) {
      return;
    }
    if (slurDidDragRef.current) {
      slurDidDragRef.current = false;
      return;
    }
    if (labelDidDragRef.current) {
      labelDidDragRef.current = false;
      return;
    }
    if (noteDidDragRef.current) {
      noteDidDragRef.current = false;
      return;
    }
    if (barLineDidDragRef.current) {
      barLineDidDragRef.current = false;
      return;
    }
    if (beamDidDragRef.current) {
      beamDidDragRef.current = false;
      return;
    }
    if (beamHideDidDragRef.current) {
      beamHideDidDragRef.current = false;
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
    if (beamPolishArmedRef.current && selectedBeamIdRef.current) {
      const noteId = noteIdInSelectedBeam(e, selectedBeamIdRef.current);
      onBeamPolishCommitRef.current?.(selectedBeamIdRef.current, point.x, noteId);
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
      barLineId: selection.barLineId,
      slurId: selection.slurId,
      labelId: selection.labelId,
      additive: e.metaKey || e.ctrlKey,
    });
  }, [imageDimensions]);

  const handleSlurPointerMove = useCallback((event: PointerEvent) => {
    const drag = slurDragRef.current;
    const slurId = selectedSlurIdRef.current;
    const svg = svgRef.current;
    if (!drag || !slurId || !svg) {
      return;
    }
    const point = clientToPageCoords(svg, event.clientX, event.clientY);
    if (!point) {
      return;
    }
    event.preventDefault();
    slurDidDragRef.current = true;
    const nextPoints = updateSlurHandlePoint(drag.points, drag.handleIndex, point.x, point.y);
    slurDragRef.current = { ...drag, points: nextPoints };
    setSlurLocalDraft({ slurId, points: nextPoints });
  }, [setSlurLocalDraft]);

  const handleSlurPointerUp = useCallback((event: PointerEvent) => {
    const drag = slurDragRef.current;
    if (!drag) {
      return;
    }
    const slurId = selectedSlurIdRef.current;
    const svg = svgRef.current;
    let points = drag.points;
    if (slurId && svg) {
      const point = clientToPageCoords(svg, event.clientX, event.clientY);
      if (point) {
        points = updateSlurHandlePoint(drag.points, drag.handleIndex, point.x, point.y);
      }
    }
    slurDragRef.current = null;
    event.preventDefault();

    if (!slurDidDragRef.current || !slurId) {
      return;
    }

    // Keep the local guide until the new Verovio SVG arrives (meiSvg effect).
    setSlurLocalDraft({ slurId, points });
    onSlurCurveCommitRef.current?.(slurId, points);
  }, [setSlurLocalDraft]);

  const handleMouseMove = useCallback((e: MouseEvent) => {
    const beamHideDrag = beamHideDragRef.current;
    if (beamHideDrag && svgRef.current) {
      const overlay = svgRef.current.querySelector<SVGSVGElement>('.neon-container.active-page');
      const point = clientToPageCoords(svgRef.current, e.clientX, e.clientY);
      if (!overlay || !point) {
        return;
      }
      const moved = Math.hypot(point.x - beamHideDrag.startX, point.y - beamHideDrag.startY);
      if (moved >= BEAM_HIDE_DRAG_THRESHOLD) {
        beamHideDidDragRef.current = true;
      }
      if (!beamHideDidDragRef.current) {
        return;
      }
      e.preventDefault();
      document.body.style.cursor = 'crosshair';
      beamHideDragRef.current = { ...beamHideDrag, endX: point.x, endY: point.y };
      upsertBeamHideMarquee(
        overlay,
        beamHideDrag.startX,
        beamHideDrag.startY,
        point.x,
        point.y,
      );
      return;
    }
    const labelDrag = labelDragRef.current;
    if (labelDrag && svgRef.current) {
      const overlay = svgRef.current.querySelector<SVGSVGElement>('.neon-container.active-page');
      const point = clientToPageCoords(svgRef.current, e.clientX, e.clientY);
      if (!overlay || !point) {
        return;
      }
      const next = {
        labelId: labelDrag.labelId,
        x: point.x + labelDrag.grabDx,
        y: point.y + labelDrag.grabDy,
      };
      const moved = Math.hypot(next.x - labelDrag.fromX, next.y - labelDrag.fromY);
      if (moved >= LABEL_DRAG_THRESHOLD) {
        labelDidDragRef.current = true;
      }
      if (!labelDidDragRef.current) {
        return;
      }
      e.preventDefault();
      setLabelLocalDraft(next);
      return;
    }
    const beamDrag = beamDragRef.current;
    if (beamDrag && svgRef.current) {
      const overlay = svgRef.current.querySelector<SVGSVGElement>('.neon-container.active-page');
      const beam = overlay?.querySelector<SVGGElement>(`#${CSS.escape(beamDrag.beamId)}.beam`);
      const point = clientToPageCoords(svgRef.current, e.clientX, e.clientY);
      if (!beam || !point) {
        return;
      }
      const dy = point.y - beamDrag.startY;
      const moved = Math.hypot(point.x - beamDrag.startX, dy);
      if (moved >= BEAM_DRAG_THRESHOLD) {
        beamDidDragRef.current = true;
      }
      if (!beamDidDragRef.current) {
        return;
      }
      e.preventDefault();
      document.body.style.cursor = 'ns-resize';
      beamDragRef.current = { ...beamDrag, dy };
      applyBeamDragPreview(beam, dy);
      return;
    }
    const barLineDrag = barLineDragRef.current;
    if (barLineDrag && svgRef.current) {
      const overlay = svgRef.current.querySelector<SVGSVGElement>('.neon-container.active-page');
      const barLine = overlay?.querySelector<SVGGElement>(
        `#${CSS.escape(barLineDrag.barLineId)}.barLine`,
      );
      const point = clientToPageCoords(svgRef.current, e.clientX, e.clientY);
      if (!barLine || !point) {
        return;
      }
      const dx = point.x - barLineDrag.startX;
      const moved = Math.hypot(dx, point.y - barLineDrag.startY);
      if (moved >= BARLINE_DRAG_THRESHOLD) {
        barLineDidDragRef.current = true;
      }
      if (!barLineDidDragRef.current) {
        return;
      }
      e.preventDefault();
      document.body.style.cursor = 'ew-resize';
      barLineDragRef.current = { ...barLineDrag, dx };
      applyBarLineDragPreview(barLine, dx);
      return;
    }
    const noteDrag = noteDragRef.current;
    if (noteDrag && svgRef.current) {
      const overlay = svgRef.current.querySelector<SVGSVGElement>('.neon-container.active-page');
      const note = overlay?.querySelector<SVGGElement>(`#${CSS.escape(noteDrag.noteId)}.note`);
      const staff = overlay?.querySelector<SVGGElement>(`#${CSS.escape(noteDrag.staffId)}.staff`);
      const point = clientToPageCoords(svgRef.current, e.clientX, e.clientY);
      if (!note || !staff || !point) {
        return;
      }
      const moved = Math.hypot(point.x - noteDrag.startX, point.y - noteDrag.startY);
      if (moved >= NOTE_DRAG_THRESHOLD) {
        noteDidDragRef.current = true;
      }
      if (!noteDidDragRef.current) {
        return;
      }
      e.preventDefault();
      const loc = yToLoc(point.y, staff);
      const snappedY = locToY(loc, staff);
      if (!Number.isFinite(loc) || !Number.isFinite(snappedY)) {
        return;
      }
      const targetClient = pageToClientCoords(svgRef.current, point.x, snappedY);
      if (!targetClient) {
        return;
      }
      applyNoteDragPreview(note, noteDrag.origTransform, noteDrag.origHeadClient, targetClient);
      return;
    }
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
  }, [zoom, setLabelLocalDraft]);

  const handleMouseUp = useCallback((e: MouseEvent) => {
    const beamHideDrag = beamHideDragRef.current;
    if (beamHideDrag && svgRef.current) {
      const overlay = svgRef.current.querySelector<SVGSVGElement>('.neon-container.active-page');
      const point = clientToPageCoords(svgRef.current, e.clientX, e.clientY);
      beamHideDragRef.current = null;
      document.body.style.cursor = '';
      removeBeamHideMarquee(overlay);
      if (!beamHideDidDragRef.current) {
        isDraggingRef.current = false;
        dragStartDataRef.current = null;
        return;
      }
      const endX = point ? point.x : beamHideDrag.endX;
      const fromX = Math.min(beamHideDrag.startX, endX);
      const toX = Math.max(beamHideDrag.startX, endX);
      if (toX - fromX >= 1) {
        onBeamHideCommitRef.current?.(beamHideDrag.beamId, fromX, toX);
      }
      isDraggingRef.current = false;
      dragStartDataRef.current = null;
      return;
    }
    const labelDrag = labelDragRef.current;
    if (labelDrag && svgRef.current) {
      const point = clientToPageCoords(svgRef.current, e.clientX, e.clientY);
      labelDragRef.current = null;
      if (!labelDidDragRef.current || !point) {
        setLabelLocalDraft(null);
        isDraggingRef.current = false;
        dragStartDataRef.current = null;
        return;
      }
      const to = {
        x: point.x + labelDrag.grabDx,
        y: point.y + labelDrag.grabDy,
      };
      setLabelLocalDraft({ labelId: labelDrag.labelId, x: to.x, y: to.y });
      onLabelOffsetCommitRef.current?.(
        labelDrag.labelId,
        { x: labelDrag.fromX, y: labelDrag.fromY },
        to,
      );
      isDraggingRef.current = false;
      dragStartDataRef.current = null;
      return;
    }
    const beamDrag = beamDragRef.current;
    if (beamDrag && svgRef.current) {
      const overlay = svgRef.current.querySelector<SVGSVGElement>('.neon-container.active-page');
      const beam = overlay?.querySelector<SVGGElement>(`#${CSS.escape(beamDrag.beamId)}.beam`);
      const point = clientToPageCoords(svgRef.current, e.clientX, e.clientY);
      beamDragRef.current = null;
      document.body.style.cursor = '';
      if (!beamDidDragRef.current) {
        if (beam) {
          clearBeamDragPreview(beam);
        }
        isDraggingRef.current = false;
        dragStartDataRef.current = null;
        return;
      }
      const toY = point ? point.y : beamDrag.startY + beamDrag.dy;
      // Keep preview until re-render; commit stem lengths.
      onBeamStemCommitRef.current?.(
        beamDrag.beamId,
        { x: beamDrag.startX, y: beamDrag.startY },
        { x: beamDrag.startX, y: toY },
      );
      isDraggingRef.current = false;
      dragStartDataRef.current = null;
      return;
    }
    const barLineDrag = barLineDragRef.current;
    if (barLineDrag && svgRef.current) {
      const overlay = svgRef.current.querySelector<SVGSVGElement>('.neon-container.active-page');
      const barLine = overlay?.querySelector<SVGGElement>(
        `#${CSS.escape(barLineDrag.barLineId)}.barLine`,
      );
      const point = clientToPageCoords(svgRef.current, e.clientX, e.clientY);
      barLineDragRef.current = null;
      document.body.style.cursor = '';
      if (!barLineDidDragRef.current) {
        if (barLine) {
          clearBarLineDragPreview(barLine);
        }
        isDraggingRef.current = false;
        dragStartDataRef.current = null;
        return;
      }
      const toX = point ? point.x : barLineDrag.startX + barLineDrag.dx;
      onBarLineMoveCommitRef.current?.(barLineDrag.barLineId, toX);
      isDraggingRef.current = false;
      dragStartDataRef.current = null;
      return;
    }
    const noteDrag = noteDragRef.current;
    if (noteDrag && svgRef.current) {
      const overlay = svgRef.current.querySelector<SVGSVGElement>('.neon-container.active-page');
      const note = overlay?.querySelector<SVGGElement>(`#${CSS.escape(noteDrag.noteId)}.note`);
      const staff = overlay?.querySelector<SVGGElement>(`#${CSS.escape(noteDrag.staffId)}.staff`);
      const point = clientToPageCoords(svgRef.current, e.clientX, e.clientY);
      noteDragRef.current = null;
      if (!noteDidDragRef.current) {
        if (note) {
          if (noteDrag.origTransform) {
            note.setAttribute('transform', noteDrag.origTransform);
          } else {
            note.removeAttribute('transform');
          }
        }
        isDraggingRef.current = false;
        dragStartDataRef.current = null;
        return;
      }
      if (note && staff && point) {
        const loc = yToLoc(point.y, staff);
        if (Number.isFinite(loc)) {
          onNoteMoveCommitRef.current?.(noteDrag.noteId, loc, point.x);
        }
      }
    }
    isDraggingRef.current = false;
    dragStartDataRef.current = null;
  }, [setLabelLocalDraft]);

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
    document.addEventListener('pointermove', handleSlurPointerMove);
    document.addEventListener('pointerup', handleSlurPointerUp);
    document.addEventListener('pointercancel', handleSlurPointerUp);
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
      document.removeEventListener('pointermove', handleSlurPointerMove);
      document.removeEventListener('pointerup', handleSlurPointerUp);
      document.removeEventListener('pointercancel', handleSlurPointerUp);
      document.removeEventListener('touchmove', handleTouchMove);
      document.removeEventListener('touchend', handleTouchEnd);
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('keyup', handleKeyUp);
    };
  }, [handleMouseMove, handleMouseUp, handleTouchMove, handleTouchEnd, handleSlurPointerMove, handleSlurPointerUp]);

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
