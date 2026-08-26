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
import { buildSchenkerDoubleBarLineInsertAction, buildSchenkerBarLineMoveAction } from './lib/schenker/barline';
import { buildDeleteElementsAction } from './lib/schenker/remove';
import { activeScoreOverlay, buildBeamNotesAction, buildSchenkerBeamStemAdjustAction, canBeamSelection } from './lib/schenker/beam';
import { buildFlipAction, canFlipSelection } from './lib/schenker/flip';
import {
  activeSlurOverlay,
  buildSchenkerSlurCurveAction,
  buildSchenkerSlurDashedAction,
  buildSchenkerSlurResetAction,
  buildSlurNotesAction,
  canSlurSelection,
  sortNoteIdsByX,
  type SlurBezierPoints,
} from './lib/schenker/slur';
import { createMeiBlob, downloadMei } from './lib/mei/downloadMei';
import { readLocalMeiFile } from './lib/mei/openMei';
import { buildSchenkerNoteMoveAction } from './lib/schenker/move';
import { buildSchenkerLabelAction, buildSchenkerLabelOffsetAction, canLabelSelection } from './lib/schenker/label';

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
  const [selectedBarLineId, setSelectedBarLineId] = useState<string | null>(null);
  const [selectedSlurId, setSelectedSlurId] = useState<string | null>(null);
  const [selectedLabelId, setSelectedLabelId] = useState<string | null>(null);
  const { svg, loading, editing, error, editAndRender, getMEI, loadMei } = useVerovioScore(CF005_MEI);
  const isEditModeRef = useRef(isEditMode);
  const activeInsertToolRef = useRef(activeInsertTool);
  const selectedNoteIdsRef = useRef(selectedNoteIds);
  const selectedBeamIdRef = useRef(selectedBeamId);
  const selectedBarLineIdRef = useRef(selectedBarLineId);
  const selectedSlurIdRef = useRef(selectedSlurId);
  const selectedLabelIdRef = useRef(selectedLabelId);
  const editingRef = useRef(editing);
  const loadingRef = useRef(loading);
  const downloadingRef = useRef(false);
  const [downloading, setDownloading] = useState(false);
  const [openedMeiName, setOpenedMeiName] = useState('CF-005.mei');
  isEditModeRef.current = isEditMode;
  activeInsertToolRef.current = activeInsertTool;
  selectedNoteIdsRef.current = selectedNoteIds;
  selectedBeamIdRef.current = selectedBeamId;
  selectedBarLineIdRef.current = selectedBarLineId;
  selectedSlurIdRef.current = selectedSlurId;
  selectedLabelIdRef.current = selectedLabelId;
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
    setSelectedBarLineId(null);
    setSelectedSlurId(null);
    setSelectedLabelId(null);
  }, []);

  const handleInsertToolChange = useCallback((tool: InsertTool) => {
    if (!isEditModeRef.current) {
      return;
    }
    setActiveInsertTool(tool);
    if (tool) {
      setSelectedNoteIds([]);
      setSelectedBeamId(null);
      setSelectedBarLineId(null);
      setSelectedSlurId(null);
      setSelectedLabelId(null);
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
    if (selectedBarLineIdRef.current) {
      ids.push(selectedBarLineIdRef.current);
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
      setSelectedBarLineId(null);
      setSelectedSlurId(null);
      setSelectedLabelId(null);
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

  const handleResetSlur = useCallback(async () => {
    if (!isEditModeRef.current || activeInsertToolRef.current) {
      return;
    }
    if (loadingRef.current || editingRef.current) {
      return;
    }
    const slurId = selectedSlurIdRef.current;
    if (!slurId || selectedNoteIdsRef.current.length > 0 || selectedBeamIdRef.current) {
      return;
    }
    pendingSlurCurveRef.current = null;
    const action = buildSchenkerSlurResetAction(slurId);
    if (import.meta.env.DEV) {
      console.log('[r3] schenkerSlurReset payload', action);
    }
    await editAndRender(action);
  }, [editAndRender]);

  const handleDashedSlur = useCallback(async () => {
    if (!isEditModeRef.current || activeInsertToolRef.current) {
      return;
    }
    if (loadingRef.current || editingRef.current) {
      return;
    }
    const slurId = selectedSlurIdRef.current;
    if (!slurId || selectedNoteIdsRef.current.length > 0 || selectedBeamIdRef.current) {
      return;
    }
    const action = buildSchenkerSlurDashedAction(slurId);
    if (import.meta.env.DEV) {
      console.log('[schenker] schenkerSlurDashed payload', action);
    }
    await editAndRender(action);
  }, [editAndRender]);

  const pendingSlurCurveRef = useRef<{ slurId: string; points: SlurBezierPoints } | null>(null);
  const slurCurveBusyRef = useRef(false);

  const flushSlurCurveCommit = useCallback(async () => {
    if (slurCurveBusyRef.current) {
      return;
    }
    const pending = pendingSlurCurveRef.current;
    if (!pending) {
      return;
    }
    pendingSlurCurveRef.current = null;
    slurCurveBusyRef.current = true;
    try {
      const action = buildSchenkerSlurCurveAction(pending.slurId, pending.points);
      if (import.meta.env.DEV) {
        console.log('[s4] schenkerSlurCurve payload', action);
      }
      await editAndRender(action);
    } finally {
      slurCurveBusyRef.current = false;
      if (pendingSlurCurveRef.current) {
        void flushSlurCurveCommit();
      }
    }
  }, [editAndRender]);

  const handleSlurCurveCommit = useCallback((slurId: string, points: SlurBezierPoints) => {
    if (!isEditModeRef.current) {
      return;
    }
    pendingSlurCurveRef.current = { slurId, points };
    void flushSlurCurveCommit();
  }, [flushSlurCurveCommit]);

  const handleNoteMoveCommit = useCallback((noteId: string, loc: number, schenkerX: number) => {
    if (!isEditModeRef.current || activeInsertToolRef.current) {
      return;
    }
    if (loadingRef.current || editingRef.current) {
      return;
    }
    const action = buildSchenkerNoteMoveAction(noteId, loc, schenkerX);
    if (import.meta.env.DEV) {
      console.log('[note-move] schenkerNoteMove payload', action);
    }
    void editAndRender(action);
  }, [editAndRender]);

  const handleBarLineMoveCommit = useCallback((barLineId: string, schenkerX: number) => {
    if (!isEditModeRef.current || activeInsertToolRef.current) {
      return;
    }
    if (loadingRef.current || editingRef.current) {
      return;
    }
    const action = buildSchenkerBarLineMoveAction(barLineId, schenkerX);
    if (import.meta.env.DEV) {
      console.log('[barline-move] schenkerBarLineMove payload', action);
    }
    void editAndRender(action);
  }, [editAndRender]);

  const handleBeamStemCommit = useCallback(
    (beamId: string, from: ScorePoint, to: ScorePoint) => {
      if (!isEditModeRef.current || activeInsertToolRef.current) {
        return;
      }
      if (loadingRef.current || editingRef.current) {
        return;
      }
      const action = buildSchenkerBeamStemAdjustAction(beamId, from, to);
      if (import.meta.env.DEV) {
        console.log('[beam-stem] schenkerBeamStemAdjust payload', action);
      }
      void editAndRender(action);
    },
    [editAndRender],
  );

  const handleTextLabel = useCallback(() => {
    if (!isEditModeRef.current || activeInsertToolRef.current) {
      return;
    }
    if (loadingRef.current || editingRef.current) {
      return;
    }
    const overlay = activeScoreOverlay();
    const noteIds = selectedNoteIdsRef.current;
    if (
      !canLabelSelection(
        overlay,
        noteIds,
        selectedBeamIdRef.current,
        selectedSlurIdRef.current,
        selectedLabelIdRef.current,
      )
    ) {
      return;
    }
    const value = window.prompt('Text', '3');
    if (value === null) {
      return;
    }
    const text = value.trim();
    if (!text) {
      return;
    }
    const action = buildSchenkerLabelAction(noteIds[0], text);
    if (import.meta.env.DEV) {
      console.log('[nativedir-r2] schenkerLabel payload', action);
    }
    void editAndRender(action);
  }, [editAndRender]);

  const handleLabelOffsetCommit = useCallback(
    (labelId: string, from: ScorePoint, to: ScorePoint) => {
      if (!isEditModeRef.current || activeInsertToolRef.current) {
        return;
      }
      if (loadingRef.current || editingRef.current) {
        return;
      }
      const action = buildSchenkerLabelOffsetAction(labelId, from, to);
      if (import.meta.env.DEV) {
        console.log('[nativedir-n4] schenkerLabelOffset payload', action);
      }
      void editAndRender(action);
    },
    [editAndRender],
  );

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

  const labelEnabled = useMemo(() => {
    if (!isEditMode || activeInsertTool) {
      return false;
    }
    return canLabelSelection(
      activeScoreOverlay(),
      selectedNoteIds,
      selectedBeamId,
      selectedSlurId,
      selectedLabelId,
    );
  }, [isEditMode, activeInsertTool, selectedNoteIds, selectedBeamId, selectedSlurId, selectedLabelId, svg]);

  const resetSlurEnabled = useMemo(() => {
    if (!isEditMode || activeInsertTool) {
      return false;
    }
    return Boolean(selectedSlurId) && selectedNoteIds.length === 0 && !selectedBeamId;
  }, [isEditMode, activeInsertTool, selectedSlurId, selectedNoteIds, selectedBeamId]);

  const dashedSlurEnabled = resetSlurEnabled;

  const selectedCount =
    selectedNoteIds.length +
    (selectedBeamId ? 1 : 0) +
    (selectedBarLineId ? 1 : 0) +
    (selectedSlurId ? 1 : 0);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (isTypingTarget(event.target)) {
        return;
      }
      if (event.key === 'Escape') {
        setActiveInsertTool(null);
        setSelectedNoteIds([]);
        setSelectedBeamId(null);
        setSelectedBarLineId(null);
        setSelectedSlurId(null);
        setSelectedLabelId(null);
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
        Boolean(selectedBarLineIdRef.current) ||
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
        if (!Number.isFinite(hit.point.x) || !Number.isFinite(hit.point.y)) {
          console.warn('[phase3] could not determine click position');
          return;
        }

        if (insertTool === 'doubleBarline') {
          const action = buildSchenkerDoubleBarLineInsertAction({
            staffId: staff.id,
            x: hit.point.x,
            y: hit.point.y,
          });
          if (import.meta.env.DEV) {
            console.log('[barline] insert payload', action);
          }
          void editAndRender(action);
          return;
        }

        const loc = yToLoc(hit.point.y, staff);
        if (!Number.isFinite(loc)) {
          console.warn('[phase3] could not determine staff position');
          return;
        }
        const kindByTool: Record<
          Exclude<InsertTool, null | 'doubleBarline'>,
          StructuralNoteKind
        > = {
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
      if (hit.barLineId) {
        setSelectedBarLineId(hit.barLineId);
        setSelectedBeamId(null);
        setSelectedNoteIds([]);
        setSelectedSlurId(null);
        setSelectedLabelId(null);
        return;
      }
      if (hit.beamId) {
        setSelectedBeamId(hit.beamId);
        setSelectedBarLineId(null);
        setSelectedNoteIds([]);
        setSelectedSlurId(null);
        setSelectedLabelId(null);
        return;
      }
      if (hit.slurId) {
        setSelectedSlurId(hit.slurId);
        setSelectedNoteIds([]);
        setSelectedBeamId(null);
        setSelectedBarLineId(null);
        setSelectedLabelId(null);
        return;
      }
      if (hit.labelId) {
        setSelectedLabelId(hit.labelId);
        setSelectedNoteIds([]);
        setSelectedBeamId(null);
        setSelectedBarLineId(null);
        setSelectedSlurId(null);
        return;
      }
      if (!hit.noteId) {
        setSelectedNoteIds([]);
        setSelectedBeamId(null);
        setSelectedBarLineId(null);
        setSelectedSlurId(null);
        setSelectedLabelId(null);
        return;
      }
      const noteId = hit.noteId;
      setSelectedBeamId(null);
      setSelectedBarLineId(null);
      setSelectedSlurId(null);
      setSelectedLabelId(null);
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
      downloadMei(mei, openedMeiName || 'score.mei');
    } catch (err) {
      console.error('[phase4] Download MEI failed', err);
    } finally {
      downloadingRef.current = false;
      setDownloading(false);
    }
  }, [getMEI, openedMeiName]);

  const handleOpenMEI = useCallback(async (file: File) => {
    if (loadingRef.current || editingRef.current || downloadingRef.current) {
      return;
    }
    try {
      pendingSlurCurveRef.current = null;
      const text = await readLocalMeiFile(file);
      const ok = await loadMei(text);
      if (!ok) {
        return;
      }
      setOpenedMeiName(file.name || 'score.mei');
      setActiveInsertTool(null);
      setSelectedNoteIds([]);
      setSelectedBeamId(null);
      setSelectedBarLineId(null);
      setSelectedSlurId(null);
      setSelectedLabelId(null);
    } catch (err) {
      console.error('[open-mei] failed', err);
    }
  }, [loadMei]);

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
        onOpenMEI={(file) => {
          void handleOpenMEI(file);
        }}
        openDisabled={loading || editing || downloading}
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
              selectedBarLineId={selectedBarLineId}
              selectedSlurId={selectedSlurId}
              selectedLabelId={selectedLabelId}
              onScoreClick={handleScoreClick}
              onSlurCurveCommit={handleSlurCurveCommit}
              onNoteMoveCommit={handleNoteMoveCommit}
              onBarLineMoveCommit={handleBarLineMoveCommit}
              onBeamStemCommit={handleBeamStemCommit}
              onLabelOffsetCommit={handleLabelOffsetCommit}
              noteDragEnabled={isEditMode && !activeInsertTool && !loading && !editing}
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
                labelEnabled={labelEnabled}
                onTextLabel={handleTextLabel}
                labelDisabled={loading || editing || Boolean(activeInsertTool) || Boolean(error)}
                resetSlurEnabled={resetSlurEnabled}
                onResetSlur={() => {
                  void handleResetSlur();
                }}
                resetSlurDisabled={loading || editing || Boolean(activeInsertTool) || Boolean(error)}
                dashedSlurEnabled={dashedSlurEnabled}
                onDashedSlur={() => {
                  void handleDashedSlur();
                }}
                dashedSlurDisabled={loading || editing || Boolean(activeInsertTool) || Boolean(error)}
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
