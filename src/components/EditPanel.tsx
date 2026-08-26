import { useState } from 'react';
import { ChevronDown } from 'lucide-react';

type EditPanelProps = {
  enabled: boolean;
  selectedCount: number;
  onDeleteSelected: () => void;
  deleteDisabled?: boolean;
  beamEnabled?: boolean;
  onBeamSelected?: () => void;
  beamDisabled?: boolean;
  flipEnabled?: boolean;
  onFlipSelected?: () => void;
  flipDisabled?: boolean;
  slurEnabled?: boolean;
  onSlurSelected?: () => void;
  slurDisabled?: boolean;
  labelEnabled?: boolean;
  onTextLabel?: () => void;
  labelDisabled?: boolean;
  resetSlurEnabled?: boolean;
  onResetSlur?: () => void;
  resetSlurDisabled?: boolean;
  dashedSlurEnabled?: boolean;
  onDashedSlur?: () => void;
  dashedSlurDisabled?: boolean;
  beamHideEnabled?: boolean;
  onBeamHideArm?: () => void;
  beamHideArmed?: boolean;
  beamHideDisabled?: boolean;
};

export default function EditPanel({
  enabled,
  selectedCount,
  onDeleteSelected,
  deleteDisabled = false,
  beamEnabled = false,
  onBeamSelected,
  beamDisabled = false,
  flipEnabled = false,
  onFlipSelected,
  flipDisabled = false,
  slurEnabled = false,
  onSlurSelected,
  slurDisabled = false,
  labelEnabled = false,
  onTextLabel,
  labelDisabled = false,
  resetSlurEnabled = false,
  onResetSlur,
  resetSlurDisabled = false,
  dashedSlurEnabled = false,
  onDashedSlur,
  dashedSlurDisabled = false,
  beamHideEnabled = false,
  onBeamHideArm,
  beamHideArmed = false,
  beamHideDisabled = false,
}: EditPanelProps) {
  const [isOpen, setIsOpen] = useState(true);
  const [selectBy, setSelectBy] = useState<'syllable' | 'neume' | 'nc' | 'staff'>('syllable');
  const canDelete = enabled && selectedCount > 0 && !deleteDisabled;
  const canBeam = enabled && beamEnabled && !beamDisabled;
  const canFlip = enabled && flipEnabled && !flipDisabled;
  const canSlur = enabled && slurEnabled && !slurDisabled;
  const canLabel = enabled && labelEnabled && !labelDisabled;
  const canResetSlur = enabled && resetSlurEnabled && !resetSlurDisabled;
  const canDashedSlur = enabled && dashedSlurEnabled && !dashedSlurDisabled;
  const canBeamHide = enabled && beamHideEnabled && !beamHideDisabled;

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
            <p className="control">
              <button
                type="button"
                className="button"
                id="beamSelected"
                disabled={!canBeam}
                onClick={onBeamSelected}
              >
                Beam
              </button>
            </p>
            <p className="control">
              <button
                type="button"
                className="button"
                id="slurSelected"
                disabled={!canSlur}
                onClick={onSlurSelected}
              >
                Slur
              </button>
            </p>
            <p className="control">
              <button
                type="button"
                className="button"
                id="labelText"
                disabled={!canLabel}
                onClick={onTextLabel}
              >
                Text
              </button>
            </p>
            <p className="control">
              <button
                type="button"
                className="button"
                id="flipSelected"
                disabled={!canFlip}
                onClick={onFlipSelected}
              >
                Flip
              </button>
            </p>
            <p className="control">
              <button
                type="button"
                className="button"
                id="dashedSlur"
                disabled={!canDashedSlur}
                onClick={onDashedSlur}
              >
                Dashed
              </button>
            </p>
            <p className="control">
              <button
                type="button"
                className={`button ${beamHideArmed ? 'is-active' : ''}`}
                id="hideBeamSegment"
                disabled={!canBeamHide}
                onClick={onBeamHideArm}
                title="Drag a box over the selected beam to hide that portion"
              >
                Hide beam
              </button>
            </p>
            <p className="control">
              <button
                type="button"
                className="button"
                id="resetSlur"
                disabled={!canResetSlur}
                onClick={onResetSlur}
              >
                Reset Slur
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
