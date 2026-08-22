/**
 * Unbeamed Schenker note move. Run with ?notemove=1
 */
import { VerovioClient } from './VerovioClient';
import { prepareMeiForVerovio } from '../mei/prepareMeiForVerovio';
import { measureRenderedStaffs } from '../schenker/geometry';
import { buildStructuralNoteInsertAction } from '../schenker/structuralNote';
import { buildSchenkerNoteMoveAction } from '../schenker/move';

function publish(report: unknown): void {
  console.log('[note-move]', report);
  (window as Window & { __NOTE_MOVE__?: unknown }).__NOTE_MOVE__ = report;
}

function mount(svgText: string): { overlay: SVGSVGElement; host: HTMLDivElement } {
  document.getElementById('note-move-mount')?.remove();
  const parsed = new DOMParser().parseFromString(svgText, 'image/svg+xml');
  const overlay = document.importNode(parsed.documentElement, true);
  if (!(overlay instanceof SVGSVGElement)) {
    throw new Error('overlay is not SVG');
  }
  overlay.classList.add('neon-container', 'active-page');
  const host = document.createElement('div');
  host.id = 'note-move-mount';
  host.style.cssText = 'position:absolute;left:-12000px;top:0;width:3232px;height:2480px;';
  document.body.appendChild(host);
  host.appendChild(overlay);
  return { overlay, host };
}

function parseNotes(mei: string) {
  const doc = new DOMParser().parseFromString(mei, 'text/xml');
  return Array.from(doc.getElementsByTagName('note'))
    .filter((note) => note.getAttribute('type') === 'schenker')
    .map((note) => ({
      id: note.getAttribute('xml:id'),
      loc: note.getAttribute('loc'),
      schenkerX: note.getAttribute('schenker:x'),
    }));
}

export async function runNoteMove(): Promise<void> {
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

    const inserted = await client.edit(
      buildStructuralNoteInsertAction({
        staffId: lowerStaffId,
        x: 2100,
        y: 1560,
        loc: 2,
        kind: 'open',
      }),
    );
    if (!inserted) throw new Error('insert failed');
    ({ overlay } = mount(await client.renderToSVG(1)));
    const noteId = overlay.querySelector('.note')?.id;
    if (!noteId) throw new Error('no note');

    const before = parseNotes(await client.getMEI())[0];
    const moved = await client.edit(buildSchenkerNoteMoveAction(noteId, 6, 2380.5));
    if (!moved) throw new Error('schenkerNoteMove failed');
    ({ overlay } = mount(await client.renderToSVG(1)));
    if (!overlay.querySelector(`#${CSS.escape(noteId)}.note`)) {
      failures.push('note-missing-after-move');
    }
    const after = parseNotes(await client.getMEI())[0];
    if (after?.loc !== '6') failures.push(`loc:${after?.loc}`);
    if (Number(after?.schenkerX) !== 2380.5) failures.push(`schenkerX:${after?.schenkerX}`);
    if (after?.id !== before?.id) failures.push('id-changed');

    const staffsAfter = measureRenderedStaffs(overlay);
    if (JSON.stringify(staffsBefore) !== JSON.stringify(staffsAfter)) {
      failures.push('staff-bbox-changed');
    }

    publish({
      ok: failures.length === 0,
      failures,
      before,
      after,
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
