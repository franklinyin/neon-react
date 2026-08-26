import type { VerovioEditorAction } from '../verovio/VerovioClient';

export type SchenkerBarLineForm = 'dbl' | 'single' | 'end';

export type SchenkerBarLineInsertAction = {
  action: 'insert';
  param: {
    elementType: 'barLine';
    staffId: string;
    ulx: number;
    uly: number;
    attributes: {
      type: 'schenker';
      form: SchenkerBarLineForm;
      'schenker:x': string;
    };
  };
};

export function buildSchenkerDoubleBarLineInsertAction(args: {
  staffId: string;
  x: number;
  y: number;
  form?: SchenkerBarLineForm;
}): SchenkerBarLineInsertAction {
  return {
    action: 'insert',
    param: {
      elementType: 'barLine',
      staffId: args.staffId,
      ulx: args.x,
      uly: args.y,
      attributes: {
        type: 'schenker',
        form: args.form ?? 'dbl',
        'schenker:x': String(Math.round(args.x * 100) / 100),
      },
    },
  };
}

export function canSelectBarLine(overlay: SVGSVGElement | null, barLineId: string): boolean {
  if (!overlay || !barLineId) {
    return false;
  }
  return Boolean(overlay.querySelector(`#${CSS.escape(barLineId)}.barLine`));
}

export function buildSchenkerBarLineMoveAction(
  elementId: string,
  schenkerX: number,
): VerovioEditorAction {
  const id = elementId.trim();
  if (!id) {
    throw new Error('schenkerBarLineMove requires a non-empty elementId');
  }
  if (!Number.isFinite(schenkerX)) {
    throw new Error('schenkerBarLineMove requires a finite schenkerX');
  }
  return {
    action: 'schenkerBarLineMove',
    param: {
      elementId: id,
      schenkerX: Math.round(schenkerX * 100) / 100,
    },
  };
}

export function canDragSelectedBarLine(
  overlay: SVGSVGElement | null,
  selectedBarLineId: string | null,
  hitBarLineId: string | null,
): boolean {
  return Boolean(
    overlay && selectedBarLineId && hitBarLineId && selectedBarLineId === hitBarLineId,
  );
}
