import { useNavigate } from "react-router-dom";
import Navbar from "../../components/Navbar";
import Footer from "../../components/Footer";
import PageLayout from "../../components/PageLayout";
import "./ResultPage.css";

const MOCK_RESULT = {
  mood: "Melancholy",
  moodEmoji: "🌧",
  confidence: 87,
  description:
    "Your words carry a gentle weight — a sense of reflection and longing, mixed with quiet strength. We've crafted a soundtrack that honors this feeling while gently lifting the atmosphere.",
  dimensions: [
    { name: "Sadness", value: 72, color: "#7c8cff" },
    { name: "Nostalgia", value: 65, color: "#c96dff" },
    { name: "Calm", value: 58, color: "#00d4aa" },
    { name: "Tension", value: 31, color: "#ff6b00" },
    { name: "Joy", value: 18, color: "#ffcc00" },
    { name: "Energy", value: 12, color: "#ff3c64" },
  ],
  playlist: {
    title: "Midnight Drift",
    tracks: [
      { id: 1, title: "Skinny Love", artist: "Bon Iver", duration: "3:58", color: "#7c8cff" },
      { id: 2, title: "Fourth of July", artist: "Sufjan Stevens", duration: "4:22", color: "#c96dff" },
      { id: 3, title: "All I Want", artist: "Kodaline", duration: "5:07", color: "#00d4aa" },
      { id: 4, title: "Holocene", artist: "Bon Iver", duration: "5:36", color: "#7c8cff" },
      { id: 5, title: "Pink Moon", artist: "Nick Drake", duration: "2:03", color: "#c96dff" },
      { id: 6, title: "Motion Sickness", artist: "Phoebe Bridgers", duration: "3:41", color: "#ff6b8a" },
      { id: 7, title: "The Night We Met", artist: "Lord Huron", duration: "3:28", color: "#7c8cff" },
      { id: 8, title: "To Build a Home", artist: "The Cinematic Orchestra", duration: "6:03", color: "#00d4aa" },
    ],
  },
};

export default function ResultPage() {
  const navigate = useNavigate();

  return (
    <PageLayout>
      <Navbar centerLabel="Your Playlist" showBack backTo="/dashboard" />

      <main className="rp-main">
        <div className="rp-content">
          {/* ── Mood Hero ── */}
          <section className="rp-mood-hero">
            <div className="rp-mood-orb">
              <div className="rp-mood-orb-ring rp-mood-orb-ring-1" />
              <div className="rp-mood-orb-ring rp-mood-orb-ring-2" />
              <div className="rp-mood-orb-core">
                <span className="rp-mood-emoji">{MOCK_RESULT.moodEmoji}</span>
              </div>
            </div>

            <div className="rp-mood-info">
              <div className="rp-mood-badge">DETECTED MOOD</div>
              <h1 className="rp-mood-name">{MOCK_RESULT.mood}</h1>
              <div className="rp-confidence">
                <div className="rp-confidence-bar">
                  <div
                    className="rp-confidence-fill"
                    style={{ width: `${MOCK_RESULT.confidence}%` }}
                  />
                </div>
                <span className="rp-confidence-label">{MOCK_RESULT.confidence}% confidence</span>
              </div>
              <p className="rp-mood-desc">{MOCK_RESULT.description}</p>
            </div>
          </section>

          {/* ── Mood Dimensions ── */}
          <section className="rp-dimensions">
            <h2 className="rp-section-title">Emotional Spectrum</h2>
            <div className="rp-dimension-grid">
              {MOCK_RESULT.dimensions.map((dim) => (
                <div key={dim.name} className="rp-dim-item">
                  <div className="rp-dim-header">
                    <span className="rp-dim-name">{dim.name}</span>
                    <span className="rp-dim-value" style={{ color: dim.color }}>
                      {dim.value}%
                    </span>
                  </div>
                  <div className="rp-dim-track">
                    <div
                      className="rp-dim-fill"
                      style={{ width: `${dim.value}%`, background: dim.color }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* ── Playlist ── */}
          <section className="rp-playlist">
            <div className="rp-playlist-header">
              <div>
                <h2 className="rp-section-title">{MOCK_RESULT.playlist.title}</h2>
                <p className="rp-playlist-meta">
                  {MOCK_RESULT.playlist.tracks.length} tracks · Generated for your mood
                </p>
              </div>
              <button className="rp-play-all-btn">
                <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor">
                  <path d="M3.5 1.5l9 5.5-9 5.5V1.5z" />
                </svg>
                Play All
              </button>
            </div>

            <div className="rp-tracks">
              {MOCK_RESULT.playlist.tracks.map((track, i) => (
                <div key={track.id} className="rp-track">
                  <span className="rp-track-num">{String(i + 1).padStart(2, "0")}</span>
                  <div className="rp-track-accent" style={{ background: track.color }} />
                  <div className="rp-track-info">
                    <span className="rp-track-title">{track.title}</span>
                    <span className="rp-track-artist">{track.artist}</span>
                  </div>
                  <span className="rp-track-duration">{track.duration}</span>
                  <button className="rp-track-play" aria-label={`Play ${track.title}`}>
                    <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor">
                      <path d="M3 1l8 5-8 5V1z" />
                    </svg>
                  </button>
                </div>
              ))}
            </div>
          </section>

          {/* ── Actions ── */}
          <section className="rp-actions">
            <button className="rp-action-primary" onClick={() => navigate("/analyze")}>
              ✦ New Analysis
            </button>
            <button className="rp-action-secondary" onClick={() => navigate("/dashboard")}>
              Save to Library
            </button>
          </section>
        </div>
      </main>

      <Footer />
    </PageLayout>
  );
}