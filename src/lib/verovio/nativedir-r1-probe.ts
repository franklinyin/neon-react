/**
 * Native Dir R1 — static standard <dir> via full renderData.
 * Temporary experiment. Open ?nativedir=1
 *
 * No DrawSchenkerLabel. No type=schenker-label. No drag/tether/ho/vo.
 */
import { VerovioClient } from './VerovioClient';
import { prepareMeiForVerovio } from '../mei/prepareMeiForVerovio';
import { measureRenderedStaffs, type StaffBBox } from '../schenker/geometry';
import { buildStructuralNoteInsertAction } from '../schenker/structuralNote';

const UPPER = 'staff-0000001672035493';
const EXPECTED: StaffBBox[] = [
  { id: 'staff-0000001672035493', ulx: 185, uly: 816, lrx: 3229, lry: 1024 },
  { id: 'staff-0000001081017002', ulx: 180, uly: 1452, lrx: 3230, lry: 1668 },
];

type Report = {
  ok: boolean;
  classification: string;
  noteId: string | null;
  dirId: string | null;
  meiDir: Record<string, string | null> | null;
  svg: {
    hasDirGroup: boolean;
    groupId: string | null;
    classes: string | null;
    text: string | null;
    textX: string | null;
    textY: string | null;
    fontSize: string | null;
  };
  startResolvedHint: string;
  staffsBefore: StaffBBox[];
  staffsAfter: StaffBBox[];
  staffsMatchExpected: boolean;
  error: string | null;
};

function publish(report: Report): void {
  console.log('[nativedir-r1]', report);
  (window as Window & { __NATIVEDIR_R1__?: Report }).__NATIVEDIR_R1__ = report;
  document.title = report.ok ? 'NATIVEDIR_R1 OK — look for the 3' : `NATIVEDIR_R1 ${report.classification}`;
}

function staffsEqual(a: StaffBBox[], b: StaffBBox[]): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

function injectStandardDir(mei: string, noteId: string): { mei: string; dirId: string } {
  const doc = new DOMParser().parseFromString(mei, 'text/xml');
  const notes = Array.from(doc.getElementsByTagName('note'));
  const note =
    notes.find((n) => n.getAttribute('xml:id') === noteId) ||
    notes.find((n) => n.getAttribute('id') === noteId) ||
    notes.find((n) => n.getAttributeNS('http://www.w3.org/XML/1998/namespace', 'id') === noteId);
  if (!note) {
    const sample = notes.slice(0, 5).map((n) => ({
      xmlId: n.getAttribute('xml:id'),
      id: n.getAttribute('id'),
      nsId: n.getAttributeNS('http://www.w3.org/XML/1998/namespace', 'id'),
      type: n.getAttribute('type'),
    }));
    throw new Error(`note ${noteId} not found in MEI; sample=${JSON.stringify(sample)}`);
  }

  // Prefer real <measure> if present; otherwise neon-neume-line score-based
  // export places notes under section>staff>layer with no measure wrapper.
  let measure: Element | null = note.parentElement;
  while (measure && measure.localName !== 'measure') {
    measure = measure.parentElement;
  }

  let parent: Element | null = measure;
  if (!parent) {
    let staff: Element | null = note.parentElement;
    while (staff && staff.localName !== 'staff') {
      staff = staff.parentElement;
    }
    parent = staff?.parentElement ?? null;
    if (!parent || parent.localName !== 'section') {
      throw new Error('could not find measure or neon-neume-line section for dir');
    }
  }

  const dirId = `nativedir-r1-${noteId}`;
  const dir = doc.createElementNS('http://www.music-encoding.org/ns/mei', 'dir');
  dir.setAttribute('xml:id', dirId);
  dir.setAttribute('startid', `#${noteId}`);
  dir.setAttribute('place', 'above');
  dir.textContent = '3';
  // Standard Dir only — no type="schenker-label"
  parent.appendChild(dir);
  return { mei: new XMLSerializer().serializeToString(doc), dirId };
}

function inspectSvg(svgText: string, dirId: string) {
  const parsed = new DOMParser().parseFromString(svgText, 'image/svg+xml');
  const g =
    parsed.querySelector(`#${CSS.escape(dirId)}`) ||
    Array.from(parsed.querySelectorAll('.dir')).find((el) => (el.textContent || '').includes('3')) ||
    null;
  const text = g?.querySelector('text') || null;
  return {
    hasDirGroup: Boolean(g),
    groupId: g?.id ?? null,
    classes: g?.getAttribute('class') ?? null,
    text: (g?.textContent || '').replace(/\s+/g, ' ').trim() || null,
    textX: text?.getAttribute('x') ?? null,
    textY: text?.getAttribute('y') ?? null,
    fontSize: text?.getAttribute('font-size') ?? null,
  };
}

function mountVisible(svgText: string): SVGSVGElement {
  document.getElementById('nativedir-r1-host')?.remove();
  const host = document.createElement('div');
  host.id = 'nativedir-r1-host';
  host.style.cssText =
    'position:fixed;inset:0;z-index:9999;background:#f7f4ef;overflow:auto;padding:16px;';
  const banner = document.createElement('div');
  banner.style.cssText =
    'font:600 18px/1.4 Georgia,serif;margin:0 0 12px;color:#222;max-width:900px;';
  banner.textContent =
    'Native Dir R1 — look above the upper-staff note for a Verovio-rendered “3” (italic). No console needed.';
  host.appendChild(banner);

  const parsed = new DOMParser().parseFromString(svgText, 'image/svg+xml');
  const overlay = document.importNode(parsed.documentElement, true);
  if (!(overlay instanceof SVGSVGElement)) {
    throw new Error('overlay is not SVG');
  }
  overlay.style.cssText = 'width:100%;max-width:1600px;height:auto;background:#fff;border:1px solid #ccc;';
  host.appendChild(overlay);
  document.body.appendChild(host);
  return overlay;
}

export async function runNativeDirR1(): Promise<void> {
  const report: Report = {
    ok: false,
    classification: 'pending',
    noteId: null,
    dirId: null,
    meiDir: null,
    svg: {
      hasDirGroup: false,
      groupId: null,
      classes: null,
      text: null,
      textX: null,
      textY: null,
      fontSize: null,
    },
    startResolvedHint: 'unknown',
    staffsBefore: [],
    staffsAfter: [],
    staffsMatchExpected: false,
    error: null,
  };

  const client = new VerovioClient();
  try {
    const raw = await (await fetch(`${import.meta.env.BASE_URL}samples/CF-005.mei`)).text();
    await client.waitUntilReady();
    let svg = await client.renderData(prepareMeiForVerovio(raw));
    let mount = mountVisible(svg);
    report.staffsBefore = measureRenderedStaffs(mount);

    const insertOk = await client.edit(
      buildStructuralNoteInsertAction({
        staffId: UPPER,
        x: 1100,
        y: 920,
        loc: 4,
        kind: 'open',
      }),
    );
    if (!insertOk) {
      throw new Error('note insert failed');
    }
    const info = (await client.editInfo()) as { uuid?: string };
    const noteId = info.uuid;
    if (!noteId) {
      throw new Error('missing note uuid');
    }
    report.noteId = noteId;

    const meiWithNote = await client.getMEI();
    const { mei: meiWithDir, dirId } = injectStandardDir(meiWithNote, noteId);
    report.dirId = dirId;

    // Full-load preparation — this is the R1 question.
    svg = await client.renderData(prepareMeiForVerovio(meiWithDir));
    mount = mountVisible(svg);
    report.staffsAfter = measureRenderedStaffs(mount);
    report.staffsMatchExpected =
      staffsEqual(report.staffsAfter, EXPECTED) ||
      (report.staffsAfter.length === 2 &&
        Math.abs(report.staffsAfter[0].uly - 816) < 2 &&
        Math.abs(report.staffsAfter[1].uly - 1452) < 2);

    const meiOut = await client.getMEI();
    const meiDoc = new DOMParser().parseFromString(meiOut, 'text/xml');
    const dirEl = meiDoc.querySelector(`dir[*|id="${dirId}"], dir[xml\\:id="${dirId}"]`) ||
      Array.from(meiDoc.getElementsByTagName('dir')).find((d) => d.getAttribute('xml:id') === dirId) ||
      Array.from(meiDoc.getElementsByTagName('dir')).find((d) => (d.textContent || '').trim() === '3');
    if (!dirEl) {
      report.classification = 'A';
      report.error = 'dir missing after full renderData/getMEI';
      publish(report);
      return;
    }
    report.meiDir = {
      id: dirEl.getAttribute('xml:id'),
      type: dirEl.getAttribute('type'),
      startid: dirEl.getAttribute('startid'),
      place: dirEl.getAttribute('place'),
      staff: dirEl.getAttribute('staff'),
      ho: dirEl.getAttribute('ho'),
      vo: dirEl.getAttribute('vo'),
      text: (dirEl.textContent || '').replace(/\s+/g, ' ').trim(),
    };

    report.svg = inspectSvg(svg, dirId);
    if (!report.svg.hasDirGroup) {
      // Distinguish unresolved start (early return) vs other skip: no .dir in SVG
      const anyDir = /class="[^"]*\bdir\b/.test(svg);
      report.classification = anyDir ? 'D' : 'B_or_C_or_D';
      report.startResolvedHint = anyDir
        ? 'some dir graphics exist but target missing'
        : 'no .dir graphic — likely null start or DrawControlElementText early return';
      report.error = 'standard Dir not present in returned SVG';
      publish(report);
      return;
    }

    report.startResolvedHint =
      report.svg.text === '3' && report.svg.textX && report.svg.textY
        ? 'native text drawn (start must have resolved)'
        : 'dir group present but text incomplete';
    const textEl = mount.querySelector('.dir text');
    const inner = mount.querySelector('.dir text tspan[font-size]');
    const textBox = textEl?.getBoundingClientRect();
    const innerBox = inner?.getBoundingClientRect();
    const visibleBox =
      Boolean(textBox && (textBox.width > 1 || textBox.height > 1)) ||
      Boolean(innerBox && (innerBox.width > 1 || innerBox.height > 1));
    report.ok = report.svg.text === '3' && visibleBox;
    report.classification = report.ok ? 'ok' : report.svg.text === '3' ? 'E-invisible' : 'E';
    if (!visibleBox && report.svg.text === '3') {
      report.error = `text present but zero layout box (font-size=${report.svg.fontSize})`;
    }
    publish(report);
  } catch (err) {
    report.error = err instanceof Error ? err.message : String(err);
    report.classification = 'F';
    publish(report);
  } finally {
    client.dispose();
  }
}
