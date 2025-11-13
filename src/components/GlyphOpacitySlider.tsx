import React, { useState, useEffect, useRef } from 'react';

/**
 * Glyph Opacity Slider Component
 * Controls the opacity of the rendered MEI glyphs (image only for now)
 * Based on setOpacityControls() in src/DisplayPanel/DisplayControls.ts
 */
interface GlyphOpacitySliderProps {
  /** CSS class name that contains the rendered MEI elements */
  meiClassName?: string;
  /** Initial opacity value (0-100) */
  initialOpacity?: number;
}

const GlyphOpacitySlider: React.FC<GlyphOpacitySliderProps> = ({
  meiClassName = 'neon-container', // Default class name
  initialOpacity = 100
}) => {
  const [opacity, setOpacity] = useState(initialOpacity);
  const [lastGlyphOpacity, setLastGlyphOpacity] = useState(100);
  const opacitySliderRef = useRef<HTMLInputElement>(null);
  const opacityOutputRef = useRef<HTMLOutputElement>(null);

  // Update opacity of MEI elements when slider changes
  useEffect(() => {
    const opacityValue = opacity / 100.0;
    const meiElements = document.querySelectorAll(`.${meiClassName}`) as NodeListOf<HTMLElement>;
    meiElements.forEach((element) => {
      element.style.opacity = opacityValue.toString();
    });
  }, [opacity, meiClassName]);

  const handleSliderChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newOpacity = parseInt(e.target.value);
    setOpacity(newOpacity);
    setLastGlyphOpacity(newOpacity);
  };

  const handleResetClick = () => {
    // Exact replica of reset button logic from setOpacityControls()
    // Toggle between 100% and the last lower opacity (or 0 if last was >= 95)
    const lowerOpacity = lastGlyphOpacity < 95 ? lastGlyphOpacity / 100.0 : 0;
    const newOpacity = opacity === 100 ? lowerOpacity : 1;
    const newOpacityPercent = Math.round(newOpacity * 100);
    
    setLastGlyphOpacity(opacity); // Store current before changing
    setOpacity(newOpacityPercent);
    
    if (opacitySliderRef.current) {
      opacitySliderRef.current.value = newOpacityPercent.toString();
    }
    if (opacityOutputRef.current) {
      opacityOutputRef.current.value = newOpacityPercent.toString();
    }
  };

  return (
    <a className="panel-block has-text-centered">
      <button 
        className="button" 
        id="reset-opacity"
        onClick={handleResetClick}
      >
        Glyph Opacity
      </button>
      <input
        ref={opacitySliderRef}
        aria-labelledby="reset-opacity"
        className="slider is-fullwidth"
        id="opacitySlider"
        type="range"
        min="0"
        max="100"
        step="5"
        value={opacity}
        onChange={handleSliderChange}
      />
      <output 
        ref={opacityOutputRef}
        id="opacityOutput" 
        htmlFor="opacitySlider"
      >
        {opacity}
      </output>
    </a>
  );
};

export default GlyphOpacitySlider;

