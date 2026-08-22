/**
 * Recovery R1 verification. Not production.
 * Confirm S5A persist + slur sibling reload. Run with ?recovery=1
 */
import { VerovioClient } from './VerovioClient';
import { prepareMeiForVerovio } from '../mei/prepareMeiForVerovio';
import { measureRenderedStaffs } from '../schenker/geometry';
import { buildStructuralNoteInsertAction } from '../schenker/structuralNote';
import {
  buildSchenkerSlurCurveAction,
  buildSlurNotesAction,
  readSlurBezierFromMetadata,
  slurBezierPointsMatch,
  type SlurBezierPoints,
} from '../schenker/slur';

function publish(report: unknown): void {
  console.log('[recovery-s5a]', report);
  (window as Window & { __RECOVERY_S5A__?: unknown }).__RECOVERY_S5A__ = report;
}

function mount(svgText: string): { overlay: SVGSVGElement; host: HTMLDivElement } {
  document.getElementById('recovery-s5a-mount')?.remove();
  const parsed = new DOMParser().parseFromString(svgText, 'image/svg+xml');
  const overlay = document.importNode(parsed.documentElement, true);
  if (!(overlay instanceof SVGSVGElement)) {
    throw new Error('overlay is not SVG');
  }
  overlay.classList.add('neon-container', 'active-page');
  const host = document.createElement('div');
  host.id = 'recovery-s5a-mount';
  host.style.cssText = 'position:absolute;left:-12000px;top:0;width:3232px;height:2480px;';
  document.body.appendChild(host);
  host.appendChild(overlay);
  return { overlay, host };
}

function parseSlurs(mei: string) {
  const doc = new DOMParser().parseFromString(mei, 'text/xml');
  return Array.from(doc.getElementsByTagName('slur')).map((slur) => ({
    id: slur.getAttribute('xml:id'),
    startid: slur.getAttribute('startid'),
    endid: slur.getAttribute('endid'),
    bezier: slur.getAttribute('bezier') || '',
    startho: slur.getAttribute('startho'),
    startvo: slur.getAttribute('startvo'),
    endho: slur.getAttribute('endho'),
    endvo: slur.getAttribute('endvo'),
  }));
}

function swan(points: SlurBezierPoints): SlurBezierPoints {
  const [p0, c1, c2, p3] = points;
  return [
    p0,
    { x: c1.x + 180, y: c1.y - 220 },
    { x: c2.x - 160, y: c2.y + 240 },
    p3,
  ];
}

export async function runRecoveryS5A(): Promise<void> {
  const lowerStaffId = 'staff-0000001081017002';
  const client = new VerovioClient();
  let reloadClient: VerovioClient | null = null;
  let host: HTMLDivElement | null = null;
  const failures: string[] = [];

  try {
    const raw = await (await fetch(`${import.meta.env.BASE_URL}samples/CF-005.mei`)).text();
    const prepared = prepareMeiForVerovio(raw);
    await client.waitUntilReady();
    let { overlay } = mount(await client.renderData(prepared));
    host = overlay.parentElement as HTMLDivElement;
    const staffsBefore = measureRenderedStaffs(overlay);

    const insertA = await client.edit(
      buildStructuralNoteInsertAction({
        staffId: lowerStaffId,
        x: 2100,
        y: 1560,
        loc: 2,
        kind: 'open',
      }),
    );
    if (!insertA) throw new Error('insert A failed');
    ({ overlay } = mount(await client.renderToSVG(1)));

    const insertB = await client.edit(
      buildStructuralNoteInsertAction({
        staffId: lowerStaffId,
        x: 2450,
        y: 1520,
        loc: 7,
        kind: 'open',
      }),
    );
    if (!insertB) throw new Error('insert B failed');
    ({ overlay } = mount(await client.renderToSVG(1)));

    const noteIds = Array.from(overlay.querySelectorAll<SVGGElement>('.note'))
      .filter((note) => note.closest('.staff')?.id === lowerStaffId)
      .map((note) => note.id)
      .filter(Boolean);
    if (noteIds.length < 2) throw new Error(`need two notes, got ${noteIds.length}`);

    const slurOk = await client.edit(buildSlurNotesAction(noteIds.slice(0, 2)));
    if (!slurOk) throw new Error('slur create failed');
    ({ overlay } = mount(await client.renderToSVG(1)));

    const slurEl = overlay.querySelector('.slur');
    const slurId = slurEl?.id;
    if (!slurId) throw new Error('no slur in SVG');
    const defaultPts = readSlurBezierFromMetadata(overlay, slurId);
    if (!defaultPts) throw new Error('missing default bezier metadata');

    const swanPts = swan(defaultPts);
    const curveOk = await client.edit(buildSchenkerSlurCurveAction(slurId, swanPts));
    if (!curveOk) throw new Error('schenkerSlurCurve failed');
    ({ overlay } = mount(await client.renderToSVG(1)));
    const afterCurve = readSlurBezierFromMetadata(overlay, slurId);
    if (!afterCurve) throw new Error('missing swan bezier metadata');
    const staffsAfterEdit = measureRenderedStaffs(overlay);
    if (JSON.stringify(staffsBefore) !== JSON.stringify(staffsAfterEdit)) {
      failures.push('staff-bbox-after-edit');
    }

    const exported = await client.getMEI();
    const slurs = parseSlurs(exported);
    if (slurs.length !== 1) failures.push(`export-slur-count:${slurs.length}`);
    const slur = slurs[0];
    if (!slur?.startid || !slur?.endid) failures.push('missing-startid-endid');
    if (!slur?.bezier) failures.push('missing-bezier');
    if (slur?.bezier.includes(',')) failures.push('old-absolute-bezier-format');
    const bezierNums = slur?.bezier.trim().split(/\s+/) || [];
    if (bezierNums.length !== 4) failures.push(`bezier-arity:${bezierNums.length}`);
    if (prepareMeiForVerovio(exported) !== exported) failures.push('prepare-rewrote-runtime-mei');

    client.dispose();
    reloadClient = new VerovioClient();
    await reloadClient.waitUntilReady();
    ({ overlay } = mount(await reloadClient.renderData(prepareMeiForVerovio(exported))));
    host = overlay.parentElement as HTMLDivElement;
    const reloadedSlur = overlay.querySelector('.slur');
    if (!reloadedSlur) failures.push('reload-missing-slur');
    const reloadedPts = reloadedSlur
      ? readSlurBezierFromMetadata(overlay, reloadedSlur.id)
      : null;
    if (!reloadedPts || !slurBezierPointsMatch(reloadedPts, afterCurve, 3)) {
      failures.push('reload-curve-mismatch');
    }
    const staffsAfterReload = measureRenderedStaffs(overlay);
    if (JSON.stringify(staffsBefore) !== JSON.stringify(staffsAfterReload)) {
      failures.push('staff-bbox-after-reload');
    }
    const reloadedMei = parseSlurs(await reloadClient.getMEI());
    if (reloadedMei[0]?.startid !== slur?.startid || reloadedMei[0]?.endid !== slur?.endid) {
      failures.push('reload-startid-endid');
    }

    publish({
      ok: failures.length === 0,
      failures,
      staffsBefore,
      staffsAfterEdit,
      staffsAfterReload,
      exportedSlur: slur,
      afterCurve,
      reloadedPts,
    });
  } catch (err) {
    publish({
      ok: false,
      error: err instanceof Error ? err.message : String(err),
      failures,
    });
  } finally {
    client.dispose();
    reloadClient?.dispose();
    host?.remove();
  }
}
