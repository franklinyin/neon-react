import { useState } from 'react';
import { ChevronDown } from 'lucide-react';

export default function EditPanel() {
  const [isOpen, setIsOpen] = useState(true);
  const [selectBy, setSelectBy] = useState<'syllable' | 'neume' | 'nc' | 'staff'>('syllable');

  return (
    <div className="panel">
      <p className="panel-heading" id="editMenu" onClick={() => setIsOpen(!isOpen)} style={{ cursor: 'pointer' }}>
        Edit
        <ChevronDown className={`is-pulled-right ${isOpen ? '' : 'rotate-180'}`} size={20} />
      </p>
      {isOpen && (
        <div id="editContents">
          <a className="panel-block">
            <label>Select By:&nbsp;</label>
            <div className="field has-addons buttons" style={{ overflowX: 'auto' }}>
              <p className="control">
                <button
                  className={`button sel-by ${selectBy === 'syllable' ? 'is-active' : ''}`}
                  id="selBySyl"
                  onClick={() => setSelectBy('syllable')}
                >
                  Syllable
                </button>
              </p>
              <p className="control">
                <button
                  className={`button sel-by ${selectBy === 'neume' ? 'is-active' : ''}`}
                  id="selByNeume"
                  onClick={() => setSelectBy('neume')}
                >
                  Neume
                </button>
              </p>
              <p className="control">
                <button
                  className={`button sel-by ${selectBy === 'nc' ? 'is-active' : ''}`}
                  id="selByNc"
                  onClick={() => setSelectBy('nc')}
                >
                  Neume Component
                </button>
              </p>
              <p className="control">
                <button
                  className={`button sel-by ${selectBy === 'staff' ? 'is-active' : ''}`}
                  id="selByStaff"
                  onClick={() => setSelectBy('staff')}
                >
                  Staff
                </button>
              </p>
            </div>
          </a>
          <div className="field is-grouped buttons">
            <p className="control"></p>
            <a id="moreEdit" className="panel-block is-invisible"></a>
            <a id="extraEdit" className="panel-block is-invisible"></a>
            <a id="neumeEdit" className="panel-block is-invisible"></a>
          </div>
        </div>
      )}
    </div>
  );
}
