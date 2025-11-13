import { useState } from 'react';
import Navbar from './components/Navbar';
import DisplayPanel from './components/DisplayPanel';
import InsertPanel from './components/InsertPanel';
import EditPanel from './components/EditPanel';
import UndoRedoPanel from './components/UndoRedoPanel';
import LoadingOverlay from './components/LoadingOverlay';
import ImageViewer from './components/ImageViewer';

function App() {
  const [loading, setLoading] = useState(false);

  return (
    <>
      <LoadingOverlay visible={loading} />
      <Navbar />
      <div className="columns">
        <div id="notification-content" style={{ display: 'none' }}></div>
        <div className="column is-two-thirds box" id="container" style={{ height: 'calc(94vh)' }}>
          <ImageViewer imagePath="/SK-001.png" />
        </div>
        <div className="column is-one-third is-hidden-mobile" id="right-column">
          <div className="panel">
            <div id="display_controls">
              <DisplayPanel />
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
