/**
 * R3 Reset Slur. Run with ?r3=1
 * Swan persist → reset → default S1 → export → reload. No Undo/Redo.
 */
import { VerovioClient } from './VerovioClient';
import { prepareMeiForVerovio } from '../mei/prepareMeiForVerovio';
import { measureRenderedStaffs } from '../schenker/geometry';
import { buildStructuralNoteInsertAction } from '../schenker/structuralNote';
import {
  buildSchenkerSlurCurveAction,
  buildSchenkerSlurResetAction,
  buildSlurNotesAction,
  readSlurBezierFromMetadata,
  slurBezierPointsMatch,
  type SlurBezierPoints,
} from '../schenker/slur';

function publish(report: unknown): void {
  console.log('[r3-reset-slur]', report);
  (window as Window & { __R3_RESET_SLUR__?: unknown }).__R3_RESET_SLUR__ = report;
}

function mount(svgText: string): { overlay: SVGSVGElement; host: HTMLDivElement } {
  document.getElementById('r3-reset-slur-mount')?.remove();
  const parsed = new DOMParser().parseFromString(svgText, 'image/svg+xml');
  const overlay = document.importNode(parsed.documentElement, true);
  if (!(overlay instanceof SVGSVGElement)) {
    throw new Error('overlay is not SVG');
  }
  overlay.classList.add('neon-container', 'active-page');
  const host = document.createElement('div');
  host.id = 'r3-reset-slur-mount';
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
    bezier: slur.getAttribute('bezier'),
    startho: slur.getAttribute('startho'),
    startvo: slur.getAttribute('startvo'),
    endho: slur.getAttribute('endho'),
    endvo: slur.getAttribute('endvo'),
  }));
}

function hasManualGeometry(slur: ReturnType<typeof parseSlurs>[number] | undefined): boolean {
  return Boolean(
    slur?.bezier || slur?.startho || slur?.startvo || slur?.endho || slur?.endvo,
  );
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

export async function runR3ResetSlur(): Promise<void> {
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

    const defaultMei = parseSlurs(await client.getMEI())[0];
    const defaultStartid = defaultMei?.startid;
    const defaultEndid = defaultMei?.endid;
    if (hasManualGeometry(defaultMei)) failures.push('default-has-manual-geometry');

    const resetDefaultOk = await client.edit(buildSchenkerSlurResetAction(slurId));
    if (!resetDefaultOk) throw new Error('reset of default slur failed');
    ({ overlay } = mount(await client.renderToSVG(1)));
    const afterDefaultResetPts = readSlurBezierFromMetadata(overlay, slurId);
    if (!afterDefaultResetPts || !slurBezierPointsMatch(afterDefaultResetPts, defaultPts, 2)) {
      failures.push('noop-reset-changed-curve');
    }
    const afterDefaultResetMei = parseSlurs(await client.getMEI())[0];
    if (hasManualGeometry(afterDefaultResetMei)) failures.push('noop-reset-wrote-geometry');
    if (afterDefaultResetMei?.startid !== defaultStartid || afterDefaultResetMei?.endid !== defaultEndid) {
      failures.push('noop-reset-changed-ids');
    }

    const swanPts = swan(defaultPts);
    const curveOk = await client.edit(buildSchenkerSlurCurveAction(slurId, swanPts));
    if (!curveOk) throw new Error('schenkerSlurCurve failed');
    ({ overlay } = mount(await client.renderToSVG(1)));
    const afterCurve = readSlurBezierFromMetadata(overlay, slurId);
    if (!afterCurve) throw new Error('missing swan bezier metadata');
    const swanMei = parseSlurs(await client.getMEI())[0];
    if (!hasManualGeometry(swanMei)) failures.push('swan-missing-manual-geometry');
    if (swanMei?.startid !== defaultStartid || swanMei?.endid !== defaultEndid) {
      failures.push('swan-changed-ids');
    }

    const resetOk = await client.edit(buildSchenkerSlurResetAction(slurId));
    if (!resetOk) throw new Error('schenkerSlurReset failed');
    ({ overlay } = mount(await client.renderToSVG(1)));
    const afterResetPts = readSlurBezierFromMetadata(overlay, slurId);
    if (!afterResetPts) throw new Error('missing reset bezier metadata');
    if (!slurBezierPointsMatch(afterResetPts, defaultPts, 2)) {
      failures.push('reset-not-s1-default');
    }
    const staffsAfterReset = measureRenderedStaffs(overlay);
    if (JSON.stringify(staffsBefore) !== JSON.stringify(staffsAfterReset)) {
      failures.push('staff-bbox-after-reset');
    }

    const exported = await client.getMEI();
    const slur = parseSlurs(exported)[0];
    if (!slur?.startid || !slur?.endid) failures.push('missing-startid-endid');
    if (slur?.startid !== defaultStartid || slur?.endid !== defaultEndid) {
      failures.push('reset-changed-ids');
    }
    if (slur?.bezier != null) failures.push('bezier-still-present');
    if (slur?.startho != null) failures.push('startho-still-present');
    if (slur?.startvo != null) failures.push('startvo-still-present');
    if (slur?.endho != null) failures.push('endho-still-present');
    if (slur?.endvo != null) failures.push('endvo-still-present');

    reloadClient = new VerovioClient();
    await reloadClient.waitUntilReady();
    ({ overlay } = mount(await reloadClient.renderData(prepareMeiForVerovio(exported))));
    host = overlay.parentElement as HTMLDivElement;
    const reloadedPts = overlay.querySelector('.slur')
      ? readSlurBezierFromMetadata(overlay, overlay.querySelector('.slur')!.id)
      : null;
    if (!reloadedPts || !slurBezierPointsMatch(reloadedPts, defaultPts, 3)) {
      failures.push('reload-not-default');
    }
    const reloadedMei = parseSlurs(await reloadClient.getMEI())[0];
    if (hasManualGeometry(reloadedMei)) failures.push('reload-manual-geometry');
    const staffsAfterReload = measureRenderedStaffs(overlay);
    if (JSON.stringify(staffsBefore) !== JSON.stringify(staffsAfterReload)) {
      failures.push('staff-bbox-after-reload');
    }

    const expectedStaffs = [
      { id: 'staff-0000001672035493', ulx: 185, uly: 816, lrx: 3229, lry: 1024 },
      { id: 'staff-0000001081017002', ulx: 180, uly: 1452, lrx: 3230, lry: 1668 },
    ];
    if (JSON.stringify(staffsBefore) !== JSON.stringify(expectedStaffs)) {
      failures.push('staff-bbox-unexpected');
    }

    publish({
      ok: failures.length === 0,
      failures,
      staffsBefore,
      staffsAfterReset,
      staffsAfterReload,
      defaultPts,
      afterResetPts,
      reloadedPts,
      exportedSlur: slur,
      swanMei,
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
