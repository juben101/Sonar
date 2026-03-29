import { useState, useRef, useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { moodApi } from "../../services/api";
import Navbar from "../../components/Navbar";
import Footer from "../../components/Footer";
import PageLayout from "../../components/PageLayout";
import "./ResultPage.css";

const LANGUAGE_OPTIONS = [
  "English", "Hindi", "Spanish", "Korean", "Japanese",
  "French", "Tamil", "Telugu", "Punjabi", "Arabic",
  "Portuguese", "German", "Italian", "Mandarin",
];

export default function ResultPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const analysisData = location.state?.analysis;

  const [preference, setPreference] = useState(null); // "match" | "uplift"
  const [languages, setLanguages] = useState(["English"]);
  const [artistInput, setArtistInput] = useState("");
  const [intensity, setIntensity] = useState(50);
  const [trackCount, setTrackCount] = useState(15);
  const [generating, setGenerating] = useState(false);

  const customRef = useRef(null);

  // Redirect if no analysis data
  useEffect(() => {
    if (!analysisData) {
      navigate("/analyze", { replace: true });
    }
  }, [analysisData, navigate]);

  // Scroll to customization when preference selected
  useEffect(() => {
    if (preference) {
      setTimeout(() => {
        customRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 100);
    }
  }, [preference]);

  const toggleLanguage = (lang) => {
    setLanguages((prev) =>
      prev.includes(lang)
        ? prev.filter((l) => l !== lang)
        : [...prev, lang]
    );
  };

  const handleGenerate = async () => {
    if (languages.length === 0) return;
    setGenerating(true);

    try {
      const artists = artistInput
        .split(",")
        .map((a) => a.trim())
        .filter(Boolean);

      const data = await moodApi.playlist(
        analysisData.dimensions,
        preference,
        languages,
        artists,
        intensity,
        trackCount,
        analysisData.genre,
        analysisData.base_emotion
      );

      navigate("/playlist", {
        state: {
          playlist: data,
          analysis: analysisData,
          preference,
          settings: { languages, artists, intensity, trackCount },
        },
      });
    } catch {
      // Fallback
      navigate("/playlist", {
        state: {
          playlist: { title: "Sonar Mix", tracks: [] },
          analysis: analysisData,
          preference,
          settings: { languages, artists: [], intensity, trackCount },
        },
      });
    } finally {
      setGenerating(false);
    }
  };

  if (!analysisData) return null;

  const { moodEmoji, base_emotion, sub_emotion, sentiment, confidence, explanation, genre, genre_reason, dimensions } = analysisData;

  const sentimentColors = {
    Positive: { bg: "rgba(74, 222, 128, 0.08)", border: "rgba(74, 222, 128, 0.25)", text: "#4ade80" },
    Negative: { bg: "rgba(255, 60, 100, 0.08)", border: "rgba(255, 60, 100, 0.25)", text: "#ff6b8a" },
    Mixed: { bg: "rgba(201, 109, 255, 0.08)", border: "rgba(201, 109, 255, 0.25)", text: "#c96dff" },
    Neutral: { bg: "rgba(255, 255, 255, 0.05)", border: "rgba(255, 255, 255, 0.15)", text: "rgba(255,255,255,0.5)" },
  };
  const sc = sentimentColors[sentiment] || sentimentColors.Neutral;

  const intensityLabel = intensity < 33 ? "Soft" : intensity < 66 ? "Balanced" : "Strong";

  return (
    <PageLayout>
      <Navbar centerLabel="Analysis" showBack backTo="/analyze" />

      <main className="rp-main">
        <div className="rp-content">

          {/* ── Emotion Analysis ── */}
          <section className="rp-emotion-section">
            <div className="rp-section-badge">ANALYSIS COMPLETE</div>
            <h1 className="rp-section-title">Your emotional state</h1>
            <p className="rp-section-subtitle">Here's what we detected from what you shared.</p>

            <div className="rp-emotion-cards">
              <div className="rp-card">
                <div className="rp-card-emoji">{moodEmoji}</div>
                <div className="rp-card-label">Primary Emotion</div>
                <div className="rp-card-value">{base_emotion}</div>
              </div>
              <div className="rp-card">
                <div className="rp-card-icon">✦</div>
                <div className="rp-card-label">Sub-emotion</div>
                <div className="rp-card-value">{sub_emotion}</div>
              </div>
              <div className="rp-card" style={{ background: sc.bg, borderColor: sc.border }}>
                <div className="rp-card-icon" style={{ color: sc.text }}>◎</div>
                <div className="rp-card-label">Sentiment</div>
                <div className="rp-card-value" style={{ color: sc.text }}>{sentiment}</div>
              </div>
            </div>

            <div className="rp-confidence">
              <div className="rp-confidence-header">
                <span className="rp-confidence-label">Confidence</span>
                <span className="rp-confidence-pct">{confidence}%</span>
              </div>
              <div className="rp-confidence-track">
                <div className="rp-confidence-fill" style={{ width: `${confidence}%` }} />
              </div>
            </div>
          </section>

          {/* ── Explanation ── */}
          <section className="rp-explanation-section">
            <h2 className="rp-explanation-title">Why this emotion?</h2>
            <p className="rp-explanation-text">{explanation}</p>
          </section>

          {/* ── Genre Recommendation ── */}
          <section className="rp-genre-section">
            <div className="rp-genre-badge">🎵 RECOMMENDED GENRE</div>
            <h2 className="rp-genre-name">{genre}</h2>
            <p className="rp-genre-reason">{genre_reason}</p>
          </section>

          {/* ── Weather Context (if available) ── */}
          {analysisData.weather && (
            <div className="rp-weather-bar">
              <span className="rp-weather-icon">
                {analysisData.weather.condition === "Rain" ? "🌧" :
                 analysisData.weather.condition === "Clear" ? "☀️" :
                 analysisData.weather.condition === "Clouds" ? "☁️" :
                 analysisData.weather.condition === "Snow" ? "❄️" :
                 analysisData.weather.condition === "Thunderstorm" ? "⛈" :
                 analysisData.weather.condition === "Drizzle" ? "🌦" : "🌤"}
              </span>
              <span className="rp-weather-text">
                {analysisData.weather.city} · {analysisData.weather.description} · {analysisData.weather.temp_c}°C
              </span>
              <span className="rp-weather-label">influenced your genre</span>
            </div>
          )}

          {/* ── Emotional Spectrum ── */}
          <section className="rp-spectrum-section">
            <h2 className="rp-spectrum-title">Emotional spectrum</h2>
            <div className="rp-dimensions">
              {dimensions.map((d) => (
                <div key={d.name} className="rp-dim">
                  <div className="rp-dim-header">
                    <span className="rp-dim-name">{d.name}</span>
                    <span className="rp-dim-val">{d.value}%</span>
                  </div>
                  <div className="rp-dim-track">
                    <div className="rp-dim-fill" style={{ width: `${d.value}%`, background: d.color }} />
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* ── Music Preference ── */}
          <section className="rp-preference-section">
            <h2 className="rp-preference-title">How would you like your music?</h2>
            <p className="rp-preference-subtitle">Choose how we should curate your playlist.</p>
            <div className="rp-preference-options">
              <button
                className={`rp-pref-btn rp-pref-btn--match ${preference === "match" ? "rp-pref-btn--selected" : ""}`}
                onClick={() => setPreference("match")}
              >
                <span className="rp-pref-emoji">🎭</span>
                <span className="rp-pref-label">Match my current mood</span>
                <span className="rp-pref-desc">Songs that resonate with how you feel right now</span>
              </button>
              <button
                className={`rp-pref-btn rp-pref-btn--uplift ${preference === "uplift" ? "rp-pref-btn--selected" : ""}`}
                onClick={() => setPreference("uplift")}
              >
                <span className="rp-pref-emoji">🌟</span>
                <span className="rp-pref-label">Uplift my mood</span>
                <span className="rp-pref-desc">Songs to gently shift your energy upward</span>
              </button>
            </div>
          </section>

          {/* ── Customize Playlist (visible after preference selected) ── */}
          {preference && (
            <section className="rp-customize-section" ref={customRef}>
              <h2 className="rp-customize-title">Customize your playlist</h2>
              <p className="rp-customize-subtitle">
                Choose your language preferences and music intensity.
              </p>

              {/* Languages */}
              <div className="rp-field">
                <label className="rp-field-label">Languages</label>
                <div className="rp-language-tags">
                  {LANGUAGE_OPTIONS.map((lang) => (
                    <button
                      key={lang}
                      className={`rp-lang-tag ${languages.includes(lang) ? "rp-lang-tag--active" : ""}`}
                      onClick={() => toggleLanguage(lang)}
                    >
                      {lang}
                    </button>
                  ))}
                </div>
              </div>

              {/* Artists */}
              <div className="rp-field">
                <label className="rp-field-label">Artists <span className="rp-field-opt">(optional)</span></label>
                <input
                  type="text"
                  className="rp-artist-input"
                  placeholder="e.g. Bon Iver, Adele, The Weeknd"
                  value={artistInput}
                  onChange={(e) => setArtistInput(e.target.value)}
                />
                <span className="rp-field-hint">Separate multiple artists with commas</span>
              </div>

              {/* Intensity Slider */}
              <div className="rp-field">
                <div className="rp-slider-header">
                  <label className="rp-field-label">Intensity</label>
                  <span className="rp-slider-value">{intensityLabel}</span>
                </div>
                <div className="rp-slider-wrap">
                  <span className="rp-slider-end">soft</span>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    value={intensity}
                    onChange={(e) => setIntensity(Number(e.target.value))}
                    className="rp-slider"
                  />
                  <span className="rp-slider-end">strong</span>
                </div>
              </div>

              {/* Track Count Slider */}
              <div className="rp-field">
                <div className="rp-slider-header">
                  <label className="rp-field-label">Number of tracks</label>
                  <span className="rp-slider-value">{trackCount}</span>
                </div>
                <div className="rp-slider-wrap">
                  <span className="rp-slider-end">5</span>
                  <input
                    type="range"
                    min="5"
                    max="50"
                    value={trackCount}
                    onChange={(e) => setTrackCount(Number(e.target.value))}
                    className="rp-slider"
                  />
                  <span className="rp-slider-end">50</span>
                </div>
              </div>

              {/* Generate Button */}
              <button
                className={`rp-generate-btn ${languages.length > 0 ? "rp-generate-btn--ready" : ""}`}
                onClick={handleGenerate}
                disabled={languages.length === 0 || generating}
              >
                {generating ? (
                  <>
                    <span className="rp-generate-spinner" />
                    Generating...
                  </>
                ) : (
                  <>✦ Generate Playlist</>
                )}
              </button>
            </section>
          )}
        </div>
      </main>

      <Footer />
    </PageLayout>
  );
}