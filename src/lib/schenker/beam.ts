import type { VerovioEditorAction } from '../verovio/VerovioClient';

export function buildBeamNotesAction(noteIds: string[]): VerovioEditorAction {
  const ids = [...new Set(noteIds.map((id) => id.trim()).filter(Boolean))];
  if (ids.length < 2) {
    throw new Error('beam requires at least two noteIds');
  }
  return {
    action: 'beam',
    param: { noteIds: ids },
  };
}

export function buildSchenkerBeamStemAdjustAction(
  elementId: string,
  from: { x: number; y: number },
  to: { x: number; y: number },
): VerovioEditorAction {
  const id = elementId.trim();
  if (!id) {
    throw new Error('schenkerBeamStemAdjust requires a non-empty elementId');
  }
  return {
    action: 'schenkerBeamStemAdjust',
    param: {
      elementId: id,
      fromX: Math.round(from.x),
      fromY: Math.round(from.y),
      toX: Math.round(to.x),
      toY: Math.round(to.y),
    },
  };
}

export function buildSchenkerBeamHideAction(
  elementId: string,
  fromX: number,
  toX: number,
): VerovioEditorAction {
  const id = elementId.trim();
  if (!id) {
    throw new Error('schenkerBeamHide requires a non-empty elementId');
  }
  if (!Number.isFinite(fromX) || !Number.isFinite(toX)) {
    throw new Error('schenkerBeamHide requires finite fromX/toX');
  }
  const a = Math.min(fromX, toX);
  const b = Math.max(fromX, toX);
  return {
    action: 'schenkerBeamHide',
    param: {
      elementId: id,
      fromX: Math.round(a * 100) / 100,
      toX: Math.round(b * 100) / 100,
    },
  };
}

export function buildSchenkerBeamPolishVertexAction(
  elementId: string,
  x: number,
  noteId?: string | null,
): VerovioEditorAction {
  const id = elementId.trim();
  if (!id) {
    throw new Error('schenkerBeamPolishVertex requires a non-empty elementId');
  }
  if (!Number.isFinite(x)) {
    throw new Error('schenkerBeamPolishVertex requires a finite x');
  }
  const param: { elementId: string; x: number; noteId?: string } = {
    elementId: id,
    x: Math.round(x * 100) / 100,
  };
  const stemNoteId = noteId?.trim();
  if (stemNoteId) {
    param.noteId = stemNoteId;
  }
  return {
    action: 'schenkerBeamPolishVertex',
    param,
  };
}

export function canDragSelectedBeam(
  overlay: SVGSVGElement | null,
  selectedBeamId: string | null,
  hitBeamId: string | null,
): boolean {
  return Boolean(overlay && selectedBeamId && hitBeamId && selectedBeamId === hitBeamId);
}

/**
 * A beamable note is an unbeamed Schenker eighth (minimFlag / quaverFlag):
 * dur=8 with a visible flag in the rendered SVG.
 */
export function isBeamableFlaggedNote(overlay: SVGSVGElement | null, noteId: string): boolean {
  if (!overlay || !noteId) {
    return false;
  }
  const note = overlay.querySelector(`#${CSS.escape(noteId)}.note`);
  if (!note) {
    return false;
  }
  if (note.closest('.beam')) {
    return false;
  }
  return Boolean(note.querySelector('.flag'));
}

export function canBeamSelection(overlay: SVGSVGElement | null, selectedIds: string[]): boolean {
  if (!overlay || selectedIds.length < 2) {
    return false;
  }
  const staffIds = new Set<string>();
  for (const id of selectedIds) {
    if (!isBeamableFlaggedNote(overlay, id)) {
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

export function activeScoreOverlay(): SVGSVGElement | null {
  return document.querySelector<SVGSVGElement>('#svg_group .neon-container.active-page');
}
