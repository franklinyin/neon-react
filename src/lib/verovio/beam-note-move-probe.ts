/**
 * Beamed Schenker note move. Run with ?beammove=1
 * Beam stays intact, staff bbox unchanged, Swan MEI geometry is kept.
 */
import { VerovioClient } from './VerovioClient';
import { prepareMeiForVerovio } from '../mei/prepareMeiForVerovio';
import { measureRenderedStaffs } from '../schenker/geometry';
import { buildBeamNotesAction } from '../schenker/beam';
import { buildSchenkerNoteMoveAction } from '../schenker/move';
import { buildStructuralNoteInsertAction } from '../schenker/structuralNote';
import {
  buildSchenkerSlurCurveAction,
  buildSlurNotesAction,
  readSlurBezierFromMetadata,
  type SlurBezierPoints,
} from '../schenker/slur';

function publish(report: unknown): void {
  console.log('[beam-note-move]', report);
  (window as Window & { __BEAM_NOTE_MOVE__?: unknown }).__BEAM_NOTE_MOVE__ = report;
}

function mount(svgText: string): { overlay: SVGSVGElement; host: HTMLDivElement } {
  document.getElementById('beam-note-move-mount')?.remove();
  const parsed = new DOMParser().parseFromString(svgText, 'image/svg+xml');
  const overlay = document.importNode(parsed.documentElement, true);
  if (!(overlay instanceof SVGSVGElement)) {
    throw new Error('overlay is not SVG');
  }
  overlay.classList.add('neon-container', 'active-page');
  const host = document.createElement('div');
  host.id = 'beam-note-move-mount';
  host.style.cssText = 'position:absolute;left:-12000px;top:0;width:3232px;height:2480px;';
  document.body.appendChild(host);
  host.appendChild(overlay);
  return { overlay, host };
}

function parseSchenkerNotes(mei: string) {
  const doc = new DOMParser().parseFromString(mei, 'text/xml');
  return Array.from(doc.getElementsByTagName('note'))
    .filter((note) => note.getAttribute('type') === 'schenker')
    .map((note) => ({
      id: note.getAttribute('xml:id'),
      loc: note.getAttribute('loc'),
      schenkerX: note.getAttribute('schenker:x'),
      parent: note.parentElement?.localName || '',
    }));
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

function parseBeams(mei: string) {
  const doc = new DOMParser().parseFromString(mei, 'text/xml');
  return Array.from(doc.getElementsByTagName('beam')).map((beam) => ({
    id: beam.getAttribute('xml:id'),
    noteIds: Array.from(beam.getElementsByTagName('note')).map((note) => note.getAttribute('xml:id')),
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

export async function runBeamNoteMove(): Promise<void> {
  const lowerStaffId = 'staff-0000001081017002';
  const client = new VerovioClient();
  let host: HTMLDivElement | null = null;
  const failures: string[] = [];

  try {
    const raw = await (await fetch(`${import.meta.env.BASE_URL}samples/CF-005.mei`)).text();
    await client.waitUntilReady();
    let { overlay } = mount(await client.renderData(prepareMeiForVerovio(raw)));
    host = overlay.parentElement as HTMLDivElement;
    const staffsBefore = measureRenderedStaffs(overlay);

    for (const spec of [
      { x: 2000, y: 1560, loc: 2 },
      { x: 2300, y: 1520, loc: 6 },
    ] as const) {
      const ok = await client.edit(
        buildStructuralNoteInsertAction({
          staffId: lowerStaffId,
          x: spec.x,
          y: spec.y,
          loc: spec.loc,
          kind: 'quaverFlag',
        }),
      );
      if (!ok) throw new Error(`insert failed at ${spec.x}`);
      ({ overlay } = mount(await client.renderToSVG(1)));
    }

    const noteIds = Array.from(overlay.querySelectorAll<SVGGElement>('.note'))
      .filter((note) => note.closest('.staff')?.id === lowerStaffId)
      .map((note) => note.id);
    if (noteIds.length < 2) throw new Error(`need two notes, got ${noteIds.length}`);

    if (!(await client.edit(buildBeamNotesAction(noteIds.slice(0, 2))))) {
      throw new Error('beam failed');
    }
    ({ overlay } = mount(await client.renderToSVG(1)));
    if (!overlay.querySelector('.beam')) failures.push('beam-missing-before-move');

    if (!(await client.edit(buildSlurNotesAction(noteIds.slice(0, 2))))) {
      throw new Error('slur failed');
    }
    ({ overlay } = mount(await client.renderToSVG(1)));
    const slurEl = overlay.querySelector('.slur');
    const slurId = slurEl?.id;
    if (!slurId) throw new Error('no slur');
    const defaultPts = readSlurBezierFromMetadata(overlay, slurId);
    if (!defaultPts) throw new Error('missing default slur metadata');
    if (!(await client.edit(buildSchenkerSlurCurveAction(slurId, swan(defaultPts))))) {
      throw new Error('swan persist failed');
    }
    ({ overlay } = mount(await client.renderToSVG(1)));
    const swanMei = parseSlurs(await client.getMEI())[0];
    if (!swanMei?.bezier) failures.push('swan-missing-before-move');

    const moveId = noteIds[1];
    if (!(await client.edit(buildSchenkerNoteMoveAction(moveId, 8, 2488.25)))) {
      throw new Error('schenkerNoteMove failed for beamed note');
    }
    ({ overlay } = mount(await client.renderToSVG(1)));

    const beams = parseBeams(await client.getMEI());
    if (beams.length !== 1) failures.push(`beam-count:${beams.length}`);
    if (beams[0]?.noteIds.length !== 2) failures.push(`beam-notes:${beams[0]?.noteIds.length}`);
    if (!beams[0]?.noteIds.includes(moveId)) failures.push('moved-note-left-beam');
    if (!overlay.querySelector('.beam')) failures.push('beam-missing-after-move');
    if (!overlay.querySelector(`#${CSS.escape(moveId)}.note`)) failures.push('note-missing-after-move');

    const moved = parseSchenkerNotes(await client.getMEI()).find((note) => note.id === moveId);
    if (moved?.loc !== '8') failures.push(`loc:${moved?.loc}`);
    if (Number(moved?.schenkerX) !== 2488.25) failures.push(`schenkerX:${moved?.schenkerX}`);
    if (moved?.parent !== 'beam') failures.push(`parent:${moved?.parent}`);

    const slurAfter = parseSlurs(await client.getMEI())[0];
    if (slurAfter?.startid !== swanMei.startid || slurAfter?.endid !== swanMei.endid) {
      failures.push('slur-ids-changed');
    }
    if (slurAfter?.bezier !== swanMei.bezier) failures.push('swan-bezier-lost');
    if (slurAfter?.startho !== swanMei.startho) failures.push('swan-startho-lost');
    if (slurAfter?.startvo !== swanMei.startvo) failures.push('swan-startvo-lost');
    if (slurAfter?.endho !== swanMei.endho) failures.push('swan-endho-lost');
    if (slurAfter?.endvo !== swanMei.endvo) failures.push('swan-endvo-lost');
    if (!overlay.querySelector('.slur')) failures.push('slur-missing-after-move');

    const staffsAfter = measureRenderedStaffs(overlay);
    if (JSON.stringify(staffsBefore) !== JSON.stringify(staffsAfter)) {
      failures.push('staff-bbox-changed');
    }

    publish({
      ok: failures.length === 0,
      failures,
      beams,
      moved,
      swanMei,
      slurAfter,
      staffsBefore,
      staffsAfter,
    });
  } catch (err) {
    publish({
      ok: false,
      error: err instanceof Error ? err.message : String(err),
      failures,
    });
  } finally {
    client.dispose();
    host?.remove();
  }
}
