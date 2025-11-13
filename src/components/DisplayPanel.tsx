import { useState, useEffect } from 'react';
import { ChevronDown } from 'lucide-react';

interface DisplayPanelProps {
  zoomHandler?: {
    zoom: number;
    zoomTo: (k: number) => void;
    resetZoomAndPan: () => void;
  };
}

export default function DisplayPanel({ zoomHandler }: DisplayPanelProps) {
  const [isOpen, setIsOpen] = useState(true);
  const [zoom, setZoom] = useState(zoomHandler?.zoom || 100);
  const [glyphOpacity, setGlyphOpacity] = useState(100);
  const [lastGlyphOpacity, setLastGlyphOpacity] = useState(100);
  const [imageOpacity, setImageOpacity] = useState(100);
  const [highlightType, setHighlightType] = useState('Off');
  const [isHighlightOpen, setIsHighlightOpen] = useState(false);

  // Sync with zoom handler
  useEffect(() => {
    if (zoomHandler) {
      setZoom(zoomHandler.zoom);
    }
  }, [zoomHandler?.zoom]);

  // Keyboard shortcuts for zoom (based on setZoomControls in DisplayControls.ts)
  useEffect(() => {
    if (!zoomHandler) return;

    const handleKeyDown = (evt: KeyboardEvent) => {
      const currentZoom = zoom;
      if (evt.key === '+') {
        // Increase zoom by 20
        const newZoom = Math.min(currentZoom + 20, 400);
        zoomHandler.zoomTo(newZoom / 100.0);
        setZoom(newZoom);
      } else if (evt.key === '-') {
        // Decrease zoom by 20
        const newZoom = Math.max(currentZoom - 20, 25);
        zoomHandler.zoomTo(newZoom / 100.0);
        setZoom(newZoom);
      } else if (evt.key === '0') {
        // Reset zoom
        zoomHandler.resetZoomAndPan();
        setZoom(100);
      }
    };

    document.body.addEventListener('keydown', handleKeyDown);
    return () => {
      document.body.removeEventListener('keydown', handleKeyDown);
    };
  }, [zoomHandler, zoom]);

  // Update opacity of MEI elements (images) when slider changes
  // Based on setOpacityFromSlider() in DisplayControls.ts
  useEffect(() => {
    const opacityValue = glyphOpacity / 100.0;
    // Target elements with class 'neon-container' or 'active-page' which contain the rendered MEI images
    const meiElements = document.querySelectorAll('.neon-container, .active-page') as NodeListOf<HTMLElement>;
    meiElements.forEach((element) => {
      element.style.opacity = opacityValue.toString();
    });
  }, [glyphOpacity]);

  return (
    <div className="panel">
      <p className="panel-heading" id="displayHeader" onClick={() => setIsOpen(!isOpen)} style={{ cursor: 'pointer' }}>
        Display
        <ChevronDown className={`is-pulled-right ${isOpen ? '' : 'rotate-180'}`} size={20} />
      </p>
      {isOpen && (
        <div id="displayContents">
          <a className="panel-block has-text-centered">
            <button 
              className="button" 
              id="reset-zoom"
              onClick={() => {
                if (zoomHandler) {
                  zoomHandler.resetZoomAndPan();
                  setZoom(100);
                } else {
                  setZoom(100);
                }
              }}
            >
              Zoom
            </button>
            <input
              className="slider is-fullwidth"
              id="zoomSlider"
              step="5"
              min="25"
              max="400"
              value={zoom}
              type="range"
              onChange={(e) => {
                const newZoom = Number(e.target.value);
                setZoom(newZoom);
                if (zoomHandler) {
                  zoomHandler.zoomTo(newZoom / 100.0);
                }
              }}
              style={{ flex: 1, margin: '0 10px' }}
            />
            <output id="zoomOutput" htmlFor="zoomSlider">
              {zoom}
            </output>
          </a>

          <a className="panel-block has-text-centered">
            <button 
              className="button" 
              id="reset-opacity"
              onClick={() => {
                // Exact replica of reset button logic from setOpacityControls()
                // Toggle between 100% and the last lower opacity (or 0 if last was >= 95)
                const lowerOpacity = lastGlyphOpacity < 95 ? lastGlyphOpacity / 100.0 : 0;
                const newOpacity = glyphOpacity === 100 ? lowerOpacity : 1;
                const newOpacityPercent = Math.round(newOpacity * 100);
                setLastGlyphOpacity(glyphOpacity); // Store current before changing
                setGlyphOpacity(newOpacityPercent);
              }}
            >
              Glyph Opacity
            </button>
            <input
              className="slider is-fullwidth"
              id="opacitySlider"
              step="5"
              min="0"
              max="100"
              value={glyphOpacity}
              type="range"
              onChange={(e) => {
                const newOpacity = Number(e.target.value);
                setGlyphOpacity(newOpacity);
                setLastGlyphOpacity(newOpacity);
              }}
              style={{ flex: 1, margin: '0 10px' }}
            />
            <output id="opacityOutput" htmlFor="opacitySlider">
              {glyphOpacity}
            </output>
          </a>

          <a className="panel-block has-text-centered">
            <button className="button" onClick={() => setImageOpacity(100)}>
              Image Opacity
            </button>
            <input
              className="slider is-fullwidth"
              id="bgOpacitySlider"
              step="5"
              min="0"
              max="100"
              value={imageOpacity}
              type="range"
              onChange={(e) => setImageOpacity(Number(e.target.value))}
              style={{ flex: 1, margin: '0 10px' }}
            />
            <output id="bgOpacityOutput" htmlFor="bgOpacitySlider">
              {imageOpacity}
            </output>
          </a>

          <div className="panel-block" id="extensible-block">
            <div className={`dropdown ${isHighlightOpen ? 'is-active' : ''}`} id="highlight-dropdown">
              <div className="dropdown-trigger">
                <button
                  className="button"
                  id="highlight-button"
                  aria-haspopup="true"
                  aria-controls="highlight-menu"
                  style={{ width: 'auto' }}
                  onClick={() => setIsHighlightOpen(!isHighlightOpen)}
                >
                  <span>Highlight</span>
                  <span id="highlight-type">&nbsp;- {highlightType}</span>
                  <ChevronDown size={16} style={{ marginLeft: '5px' }} />
                </button>
              </div>
              <div className="dropdown-menu" id="highlight-menu" role="menu">
                <div className="dropdown-content">
                  <a
                    className="dropdown-item"
                    onClick={() => {
                      setHighlightType('Staff');
                      setIsHighlightOpen(false);
                    }}
                  >
                    Staff
                  </a>
                  <a
                    className="dropdown-item"
                    onClick={() => {
                      setHighlightType('Syllable');
                      setIsHighlightOpen(false);
                    }}
                  >
                    Syllable
                  </a>
                  <a
                    className="dropdown-item"
                    onClick={() => {
                      setHighlightType('Neume');
                      setIsHighlightOpen(false);
                    }}
                  >
                    Neume
                  </a>
                  <hr className="dropdown-divider" />
                  <a
                    className="dropdown-item"
                    onClick={() => {
                      setHighlightType('Off');
                      setIsHighlightOpen(false);
                    }}
                  >
                    None
                  </a>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
