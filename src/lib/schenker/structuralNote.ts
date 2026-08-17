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
    };
  };
};

export function buildStructuralNoteInsertAction(args: {
  staffId: string;
  x: number;
  y: number;
  loc: number;
}): StructuralNoteInsertAction {
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
      },
    },
  };
}
