import { useState } from 'react';
import Navbar from './components/Navbar';
import DisplayPanel from './components/DisplayPanel';
import InsertPanel from './components/InsertPanel';
import EditPanel from './components/EditPanel';
import UndoRedoPanel from './components/UndoRedoPanel';
import LoadingOverlay from './components/LoadingOverlay';
import ImageViewer from './components/ImageViewer';
import { useZoom } from './hooks/useZoom';

function App() {
  const [loading, setLoading] = useState(false);
  const [zoomHandler, setZoomHandler] = useState<ReturnType<typeof useZoom> | null>(null);

  return (
    <>
      <LoadingOverlay visible={loading} />
      <Navbar />
      <div className="columns">
        <div id="notification-content" style={{ display: 'none' }}></div>
        <div className="column is-two-thirds box" id="container" style={{ height: 'calc(94vh)' }}>
          <ImageViewer 
            imagePath="/SK-001.png" 
            onZoomReady={(zoom) => setZoomHandler(zoom)}
          />
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
