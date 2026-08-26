const MEI_NS = 'http://www.music-encoding.org/ns/mei';

function parseMeiXml(mei: string): Document {
  const doc = new DOMParser().parseFromString(mei, 'text/xml');
  const err = doc.querySelector('parsererror');
  if (err) {
    throw new Error(`Invalid MEI XML: ${err.textContent?.trim() || 'parse error'}`);
  }
  return doc;
}

function localName(el: Element): string {
  return el.localName || el.tagName;
}

function copyAttributes(src: Element, dst: Element): void {
  for (const attr of Array.from(src.attributes)) {
    dst.setAttribute(attr.name, attr.value);
  }
}

function isRuntimeForm(doc: Document): boolean {
  const lineSections = Array.from(doc.getElementsByTagName('section')).filter(
    (section) => section.getAttribute('type') === 'neon-neume-line',
  );
  if (lineSections.length === 0) {
    return false;
  }
  const stavesWithFacs = Array.from(doc.getElementsByTagName('staff')).filter((staff) =>
    Boolean(staff.getAttribute('facs')),
  );
  return stavesWithFacs.length > 0;
}

function findOuterSection(doc: Document): Element | null {
  return (
    Array.from(doc.getElementsByTagName('section')).find(
      (section) => section.getAttribute('type') !== 'neon-neume-line',
    ) || null
  );
}

/**
 * Stage-1 MEI preparation for the custom Verovio path.
 * Proven by Phase 2A: transcription + one leading pb + sb→staff in neon-neume-line.
 */
export function prepareMeiForVerovio(mei: string): string {
  const doc = parseMeiXml(mei);
  if (isRuntimeForm(doc)) {
    return mei;
  }

  const facsimile = doc.getElementsByTagName('facsimile')[0];
  if (!facsimile) {
    throw new Error('MEI has no <facsimile>');
  }
  facsimile.setAttribute('type', 'transcription');

  const surface = doc.getElementsByTagName('surface')[0];
  const surfaceId = surface?.getAttribute('xml:id');
  if (!surfaceId) {
    throw new Error('MEI facsimile <surface> is missing xml:id');
  }

  const outerSection = findOuterSection(doc);
  if (!outerSection) {
    throw new Error('MEI has no outer <section> to prepare');
  }

  const originalStaves = Array.from(outerSection.children).filter(
    (child) => child.nodeType === Node.ELEMENT_NODE && localName(child as Element) === 'staff',
  ) as Element[];

  const pb = doc.createElementNS(MEI_NS, 'pb');
  pb.setAttribute('facs', `#${surfaceId}`);
  outerSection.insertBefore(pb, outerSection.firstChild);

  for (const staff of originalStaves) {
    const layer = staff.getElementsByTagName('layer')[0];
    if (!layer) {
      staff.remove();
      continue;
    }

    const layerChildren = Array.from(layer.children);
    const sbs = layerChildren.filter((child) => localName(child) === 'sb');

    for (let i = 0; i < sbs.length; i++) {
      const currentSb = sbs[i];
      const nextSb = sbs[i + 1];

      const newStaff = doc.createElementNS(MEI_NS, 'staff');
      copyAttributes(currentSb, newStaff);
      // Keep the parent <staff n="…"> so multi-staff systems stay distinguishable
      // after sb→staff (CF-005: n="1" upper / n="2" lower). Do not force n="1".
      const parentN = staff.getAttribute('n');
      if (parentN) {
        newStaff.setAttribute('n', parentN);
      } else if (!newStaff.getAttribute('n')) {
        newStaff.setAttribute('n', '1');
      }

      const newLayer = doc.createElementNS(MEI_NS, 'layer');
      newLayer.setAttribute('n', '1');

      const startIdx = layerChildren.indexOf(currentSb) + 1;
      const endIdx = nextSb ? layerChildren.indexOf(nextSb) : layerChildren.length;
      for (let j = startIdx; j < endIdx; j++) {
        newLayer.appendChild(layerChildren[j]);
      }

      newStaff.appendChild(newLayer);

      const lineSection = doc.createElementNS(MEI_NS, 'section');
      lineSection.setAttribute('type', 'neon-neume-line');
      lineSection.appendChild(newStaff);
      outerSection.insertBefore(lineSection, staff);
    }

    staff.remove();
  }

  return new XMLSerializer().serializeToString(doc);
}

export type PreparedMeiOutline = {
  facsimileType: string | null;
  pbCount: number;
  pbFacs: string[];
  neonNeumeLineCount: number;
  runtimeStaffCount: number;
  sourceStaffWithoutFacs: number;
  staffs: Array<{ id: string | null; n: string | null; facs: string | null; layerId: string | null }>;
  sbCount: number;
};

export function outlinePreparedMei(mei: string): PreparedMeiOutline {
  const doc = parseMeiXml(mei);
  const pbs = Array.from(doc.getElementsByTagName('pb'));
  const lineSections = Array.from(doc.getElementsByTagName('section')).filter(
    (section) => section.getAttribute('type') === 'neon-neume-line',
  );
  const staffs = Array.from(doc.getElementsByTagName('staff'));
  return {
    facsimileType: doc.getElementsByTagName('facsimile')[0]?.getAttribute('type') || null,
    pbCount: pbs.length,
    pbFacs: pbs.map((pb) => pb.getAttribute('facs') || ''),
    neonNeumeLineCount: lineSections.length,
    runtimeStaffCount: staffs.filter((staff) => Boolean(staff.getAttribute('facs'))).length,
    sourceStaffWithoutFacs: staffs.filter((staff) => !staff.getAttribute('facs')).length,
    staffs: staffs.map((staff) => {
      const layer = staff.getElementsByTagName('layer')[0];
      return {
        id: staff.getAttribute('xml:id'),
        n: staff.getAttribute('n'),
        facs: staff.getAttribute('facs'),
        layerId: layer?.getAttribute('xml:id') || null,
      };
    }),
    sbCount: doc.getElementsByTagName('sb').length,
  };
}
