import type { SlurBezierPoints } from './slur';

export const SLUR_HANDLE_LABELS = ['p0', 'p1', 'p2', 'p3'] as const;

export type SlurHandleDragState = {
  slurId: string;
  handleIndex: number;
  points: SlurBezierPoints;
};

export function updateSlurHandlePoint(
  points: SlurBezierPoints,
  index: number,
  x: number,
  y: number,
): SlurBezierPoints {
  const next = points.map((point) => ({ ...point })) as SlurBezierPoints;
  next[index] = { x, y };
  return next;
}
