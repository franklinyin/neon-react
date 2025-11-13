import { useState } from 'react';
import { ChevronDown } from 'lucide-react';

export default function InsertPanel() {
  const [isOpen, setIsOpen] = useState(true);
  const [activeTab, setActiveTab] = useState<'primitiveTab' | 'groupingTab' | 'systemTab'>('primitiveTab');

  return (
    <div className="panel">
      <p className="panel-heading" id="insertMenu" onClick={() => setIsOpen(!isOpen)} style={{ cursor: 'pointer' }}>
        Insert
        <ChevronDown className={`is-pulled-right ${isOpen ? '' : 'rotate-180'}`} size={20} />
      </p>
      {isOpen && (
        <div id="insertContents" style={{ overflowY: 'hidden' }}>
          <p className="panel-tabs">
            <a
              id="primitiveTab"
              className={activeTab === 'primitiveTab' ? 'is-active' : ''}
              onClick={() => setActiveTab('primitiveTab')}
            >
              Primitive Elements
            </a>
            <a
              id="groupingTab"
              className={activeTab === 'groupingTab' ? 'is-active' : ''}
              onClick={() => setActiveTab('groupingTab')}
            >
              Grouping
            </a>
            <a
              id="systemTab"
              className={activeTab === 'systemTab' ? 'is-active' : ''}
              onClick={() => setActiveTab('systemTab')}
            >
              System
            </a>
          </p>
          <a className="panel-block has-text-centered">
            <div id="insert_data" className="field is-grouped buttons">
              {activeTab === 'primitiveTab' && (
                <>
                  <p className="control">
                    <button className="button insertel smallel" title="punctum">
                      <div style={{ width: '42px', height: '42px', background: '#e0e0e0' }} />
                    </button>
                  </p>
                  <p className="control">
                    <button className="button insertel smallel" title="virga">
                      <div style={{ width: '42px', height: '42px', background: '#e0e0e0' }} />
                    </button>
                  </p>
                  <p className="control">
                    <button className="button insertel smallel" title="inclinatum">
                      <div style={{ width: '42px', height: '42px', background: '#e0e0e0' }} />
                    </button>
                  </p>
                  <p className="control">
                    <button className="button insertel smallel" title="custos">
                      <div style={{ width: '42px', height: '42px', background: '#e0e0e0' }} />
                    </button>
                  </p>
                  <p className="control">
                    <button className="button insertel smallel" title="C Clef">
                      <div style={{ width: '42px', height: '42px', background: '#e0e0e0' }} />
                    </button>
                  </p>
                  <p className="control">
                    <button className="button insertel smallel" title="F Clef">
                      <div style={{ width: '42px', height: '42px', background: '#e0e0e0' }} />
                    </button>
                  </p>
                  <p className="control">
                    <button className="button insertel smallel" title="G Clef">
                      <div style={{ width: '42px', height: '42px', background: '#e0e0e0' }} />
                    </button>
                  </p>
                </>
              )}
              {activeTab === 'groupingTab' && (
                <>
                  <p className="control">
                    <button className="button insertel smallel" title="pes">
                      <div style={{ width: '42px', height: '42px', background: '#e0e0e0' }} />
                    </button>
                  </p>
                  <p className="control">
                    <button className="button insertel smallel" title="clivis">
                      <div style={{ width: '42px', height: '42px', background: '#e0e0e0' }} />
                    </button>
                  </p>
                  <p className="control">
                    <button className="button insertel smallel" title="scandicus">
                      <div style={{ width: '42px', height: '42px', background: '#e0e0e0' }} />
                    </button>
                  </p>
                  <p className="control">
                    <button className="button insertel smallel" title="climacus">
                      <div style={{ width: '42px', height: '42px', background: '#e0e0e0' }} />
                    </button>
                  </p>
                  <p className="control">
                    <button className="button insertel smallel" title="torculus">
                      <div style={{ width: '42px', height: '42px', background: '#e0e0e0' }} />
                    </button>
                  </p>
                  <p className="control">
                    <button className="button insertel smallel" title="porrectus">
                      <div style={{ width: '42px', height: '42px', background: '#e0e0e0' }} />
                    </button>
                  </p>
                  <p className="control">
                    <button className="button insertel smallel" title="pressus">
                      <div style={{ width: '42px', height: '42px', background: '#e0e0e0' }} />
                    </button>
                  </p>
                </>
              )}
              {activeTab === 'systemTab' && (
                <>
                  <p className="control">
                    <button className="button insertel longel" title="system">
                      <div style={{ width: '100px', height: '42px', background: '#e0e0e0' }} />
                    </button>
                  </p>
                  <p>Click upper left and lower right corners of new staff.</p>
                </>
              )}
            </div>
          </a>
        </div>
      )}
    </div>
  );
}
