import React from 'react';

interface PrimitiveElement {
  id: string;
  label: string;
  imagePath: string;
  ariaLabel?: string;
}

interface PrimitiveElementsProps {
  onElementClick?: (elementId: string) => void;
  activeElementId?: string;
}

/**
 * ============================================================================
 * IMAGE SCALE CONFIGURATION
 * ============================================================================
 * Adjust these values to control how much the images are scaled/zoomed
 * within the 42px × 42px button frame.
 * 
 * Higher values = larger images (more cropping of transparent areas)
 * Lower values = smaller images (more transparent space visible)
 * 
 * Recommended range: 1.0 to 5.0
 * ============================================================================
 */
const IMAGE_SCALE_CONFIG = {
  notehead: 0.5,      // Scale for notehead image
  openNotehead: 0.5,  // Scale for openNotehead image
  quaverFlag: 0.9,    // Scale for quaverFlag image
} as const;

/**
 * Primitive Elements Component
 * Displays the first three primitive elements: notehead, opennotehead, and quarverflag
 */
const PrimitiveElements: React.FC<PrimitiveElementsProps> = ({ 
  onElementClick,
  activeElementId 
}) => {
  const elements: PrimitiveElement[] = [
    { 
      id: 'notehead', 
      label: 'Notehead', 
      imagePath: '/assets/img/notehead.svg',
      ariaLabel: 'notehead'
    },
    { 
      id: 'openNotehead', 
      label: 'Open Notehead', 
      imagePath: '/assets/img/openNotehead.svg',
      ariaLabel: 'open notehead'
    },
    { 
      id: 'quaverFlag', 
      label: 'Quaver Flag', 
      imagePath: '/assets/img/quaverFlag.svg',
      ariaLabel: 'quaver flag'
    }
  ];

  // Get image scale from configuration
  const getImageScale = (elementId: string): number => {
    return IMAGE_SCALE_CONFIG[elementId as keyof typeof IMAGE_SCALE_CONFIG] || 1.0;
  };

  return (
    <>
      {elements.map((element) => {
        const scale = getImageScale(element.id);
        return (
          <p key={element.id} className="control">
            <button
              id={element.id}
              className={`button insertel smallel ${activeElementId === element.id ? 'is-active' : ''}`}
              aria-label={element.ariaLabel || element.label}
              title={element.label}
              onClick={() => onElementClick?.(element.id)}
              style={{
                overflow: 'hidden',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: 0,
                position: 'relative',
                width: '42px',
                height: '42px'
              }}
            >
              <img 
                src={element.imagePath} 
                alt={element.label}
                className="image"
                style={{
                  width: '100%',
                  height: '100%',
                  objectFit: 'contain',
                  objectPosition: 'center',
                  transform: `scale(${scale})`,
                  transformOrigin: 'center'
                }}
              />
            </button>
          </p>
        );
      })}
    </>
  );
};

export default PrimitiveElements;

