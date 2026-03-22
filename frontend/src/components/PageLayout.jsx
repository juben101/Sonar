import StarfieldCanvas from "./StarfieldCanvas";
import "./PageLayout.css";

/**
 * Shared page layout wrapper.
 * Provides: dark background, starfield, ambient glow blobs.
 *
 * Props:
 * - children: page content
 * - className: optional extra class on the root div
 */
export default function PageLayout({ children, className = "" }) {
  return (
    <div className={`pl-root ${className}`}>
      <StarfieldCanvas starCount={60} />
      <div className="pl-glow pl-glow-1" />
      <div className="pl-glow pl-glow-2" />
      {children}
    </div>
  );
}
