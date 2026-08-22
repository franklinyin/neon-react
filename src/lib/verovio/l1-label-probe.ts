/**
 * L1A-V: verify note-linked labels without getBBox().
 * Run with ?l1=1 or ?l1a=1
 *
 * Does not change Verovio. Does not test stem/flag/beam/flip/move/drag.
 */
import { VerovioClient } from './VerovioClient';
import { prepareMeiForVerovio } from '../mei/prepareMeiForVerovio';
import { measureRenderedStaffs, type StaffBBox } from '../schenker/geometry';
import { buildSchenkerLabelAction } from '../schenker/label';
import { buildStructuralNoteInsertAction } from '../schenker/structuralNote';

const UPPER = 'staff-0000001672035493';
const LOWER = 'staff-0000001081017002';

function publish(report: unknown): void {
  console.log('[l1a-v]', report);
  (window as Window & { __L1A_V__?: unknown }).__L1A_V__ = report;
  document.title = 'L1A_RESULT ' + JSON.stringify(report);
}

function mount(svgText: string): { overlay: SVGSVGElement; host: HTMLDivElement } {
  document.getElementById('l1-label-mount')?.remove();
  const parsed = new DOMParser().parseFromString(svgText, 'image/svg+xml');
  const overlay = document.importNode(parsed.documentElement, true);
  if (!(overlay instanceof SVGSVGElement)) {
    throw new Error('overlay is not SVG');
  }
  overlay.classList.add('neon-container', 'active-page');
  const host = document.createElement('div');
  host.id = 'l1-label-mount';
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
    staff: dir.getAttribute('staff'),
    text: (dir.textContent || '').replace(/\s+/g, ' ').trim(),
  }));
}

function exactLabelText(el: Element | null): string {
  return (el?.textContent || '').replace(/\s+/g, ' ').trim();
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

function isDirLabel(el: Element | null): boolean {
  if (!el) return false;
  const cls = el.getAttribute('class') || '';
  return cls.split(/\s+/).includes('dir') && cls.split(/\s+/).includes('schenker-label');
}

function staffEq(a: StaffBBox[] , b: StaffBBox[]): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

function checkVisible(
  el: Element | null,
  staff: StaffBBox | undefined,
  side: 'above' | 'below',
): string | null {
  if (!isDirLabel(el)) return `${side}: missing g.dir.schenker-label`;
  if (exactLabelText(el) !== '3') return `${side}: text=${JSON.stringify(exactLabelText(el))}`;
  const geom = textGeom(el);
  if (!geom) return `${side}: missing finite x/y/font-size`;
  if (!staff) return `${side}: missing staff bbox`;
  // Same SVG/device y as staff path coordinates: smaller y is higher on the page.
  if (side === 'above' && !(geom.y < staff.uly)) {
    return `above: y=${geom.y} staff.uly=${staff.uly}`;
  }
  if (side === 'below' && !(geom.y > staff.lry)) {
    return `below: y=${geom.y} staff.lry=${staff.lry}`;
  }
  return null;
}

export async function runL1Label(): Promise<void> {
  const client = new VerovioClient();
  let host: HTMLDivElement | null = null;
  const failures: string[] = [];

  try {
    const raw = await (await fetch(`${import.meta.env.BASE_URL}samples/CF-005.mei`)).text();
    await client.waitUntilReady();
    let { overlay } = mount(await client.renderData(prepareMeiForVerovio(raw)));
    host = overlay.parentElement as HTMLDivElement;
    const staffsBefore = measureRenderedStaffs(overlay);

    const insertNote = async (staffId: string, x: number, y: number, loc: number) => {
      const ok = await client.edit(
        buildStructuralNoteInsertAction({ staffId, x, y, loc, kind: 'open' }),
      );
      if (!ok) throw new Error(`insert on ${staffId} failed`);
      ({ overlay } = mount(await client.renderToSVG(1)));
      host = overlay.parentElement as HTMLDivElement;
      const info = (await client.editInfo()) as { uuid?: string };
      if (!info?.uuid) throw new Error('insert uuid missing');
      return info.uuid;
    };

    const addLabel = async (noteId: string) => {
      const ok = await client.edit(buildSchenkerLabelAction(noteId, '3'));
      if (!ok) throw new Error(`label on ${noteId} failed`);
      ({ overlay } = mount(await client.renderToSVG(1)));
      host = overlay.parentElement as HTMLDivElement;
      const info = (await client.editInfo()) as { uuid?: string };
      if (!info?.uuid) throw new Error('label uuid missing');
      return info.uuid;
    };

    const upperNote = await insertNote(UPPER, 2100, 920, 8);
    const upperDirId = await addLabel(upperNote);
    const lowerNote = await insertNote(LOWER, 2100, 1560, 2);
    const lowerDirId = await addLabel(lowerNote);

    const mei = await client.getMEI();
    const dirs = parseDirs(mei);
    const upperMei = dirs.find((d) => d.id === upperDirId);
    const lowerMei = dirs.find((d) => d.id === lowerDirId);
    if (
      upperMei?.type !== 'schenker-label' ||
      upperMei.startid !== `#${upperNote}` ||
      upperMei.place !== 'above' ||
      upperMei.text !== '3' ||
      upperMei.ho ||
      upperMei.vo ||
      upperMei.staff
    ) {
      failures.push(`upper-mei:${JSON.stringify(upperMei)}`);
    }
    if (
      lowerMei?.type !== 'schenker-label' ||
      lowerMei.startid !== `#${lowerNote}` ||
      lowerMei.place !== 'below' ||
      lowerMei.text !== '3' ||
      lowerMei.ho ||
      lowerMei.vo ||
      lowerMei.staff
    ) {
      failures.push(`lower-mei:${JSON.stringify(lowerMei)}`);
    }

    const staffsAfter = measureRenderedStaffs(overlay);
    const upperStaff = staffsAfter.find((s) => s.id === UPPER);
    const lowerStaff = staffsAfter.find((s) => s.id === LOWER);
    const upperEl = overlay.querySelector(`#${CSS.escape(upperDirId)}`);
    const lowerEl = overlay.querySelector(`#${CSS.escape(lowerDirId)}`);
    const upperVis = checkVisible(upperEl, upperStaff, 'above');
    const lowerVis = checkVisible(lowerEl, lowerStaff, 'below');
    if (upperVis) failures.push(upperVis);
    if (lowerVis) failures.push(lowerVis);
    if (!staffEq(staffsBefore, staffsAfter)) failures.push('staff-bbox-changed');

    ({ overlay } = mount(await client.renderData(prepareMeiForVerovio(mei))));
    const reloadedMei = await client.getMEI();
    const reloaded = parseDirs(reloadedMei);
    const reloadUpper = reloaded.find((d) => d.startid === `#${upperNote}`);
    const reloadLower = reloaded.find((d) => d.startid === `#${lowerNote}`);
    if (
      reloadUpper?.text !== '3' ||
      reloadUpper.place !== 'above' ||
      reloadUpper.type !== 'schenker-label' ||
      reloadUpper.startid !== `#${upperNote}`
    ) {
      failures.push(`reload-upper-mei:${JSON.stringify(reloadUpper)}`);
    }
    if (
      reloadLower?.text !== '3' ||
      reloadLower.place !== 'below' ||
      reloadLower.type !== 'schenker-label' ||
      reloadLower.startid !== `#${lowerNote}`
    ) {
      failures.push(`reload-lower-mei:${JSON.stringify(reloadLower)}`);
    }

    const reloadStaffs = measureRenderedStaffs(overlay);
    const reloadUpperEl = overlay.querySelector(`#${CSS.escape(reloadUpper?.id || '')}`);
    const reloadLowerEl = overlay.querySelector(`#${CSS.escape(reloadLower?.id || '')}`);
    const reloadUpperVis = checkVisible(
      reloadUpperEl,
      reloadStaffs.find((s) => s.id === UPPER),
      'above',
    );
    const reloadLowerVis = checkVisible(
      reloadLowerEl,
      reloadStaffs.find((s) => s.id === LOWER),
      'below',
    );
    if (reloadUpperVis) failures.push(`reload:${reloadUpperVis}`);
    if (reloadLowerVis) failures.push(`reload:${reloadLowerVis}`);
    if (!staffEq(staffsBefore, reloadStaffs)) failures.push('reload-staff-bbox-changed');

    publish({
      ok: failures.length === 0,
      failures,
      mei: { upperMei, lowerMei },
      svg: {
        upper: textGeom(upperEl),
        lower: textGeom(lowerEl),
        upperText: exactLabelText(upperEl),
        lowerText: exactLabelText(lowerEl),
      },
      reload: {
        upper: reloadUpper,
        lower: reloadLower,
        upperGeom: textGeom(reloadUpperEl),
        lowerGeom: textGeom(reloadLowerEl),
      },
      staffsBefore,
      staffsAfter,
      payloads: {
        upper: { action: 'schenkerLabel', param: { noteId: upperNote, text: '3' } },
        lower: { action: 'schenkerLabel', param: { noteId: lowerNote, text: '3' } },
      },
    });
  } catch (err) {
    publish({
      ok: false,
      error: err instanceof Error ? err.message : String(err),
      failures,
    });
  } finally {
    host?.remove();
    client.dispose();
  }
}
