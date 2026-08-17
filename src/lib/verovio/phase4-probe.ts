/**
 * PHASE 4 DEV probe. Not production.
 * Run only with ?phase4=1 so it does not start on the normal app route.
 */
import { VerovioClient } from './VerovioClient';
import {
  outlinePreparedMei,
  prepareMeiForVerovio,
} from '../mei/prepareMeiForVerovio';
import {
  createMeiBlob,
  UTF8_REGRESSION_SAMPLE,
  verifyUtf8MeiBlobRoundTrip,
} from '../mei/downloadMei';
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
  dur: string | null;
  stemVisible: string | null;
  staffId: string | null;
};

function publish(report: unknown): void {
  console.log('[phase4]', report);
  (window as Window & { __PHASE4__?: unknown }).__PHASE4__ = report;
  let el = document.getElementById('verovio-phase4-report');
  if (!el) {
    el = document.createElement('pre');
    el.id = 'verovio-phase4-report';
    el.setAttribute('hidden', '');
    document.body.appendChild(el);
  }
  el.textContent = JSON.stringify(report, null, 2);
}

function mountVerovioOverlay(svgText: string): { overlay: SVGSVGElement; host: HTMLDivElement } {
  document.getElementById('phase4-mount')?.remove();
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
  host.id = 'phase4-mount';
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
        dur: note.getAttribute('dur'),
        stemVisible: note.getAttribute('stem.visible'),
        staffId: note.closest('staff')?.getAttribute('xml:id') || null,
      };
    });
}

function meiVersion(xml: string): string | null {
  const doc = new DOMParser().parseFromString(xml, 'text/xml');
  return doc.documentElement.getAttribute('meiversion');
}

function schenkerNs(xml: string): string | null {
  const doc = new DOMParser().parseFromString(xml, 'text/xml');
  return (
    doc.documentElement.getAttribute('xmlns:schenker') ||
    doc.documentElement.lookupNamespaceURI('schenker')
  );
}

function nearlyEqual(a: number, b: number, eps = 0.51): boolean {
  return Math.abs(a - b) <= eps;
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

export async function runPhase4(): Promise<void> {
  const utf8 = await verifyUtf8MeiBlobRoundTrip();
  if (!utf8.ok) {
    publish({ ok: false, error: 'UTF-8 blob regression failed', utf8 });
    return;
  }

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
    const staffs0 = measureRenderedStaffs(mounted0.overlay);

    const upperInsert = await insertAt(client, mounted0.overlay, 800, 920);
    const svg1 = await client.renderToSVG(1);
    const mounted1 = mountVerovioOverlay(svg1);
    host = mounted1.host;

    const lowerInsert = await insertAt(client, mounted1.overlay, 800, 1560);
    const svgBefore = await client.renderToSVG(1);
    const mountedBefore = mountVerovioOverlay(svgBefore);
    host = mountedBefore.host;

    const before = {
      pageCount: await client.getPageCount(),
      viewBox: mountedBefore.overlay.getAttribute('viewBox'),
      overlayXmlId: mountedBefore.overlay.getAttribute('xml:id') || mountedBefore.overlay.id,
      hasMeiOutputId: mountedBefore.overlay.id === 'mei_output',
      staffs: measureRenderedStaffs(mountedBefore.overlay),
      clefs: clefGeom(mountedBefore.overlay),
      notes: noteGeom(mountedBefore.overlay),
      staffStroke: staffStroke(mountedBefore.overlay),
    };

    const exported = await client.getMEI();
    const blob = createMeiBlob(exported);
    const blobText = await blob.text();
    const reprepared = prepareMeiForVerovio(exported);
    const sourceOutline = outlinePreparedMei(exported);
    const repreparedOutline = outlinePreparedMei(reprepared);
    const exportedNotes = parseMeiNotes(exported);

    client.dispose();

    reloadClient = new VerovioClient();
    await reloadClient.waitUntilReady();
    const svgAfter = await reloadClient.renderData(reprepared);
    const mountedAfter = mountVerovioOverlay(svgAfter);
    host = mountedAfter.host;
    const after = {
      pageCount: await reloadClient.getPageCount(),
      viewBox: mountedAfter.overlay.getAttribute('viewBox'),
      overlayXmlId: mountedAfter.overlay.getAttribute('xml:id') || mountedAfter.overlay.id,
      hasMeiOutputId: mountedAfter.overlay.id === 'mei_output',
      staffs: measureRenderedStaffs(mountedAfter.overlay),
      clefs: clefGeom(mountedAfter.overlay),
      notes: noteGeom(mountedAfter.overlay),
      staffStroke: staffStroke(mountedAfter.overlay),
    };
    const reloadedMei = await reloadClient.getMEI();

    const upperBefore = before.notes.find((n) => n.staffId === 'staff-0000001672035493');
    const lowerBefore = before.notes.find((n) => n.staffId === 'staff-0000001081017002');
    const upperAfter = after.notes.find((n) => n.id === upperBefore?.id) ||
      after.notes.find((n) => n.staffId === 'staff-0000001672035493');
    const lowerAfter = after.notes.find((n) => n.id === lowerBefore?.id) ||
      after.notes.find((n) => n.staffId === 'staff-0000001081017002');

    const lowerMei = exportedNotes.find((n) => n.staffId === 'staff-0000001081017002');
    const upperMei = exportedNotes.find((n) => n.staffId === 'staff-0000001672035493');

    const failures: string[] = [];
    if (!utf8.ok) failures.push('utf8-blob');
    if (blobText !== exported) failures.push('blobText!==getMEI');
    if (exportedNotes.length !== 2) failures.push(`note-count:${exportedNotes.length}`);
    if (reprepared !== exported) failures.push('prepare-rewrote-runtime-mei');
    if (sourceOutline.pbCount !== repreparedOutline.pbCount) failures.push('extra-pb');
    if (sourceOutline.neonNeumeLineCount !== repreparedOutline.neonNeumeLineCount) {
      failures.push('extra-neon-neume-line');
    }
    if (sourceOutline.runtimeStaffCount !== repreparedOutline.runtimeStaffCount) {
      failures.push('extra-staff');
    }
    if (/facs=["']null["']/.test(exported)) failures.push('facs-null');
    if (exportedNotes.some((n) => n.schenkerY)) failures.push('schenker:y');
    if (before.pageCount !== 1 || after.pageCount !== 1) failures.push('page-count');
    if (!upperMei || upperMei.staffId !== 'staff-0000001672035493') failures.push('upper-staff-mei');
    if (!lowerMei || lowerMei.staffId !== 'staff-0000001081017002') failures.push('lower-staff-mei');
    if (lowerInsert.staffId !== 'staff-0000001081017002') failures.push('lower-insert-selected-wrong-staff');
    if (upperInsert.staffId !== 'staff-0000001672035493') failures.push('upper-insert-selected-wrong-staff');
    if (!upperBefore || !upperAfter || !nearlyEqual(upperBefore.x, upperAfter.x) || !nearlyEqual(upperBefore.y, upperAfter.y)) {
      failures.push('upper-draw-pos');
    }
    if (!lowerBefore || !lowerAfter || !nearlyEqual(lowerBefore.x, lowerAfter.x) || !nearlyEqual(lowerBefore.y, lowerAfter.y)) {
      failures.push('lower-draw-pos');
    }
    if (lowerAfter?.staffId !== 'staff-0000001081017002') failures.push('lower-note-moved-to-other-staff');
    if (JSON.stringify(before.staffs) !== JSON.stringify(after.staffs)) failures.push('staff-bbox');
    if (before.hasMeiOutputId || after.hasMeiOutputId) failures.push('mei_output-id-overwrite');
    if (before.staffStroke === 'none' || after.staffStroke === 'none') failures.push('staff-stroke-none');

    const report = {
      ok: failures.length === 0,
      failures,
      utf8: {
        ...utf8,
        sampleContainsCjk: UTF8_REGRESSION_SAMPLE.includes('测试'),
      },
      versions: {
        canonical: meiVersion(canonical),
        exported: meiVersion(exported),
        reloaded: meiVersion(reloadedMei),
        xmlnsSchenker: schenkerNs(exported),
      },
      inserts: { upperInsert, lowerInsert },
      blob: {
        equal: blobText === exported,
        charLength: exported.length,
        byteLength: new TextEncoder().encode(exported).length,
        mimeType: blob.type,
      },
      prepare: {
        sameString: reprepared === exported,
        pbCount: sourceOutline.pbCount,
        repreparedPbCount: repreparedOutline.pbCount,
        neonNeumeLineCount: sourceOutline.neonNeumeLineCount,
        runtimeStaffCount: sourceOutline.runtimeStaffCount,
      },
      meiNotes: exportedNotes,
      staffs0,
      before,
      after,
      upperRoundTrip: { before: upperBefore, after: upperAfter, mei: upperMei },
      lowerRoundTrip: { before: lowerBefore, after: lowerAfter, mei: lowerMei },
    };
    publish(report);
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
