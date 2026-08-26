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

export function buildSchenkerLabelOffsetAction(
  elementId: string,
  from: { x: number; y: number },
  to: { x: number; y: number },
): VerovioEditorAction {
  const id = elementId.trim();
  if (!id) {
    throw new Error('schenkerLabelOffset requires an elementId');
  }
  if (![from.x, from.y, to.x, to.y].every(Number.isFinite)) {
    throw new Error('schenkerLabelOffset requires finite from/to coordinates');
  }
  return {
    action: 'schenkerLabelOffset',
    param: {
      elementId: id,
      fromX: Math.round(from.x),
      fromY: Math.round(from.y),
      toX: Math.round(to.x),
      toY: Math.round(to.y),
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
  if (
    !overlay ||
    selectedBeamId ||
    selectedSlurId ||
    selectedLabelId ||
    selectedNoteIds.length !== 1
  ) {
    return false;
  }
  const noteId = selectedNoteIds[0];
  return Boolean(overlay.querySelector(`#${CSS.escape(noteId)}.note`));
}

export function findSchenkerDirLabel(
  overlay: SVGSVGElement | null,
  labelId: string,
): SVGGElement | null {
  if (!overlay || !labelId) {
    return null;
  }
  return overlay.querySelector<SVGGElement>(`#${CSS.escape(labelId)}.dir`);
}

export type SchenkerLabelMetadata = {
  labelId: string;
  text: string;
  label: { x: number; y: number };
  anchor: { x: number; y: number };
  startid: string | null;
  fontSize: string | null;
};

function elementCenter(el: Element): { x: number; y: number } | null {
  try {
    const box = (el as SVGGraphicsElement).getBBox();
    if (!Number.isFinite(box.width) || !Number.isFinite(box.height)) {
      return null;
    }
    return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  } catch {
    return null;
  }
}

export function readSchenkerLabelMetadata(
  overlay: SVGSVGElement | null,
  labelId: string,
): SchenkerLabelMetadata | null {
  const group = findSchenkerDirLabel(overlay, labelId);
  if (!group) {
    return null;
  }
  const label = elementCenter(group);
  if (!label) {
    return null;
  }
  const startid = group.getAttribute('data-startid');
  let anchor = label;
  if (startid && overlay) {
    const note = overlay.querySelector(`#${CSS.escape(startid)}.note`);
    const noteCenter = note ? elementCenter(note) : null;
    if (noteCenter) {
      anchor = noteCenter;
    }
  }
  const textEl = group.querySelector('text');
  return {
    labelId: group.id,
    text: (group.textContent || '').replace(/\s+/g, ' ').trim(),
    label,
    anchor,
    startid,
    fontSize: textEl?.getAttribute('font-size') || null,
  };
}
