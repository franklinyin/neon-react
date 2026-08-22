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
  selectedLabelId: string | null = null,
): boolean {
  if (!overlay || selectedBeamId || selectedSlurId || selectedLabelId || selectedNoteIds.length !== 1) {
    return false;
  }
  const noteId = selectedNoteIds[0];
  return Boolean(overlay.querySelector(`#${CSS.escape(noteId)}.note`));
}

function parseXy(value: string | null): { x: number; y: number } | null {
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

export type SchenkerLabelMetadata = {
  labelId: string;
  text: string;
  label: { x: number; y: number };
  anchor: { x: number; y: number };
  startid: string | null;
  fontSize: string | null;
  fontFamily: string | null;
};

export function findSchenkerLabel(overlay: SVGSVGElement | null, labelId: string): SVGGElement | null {
  if (!overlay || !labelId) {
    return null;
  }
  return overlay.querySelector<SVGGElement>(`#${CSS.escape(labelId)}.schenker-label`);
}

export function readSchenkerLabelMetadata(
  overlay: SVGSVGElement | null,
  labelId: string,
): SchenkerLabelMetadata | null {
  const group = findSchenkerLabel(overlay, labelId);
  if (!group) {
    return null;
  }
  const label = parseXy(group.getAttribute('data-label-xy'));
  const anchor = parseXy(group.getAttribute('data-anchor-xy'));
  if (!label || !anchor) {
    return null;
  }
  const textEl = group.querySelector('text');
  return {
    labelId: group.id,
    text: (group.textContent || '').replace(/\s+/g, ' ').trim(),
    label,
    anchor,
    startid: group.getAttribute('data-startid'),
    fontSize: textEl?.getAttribute('font-size') || null,
    fontFamily: textEl?.getAttribute('font-family') || null,
  };
}
