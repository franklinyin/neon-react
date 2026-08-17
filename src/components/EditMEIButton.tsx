import React from 'react';

type EditMEIButtonProps = {
  isEditMode: boolean;
  onEnterEditMode: () => void;
  onExitEditMode: () => void;
  onDownloadMEI?: () => void;
  downloadDisabled?: boolean;
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
  downloadDisabled = false,
}) => {
  const fileMenuItems = [
    { id: 'save', label: 'Save' },
    { id: 'export', label: 'Save and Export to File' },
    { id: 'getmei', label: 'Download MEI' },
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
        {fileMenuItems.map((item) => {
          const isDownload = item.id === 'getmei';
          const disabled = isDownload && downloadDisabled;
          return (
            <a
              key={item.id}
              id={item.id}
              className="navbar-item"
              href="#"
              aria-disabled={disabled || undefined}
              onClick={(e) => {
                e.preventDefault();
                if (isDownload) {
                  if (disabled) {
                    return;
                  }
                  onDownloadMEI?.();
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
