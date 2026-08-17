import { useCallback, useEffect, useRef, useState } from 'react';
import Navbar from './components/Navbar';
import DisplayPanel from './components/DisplayPanel';
import InsertPanel, { type InsertTool } from './components/InsertPanel';
import EditPanel from './components/EditPanel';
import UndoRedoPanel from './components/UndoRedoPanel';
import LoadingOverlay from './components/LoadingOverlay';
import ImageViewer, { type ScorePoint } from './components/ImageViewer';
import { useZoom } from './hooks/useZoom';
import { useVerovioScore } from './hooks/useVerovioScore';
import { findNearestStaff, measureRenderedStaffs, yToLoc } from './lib/schenker/geometry';
import { buildStructuralNoteInsertAction } from './lib/schenker/structuralNote';

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

function App() {
  const [zoomHandler, setZoomHandler] = useState<ReturnType<typeof useZoom> | null>(null);
  const [activeInsertTool, setActiveInsertTool] = useState<InsertTool>(null);
  const { svg, loading, editing, error, editAndRender, getMEI } = useVerovioScore(CF005_MEI);
  const activeInsertToolRef = useRef(activeInsertTool);
  const editingRef = useRef(editing);
  const loadingRef = useRef(loading);
  activeInsertToolRef.current = activeInsertTool;
  editingRef.current = editing;
  loadingRef.current = loading;

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setActiveInsertTool(null);
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, []);

  const handleScoreClick = useCallback(
    (point: ScorePoint) => {
      if (activeInsertToolRef.current !== 'structuralNote') {
        return;
      }
      if (loadingRef.current || editingRef.current) {
        return;
      }
      const overlay = document.querySelector('#svg_group .neon-container.active-page');
      if (!overlay) {
        console.warn('[phase3] no mounted overlay for insertion');
        return;
      }
      const staff = findNearestStaff(overlay, point.x, point.y);
      if (!staff?.id) {
        console.warn('[phase3] no staff found for structural note');
        return;
      }
      const loc = yToLoc(point.y, staff);
      if (!Number.isFinite(loc) || !Number.isFinite(point.x) || !Number.isFinite(point.y)) {
        console.warn('[phase3] could not determine staff position');
        return;
      }
      const action = buildStructuralNoteInsertAction({
        staffId: staff.id,
        x: point.x,
        y: point.y,
        loc,
      });
      if (import.meta.env.DEV) {
        const staffs = measureRenderedStaffs(overlay);
        console.log('[phase3] insert payload', action);
        const w = window as Window & { __PHASE3__?: Phase3Debug };
        w.__PHASE3__ = {
          lastPayload: action,
          lastStaffId: staff.id,
          lastLoc: loc,
          lastPoint: point,
          staffBboxes: staffs,
          getMEI,
          setTool: (on: boolean) => setActiveInsertTool(on ? 'structuralNote' : null),
        };
      }
      void editAndRender(action);
    },
    [editAndRender, getMEI],
  );

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
      setTool: (on: boolean) => setActiveInsertTool(on ? 'structuralNote' : null),
    };
  }, [getMEI]);

  return (
    <>
      <LoadingOverlay visible={loading} />
      <Navbar />
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
                activeInsertTool={activeInsertTool}
                onActiveInsertToolChange={setActiveInsertTool}
              />
            </div>
            <div id="edit_controls">
              <EditPanel />
            </div>
            <div id="undoRedo_controls">
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
