import { create } from "zustand";

const STORAGE_KEY = "sonar_saved_playlists";

/**
 * Load playlists from localStorage.
 */
function loadPlaylists() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

/**
 * Save playlists to localStorage.
 */
function persistPlaylists(playlists) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(playlists));
}

// Mood → accent color mapping
const MOOD_ACCENTS = {
  Sadness: "#7c8cff",
  Joy: "#ffcc00",
  Anger: "#ff4444",
  Fear: "#ff6b00",
  Calm: "#00d4aa",
};

// Mood → gradient mapping
const MOOD_GRADIENTS = {
  Sadness: "linear-gradient(135deg, #1a0533 0%, #0d1a33 100%)",
  Joy: "linear-gradient(135deg, #1a1100 0%, #1a0a00 100%)",
  Anger: "linear-gradient(135deg, #330a00 0%, #1a0000 100%)",
  Fear: "linear-gradient(135deg, #331500 0%, #1a0d00 100%)",
  Calm: "linear-gradient(135deg, #001a1a 0%, #001133 100%)",
};

const usePlaylistStore = create((set, get) => ({
  playlists: loadPlaylists(),

  /**
   * Save a generated playlist to the dashboard.
   */
  savePlaylist: (playlist, analysis, preference, settings) => {
    const playlists = get().playlists;

    const baseEmotion = analysis?.base_emotion || "Calm";
    const totalDuration = playlist.tracks.reduce((sum, t) => {
      const [m, s] = t.duration.split(":").map(Number);
      return sum + m * 60 + (s || 0);
    }, 0);
    const mins = Math.floor(totalDuration / 60);
    const durationStr = mins >= 60 ? `${Math.floor(mins / 60)}h ${mins % 60}min` : `${mins} min`;

    const saved = {
      id: Date.now(),
      title: playlist.title || `${baseEmotion} Mix`,
      mood: analysis?.sub_emotion || baseEmotion,
      moodEmoji: analysis?.moodEmoji || "🎵",
      base_emotion: baseEmotion,
      tracks: playlist.tracks.length,
      trackList: playlist.tracks,
      duration: durationStr,
      gradient: MOOD_GRADIENTS[baseEmotion] || MOOD_GRADIENTS.Calm,
      accent: MOOD_ACCENTS[baseEmotion] || "#ff3c64",
      date: new Date().toLocaleDateString("en-US", { month: "short", day: "numeric" }),
      preference,
      settings,
      analysis,
      createdAt: Date.now(),
    };

    const updated = [saved, ...playlists].slice(0, 50); // Max 50 playlists
    persistPlaylists(updated);
    set({ playlists: updated });

    return saved.id;
  },

  /**
   * Delete a saved playlist.
   */
  deletePlaylist: (id) => {
    const updated = get().playlists.filter((p) => p.id !== id);
    persistPlaylists(updated);
    set({ playlists: updated });
  },

  /**
   * Check if current playlist data already exists.
   */
  isPlaylistSaved: (title) => {
    return get().playlists.some((p) => p.title === title);
  },
}));

export default usePlaylistStore;
