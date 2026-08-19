import { useEffect, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import PrimitiveElements from './insert/PrimitiveElements';

export type InsertTool =
  | 'openNotehead'
  | 'notehead'
  | 'quaver'
  | 'minim'
  | 'quaverFlag'
  | 'minimFlag'
  | null;

const INSERT_TOOLS: ReadonlyArray<Exclude<InsertTool, null>> = [
  'openNotehead',
  'notehead',
  'quaver',
  'minim',
  'quaverFlag',
  'minimFlag',
];

function isInsertTool(id: string): id is Exclude<InsertTool, null> {
  return (INSERT_TOOLS as ReadonlyArray<string>).includes(id);
}

type InsertPanelProps = {
  enabled: boolean;
  activeInsertTool: InsertTool;
  onActiveInsertToolChange: (tool: InsertTool) => void;
};

export default function InsertPanel({
  enabled,
  activeInsertTool,
  onActiveInsertToolChange,
}: InsertPanelProps) {
  const [isOpen, setIsOpen] = useState(true);
  const [activeTab, setActiveTab] = useState<'primitiveTab' | 'groupingTab' | 'systemTab'>('primitiveTab');
  const [placeholderId, setPlaceholderId] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled) {
      setPlaceholderId(null);
    }
  }, [enabled]);

  const activeElementId = activeInsertTool || placeholderId || undefined;

  return (
    <div className="panel" style={enabled ? undefined : { opacity: 0.55 }}>
      <p className="panel-heading" id="insertMenu" onClick={() => setIsOpen(!isOpen)} style={{ cursor: 'pointer' }}>
        Insert
        <ChevronDown className={`is-pulled-right ${isOpen ? '' : 'rotate-180'}`} size={20} />
      </p>
      {isOpen && (
        <div id="insertContents" style={{ overflowY: 'hidden', pointerEvents: enabled ? 'auto' : 'none' }}>
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
                <PrimitiveElements
                  disabled={!enabled}
                  onElementClick={(elementId) => {
                    if (!enabled) {
                      return;
                    }
                    if (isInsertTool(elementId)) {
                      setPlaceholderId(null);
                      onActiveInsertToolChange(activeInsertTool === elementId ? null : elementId);
                      return;
                    }
                    setPlaceholderId(elementId);
                    onActiveInsertToolChange(null);
                    console.log('Selected element:', elementId);
                  }}
                  activeElementId={enabled ? activeElementId : undefined}
                />
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
