import { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import Navbar from "../../components/Navbar";
import Footer from "../../components/Footer";
import PageLayout from "../../components/PageLayout";
import "./AnalyzePage.css";

export default function AnalyzePage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState("text"); // "text" | "voice"
  const [textInput, setTextInput] = useState("");
  const [analyzing, setAnalyzing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [progressLabel, setProgressLabel] = useState("");
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [audioWave, setAudioWave] = useState(Array(40).fill(2));

  const timerRef = useRef(null);
  const waveRef = useRef(null);
  const progressRef = useRef(null);

  // Recording timer
  useEffect(() => {
    if (isRecording) {
      timerRef.current = setInterval(() => {
        setRecordingTime((t) => t + 1);
      }, 1000);
      // Animate wave
      waveRef.current = setInterval(() => {
        setAudioWave(
          Array(40)
            .fill(0)
            .map(() => Math.random() * 28 + 2)
        );
      }, 80);
    } else {
      clearInterval(timerRef.current);
      clearInterval(waveRef.current);
      if (!isRecording) {
        setAudioWave(Array(40).fill(2));
      }
    }
    return () => {
      clearInterval(timerRef.current);
      clearInterval(waveRef.current);
    };
  }, [isRecording]);

  const formatTime = (s) => {
    const m = Math.floor(s / 60).toString().padStart(2, "0");
    const sec = (s % 60).toString().padStart(2, "0");
    return `${m}:${sec}`;
  };

  const PROGRESS_STAGES = [
    { pct: 15, label: "Reading your input…" },
    { pct: 35, label: "Parsing emotional signals…" },
    { pct: 55, label: "Calibrating mood dimensions…" },
    { pct: 72, label: "Cross-referencing music library…" },
    { pct: 88, label: "Crafting your soundtrack…" },
    { pct: 100, label: "Playlist ready ✦" },
  ];

  const startAnalysis = () => {
    if (mode === "text" && !textInput.trim()) return;
    setAnalyzing(true);
    setProgress(0);

    let stageIndex = 0;
    const runStage = () => {
      if (stageIndex >= PROGRESS_STAGES.length) {
        setTimeout(() => navigate("/result"), 600);
        return;
      }
      const stage = PROGRESS_STAGES[stageIndex];
      setProgressLabel(stage.label);

      const startVal = stageIndex === 0 ? 0 : PROGRESS_STAGES[stageIndex - 1].pct;
      const endVal = stage.pct;
      const duration = stageIndex === PROGRESS_STAGES.length - 1 ? 700 : 500 + Math.random() * 400;
      const startTime = performance.now();

      const animate = (now) => {
        const elapsed = now - startTime;
        const t = Math.min(elapsed / duration, 1);
        const eased = t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
        setProgress(startVal + (endVal - startVal) * eased);
        if (t < 1) {
          progressRef.current = requestAnimationFrame(animate);
        } else {
          stageIndex++;
          setTimeout(runStage, 200);
        }
      };
      progressRef.current = requestAnimationFrame(animate);
    };

    runStage();
  };

  const canAnalyze = mode === "text" ? textInput.trim().length > 0 : recordingTime > 0;

  return (
    <PageLayout>
      <Navbar
        centerLabel="Mood Analysis"
        showBack
        backTo="/dashboard"
      />

      {/* ── Main ── */}
      <main className="az-main">
        {!analyzing ? (
          <div className="az-input-screen">
            <div className="az-header">
              <div className="az-badge">✦ AI ANALYSIS</div>
              <h1 className="az-title">
                What's on your <span className="az-title-accent">mind?</span>
              </h1>
              <p className="az-subtitle">
                Be honest. Be messy. Our AI reads between every word to find the perfect sound for
                exactly how you feel right now.
              </p>
            </div>

            {/* Mode toggle */}
            <div className="az-mode-toggle">
              <button
                className={`az-mode-btn ${mode === "text" ? "az-mode-btn--active" : ""}`}
                onClick={() => setMode("text")}
              >
                <span className="az-mode-icon">✍️</span>
                <span>Type it out</span>
              </button>
              <button
                className={`az-mode-btn ${mode === "voice" ? "az-mode-btn--active" : ""}`}
                onClick={() => setMode("voice")}
              >
                <span className="az-mode-icon">🎙️</span>
                <span>Say it aloud</span>
              </button>
            </div>

            {/* Input area */}
            <div className="az-input-area">
              {mode === "text" ? (
                <div className="az-text-panel">
                  <div className="az-textarea-wrap">
                    <textarea
                      className="az-textarea"
                      placeholder="Pour it out… how's your day going? What's weighing on you, or lifting you up? Anything goes."
                      value={textInput}
                      onChange={(e) => setTextInput(e.target.value)}
                      rows={6}
                      maxLength={600}
                    />
                    <div className="az-textarea-footer">
                      <div className="az-mood-hints">
                        {["Tired & drained", "Hyped up", "Missing someone", "Feeling free"].map((h) => (
                          <button
                            key={h}
                            className="az-hint"
                            onClick={() => setTextInput(h)}
                          >
                            {h}
                          </button>
                        ))}
                      </div>
                      <span className="az-char-count">{textInput.length}/600</span>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="az-voice-panel">
                  <div className="az-voice-visualizer">
                    <div className="az-wave-bars">
                      {audioWave.map((h, i) => (
                        <div
                          key={i}
                          className="az-wave-bar"
                          style={{
                            height: `${h}px`,
                            opacity: isRecording ? 0.7 + (h / 30) * 0.3 : 0.2,
                            background: isRecording
                              ? `hsl(${340 + i * 2}, 80%, 60%)`
                              : "rgba(255,255,255,0.2)",
                            transition: isRecording ? "height 0.08s ease" : "all 0.3s ease",
                          }}
                        />
                      ))}
                    </div>
                    <div className="az-voice-timer">{formatTime(recordingTime)}</div>
                  </div>

                  <button
                    className={`az-record-btn ${isRecording ? "az-record-btn--recording" : ""}`}
                    onClick={() => {
                      if (isRecording) {
                        setIsRecording(false);
                      } else {
                        setRecordingTime(0);
                        setIsRecording(true);
                      }
                    }}
                    aria-label={isRecording ? "Stop recording" : "Start recording"}
                  >
                    <div className="az-record-btn-glow" />
                    <div className="az-record-icon">
                      {isRecording ? (
                        <div className="az-stop-icon" />
                      ) : (
                        <svg width="22" height="22" viewBox="0 0 22 22" fill="currentColor">
                          <rect x="7" y="3" width="8" height="12" rx="4" />
                          <path d="M4 11a7 7 0 0014 0M11 18v2M8 20h6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" fill="none" />
                        </svg>
                      )}
                    </div>
                    <span className="az-record-label">
                      {isRecording ? "Tap to stop" : "Hold to record"}
                    </span>
                  </button>

                  {recordingTime > 0 && !isRecording && (
                    <p className="az-voice-done">
                      ✓ {formatTime(recordingTime)} recorded — ready to analyze
                    </p>
                  )}
                </div>
              )}
            </div>

            {/* Analyze CTA */}
            <button
              className={`az-analyze-btn ${canAnalyze ? "az-analyze-btn--ready" : ""}`}
              onClick={startAnalysis}
              disabled={!canAnalyze}
            >
              <div className="az-analyze-btn-glow" />
              <span>Analyze My Mood</span>
              <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                <path d="M3 9h12M9 3l6 6-6 6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          </div>
        ) : (
          /* ── Analysis Loading Screen ── */
          <div className="az-analyzing-screen">
            <div className="az-analyzing-orb">
              <div className="az-orb-outer" />
              <div className="az-orb-mid" />
              <div className="az-orb-inner" />
              <div className="az-orb-pulse" />
              <div className="az-orb-core">
                <span>✦</span>
              </div>
            </div>

            <h2 className="az-analyzing-title">Tuning into your frequency…</h2>
            <p className="az-analyzing-label">{progressLabel}</p>

            {/* Progress bar */}
            <div className="az-progress-wrap">
              <div className="az-progress-track">
                <div
                  className="az-progress-fill"
                  style={{ width: `${progress}%` }}
                >
                  <div className="az-progress-shimmer" />
                  <div className="az-progress-tip" />
                </div>
              </div>
              <div className="az-progress-pct">{Math.round(progress)}%</div>
            </div>

            {/* Floating mood tags that appear as it processes */}
            <div className="az-processing-tags">
              {["Joy", "Tension", "Nostalgia", "Energy", "Calm", "Longing"].map((tag, i) => (
                <div
                  key={tag}
                  className="az-proc-tag"
                  style={{
                    opacity: progress > i * 15 ? 1 : 0,
                    transform: progress > i * 15 ? "translateY(0)" : "translateY(8px)",
                    transitionDelay: `${i * 0.05}s`,
                  }}
                >
                  {tag}
                </div>
              ))}
            </div>
          </div>
        )}
      </main>

      <Footer />
    </PageLayout>
  );
}