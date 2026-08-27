import React, { useRef } from 'react';

type EditMEIButtonProps = {
  isEditMode: boolean;
  onEnterEditMode: () => void;
  onExitEditMode: () => void;
  onDownloadMEI?: () => void;
  onDownloadSVG?: () => void;
  downloadDisabled?: boolean;
  onOpenMEI?: (file: File) => void;
  openDisabled?: boolean;
};

/**
 * Edit MEI starts edit mode. While editing, this becomes the File dropdown.
 * Exit Edit restores the Edit MEI button (same as unclicking it).
 */
const EditMEIButton: React.FC<EditMEIButtonProps> = ({
  isEditMode,
  onEnterEditMode,
  onExitEditMode,
  onDownloadMEI,
  onDownloadSVG,
  downloadDisabled = false,
  onOpenMEI,
  openDisabled = false,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const fileMenuItems = [
    { id: 'openmei', label: 'Open MEI' },
    { id: 'save', label: 'Save' },
    { id: 'export', label: 'Save and Export to File' },
    { id: 'getmei', label: 'Download MEI' },
    { id: 'getsvg', label: 'Download SVG' },
    { id: 'revert', label: 'Revert' },
  ];

  if (!isEditMode) {
    return (
      <div id="dropdown_toggle">
        <a className="navbar-item">
          <button
            className="button"
            id="edit_mode"
            type="button"
            onClick={onEnterEditMode}
          >
            Edit MEI
          </button>
        </a>
      </div>
    );
  }

  return (
    <div className="navbar-item has-dropdown is-hoverable">
      <a className="navbar-link">File</a>
      <div className="navbar-dropdown" id="navbar-dropdown-options">
        <input
          ref={fileInputRef}
          id="open-mei-input"
          type="file"
          accept=".mei,.xml,text/xml,application/xml,application/mei+xml"
          style={{ display: 'none' }}
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = '';
            if (file) {
              onOpenMEI?.(file);
            }
          }}
        />
        {fileMenuItems.map((item) => {
          const isDownload = item.id === 'getmei' || item.id === 'getsvg';
          const isOpenMei = item.id === 'openmei';
          const disabled = (isDownload && downloadDisabled) || (isOpenMei && openDisabled);
          return (
            <a
              key={item.id}
              id={item.id}
              className="navbar-item"
              href="#"
              aria-disabled={disabled || undefined}
              onClick={(e) => {
                e.preventDefault();
                if (disabled) {
                  return;
                }
                if (isOpenMei) {
                  fileInputRef.current?.click();
                  return;
                }
                if (isDownload) {
                  if (item.id === 'getsvg') {
                    onDownloadSVG?.();
                  } else {
                    onDownloadMEI?.();
                  }
                }
              }}
            >
              {item.label}
            </a>
          );
        })}
        <hr className="navbar-divider" />
        <a
          id="exit-edit"
          className="navbar-item"
          href="#"
          onClick={(e) => {
            e.preventDefault();
            onExitEditMode();
          }}
        >
          Exit Edit
        </a>
      </div>
    </div>
  );
};

export default EditMEIButton;
