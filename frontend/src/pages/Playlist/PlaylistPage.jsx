import { useLocation, useNavigate } from "react-router-dom";
import { useEffect } from "react";
import Navbar from "../../components/Navbar";
import Footer from "../../components/Footer";
import PageLayout from "../../components/PageLayout";
import "./PlaylistPage.css";

export default function PlaylistPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const data = location.state;

  // Redirect if accessed directly
  useEffect(() => {
    if (!data?.playlist) {
      navigate("/analyze", { replace: true });
    }
  }, [data, navigate]);

  if (!data?.playlist) return null;

  const { playlist, analysis, preference, settings } = data;

  return (
    <PageLayout>
      <Navbar centerLabel="Your Playlist" showBack backTo="/result" />

      <main className="pl-main">
        <div className="pl-content">

          {/* ── Hero ── */}
          <section className="pl-hero">
            <div className="pl-hero-orb">
              <div className="pl-hero-ring pl-hero-ring-1" />
              <div className="pl-hero-ring pl-hero-ring-2" />
              <div className="pl-hero-core">
                {analysis?.moodEmoji || "🎵"}
              </div>
            </div>
            <h1 className="pl-hero-title">{playlist.title}</h1>
            <p className="pl-hero-sub">
              {playlist.tracks.length} tracks
              {preference === "uplift" ? " • Uplifting" : " • Mood-matched"}
              {settings?.languages?.length > 0 && ` • ${settings.languages.join(", ")}`}
            </p>
          </section>

          {/* ── Settings Summary ── */}
          <div className="pl-settings-bar">
            <div className="pl-setting">
              <span className="pl-setting-icon">🎚</span>
              <span className="pl-setting-text">
                {settings?.intensity < 33 ? "Soft" : settings?.intensity < 66 ? "Balanced" : "Strong"}
              </span>
            </div>
            <div className="pl-setting-divider" />
            <div className="pl-setting">
              <span className="pl-setting-icon">🎵</span>
              <span className="pl-setting-text">{playlist.tracks.length} tracks</span>
            </div>
            <div className="pl-setting-divider" />
            <div className="pl-setting">
              <span className="pl-setting-icon">
                {preference === "uplift" ? "🌟" : "🎭"}
              </span>
              <span className="pl-setting-text">
                {preference === "uplift" ? "Uplift" : "Match"}
              </span>
            </div>
          </div>

          {/* ── Track List ── */}
          <section className="pl-tracklist">
            {playlist.tracks.length > 0 ? (
              playlist.tracks.map((track, i) => (
                <div key={track.id} className="pl-track" style={{ animationDelay: `${i * 0.05}s` }}>
                  <div className="pl-track-num">{String(i + 1).padStart(2, "0")}</div>
                  <div className="pl-track-accent" style={{ background: track.color }} />
                  <div className="pl-track-info">
                    <span className="pl-track-title">{track.title}</span>
                    <span className="pl-track-artist">{track.artist}</span>
                  </div>
                  <span className="pl-track-duration">{track.duration}</span>
                  <button className="pl-track-play" aria-label={`Play ${track.title}`}>
                    <svg width="12" height="14" viewBox="0 0 12 14" fill="currentColor">
                      <path d="M0 0L12 7L0 14V0Z" />
                    </svg>
                  </button>
                </div>
              ))
            ) : (
              <div className="pl-empty">
                <p>No tracks matched your criteria. Try adjusting your preferences.</p>
              </div>
            )}
          </section>

          {/* ── Actions ── */}
          <div className="pl-actions">
            <button
              className="pl-action-btn pl-action-btn--primary"
              onClick={() => navigate("/analyze")}
            >
              ✦ New Analysis
            </button>
            <button
              className="pl-action-btn pl-action-btn--secondary"
              onClick={() => navigate(-1)}
            >
              ← Back to Results
            </button>
          </div>
        </div>
      </main>

      <Footer />
    </PageLayout>
  );
}
