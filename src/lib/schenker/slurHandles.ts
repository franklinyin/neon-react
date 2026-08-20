import type { SlurBezierPoints } from './slur';

export const SLUR_HANDLE_LABELS = ['P0', 'C1', 'C2', 'P3'] as const;

export function buildSlurBezierPathD(points: SlurBezierPoints): string {
  const [p0, c1, c2, p3] = points;
  return `M ${p0.x} ${p0.y} C ${c1.x} ${c1.y} ${c2.x} ${c2.y} ${p3.x} ${p3.y}`;
}

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
