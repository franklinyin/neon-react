import { findSchenkerDirLabel, readSchenkerLabelMetadata } from './label';

export const LABEL_PREVIEW_LAYER_ID = 'schenker-label-preview';
export const SELECTED_LABEL_CLASS = 'selected-schenker-label';

export type LabelLocalDraft = {
  labelId: string;
  x: number;
  y: number;
};

export function applyLabelSelection(overlay: SVGSVGElement, selectedLabelId: string | null): void {
  overlay.querySelectorAll(`.dir.${SELECTED_LABEL_CLASS}`).forEach((label) => {
    label.classList.remove(SELECTED_LABEL_CLASS, 'selected');
  });
  if (!selectedLabelId) {
    return;
  }
  const label = findSchenkerDirLabel(overlay, selectedLabelId);
  if (label) {
    label.classList.add(SELECTED_LABEL_CLASS, 'selected');
  }
}

export function applyLabelSuppression(
  overlay: SVGSVGElement,
  labelId: string | null,
  suppressed: boolean,
): void {
  overlay.querySelectorAll('.dir.schenker-label-suppressed').forEach((label) => {
    label.classList.remove('schenker-label-suppressed');
  });
  if (!suppressed || !labelId) {
    return;
  }
  findSchenkerDirLabel(overlay, labelId)?.classList.add('schenker-label-suppressed');
}

export function removeLabelPreview(overlay: SVGSVGElement): void {
  overlay.querySelector(`#${LABEL_PREVIEW_LAYER_ID}`)?.remove();
}

export function renderLabelPreview(overlay: SVGSVGElement, draft: LabelLocalDraft): void {
  removeLabelPreview(overlay);
  const pageMargin = overlay.querySelector<SVGGElement>('.page-margin');
  const meta = readSchenkerLabelMetadata(overlay, draft.labelId);
  if (!pageMargin || !meta) {
    return;
  }

  const layer = document.createElementNS('http://www.w3.org/2000/svg', 'g');
  layer.id = LABEL_PREVIEW_LAYER_ID;
  layer.setAttribute('pointer-events', 'none');

  const tether = document.createElementNS('http://www.w3.org/2000/svg', 'line');
  tether.setAttribute('x1', String(draft.x));
  tether.setAttribute('y1', String(draft.y));
  tether.setAttribute('x2', String(meta.anchor.x));
  tether.setAttribute('y2', String(meta.anchor.y));
  tether.classList.add('schenker-label-tether');
  layer.appendChild(tether);

  const preview = document.createElementNS('http://www.w3.org/2000/svg', 'text');
  preview.setAttribute('x', String(draft.x));
  preview.setAttribute('y', String(draft.y));
  preview.setAttribute('text-anchor', 'middle');
  preview.setAttribute('dominant-baseline', 'middle');
  if (meta.fontSize) {
    preview.setAttribute('font-size', meta.fontSize);
  }
  preview.setAttribute('font-style', 'normal');
  preview.classList.add('schenker-label-preview-text');
  preview.textContent = meta.text;
  layer.appendChild(preview);

  pageMargin.appendChild(layer);
}

export function updateLabelPreviewInPlace(overlay: SVGSVGElement, draft: LabelLocalDraft): void {
  const layer = overlay.querySelector<SVGGElement>(`#${LABEL_PREVIEW_LAYER_ID}`);
  if (!layer) {
    renderLabelPreview(overlay, draft);
    return;
  }
  const meta = readSchenkerLabelMetadata(overlay, draft.labelId);
  const tether = layer.querySelector<SVGLineElement>('line.schenker-label-tether');
  const preview = layer.querySelector<SVGTextElement>('text.schenker-label-preview-text');
  if (tether) {
    tether.setAttribute('x1', String(draft.x));
    tether.setAttribute('y1', String(draft.y));
    if (meta) {
      tether.setAttribute('x2', String(meta.anchor.x));
      tether.setAttribute('y2', String(meta.anchor.y));
    }
  }
  if (preview) {
    preview.setAttribute('x', String(draft.x));
    preview.setAttribute('y', String(draft.y));
  }
}
