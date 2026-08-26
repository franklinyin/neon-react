import type { VerovioEditorAction } from '../verovio/VerovioClient';

export function buildSchenkerLabelAction(noteId: string, text: string): VerovioEditorAction {
  const id = noteId.trim();
  const value = text.trim();
  if (!id) {
    throw new Error('schenkerLabel requires a noteId');
  }
  if (!value) {
    throw new Error('schenkerLabel requires text');
  }
  return {
    action: 'schenkerLabel',
    param: {
      noteId: id,
      text: value,
    },
  };
}

export function canLabelSelection(
  overlay: SVGSVGElement | null,
  selectedNoteIds: string[],
  selectedBeamId: string | null,
  selectedSlurId: string | null,
): boolean {
  if (!overlay || selectedBeamId || selectedSlurId || selectedNoteIds.length !== 1) {
    return false;
  }
  const noteId = selectedNoteIds[0];
  return Boolean(overlay.querySelector(`#${CSS.escape(noteId)}.note`));
}
