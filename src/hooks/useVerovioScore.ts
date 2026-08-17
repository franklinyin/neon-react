import { useCallback, useEffect, useRef, useState } from 'react';
import { VerovioClient, type VerovioEditorAction } from '../lib/verovio/VerovioClient';
import {
  outlinePreparedMei,
  prepareMeiForVerovio,
  type PreparedMeiOutline,
} from '../lib/mei/prepareMeiForVerovio';

export type VerovioScoreState = {
  svg: string | null;
  loading: boolean;
  editing: boolean;
  error: string | null;
  editAndRender: (action: VerovioEditorAction) => Promise<boolean>;
  getMEI: () => Promise<string>;
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
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const clientRef = useRef<VerovioClient | null>(null);
  const editingRef = useRef(false);
  const sessionRef = useRef(0);

  useEffect(() => {
    let cancelled = false;
    const session = sessionRef.current + 1;
    sessionRef.current = session;
    const client = new VerovioClient();
    clientRef.current = client;
    setLoading(true);
    setEditing(false);
    editingRef.current = false;
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
      sessionRef.current = session + 1;
      client.dispose();
      if (clientRef.current === client) {
        clientRef.current = null;
      }
    };
  }, [meiUrl]);

  const editAndRender = useCallback(async (action: VerovioEditorAction): Promise<boolean> => {
    const client = clientRef.current;
    const session = sessionRef.current;
    if (!client || editingRef.current) {
      return false;
    }
    editingRef.current = true;
    setEditing(true);
    try {
      const ok = await client.edit(action);
      if (!ok) {
        throw new Error('Verovio edit returned false');
      }
      // Do not call renderData() here: that would reload the original MEI
      // and discard the toolkit's in-memory edit.
      const svgText = await client.renderToSVG(1);
      if (sessionRef.current !== session) {
        return false;
      }
      setSvg(svgText);
      return true;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (!message.includes('disposed')) {
        console.error('[phase3] editAndRender failed', err);
      }
      return false;
    } finally {
      editingRef.current = false;
      if (sessionRef.current === session) {
        setEditing(false);
      }
    }
  }, []);

  const getMEI = useCallback(async (): Promise<string> => {
    const client = clientRef.current;
    if (!client) {
      throw new Error('Verovio session is not ready');
    }
    if (editingRef.current) {
      throw new Error('Cannot export MEI while an edit is in progress');
    }
    return client.getMEI();
  }, []);

  return { svg, loading, editing, error, editAndRender, getMEI };
}
