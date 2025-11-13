import { useState } from 'react';
import { ChevronDown } from 'lucide-react';

export default function DisplayPanel() {
  const [isOpen, setIsOpen] = useState(true);
  const [zoom, setZoom] = useState(100);
  const [glyphOpacity, setGlyphOpacity] = useState(100);
  const [imageOpacity, setImageOpacity] = useState(100);
  const [highlightType, setHighlightType] = useState('Off');
  const [isHighlightOpen, setIsHighlightOpen] = useState(false);

  return (
    <div className="panel">
      <p className="panel-heading" id="displayHeader" onClick={() => setIsOpen(!isOpen)} style={{ cursor: 'pointer' }}>
        Display
        <ChevronDown className={`is-pulled-right ${isOpen ? '' : 'rotate-180'}`} size={20} />
      </p>
      {isOpen && (
        <div id="displayContents">
          <a className="panel-block has-text-centered">
            <button className="button" onClick={() => setZoom(100)}>
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
              onChange={(e) => setZoom(Number(e.target.value))}
              style={{ flex: 1, margin: '0 10px' }}
            />
            <output id="zoomOutput" htmlFor="zoomSlider">
              {zoom}
            </output>
          </a>

          <a className="panel-block has-text-centered">
            <button className="button" onClick={() => setGlyphOpacity(100)}>
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
              onChange={(e) => setGlyphOpacity(Number(e.target.value))}
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
