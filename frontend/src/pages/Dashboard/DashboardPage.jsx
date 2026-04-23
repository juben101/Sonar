import { useState, useRef, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import StarfieldCanvas from "../../components/StarfieldCanvas";
import useAuthStore from "../../stores/useAuthStore";
import usePlaylistStore from "../../stores/usePlaylistStore";
import { authApi, moodApi } from "../../services/api";
import "./DashboardPage.css";

export default function DashboardPage() {
  const navigate = useNavigate();
  const { user, logout, setUser } = useAuthStore();
  const { playlists, deletePlaylist, fetchPlaylists } = usePlaylistStore();
  const displayName = user?.username || "User";
  const displayInitial = displayName.charAt(0).toUpperCase();
  const [profileOpen, setProfileOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [activeSettingsTab, setActiveSettingsTab] = useState("account");
  const profileRef = useRef(null);
  const avatarInputRef = useRef(null);
  const [profileForm, setProfileForm] = useState({
    username: user?.username || "",
    email: user?.email || "",
  });
  const [profileError, setProfileError] = useState("");
  const [profileSuccess, setProfileSuccess] = useState("");
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteConfirmInput, setDeleteConfirmInput] = useState("");
  const [isDeletingAccount, setIsDeletingAccount] = useState(false);
  const [smartNotifications, setSmartNotifications] = useState([]);

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e) => {
      if (profileRef.current && !profileRef.current.contains(e.target)) {
        setProfileOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  useEffect(() => {
    fetchPlaylists();
  }, [fetchPlaylists]);

  useEffect(() => {
    setProfileForm({
      username: user?.username || "",
      email: user?.email || "",
    });
  }, [user?.username, user?.email]);

  // Time-based greeting
  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";

  const handleSignOut = async () => {
    await logout();
    navigate("/auth");
  };

  const handlePlaylistClick = (pl) => {
    navigate("/playlist", {
      state: {
        playlist: { title: pl.title, tracks: pl.trackList || [] },
        analysis: pl.analysis || { moodEmoji: pl.moodEmoji, base_emotion: pl.base_emotion },
        preference: pl.preference || "match",
        settings: pl.settings || {},
      },
    });
  };

  const handleDelete = (e, id) => {
    e.stopPropagation();
    deletePlaylist(id);
  };

  const usernameCooldownDaysRemaining = useMemo(() => {
    if (!user?.username_changed_at) return 0;
    const changedAt = new Date(user.username_changed_at);
    if (Number.isNaN(changedAt.getTime())) return 0;
    const daysElapsed = Math.floor(
      (Date.now() - changedAt.getTime()) / (1000 * 60 * 60 * 24)
    );
    return Math.max(0, 30 - daysElapsed);
  }, [user?.username_changed_at]);

  const dismissNotification = (id) => {
    const dismissed = JSON.parse(
      localStorage.getItem("sonar-dismissed-notifications") || "[]"
    );
    if (!dismissed.includes(id)) {
      localStorage.setItem(
        "sonar-dismissed-notifications",
        JSON.stringify([...dismissed, id])
      );
    }
    setSmartNotifications((prev) => prev.filter((notification) => notification.id !== id));
  };

  useEffect(() => {
    let isMounted = true;

    const buildNotifications = async () => {
      const dismissed = new Set(
        JSON.parse(localStorage.getItem("sonar-dismissed-notifications") || "[]")
      );
      const nextNotifications = [];

      const lastVisit = localStorage.getItem("sonar-last-visit");
      if (lastVisit) {
        const diffDays = Math.floor(
          (Date.now() - new Date(lastVisit).getTime()) / (1000 * 60 * 60 * 24)
        );
        if (diffDays >= 3 && !dismissed.has("welcome-back")) {
          nextNotifications.push({
            id: "welcome-back",
            icon: "👋",
            message: `Hey, we missed you! It's been ${diffDays} days - how's life?`,
          });
        }
      }
      localStorage.setItem("sonar-last-visit", new Date().toISOString());

      try {
        const history = await moodApi.history(60, 10);
        const entries = Array.isArray(history?.entries) ? history.entries : [];
        if (entries.length >= 3) {
          const [first, second, third] = entries;
          const emotion = first?.base_emotion;
          if (
            emotion &&
            emotion === second?.base_emotion &&
            emotion === third?.base_emotion &&
            !dismissed.has("mood-pattern")
          ) {
            nextNotifications.push({
              id: "mood-pattern",
              icon: "🎭",
              message: `You've been feeling ${emotion} lately - want to explore new vibes?`,
            });
          }
        }
      } catch {
        // Non-blocking enhancement: ignore fetch failures here.
      }

      if (isMounted) {
        setSmartNotifications(nextNotifications);
      }
    };

    buildNotifications();
    return () => {
      isMounted = false;
    };
  }, []);

  const handleSaveProfile = async () => {
    const username = profileForm.username.trim();
    const email = profileForm.email.trim();

    setProfileError("");
    setProfileSuccess("");

    if (!username) {
      setProfileError("Username cannot be empty.");
      return;
    }

    setIsSavingProfile(true);
    try {
      const updated = await authApi.updateProfile({
        username,
        email: email || null,
      });
      setUser(updated);
      setProfileSuccess("Profile updated successfully.");
    } catch (err) {
      setProfileError(err.message || "Failed to update profile.");
    } finally {
      setIsSavingProfile(false);
    }
  };

  const handleAvatarUpload = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setProfileError("");
    setProfileSuccess("");
    setIsUploadingAvatar(true);

    try {
      const updated = await authApi.uploadAvatar(file);
      setUser(updated);
      setProfileSuccess("Avatar updated.");
    } catch (err) {
      const message = err.message || "";
      if (message.includes("Processed avatar is too large")) {
        setProfileError("That image is too complex after processing. Try a simpler photo or screenshot.");
      } else if (message.includes("Image must be smaller than 2MB")) {
        setProfileError("Please upload an image smaller than 2MB.");
      } else if (message.includes("File must be an image") || message.includes("Invalid image file")) {
        setProfileError("Please choose a valid image file.");
      } else {
        setProfileError("Failed to upload avatar. Please try again.");
      }
    } finally {
      setIsUploadingAvatar(false);
      event.target.value = "";
    }
  };

  const handleDeleteAccount = async () => {
    if (deleteConfirmInput !== (user?.username || "")) {
      setProfileError("Username confirmation does not match.");
      return;
    }

    setIsDeletingAccount(true);
    setProfileError("");
    try {
      await authApi.deleteAccount();
      await logout();
      navigate("/");
    } catch (err) {
      setProfileError(err.message || "Failed to delete account.");
      setIsDeletingAccount(false);
    }
  };

  // ── Settings state (persisted to localStorage) ──
  const [settings, setSettings] = useState(() => {
    const saved = localStorage.getItem("sonar-settings");
    return saved
      ? JSON.parse(saved)
      : {
          dailyReminder: true,
          streakAlerts: true,
          saveMoodHistory: true,
          defaultVolume: 80,
          autoplayNext: true,
          crossfade: false,
        };
  });

  const updateSetting = (key, value) => {
    setSettings((prev) => {
      const updated = { ...prev, [key]: value };
      localStorage.setItem("sonar-settings", JSON.stringify(updated));
      return updated;
    });
  };

  const handleClearHistory = async () => {
    if (!window.confirm("Clear all your mood history? This cannot be undone.")) return;
    try {
      const token = useAuthStore.getState().accessToken;
      const base = import.meta.env.VITE_API_URL || "";
      await fetch(`${base}/v1/mood/history`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      alert("Mood history cleared.");
    } catch {
      alert("Failed to clear history. Try again later.");
    }
  };

  const handleDownloadData = async () => {
    try {
      const token = useAuthStore.getState().accessToken;
      const base = import.meta.env.VITE_API_URL || "";
      const [histRes, statsRes] = await Promise.all([
        fetch(`${base}/v1/mood/history`, { headers: { Authorization: `Bearer ${token}` } }),
        fetch(`${base}/v1/mood/stats`, { headers: { Authorization: `Bearer ${token}` } }),
      ]);
      const history = histRes.ok ? await histRes.json() : [];
      const stats = statsRes.ok ? await statsRes.json() : {};
      const savedPlaylists = JSON.parse(localStorage.getItem("sonar-playlists") || "[]");
      const exportData = {
        exported_at: new Date().toISOString(),
        user: { username: displayName },
        mood_history: history,
        mood_stats: stats,
        saved_playlists: savedPlaylists,
        settings,
      };
      const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `sonar-data-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      alert("Failed to export data. Try again later.");
    }
  };

  return (
    <div className="db-root">
      <StarfieldCanvas starCount={60} />
      <div className="db-glow db-glow-1" />
      <div className="db-glow db-glow-2" />

      {/* ── Navbar ── */}
      <nav className="db-nav">
        <div className="db-nav-inner">
          <div className="db-nav-logo" onClick={() => navigate("/dashboard")}>
            <span className="db-nav-logo-icon">🎵</span>
            <span className="db-nav-logo-text">Sonar</span>
          </div>

          <div className="db-nav-center">
            <span className="db-nav-tag" onClick={() => navigate("/dashboard")} style={{ cursor: "pointer" }}>Your Library</span>
            <span className="db-nav-tag" onClick={() => navigate("/history")} style={{ cursor: "pointer", opacity: 0.6 }}>Mood History</span>
          </div>

          {/* Profile box */}
          <div className="db-profile-wrap" ref={profileRef}>
            <button
              className="db-profile-btn"
              onClick={() => setProfileOpen(!profileOpen)}
              aria-label="User profile menu"
            >
              <div className="db-avatar">
                {user?.avatar_url ? (
                  <img src={user.avatar_url} alt={`${displayName} avatar`} className="db-avatar-image" />
                ) : (
                  <span>{displayInitial}</span>
                )}
                <div className="db-avatar-ring" />
              </div>
              <span className="db-username">{displayName}</span>
              <svg
                className={`db-chevron ${profileOpen ? "db-chevron--open" : ""}`}
                width="12"
                height="12"
                viewBox="0 0 12 12"
                fill="none"
              >
                <path d="M2 4l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
            </button>

            {profileOpen && (
              <div className="db-dropdown">
                <div className="db-dropdown-header">
                  <div className="db-dropdown-avatar">
                    {user?.avatar_url ? (
                      <img src={user.avatar_url} alt={`${displayName} avatar`} className="db-avatar-image" />
                    ) : (
                      displayInitial
                    )}
                  </div>
                  <div>
                    <p className="db-dropdown-name">{displayName}</p>
                    <p className="db-dropdown-email">{user?.email || `@${displayName}`}</p>
                  </div>
                </div>
                <div className="db-dropdown-divider" />
                <button
                  className="db-dropdown-item"
                  onClick={() => { setSettingsOpen(true); setProfileOpen(false); }}
                >
                  <span className="db-dropdown-icon">⚙️</span> Settings
                </button>
                <button className="db-dropdown-item">
                  <span className="db-dropdown-icon">🔔</span> Notifications
                </button>
                <button className="db-dropdown-item">
                  <span className="db-dropdown-icon">❓</span> Help & Support
                </button>
                <div className="db-dropdown-divider" />
                <button className="db-dropdown-item db-dropdown-item--danger" onClick={handleSignOut}>
                  <span className="db-dropdown-icon">🚪</span> Sign out
                </button>
              </div>
            )}
          </div>
        </div>
      </nav>

      {/* ── Main Content ── */}
      <main className="db-main">
        {smartNotifications.length > 0 && (
          <section className="db-smart-notifications">
            {smartNotifications.map((notification) => (
              <div key={notification.id} className="db-smart-banner">
                <div className="db-smart-banner-content">
                  <span className="db-smart-banner-icon">{notification.icon}</span>
                  <p>{notification.message}</p>
                </div>
                <button
                  className="db-smart-banner-close"
                  onClick={() => dismissNotification(notification.id)}
                  aria-label="Dismiss notification"
                >
                  ✕
                </button>
              </div>
            ))}
          </section>
        )}

        {/* Hero greeting */}
        <section className="db-hero">
          <div className="db-hero-text">
            <p className="db-greeting-label">{greeting}</p>
            <h1 className="db-greeting">
              How are you <span className="db-greeting-accent">feeling</span> today?
            </h1>
            <p className="db-greeting-sub">
              Your AI knows your mood before you do. Let it build you the perfect soundtrack.
            </p>
          </div>

          {/* Generate New Playlist CTA */}
          <button
            className="db-generate-btn"
            onClick={() => navigate("/analyze")}
            aria-label="Generate a new playlist"
          >
            <div className="db-generate-btn-glow" />
            <div className="db-generate-btn-inner">
              <div className="db-generate-icon-wrap">
                <span className="db-generate-icon">✦</span>
              </div>
              <div className="db-generate-text">
                <span className="db-generate-label">Generate New Playlist</span>
                <span className="db-generate-sub">Analyze your mood → instant soundtrack</span>
              </div>
              <svg className="db-generate-arrow" width="20" height="20" viewBox="0 0 20 20" fill="none">
                <path d="M4 10h12M10 4l6 6-6 6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
            <div className="db-generate-shimmer" />
          </button>
        </section>

        {/* ── Playlists Grid ── */}
        <section className="db-playlists">
          <div className="db-playlists-header">
            <h2 className="db-section-title">Your Generated Playlists</h2>
            <span className="db-playlist-count">
              {playlists.length} {playlists.length === 1 ? "playlist" : "playlists"}
            </span>
          </div>

          {playlists.length > 0 ? (
            <div className="db-grid">
              {playlists.map((pl) => (
                <div
                  key={pl.id}
                  className="db-card"
                  style={{ "--card-accent": pl.accent }}
                  onClick={() => handlePlaylistClick(pl)}
                >
                  <div className="db-card-art" style={{ background: pl.gradient }}>
                    <div className="db-card-vinyl">
                      <div className="db-card-vinyl-inner" />
                    </div>
                    <div className="db-card-play">
                      <svg width="18" height="18" viewBox="0 0 18 18" fill="currentColor">
                        <path d="M6 3.5l9 5.5-9 5.5V3.5z" />
                      </svg>
                    </div>
                    <div className="db-card-glow" style={{ background: pl.accent }} />
                    {/* Delete button */}
                    <button
                      className="db-card-delete"
                      onClick={(e) => handleDelete(e, pl.id)}
                      aria-label={`Delete ${pl.title}`}
                    >
                      <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                        <path d="M3 3l8 8M11 3l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                      </svg>
                    </button>
                  </div>
                  <div className="db-card-info">
                    <div className="db-card-mood-chip" style={{ color: pl.accent, borderColor: `${pl.accent}33`, background: `${pl.accent}11` }}>
                      {pl.moodEmoji} {pl.mood}
                    </div>
                    <h3 className="db-card-title">{pl.title}</h3>
                    <div className="db-card-meta">
                      <span>{pl.tracks} tracks</span>
                      <span className="db-card-dot">·</span>
                      <span>{pl.duration}</span>
                      <span className="db-card-dot">·</span>
                      <span className="db-card-date">{pl.date}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="db-onboarding">
              <div className="db-onboard-header">
                <span className="db-onboard-wave">👋</span>
                <h3 className="db-onboard-title">Welcome to Sonar</h3>
                <p className="db-onboard-subtitle">
                  Your AI-powered emotion-aware music companion. Here's how it works:
                </p>
              </div>

              <div className="db-onboard-steps">
                <div className="db-onboard-step">
                  <div className="db-onboard-step-num">1</div>
                  <div className="db-onboard-step-icon">🎤</div>
                  <h4 className="db-onboard-step-title">Speak or Type</h4>
                  <p className="db-onboard-step-desc">
                    Share how you're feeling through text or voice — we analyze both words and vocal tone.
                  </p>
                </div>
                <div className="db-onboard-step">
                  <div className="db-onboard-step-num">2</div>
                  <div className="db-onboard-step-icon">🧠</div>
                  <h4 className="db-onboard-step-title">AI Analyzes</h4>
                  <p className="db-onboard-step-desc">
                    Our AI detects your emotion, sub-emotion, and recommends a genre based on weather + mood.
                  </p>
                </div>
                <div className="db-onboard-step">
                  <div className="db-onboard-step-num">3</div>
                  <div className="db-onboard-step-icon">🎧</div>
                  <h4 className="db-onboard-step-title">Listen & Discover</h4>
                  <p className="db-onboard-step-desc">
                    Get a curated playlist on our vinyl player. Like songs to teach Sonar your taste.
                  </p>
                </div>
              </div>

              <button
                className="db-onboard-cta"
                onClick={() => navigate("/analyze")}
              >
                <span className="db-onboard-cta-icon">✦</span>
                Start Your First Analysis
              </button>
            </div>
          )}
        </section>
      </main>

      {/* ── Footer ── */}
      <footer className="db-footer">
        <div className="db-footer-inner">
          <div className="db-footer-brand">
            <span className="db-nav-logo-icon">🎵</span>
            <span className="db-nav-logo-text">Sonar</span>
            <p className="db-footer-desc">AI-powered emotion-aware music platform.</p>
          </div>
          <div className="db-footer-links">
            <div className="db-footer-col">
              <h4>Product</h4>
              <a href="#">Features</a>
              <a href="#">How It Works</a>
            </div>
            <div className="db-footer-col">
              <h4>Company</h4>
              <a href="#">About</a>
              <a href="#">Contact</a>
            </div>
          </div>
        </div>
        <div className="db-footer-bottom">
          <p>© 2026 Sonar. All rights reserved.</p>
        </div>
      </footer>

      {/* ── Settings Modal ── */}
      {settingsOpen && (
        <div className="db-modal-overlay" onClick={() => setSettingsOpen(false)}>
          <div className="db-modal" onClick={(e) => e.stopPropagation()}>
            <div className="db-modal-header">
              <h2 className="db-modal-title">Settings</h2>
              <button
                className="db-modal-close"
                onClick={() => setSettingsOpen(false)}
                aria-label="Close settings"
              >
                ✕
              </button>
            </div>

            <div className="db-modal-body">
              <div className="db-modal-sidebar">
                {[
                  { id: "account", icon: "👤", label: "Account" },
                  { id: "notifications", icon: "🔔", label: "Notifications" },
                  { id: "privacy", icon: "🔒", label: "Privacy" },
                  { id: "audio", icon: "🎵", label: "Audio" },
                ].map((tab) => (
                  <button
                    key={tab.id}
                    className={`db-modal-tab ${activeSettingsTab === tab.id ? "db-modal-tab--active" : ""}`}
                    onClick={() => setActiveSettingsTab(tab.id)}
                  >
                    <span>{tab.icon}</span> {tab.label}
                  </button>
                ))}
              </div>

              <div className="db-modal-content">
                {activeSettingsTab === "account" && (
                  <div className="db-settings-section">
                    <h3>Account Details</h3>
                    <div className="db-settings-row">
                      <div className="db-settings-avatar-big">
                        {user?.avatar_url ? (
                          <img src={user.avatar_url} alt={`${displayName} avatar`} className="db-avatar-image" />
                        ) : (
                          displayInitial
                        )}
                      </div>
                      <div>
                        <p className="db-settings-name">{displayName}</p>
                        <button
                          className="db-settings-change-avatar"
                          onClick={() => avatarInputRef.current?.click()}
                          disabled={isUploadingAvatar}
                        >
                          {isUploadingAvatar ? "Uploading..." : "Change avatar"}
                        </button>
                        <input
                          ref={avatarInputRef}
                          type="file"
                          accept="image/*"
                          className="db-hidden-file-input"
                          onChange={handleAvatarUpload}
                        />
                      </div>
                    </div>
                    <div className="db-settings-field">
                      <label>Username</label>
                      <input
                        type="text"
                        value={profileForm.username}
                        onChange={(e) =>
                          setProfileForm((prev) => ({ ...prev, username: e.target.value }))
                        }
                      />
                      {usernameCooldownDaysRemaining > 0 &&
                        profileForm.username.trim() !== (user?.username || "") && (
                          <p className="db-settings-inline-hint">
                            You can change your username again in {usernameCooldownDaysRemaining} day(s).
                          </p>
                        )}
                    </div>
                    <div className="db-settings-field">
                      <label>Email</label>
                      <input
                        type="email"
                        placeholder="No email set"
                        value={profileForm.email}
                        onChange={(e) =>
                          setProfileForm((prev) => ({ ...prev, email: e.target.value }))
                        }
                      />
                    </div>
                    {profileError && <p className="db-settings-error">{profileError}</p>}
                    {profileSuccess && <p className="db-settings-success">{profileSuccess}</p>}
                    <button className="db-settings-save" onClick={handleSaveProfile} disabled={isSavingProfile}>
                      {isSavingProfile ? "Saving..." : "Save Changes"}
                    </button>
                    <div className="db-settings-danger-zone">
                      <h4>Danger Zone</h4>
                      <button className="db-settings-delete" onClick={() => setShowDeleteConfirm(true)}>
                        Delete Account
                      </button>
                    </div>
                  </div>
                )}

                {/* ── Notifications ── */}
                {activeSettingsTab === "notifications" && (
                  <div className="db-settings-section">
                    <h3>Notifications</h3>
                    <p className="db-settings-desc">Choose what Sonar reminds you about.</p>

                    <div className="db-settings-toggle-row">
                      <div className="db-settings-toggle-info">
                        <span className="db-settings-toggle-label">Daily mood check-in</span>
                        <span className="db-settings-toggle-hint">Gentle reminder to log how you're feeling</span>
                      </div>
                      <button
                        className={`db-toggle ${settings.dailyReminder ? "db-toggle--on" : ""}`}
                        onClick={() => updateSetting("dailyReminder", !settings.dailyReminder)}
                        aria-label="Toggle daily reminder"
                      >
                        <span className="db-toggle-thumb" />
                      </button>
                    </div>

                    <div className="db-settings-toggle-row">
                      <div className="db-settings-toggle-info">
                        <span className="db-settings-toggle-label">Streak alerts</span>
                        <span className="db-settings-toggle-hint">Get notified about streak milestones and at-risk streaks</span>
                      </div>
                      <button
                        className={`db-toggle ${settings.streakAlerts ? "db-toggle--on" : ""}`}
                        onClick={() => updateSetting("streakAlerts", !settings.streakAlerts)}
                        aria-label="Toggle streak alerts"
                      >
                        <span className="db-toggle-thumb" />
                      </button>
                    </div>
                  </div>
                )}

                {/* ── Privacy ── */}
                {activeSettingsTab === "privacy" && (
                  <div className="db-settings-section">
                    <h3>Privacy</h3>
                    <p className="db-settings-desc">Control how your emotional data is stored.</p>

                    <div className="db-settings-toggle-row">
                      <div className="db-settings-toggle-info">
                        <span className="db-settings-toggle-label">Save mood history</span>
                        <span className="db-settings-toggle-hint">When off, mood entries won't be saved after analysis</span>
                      </div>
                      <button
                        className={`db-toggle ${settings.saveMoodHistory ? "db-toggle--on" : ""}`}
                        onClick={() => updateSetting("saveMoodHistory", !settings.saveMoodHistory)}
                        aria-label="Toggle mood history saving"
                      >
                        <span className="db-toggle-thumb" />
                      </button>
                    </div>

                    <div className="db-settings-action-row">
                      <div className="db-settings-toggle-info">
                        <span className="db-settings-toggle-label">Download my data</span>
                        <span className="db-settings-toggle-hint">Export all your mood history, playlists, and settings as JSON</span>
                      </div>
                      <button className="db-settings-action-btn" onClick={handleDownloadData}>
                        ↓ Export
                      </button>
                    </div>

                    <div className="db-settings-action-row db-settings-action-row--danger">
                      <div className="db-settings-toggle-info">
                        <span className="db-settings-toggle-label">Clear mood history</span>
                        <span className="db-settings-toggle-hint">Permanently delete all mood entries from the server</span>
                      </div>
                      <button className="db-settings-action-btn db-settings-action-btn--danger" onClick={handleClearHistory}>
                        Clear All
                      </button>
                    </div>
                  </div>
                )}

                {/* ── Audio ── */}
                {activeSettingsTab === "audio" && (
                  <div className="db-settings-section">
                    <h3>Audio</h3>
                    <p className="db-settings-desc">Customize your listening experience.</p>

                    <div className="db-settings-slider-row">
                      <div className="db-settings-toggle-info">
                        <span className="db-settings-toggle-label">Default volume</span>
                        <span className="db-settings-toggle-hint">Set the initial volume for playback</span>
                      </div>
                      <div className="db-settings-slider-control">
                        <input
                          type="range"
                          min="0"
                          max="100"
                          value={settings.defaultVolume}
                          onChange={(e) => updateSetting("defaultVolume", Number(e.target.value))}
                          className="db-settings-slider"
                        />
                        <span className="db-settings-slider-value">{settings.defaultVolume}%</span>
                      </div>
                    </div>

                    <div className="db-settings-toggle-row">
                      <div className="db-settings-toggle-info">
                        <span className="db-settings-toggle-label">Autoplay next track</span>
                        <span className="db-settings-toggle-hint">Automatically play the next song when current one ends</span>
                      </div>
                      <button
                        className={`db-toggle ${settings.autoplayNext ? "db-toggle--on" : ""}`}
                        onClick={() => updateSetting("autoplayNext", !settings.autoplayNext)}
                        aria-label="Toggle autoplay"
                      >
                        <span className="db-toggle-thumb" />
                      </button>
                    </div>

                    <div className="db-settings-toggle-row">
                      <div className="db-settings-toggle-info">
                        <span className="db-settings-toggle-label">Crossfade</span>
                        <span className="db-settings-toggle-hint">Smoothly blend between tracks for seamless listening</span>
                      </div>
                      <button
                        className={`db-toggle ${settings.crossfade ? "db-toggle--on" : ""}`}
                        onClick={() => updateSetting("crossfade", !settings.crossfade)}
                        aria-label="Toggle crossfade"
                      >
                        <span className="db-toggle-thumb" />
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {showDeleteConfirm && (
        <div className="db-modal-overlay" onClick={() => setShowDeleteConfirm(false)}>
          <div className="db-modal db-modal--confirm" onClick={(e) => e.stopPropagation()}>
            <div className="db-modal-header">
              <h2 className="db-modal-title">Delete Account</h2>
              <button
                className="db-modal-close"
                onClick={() => setShowDeleteConfirm(false)}
                aria-label="Close delete account"
              >
                ✕
              </button>
            </div>
            <div className="db-modal-content">
              <div className="db-settings-section">
                <p className="db-settings-desc">
                  This action is permanent. Type <strong>{user?.username}</strong> to confirm account deletion.
                </p>
                <div className="db-settings-field">
                  <label>Confirm username</label>
                  <input
                    type="text"
                    value={deleteConfirmInput}
                    onChange={(e) => setDeleteConfirmInput(e.target.value)}
                  />
                </div>
                {profileError && <p className="db-settings-error">{profileError}</p>}
                <div className="db-confirm-actions">
                  <button
                    className="db-settings-action-btn"
                    onClick={() => setShowDeleteConfirm(false)}
                    disabled={isDeletingAccount}
                  >
                    Cancel
                  </button>
                  <button
                    className="db-settings-action-btn db-settings-action-btn--danger"
                    onClick={handleDeleteAccount}
                    disabled={isDeletingAccount || deleteConfirmInput !== (user?.username || "")}
                  >
                    {isDeletingAccount ? "Deleting..." : "Delete permanently"}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}