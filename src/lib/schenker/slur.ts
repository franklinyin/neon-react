import type { ScorePoint } from '../../components/ImageViewer';
import type { VerovioEditorAction } from '../verovio/VerovioClient';
import { activeScoreOverlay } from './beam';

export type SlurBezierPoints = [ScorePoint, ScorePoint, ScorePoint, ScorePoint];

export function buildSlurNotesAction(noteIds: string[]): VerovioEditorAction {
  const ids = [...new Set(noteIds.map((id) => id.trim()).filter(Boolean))];
  if (ids.length !== 2) {
    throw new Error('slur requires exactly two noteIds');
  }
  return {
    action: 'slur',
    param: { noteIds: ids },
  };
}

/**
 * Phase S4/S5A: push edited P0/C1/C2/P3 to Verovio and persist as standard MEI
 * startho/startvo/endho/endvo + @bezier (relative control offsets).
 * Points must be in the same SVG/device (.page-margin) space as data-bezier-*.
 */
export function buildSchenkerSlurCurveAction(
  elementId: string,
  points: SlurBezierPoints,
): VerovioEditorAction {
  const id = elementId.trim();
  if (!id) {
    throw new Error('schenkerSlurCurve requires a non-empty elementId');
  }
  return {
    action: 'schenkerSlurCurve',
    param: {
      elementId: id,
      points: points.map((point) => [Math.round(point.x), Math.round(point.y)]),
    },
  };
}

export function buildSchenkerSlurResetAction(elementId: string): VerovioEditorAction {
  const id = elementId.trim();
  if (!id) {
    throw new Error('schenkerSlurReset requires a non-empty elementId');
  }
  return {
    action: 'schenkerSlurReset',
    param: { elementId: id },
  };
}

export function isSchenkerNote(overlay: SVGSVGElement | null, noteId: string): boolean {
  if (!overlay || !noteId) {
    return false;
  }
  return Boolean(overlay.querySelector(`#${CSS.escape(noteId)}.note`));
}

function noteCenterX(overlay: SVGSVGElement, noteId: string): number {
  const note = overlay.querySelector<SVGGraphicsElement>(`#${CSS.escape(noteId)}.note`);
  if (!note) {
    return 0;
  }
  const box = note.getBBox();
  return box.x + box.width / 2;
}

export function sortNoteIdsByX(overlay: SVGSVGElement | null, noteIds: string[]): string[] {
  if (!overlay) {
    return noteIds;
  }
  return [...noteIds].sort((a, b) => noteCenterX(overlay, a) - noteCenterX(overlay, b));
}

export function canSlurSelection(overlay: SVGSVGElement | null, selectedIds: string[]): boolean {
  if (!overlay || selectedIds.length !== 2) {
    return false;
  }
  const staffIds = new Set<string>();
  for (const id of selectedIds) {
    if (!isSchenkerNote(overlay, id)) {
      return false;
    }
    const note = overlay.querySelector(`#${CSS.escape(id)}.note`);
    const staffId = note?.closest('.staff')?.id;
    if (!staffId) {
      return false;
    }
    staffIds.add(staffId);
  }
  return staffIds.size === 1;
}

function parseBezierPointAttr(value: string | null): ScorePoint | null {
  if (!value) {
    return null;
  }
  const parts = value.split(',');
  if (parts.length !== 2) {
    return null;
  }
  const x = Number(parts[0]);
  const y = Number(parts[1]);
  if (!Number.isFinite(x) || !Number.isFinite(y)) {
    return null;
  }
  return { x, y };
}

/**
 * Read the centerline cubic Bézier (P0, C1, C2, P3) that Verovio used to draw the slur.
 * Values come from read-only `data-bezier-*` attributes on the slur SVG group.
 */
export function readSlurBezierFromMetadata(
  overlay: SVGSVGElement | null,
  slurId: string,
): SlurBezierPoints | null {
  if (!overlay || !slurId) {
    return null;
  }
  const slur = overlay.querySelector(`#${CSS.escape(slurId)}.slur`);
  if (!slur) {
    return null;
  }
  const p0 = parseBezierPointAttr(slur.getAttribute('data-bezier-p0'));
  const c1 = parseBezierPointAttr(slur.getAttribute('data-bezier-c1'));
  const c2 = parseBezierPointAttr(slur.getAttribute('data-bezier-c2'));
  const p3 = parseBezierPointAttr(slur.getAttribute('data-bezier-p3'));
  if (!p0 || !c1 || !c2 || !p3) {
    return null;
  }
  return [p0, c1, c2, p3];
}

export function slurBezierPointsMatch(
  a: SlurBezierPoints,
  b: SlurBezierPoints,
  tolerance = 2,
): boolean {
  return a.every((point, index) => (
    Math.abs(point.x - b[index].x) <= tolerance
    && Math.abs(point.y - b[index].y) <= tolerance
  ));
}

export function activeSlurOverlay(): SVGSVGElement | null {
  return activeScoreOverlay();
}
