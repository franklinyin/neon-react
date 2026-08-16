import { useEffect, useRef, useState } from 'react';
import { VerovioClient } from '../lib/verovio/VerovioClient';
import {
  outlinePreparedMei,
  prepareMeiForVerovio,
  type PreparedMeiOutline,
} from '../lib/mei/prepareMeiForVerovio';

export type VerovioScoreState = {
  svg: string | null;
  loading: boolean;
  error: string | null;
};

type Phase2BDevReport = {
  prepared: PreparedMeiOutline;
  preparedAgain: PreparedMeiOutline;
  exported: PreparedMeiOutline | null;
  repreparedExport: PreparedMeiOutline | null;
  pageCount: number | null;
  idempotent: boolean;
  exportIdempotent: boolean;
};

/**
 * One Verovio toolkit session for the mounted score.
 * Musical source of truth stays in the worker; React only holds the current SVG.
 */
export function useVerovioScore(meiUrl: string): VerovioScoreState {
  const [svg, setSvg] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const clientRef = useRef<VerovioClient | null>(null);

  useEffect(() => {
    let cancelled = false;
    const client = new VerovioClient();
    clientRef.current = client;
    setLoading(true);
    setError(null);
    setSvg(null);

    void (async () => {
      try {
        await client.waitUntilReady();
        if (cancelled) {
          return;
        }

        const response = await fetch(meiUrl);
        if (!response.ok) {
          throw new Error(`Failed to fetch MEI (${response.status})`);
        }
        const raw = await response.text();
        if (cancelled) {
          return;
        }

        const prepared1 = prepareMeiForVerovio(raw);
        const prepared2 = prepareMeiForVerovio(prepared1);
        const svgText = await client.renderData(prepared1);
        if (cancelled) {
          return;
        }

        let pageCount: number | null = null;
        let exported: string | null = null;
        let repreparedExport: string | null = null;
        try {
          pageCount = await client.getPageCount();
          exported = await client.getMEI();
          repreparedExport = prepareMeiForVerovio(exported);
        } catch {
          // Geometry can still display if getMEI/pageCount fails.
        }

        if (cancelled) {
          return;
        }

        if (import.meta.env.DEV) {
          const preparedOutline = outlinePreparedMei(prepared1);
          const preparedAgain = outlinePreparedMei(prepared2);
          const exportedOutline = exported ? outlinePreparedMei(exported) : null;
          const repreparedOutline = repreparedExport
            ? outlinePreparedMei(repreparedExport)
            : null;
          const report: Phase2BDevReport = {
            prepared: preparedOutline,
            preparedAgain,
            exported: exportedOutline,
            repreparedExport: repreparedOutline,
            pageCount,
            idempotent:
              preparedOutline.pbCount === preparedAgain.pbCount &&
              preparedOutline.neonNeumeLineCount === preparedAgain.neonNeumeLineCount &&
              preparedOutline.runtimeStaffCount === preparedAgain.runtimeStaffCount,
            exportIdempotent: Boolean(
              exportedOutline &&
                repreparedOutline &&
                exportedOutline.pbCount === repreparedOutline.pbCount &&
                exportedOutline.neonNeumeLineCount === repreparedOutline.neonNeumeLineCount &&
                exportedOutline.runtimeStaffCount === repreparedOutline.runtimeStaffCount,
            ),
          };
          (window as Window & { __PHASE2B__?: Phase2BDevReport }).__PHASE2B__ = report;
          console.log('[phase2b] prepare/idempotence', report);
        }

        setSvg(svgText);
        setLoading(false);
      } catch (err) {
        if (cancelled) {
          return;
        }
        const message = err instanceof Error ? err.message : String(err);
        if (message.includes('disposed')) {
          return;
        }
        setError(message);
        setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
      client.dispose();
      if (clientRef.current === client) {
        clientRef.current = null;
      }
    };
  }, [meiUrl]);

  return { svg, loading, error };
}
