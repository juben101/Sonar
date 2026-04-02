import { useNavigate } from "react-router-dom";
import "./Navbar.css";

/**
 * Shared navigation bar used across all authenticated pages.
 *
 * Props:
 * - centerLabel: text shown in the center (e.g. "Your Library", "Mood Analysis")
 * - showBack: if true, shows a "← Back" button on the right
 * - backTo: path for the back button (default: "/dashboard")
 * - backLabel: label for back button (default: "← Back to Library")
 * - rightContent: optional ReactNode to render on the right instead of back button
 * - onLogoClick: optional path when clicking logo (default: "/")
 */
export default function Navbar({
  centerLabel,
  showBack = false,
  backTo = "/dashboard",
  backLabel = "← Back to Library",
  rightContent,
  onLogoClick = "/dashboard",
}) {
  const navigate = useNavigate();

  return (
    <nav className="sn-nav">
      <div className="sn-nav-inner">
        <div className="sn-nav-logo" onClick={() => navigate(onLogoClick)}>
          <span className="sn-nav-logo-icon">🎵</span>
          <span className="sn-nav-logo-text">Sonar</span>
        </div>

        {centerLabel && (
          <div className="sn-nav-center">
            <span className="sn-nav-tag">{centerLabel}</span>
          </div>
        )}

        <div className="sn-nav-right">
          {rightContent
            ? rightContent
            : showBack && (
                <button className="sn-nav-back" onClick={() => navigate(backTo)}>
                  {backLabel}
                </button>
              )}
        </div>
      </div>
    </nav>
  );
}
