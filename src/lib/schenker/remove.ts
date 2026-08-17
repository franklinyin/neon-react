import type { VerovioEditorAction } from '../verovio/VerovioClient';

/**
 * Shared/CMN toolkit verb. Old Neon neume-toolkit used `remove`;
 * EditorToolkitShared understands `delete` with the same elementId param.
 */
export function buildDeleteElementAction(elementId: string): VerovioEditorAction {
  const id = elementId.trim();
  if (!id) {
    throw new Error('delete requires a non-empty elementId');
  }
  return {
    action: 'delete',
    param: { elementId: id },
  };
}

export function buildDeleteElementsAction(elementIds: string[]): VerovioEditorAction {
  const ids = [...new Set(elementIds.map((id) => id.trim()).filter(Boolean))];
  if (ids.length === 0) {
    throw new Error('delete requires a non-empty elementId');
  }
  if (ids.length === 1) {
    return buildDeleteElementAction(ids[0]);
  }
  return {
    action: 'chain',
    param: ids.map((elementId) => buildDeleteElementAction(elementId)),
  };
}
