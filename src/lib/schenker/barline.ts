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
