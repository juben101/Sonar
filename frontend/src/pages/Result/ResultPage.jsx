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

// Artists organized by language for curated selection
const ARTISTS_BY_LANGUAGE = {
  English: ["Taylor Swift", "The Weeknd", "Adele", "Ed Sheeran", "Billie Eilish", "Drake", "Dua Lipa", "Harry Styles", "SZA", "Coldplay", "Bon Iver", "Post Malone", "Olivia Rodrigo", "Kendrick Lamar", "Arctic Monkeys"],
  Hindi: ["Arijit Singh", "Shreya Ghoshal", "Pritam", "A.R. Rahman", "Neha Kakkar", "Atif Aslam", "Jubin Nautiyal", "Lata Mangeshkar", "Kishore Kumar", "Vishal-Shekhar"],
  Spanish: ["Bad Bunny", "Shakira", "Rosalía", "J Balvin", "Daddy Yankee", "Ozuna", "Enrique Iglesias", "Karol G", "Rauw Alejandro", "Maluma"],
  Korean: ["BTS", "BLACKPINK", "Stray Kids", "NewJeans", "IU", "EXO", "TWICE", "Seventeen", "aespa", "(G)I-DLE"],
  Japanese: ["YOASOBI", "Ado", "Kenshi Yonezu", "LiSA", "Official HIGE DANdism", "King Gnu", "Fujii Kaze", "Aimer", "ONE OK ROCK", "back number"],
  French: ["Stromae", "Aya Nakamura", "Édith Piaf", "Angèle", "Daft Punk", "Indila", "Maître Gims", "Zaz", "Jul", "Ninho"],
  Tamil: ["Anirudh Ravichander", "Yuvan Shankar Raja", "Sid Sriram", "Ilaiyaraaja", "A.R. Rahman", "D. Imman", "Chinmayi", "SPB", "Haricharan", "Andrea Jeremiah"],
  Telugu: ["S. Thaman", "Sid Sriram", "Anirudh Ravichander", "Devi Sri Prasad", "M.M. Keeravani", "Armaan Malik", "Shreya Ghoshal", "Haricharan", "Yazin Nizar", "Mangli"],
  Punjabi: ["Diljit Dosanjh", "AP Dhillon", "Sidhu Moose Wala", "Guru Randhawa", "Honey Singh", "Jass Manak", "Karan Aujla", "Hardy Sandhu", "Ammy Virk", "B Praak"],
  Arabic: ["Amr Diab", "Nancy Ajram", "Fairuz", "Mohamed Hamaki", "Elissa", "Tamer Hosny", "Wael Kfoury", "Sherine", "Angham", "Kadim Al Sahir"],
  Portuguese: ["Anitta", "Jorge Ben Jor", "Caetano Veloso", "Tom Jobim", "Sertanejo", "Luísa Sonza", "Henrique & Juliano", "Marília Mendonça", "Gilberto Gil", "Seu Jorge"],
  German: ["Rammstein", "Nena", "Kraftwerk", "Tokio Hotel", "Peter Fox", "Mark Forster", "Tim Bendzko", "AnnenMayKantereit", "Cro", "Apache 207"],
  Italian: ["Måneskin", "Andrea Bocelli", "Laura Pausini", "Eros Ramazzotti", "Mahmood", "Blanco", "Tiziano Ferro", "Gianni Morandi", "Mina", "Elodie"],
  Mandarin: ["Jay Chou", "JJ Lin", "Jolin Tsai", "G.E.M.", "Eason Chan", "Khalil Fong", "Hebe Tien", "Leehom Wang", "Faye Wong", "Zhou Shen"],
};

export default function ResultPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const analysisData = location.state?.analysis;

  const [preference, setPreference] = useState(null); // "match" | "uplift"
  const [languages, setLanguages] = useState(["English"]);
  const [selectedArtists, setSelectedArtists] = useState([]);
  const [intensity, setIntensity] = useState(50);
  const [trackCount, setTrackCount] = useState(15);
  const [generating, setGenerating] = useState(false);
  const [shareToast, setShareToast] = useState("");
  const [langDropdownOpen, setLangDropdownOpen] = useState(false);
  const [artistDropdownOpen, setArtistDropdownOpen] = useState(false);

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

  // Build available artists from selected languages
  const availableArtists = languages.flatMap(
    (lang) => (ARTISTS_BY_LANGUAGE[lang] || []).map((a) => ({ name: a, lang }))
  );

  // Remove artists from selection if their language is deselected
  useEffect(() => {
    const validNames = new Set(availableArtists.map((a) => a.name));
    setSelectedArtists((prev) => prev.filter((a) => validNames.has(a)));
  }, [languages]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggleLanguage = (lang) => {
    setLanguages((prev) =>
      prev.includes(lang)
        ? prev.length > 1 ? prev.filter((l) => l !== lang) : prev // keep at least 1
        : [...prev, lang]
    );
  };

  const toggleArtist = (name) => {
    setSelectedArtists((prev) =>
      prev.includes(name)
        ? prev.filter((a) => a !== name)
        : [...prev, name]
    );
  };

  const handleGenerate = async () => {
    if (languages.length === 0) return;
    setGenerating(true);

    try {
      const data = await moodApi.playlist(
        analysisData.dimensions,
        preference,
        languages,
        selectedArtists,
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
          settings: { languages, artists: selectedArtists, intensity, trackCount },
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

          {/* ── Share Analysis ── */}
          <div className="rp-share-row">
            <button className="rp-share-btn" onClick={async () => {
              const dimStr = dimensions.slice(0, 3).map(d => `${d.name}: ${d.value}%`).join(", ");
              const text = `${moodEmoji} My Sonar Mood Analysis\n\nEmotion: ${base_emotion} → ${sub_emotion}\nSentiment: ${sentiment} · Confidence: ${confidence}%\nGenre: ${genre}\n\n"${explanation}"\n\nSpectrum: ${dimStr}\n\n— Analyzed by Sonar`;
              if (navigator.share) {
                try { await navigator.share({ title: "My Mood Analysis", text }); return; } catch { /* */ }
              }
              try {
                await navigator.clipboard.writeText(text);
                setShareToast("Copied to clipboard!");
                setTimeout(() => setShareToast(""), 2000);
              } catch {
                setShareToast("Could not share");
                setTimeout(() => setShareToast(""), 2000);
              }
            }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/>
                <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/>
              </svg>
              Share Analysis
            </button>
          </div>
          {shareToast && <div className="rp-share-toast">{shareToast}</div>}

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

              {/* Language Dropdown */}
              <div className="rp-field">
                <label className="rp-field-label">Languages</label>
                <div className="rp-dropdown">
                  <button
                    className="rp-dropdown-trigger"
                    onClick={() => { setLangDropdownOpen(!langDropdownOpen); setArtistDropdownOpen(false); }}
                    type="button"
                  >
                    <span className="rp-dropdown-text">
                      {languages.length > 0 ? languages.join(", ") : "Select languages"}
                    </span>
                    <svg className={`rp-dropdown-arrow ${langDropdownOpen ? "rp-dropdown-arrow--open" : ""}`} width="12" height="12" viewBox="0 0 12 12" fill="currentColor">
                      <path d="M2 4l4 4 4-4" stroke="currentColor" strokeWidth="1.5" fill="none" />
                    </svg>
                  </button>
                  {langDropdownOpen && (
                    <div className="rp-dropdown-menu">
                      {LANGUAGE_OPTIONS.map((lang) => (
                        <button
                          key={lang}
                          className={`rp-dropdown-item ${languages.includes(lang) ? "rp-dropdown-item--active" : ""}`}
                          onClick={() => toggleLanguage(lang)}
                          type="button"
                        >
                          <span className="rp-dropdown-check">
                            {languages.includes(lang) ? "✓" : ""}
                          </span>
                          {lang}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Artists Dropdown (based on selected languages) */}
              <div className="rp-field">
                <label className="rp-field-label">Artists <span className="rp-field-opt">(optional)</span></label>
                <div className="rp-dropdown">
                  <button
                    className="rp-dropdown-trigger"
                    onClick={() => { setArtistDropdownOpen(!artistDropdownOpen); setLangDropdownOpen(false); }}
                    type="button"
                  >
                    <span className="rp-dropdown-text">
                      {selectedArtists.length > 0 ? selectedArtists.join(", ") : "Select artists"}
                    </span>
                    <svg className={`rp-dropdown-arrow ${artistDropdownOpen ? "rp-dropdown-arrow--open" : ""}`} width="12" height="12" viewBox="0 0 12 12" fill="currentColor">
                      <path d="M2 4l4 4 4-4" stroke="currentColor" strokeWidth="1.5" fill="none" />
                    </svg>
                  </button>
                  {artistDropdownOpen && (
                    <div className="rp-dropdown-menu">
                      {availableArtists.length === 0 ? (
                        <div className="rp-dropdown-empty">Select a language first</div>
                      ) : (
                        languages.map((lang) => {
                          const langArtists = ARTISTS_BY_LANGUAGE[lang] || [];
                          if (langArtists.length === 0) return null;
                          return (
                            <div key={lang}>
                              <div className="rp-dropdown-group">{lang}</div>
                              {langArtists.map((name) => (
                                <button
                                  key={name}
                                  className={`rp-dropdown-item ${selectedArtists.includes(name) ? "rp-dropdown-item--active" : ""}`}
                                  onClick={() => toggleArtist(name)}
                                  type="button"
                                >
                                  <span className="rp-dropdown-check">
                                    {selectedArtists.includes(name) ? "✓" : ""}
                                  </span>
                                  {name}
                                </button>
                              ))}
                            </div>
                          );
                        })
                      )}
                    </div>
                  )}
                </div>
                {selectedArtists.length > 0 && (
                  <div className="rp-selected-tags">
                    {selectedArtists.map((a) => (
                      <span key={a} className="rp-selected-tag">
                        {a}
                        <button className="rp-selected-tag-x" onClick={() => toggleArtist(a)} type="button">×</button>
                      </span>
                    ))}
                  </div>
                )}
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
                  <span className="rp-slider-end">2</span>
                  <input
                    type="range"
                    min="2"
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