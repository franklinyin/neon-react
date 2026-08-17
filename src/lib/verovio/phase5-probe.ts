/**
 * PHASE 5A DEV probe. Not production.
 * Prove deleting a Schenker note does not reflow staffs.
 * Run only with ?phase5=1.
 *
 * Old Neon (neume toolkit) deletes with { action: "remove", param: { elementId } }.
 * This CF-005 path uses EditorToolkitShared (CMN), which understands "delete"
 * and returns false for unknown "remove" (after still calling SetFocus).
 * The probe therefore sends the Shared verb through the existing edit() API.
 */
import { VerovioClient } from './VerovioClient';
import { prepareMeiForVerovio } from '../mei/prepareMeiForVerovio';
import { findNearestStaff, measureRenderedStaffs, yToLoc } from '../schenker/geometry';
import { buildStructuralNoteInsertAction } from '../schenker/structuralNote';

type NoteGeom = {
  id: string;
  x: number;
  y: number;
  staffId: string | null;
};

type ClefGeom = {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
};

type MeiNote = {
  id: string | null;
  loc: string | null;
  schenkerX: string;
  schenkerXNum: number;
  schenkerY: string | null;
  staffId: string | null;
};

type Snapshot = {
  pageCount: number;
  viewBox: string | null;
  overlayXmlId: string;
  hasMeiOutputId: boolean;
  staffs: ReturnType<typeof measureRenderedStaffs>;
  clefs: ClefGeom[];
  notes: NoteGeom[];
  staffStroke: string | null;
};

function publish(report: unknown): void {
  console.log('[phase5]', report);
  (window as Window & { __PHASE5__?: unknown }).__PHASE5__ = report;
  let el = document.getElementById('verovio-phase5-report');
  if (!el) {
    el = document.createElement('pre');
    el.id = 'verovio-phase5-report';
    el.setAttribute('hidden', '');
    document.body.appendChild(el);
  }
  el.textContent = JSON.stringify(report, null, 2);
}

function mountVerovioOverlay(svgText: string): { overlay: SVGSVGElement; host: HTMLDivElement } {
  document.getElementById('phase5-mount')?.remove();
  const parsed = new DOMParser().parseFromString(svgText, 'image/svg+xml');
  const root = parsed.documentElement;
  if (root.querySelector('parsererror') || root.localName === 'parsererror') {
    throw new Error('Failed to parse Verovio SVG');
  }
  const overlay = document.importNode(root, true);
  if (!(overlay instanceof SVGSVGElement)) {
    throw new Error('Verovio overlay root is not an SVG element');
  }
  overlay.classList.add('neon-container', 'active-page');
  overlay.style.overflow = 'visible';
  const nestedViewBox =
    overlay.getAttribute('viewBox') ||
    overlay.querySelector('svg[viewBox]')?.getAttribute('viewBox');
  if (!overlay.getAttribute('viewBox') && nestedViewBox) {
    overlay.setAttribute('viewBox', nestedViewBox);
  }
  const host = document.createElement('div');
  host.id = 'phase5-mount';
  host.style.cssText = 'position:absolute;left:-12000px;top:0;width:3232px;height:2480px;';
  document.body.appendChild(host);
  host.appendChild(overlay);
  return { overlay, host };
}

function noteGeom(overlay: SVGSVGElement): NoteGeom[] {
  return Array.from(overlay.querySelectorAll<SVGGElement>('.note')).map((note) => {
    const box = note.getBBox();
    return {
      id: note.id,
      x: box.x,
      y: box.y,
      staffId: note.closest('.staff')?.id || null,
    };
  });
}

function clefGeom(overlay: SVGSVGElement): ClefGeom[] {
  return Array.from(overlay.querySelectorAll<SVGGElement>('.clef')).map((clef) => {
    const box = clef.getBBox();
    return { id: clef.id, x: box.x, y: box.y, w: box.width, h: box.height };
  });
}

function staffStroke(overlay: SVGSVGElement): string | null {
  const path = overlay.querySelector('.staff path');
  return path ? getComputedStyle(path).stroke : null;
}

function describeNoteDom(overlay: SVGSVGElement): Record<string, unknown> | null {
  const note = overlay.querySelector<SVGGElement>('.note');
  if (!note) {
    return null;
  }
  const children = Array.from(note.children).map((child) => ({
    tag: child.tagName,
    className: child.getAttribute('class'),
    id: child.id || null,
    href:
      child.getAttribute('href') ||
      child.getAttribute('xlink:href') ||
      child.querySelector('use')?.getAttribute('href') ||
      child.querySelector('use')?.getAttribute('xlink:href') ||
      null,
  }));
  const html = note.outerHTML;
  return {
    id: note.id,
    className: note.getAttribute('class'),
    childCount: note.children.length,
    children,
    outerHTMLSummary: html.length > 800 ? `${html.slice(0, 800)}…` : html,
  };
}

function parseMeiNotes(mei: string): MeiNote[] {
  const doc = new DOMParser().parseFromString(mei, 'text/xml');
  return Array.from(doc.getElementsByTagName('note'))
    .filter((note) => note.getAttribute('type') === 'schenker')
    .map((note) => {
      const ns = note.lookupNamespaceURI('schenker');
      const schenkerX =
        note.getAttribute('schenker:x') ||
        (ns ? note.getAttributeNS(ns, 'x') : null) ||
        '';
      return {
        id: note.getAttribute('xml:id'),
        loc: note.getAttribute('loc'),
        schenkerX,
        schenkerXNum: Number(schenkerX),
        schenkerY: note.getAttribute('schenker:y'),
        staffId: note.closest('staff')?.getAttribute('xml:id') || null,
      };
    });
}

function nearlyEqual(a: number, b: number, eps = 0.51): boolean {
  return Math.abs(a - b) <= eps;
}

function sameStaffs(
  a: ReturnType<typeof measureRenderedStaffs>,
  b: ReturnType<typeof measureRenderedStaffs>,
): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

function sameClefs(a: ClefGeom[], b: ClefGeom[]): boolean {
  if (a.length !== b.length) {
    return false;
  }
  return a.every((clef, i) => {
    const other = b[i];
    return (
      clef.id === other.id &&
      nearlyEqual(clef.x, other.x) &&
      nearlyEqual(clef.y, other.y) &&
      nearlyEqual(clef.w, other.w) &&
      nearlyEqual(clef.h, other.h)
    );
  });
}

async function snapshot(client: VerovioClient, overlay: SVGSVGElement): Promise<Snapshot> {
  return {
    pageCount: await client.getPageCount(),
    viewBox: overlay.getAttribute('viewBox'),
    overlayXmlId: overlay.getAttribute('xml:id') || overlay.id,
    hasMeiOutputId: overlay.id === 'mei_output',
    staffs: measureRenderedStaffs(overlay),
    clefs: clefGeom(overlay),
    notes: noteGeom(overlay),
    staffStroke: staffStroke(overlay),
  };
}

async function insertAt(
  client: VerovioClient,
  overlay: SVGSVGElement,
  x: number,
  y: number,
): Promise<{ staffId: string; loc: number; x: number; y: number }> {
  const staff = findNearestStaff(overlay, x, y);
  if (!staff?.id) {
    throw new Error(`No staff found at ${x},${y}`);
  }
  const loc = yToLoc(y, staff);
  const action = buildStructuralNoteInsertAction({ staffId: staff.id, x, y, loc });
  const ok = await client.edit(action);
  if (!ok) {
    throw new Error('edit returned false');
  }
  return { staffId: staff.id, loc, x, y };
}

export async function runPhase5(): Promise<void> {
  const sourceRes = await fetch(`${import.meta.env.BASE_URL}samples/CF-005.mei`);
  if (!sourceRes.ok) {
    throw new Error(`Failed to fetch CF-005.mei (${sourceRes.status})`);
  }
  const canonical = await sourceRes.text();
  const prepared = prepareMeiForVerovio(canonical);

  const client = new VerovioClient();
  let reloadClient: VerovioClient | null = null;
  let host: HTMLDivElement | null = null;
  try {
    await client.waitUntilReady();
    const svg0 = await client.renderData(prepared);
    const mounted0 = mountVerovioOverlay(svg0);
    host = mounted0.host;

    const upperInsert = await insertAt(client, mounted0.overlay, 800, 920);
    const svg1 = await client.renderToSVG(1);
    const mounted1 = mountVerovioOverlay(svg1);
    host = mounted1.host;

    const lowerInsert = await insertAt(client, mounted1.overlay, 800, 1560);
    const svgBefore = await client.renderToSVG(1);
    const mountedBefore = mountVerovioOverlay(svgBefore);
    host = mountedBefore.host;

    const before = await snapshot(client, mountedBefore.overlay);
    const noteDom = describeNoteDom(mountedBefore.overlay);
    const meiBefore = parseMeiNotes(await client.getMEI());

    const upperNote = before.notes.find((n) => n.staffId === 'staff-0000001672035493');
    const lowerNote = before.notes.find((n) => n.staffId === 'staff-0000001081017002');
    if (!upperNote || !lowerNote) {
      throw new Error('Expected one upper and one lower Schenker note before remove');
    }

    const removeUpperPayload = {
      action: 'delete',
      param: { elementId: upperNote.id },
    };
    const upperAttr = await client.getElementAttr(upperNote.id);
    const removeUpperOk = await client.edit(removeUpperPayload);
    const removeUpperInfo = await client.editInfo();
    if (!removeUpperOk) {
      publish({
        ok: false,
        error: 'delete upper returned false',
        removeUpperPayload,
        removeUpperOk,
        removeUpperInfo,
        upperAttr,
        meiBefore,
        before,
        noteDom,
      });
      return;
    }
    const svgAfterUpper = await client.renderToSVG(1);
    const mountedAfterUpper = mountVerovioOverlay(svgAfterUpper);
    host = mountedAfterUpper.host;
    const afterUpper = await snapshot(client, mountedAfterUpper.overlay);
    const meiAfterUpper = parseMeiNotes(await client.getMEI());
    const survivingLower = afterUpper.notes.find((n) => n.id === lowerNote.id);
    const survivingLowerMei = meiAfterUpper.find((n) => n.id === lowerNote.id);
    const lowerMeiBefore = meiBefore.find((n) => n.id === lowerNote.id);

    const removeLowerPayload = {
      action: 'delete',
      param: { elementId: lowerNote.id },
    };
    const removeLowerOk = await client.edit(removeLowerPayload);
    const removeLowerInfo = await client.editInfo();
    if (!removeLowerOk) {
      throw new Error('delete lower returned false');
    }
    const svgAfterBoth = await client.renderToSVG(1);
    const mountedAfterBoth = mountVerovioOverlay(svgAfterBoth);
    host = mountedAfterBoth.host;
    const afterBoth = await snapshot(client, mountedAfterBoth.overlay);
    const meiAfterBoth = parseMeiNotes(await client.getMEI());

    const upperAgain = await insertAt(client, mountedAfterBoth.overlay, 800, 920);
    const svgU = await client.renderToSVG(1);
    const mountedU = mountVerovioOverlay(svgU);
    host = mountedU.host;
    await insertAt(client, mountedU.overlay, 800, 1560);
    const svgBoth = await client.renderToSVG(1);
    const mountedBoth = mountVerovioOverlay(svgBoth);
    host = mountedBoth.host;
    const roundPre = await snapshot(client, mountedBoth.overlay);
    const roundUpper = roundPre.notes.find((n) => n.staffId === 'staff-0000001672035493');
    const roundLower = roundPre.notes.find((n) => n.staffId === 'staff-0000001081017002');
    if (!roundUpper || !roundLower) {
      throw new Error('Round-trip setup missing notes');
    }
    const roundRemoveOk = await client.edit({
      action: 'delete',
      param: { elementId: roundUpper.id },
    });
    if (!roundRemoveOk) {
      throw new Error('round-trip delete returned false');
    }
    await client.renderToSVG(1);
    const exported = await client.getMEI();
    const reprepared = prepareMeiForVerovio(exported);
    client.dispose();

    reloadClient = new VerovioClient();
    await reloadClient.waitUntilReady();
    const svgReloaded = await reloadClient.renderData(reprepared);
    const mountedReload = mountVerovioOverlay(svgReloaded);
    host = mountedReload.host;
    const reloaded = await snapshot(reloadClient, mountedReload.overlay);
    const reloadedMei = parseMeiNotes(await reloadClient.getMEI());

    const failures: string[] = [];
    if (before.pageCount !== 1 || afterUpper.pageCount !== 1 || afterBoth.pageCount !== 1) {
      failures.push('page-count');
    }
    if (before.viewBox !== afterUpper.viewBox || before.viewBox !== afterBoth.viewBox) {
      failures.push('viewBox');
    }
    if (!sameStaffs(before.staffs, afterUpper.staffs) || !sameStaffs(before.staffs, afterBoth.staffs)) {
      failures.push('staff-bbox');
    }
    if (!sameClefs(before.clefs, afterUpper.clefs) || !sameClefs(before.clefs, afterBoth.clefs)) {
      failures.push('clef-bbox');
    }
    if (afterUpper.notes.some((n) => n.id === upperNote.id)) failures.push('upper-still-present');
    if (afterUpper.notes.length !== 1) failures.push(`after-upper-count:${afterUpper.notes.length}`);
    if (!survivingLower || survivingLower.staffId !== 'staff-0000001081017002') {
      failures.push('lower-moved-staff');
    }
    if (
      survivingLower &&
      (!nearlyEqual(survivingLower.x, lowerNote.x) || !nearlyEqual(survivingLower.y, lowerNote.y))
    ) {
      failures.push('lower-moved-draw');
    }
    if (!survivingLowerMei || survivingLowerMei.staffId !== 'staff-0000001081017002') {
      failures.push('lower-mei-staff');
    }
    if (
      lowerMeiBefore &&
      survivingLowerMei &&
      (survivingLowerMei.loc !== lowerMeiBefore.loc ||
        survivingLowerMei.schenkerXNum !== lowerMeiBefore.schenkerXNum)
    ) {
      failures.push('lower-mei-attrs');
    }
    if (meiAfterUpper.some((n) => n.id === upperNote.id)) failures.push('upper-still-in-mei');
    if (afterBoth.notes.length !== 0 || meiAfterBoth.length !== 0) failures.push('notes-remain-after-both');
    if (afterUpper.hasMeiOutputId || afterBoth.hasMeiOutputId) failures.push('mei_output-id-overwrite');
    if (afterUpper.staffStroke === 'none' || afterBoth.staffStroke === 'none') {
      failures.push('staff-stroke-none');
    }
    if (reprepared !== exported) failures.push('prepare-rewrote-runtime-mei');
    if (reloadedMei.length !== 1) failures.push(`reload-note-count:${reloadedMei.length}`);
    if (reloadedMei.some((n) => n.id === roundUpper.id)) failures.push('deleted-upper-returned');
    const reloadedLower = reloaded.notes.find((n) => n.staffId === 'staff-0000001081017002');
    const reloadedLowerMei = reloadedMei.find((n) => n.staffId === 'staff-0000001081017002');
    if (!reloadedLower || reloadedLower.staffId !== 'staff-0000001081017002') {
      failures.push('reload-lower-staff');
    }
    if (
      reloadedLower &&
      (!nearlyEqual(reloadedLower.x, roundLower.x) || !nearlyEqual(reloadedLower.y, roundLower.y))
    ) {
      failures.push('reload-lower-draw');
    }
    const roundLowerMei = parseMeiNotes(exported).find((n) => n.id === roundLower.id);
    if (
      !roundLowerMei ||
      !reloadedLowerMei ||
      reloadedLowerMei.loc !== roundLowerMei.loc ||
      reloadedLowerMei.schenkerXNum !== roundLowerMei.schenkerXNum
    ) {
      failures.push('reload-lower-attrs');
    }
    if (!sameStaffs(before.staffs, reloaded.staffs)) failures.push('reload-staff-bbox');

    publish({
      ok: failures.length === 0,
      failures,
      verb: 'delete',
      neonNeumeVerb: 'remove',
      setFocusNote:
        'Schenker insert and delete skip EditorToolkitShared SetFocus(); other actions still run it',
      layoutDeltas: {
        upperStaffLry: {
          before: before.staffs[0]?.lry,
          afterUpper: afterUpper.staffs[0]?.lry,
          afterBoth: afterBoth.staffs[0]?.lry,
        },
        lowerStaffLry: {
          before: before.staffs[1]?.lry,
          afterUpper: afterUpper.staffs[1]?.lry,
          afterBoth: afterBoth.staffs[1]?.lry,
        },
        gClef: { before: before.clefs[0], afterUpper: afterUpper.clefs[0] },
        fClef: { before: before.clefs[1], afterUpper: afterUpper.clefs[1] },
        survivingLowerDraw: {
          before: lowerNote,
          afterUpper: survivingLower || null,
        },
      },
      removeUpperPayload,
      removeLowerPayload,
      removeUpperOk,
      removeUpperInfo,
      removeLowerOk,
      removeLowerInfo,
      upperAttr,
      inserts: { upperInsert, lowerInsert, upperAgain },
      noteDom,
      before,
      afterUpper,
      afterBoth,
      meiBefore,
      meiAfterUpper,
      meiAfterBoth,
      roundTrip: {
        exportedNoteCount: parseMeiNotes(exported).length,
        prepareSameString: reprepared === exported,
        reloaded,
        reloadedMei,
      },
    });
  } catch (err) {
    publish({
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    });
  } finally {
    client.dispose();
    reloadClient?.dispose();
    host?.remove();
  }
}
