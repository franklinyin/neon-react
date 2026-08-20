import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Navbar from './components/Navbar';
import DisplayPanel from './components/DisplayPanel';
import InsertPanel, { type InsertTool } from './components/InsertPanel';
import EditPanel from './components/EditPanel';
import UndoRedoPanel from './components/UndoRedoPanel';
import LoadingOverlay from './components/LoadingOverlay';
import ImageViewer, { type ScoreHit, type ScorePoint } from './components/ImageViewer';
import { useZoom } from './hooks/useZoom';
import { useVerovioScore } from './hooks/useVerovioScore';
import { findNearestStaff, measureRenderedStaffs, yToLoc } from './lib/schenker/geometry';
import { buildStructuralNoteInsertAction, type StructuralNoteKind } from './lib/schenker/structuralNote';
import { buildDeleteElementsAction } from './lib/schenker/remove';
import { activeScoreOverlay, buildBeamNotesAction, canBeamSelection } from './lib/schenker/beam';
import { buildFlipAction, canFlipSelection } from './lib/schenker/flip';
import {
  activeSlurOverlay,
  buildSlurNotesAction,
  canSlurSelection,
  sortNoteIdsByX,
} from './lib/schenker/slur';
import { createMeiBlob, downloadMei } from './lib/mei/downloadMei';

const CF005_IMAGE = '/samples/CF-005.png';
const CF005_MEI = '/samples/CF-005.mei';

type Phase3Debug = {
  lastPayload: unknown;
  lastStaffId: string | null;
  lastLoc: number | null;
  lastPoint: ScorePoint | null;
  staffBboxes: ReturnType<typeof measureRenderedStaffs>;
  getMEI: () => Promise<string>;
  setTool: (on: boolean) => void;
};

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false;
  }
  if (target.isContentEditable) {
    return true;
  }
  const tag = target.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
}

function App() {
  const [zoomHandler, setZoomHandler] = useState<ReturnType<typeof useZoom> | null>(null);
  const [isEditMode, setIsEditMode] = useState(false);
  const [activeInsertTool, setActiveInsertTool] = useState<InsertTool>(null);
  const [selectedNoteIds, setSelectedNoteIds] = useState<string[]>([]);
  const [selectedBeamId, setSelectedBeamId] = useState<string | null>(null);
  const [selectedSlurId, setSelectedSlurId] = useState<string | null>(null);
  const { svg, loading, editing, error, editAndRender, getMEI } = useVerovioScore(CF005_MEI);
  const isEditModeRef = useRef(isEditMode);
  const activeInsertToolRef = useRef(activeInsertTool);
  const selectedNoteIdsRef = useRef(selectedNoteIds);
  const selectedBeamIdRef = useRef(selectedBeamId);
  const selectedSlurIdRef = useRef(selectedSlurId);
  const editingRef = useRef(editing);
  const loadingRef = useRef(loading);
  const downloadingRef = useRef(false);
  const [downloading, setDownloading] = useState(false);
  isEditModeRef.current = isEditMode;
  activeInsertToolRef.current = activeInsertTool;
  selectedNoteIdsRef.current = selectedNoteIds;
  selectedBeamIdRef.current = selectedBeamId;
  selectedSlurIdRef.current = selectedSlurId;
  editingRef.current = editing;
  loadingRef.current = loading;

  const enterEditMode = useCallback(() => {
    setIsEditMode(true);
  }, []);

  const exitEditMode = useCallback(() => {
    setIsEditMode(false);
    setActiveInsertTool(null);
    setSelectedNoteIds([]);
    setSelectedBeamId(null);
    setSelectedSlurId(null);
  }, []);

  const handleInsertToolChange = useCallback((tool: InsertTool) => {
    if (!isEditModeRef.current) {
      return;
    }
    setActiveInsertTool(tool);
    if (tool) {
      setSelectedNoteIds([]);
      setSelectedBeamId(null);
      setSelectedSlurId(null);
    }
  }, []);

  const handleDeleteSelected = useCallback(async () => {
    if (!isEditModeRef.current || activeInsertToolRef.current) {
      return;
    }
    if (loadingRef.current || editingRef.current) {
      return;
    }
    const ids = [...selectedNoteIdsRef.current];
    if (selectedBeamIdRef.current) {
      ids.push(selectedBeamIdRef.current);
    }
    if (selectedSlurIdRef.current) {
      ids.push(selectedSlurIdRef.current);
    }
    if (ids.length === 0) {
      return;
    }
    const action = buildDeleteElementsAction(ids);
    if (import.meta.env.DEV) {
      console.log('[phase5] delete payload', action);
    }
    const ok = await editAndRender(action);
    if (ok) {
      setSelectedNoteIds([]);
      setSelectedBeamId(null);
    }
  }, [editAndRender]);

  const handleFlipSelected = useCallback(async () => {
    if (!isEditModeRef.current || activeInsertToolRef.current) {
      return;
    }
    if (loadingRef.current || editingRef.current) {
      return;
    }
    const overlay = activeScoreOverlay();
    const beamId = selectedBeamIdRef.current;
    const noteIds = selectedNoteIdsRef.current;
    if (!canFlipSelection(overlay, noteIds, beamId)) {
      return;
    }
    const elementId = beamId ?? noteIds[0];
    const action = buildFlipAction(elementId);
    if (import.meta.env.DEV) {
      console.log('[phase5] flip payload', action);
    }
    const ok = await editAndRender(action);
    if (ok) {
      setSelectedNoteIds([]);
      setSelectedBeamId(null);
    }
  }, [editAndRender]);

  const handleBeamSelected = useCallback(async () => {
    if (!isEditModeRef.current || activeInsertToolRef.current) {
      return;
    }
    if (loadingRef.current || editingRef.current) {
      return;
    }
    const ids = selectedNoteIdsRef.current;
    if (!canBeamSelection(activeScoreOverlay(), ids)) {
      return;
    }
    const action = buildBeamNotesAction(ids);
    if (import.meta.env.DEV) {
      console.log('[phase5] beam payload', action);
    }
    const ok = await editAndRender(action);
    if (ok) {
      setSelectedNoteIds([]);
      setSelectedBeamId(null);
      setSelectedSlurId(null);
    }
  }, [editAndRender]);

  const handleSlurSelected = useCallback(async () => {
    if (!isEditModeRef.current || activeInsertToolRef.current) {
      return;
    }
    if (loadingRef.current || editingRef.current) {
      return;
    }
    const overlay = activeSlurOverlay();
    const ids = selectedNoteIdsRef.current;
    if (!canSlurSelection(overlay, ids)) {
      return;
    }
    const ordered = sortNoteIdsByX(overlay, ids);
    const action = buildSlurNotesAction(ordered);
    if (import.meta.env.DEV) {
      console.log('[phase5] slur payload', action);
    }
    const ok = await editAndRender(action);
    if (ok) {
      setSelectedNoteIds([]);
      setSelectedBeamId(null);
      setSelectedSlurId(null);
    }
  }, [editAndRender]);

  const beamEnabled = useMemo(() => {
    if (!isEditMode || activeInsertTool) {
      return false;
    }
    return canBeamSelection(activeScoreOverlay(), selectedNoteIds);
  }, [isEditMode, activeInsertTool, selectedNoteIds, svg]);

  const flipEnabled = useMemo(() => {
    if (!isEditMode || activeInsertTool) {
      return false;
    }
    return canFlipSelection(activeScoreOverlay(), selectedNoteIds, selectedBeamId);
  }, [isEditMode, activeInsertTool, selectedNoteIds, selectedBeamId, svg]);

  const slurEnabled = useMemo(() => {
    if (!isEditMode || activeInsertTool) {
      return false;
    }
    return canSlurSelection(activeSlurOverlay(), selectedNoteIds);
  }, [isEditMode, activeInsertTool, selectedNoteIds, svg]);

  const selectedCount =
    selectedNoteIds.length + (selectedBeamId ? 1 : 0) + (selectedSlurId ? 1 : 0);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (isTypingTarget(event.target)) {
        return;
      }
      if (event.key === 'Escape') {
        setActiveInsertTool(null);
        setSelectedNoteIds([]);
        setSelectedBeamId(null);
        return;
      }
      if (event.key !== 'Delete' && event.key !== 'Backspace') {
        return;
      }
      if (!isEditModeRef.current || activeInsertToolRef.current) {
        return;
      }
      if (loadingRef.current || editingRef.current) {
        return;
      }
      const hasSelection =
        selectedNoteIdsRef.current.length > 0 ||
        Boolean(selectedBeamIdRef.current) ||
        Boolean(selectedSlurIdRef.current);
      if (!hasSelection) {
        return;
      }
      event.preventDefault();
      void handleDeleteSelected();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [handleDeleteSelected]);

  const handleScoreClick = useCallback(
    (hit: ScoreHit) => {
      if (!isEditModeRef.current) {
        return;
      }
      if (loadingRef.current || editingRef.current) {
        return;
      }

      const insertTool = activeInsertToolRef.current;
      if (insertTool) {
        const overlay = document.querySelector('#svg_group .neon-container.active-page');
        if (!overlay) {
          console.warn('[phase3] no mounted overlay for insertion');
          return;
        }
        const staff = findNearestStaff(overlay, hit.point.x, hit.point.y);
        if (!staff?.id) {
          console.warn('[phase3] no staff found for structural note');
          return;
        }
        const loc = yToLoc(hit.point.y, staff);
        if (!Number.isFinite(loc) || !Number.isFinite(hit.point.x) || !Number.isFinite(hit.point.y)) {
          console.warn('[phase3] could not determine staff position');
          return;
        }
        const kindByTool: Record<Exclude<InsertTool, null>, StructuralNoteKind> = {
          openNotehead: 'open',
          notehead: 'filled',
          quaver: 'quaver',
          minim: 'minim',
          quaverFlag: 'quaverFlag',
          minimFlag: 'minimFlag',
        };
        const action = buildStructuralNoteInsertAction({
          staffId: staff.id,
          x: hit.point.x,
          y: hit.point.y,
          loc,
          kind: kindByTool[insertTool],
        });
        if (import.meta.env.DEV) {
          const staffs = measureRenderedStaffs(overlay);
          console.log('[phase3] insert payload', action);
          const w = window as Window & { __PHASE3__?: Phase3Debug };
          w.__PHASE3__ = {
            lastPayload: action,
            lastStaffId: staff.id,
            lastLoc: loc,
            lastPoint: hit.point,
            staffBboxes: staffs,
            getMEI,
            setTool: (on: boolean) => {
              setIsEditMode(true);
              setActiveInsertTool(on ? 'openNotehead' : null);
            },
          };
        }
        void editAndRender(action);
        return;
      }

      // Selection mode (default while Edit MEI is active and no insert tool).
      if (hit.beamId) {
        setSelectedBeamId(hit.beamId);
        setSelectedNoteIds([]);
        setSelectedSlurId(null);
        return;
      }
      if (hit.slurId) {
        setSelectedSlurId(hit.slurId);
        setSelectedNoteIds([]);
        setSelectedBeamId(null);
        return;
      }
      if (!hit.noteId) {
        setSelectedNoteIds([]);
        setSelectedBeamId(null);
        setSelectedSlurId(null);
        return;
      }
      const noteId = hit.noteId;
      setSelectedBeamId(null);
      setSelectedSlurId(null);
      if (hit.additive) {
        setSelectedNoteIds((current) =>
          current.includes(noteId) ? current.filter((id) => id !== noteId) : [...current, noteId],
        );
        return;
      }
      setSelectedNoteIds([noteId]);
    },
    [editAndRender, getMEI],
  );

  const handleDownloadMEI = useCallback(async () => {
    if (loadingRef.current || editingRef.current || downloadingRef.current) {
      return;
    }
    downloadingRef.current = true;
    setDownloading(true);
    try {
      const mei = await getMEI();
      if (import.meta.env.DEV) {
        const blob = createMeiBlob(mei);
        const blobText = await blob.text();
        const report = {
          equal: blobText === mei,
          charLength: mei.length,
          byteLength: new TextEncoder().encode(mei).length,
          mimeType: blob.type,
        };
        console.log('[phase4] download blob check', report);
        const w = window as Window & {
          __PHASE4_DOWNLOAD__?: typeof report & { mei: string };
        };
        w.__PHASE4_DOWNLOAD__ = { ...report, mei };
      }
      downloadMei(mei, 'CF-005.mei');
    } catch (err) {
      console.error('[phase4] Download MEI failed', err);
    } finally {
      downloadingRef.current = false;
      setDownloading(false);
    }
  }, [getMEI]);

  useEffect(() => {
    if (!import.meta.env.DEV) {
      return;
    }
    const w = window as Window & { __PHASE3__?: Phase3Debug };
    const previous = w.__PHASE3__;
    w.__PHASE3__ = {
      lastPayload: previous?.lastPayload ?? null,
      lastStaffId: previous?.lastStaffId ?? null,
      lastLoc: previous?.lastLoc ?? null,
      lastPoint: previous?.lastPoint ?? null,
      staffBboxes: previous?.staffBboxes ?? [],
      getMEI,
      setTool: (on: boolean) => {
        setIsEditMode(true);
        setActiveInsertTool(on ? 'openNotehead' : null);
      },
    };
  }, [getMEI]);

  return (
    <>
      <LoadingOverlay visible={loading} />
      <Navbar
        isEditMode={isEditMode}
        onEnterEditMode={enterEditMode}
        onExitEditMode={exitEditMode}
        onDownloadMEI={() => {
          void handleDownloadMEI();
        }}
        downloadDisabled={loading || editing || downloading || Boolean(error)}
      />
      <div className="columns">
        <div id="notification-content" style={{ display: 'none' }}></div>
        <div className="column is-two-thirds box" id="container" style={{ height: 'calc(94vh)' }}>
          {error ? (
            <p id="verovio-error" style={{ padding: '1rem', color: '#a00' }}>
              Failed to render MEI: {error}
            </p>
          ) : (
            <ImageViewer
              imagePath={CF005_IMAGE}
              meiSvg={svg}
              selectedNoteIds={selectedNoteIds}
              selectedBeamId={selectedBeamId}
              selectedSlurId={selectedSlurId}
              onScoreClick={handleScoreClick}
              onZoomReady={(zoom) => setZoomHandler(zoom)}
            />
          )}
        </div>
        <div className="column is-one-third is-hidden-mobile" id="right-column">
          <div className="panel">
            <div id="display_controls">
              <DisplayPanel zoomHandler={zoomHandler || undefined} />
            </div>
            <div id="insert_controls">
              <InsertPanel
                enabled={isEditMode}
                activeInsertTool={activeInsertTool}
                onActiveInsertToolChange={handleInsertToolChange}
              />
            </div>
            <div id="edit_controls">
              <EditPanel
                enabled={isEditMode}
                selectedCount={selectedCount}
                onDeleteSelected={() => {
                  void handleDeleteSelected();
                }}
                deleteDisabled={loading || editing || Boolean(activeInsertTool) || Boolean(error)}
                beamEnabled={beamEnabled}
                onBeamSelected={() => {
                  void handleBeamSelected();
                }}
                beamDisabled={loading || editing || Boolean(activeInsertTool) || Boolean(error)}
                flipEnabled={flipEnabled}
                onFlipSelected={() => {
                  void handleFlipSelected();
                }}
                flipDisabled={loading || editing || Boolean(activeInsertTool) || Boolean(error)}
                slurEnabled={slurEnabled}
                onSlurSelected={() => {
                  void handleSlurSelected();
                }}
                slurDisabled={loading || editing || Boolean(activeInsertTool) || Boolean(error)}
              />
            </div>
            <div id="undoRedo_controls" style={isEditMode ? undefined : { opacity: 0.55, pointerEvents: 'none' }}>
              <UndoRedoPanel />
            </div>
          </div>
          <div id="neume_info"></div>
          <div id="syl_text" className="box" style={{ display: 'none' }}></div>
        </div>
      </div>
    </>
  );
}

export default App;
