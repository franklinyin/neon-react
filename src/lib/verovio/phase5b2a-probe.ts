/**
 * PHASE S5B2A DEV probe. Not production.
 * Verify Schenker undo/redo transaction boundaries and safe state restoration.
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

type MeiNote = {
  id: string | null;
  staffId: string | null;
  schenkerXNum: number;
};

type Snapshot = {
  staffs: ReturnType<typeof measureRenderedStaffs>;
  viewBox: string | null;
  noteCount: number;
  slurs: MeiSlur[];
  notes: MeiNote[];
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

function parseMeiNotes(mei: string): MeiNote[] {
  const doc = new DOMParser().parseFromString(mei, 'text/xml');
  return Array.from(doc.getElementsByTagName('note'))
    .filter((note) => note.getAttribute('type') === 'schenker')
    .map((note) => {
      const schenkerX = note.getAttribute('schenker:x') || '';
      return {
        id: note.getAttribute('xml:id'),
        staffId: note.closest('staff')?.getAttribute('xml:id') || null,
        schenkerXNum: Number(schenkerX),
      };
    });
}

function hasManualSlurGeometry(slur: MeiSlur | undefined): boolean {
  if (!slur) {
    return false;
  }
  return Boolean(
    slur.bezier || slur.startho || slur.startvo || slur.endho || slur.endvo,
  );
}

function lowerStaffNoteIds(overlay: SVGSVGElement, staffId: string): string[] {
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
  const notes = parseMeiNotes(mei);
  return {
    staffs: measureRenderedStaffs(overlay),
    viewBox: overlay.getAttribute('viewBox'),
    noteCount: notes.length,
    slurs: parseMeiSlurs(mei),
    notes,
  };
}

function sameStaffs(
  a: ReturnType<typeof measureRenderedStaffs>,
  b: ReturnType<typeof measureRenderedStaffs>,
): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

function noteCountFromSvg(overlay: SVGSVGElement): number {
  return overlay.querySelectorAll('.note').length;
}

export async function runPhase5B2A(): Promise<void> {
  const lowerStaffId = 'staff-0000001081017002';
  const upperStaffId = 'staff-0000001672035493';
  const client = new VerovioClient();
  let host: HTMLDivElement | null = null;
  const steps: Record<string, unknown>[] = [];

  try {
    const sourceRes = await fetch(`${import.meta.env.BASE_URL}samples/CF-005.mei`);
    const prepared = prepareMeiForVerovio(await sourceRes.text());
    await client.waitUntilReady();
    const svg0 = await client.renderData(prepared);
    let { overlay } = mountVerovioOverlay(svg0);
    host = overlay.parentElement as HTMLDivElement;

    const initial = await snapshot(client, overlay);
    const initialLowerNoteIds = lowerStaffNoteIds(overlay, lowerStaffId);
    const initialNoteCountSvg = noteCountFromSvg(overlay);
    const initialUpperNoteIds = new Set(
      Array.from(overlay.querySelectorAll<SVGGElement>('.note'))
        .filter((note) => note.closest('.staff')?.id === upperStaffId)
        .map((note) => note.id),
    );
    if (initialLowerNoteIds.length < 2) {
      throw new Error(
        `Expected at least two lower-staff notes in SVG, found ${initialLowerNoteIds.length}`,
      );
    }
    steps.push({
      label: 'initial',
      editInfo: await client.editInfo(),
      initialLowerNoteIds,
      snapshot: initial,
    });

    await editAndRender(
      client,
      buildStructuralNoteInsertAction({
        staffId: upperStaffId,
        x: 800,
        y: 920,
        loc: 9,
        kind: 'open',
      }),
    );
    ({ overlay } = mountVerovioOverlay(await client.renderToSVG(1)));
    const afterA = await snapshot(client, overlay);
    const insertedNoteId =
      Array.from(overlay.querySelectorAll<SVGGElement>('.note'))
        .filter((note) => note.closest('.staff')?.id === upperStaffId)
        .map((note) => note.id)
        .find((id) => id && !initialUpperNoteIds.has(id)) || null;
    steps.push({
      label: 'A-insert',
      editInfo: await client.editInfo(),
      insertedNoteId,
      afterANoteCountSvg: noteCountFromSvg(overlay),
      snapshot: afterA,
    });

    const slurNotes = initialLowerNoteIds.slice(-2);
    const slurInfo = await editAndRender(client, buildSlurNotesAction(slurNotes));
    ({ overlay } = mountVerovioOverlay(await client.renderToSVG(1)));
    const afterB = await snapshot(client, overlay);
    const slurId = slurInfo.uuid || afterB.slurs[0]?.id;
    if (!slurId) {
      throw new Error('Could not determine slur id after create');
    }
    const slurStart = afterB.slurs[0]?.startid;
    const slurEnd = afterB.slurs[0]?.endid;
    steps.push({ label: 'B-slur', slurId, slurStart, slurEnd, snapshot: afterB });

    const defaultPoints = readSlurBezierFromMetadata(overlay, slurId);
    if (!defaultPoints) {
      throw new Error('Missing default slur bezier metadata');
    }
    await editAndRender(client, buildSchenkerSlurCurveAction(slurId, swanPoints(defaultPoints)));
    ({ overlay } = mountVerovioOverlay(await client.renderToSVG(1)));
    const afterC = await snapshot(client, overlay);
    steps.push({
      label: 'C-swan',
      hasManualGeometry: hasManualSlurGeometry(afterC.slurs[0]),
      snapshot: afterC,
    });

    await editAndRender(client, buildSchenkerSlurResetAction(slurId));
    ({ overlay } = mountVerovioOverlay(await client.renderToSVG(1)));
    const afterD = await snapshot(client, overlay);
    steps.push({
      label: 'D-reset',
      hasManualGeometry: hasManualSlurGeometry(afterD.slurs[0]),
      snapshot: afterD,
    });

    const undoExpectations = [
      {
        label: 'undo-1-swan',
        slurCount: 1,
        manualGeometry: true,
        insertedNotePresent: true,
      },
      {
        label: 'undo-2-default-slur',
        slurCount: 1,
        manualGeometry: false,
        insertedNotePresent: true,
      },
      {
        label: 'undo-3-no-slur',
        slurCount: 0,
        manualGeometry: false,
        insertedNotePresent: true,
      },
      {
        label: 'undo-4-no-insert',
        slurCount: 0,
        manualGeometry: false,
        insertedNotePresent: false,
      },
    ];

    const undoResults: Record<string, unknown>[] = [];
    const failures: string[] = [];

    for (const expected of undoExpectations) {
      const info = await editAndRender(client, { action: 'undo' } as VerovioEditorAction);
      ({ overlay } = mountVerovioOverlay(await client.renderToSVG(1)));
      const snap = await snapshot(client, overlay);
      const slur = snap.slurs[0];
      const hasInsert = Boolean(
        insertedNoteId && overlay.querySelector(`#${CSS.escape(insertedNoteId)}.note`),
      );
      const entry = {
        label: expected.label,
        editInfo: info,
        slurCount: snap.slurs.length,
        hasManualGeometry: hasManualSlurGeometry(slur),
        insertedNotePresent: hasInsert,
        slurStart: slur?.startid ?? null,
        slurEnd: slur?.endid ?? null,
        snapshot: snap,
      };
      undoResults.push(entry);
      if (snap.slurs.length !== expected.slurCount) {
        failures.push(`${expected.label}:slur-count`);
      }
      if (hasManualSlurGeometry(slur) !== expected.manualGeometry) {
        failures.push(`${expected.label}:manual-geometry`);
      }
      if (hasInsert !== expected.insertedNotePresent) {
        failures.push(`${expected.label}:insert-note`);
      }
      if (!sameStaffs(initial.staffs, snap.staffs)) {
        failures.push(`${expected.label}:staff-bbox`);
      }
      if (initial.viewBox !== snap.viewBox) {
        failures.push(`${expected.label}:viewBox`);
      }
      if (slur && slurStart && slur.startid !== slurStart) {
        failures.push(`${expected.label}:startid-changed`);
      }
      if (slur && slurEnd && slur.endid !== slurEnd) {
        failures.push(`${expected.label}:endid-changed`);
      }
    }

    const redoResults: Record<string, unknown>[] = [];
    const redoExpectations = [
      { label: 'redo-1-insert', noteCountSvg: initialNoteCountSvg + 1, slurCount: 0 },
      { label: 'redo-2-slur', noteCountSvg: initialNoteCountSvg + 1, slurCount: 1, manual: false },
      { label: 'redo-3-swan', noteCountSvg: initialNoteCountSvg + 1, slurCount: 1, manual: true },
      { label: 'redo-4-reset', noteCountSvg: initialNoteCountSvg + 1, slurCount: 1, manual: false },
    ];

    for (const expected of redoExpectations) {
      const info = await editAndRender(client, { action: 'redo' } as VerovioEditorAction);
      ({ overlay } = mountVerovioOverlay(await client.renderToSVG(1)));
      const snap = await snapshot(client, overlay);
      const slur = snap.slurs[0];
      const entry = {
        label: expected.label,
        editInfo: info,
        noteCountSvg: noteCountFromSvg(overlay),
        slurCount: snap.slurs.length,
        hasManualGeometry: hasManualSlurGeometry(slur),
        snapshot: snap,
      };
      redoResults.push(entry);
      if (noteCountFromSvg(overlay) !== expected.noteCountSvg) {
        failures.push(`${expected.label}:note-count`);
      }
      if (snap.slurs.length !== expected.slurCount) {
        failures.push(`${expected.label}:slur-count`);
      }
      if (expected.manual !== undefined && hasManualSlurGeometry(slur) !== expected.manual) {
        failures.push(`${expected.label}:manual-geometry`);
      }
      if (!sameStaffs(initial.staffs, snap.staffs)) {
        failures.push(`${expected.label}:staff-bbox`);
      }
    }

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
      steps,
    });
  } finally {
    client.dispose();
    host?.remove();
  }
}
