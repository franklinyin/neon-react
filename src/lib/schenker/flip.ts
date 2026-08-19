import type { VerovioEditorAction } from '../verovio/VerovioClient';

export function buildFlipAction(elementId: string): VerovioEditorAction {
  const id = elementId.trim();
  if (!id) {
    throw new Error('flip requires a non-empty elementId');
  }
  return {
    action: 'flip',
    param: { elementId: id },
  };
}

/** Unbeamed Schenker note with a visible stem (quaver, minim, flagged). */
export function canFlipNote(overlay: SVGSVGElement | null, noteId: string): boolean {
  if (!overlay || !noteId) {
    return false;
  }
  const note = overlay.querySelector(`#${CSS.escape(noteId)}.note`);
  if (!note || note.closest('.beam')) {
    return false;
  }
  return Boolean(note.querySelector('.stem'));
}

export function canFlipBeam(overlay: SVGSVGElement | null, beamId: string): boolean {
  if (!overlay || !beamId) {
    return false;
  }
  return Boolean(overlay.querySelector(`#${CSS.escape(beamId)}.beam`));
}

export function canFlipSelection(
  overlay: SVGSVGElement | null,
  selectedNoteIds: string[],
  selectedBeamId: string | null,
): boolean {
  if (selectedBeamId) {
    return canFlipBeam(overlay, selectedBeamId);
  }
  if (selectedNoteIds.length === 1) {
    return canFlipNote(overlay, selectedNoteIds[0]);
  }
  return false;
}
