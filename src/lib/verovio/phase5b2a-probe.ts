/**
 * PHASE S5B2A DEV probe. Not production.
 * Verify Schenker undo/redo transaction boundaries and safe state restoration.
 * Self-seeds notes so it works with the empty canonical CF-005.mei.
 * Run only with ?phase5b2a=1
 */
import { VerovioClient, type VerovioEditorAction } from './VerovioClient';
import { prepareMeiForVerovio } from '../mei/prepareMeiForVerovio';
import { measureRenderedStaffs } from '../schenker/geometry';
import { buildStructuralNoteInsertAction } from '../schenker/structuralNote';
import {
  buildSchenkerSlurCurveAction,
  buildSchenkerSlurResetAction,
  buildSlurNotesAction,
  readSlurBezierFromMetadata,
  type SlurBezierPoints,
} from '../schenker/slur';

type EditInfo = {
  canUndo?: boolean;
  canRedo?: boolean;
  status?: string;
  uuid?: string;
};

type MeiSlur = {
  id: string | null;
  startid: string | null;
  endid: string | null;
  bezier: string | null;
  startho: string | null;
  startvo: string | null;
  endho: string | null;
  endvo: string | null;
};

type Snapshot = {
  staffs: ReturnType<typeof measureRenderedStaffs>;
  viewBox: string | null;
  slurCount: number;
  noteCountSvg: number;
  slurs: MeiSlur[];
};

function publish(report: unknown): void {
  console.log('[phase5b2a]', report);
  (window as Window & { __PHASE5B2A__?: unknown }).__PHASE5B2A__ = report;
}

function mountVerovioOverlay(svgText: string): { overlay: SVGSVGElement; host: HTMLDivElement } {
  document.getElementById('phase5b2a-mount')?.remove();
  const parsed = new DOMParser().parseFromString(svgText, 'image/svg+xml');
  const overlay = document.importNode(parsed.documentElement, true);
  if (!(overlay instanceof SVGSVGElement)) {
    throw new Error('Verovio overlay root is not an SVG element');
  }
  overlay.classList.add('neon-container', 'active-page');
  const host = document.createElement('div');
  host.id = 'phase5b2a-mount';
  host.style.cssText = 'position:absolute;left:-12000px;top:0;width:3232px;height:2480px;';
  document.body.appendChild(host);
  host.appendChild(overlay);
  return { overlay, host };
}

function parseMeiSlurs(mei: string): MeiSlur[] {
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

function hasManualSlurGeometry(slur: MeiSlur | undefined): boolean {
  if (!slur) {
    return false;
  }
  return Boolean(slur.bezier || slur.startho || slur.startvo || slur.endho || slur.endvo);
}

function noteIdsOnStaff(overlay: SVGSVGElement, staffId: string): string[] {
  return Array.from(overlay.querySelectorAll<SVGGElement>('.note'))
    .filter((note) => note.closest('.staff')?.id === staffId)
    .map((note) => note.id)
    .filter(Boolean)
    .sort((a, b) => {
      const noteA = overlay.querySelector<SVGGraphicsElement>(`#${CSS.escape(a)}`);
      const noteB = overlay.querySelector<SVGGraphicsElement>(`#${CSS.escape(b)}`);
      return (noteA?.getBBox().x ?? 0) - (noteB?.getBBox().x ?? 0);
    });
}

function noteCountFromSvg(overlay: SVGSVGElement): number {
  return overlay.querySelectorAll('.note').length;
}

function swanPoints(points: SlurBezierPoints): SlurBezierPoints {
  const [p0, c1, c2, p3] = points;
  return [
    p0,
    { x: c1.x + 180, y: c1.y - 220 },
    { x: c2.x - 160, y: c2.y + 240 },
    p3,
  ];
}

async function editAndRender(client: VerovioClient, action: VerovioEditorAction): Promise<EditInfo> {
  const ok = await client.edit(action);
  if (!ok) {
    throw new Error(`edit failed: ${JSON.stringify(action)}`);
  }
  await client.renderToSVG(1);
  return (await client.editInfo()) as EditInfo;
}

async function snapshot(client: VerovioClient, overlay: SVGSVGElement): Promise<Snapshot> {
  const mei = await client.getMEI();
  const slurs = parseMeiSlurs(mei);
  return {
    staffs: measureRenderedStaffs(overlay),
    viewBox: overlay.getAttribute('viewBox'),
    slurCount: slurs.length,
    noteCountSvg: noteCountFromSvg(overlay),
    slurs,
  };
}

function sameStaffs(
  a: ReturnType<typeof measureRenderedStaffs>,
  b: ReturnType<typeof measureRenderedStaffs>,
  eps = 1,
): boolean {
  if (a.length !== b.length) {
    return false;
  }
  return a.every((staff, index) => {
    const other = b[index];
    return (
      staff.id === other.id
      && Math.abs(staff.ulx - other.ulx) <= eps
      && Math.abs(staff.uly - other.uly) <= eps
      && Math.abs(staff.lrx - other.lrx) <= eps
      && Math.abs(staff.lry - other.lry) <= eps
    );
  });
}

function staffDelta(
  a: ReturnType<typeof measureRenderedStaffs>,
  b: ReturnType<typeof measureRenderedStaffs>,
): Array<Record<string, number | string>> {
  const n = Math.max(a.length, b.length);
  const out: Array<Record<string, number | string>> = [];
  for (let i = 0; i < n; i += 1) {
    const left = a[i];
    const right = b[i];
    if (!left || !right) {
      out.push({ index: i, missing: left ? 'b' : 'a' });
      continue;
    }
    out.push({
      id: left.id,
      dulx: right.ulx - left.ulx,
      duly: right.uly - left.uly,
      dlrx: right.lrx - left.lrx,
      dlry: right.lry - left.lry,
    });
  }
  return out;
}

export async function runPhase5B2A(): Promise<void> {
  const lowerStaffId = 'staff-0000001081017002';
  const client = new VerovioClient();
  let host: HTMLDivElement | null = null;
  const steps: Record<string, unknown>[] = [];
  const failures: string[] = [];

  try {
    const sourceRes = await fetch(`${import.meta.env.BASE_URL}samples/CF-005.mei`);
    const prepared = prepareMeiForVerovio(await sourceRes.text());
    await client.waitUntilReady();
    let { overlay } = mountVerovioOverlay(await client.renderData(prepared));
    host = overlay.parentElement as HTMLDivElement;

    const initial = await snapshot(client, overlay);
    steps.push({ label: 'initial', editInfo: await client.editInfo(), snapshot: initial });

    // A: insert first slur endpoint
    const insertA = await editAndRender(
      client,
      buildStructuralNoteInsertAction({
        staffId: lowerStaffId,
        x: 2100,
        y: 1560,
        loc: 2,
        kind: 'open',
      }),
    );
    ({ overlay } = mountVerovioOverlay(await client.renderToSVG(1)));
    const afterA = await snapshot(client, overlay);
    const noteAId = insertA.uuid || noteIdsOnStaff(overlay, lowerStaffId)[0];
    if (!noteAId) {
      throw new Error('Insert A did not produce a note id');
    }
    steps.push({ label: 'A-insert-1', noteAId, editInfo: insertA, snapshot: afterA });

    // Setup second endpoint (own undo step; acceptance sequence focuses on A–D around slur)
    const insertB = await editAndRender(
      client,
      buildStructuralNoteInsertAction({
        staffId: lowerStaffId,
        x: 2450,
        y: 1520,
        loc: 7,
        kind: 'open',
      }),
    );
    ({ overlay } = mountVerovioOverlay(await client.renderToSVG(1)));
    const afterSetup = await snapshot(client, overlay);
    const noteBId =
      insertB.uuid
      || noteIdsOnStaff(overlay, lowerStaffId).find((id) => id !== noteAId)
      || null;
    if (!noteBId) {
      throw new Error('Insert B did not produce a second note id');
    }
    steps.push({ label: 'A2-insert-2', noteBId, editInfo: insertB, snapshot: afterSetup });

    // B: create slur
    const slurInfo = await editAndRender(client, buildSlurNotesAction([noteAId, noteBId]));
    ({ overlay } = mountVerovioOverlay(await client.renderToSVG(1)));
    const afterSlur = await snapshot(client, overlay);
    const slurId = slurInfo.uuid || afterSlur.slurs[0]?.id;
    if (!slurId) {
      throw new Error('Could not determine slur id after create');
    }
    const slurStart = afterSlur.slurs[0]?.startid;
    const slurEnd = afterSlur.slurs[0]?.endid;
    steps.push({ label: 'B-slur', slurId, slurStart, slurEnd, snapshot: afterSlur });

    // C: swan reshape
    const defaultPoints = readSlurBezierFromMetadata(overlay, slurId);
    if (!defaultPoints) {
      throw new Error('Missing default slur bezier metadata');
    }
    await editAndRender(client, buildSchenkerSlurCurveAction(slurId, swanPoints(defaultPoints)));
    ({ overlay } = mountVerovioOverlay(await client.renderToSVG(1)));
    const afterSwan = await snapshot(client, overlay);
    if (!hasManualSlurGeometry(afterSwan.slurs[0])) {
      failures.push('C-swan:expected-manual-geometry');
    }
    steps.push({
      label: 'C-swan',
      hasManualGeometry: hasManualSlurGeometry(afterSwan.slurs[0]),
      snapshot: afterSwan,
    });

    // D: reset
    await editAndRender(client, buildSchenkerSlurResetAction(slurId));
    ({ overlay } = mountVerovioOverlay(await client.renderToSVG(1)));
    const afterReset = await snapshot(client, overlay);
    if (hasManualSlurGeometry(afterReset.slurs[0])) {
      failures.push('D-reset:expected-no-manual-geometry');
    }
    steps.push({
      label: 'D-reset',
      hasManualGeometry: hasManualSlurGeometry(afterReset.slurs[0]),
      snapshot: afterReset,
    });

    // Undo: D→C→B→A2→A (5 steps because two inserts precede slur)
    const undoExpectations = [
      { label: 'undo-1-swan', slurCount: 1, manual: true, notes: 2 },
      { label: 'undo-2-default-slur', slurCount: 1, manual: false, notes: 2 },
      { label: 'undo-3-no-slur', slurCount: 0, manual: false, notes: 2 },
      { label: 'undo-4-noteB-gone', slurCount: 0, manual: false, notes: 1 },
      { label: 'undo-5-noteA-gone', slurCount: 0, manual: false, notes: 0 },
    ];

    const undoResults: Record<string, unknown>[] = [];
    for (const expected of undoExpectations) {
      const info = await editAndRender(client, { action: 'undo' });
      ({ overlay } = mountVerovioOverlay(await client.renderToSVG(1)));
      const snap = await snapshot(client, overlay);
      const slur = snap.slurs[0];
      undoResults.push({
        label: expected.label,
        editInfo: info,
        slurCount: snap.slurCount,
        noteCountSvg: snap.noteCountSvg,
        hasManualGeometry: hasManualSlurGeometry(slur),
        slurStart: slur?.startid ?? null,
        slurEnd: slur?.endid ?? null,
        snapshot: snap,
      });
      if (snap.slurCount !== expected.slurCount) {
        failures.push(`${expected.label}:slur-count`);
      }
      if (hasManualSlurGeometry(slur) !== expected.manual) {
        failures.push(`${expected.label}:manual-geometry`);
      }
      if (snap.noteCountSvg !== expected.notes) {
        failures.push(`${expected.label}:note-count`);
      }
      if (!sameStaffs(initial.staffs, snap.staffs)) {
        failures.push(`${expected.label}:staff-bbox`);
        steps.push({
          label: `${expected.label}-staff-delta`,
          delta: staffDelta(initial.staffs, snap.staffs),
          initialStaffs: initial.staffs,
          snapStaffs: snap.staffs,
        });
      }
      if (slur && slurStart && slur.startid !== slurStart) {
        failures.push(`${expected.label}:startid-changed`);
      }
      if (slur && slurEnd && slur.endid !== slurEnd) {
        failures.push(`${expected.label}:endid-changed`);
      }
    }

    // Redo restores all five operations
    const redoResults: Record<string, unknown>[] = [];
    const redoExpectations = [
      { label: 'redo-1-noteA', notes: 1, slurCount: 0 },
      { label: 'redo-2-noteB', notes: 2, slurCount: 0 },
      { label: 'redo-3-slur', notes: 2, slurCount: 1, manual: false },
      { label: 'redo-4-swan', notes: 2, slurCount: 1, manual: true },
      { label: 'redo-5-reset', notes: 2, slurCount: 1, manual: false },
    ];
    for (const expected of redoExpectations) {
      const info = await editAndRender(client, { action: 'redo' });
      ({ overlay } = mountVerovioOverlay(await client.renderToSVG(1)));
      const snap = await snapshot(client, overlay);
      const slur = snap.slurs[0];
      redoResults.push({
        label: expected.label,
        editInfo: info,
        noteCountSvg: snap.noteCountSvg,
        slurCount: snap.slurCount,
        hasManualGeometry: hasManualSlurGeometry(slur),
        snapshot: snap,
      });
      if (snap.noteCountSvg !== expected.notes) {
        failures.push(`${expected.label}:note-count`);
      }
      if (snap.slurCount !== expected.slurCount) {
        failures.push(`${expected.label}:slur-count`);
      }
      if (expected.manual !== undefined && hasManualSlurGeometry(slur) !== expected.manual) {
        failures.push(`${expected.label}:manual-geometry`);
      }
      if (!sameStaffs(initial.staffs, snap.staffs)) {
        failures.push(`${expected.label}:staff-bbox`);
        steps.push({
          label: `${expected.label}-staff-delta`,
          delta: staffDelta(initial.staffs, snap.staffs),
          initialStaffs: initial.staffs,
          snapStaffs: snap.staffs,
        });
      }
    }

    // New edit after Undo must clear the redo branch
    await editAndRender(client, { action: 'undo' }); // back to swan
    ({ overlay } = mountVerovioOverlay(await client.renderToSVG(1)));
    const afterUndoBeforeBranch = (await client.editInfo()) as EditInfo;
    if (!afterUndoBeforeBranch.canRedo) {
      failures.push('branch:expected-canRedo-after-undo');
    }
    await editAndRender(
      client,
      buildStructuralNoteInsertAction({
        staffId: lowerStaffId,
        x: 2800,
        y: 1560,
        loc: 4,
        kind: 'filled',
      }),
    );
    const afterBranchEdit = (await client.editInfo()) as EditInfo;
    if (afterBranchEdit.canRedo) {
      failures.push('branch:expected-canRedo-false-after-new-edit');
    }
    steps.push({
      label: 'branch-clear-redo',
      afterUndoBeforeBranch,
      afterBranchEdit,
    });

    publish({
      ok: failures.length === 0,
      failures,
      steps,
      undoResults,
      redoResults,
      transactionNote:
        'Each neon-neume-line SetEditInfo() clears m_undoPrepared so successive edits are separate undo steps.',
      undoPathNote:
        'undo/redo on IsNeumeLines() skips SetFocus/PrepareData/ScoreDefSetCurrentDoc; only DeprecateLayout().',
    });
  } catch (err) {
    publish({
      ok: false,
      error: err instanceof Error ? err.message : String(err),
      failures,
      steps,
    });
  } finally {
    client.dispose();
    host?.remove();
  }
}
