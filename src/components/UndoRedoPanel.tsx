export default function UndoRedoPanel() {
  return (
    <div className="panel">
      <div className="field has-addons buttons" style={{ overflowX: 'auto', padding: '10px' }}>
        <p className="control">
          <button className="button" id="undo">
            Undo
          </button>
          <button className="button" id="redo">
            Redo
          </button>
        </p>
      </div>
    </div>
  );
}
