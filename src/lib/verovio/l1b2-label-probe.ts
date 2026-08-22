/**
 * L1B2: beamed-note label clearance. Run with ?l1b2=1
 */
import { VerovioClient } from './VerovioClient';
import { prepareMeiForVerovio } from '../mei/prepareMeiForVerovio';
import { measureRenderedStaffs, type StaffBBox } from '../schenker/geometry';
import { buildBeamNotesAction } from '../schenker/beam';
import { buildFlipAction } from '../schenker/flip';
import { buildSchenkerLabelAction } from '../schenker/label';
import { buildDeleteElementAction } from '../schenker/remove';
import { buildStructuralNoteInsertAction, type StructuralNoteKind } from '../schenker/structuralNote';

const UPPER = 'staff-0000001672035493';
const LOWER = 'staff-0000001081017002';

type Row = {
  id: string;
  pass: boolean;
  noteX?: number;
  beamDir?: string;
  beamY?: number | null;
  staffOut?: number;
  labelY?: number;
  detail: string;
};

function publish(report: unknown): void {
  console.log('[l1b2]', report);
  (window as Window & { __L1B2__?: unknown }).__L1B2__ = report;
  document.title = 'L1B2_RESULT ' + JSON.stringify(report);
}

function mount(svgText: string): { overlay: SVGSVGElement; host: HTMLDivElement } {
  document.getElementById('l1b2-mount')?.remove();
  const parsed = new DOMParser().parseFromString(svgText, 'image/svg+xml');
  const overlay = document.importNode(parsed.documentElement, true);
  if (!(overlay instanceof SVGSVGElement)) {
    throw new Error('overlay is not SVG');
  }
  overlay.classList.add('neon-container', 'active-page');
  const host = document.createElement('div');
  host.id = 'l1b2-mount';
  host.style.cssText = 'position:absolute;left:-12000px;top:0;width:3232px;height:2480px;';
  document.body.appendChild(host);
  host.appendChild(overlay);
  return { overlay, host };
}

function parseDirs(mei: string) {
  const doc = new DOMParser().parseFromString(mei, 'text/xml');
  return Array.from(doc.getElementsByTagName('dir')).map((dir) => ({
    id: dir.getAttribute('xml:id'),
    type: dir.getAttribute('type'),
    startid: dir.getAttribute('startid'),
    place: dir.getAttribute('place'),
    ho: dir.getAttribute('ho'),
    vo: dir.getAttribute('vo'),
    text: (dir.textContent || '').replace(/\s+/g, ' ').trim(),
  }));
}

function textGeom(el: Element | null): { x: number; y: number; size: number } | null {
  const text = el?.querySelector('text');
  if (!text) return null;
  const x = Number(text.getAttribute('x'));
  const y = Number(text.getAttribute('y'));
  const size = Number.parseFloat(text.getAttribute('font-size') || '0');
  if (!Number.isFinite(x) || !Number.isFinite(y) || !(size > 0)) return null;
  return { x, y, size };
}

function pathPairs(el: Element | null): { x: number; y: number }[] {
  if (!el) return [];
  const path = el.querySelector('path') || (el instanceof SVGPathElement ? el : null);
  const nums = ((path?.getAttribute('d') || '').match(/-?\d+(?:\.\d+)?/g) || []).map(Number);
  const pts: { x: number; y: number }[] = [];
  for (let i = 0; i + 1 < nums.length; i += 2) {
    pts.push({ x: nums[i], y: nums[i + 1] });
  }
  return pts;
}

function beamYAtX(beam: Element | null, x: number, side: 'above' | 'below'): number | null {
  const pts = pathPairs(beam);
  if (pts.length < 2) return null;
  const ys: number[] = [];
  for (let i = 0; i + 1 < pts.length; i += 1) {
    const a = pts[i];
    const b = pts[i + 1];
    const minX = Math.min(a.x, b.x);
    const maxX = Math.max(a.x, b.x);
    if (x < minX - 1 || x > maxX + 1 || maxX === minX) continue;
    const t = (x - a.x) / (b.x - a.x);
    if (t < -0.05 || t > 1.05) continue;
    ys.push(a.y + t * (b.y - a.y));
  }
  if (ys.length === 0) {
    ys.push(...pts.map((p) => p.y));
  }
  return side === 'above' ? Math.min(...ys) : Math.max(...ys);
}

function staffEq(a: StaffBBox[], b: StaffBBox[]): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

export async function runL1B2(): Promise<void> {
  const client = new VerovioClient();
  let host: HTMLDivElement | null = null;
  const rows: Row[] = [];
  const failures: string[] = [];

  try {
    const raw = await (await fetch(`${import.meta.env.BASE_URL}samples/CF-005.mei`)).text();
    await client.waitUntilReady();
    let { overlay } = mount(await client.renderData(prepareMeiForVerovio(raw)));
    host = overlay.parentElement as HTMLDivElement;
    const staffsBefore = measureRenderedStaffs(overlay);

    const refresh = async () => {
      ({ overlay } = mount(await client.renderToSVG(1)));
      host = overlay.parentElement as HTMLDivElement;
    };
    const uuid = async () => {
      const info = (await client.editInfo()) as { uuid?: string };
      if (!info?.uuid) throw new Error('missing uuid');
      return info.uuid;
    };
    const insert = async (staffId: string, x: number, y: number, loc: number, kind: StructuralNoteKind) => {
      if (!(await client.edit(buildStructuralNoteInsertAction({ staffId, x, y, loc, kind })))) {
        throw new Error(`insert ${kind}`);
      }
      await refresh();
      return uuid();
    };
    const addLabel = async (noteId: string) => {
      if (!(await client.edit(buildSchenkerLabelAction(noteId, '3')))) throw new Error('label');
      await refresh();
      return uuid();
    };

    const beamSide = (beam: Element | null, staff: StaffBBox): 'up' | 'down' | 'unknown' => {
      const pts = pathPairs(beam);
      if (!pts.length) return 'unknown';
      const mid = pts.reduce((s, p) => s + p.y, 0) / pts.length;
      const staffMid = staff.uly + (staff.lry - staff.uly) / 2;
      return mid < staffMid ? 'up' : 'down';
    };

    const ensureOutwardBeam = async (noteId: string, staffId: string) => {
      const staff = measureRenderedStaffs(overlay).find((s) => s.id === staffId);
      const note = overlay.querySelector(`#${CSS.escape(noteId)}.note`);
      const beam = note?.closest('.beam');
      if (!staff || !beam?.id) throw new Error('ensureOutwardBeam: no beam');
      const want = staffId === UPPER ? 'up' : 'down';
      if (beamSide(beam, staff) !== want) {
        if (!(await client.edit(buildFlipAction(beam.id)))) throw new Error('ensure flip');
        await refresh();
      }
    };

    const record = (
      id: string,
      noteId: string,
      dirId: string,
      staffId: string,
      side: 'above' | 'below',
      expectOutwardBeam: boolean,
    ) => {
      const staff = measureRenderedStaffs(overlay).find((s) => s.id === staffId);
      const note = overlay.querySelector(`#${CSS.escape(noteId)}.note`);
      const dirEl = overlay.querySelector(`#${CSS.escape(dirId)}`);
      const geom = textGeom(dirEl);
      const beam = note?.closest('.beam') || overlay.querySelector('.beam');
      const noteX = geom?.x;
      const bY = beam && noteX != null ? beamYAtX(beam, noteX, side) : null;
      const staffOut = side === 'above' ? staff?.uly : staff?.lry;
      const dirName = staff ? beamSide(beam, staff) : 'unknown';
      if (!staff || !geom || (dirEl?.textContent || '').replace(/\s+/g, ' ').trim() !== '3') {
        rows.push({ id, pass: false, detail: 'missing svg' });
        failures.push(id);
        return;
      }
      const outward = expectOutwardBeam && bY != null
        ? side === 'above'
          ? Math.min(staffOut!, bY)
          : Math.max(staffOut!, bY)
        : staffOut!;
      const pass = expectOutwardBeam
        ? side === 'above'
          ? geom.y < outward - 1
          : geom.y > outward + 1
        : side === 'above'
          ? geom.y < staff.uly - 1
          : geom.y > staff.lry + 1;
      rows.push({
        id,
        pass,
        noteX,
        beamDir: dirName,
        beamY: bY,
        staffOut,
        labelY: geom.y,
        detail: `outward=${outward} clearance=${
          side === 'above' ? (outward - geom.y).toFixed(1) : (geom.y - outward).toFixed(1)
        }`,
      });
      if (!pass) failures.push(id);
    };

    const n1 = await insert(UPPER, 1700, 920, 4, 'quaverFlag');
    const n2 = await insert(UPPER, 1900, 900, 8, 'quaverFlag');
    if (!(await client.edit(buildBeamNotesAction([n1, n2])))) throw new Error('beam A');
    await refresh();
    await ensureOutwardBeam(n1, UPPER);
    const d1 = await addLabel(n1);
    const d2 = await addLabel(n2);
    record('A', n1, d1, UPPER, 'above', true);
    record('B', n2, d2, UPPER, 'above', true);

    const yBeforeFlip = textGeom(overlay.querySelector(`#${CSS.escape(d1)}`))?.y;
    const beamId = overlay.querySelector(`#${CSS.escape(n1)}`)?.closest('.beam')?.id;
    if (!beamId) throw new Error('no beam id');
    if (!(await client.edit(buildFlipAction(beamId)))) throw new Error('flip C');
    await refresh();
    record('C', n1, d1, UPPER, 'above', false);
    const yAfterFlip = textGeom(overlay.querySelector(`#${CSS.escape(d1)}`))?.y;
    if (!(yBeforeFlip != null && yAfterFlip != null && yAfterFlip > yBeforeFlip + 10)) {
      failures.push('C-recompute');
    }
    const meiC = parseDirs(await client.getMEI()).find((d) => d.id === d1);
    if (meiC?.startid !== `#${n1}` || meiC.place !== 'above' || meiC.ho || meiC.vo) {
      failures.push('C-mei');
    }

    const n3 = await insert(LOWER, 1700, 1560, 4, 'quaverFlag');
    const n4 = await insert(LOWER, 1900, 1580, 2, 'quaverFlag');
    if (!(await client.edit(buildBeamNotesAction([n3, n4])))) throw new Error('beam D');
    await refresh();
    await ensureOutwardBeam(n3, LOWER);
    const d3 = await addLabel(n3);
    record('D', n3, d3, LOWER, 'below', true);
    const lowerBeam = overlay.querySelector(`#${CSS.escape(n3)}`)?.closest('.beam')?.id;
    if (!lowerBeam) throw new Error('no lower beam');
    const yD = textGeom(overlay.querySelector(`#${CSS.escape(d3)}`))?.y;
    if (!(await client.edit(buildFlipAction(lowerBeam)))) throw new Error('flip E');
    await refresh();
    record('E', n3, d3, LOWER, 'below', false);
    const yE = textGeom(overlay.querySelector(`#${CSS.escape(d3)}`))?.y;
    if (!(yD != null && yE != null && yE < yD - 10)) failures.push('E-recompute');

    const n5 = await insert(UPPER, 2100, 920, 4, 'minimFlag');
    const n6 = await insert(UPPER, 2250, 900, 8, 'minimFlag');
    if (!(await client.edit(buildBeamNotesAction([n5, n6])))) throw new Error('beam F');
    await refresh();
    await ensureOutwardBeam(n5, UPPER);
    const d5 = await addLabel(n5);
    record('F', n5, d5, UPPER, 'above', true);

    const n7 = await insert(UPPER, 2400, 920, 4, 'minimFlag');
    const n8 = await insert(UPPER, 2550, 900, 6, 'quaverFlag');
    if (!(await client.edit(buildBeamNotesAction([n7, n8])))) throw new Error('beam G');
    await refresh();
    await ensureOutwardBeam(n7, UPPER);
    const d7 = await addLabel(n7);
    record('G', n7, d7, UPPER, 'above', true);

    const n9 = await insert(UPPER, 1600, 920, 2, 'quaverFlag');
    const n10 = await insert(UPPER, 2050, 860, 12, 'quaverFlag');
    if (!(await client.edit(buildBeamNotesAction([n9, n10])))) throw new Error('beam H');
    await refresh();
    await ensureOutwardBeam(n9, UPPER);
    const d9 = await addLabel(n9);
    const d10 = await addLabel(n10);
    record('H', n9, d9, UPPER, 'above', true);
    const yH1 = textGeom(overlay.querySelector(`#${CSS.escape(d9)}`))?.y;
    const yH2 = textGeom(overlay.querySelector(`#${CSS.escape(d10)}`))?.y;
    if (!(yH1 != null && yH2 != null && Math.abs(yH1 - yH2) > 8)) failures.push('H-slope');

    const n11 = await insert(LOWER, 1500, 1560, 4, 'quaverFlag');
    const n12 = await insert(LOWER, 2700, 1560, 4, 'quaverFlag');
    if (!(await client.edit(buildBeamNotesAction([n11, n12])))) throw new Error('beam I');
    await refresh();
    await ensureOutwardBeam(n11, LOWER);
    const d11 = await addLabel(n11);
    record('I', n11, d11, LOWER, 'below', true);

    const n13 = await insert(UPPER, 2750, 920, 4, 'quaverFlag');
    const n14 = await insert(UPPER, 2900, 900, 6, 'quaverFlag');
    if (!(await client.edit(buildBeamNotesAction([n13, n14])))) throw new Error('beam J');
    await refresh();
    await ensureOutwardBeam(n13, UPPER);
    const d13 = await addLabel(n13);
    const yFlaggedBeam = textGeom(overlay.querySelector(`#${CSS.escape(d13)}`))?.y;
    const lastBeam = overlay.querySelector(`#${CSS.escape(n13)}`)?.closest('.beam')?.id;
    if (!lastBeam) throw new Error('no last beam');
    if (!(await client.edit(buildDeleteElementAction(lastBeam)))) throw new Error('delete beam');
    await refresh();
    const noteSurvived = Boolean(overlay.querySelector(`#${CSS.escape(n13)}.note`));
    const hasFlag = Boolean(overlay.querySelector(`#${CSS.escape(n13)} .flag`));
    const yAfterDelete = textGeom(overlay.querySelector(`#${CSS.escape(d13)}`));
    const jNote = {
      yFlaggedBeam,
      noteSurvived,
      hasFlag,
      yAfterDelete,
      deleteRemovesNotesWithBeam: !noteSurvived,
    };
    if (noteSurvived) {
      record('J', n13, d13, UPPER, 'above', false);
      if (!hasFlag) failures.push('J-unbeam');
    }

    const mei = await client.getMEI();
    const dirs = parseDirs(mei);
    if (dirs.some((d) => d.ho || d.vo)) failures.push('mei-attrs');
    if (!staffEq(staffsBefore, measureRenderedStaffs(overlay))) failures.push('staff-bbox-changed');

    ({ overlay } = mount(await client.renderData(prepareMeiForVerovio(mei))));
    const reload = parseDirs(await client.getMEI());
    if (reload.filter((d) => d.type === 'schenker-label' && d.startid && !d.ho && !d.vo).length < 8) {
      failures.push('reload');
    }
    if (!staffEq(staffsBefore, measureRenderedStaffs(overlay))) failures.push('reload-staff');

    publish({
      ok: failures.length === 0 && rows.every((r) => r.pass),
      failures,
      rows,
      flip: { yBeforeFlip, yAfterFlip, yD, yE },
      slope: { yH1, yH2 },
      unbeam: jNote,
    });
  } catch (err) {
    publish({
      ok: false,
      error: err instanceof Error ? err.message : String(err),
      failures,
      rows,
    });
  } finally {
    host?.remove();
    client.dispose();
  }
}
