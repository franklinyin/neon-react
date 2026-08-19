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

export function buildSlurBezierAction(elementId: string, points: SlurBezierPoints): VerovioEditorAction {
  const id = elementId.trim();
  if (!id) {
    throw new Error('slurBezier requires a non-empty elementId');
  }
  return {
    action: 'slurBezier',
    param: {
      elementId: id,
      points: points.map((point) => [Math.round(point.x), Math.round(point.y)]),
    },
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

/**
 * Parse the centerline of a Verovio thick slur path:
 * M p0 C c1 c2 p3 ...
 */
export function parseSlurBezierFromOverlay(
  overlay: SVGSVGElement | null,
  slurId: string,
): SlurBezierPoints | null {
  if (!overlay || !slurId) {
    return null;
  }
  const path = overlay.querySelector(`#${CSS.escape(slurId)}.slur path`);
  const d = path?.getAttribute('d');
  if (!d) {
    return null;
  }
  const numbers = d.match(/-?\d+/g);
  if (!numbers || numbers.length < 8) {
    return null;
  }
  const values = numbers.slice(0, 8).map((value) => Number(value));
  return [
    { x: values[0], y: values[1] },
    { x: values[2], y: values[3] },
    { x: values[4], y: values[5] },
    { x: values[6], y: values[7] },
  ];
}

export function activeSlurOverlay(): SVGSVGElement | null {
  return activeScoreOverlay();
}
