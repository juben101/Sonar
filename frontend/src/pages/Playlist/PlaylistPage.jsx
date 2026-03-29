import { useLocation, useNavigate } from "react-router-dom";
import { useEffect, useRef, useState, useCallback } from "react";
import Navbar from "../../components/Navbar";
import Footer from "../../components/Footer";
import PageLayout from "../../components/PageLayout";
import usePlaylistStore from "../../stores/usePlaylistStore";
import "./PlaylistPage.css";

export default function PlaylistPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const data = location.state;
  const [playingId, setPlayingId] = useState(null);
  const [audioProgress, setAudioProgress] = useState(0);
  const [audioDuration, setAudioDuration] = useState(0);
  const [audioCurrentTime, setAudioCurrentTime] = useState(0);
  const [saved, setSaved] = useState(false);
  const [volume, setVolume] = useState(0.5);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const audioRef = useRef(null);
  const progressTimer = useRef(null);
  const { savePlaylist, isPlaylistSaved } = usePlaylistStore();

  useEffect(() => {
    if (!data?.playlist) {
      navigate("/analyze", { replace: true });
    } else {
      setSaved(isPlaylistSaved(data.playlist.title));
    }
  }, [data, navigate, isPlaylistSaved]);

  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
      clearInterval(progressTimer.current);
    };
  }, []);

  const formatMs = (s) => {
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${sec.toString().padStart(2, "0")}`;
  };

  const stopCurrent = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      clearInterval(progressTimer.current);
    }
    setPlayingId(null);
    setAudioProgress(0);
    setAudioCurrentTime(0);
    setAudioDuration(0);
  }, []);

  const playTrack = useCallback((track) => {
    if (!track.preview_url) return;

    // Transition effect
    setIsTransitioning(true);
    setTimeout(() => setIsTransitioning(false), 400);

    if (audioRef.current) {
      audioRef.current.pause();
      clearInterval(progressTimer.current);
    }

    const audio = new Audio(track.preview_url);
    audio.volume = volume;

    audio.onloadedmetadata = () => {
      setAudioDuration(audio.duration);
    };

    audio.onended = () => {
      // Auto-play next track
      const tracks = data?.playlist?.tracks || [];
      const idx = tracks.findIndex((t) => t.id === track.id);
      if (idx >= 0 && idx < tracks.length - 1 && tracks[idx + 1].preview_url) {
        playTrack(tracks[idx + 1]);
      } else {
        stopCurrent();
      }
    };

    audio.play();
    audioRef.current = audio;
    setPlayingId(track.id);

    progressTimer.current = setInterval(() => {
      if (audio.duration) {
        setAudioProgress((audio.currentTime / audio.duration) * 100);
        setAudioCurrentTime(audio.currentTime);
      }
    }, 50);
  }, [volume, data, stopCurrent]);

  const handlePlay = (track) => {
    if (!track.preview_url) return;
    if (playingId === track.id) {
      stopCurrent();
      return;
    }
    playTrack(track);
  };

  const handlePrev = () => {
    if (!data?.playlist?.tracks) return;
    const tracks = data.playlist.tracks.filter((t) => t.preview_url);
    const idx = tracks.findIndex((t) => t.id === playingId);
    if (idx > 0) playTrack(tracks[idx - 1]);
  };

  const handleNext = () => {
    if (!data?.playlist?.tracks) return;
    const tracks = data.playlist.tracks.filter((t) => t.preview_url);
    const idx = tracks.findIndex((t) => t.id === playingId);
    if (idx >= 0 && idx < tracks.length - 1) playTrack(tracks[idx + 1]);
  };

  const handleVolumeChange = (e) => {
    const v = parseFloat(e.target.value);
    setVolume(v);
    if (audioRef.current) audioRef.current.volume = v;
  };

  const handleSave = () => {
    if (!data) return;
    savePlaylist(data.playlist, data.analysis, data.preference, data.settings);
    setSaved(true);
  };

  if (!data?.playlist) return null;

  const { playlist, analysis, preference, settings } = data;

  const playingTrack = playingId
    ? playlist.tracks.find((t) => t.id === playingId)
    : null;


  return (
    <PageLayout>
      <Navbar centerLabel="Your Playlist" showBack backTo="/result" />

      <main className="pl-main">
        <div className="pl-content">

          {/* ══════════ VINYL PLAYER ══════════ */}
          <section className="pl-player">
            {/* Ambient glow behind vinyl */}
            <div
              className={`pl-player-glow ${playingId ? "pl-player-glow--active" : ""}`}
              style={{
                background: playingId
                  ? `radial-gradient(circle, rgba(255,60,100,0.12) 0%, transparent 70%)`
                  : "none",
              }}
            />

            <div className="pl-turntable">
              {/* ── Vinyl record ── */}
              <div className={`pl-record ${playingId ? "pl-record--spin" : ""} ${isTransitioning ? "pl-record--transition" : ""}`}>
                {/* Outer rim */}
                <div className="pl-record-rim" />
                {/* Groove rings (8 concentric) */}
                {[18, 22, 26, 30, 34, 38, 42, 46].map((pct) => (
                  <div
                    key={pct}
                    className="pl-record-groove"
                    style={{ inset: `${pct}%` }}
                  />
                ))}
                {/* Vinyl shine / light reflection */}
                <div className="pl-record-shine" />
                {/* Center label */}
                <div className="pl-record-label">
                  <div className="pl-record-label-inner">
                    {playingTrack?.album_art ? (
                      <img
                        src={playingTrack.album_art}
                        alt=""
                        className="pl-record-label-art"
                      />
                    ) : (
                      <div className="pl-record-label-default">
                        <span>{analysis?.moodEmoji || "🎵"}</span>
                      </div>
                    )}
                  </div>
                  {/* Label ring */}
                  <div className="pl-record-label-ring" />
                </div>
                {/* Spindle */}
                <div className="pl-record-spindle" />
              </div>

              {/* ── Tonearm ── */}
              <div className={`pl-arm ${playingId ? "pl-arm--playing" : ""}`}>
                <div className="pl-arm-pivot">
                  <div className="pl-arm-pivot-screw" />
                </div>
                <div className="pl-arm-beam" />
                <div className="pl-arm-counterweight" />
                <div className="pl-arm-headshell">
                  <div className="pl-arm-cartridge" />
                  <div className="pl-arm-stylus" />
                </div>
              </div>
            </div>

            {/* ── Now Playing Controls ── */}
            <div className="pl-controls">
              {playingTrack ? (
                <>
                  <div className="pl-controls-info">
                    <span className="pl-controls-label">NOW PLAYING</span>
                    <span className="pl-controls-title">{playingTrack.title}</span>
                    <span className="pl-controls-artist">{playingTrack.artist}</span>
                  </div>

                  {/* Progress */}
                  <div className="pl-controls-progress">
                    <span className="pl-controls-time">{formatMs(audioCurrentTime)}</span>
                    <div className="pl-controls-bar">
                      <div
                        className="pl-controls-bar-fill"
                        style={{ width: `${audioProgress}%` }}
                      >
                        <div className="pl-controls-bar-dot" />
                      </div>
                    </div>
                    <span className="pl-controls-time">{formatMs(audioDuration)}</span>
                  </div>

                  {/* Transport buttons */}
                  <div className="pl-controls-transport">
                    <button className="pl-ctrl-btn" onClick={handlePrev} aria-label="Previous">
                      <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                        <path d="M3 2h2v12H3V2zm11 6L6 14V2l8 6z" />
                      </svg>
                    </button>
                    <button
                      className="pl-ctrl-btn pl-ctrl-btn--main"
                      onClick={() => handlePlay(playingTrack)}
                      aria-label="Pause"
                    >
                      <svg width="18" height="18" viewBox="0 0 18 18" fill="currentColor">
                        <rect x="3" y="2" width="4" height="14" rx="1" />
                        <rect x="11" y="2" width="4" height="14" rx="1" />
                      </svg>
                    </button>
                    <button className="pl-ctrl-btn" onClick={handleNext} aria-label="Next">
                      <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                        <path d="M11 2h2v12h-2V2zM2 8l8 6V2L2 8z" />
                      </svg>
                    </button>
                  </div>

                  {/* Volume */}
                  <div className="pl-controls-volume">
                    <svg width="14" height="14" viewBox="0 0 14 14" fill="rgba(255,255,255,0.3)">
                      <path d="M2 5h2l3-3v10L4 9H2V5z" />
                      {volume > 0.3 && <path d="M9 4.5c.8.8.8 5.2 0 6" stroke="rgba(255,255,255,0.3)" fill="none" strokeWidth="1.2" />}
                      {volume > 0.6 && <path d="M10.5 3c1.3 1.3 1.3 7.7 0 9" stroke="rgba(255,255,255,0.2)" fill="none" strokeWidth="1.2" />}
                    </svg>
                    <input
                      type="range"
                      min="0"
                      max="1"
                      step="0.05"
                      value={volume}
                      onChange={handleVolumeChange}
                      className="pl-volume-slider"
                    />
                  </div>
                </>
              ) : (
                <div className="pl-controls-info">
                  <span className="pl-controls-label">
                    {playlist.tracks.length} TRACKS
                  </span>
                  <span className="pl-controls-title">{playlist.title}</span>
                  <span className="pl-controls-artist">
                    {preference === "uplift" ? "Uplifting" : "Mood-matched"}
                    {settings?.languages?.length > 0 && ` · ${settings.languages[0]}`}
                  </span>
                </div>
              )}
            </div>
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
                <div
                  key={track.id}
                  className={`pl-track ${playingId === track.id ? "pl-track--playing" : ""}`}
                  style={{ animationDelay: `${i * 0.05}s` }}
                  onClick={() => handlePlay(track)}
                >
                  <div className="pl-track-num">
                    {playingId === track.id ? (
                      <div className="pl-track-eq">
                        <span /><span /><span />
                      </div>
                    ) : (
                      String(i + 1).padStart(2, "0")
                    )}
                  </div>

                  {track.album_art ? (
                    <img
                      src={track.album_art}
                      alt={track.title}
                      className="pl-track-art"
                      loading="lazy"
                    />
                  ) : (
                    <div className="pl-track-accent" style={{ background: track.color }} />
                  )}

                  <div className="pl-track-info">
                    <span className="pl-track-title">{track.title}</span>
                    <span className="pl-track-artist">{track.artist}</span>
                  </div>

                  <span className="pl-track-duration">{track.duration}</span>

                  {track.preview_url ? (
                    <button
                      className={`pl-track-play ${playingId === track.id ? "pl-track-play--active" : ""}`}
                      onClick={(e) => { e.stopPropagation(); handlePlay(track); }}
                      aria-label={playingId === track.id ? `Pause ${track.title}` : `Play ${track.title}`}
                    >
                      {playingId === track.id ? (
                        <svg width="10" height="12" viewBox="0 0 10 12" fill="currentColor">
                          <rect x="0" y="0" width="3" height="12" />
                          <rect x="7" y="0" width="3" height="12" />
                        </svg>
                      ) : (
                        <svg width="12" height="14" viewBox="0 0 12 14" fill="currentColor">
                          <path d="M0 0L12 7L0 14V0Z" />
                        </svg>
                      )}
                    </button>
                  ) : (
                    <a
                      href={track.spotify_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="pl-track-play pl-track-play--spotify"
                      onClick={(e) => e.stopPropagation()}
                      aria-label={`Open ${track.title} on Spotify`}
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z"/>
                      </svg>
                    </a>
                  )}
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
              className={`pl-action-btn pl-action-btn--save ${saved ? "pl-action-btn--saved" : ""}`}
              onClick={handleSave}
              disabled={saved}
            >
              {saved ? "✓ Saved to Dashboard" : "💾 Save to Dashboard"}
            </button>
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
