/**
 * L2A: label selection metadata + local draft overlay (no MEI mutation).
 * Run with ?l2a=1
 */
import { VerovioClient } from './VerovioClient';
import { prepareMeiForVerovio } from '../mei/prepareMeiForVerovio';
import { measureRenderedStaffs } from '../schenker/geometry';
import { buildSchenkerLabelAction, readSchenkerLabelMetadata } from '../schenker/label';
import { applyLabelSuppression, renderLabelPreview, removeLabelPreview } from '../schenker/labelDraft';
import { buildStructuralNoteInsertAction } from '../schenker/structuralNote';
import { buildBeamNotesAction } from '../schenker/beam';
import { buildFlipAction } from '../schenker/flip';

const UPPER = 'staff-0000001672035493';
const LOWER = 'staff-0000001081017002';

function publish(report: unknown): void {
  console.log('[l2a]', report);
  (window as Window & { __L2A__?: unknown }).__L2A__ = report;
  document.title = 'L2A_RESULT ' + JSON.stringify(report);
}

function mount(svgText: string): { overlay: SVGSVGElement; host: HTMLDivElement } {
  document.getElementById('l2a-label-mount')?.remove();
  const parsed = new DOMParser().parseFromString(svgText, 'image/svg+xml');
  const overlay = document.importNode(parsed.documentElement, true);
  if (!(overlay instanceof SVGSVGElement)) {
    throw new Error('overlay is not SVG');
  }
  overlay.classList.add('neon-container', 'active-page');
  const host = document.createElement('div');
  host.id = 'l2a-label-mount';
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

function inspectLabelDom(overlay: SVGSVGElement, labelId: string, side: string) {
  const g = overlay.querySelector(`#${CSS.escape(labelId)}`);
  const text = g?.querySelector('text');
  const fakeClick = { target: text || g } as unknown as { target: Element | null };
  const closest =
    fakeClick.target instanceof Element ? fakeClick.target.closest('.schenker-label') : null;
  return {
    side,
    groupId: g?.id ?? null,
    classes: g?.getAttribute('class') ?? null,
    children: Array.from(g?.children || []).map((c) => c.tagName.toLowerCase()),
    textX: text?.getAttribute('x') ?? null,
    textY: text?.getAttribute('y') ?? null,
    eventTargetTag: fakeClick.target?.nodeName ?? null,
    closestSchenkerLabel: closest?.id ?? null,
    groupIdEqualsMeiId: g?.id === labelId,
    metadata: readSchenkerLabelMetadata(overlay, labelId),
  };
}

export async function runL2A(): Promise<void> {
  const client = new VerovioClient();
  let host: HTMLDivElement | null = null;
  const tests: Record<string, boolean | string> = {};
  const failures: string[] = [];

  try {
    const raw = await (await fetch(`${import.meta.env.BASE_URL}samples/CF-005.mei`)).text();
    await client.waitUntilReady();
    let { overlay } = mount(await client.renderData(prepareMeiForVerovio(raw)));
    host = overlay.parentElement as HTMLDivElement;
    const staffsBefore = measureRenderedStaffs(overlay);
    const rootIdBefore = overlay.getAttribute('xml:id') || overlay.id;

    const refresh = async () => {
      ({ overlay } = mount(await client.renderToSVG(1)));
      host = overlay.parentElement as HTMLDivElement;
    };
    const uuid = async () => {
      const info = (await client.editInfo()) as { uuid?: string };
      if (!info?.uuid) throw new Error('missing uuid');
      return info.uuid;
    };
    const insert = async (staffId: string, x: number, y: number, loc: number, kind: 'open' | 'quaverFlag') => {
      if (!(await client.edit(buildStructuralNoteInsertAction({ staffId, x, y, loc, kind })))) {
        throw new Error(`insert ${kind}`);
      }
      await refresh();
      return uuid();
    };

    const uHead = await insert(UPPER, 900, 920, 4, 'open');
    const lHead = await insert(LOWER, 900, 1560, -4, 'open');
    const uStem = await insert(UPPER, 1200, 920, 4, 'quaverFlag');
    const lStem = await insert(LOWER, 1200, 1560, -4, 'quaverFlag');
    const uB1 = await insert(UPPER, 1700, 920, 4, 'quaverFlag');
    const uB2 = await insert(UPPER, 1900, 900, 8, 'quaverFlag');
    const lB1 = await insert(LOWER, 1700, 1560, -4, 'quaverFlag');
    const lB2 = await insert(LOWER, 1900, 1580, -8, 'quaverFlag');
    if (!(await client.edit(buildBeamNotesAction([uB1, uB2])))) throw new Error('beam upper');
    await refresh();
    const uBeamId = (await uuid());
    if (!(await client.edit(buildBeamNotesAction([lB1, lB2])))) throw new Error('beam lower');
    await refresh();
    const uBeam = overlay.querySelector(`#${CSS.escape(uB1)}.note`)?.closest('.beam');
    const lBeam = overlay.querySelector(`#${CSS.escape(lB1)}.note`)?.closest('.beam');
    const staffs = measureRenderedStaffs(overlay);
    const upperStaff = staffs.find((s) => s.id === UPPER);
    const lowerStaff = staffs.find((s) => s.id === LOWER);
    const uBeamMid = (() => {
      const d = uBeam?.querySelector('path')?.getAttribute('d') || '';
      const nums = (d.match(/-?\d+(?:\.\d+)?/g) || []).map(Number);
      const ys: number[] = [];
      for (let i = 1; i < nums.length; i += 2) ys.push(nums[i]);
      return ys.length ? ys.reduce((a, b) => a + b, 0) / ys.length : 0;
    })();
    if (upperStaff && uBeamMid > upperStaff.uly + (upperStaff.lry - upperStaff.uly) / 2) {
      if (uBeam?.id) {
        if (!(await client.edit(buildFlipAction(uBeam.id)))) throw new Error('flip upper beam');
        await refresh();
      }
    }
    if (lowerStaff && lBeam) {
      const d = lBeam.querySelector('path')?.getAttribute('d') || '';
      const nums = (d.match(/-?\d+(?:\.\d+)?/g) || []).map(Number);
      const ys: number[] = [];
      for (let i = 1; i < nums.length; i += 2) ys.push(nums[i]);
      const mid = ys.length ? ys.reduce((a, b) => a + b, 0) / ys.length : 0;
      if (mid < lowerStaff.uly + (lowerStaff.lry - lowerStaff.uly) / 2) {
        if (lBeam.id) {
          if (!(await client.edit(buildFlipAction(lBeam.id)))) throw new Error('flip lower beam');
          await refresh();
        }
      }
    }

    for (const id of [uHead, lHead, uStem, lStem, uB1, lB1]) {
      if (!(await client.edit(buildSchenkerLabelAction(id, '3')))) throw new Error('label');
      await refresh();
    }

    const dirs = parseDirs(await client.getMEI());
    const labels = dirs.filter((d) => d.type === 'schenker-label');
    const byStart = (noteId: string) => labels.find((d) => d.startid === `#${noteId}`);
    const upperHeadDir = byStart(uHead);
    const lowerHeadDir = byStart(lHead);
    const upperBeamDir = byStart(uB1);
    const lowerBeamDir = byStart(lB1);
    if (!upperHeadDir?.id || !lowerHeadDir?.id) throw new Error('missing head labels');

    const meiBefore = await client.getMEI();
    const upperDom = inspectLabelDom(overlay, upperHeadDir.id, 'upper');
    const lowerDom = inspectLabelDom(overlay, lowerHeadDir.id, 'lower');

    tests.domClosest = Boolean(upperDom.closestSchenkerLabel && lowerDom.closestSchenkerLabel);
    tests.groupIdEqualsMei = Boolean(upperDom.groupIdEqualsMeiId && lowerDom.groupIdEqualsMeiId);
    tests.metadataPresent = Boolean(upperDom.metadata && lowerDom.metadata);
    tests.labelXyMatchesText =
      upperDom.metadata?.label.x === Number(upperDom.textX) &&
      upperDom.metadata?.label.y === Number(upperDom.textY) &&
      lowerDom.metadata?.label.x === Number(lowerDom.textX) &&
      lowerDom.metadata?.label.y === Number(lowerDom.textY);
    tests.startidUpper = upperDom.metadata?.startid === uHead;
    tests.startidLower = lowerDom.metadata?.startid === lHead;
    tests.noHoVo = labels.every((d) => !d.ho && !d.vo);

    const uMeta = readSchenkerLabelMetadata(overlay, upperHeadDir.id);
    if (uMeta) {
      applyLabelSuppression(overlay, upperHeadDir.id, true);
      renderLabelPreview(overlay, { labelId: upperHeadDir.id, x: uMeta.label.x + 400, y: uMeta.label.y + 200 });
      const tether = overlay.querySelector<SVGLineElement>('#schenker-label-preview line.schenker-label-tether');
      tests.tetherToNote =
        tether?.getAttribute('x2') === String(uMeta.anchor.x) &&
        tether?.getAttribute('y2') === String(uMeta.anchor.y);
      tests.tetherFromDraft =
        tether?.getAttribute('x1') === String(uMeta.label.x + 400) &&
        tether?.getAttribute('y1') === String(uMeta.label.y + 200);
      tests.previewText = overlay.querySelector('#schenker-label-preview text')?.textContent === '3';
      tests.suppressed = overlay
        .querySelector(`#${CSS.escape(upperHeadDir.id)}`)
        ?.classList.contains('schenker-label-suppressed') === true;
      const otherNote = overlay.querySelector(`#${CSS.escape(lHead)}.note`);
      tests.anchorNotOtherNote = uMeta.startid !== lHead && Boolean(otherNote);
      removeLabelPreview(overlay);
      applyLabelSuppression(overlay, null, false);
    }

    if (upperBeamDir?.id) {
      const meta = readSchenkerLabelMetadata(overlay, upperBeamDir.id);
      tests.beamedAnchorIsNote = meta?.startid === uB1;
      tests.beamedAnchorNotBeam = meta?.startid !== uBeamId;
    }
    if (lowerBeamDir?.id) {
      const meta = readSchenkerLabelMetadata(overlay, lowerBeamDir.id);
      tests.lowerBeamedAnchorIsNote = meta?.startid === lB1;
    }

    const meiAfter = await client.getMEI();
    tests.getMEIEqual = meiBefore === meiAfter;
    tests.staffsUnchanged = JSON.stringify(staffsBefore) === JSON.stringify(measureRenderedStaffs(overlay));
    tests.rootIdUnchanged = (overlay.getAttribute('xml:id') || overlay.id) === rootIdBefore;

    const upperY = Number(upperDom.textY);
    const lowerY = Number(lowerDom.textY);
    tests.l1UpperAbove = Boolean(upperStaff && upperY < upperStaff.uly);
    tests.l1LowerBelow = Boolean(lowerStaff && lowerY > lowerStaff.lry);

    for (const [k, v] of Object.entries(tests)) {
      if (v !== true) failures.push(`${k}=${String(v)}`);
    }

    publish({
      ok: failures.length === 0,
      failures,
      tests,
      upperDom,
      lowerDom,
      meiEqual: meiBefore === meiAfter,
    });
  } catch (err) {
    publish({ ok: false, error: err instanceof Error ? err.message : String(err), tests, failures });
  } finally {
    host?.remove();
    client.dispose();
  }
}
