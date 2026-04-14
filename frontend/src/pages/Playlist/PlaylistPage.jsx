import { useLocation, useNavigate } from "react-router-dom";
import { useEffect, useRef, useState, useCallback } from "react";
import Navbar from "../../components/Navbar";
import Footer from "../../components/Footer";
import PageLayout from "../../components/PageLayout";
import usePlaylistStore from "../../stores/usePlaylistStore";
import { moodApi } from "../../services/api";
import "./PlaylistPage.css";

export default function PlaylistPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const data = location.state;
  const [shareToast, setShareToast] = useState("");
  const [playingId, setPlayingId] = useState(null);
  const [audioProgress, setAudioProgress] = useState(0);
  const [audioDuration, setAudioDuration] = useState(0);
  const [audioCurrentTime, setAudioCurrentTime] = useState(0);
  const [saved, setSaved] = useState(false);
  const [volume, setVolume] = useState(0.5);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [songPrefs, setSongPrefs] = useState({}); // {song_key: "like"|"dislike"}
  const [isLoadingStream, setIsLoadingStream] = useState(false);
  const audioRef = useRef(null);
  const progressTimer = useRef(null);
  const retryCountRef = useRef({}); // Track stream URL retries per video_id
  const { savePlaylist, isPlaylistSaved } = usePlaylistStore();

  useEffect(() => {
    if (!data?.playlist) {
      navigate("/analyze", { replace: true });
    } else {
      setSaved(isPlaylistSaved(data.playlist.title));
      // Fetch user's song preferences for all tracks in this playlist
      const songKeys = data.playlist.tracks
        .map((t) => t.youtube_url || `${t.title}::${t.artist}`)
        .filter(Boolean);
      if (songKeys.length > 0) {
        moodApi.getPreferences(songKeys).then((res) => {
          setSongPrefs(res.preferences || {});
        }).catch(() => {});
      }
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

  const playTrack = useCallback(async (track) => {
    if (!track.video_id) return;

    // Transition effect
    setIsTransitioning(true);
    setTimeout(() => setIsTransitioning(false), 400);

    if (audioRef.current) {
      audioRef.current.pause();
      clearInterval(progressTimer.current);
    }

    setPlayingId(track.id);
    setIsLoadingStream(true);

    try {
      // Fetch audio stream URL on-demand
      const streamData = await moodApi.getStream(track.video_id);
      const audioUrl = streamData.audio_url;

      if (!audioUrl) {
        setIsLoadingStream(false);
        stopCurrent();
        return;
      }

      const audio = new Audio(audioUrl);
      audio.volume = volume;

      audio.onloadedmetadata = () => {
        setAudioDuration(audio.duration);
        setIsLoadingStream(false);
      };

      audio.onerror = async () => {
        // Retry once — stream URL may have expired (403)
        if (!retryCountRef.current[track.video_id]) {
          retryCountRef.current[track.video_id] = true;
          console.log(`Stream expired for ${track.video_id}, re-fetching...`);
          try {
            const retry = await moodApi.getStream(track.video_id);
            if (retry.audio_url) {
              audio.src = retry.audio_url;
              audio.load();
              audio.play().catch(() => {});
              return;
            }
          } catch { /* fall through to stop */ }
        }
        setIsLoadingStream(false);
        stopCurrent();
      };

      audio.onended = () => {
        // Auto-play next track
        const tracks = data?.playlist?.tracks || [];
        const idx = tracks.findIndex((t) => t.id === track.id);
        if (idx >= 0 && idx < tracks.length - 1 && tracks[idx + 1].video_id) {
          playTrack(tracks[idx + 1]);
        } else {
          stopCurrent();
        }
      };

      audio.play();
      audioRef.current = audio;

      progressTimer.current = setInterval(() => {
        if (audio.duration) {
          setAudioProgress((audio.currentTime / audio.duration) * 100);
          setAudioCurrentTime(audio.currentTime);
        }
      }, 50);
    } catch (err) {
      console.error("Failed to load audio stream:", err);
      setIsLoadingStream(false);
      stopCurrent();
    }
  }, [volume, data, stopCurrent]);

  const handlePlay = (track) => {
    if (!track.video_id) return;
    if (playingId === track.id) {
      stopCurrent();
      return;
    }
    playTrack(track);
  };

  const handlePrev = () => {
    if (!data?.playlist?.tracks) return;
    const tracks = data.playlist.tracks.filter((t) => t.video_id);
    const idx = tracks.findIndex((t) => t.id === playingId);
    if (idx > 0) playTrack(tracks[idx - 1]);
  };

  const handleNext = () => {
    if (!data?.playlist?.tracks) return;
    const tracks = data.playlist.tracks.filter((t) => t.video_id);
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

  // ── Like / Dislike ──
  const getSongKey = (track) => track.youtube_url || `${track.title}::${track.artist}`;

  const handlePreference = async (track, pref) => {
    const key = getSongKey(track);
    const current = songPrefs[key];

    if (current === pref) {
      // Toggle off — remove preference
      setSongPrefs((prev) => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
      try {
        await moodApi.removePreference(key);
      } catch (err) {
        console.error("Failed to remove preference:", err);
      }
    } else {
      // Set new preference
      setSongPrefs((prev) => ({ ...prev, [key]: pref }));
      try {
        await moodApi.setPreference(key, pref, track.title, track.artist);
      } catch (err) {
        console.error("Failed to set preference:", err);
      }
    }
  };

  if (!data?.playlist) return null;

  const { playlist, analysis, preference, settings } = data;
  const selectedArtists = settings?.artists || [];
  const selectedLanguages = settings?.languages || [];
  const matchMode = settings?.matchMode || "smart";

  const normalizedSelectedArtists = selectedArtists.map((a) => a.toLowerCase());
  const tracksMatchingSelectedArtists = playlist.tracks.filter((track) =>
    normalizedSelectedArtists.some((artist) => track.artist.toLowerCase().includes(artist))
  );

  const representedArtists = selectedArtists.filter((artist) =>
    playlist.tracks.some((track) => track.artist.toLowerCase().includes(artist.toLowerCase()))
  );

  const artistLangMap = settings?.artistLangMap || {};
  const representedLanguages = Array.from(
    new Set(
      representedArtists
        .map((artist) => artistLangMap[artist])
        .filter(Boolean)
    )
  );

  const playingTrack = playingId
    ? playlist.tracks.find((t) => t.id === playingId)
    : null;


  // ── Share playlist ──
  const sharePlaylist = async () => {
    const trackList = playlist.tracks
      .slice(0, 8)
      .map((t, i) => `${i + 1}. ${t.title} — ${t.artist}`)
      .join("\n");
    const moreText = playlist.tracks.length > 8 ? `\n...and ${playlist.tracks.length - 8} more` : "";
    const text = `🎵 ${playlist.title}\n${analysis?.moodEmoji || "🎵"} Mood: ${analysis?.sub_emotion || analysis?.base_emotion || "Vibes"}\n🎶 Genre: ${analysis?.genre || "Mixed"}\n\n${trackList}${moreText}\n\n— Curated by Sonar`;

    if (navigator.share) {
      try {
        await navigator.share({ title: playlist.title, text });
        return;
      } catch { /* user cancelled */ }
    }
    try {
      await navigator.clipboard.writeText(text);
      setShareToast("Copied to clipboard!");
      setTimeout(() => setShareToast(""), 2000);
    } catch {
      setShareToast("Could not share");
      setTimeout(() => setShareToast(""), 2000);
    }
  };

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
                    <button
                      className={`pl-ctrl-btn pl-ctrl-btn--pref ${songPrefs[getSongKey(playingTrack)] === "dislike" ? "pl-ctrl-btn--disliked" : ""}`}
                      onClick={(e) => { e.stopPropagation(); handlePreference(playingTrack, "dislike"); }}
                      aria-label="Dislike"
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M10 15v4a3 3 0 003 3l4-9V2H5.72a2 2 0 00-2 1.7l-1.38 9a2 2 0 002 2.3zm7-13h2.67A2.31 2.31 0 0122 4v7a2.31 2.31 0 01-2.33 2H17" />
                      </svg>
                    </button>
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
                    <button
                      className={`pl-ctrl-btn pl-ctrl-btn--pref ${songPrefs[getSongKey(playingTrack)] === "like" ? "pl-ctrl-btn--liked" : ""}`}
                      onClick={(e) => { e.stopPropagation(); handlePreference(playingTrack, "like"); }}
                      aria-label="Like"
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M14 9V5a3 3 0 00-3-3l-4 9v11h11.28a2 2 0 002-1.7l1.38-9a2 2 0 00-2-2.3zM7 22H4a2 2 0 01-2-2v-7a2 2 0 012-2h3" />
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

          {/* ── Actions ── */}
          <div className="pl-actions-row">
            <button className="pl-action-btn" onClick={sharePlaylist}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/>
                <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/>
              </svg>
              Share Playlist
            </button>
            {!saved && (
              <button className="pl-action-btn" onClick={() => {
                savePlaylist(playlist, analysis, preference, settings);
                setSaved(true);
              }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v11a2 2 0 01-2 2z"/>
                  <polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/>
                </svg>
                Save to Library
              </button>
            )}
            {saved && (
              <span className="pl-saved-badge">✓ Saved</span>
            )}
          </div>
          {shareToast && <div className="pl-share-toast">{shareToast}</div>}

          {/* ── Why This Playlist ── */}
          {playlist.playlist_reason && (
            <section className="pl-reason-section">
              <div className="pl-reason-badge">✦ WHY THIS PLAYLIST</div>
              <p className="pl-reason-text">{playlist.playlist_reason}</p>
            </section>
          )}

          {/* ── Match Summary ── */}
          <section className="pl-match-section">
            <div className="pl-match-header">
              <span className="pl-match-badge">MATCH SUMMARY</span>
              <span className={`pl-match-mode pl-match-mode--${matchMode}`}>
                {matchMode === "strict" ? "Strict mode" : "Smart mode"}
              </span>
            </div>

            <div className="pl-match-grid">
              <div className="pl-match-item">
                <span className="pl-match-label">Artists represented</span>
                <span className="pl-match-value">
                  {selectedArtists.length > 0
                    ? `${representedArtists.length}/${selectedArtists.length}`
                    : "No artist filter"}
                </span>
              </div>
              <div className="pl-match-item">
                <span className="pl-match-label">Tracks matching selected artists</span>
                <span className="pl-match-value">
                  {selectedArtists.length > 0
                    ? `${tracksMatchingSelectedArtists.length}/${playlist.tracks.length}`
                    : "Not applicable"}
                </span>
              </div>
              <div className="pl-match-item">
                <span className="pl-match-label">Requested languages covered</span>
                <span className="pl-match-value">
                  {selectedLanguages.length > 0 && Object.keys(artistLangMap).length > 0
                    ? `${representedLanguages.length}/${selectedLanguages.length}`
                    : `${selectedLanguages.length} selected`}
                </span>
              </div>
            </div>

            <p className="pl-match-note">
              Language-level verification depends on provider metadata. Artist match metrics are exact based on selected artist names.
            </p>
          </section>

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

                  <div className="pl-track-prefs">
                    <button
                      className={`pl-track-pref-btn ${songPrefs[getSongKey(track)] === "dislike" ? "pl-track-pref-btn--disliked" : ""}`}
                      onClick={(e) => { e.stopPropagation(); handlePreference(track, "dislike"); }}
                      aria-label={`Dislike ${track.title}`}
                    >
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M10 15v4a3 3 0 003 3l4-9V2H5.72a2 2 0 00-2 1.7l-1.38 9a2 2 0 002 2.3zm7-13h2.67A2.31 2.31 0 0122 4v7a2.31 2.31 0 01-2.33 2H17" />
                      </svg>
                    </button>
                    <button
                      className={`pl-track-pref-btn ${songPrefs[getSongKey(track)] === "like" ? "pl-track-pref-btn--liked" : ""}`}
                      onClick={(e) => { e.stopPropagation(); handlePreference(track, "like"); }}
                      aria-label={`Like ${track.title}`}
                    >
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M14 9V5a3 3 0 00-3-3l-4 9v11h11.28a2 2 0 002-1.7l1.38-9a2 2 0 00-2-2.3zM7 22H4a2 2 0 01-2-2v-7a2 2 0 012-2h3" />
                      </svg>
                    </button>
                  </div>
                  <span className="pl-track-duration">{track.duration}</span>

                  {track.video_id ? (
                    <button
                      className={`pl-track-play ${playingId === track.id ? "pl-track-play--active" : ""} ${isLoadingStream && playingId === track.id ? "pl-track-play--loading" : ""}`}
                      onClick={(e) => { e.stopPropagation(); handlePlay(track); }}
                      aria-label={playingId === track.id ? `Pause ${track.title}` : `Play ${track.title}`}
                    >
                      {isLoadingStream && playingId === track.id ? (
                        <div className="pl-track-spinner" />
                      ) : playingId === track.id ? (
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
                      href={track.youtube_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="pl-track-play pl-track-play--ytmusic"
                      onClick={(e) => e.stopPropagation()}
                      aria-label={`Open ${track.title} on YouTube Music`}
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M12 0C5.376 0 0 5.376 0 12s5.376 12 12 12 12-5.376 12-12S18.624 0 12 0zm4.95 12.53l-6.6 4.4A.636.636 0 019.35 16.4V7.6a.636.636 0 011-.53l6.6 4.4a.636.636 0 010 1.06z"/>
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
