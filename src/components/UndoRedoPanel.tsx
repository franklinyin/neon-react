type UndoRedoPanelProps = {
  onUndo: () => void;
  onRedo: () => void;
  undoDisabled?: boolean;
  redoDisabled?: boolean;
};

export default function UndoRedoPanel({
  onUndo,
  onRedo,
  undoDisabled = false,
  redoDisabled = false,
}: UndoRedoPanelProps) {
  return (
    <div className="panel">
      <div className="field has-addons buttons" style={{ overflowX: 'auto', padding: '10px' }}>
        <p className="control">
          <button
            type="button"
            className="button"
            id="undo"
            disabled={undoDisabled}
            onClick={onUndo}
          >
            Undo
          </button>
          <button
            type="button"
            className="button"
            id="redo"
            disabled={redoDisabled}
            onClick={onRedo}
          >
            Redo
          </button>
        </p>
      </div>
    </div>
  );
}
