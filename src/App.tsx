import { useState } from 'react';
import Navbar from './components/Navbar';
import DisplayPanel from './components/DisplayPanel';
import InsertPanel from './components/InsertPanel';
import EditPanel from './components/EditPanel';
import UndoRedoPanel from './components/UndoRedoPanel';
import LoadingOverlay from './components/LoadingOverlay';
import ImageViewer from './components/ImageViewer';
import { useZoom } from './hooks/useZoom';
import { useVerovioScore } from './hooks/useVerovioScore';

const CF005_IMAGE = '/samples/CF-005.png';
const CF005_MEI = '/samples/CF-005.mei';

function App() {
  const [zoomHandler, setZoomHandler] = useState<ReturnType<typeof useZoom> | null>(null);
  const { svg, loading, error } = useVerovioScore(CF005_MEI);

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
              <InsertPanel />
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
