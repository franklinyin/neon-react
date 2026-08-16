import { VerovioClient } from './VerovioClient';

type SmokeReport = {
  ready: boolean;
  renderData: {
    svgLength: number;
    rootTag: string;
    rootId: string | null;
    rootClass: string | null;
  } | null;
  getMEI: {
    meiLength: number;
    hasSchenkerType: boolean;
  } | null;
  renderToSVG: {
    svgLength: number;
    rootTag: string;
  } | null;
  ok: boolean;
  error: string | null;
};

function describeSvgRoot(svg: string): { rootTag: string; rootId: string | null; rootClass: string | null } {
  const doc = new DOMParser().parseFromString(svg, 'image/svg+xml');
  const root = doc.documentElement;
  return {
    rootTag: root.tagName,
    rootId: root.getAttribute('id'),
    rootClass: root.getAttribute('class'),
  };
}

function publishReport(report: SmokeReport): void {
  const label = report.ok ? 'PASS' : 'FAIL';
  console.log(`[verovio-smoke] ${label}`, report);
  (window as Window & { __VEROVIO_SMOKE__?: SmokeReport }).__VEROVIO_SMOKE__ = report;

  let el = document.getElementById('verovio-smoke-report');
  if (!el) {
    el = document.createElement('pre');
    el.id = 'verovio-smoke-report';
    el.setAttribute('hidden', '');
    document.body.appendChild(el);
  }
  el.textContent = JSON.stringify(report, null, 2);
}

export async function runVerovioSmoke(): Promise<SmokeReport> {
  const report: SmokeReport = {
    ready: false,
    renderData: null,
    getMEI: null,
    renderToSVG: null,
    ok: false,
    error: null,
  };

  const client = new VerovioClient();
  try {
    await client.waitUntilReady();
    report.ready = true;
    console.log('[verovio-smoke] READY');

    const meiResponse = await fetch(`${import.meta.env.BASE_URL}samples/schenker_stage1_smoke.mei`);
    if (!meiResponse.ok) {
      throw new Error(`Failed to fetch smoke MEI: ${meiResponse.status}`);
    }
    const mei = await meiResponse.text();

    const svg = await client.renderData(mei);
    const renderRoot = describeSvgRoot(svg);
    report.renderData = {
      svgLength: svg.length,
      ...renderRoot,
    };
    console.log('[verovio-smoke] renderData', report.renderData);

    const exportedMei = await client.getMEI();
    report.getMEI = {
      meiLength: exportedMei.length,
      hasSchenkerType: /type\s*=\s*["']schenker["']/.test(exportedMei),
    };
    console.log('[verovio-smoke] getMEI', report.getMEI);

    const redraw = await client.renderToSVG();
    const redrawRoot = describeSvgRoot(redraw);
    report.renderToSVG = {
      svgLength: redraw.length,
      rootTag: redrawRoot.rootTag,
    };
    console.log('[verovio-smoke] renderToSVG', report.renderToSVG);

    report.ok =
      report.ready &&
      (report.renderData?.svgLength ?? 0) > 0 &&
      (report.getMEI?.meiLength ?? 0) > 0 &&
      Boolean(report.getMEI?.hasSchenkerType) &&
      (report.renderToSVG?.svgLength ?? 0) > 0;
  } catch (error) {
    report.error = error instanceof Error ? error.message : String(error);
    console.error('[verovio-smoke] failed', error);
  } finally {
    client.dispose();
    publishReport(report);
  }

  return report;
}
