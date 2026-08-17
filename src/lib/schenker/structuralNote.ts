export type StructuralNoteKind = 'open' | 'filled' | 'quaver' | 'minimFlag';

export type StructuralNoteInsertAction = {
  action: 'insert';
  param: {
    elementType: 'note';
    staffId: string;
    ulx: number;
    uly: number;
    attributes: {
      type: 'schenker';
      loc: string;
      'schenker:x': string;
      dur?: '4' | '8';
      'head.fill'?: 'void';
    };
  };
};

export function buildStructuralNoteInsertAction(args: {
  staffId: string;
  x: number;
  y: number;
  loc: number;
  kind?: StructuralNoteKind;
  filled?: boolean;
}): StructuralNoteInsertAction {
  const kind: StructuralNoteKind = args.kind ?? (args.filled ? 'filled' : 'open');
  return {
    action: 'insert',
    param: {
      elementType: 'note',
      staffId: args.staffId,
      ulx: args.x,
      uly: args.y,
      attributes: {
        type: 'schenker',
        loc: String(args.loc),
        'schenker:x': String(Math.round(args.x * 100) / 100),
        ...(kind === 'filled' ? { dur: '4' as const } : {}),
        ...(kind === 'quaver' ? { dur: '8' as const } : {}),
        ...(kind === 'minimFlag' ? { dur: '8' as const, 'head.fill': 'void' as const } : {}),
      },
    },
  };
}
