import type { VerovioEditorAction } from '../verovio/VerovioClient';

export function buildSchenkerNoteMoveAction(
  elementId: string,
  loc: number,
  schenkerX: number,
): VerovioEditorAction {
  const id = elementId.trim();
  if (!id) {
    throw new Error('schenkerNoteMove requires a non-empty elementId');
  }
  if (!Number.isFinite(loc) || !Number.isFinite(schenkerX)) {
    throw new Error('schenkerNoteMove requires finite loc and schenkerX');
  }
  return {
    action: 'schenkerNoteMove',
    param: {
      elementId: id,
      loc,
      schenkerX: Math.round(schenkerX * 100) / 100,
    },
  };
}

export function canMoveSchenkerNote(
  overlay: SVGSVGElement | null,
  selectedNoteIds: string[],
  noteId: string,
): boolean {
  if (!overlay || selectedNoteIds.length !== 1 || selectedNoteIds[0] !== noteId) {
    return false;
  }
  return Boolean(overlay.querySelector(`#${CSS.escape(noteId)}.note`));
}
