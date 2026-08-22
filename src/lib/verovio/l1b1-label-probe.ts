/**
 * L1B1: unbeamed stem/flag label clearance. Run with ?l1b1=1
 */
import { VerovioClient } from './VerovioClient';
import { prepareMeiForVerovio } from '../mei/prepareMeiForVerovio';
import { measureRenderedStaffs, type StaffBBox } from '../schenker/geometry';
import { buildFlipAction } from '../schenker/flip';
import { buildSchenkerLabelAction } from '../schenker/label';
import { buildSchenkerNoteMoveAction } from '../schenker/move';
import { buildStructuralNoteInsertAction, type StructuralNoteKind } from '../schenker/structuralNote';

const UPPER = 'staff-0000001672035493';
const LOWER = 'staff-0000001081017002';

type Row = {
  id: string;
  pass: boolean;
  staffTop?: number;
  staffBottom?: number;
  stemExt?: number | null;
  flagExt?: number | null;
  labelY?: number;
  outward?: number;
  detail: string;
};

function publish(report: unknown): void {
  console.log('[l1b1]', report);
  (window as Window & { __L1B1__?: unknown }).__L1B1__ = report;
  document.title = 'L1B1_RESULT ' + JSON.stringify(report);
}

function mount(svgText: string): { overlay: SVGSVGElement; host: HTMLDivElement } {
  document.getElementById('l1b1-mount')?.remove();
  const parsed = new DOMParser().parseFromString(svgText, 'image/svg+xml');
  const overlay = document.importNode(parsed.documentElement, true);
  if (!(overlay instanceof SVGSVGElement)) {
    throw new Error('overlay is not SVG');
  }
  overlay.classList.add('neon-container', 'active-page');
  const host = document.createElement('div');
  host.id = 'l1b1-mount';
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

function pathYs(el: Element | null): number[] {
  if (!el) return [];
  return Array.from(el.querySelectorAll('path')).flatMap((path) => {
    const nums = (path.getAttribute('d') || '').match(/-?\d+(?:\.\d+)?/g) || [];
    const ys: number[] = [];
    for (let i = 1; i < nums.length; i += 2) ys.push(Number(nums[i]));
    return ys;
  });
}

function extent(el: Element | null): { min: number; max: number } | null {
  const ys = pathYs(el);
  if (ys.length === 0) return null;
  return { min: Math.min(...ys), max: Math.max(...ys) };
}

function staffEq(a: StaffBBox[], b: StaffBBox[]): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

export async function runL1B1(): Promise<void> {
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
      const ok = await client.edit(
        buildStructuralNoteInsertAction({ staffId, x, y, loc, kind }),
      );
      if (!ok) throw new Error(`insert ${kind} failed`);
      await refresh();
      return uuid();
    };

    const addLabel = async (noteId: string) => {
      const ok = await client.edit(buildSchenkerLabelAction(noteId, '3'));
      if (!ok) throw new Error(`label ${noteId} failed`);
      await refresh();
      return uuid();
    };

    const flipUntil = async (noteId: string, wantUp: boolean) => {
      const stem = overlay.querySelector(`#${CSS.escape(noteId)} .stem`);
      const headYs = pathYs(overlay.querySelector(`#${CSS.escape(noteId)}.note`));
      const stemEx = extent(stem);
      if (!stemEx || headYs.length === 0) return;
      const headMin = Math.min(...headYs);
      const isUp = stemEx.min < headMin - 4;
      if (isUp === wantUp) return;
      if (!(await client.edit(buildFlipAction(noteId)))) throw new Error('flip failed');
      await refresh();
    };

    const check = (
      id: string,
      noteId: string,
      dirId: string,
      staffId: string,
      side: 'above' | 'below',
      expectStem: boolean,
      expectFlag: boolean,
    ) => {
      const staff = measureRenderedStaffs(overlay).find((s) => s.id === staffId);
      const dirGroup = overlay.querySelector(`#${CSS.escape(dirId)}`);
      const text = textGeom(dirGroup);
      const labelledNote = overlay.querySelector(`#${CSS.escape(noteId)}.note`);
      const stemEx = extent(labelledNote?.querySelector('.stem') || null);
      const flagEl = labelledNote?.querySelector('.flag') || null;
      const flagEx = extent(flagEl);
      const staffTop = staff?.uly;
      const staffBottom = staff?.lry;
      if (!staff || !text || (dirGroup?.textContent || '').replace(/\s+/g, ' ').trim() !== '3') {
        rows.push({ id, pass: false, staffTop, staffBottom, detail: 'missing svg/text' });
        failures.push(id);
        return;
      }

      let outward = side === 'above' ? staff.uly : staff.lry;
      if (side === 'above') {
        if (stemEx) outward = Math.min(outward, stemEx.min);
        if (flagEx) outward = Math.min(outward, flagEx.min);
      } else {
        if (stemEx) outward = Math.max(outward, stemEx.max);
        if (flagEx) outward = Math.max(outward, flagEx.max);
      }

      const clears = side === 'above' ? text.y < outward - 1 : text.y > outward + 1;
      const stemOk = !expectStem || Boolean(stemEx);
      const flagOk = !expectFlag || Boolean(flagEl);
      const pass = clears && stemOk && flagOk;
      rows.push({
        id,
        pass,
        staffTop,
        staffBottom,
        stemExt: side === 'above' ? stemEx?.min ?? null : stemEx?.max ?? null,
        flagExt: side === 'above' ? flagEx?.min ?? null : flagEx?.max ?? null,
        labelY: text.y,
        outward,
        detail: `clearance=${(side === 'above' ? outward - text.y : text.y - outward).toFixed(1)}`,
      });
      if (!pass) failures.push(id);
    };

    const addCase = async (
      id: string,
      staffId: string,
      x: number,
      y: number,
      loc: number,
      kind: StructuralNoteKind,
      side: 'above' | 'below',
      wantUp: boolean | null,
      expectStem: boolean,
      expectFlag: boolean,
    ) => {
      const noteId = await insert(staffId, x, y, loc, kind);
      if (wantUp !== null) await flipUntil(noteId, wantUp);
      const dirId = await addLabel(noteId);
      check(id, noteId, dirId, staffId, side, expectStem, expectFlag);
      return { noteId, dirId };
    };

    await addCase('A', UPPER, 1500, 920, 4, 'open', 'above', null, false, false);
    await addCase('B', LOWER, 1500, 1560, 4, 'open', 'below', null, false, false);
    await addCase('C', UPPER, 1650, 920, 4, 'quaver', 'above', true, true, false);
    await addCase('D', UPPER, 1800, 920, 4, 'quaver', 'above', false, true, false);
    await addCase('E', LOWER, 1650, 1560, 4, 'quaver', 'below', false, true, false);
    await addCase('F', LOWER, 1800, 1560, 4, 'quaver', 'below', true, true, false);
    await addCase('G', UPPER, 1950, 920, 4, 'minim', 'above', true, true, false);
    await addCase('H', LOWER, 1950, 1560, 4, 'minim', 'below', false, true, false);
    await addCase('I', UPPER, 2100, 920, 4, 'quaverFlag', 'above', true, true, true);
    await addCase('J', LOWER, 2100, 1560, 4, 'quaverFlag', 'below', false, true, true);
    await addCase('K', UPPER, 2250, 920, 4, 'minimFlag', 'above', true, true, true);
    await addCase('L', LOWER, 2250, 1560, 4, 'minimFlag', 'below', false, true, true);

    const moveNote = await insert(UPPER, 2400, 920, 4, 'quaver');
    await flipUntil(moveNote, true);
    const moveDir = await addLabel(moveNote);
    const beforeMove = textGeom(overlay.querySelector(`#${CSS.escape(moveDir)}`));
    if (!(await client.edit(buildSchenkerNoteMoveAction(moveNote, 10, 2550)))) {
      throw new Error('move failed');
    }
    await refresh();
    const afterMove = textGeom(overlay.querySelector(`#${CSS.escape(moveDir)}`));
    const mei = await client.getMEI();
    const dirs = parseDirs(mei);
    const moved = dirs.find((d) => d.id === moveDir);
    if (
      !(beforeMove && afterMove && Math.abs(afterMove.x - beforeMove.x) > 20) ||
      moved?.startid !== `#${moveNote}` ||
      moved.place !== 'above' ||
      moved.text !== '3'
    ) {
      failures.push('move-recompute');
    }

    if (!(await client.edit(buildFlipAction(moveNote)))) throw new Error('flip after move failed');
    await refresh();
    const afterFlipMei = parseDirs(await client.getMEI()).find((d) => d.id === moveDir);
    const afterFlip = textGeom(overlay.querySelector(`#${CSS.escape(moveDir)}`));
    if (afterFlipMei?.startid !== `#${moveNote}` || afterFlipMei.place !== 'above' || afterFlipMei.text !== '3') {
      failures.push('flip-identity');
    }

    if (dirs.some((d) => d.ho || d.vo) || afterFlipMei?.ho || afterFlipMei?.vo) {
      failures.push('ho-vo-present');
    }
    if (!staffEq(staffsBefore, measureRenderedStaffs(overlay))) failures.push('staff-bbox-changed');

    ({ overlay } = mount(await client.renderData(prepareMeiForVerovio(await client.getMEI()))));
    const reloadDirs = parseDirs(await client.getMEI());
    if (reloadDirs.filter((d) => d.type === 'schenker-label' && d.text === '3' && !d.ho && !d.vo).length < 12) {
      failures.push('reload');
    }
    if (!staffEq(staffsBefore, measureRenderedStaffs(overlay))) failures.push('reload-staff-bbox');

    publish({
      ok: failures.length === 0 && rows.every((r) => r.pass),
      failures,
      rows,
      move: { beforeMove, afterMove, afterFlip },
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
