import React, { useState } from 'react';

/**
 * Edit MEI Button Component
 * Exact replica of the original Edit MEI button and File dropdown
 * Based on src/utils/EditControls.ts and src/utils/EditContents.ts
 * 
 * Structure matches exactly:
 * - Initial: <div id="dropdown_toggle"><a class="navbar-item"><button id="edit_mode">Edit MEI</button></a></div>
 * - After click: <div class="navbar-item has-dropdown is-hoverable"><a class="navbar-link">File</a><div class="navbar-dropdown" id="navbar-dropdown-options">...</div></div>
 */
const EditMEIButton: React.FC = () => {
  const [isEditMode, setIsEditMode] = useState(false);

  const handleEditModeClick = () => {
    setIsEditMode(true);
  };

  // File dropdown menu items (exact replica from EditContents.ts)
  // Order: Save, Save and Export to File, Download MEI, Revert
  const fileMenuItems = [
    { id: 'save', label: 'Save' },
    { id: 'export', label: 'Save and Export to File' },
    { id: 'getmei', label: 'Download MEI' },
    { id: 'revert', label: 'Revert' }
  ];

  if (!isEditMode) {
    // Initial state: Show Edit MEI button
    // Exact structure from prepareEditMode() in EditControls.ts
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

  // After clicking: Show File dropdown
  // Exact structure from navbarDropdownMenu in EditContents.ts
  return (
    <div className="navbar-item has-dropdown is-hoverable">
      <a className="navbar-link">File</a>
      <div className="navbar-dropdown" id="navbar-dropdown-options">
        {fileMenuItems.map((item) => (
          <a 
            key={item.id}
            id={item.id}
            className="navbar-item"
            href="#" 
            onClick={(e) => {
              e.preventDefault();
              // Placeholder handlers - will be connected to actual functionality later
              console.log(`Clicked: ${item.id}`);
            }}
          >
            {item.label}
          </a>
        ))}
      </div>
    </div>
  );
};

export default EditMEIButton;

