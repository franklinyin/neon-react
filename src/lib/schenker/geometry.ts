export type StaffBBox = {
  id: string;
  ulx: number;
  uly: number;
  lrx: number;
  lry: number;
};

function pathLineCoordinates(d: string): number[] {
  return (d.match(/-?\d+(?:\.\d+)?/g) || []).map(Number);
}

/**
 * Staff-line paths are the direct child <path> elements of a Verovio .staff
 * group. Notes/clefs are nested groups; including those paths would inflate
 * the bbox after insertion.
 */
function getStaffLinePaths(staff: SVGGElement): SVGPathElement[] {
  const direct = Array.from(staff.children).filter(
    (el): el is SVGPathElement => el instanceof SVGPathElement,
  );
  if (direct.length > 0) {
    return direct;
  }
  return Array.from(staff.querySelectorAll('path')).filter(
    (path) => !path.closest('.note, .clef, .rest, .accid'),
  );
}

/**
 * Visual staff-line bbox from path `d` data, not SVG getBBox() (which includes
 * clefs and notes). Same coordinate extraction as the old Neon helper.
 */
export function getStaffBBox(staff: SVGGElement): StaffBBox | null {
  let ulx: number | undefined;
  let uly: number | undefined;
  let lrx: number | undefined;
  let lry: number | undefined;

  for (const path of getStaffLinePaths(staff)) {
    const coordinates = pathLineCoordinates(path.getAttribute('d') || '');
    if (coordinates.length < 4) {
      continue;
    }
    if (uly === undefined || Math.min(coordinates[1], coordinates[3]) < uly) {
      uly = Math.min(coordinates[1], coordinates[3]);
    }
    if (ulx === undefined || coordinates[0] < ulx) {
      ulx = coordinates[0];
    }
    if (lry === undefined || Math.max(coordinates[1], coordinates[3]) > lry) {
      lry = Math.max(coordinates[1], coordinates[3]);
    }
    if (lrx === undefined || coordinates[2] > lrx) {
      lrx = coordinates[2];
    }
  }

  if (
    ulx === undefined ||
    uly === undefined ||
    lrx === undefined ||
    lry === undefined ||
    !staff.id
  ) {
    return null;
  }

  return { id: staff.id, ulx, uly, lrx, lry };
}

export function measureRenderedStaffs(root: ParentNode): StaffBBox[] {
  return Array.from(root.querySelectorAll<SVGGElement>('.staff'))
    .map(getStaffBBox)
    .filter((bbox): bbox is StaffBBox => bbox !== null);
}

/**
 * Nearest rendered staff by squared distance to its staff-line bbox
 * (point clamped onto the bbox).
 */
export function findNearestStaff(
  root: ParentNode,
  x: number,
  y: number,
): SVGGElement | null {
  const staves = Array.from(root.querySelectorAll<SVGGElement>('.staff'));
  let best: SVGGElement | null = null;
  let bestDist = Infinity;

  for (const staff of staves) {
    const bbox = getStaffBBox(staff);
    if (!bbox) {
      continue;
    }
    const cx = Math.max(bbox.ulx, Math.min(x, bbox.lrx));
    const cy = Math.max(bbox.uly, Math.min(y, bbox.lry));
    const dist = (x - cx) ** 2 + (y - cy) ** 2;
    if (dist < bestDist) {
      bestDist = dist;
      best = staff;
    }
  }

  return best;
}

/**
 * loc 0 = bottom staff line; each +1 is one half staff-space upward.
 * Stage 1 assumes a standard 5-line staff (4 spaces).
 */
export function yToLoc(y: number, staff: SVGGElement): number {
  const bbox = getStaffBBox(staff);
  if (!bbox) {
    return NaN;
  }
  const staffSpace = (bbox.lry - bbox.uly) / 4;
  const halfSpace = staffSpace / 2;
  if (!Number.isFinite(staffSpace) || halfSpace === 0) {
    return NaN;
  }
  return Math.round((bbox.lry - y) / halfSpace);
}

/** Inverse of yToLoc: staff Y for a discrete loc. */
export function locToY(loc: number, staff: SVGGElement): number {
  const bbox = getStaffBBox(staff);
  if (!bbox) {
    return NaN;
  }
  const staffSpace = (bbox.lry - bbox.uly) / 4;
  const halfSpace = staffSpace / 2;
  if (!Number.isFinite(staffSpace) || halfSpace === 0) {
    return NaN;
  }
  return bbox.lry - loc * halfSpace;
}
