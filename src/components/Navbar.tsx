import { useState } from 'react';
import { Menu, ChevronDown } from 'lucide-react';

export default function Navbar() {
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  return (
    <nav className="navbar is-light">
      <div className="navbar-brand">
        <a className="navbar-item" id="home-link">
          <p>Neon</p>
        </a>
        <a
          role="button"
          className={`navbar-burger ${isMenuOpen ? 'is-active' : ''}`}
          aria-label="menu"
          aria-expanded={isMenuOpen}
          onClick={() => setIsMenuOpen(!isMenuOpen)}
        >
          <span aria-hidden="true"></span>
          <span aria-hidden="true"></span>
          <span aria-hidden="true"></span>
        </a>
      </div>

      <div className={`navbar-menu ${isMenuOpen ? 'is-active' : ''}`} id="navMenu">
        <div className="navbar-start">
          <div id="dropdown_toggle"></div>
        </div>

        <div className="navbar-end">
          <a
            className="navbar-item"
            href="https://forms.gle/vGUpvZKZxGX5QGJZ9"
            target="_blank"
            rel="noopener noreferrer"
          >
            Feedback Form
          </a>
          <div className="navbar-item has-dropdown is-hoverable">
            <a className="navbar-link">Help</a>
            <div className="navbar-dropdown is-right">
              <a
                className="navbar-item"
                href="//github.com/DDMAL/Neon/wiki/Instructions"
                target="_blank"
                rel="noopener noreferrer"
              >
                User Guide
              </a>
              <a
                className="navbar-item"
                href="//github.com/DDMAL/Neon/wiki"
                target="_blank"
                rel="noopener noreferrer"
              >
                Wiki
              </a>
              <a
                className="navbar-item"
                href="//ddmal.music.mcgill.ca"
                target="_blank"
                rel="noopener noreferrer"
              >
                DDMAL
              </a>
              <a className="navbar-item">Hotkeys</a>
              <a className="navbar-item" id="neon-version"></a>
            </div>
          </div>
        </div>
      </div>
    </nav>
  );
}
