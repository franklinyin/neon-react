import { useState } from 'react';
import { ChevronDown } from 'lucide-react';

type EditPanelProps = {
  enabled: boolean;
  selectedCount: number;
  onDeleteSelected: () => void;
  deleteDisabled?: boolean;
};

export default function EditPanel({
  enabled,
  selectedCount,
  onDeleteSelected,
  deleteDisabled = false,
}: EditPanelProps) {
  const [isOpen, setIsOpen] = useState(true);
  const [selectBy, setSelectBy] = useState<'syllable' | 'neume' | 'nc' | 'staff'>('syllable');
  const canDelete = enabled && selectedCount > 0 && !deleteDisabled;

  return (
    <div className="panel" style={enabled ? undefined : { opacity: 0.55 }}>
      <p className="panel-heading" id="editMenu" onClick={() => setIsOpen(!isOpen)} style={{ cursor: 'pointer' }}>
        Edit
        <ChevronDown className={`is-pulled-right ${isOpen ? '' : 'rotate-180'}`} size={20} />
      </p>
      {isOpen && (
        <div id="editContents" style={{ pointerEvents: enabled ? 'auto' : 'none' }}>
          <a className="panel-block">
            <label>Select By:&nbsp;</label>
            <div className="field has-addons buttons" style={{ overflowX: 'auto' }}>
              <p className="control">
                <button
                  className={`button sel-by ${selectBy === 'syllable' ? 'is-active' : ''}`}
                  id="selBySyl"
                  disabled={!enabled}
                  onClick={() => setSelectBy('syllable')}
                >
                  Syllable
                </button>
              </p>
              <p className="control">
                <button
                  className={`button sel-by ${selectBy === 'neume' ? 'is-active' : ''}`}
                  id="selByNeume"
                  disabled={!enabled}
                  onClick={() => setSelectBy('neume')}
                >
                  Neume
                </button>
              </p>
              <p className="control">
                <button
                  className={`button sel-by ${selectBy === 'nc' ? 'is-active' : ''}`}
                  id="selByNc"
                  disabled={!enabled}
                  onClick={() => setSelectBy('nc')}
                >
                  Neume Component
                </button>
              </p>
              <p className="control">
                <button
                  className={`button sel-by ${selectBy === 'staff' ? 'is-active' : ''}`}
                  id="selByStaff"
                  disabled={!enabled}
                  onClick={() => setSelectBy('staff')}
                >
                  Staff
                </button>
              </p>
            </div>
          </a>
          <div className="field is-grouped buttons" style={{ padding: '0.75rem' }}>
            <p className="control">
              <button
                type="button"
                className="button"
                id="deleteSelected"
                disabled={!canDelete}
                onClick={onDeleteSelected}
              >
                Delete Selected{selectedCount > 0 ? ` (${selectedCount})` : ''}
              </button>
            </p>
            <a id="moreEdit" className="panel-block is-invisible"></a>
            <a id="extraEdit" className="panel-block is-invisible"></a>
            <a id="neumeEdit" className="panel-block is-invisible"></a>
          </div>
        </div>
      )}
    </div>
  );
}
