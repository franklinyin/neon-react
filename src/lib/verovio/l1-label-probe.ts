/**
 * L1A: note-linked labels + upper/lower place + visible text + reload.
 * Run with ?l1=1 or ?l1a=1
 *
 * Does NOT test stem/flag/beam clearance, flip, or note move.
 */
import { VerovioClient } from './VerovioClient';
import { prepareMeiForVerovio } from '../mei/prepareMeiForVerovio';
import { measureRenderedStaffs } from '../schenker/geometry';
import { buildSchenkerLabelAction } from '../schenker/label';
import { buildStructuralNoteInsertAction } from '../schenker/structuralNote';

const UPPER = 'staff-0000001672035493';
const LOWER = 'staff-0000001081017002';

function publish(report: unknown): void {
  console.log('[l1a-label]', report);
  (window as Window & { __L1A_LABEL__?: unknown }).__L1A_LABEL__ = report;
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
  host.style.cssText = 'position:fixed;left:0;top:0;width:3232px;height:2480px;opacity:0;pointer-events:none;z-index:-1';
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

function textGeom(el: Element | null): { x: number; y: number; size: number } | null {
  const text = el?.querySelector('text');
  if (!text) return null;
  const x = Number(text.getAttribute('x'));
  const y = Number(text.getAttribute('y'));
  const size = Number.parseFloat(text.getAttribute('font-size') || '0');
  if (!Number.isFinite(x) || !Number.isFinite(y) || size <= 0) return null;
  return { x, y, size };
}

function labelBox(el: Element | null): DOMRect | null {
  if (!el) return null;
  const candidates = [el, ...Array.from(el.querySelectorAll('text, tspan'))];
  for (const node of candidates) {
    if (!(node instanceof SVGGraphicsElement)) continue;
    try {
      const box = node.getBBox();
      if (box.width > 0 && box.height > 0) return box;
    } catch {
      /* empty */
    }
  }
  const geom = textGeom(el);
  if (!geom) return null;
  return {
    x: geom.x - geom.size / 2,
    y: geom.y - geom.size,
    width: geom.size,
    height: geom.size,
    top: geom.y - geom.size,
    right: geom.x + geom.size / 2,
    bottom: geom.y,
    left: geom.x - geom.size / 2,
    toJSON() {
      return this;
    },
  } as DOMRect;
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
    if (upperMei?.type !== 'schenker-label' || upperMei.startid !== `#${upperNote}` || upperMei.place !== 'above' || upperMei.text !== '3' || upperMei.ho || upperMei.vo || upperMei.staff) {
      failures.push(`upper-mei:${JSON.stringify(upperMei)}`);
    }
    if (lowerMei?.type !== 'schenker-label' || lowerMei.startid !== `#${lowerNote}` || lowerMei.place !== 'below' || lowerMei.text !== '3' || lowerMei.ho || lowerMei.vo || lowerMei.staff) {
      failures.push(`lower-mei:${JSON.stringify(lowerMei)}`);
    }

    const upperEl = overlay.querySelector(`#${CSS.escape(upperDirId)}`);
    const lowerEl = overlay.querySelector(`#${CSS.escape(lowerDirId)}`);
    const upperGeom = textGeom(upperEl);
    const lowerGeom = textGeom(lowerEl);
    const upperBox = labelBox(upperEl);
    const lowerBox = labelBox(lowerEl);
    const upperStaff = measureRenderedStaffs(overlay).find((s) => s.id === UPPER);
    const lowerStaff = measureRenderedStaffs(overlay).find((s) => s.id === LOWER);

    if (!upperGeom) failures.push('upper-font-size');
    if (!lowerGeom) failures.push('lower-font-size');
    if (!(upperStaff && upperGeom && upperGeom.y < upperStaff.uly)) {
      failures.push(`upper-not-above:${upperGeom?.y}/${upperStaff?.uly}`);
    }
    if (!(lowerStaff && lowerGeom && lowerGeom.y > lowerStaff.lry)) {
      failures.push(`lower-not-below:${lowerGeom?.y}/${lowerStaff?.lry}`);
    }
    if (!(upperEl?.textContent || '').includes('3')) failures.push('upper-svg-text');
    if (!(lowerEl?.textContent || '').includes('3')) failures.push('lower-svg-text');

    const staffsAfter = measureRenderedStaffs(overlay);
    const staffUnchanged =
      JSON.stringify(staffsBefore) === JSON.stringify(staffsAfter);
    if (!staffUnchanged) failures.push('staff-bbox-changed');

    ({ overlay } = mount(await client.renderData(prepareMeiForVerovio(mei))));
    const reloaded = parseDirs(await client.getMEI());
    const reloadUpper = reloaded.find((d) => d.startid === `#${upperNote}`);
    const reloadLower = reloaded.find((d) => d.startid === `#${lowerNote}`);
    if (reloadUpper?.text !== '3' || reloadUpper.place !== 'above' || reloadUpper.type !== 'schenker-label') {
      failures.push(`reload-upper:${JSON.stringify(reloadUpper)}`);
    }
    if (reloadLower?.text !== '3' || reloadLower.place !== 'below' || reloadLower.type !== 'schenker-label') {
      failures.push(`reload-lower:${JSON.stringify(reloadLower)}`);
    }
    const reloadUpperEl = overlay.querySelector(`#${CSS.escape(reloadUpper?.id || '')}`);
    const reloadLowerEl = overlay.querySelector(`#${CSS.escape(reloadLower?.id || '')}`);
    if (!textGeom(reloadUpperEl)) failures.push('reload-upper-svg');
    if (!textGeom(reloadLowerEl)) failures.push('reload-lower-svg');

    publish({
      ok: failures.length === 0,
      failures,
      mei: { upperMei, lowerMei },
      svg: {
        upperSize: upperGeom?.size,
        lowerSize: lowerGeom?.size,
        upperGeom,
        lowerGeom,
        upperBox,
        lowerBox,
        upperText: upperEl?.textContent,
        lowerText: lowerEl?.textContent,
      },
      staffUnchanged,
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
