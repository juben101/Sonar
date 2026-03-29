import { useState, useRef, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { moodApi } from "../../services/api";
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
  const [_audioBlob, setAudioBlob] = useState(null);
  const [transcribedText, setTranscribedText] = useState("");
  const [transcribing, setTranscribing] = useState(false);
  const [userLocation, setUserLocation] = useState(null);

  const timerRef = useRef(null);
  const waveRef = useRef(null);
  const progressRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const streamRef = useRef(null);
  const analyserRef = useRef(null);

  // Request geolocation once on mount (for weather)
  useEffect(() => {
    if ("geolocation" in navigator) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          setUserLocation({ lat: pos.coords.latitude, lon: pos.coords.longitude });
        },
        () => {
          // User denied or error — no weather, that's fine
          setUserLocation(null);
        },
        { timeout: 5000, maximumAge: 300000 }
      );
    }
  }, []);

  // Real audio wave from MediaRecorder's analyser
  const updateWaveFromAnalyser = useCallback(() => {
    if (!analyserRef.current || !isRecording) return;
    const data = new Uint8Array(analyserRef.current.frequencyBinCount);
    analyserRef.current.getByteFrequencyData(data);
    const step = Math.floor(data.length / 40);
    const bars = Array(40).fill(0).map((_, i) => {
      const val = data[i * step] || 0;
      return Math.max(2, (val / 255) * 30);
    });
    setAudioWave(bars);
  }, [isRecording]);

  // Recording timer + wave animation
  useEffect(() => {
    if (isRecording) {
      timerRef.current = setInterval(() => {
        setRecordingTime((t) => t + 1);
      }, 1000);
      waveRef.current = setInterval(updateWaveFromAnalyser, 80);
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
  }, [isRecording, updateWaveFromAnalyser]);

  const formatTime = (s) => {
    const m = Math.floor(s / 60).toString().padStart(2, "0");
    const sec = (s % 60).toString().padStart(2, "0");
    return `${m}:${sec}`;
  };

  // ── Start real recording ──
  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      // Set up analyser for real waveform
      const audioContext = new AudioContext();
      const source = audioContext.createMediaStreamSource(stream);
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);
      analyserRef.current = analyser;

      // Set up MediaRecorder
      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
          ? "audio/webm;codecs=opus"
          : "audio/webm",
      });
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };

      mediaRecorder.onstop = () => {
        const blob = new Blob(audioChunksRef.current, { type: "audio/webm" });
        setAudioBlob(blob);
        // Stop all tracks
        stream.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      };

      mediaRecorder.start(250); // Collect chunks every 250ms
      setRecordingTime(0);
      setIsRecording(true);
      setAudioBlob(null);
      setTranscribedText("");
    } catch {
      alert("Microphone access denied. Please allow microphone permissions.");
    }
  };

  // ── Stop recording + auto-transcribe ──
  const stopRecording = async () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.stop();
    }
    setIsRecording(false);

    // Wait briefly for onstop to fire and blob to be set
    await new Promise((r) => setTimeout(r, 300));

    // Auto-transcribe
    const chunks = audioChunksRef.current;
    if (chunks.length > 0) {
      const blob = new Blob(chunks, { type: "audio/webm" });
      setTranscribing(true);
      try {
        const result = await moodApi.transcribe(blob);
        setTranscribedText(result.text || "");
      } catch (err) {
        setTranscribedText("");
        console.error("Transcription failed:", err);
      } finally {
        setTranscribing(false);
      }
    }
  };

  const PROGRESS_STAGES = [
    { pct: 15, label: "Reading your input…" },
    { pct: 35, label: "Parsing emotional signals…" },
    { pct: 55, label: "Calibrating mood dimensions…" },
    { pct: 72, label: "Cross-referencing music library…" },
    { pct: 88, label: "Crafting your soundtrack…" },
    { pct: 100, label: "Playlist ready ✦" },
  ];

  const startAnalysis = async () => {
    const analysisText = mode === "text" ? textInput : transcribedText;
    if (!analysisText || analysisText.trim().length < 10) return;

    setAnalyzing(true);
    setProgress(0);

    // Start the API call with optional location for weather
    const apiPromise = moodApi.analyze(
      analysisText,
      userLocation?.lat || null,
      userLocation?.lon || null
    );

    // Animate progress stages while API works
    let stageIndex = 0;
    const runStage = () => {
      return new Promise((resolve) => {
        if (stageIndex >= PROGRESS_STAGES.length) {
          resolve();
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
            setTimeout(() => resolve(runStage()), 200);
          }
        };
        progressRef.current = requestAnimationFrame(animate);
      });
    };

    try {
      // Run animation and API call in parallel
      const [analysisResult] = await Promise.all([apiPromise, runStage()]);
      // Navigate to result with real data
      setTimeout(() => navigate("/result", { state: { analysis: analysisResult } }), 400);
    } catch (err) {
      setAnalyzing(false);
      setProgress(0);
      alert(err.message || "Analysis failed. Please try again.");
    }
  };

  const canAnalyze = mode === "text"
    ? textInput.trim().length >= 10
    : (transcribedText.trim().length >= 10 || (recordingTime > 0 && !transcribing));

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
                  <div className={`az-voice-visualizer ${isRecording ? "az-voice-visualizer--active" : ""}`}>
                    {/* Recording status badge */}
                    <div className={`az-rec-status ${isRecording ? "az-rec-status--live" : ""}`}>
                      <span className="az-rec-dot" />
                      <span className="az-rec-text">
                        {isRecording ? "RECORDING" : transcribing ? "TRANSCRIBING..." : recordingTime > 0 ? "RECORDED" : "READY"}
                      </span>
                    </div>

                    {/* Waveform visualizer */}
                    <div className="az-wave-bars">
                      {audioWave.map((h, i) => (
                        <div
                          key={i}
                          className="az-wave-bar"
                          style={{
                            height: `${h}px`,
                            opacity: isRecording ? 0.6 + (h / 30) * 0.4 : 0.15,
                            background: isRecording
                              ? `linear-gradient(to top, hsl(${340 + i * 2}, 85%, 55%), hsl(${340 + i * 2}, 90%, 72%))`
                              : "rgba(255,255,255,0.15)",
                            transition: isRecording ? "height 0.06s ease" : "all 0.4s ease",
                            boxShadow: isRecording && h > 15
                              ? `0 0 ${Math.round(h / 4)}px hsl(${340 + i * 2}, 80%, 55%)`
                              : "none",
                          }}
                        />
                      ))}
                    </div>

                    {/* Timer */}
                    <div className={`az-voice-timer ${isRecording ? "az-voice-timer--live" : ""}`}>
                      {formatTime(recordingTime)}
                    </div>
                  </div>

                  {/* Record button with ring animations */}
                  <div className="az-record-wrap">
                    {isRecording && (
                      <>
                        <div className="az-record-ring az-record-ring-1" />
                        <div className="az-record-ring az-record-ring-2" />
                        <div className="az-record-ring az-record-ring-3" />
                      </>
                    )}
                    <button
                      className={`az-record-btn ${isRecording ? "az-record-btn--recording" : ""}`}
                      onClick={isRecording ? stopRecording : startRecording}
                      disabled={transcribing}
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
                        {transcribing ? "Transcribing..." : isRecording ? "Tap to stop" : "Tap to record"}
                      </span>
                    </button>
                  </div>

                  {/* Transcription result */}
                  {transcribedText && !isRecording && (
                    <div className="az-voice-done">
                      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                        <circle cx="8" cy="8" r="7" stroke="#4ade80" strokeWidth="1.5" />
                        <path d="M5 8l2 2 4-4" stroke="#4ade80" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                      <span>Transcribed — ready to analyze</span>
                    </div>
                  )}

                  {transcribedText && (
                    <div className="az-transcribed-preview">
                      <div className="az-transcribed-label">What we heard:</div>
                      <p className="az-transcribed-text">&ldquo;{transcribedText}&rdquo;</p>
                    </div>
                  )}

                  {recordingTime > 0 && !isRecording && !transcribedText && !transcribing && (
                    <div className="az-voice-done">
                      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                        <circle cx="8" cy="8" r="7" stroke="#4ade80" strokeWidth="1.5" />
                        <path d="M5 8l2 2 4-4" stroke="#4ade80" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                      <span>{formatTime(recordingTime)} captured — ready to analyze</span>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Location hint */}
            {userLocation && (
              <div className="az-location-hint">
                🌤 Weather context enabled — your local weather will influence genre recommendations
              </div>
            )}

            {/* Analyze CTA */}
            <button
              className={`az-analyze-btn ${canAnalyze ? "az-analyze-btn--ready" : ""}`}
              onClick={startAnalysis}
              disabled={!canAnalyze || transcribing}
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