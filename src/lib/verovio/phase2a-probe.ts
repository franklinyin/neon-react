/**
 * PHASE 2A forensic probe. Not production. Not a preprocessor.
 * Run only with ?phase2a=1 so it does not share a page with the smoke harness.
 */
import { VerovioClient } from './VerovioClient';

const MEI_NS = 'http://www.music-encoding.org/ns/mei';

type StaffGeom = {
  id: string;
  className: string | null;
  n: string | null;
  pathCount: number;
  bbox: { ulx: number; uly: number; lrx: number; lry: number; width: number; height: number } | null;
};

type ClefGeom = {
  id: string;
  className: string | null;
  shapeHint: string | null;
  x: number | null;
  y: number | null;
  transform: string | null;
};

type RenderMetrics = {
  label: string;
  ok: boolean;
  error: string | null;
  svgLength: number;
  viewBox: string | null;
  nestedViewBoxes: string[];
  width: string | null;
  height: string | null;
  rootAttrs: Record<string, string>;
  pageCount: number;
  pages: Array<{
    pageNo: number;
    viewBox: string | null;
    nestedViewBoxes: string[];
    definitionScaleTransform: string | null;
    pageMarginTransform: string | null;
    staffCount: number;
    staffIds: string[];
    staves: StaffGeom[];
    clefs: ClefGeom[];
    firstPathD: string[];
  }>;
  staffCount: number;
  staffIds: string[];
  staves: StaffGeom[];
  clefs: ClefGeom[];
  hasDefinitionScale: boolean;
  hasPageMargin: boolean;
  getMEIOk: boolean;
  getMEILength: number;
  getMEIStaffIds: string[];
  getMEIStaffFacs: string[];
  getMEISectionTypes: string[];
  getMEIHasSchenkerNs: boolean;
  meiSnippet?: string;
};

type Phase2AReport = {
  smokeWouldHaveRun: boolean;
  probeUsedOwnWorker: boolean;
  sourceFacts: Record<string, unknown>;
  variants: RenderMetrics[];
};

function parseMei(xml: string): Document {
  return new DOMParser().parseFromString(xml, 'text/xml');
}

function serialize(doc: Document): string {
  return new XMLSerializer().serializeToString(doc);
}

function el(doc: Document, name: string): Element {
  return doc.createElementNS(MEI_NS, name);
}

function copyAttributes(src: Element, dst: Element): void {
  for (const attr of Array.from(src.attributes)) {
    dst.setAttribute(attr.name, attr.value);
  }
}

function staffBBoxFromGroup(staff: Element): StaffGeom['bbox'] {
  let ulx: number | undefined;
  let uly: number | undefined;
  let lrx: number | undefined;
  let lry: number | undefined;
  staff.querySelectorAll('path').forEach((path) => {
    const d = path.getAttribute('d') || '';
    const coordinates = (d.match(/\d+/g) || []).map(Number);
    if (coordinates.length < 4) {
      return;
    }
    if (uly === undefined || Math.min(coordinates[1], coordinates[3]) < uly) {
      uly = Math.min(coordinates[1], coordinates[3]);
    }
    if (ulx === undefined || coordinates[0] < ulx) {
      ulx = coordinates[0];
    }
    if (lry === undefined || Math.max(coordinates[1], coordinates[3]) > lry) {
      lry = Math.max(coordinates[1], coordinates[3]);
    }
    if (lrx === undefined || coordinates[2] > lrx) {
      lrx = coordinates[2];
    }
  });
  if (ulx === undefined || uly === undefined || lrx === undefined || lry === undefined) {
    return null;
  }
  return { ulx, uly, lrx, lry, width: lrx - ulx, height: lry - uly };
}

function firstTranslate(el: Element): { x: number; y: number } | null {
  const transform = el.getAttribute('transform') || '';
  const m = transform.match(/translate\(\s*([-\d.]+)[,\s]+([-\d.]+)/);
  if (!m) {
    return null;
  }
  return { x: Number(m[1]), y: Number(m[2]) };
}

function describeClefs(svgRoot: Element): ClefGeom[] {
  return Array.from(svgRoot.querySelectorAll('.clef, g[class*="clef"]')).map((clef) => {
    const use = clef.querySelector('use');
    const t = firstTranslate(clef) || (use ? firstTranslate(use) : null);
    const xAttr = use?.getAttribute('x');
    const yAttr = use?.getAttribute('y');
    return {
      id: clef.getAttribute('id') || '',
      className: clef.getAttribute('class'),
      shapeHint: use?.getAttribute('xlink:href') || use?.getAttribute('href') || null,
      x: xAttr !== null && xAttr !== undefined ? Number(xAttr) : t?.x ?? null,
      y: yAttr !== null && yAttr !== undefined ? Number(yAttr) : t?.y ?? null,
      transform: clef.getAttribute('transform'),
    };
  });
}

function extractSvgMetrics(svg: string): {
  svgLength: number;
  viewBox: string | null;
  nestedViewBoxes: string[];
  width: string | null;
  height: string | null;
  rootAttrs: Record<string, string>;
  staffCount: number;
  staffIds: string[];
  staves: StaffGeom[];
  clefs: ClefGeom[];
  hasDefinitionScale: boolean;
  hasPageMargin: boolean;
  definitionScaleTransform: string | null;
  pageMarginTransform: string | null;
  firstPathD: string[];
} {
  const doc = new DOMParser().parseFromString(svg, 'image/svg+xml');
  const root = doc.documentElement;
  const rootAttrs: Record<string, string> = {};
  for (const attr of Array.from(root.attributes)) {
    rootAttrs[attr.name] = attr.value;
  }
  const nestedViewBoxes = Array.from(root.querySelectorAll('svg[viewBox], svg'))
    .map((el) => el.getAttribute('viewBox') || '')
    .filter(Boolean);
  const staves = Array.from(root.querySelectorAll('.staff, g.staff'));
  const staffGeoms: StaffGeom[] = staves.map((staff) => {
    const bbox = staffBBoxFromGroup(staff);
    return {
      id: staff.getAttribute('id') || '',
      className: staff.getAttribute('class'),
      n: staff.getAttribute('n') || staff.getAttribute('data-n'),
      pathCount: staff.querySelectorAll('path').length,
      bbox,
    };
  });
  return {
    svgLength: svg.length,
    viewBox: root.getAttribute('viewBox'),
    nestedViewBoxes,
    width: root.getAttribute('width'),
    height: root.getAttribute('height'),
    rootAttrs,
    staffCount: staves.length,
    staffIds: staffGeoms.map((s) => s.id),
    staves: staffGeoms,
    clefs: describeClefs(root),
    hasDefinitionScale: Boolean(root.querySelector('.definition-scale')),
    hasPageMargin: Boolean(root.querySelector('.page-margin')),
    definitionScaleTransform: root.querySelector('.definition-scale')?.getAttribute('transform') || null,
    pageMarginTransform: root.querySelector('.page-margin')?.getAttribute('transform') || null,
    firstPathD: staves.map((s) => s.querySelector('path')?.getAttribute('d') || ''),
  };
}

function extractMeiFacts(mei: string): Pick<
  RenderMetrics,
  'getMEIStaffIds' | 'getMEIStaffFacs' | 'getMEISectionTypes' | 'getMEIHasSchenkerNs'
> {
  const doc = parseMei(mei);
  const staves = Array.from(doc.getElementsByTagName('staff'));
  const sections = Array.from(doc.getElementsByTagName('section'));
  return {
    getMEIStaffIds: staves.map((s) => s.getAttribute('xml:id') || ''),
    getMEIStaffFacs: staves.map((s) => s.getAttribute('facs') || ''),
    getMEISectionTypes: sections.map((s) => s.getAttribute('type') || ''),
    getMEIHasSchenkerNs: /xmlns:schenker=/.test(mei),
  };
}

function summarizeSource(mei: string): Record<string, unknown> {
  const doc = parseMei(mei);
  const surfaces = Array.from(doc.getElementsByTagName('surface'));
  const zones = Array.from(doc.getElementsByTagName('zone')).map((z) => ({
    id: z.getAttribute('xml:id'),
    ulx: z.getAttribute('ulx'),
    uly: z.getAttribute('uly'),
    lrx: z.getAttribute('lrx'),
    lry: z.getAttribute('lry'),
  }));
  const staves = Array.from(doc.getElementsByTagName('staff')).map((staff) => {
    const layer = staff.getElementsByTagName('layer')[0];
    const children = layer ? Array.from(layer.children).map((c) => c.tagName) : [];
    const sbs = Array.from(staff.getElementsByTagName('sb')).map((sb) => ({
      id: sb.getAttribute('xml:id'),
      n: sb.getAttribute('n'),
      facs: sb.getAttribute('facs'),
      parent: sb.parentElement?.tagName,
    }));
    const clefs = Array.from(staff.getElementsByTagName('clef')).map((clef) => ({
      id: clef.getAttribute('xml:id'),
      facs: clef.getAttribute('facs'),
      shape: clef.getAttribute('shape'),
      line: clef.getAttribute('line'),
    }));
    return {
      n: staff.getAttribute('n'),
      id: staff.getAttribute('xml:id'),
      layerN: layer?.getAttribute('n') || null,
      layerChildren: children,
      sbs,
      clefs,
    };
  });
  const tags = (name: string): number => doc.getElementsByTagName(name).length;
  return {
    meiversion: doc.documentElement.getAttribute('meiversion'),
    facsimileType: doc.getElementsByTagName('facsimile')[0]?.getAttribute('type') || null,
    surfaceCount: surfaces.length,
    surface: surfaces.map((s) => ({
      id: s.getAttribute('xml:id'),
      lrx: s.getAttribute('lrx'),
      lry: s.getAttribute('lry'),
    })),
    zoneCount: zones.length,
    zones,
    sectionCount: tags('section'),
    staffCount: tags('staff'),
    staves,
    counts: {
      sb: tags('sb'),
      clef: tags('clef'),
      colLayout: tags('colLayout'),
      cb: tags('cb'),
      syllable: tags('syllable'),
      neume: tags('neume'),
      nc: tags('nc'),
      custos: tags('custos'),
      accid: tags('accid'),
      divLine: tags('divLine'),
    },
    hasCjkComments: /[\u4e00-\u9fff]/.test(mei),
    dummyNullSb: /facs="null"/.test(mei),
  };
}

/** Faithful convertToVerovio without Notification / vkbeautify. Probe-only. */
function legacyConvertToVerovio(sbBasedMei: string): string {
  const meiDoc = parseMei(sbBasedMei);
  const mei = meiDoc.documentElement;
  let hasCols = false;

  const facsimile = mei.querySelector('facsimile');
  facsimile?.setAttribute('type', 'transcription');

  const surface = mei.querySelector('surface');
  if (!surface) {
    throw new Error('no surface');
  }

  const colLayout = mei.querySelector('colLayout');
  if (colLayout) {
    hasCols = true;
    colLayout.parentNode?.removeChild(colLayout);
  }

  const sections = Array.from(mei.getElementsByTagName('section'));
  for (const section of sections) {
    const originalStaves = Array.from(section.getElementsByTagName('staff'));
    for (const staff of originalStaves) {
      const newPb = el(meiDoc, 'pb');
      newPb.setAttribute('facs', '#' + surface.getAttribute('xml:id'));
      section.insertBefore(newPb, staff);

      const layer = staff.querySelector('layer');
      if (!layer) {
        continue;
      }
      const sbs = Array.from(layer.getElementsByTagName('sb'));
      const layerChildren = Array.from(layer.children);
      let nCol = 0;
      for (let i = 0; i < sbs.length; i++) {
        const currentSb = sbs[i];
        const nextSb = sbs.length > i + 1 ? sbs[i + 1] : undefined;

        const newSb = el(meiDoc, 'sb');
        newSb.setAttribute('xml:id', 'm-' + crypto.randomUUID());
        newSb.setAttribute('facs', currentSb.getAttribute('facs') || '');

        const newSection = el(meiDoc, 'section');
        newSection.setAttribute('type', 'neon-neume-line');

        const newStaff = el(meiDoc, 'staff');
        copyAttributes(currentSb, newStaff);
        newStaff.setAttribute('n', '1');
        const currentIdx = layerChildren.indexOf(currentSb);
        if (hasCols) {
          const prev = currentIdx > 0 ? layerChildren[currentIdx - 1] : undefined;
          if (prev?.tagName === 'cb') {
            nCol += 1;
          }
          newStaff.setAttribute('type', 'column' + nCol.toString());
        }

        const newLayer = el(meiDoc, 'layer');
        newLayer.setAttribute('n', '1');
        newLayer.setAttribute('xml:id', 'm-' + crypto.randomUUID());
        newSection.appendChild(newStaff);
        newStaff.appendChild(newLayer);

        const childrenArray = Array.from(layer.children);
        const startIdx = childrenArray.indexOf(currentSb) + 1;
        const endIdx = nextSb ? childrenArray.indexOf(nextSb) : childrenArray.length;
        for (let j = startIdx; j < endIdx; j++) {
          newLayer.appendChild(childrenArray[j]);
        }

        section.insertBefore(newSb, staff);
        section.insertBefore(newSection, staff);
      }
      staff.remove();
    }
  }

  return serialize(meiDoc);
}

type ReduceOpts = {
  transcription?: boolean;
  wrapNeumeLine?: boolean;
  forceStaffN1?: boolean;
  insertPb?: boolean;
  syntheticSb?: boolean;
  generatedLayerId?: boolean;
  generatedSbId?: boolean;
  removeSourceStaff?: boolean;
  inPlacePromoteSb?: boolean;
};

function reducedConvert(sbBasedMei: string, opts: ReduceOpts): string {
  const meiDoc = parseMei(sbBasedMei);
  const mei = meiDoc.documentElement;
  const facsimile = mei.querySelector('facsimile');
  const surface = mei.querySelector('surface');
  if (opts.transcription) {
    facsimile?.setAttribute('type', 'transcription');
  }

  const structural =
    Boolean(opts.wrapNeumeLine) ||
    Boolean(opts.inPlacePromoteSb) ||
    Boolean(opts.insertPb) ||
    Boolean(opts.syntheticSb);
  if (!structural) {
    return serialize(meiDoc);
  }

  if (opts.inPlacePromoteSb) {
    for (const sb of Array.from(mei.getElementsByTagName('sb'))) {
      const staff = sb.parentElement?.closest('staff') ?? sb.parentElement?.parentElement;
      if (!staff || staff.tagName !== 'staff') {
        continue;
      }
      const id = sb.getAttribute('xml:id');
      const facs = sb.getAttribute('facs');
      if (id) {
        staff.setAttribute('xml:id', id);
      }
      if (facs) {
        staff.setAttribute('facs', facs);
      }
      sb.remove();
    }
    return serialize(meiDoc);
  }

  const sections = Array.from(mei.getElementsByTagName('section'));
  for (const section of sections) {
    const originalStaves = Array.from(section.getElementsByTagName('staff'));
    for (const staff of originalStaves) {
      if (opts.insertPb && surface) {
        const newPb = el(meiDoc, 'pb');
        newPb.setAttribute('facs', '#' + surface.getAttribute('xml:id'));
        section.insertBefore(newPb, staff);
      }

      const layer = staff.querySelector('layer');
      if (!layer) {
        continue;
      }
      const sbs = Array.from(layer.getElementsByTagName('sb'));
      for (let i = 0; i < sbs.length; i++) {
        const currentSb = sbs[i];
        const nextSb = sbs.length > i + 1 ? sbs[i + 1] : undefined;

        const newStaff = el(meiDoc, 'staff');
        copyAttributes(currentSb, newStaff);
        if (opts.forceStaffN1) {
          newStaff.setAttribute('n', '1');
        }

        const newLayer = el(meiDoc, 'layer');
        newLayer.setAttribute('n', '1');
        if (opts.generatedLayerId) {
          newLayer.setAttribute('xml:id', 'm-' + crypto.randomUUID());
        }

        const childrenArray = Array.from(layer.children);
        const startIdx = childrenArray.indexOf(currentSb) + 1;
        const endIdx = nextSb ? childrenArray.indexOf(nextSb) : childrenArray.length;
        for (let j = startIdx; j < endIdx; j++) {
          newLayer.appendChild(childrenArray[j]);
        }
        newStaff.appendChild(newLayer);

        if (opts.wrapNeumeLine) {
          const newSection = el(meiDoc, 'section');
          newSection.setAttribute('type', 'neon-neume-line');
          newSection.appendChild(newStaff);
          if (opts.syntheticSb) {
            const newSb = el(meiDoc, 'sb');
            if (opts.generatedSbId) {
              newSb.setAttribute('xml:id', 'm-' + crypto.randomUUID());
            }
            newSb.setAttribute('facs', currentSb.getAttribute('facs') || '');
            section.insertBefore(newSb, staff);
          }
          section.insertBefore(newSection, staff);
        } else {
          section.insertBefore(newStaff, staff);
        }
      }
      if (opts.removeSourceStaff !== false) {
        staff.remove();
      }
    }
  }

  return serialize(meiDoc);
}

function insertSingleLeadingPb(mei: string): string {
  const doc = parseMei(mei);
  const surface = doc.querySelector('surface');
  const section = doc.querySelector('section');
  if (!surface || !section) {
    return mei;
  }
  const pb = el(doc, 'pb');
  pb.setAttribute('facs', '#' + surface.getAttribute('xml:id'));
  section.insertBefore(pb, section.firstElementChild);
  return serialize(doc);
}

function sourceOutline(mei: string): string {
  const doc = parseMei(mei);
  const bits: string[] = [];
  bits.push(`facsimile@type=${doc.getElementsByTagName('facsimile')[0]?.getAttribute('type') || '(none)'}`);
  for (const section of Array.from(doc.getElementsByTagName('section'))) {
    bits.push(
      `section type=${section.getAttribute('type') || '(none)'} id=${section.getAttribute('xml:id') || '(none)'}`,
    );
    for (const child of Array.from(section.children)) {
      if (child.tagName === 'pb') {
        bits.push(`  pb facs=${child.getAttribute('facs')}`);
      } else if (child.tagName === 'sb') {
        bits.push(`  sb id=${child.getAttribute('xml:id')} facs=${child.getAttribute('facs')}`);
      } else if (child.tagName === 'section') {
        const staff = child.getElementsByTagName('staff')[0];
        bits.push(
          `  section type=${child.getAttribute('type')} staff id=${staff?.getAttribute('xml:id')} n=${staff?.getAttribute('n')} facs=${staff?.getAttribute('facs')}`,
        );
        const layer = staff?.getElementsByTagName('layer')[0];
        const kids = layer ? Array.from(layer.children).map((c) => `${c.tagName}#${c.getAttribute('xml:id') || ''}`) : [];
        bits.push(`    layer id=${layer?.getAttribute('xml:id') || '(none)'} children=${kids.join(',')}`);
      } else if (child.tagName === 'staff') {
        bits.push(
          `  staff n=${child.getAttribute('n')} id=${child.getAttribute('xml:id') || '(none)'} facs=${child.getAttribute('facs') || '(none)'}`,
        );
        const layer = child.getElementsByTagName('layer')[0];
        const kids = layer ? Array.from(layer.children).map((c) => `${c.tagName}#${c.getAttribute('xml:id') || ''} facs=${c.getAttribute('facs') || ''}`) : [];
        bits.push(`    layer children=${kids.join(' | ')}`);
      }
    }
  }
  return bits.join('\n');
}

async function measure(
  client: VerovioClient,
  label: string,
  mei: string,
): Promise<RenderMetrics> {
  const base: RenderMetrics = {
    label,
    ok: false,
    error: null,
    svgLength: 0,
    viewBox: null,
    nestedViewBoxes: [],
    width: null,
    height: null,
    rootAttrs: {},
    pageCount: 0,
    pages: [],
    staffCount: 0,
    staffIds: [],
    staves: [],
    clefs: [],
    hasDefinitionScale: false,
    hasPageMargin: false,
    getMEIOk: false,
    getMEILength: 0,
    getMEIStaffIds: [],
    getMEIStaffFacs: [],
    getMEISectionTypes: [],
    getMEIHasSchenkerNs: false,
    meiSnippet: sourceOutline(mei),
  };
  try {
    const svg = await client.renderData(mei);
    const page1 = extractSvgMetrics(svg);
    Object.assign(base, page1);
    base.pageCount = await client.getPageCount();
    const pagesToRead = Math.max(1, base.pageCount);
    for (let pageNo = 1; pageNo <= pagesToRead; pageNo++) {
      const pageSvg = pageNo === 1 ? svg : await client.renderToSVG(pageNo);
      const metrics = pageNo === 1 ? page1 : extractSvgMetrics(pageSvg);
      base.pages.push({
        pageNo,
        viewBox: metrics.viewBox,
        nestedViewBoxes: metrics.nestedViewBoxes,
        definitionScaleTransform: metrics.definitionScaleTransform,
        pageMarginTransform: metrics.pageMarginTransform,
        staffCount: metrics.staffCount,
        staffIds: metrics.staffIds,
        staves: metrics.staves,
        clefs: metrics.clefs,
        firstPathD: metrics.firstPathD,
      });
    }
    try {
      const exported = await client.getMEI();
      base.getMEIOk = exported.length > 0;
      base.getMEILength = exported.length;
      Object.assign(base, extractMeiFacts(exported));
    } catch (error) {
      base.getMEIOk = false;
      base.error = `getMEI: ${error instanceof Error ? error.message : String(error)}`;
    }
    const totalStaves = base.pages.reduce((n, p) => n + p.staffCount, 0);
    base.ok = base.svgLength > 0 && totalStaves > 0;
  } catch (error) {
    base.error = error instanceof Error ? error.message : String(error);
  }
  return base;
}

function publish(report: Phase2AReport): void {
  console.log('[phase2a] report', report);
  (window as Window & { __PHASE2A__?: Phase2AReport }).__PHASE2A__ = report;
  let el = document.getElementById('phase2a-report');
  if (!el) {
    el = document.createElement('pre');
    el.id = 'phase2a-report';
    el.setAttribute('hidden', '');
    document.body.appendChild(el);
  }
  el.textContent = JSON.stringify(report, null, 2);
}

export async function runPhase2A(): Promise<Phase2AReport> {
  const client = new VerovioClient();
  const report: Phase2AReport = {
    smokeWouldHaveRun: true,
    probeUsedOwnWorker: true,
    sourceFacts: {},
    variants: [],
  };
  try {
    await client.waitUntilReady();
    const res = await fetch(`${import.meta.env.BASE_URL}samples/CF-005.mei`);
    if (!res.ok) {
      throw new Error(`fetch CF-005 failed: ${res.status}`);
    }
    const raw = await res.text();
    report.sourceFacts = summarizeSource(raw);

    const variants: Array<[string, string]> = [
      ['raw', raw],
      ['transcription-only', reducedConvert(raw, { transcription: true, removeSourceStaff: false })],
      ['in-place-promote-sb', reducedConvert(raw, { inPlacePromoteSb: true })],
      ['in-place-promote-sb+transcription', reducedConvert(raw, { inPlacePromoteSb: true, transcription: true })],
      [
        'wrap-neume-line+facs+n1',
        reducedConvert(raw, {
          wrapNeumeLine: true,
          forceStaffN1: true,
          removeSourceStaff: true,
        }),
      ],
      [
        'wrap+transcription',
        reducedConvert(raw, {
          transcription: true,
          wrapNeumeLine: true,
          forceStaffN1: true,
          removeSourceStaff: true,
        }),
      ],
      [
        'wrap+transcription+keep-n',
        reducedConvert(raw, {
          transcription: true,
          wrapNeumeLine: true,
          forceStaffN1: false,
          removeSourceStaff: true,
        }),
      ],
      [
        'wrap+transcription+one-pb',
        insertSingleLeadingPb(
          reducedConvert(raw, {
            transcription: true,
            wrapNeumeLine: true,
            forceStaffN1: true,
            removeSourceStaff: true,
          }),
        ),
      ],
      [
        'wrap+transcription+pb',
        reducedConvert(raw, {
          transcription: true,
          wrapNeumeLine: true,
          forceStaffN1: true,
          insertPb: true,
          removeSourceStaff: true,
        }),
      ],
      [
        'wrap+transcription+synthetic-sb',
        reducedConvert(raw, {
          transcription: true,
          wrapNeumeLine: true,
          forceStaffN1: true,
          syntheticSb: true,
          generatedSbId: true,
          removeSourceStaff: true,
        }),
      ],
      [
        'wrap+transcription+layer-ids',
        reducedConvert(raw, {
          transcription: true,
          wrapNeumeLine: true,
          forceStaffN1: true,
          generatedLayerId: true,
          removeSourceStaff: true,
        }),
      ],
      [
        'legacy-convertToVerovio',
        legacyConvertToVerovio(raw),
      ],
    ];

    for (const [label, mei] of variants) {
      console.log('[phase2a] rendering', label);
      report.variants.push(await measure(client, label, mei));
    }
  } catch (error) {
    report.variants.push({
      label: 'probe-error',
      ok: false,
      error: error instanceof Error ? error.message : String(error),
      svgLength: 0,
      viewBox: null,
      nestedViewBoxes: [],
      width: null,
      height: null,
      rootAttrs: {},
      pageCount: 0,
      pages: [],
      staffCount: 0,
      staffIds: [],
      staves: [],
      clefs: [],
      hasDefinitionScale: false,
      hasPageMargin: false,
      getMEIOk: false,
      getMEILength: 0,
      getMEIStaffIds: [],
      getMEIStaffFacs: [],
      getMEISectionTypes: [],
      getMEIHasSchenkerNs: false,
    });
  } finally {
    client.dispose();
    publish(report);
  }
  return report;
}
