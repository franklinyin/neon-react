import React, { useState } from 'react';

type EditMEIButtonProps = {
  onDownloadMEI?: () => void;
  downloadDisabled?: boolean;
};

/**
 * Edit MEI Button Component
 * Exact replica of the original Edit MEI button and File dropdown
 * Based on src/utils/EditControls.ts and src/utils/EditContents.ts
 */
const EditMEIButton: React.FC<EditMEIButtonProps> = ({
  onDownloadMEI,
  downloadDisabled = false,
}) => {
  const [isEditMode, setIsEditMode] = useState(false);

  const handleEditModeClick = () => {
    setIsEditMode(true);
  };

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
            onClick={handleEditModeClick}
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
                  return;
                }
                console.log(`Clicked: ${item.id}`);
              }}
            >
              {item.label}
            </a>
          );
        })}
      </div>
    </div>
  );
};

export default EditMEIButton;
