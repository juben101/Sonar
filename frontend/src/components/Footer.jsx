import "./Footer.css";

/**
 * Shared footer used across all pages.
 */
export default function Footer() {
  return (
    <footer className="sn-footer">
      <div className="sn-footer-inner">
        <div className="sn-footer-brand">
          <span className="sn-footer-logo-icon">🎵</span>
          <span className="sn-footer-logo-text">Sonar</span>
          <p className="sn-footer-desc">AI-powered emotion-aware music platform.</p>
        </div>
        <div className="sn-footer-links">
          <div className="sn-footer-col">
            <h4>Product</h4>
            <a href="#">Features</a>
            <a href="#">How It Works</a>
          </div>
          <div className="sn-footer-col">
            <h4>Company</h4>
            <a href="#">About</a>
            <a href="#">Contact</a>
          </div>
        </div>
      </div>
      <div className="sn-footer-bottom">
        <p>© 2026 Sonar. All rights reserved.</p>
      </div>
    </footer>
  );
}
