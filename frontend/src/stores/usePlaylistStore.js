import { create } from "zustand";
import { moodApi } from "../services/api";

const STORAGE_KEY_PREFIX = "sonar_saved_playlists";
const LEGACY_STORAGE_KEY = "sonar_saved_playlists";

/**
 * Load playlists from localStorage.
 */
function loadPlaylists() {
  try {
    const userRaw = localStorage.getItem("sonar_user");
    const user = userRaw ? JSON.parse(userRaw) : null;
    const key = `${STORAGE_KEY_PREFIX}:${user?.id || "anon"}`;
    const raw = localStorage.getItem(key);
    if (raw) return JSON.parse(raw);
    const legacy = localStorage.getItem(LEGACY_STORAGE_KEY);
    return legacy ? JSON.parse(legacy) : [];
  } catch {
    return [];
  }
}

/**
 * Save playlists to localStorage.
 */
function persistPlaylists(playlists) {
  try {
    const userRaw = localStorage.getItem("sonar_user");
    const user = userRaw ? JSON.parse(userRaw) : null;
    const key = `${STORAGE_KEY_PREFIX}:${user?.id || "anon"}`;
    localStorage.setItem(key, JSON.stringify(playlists));
    // Keep legacy key for backward compatibility/tests.
    localStorage.setItem(LEGACY_STORAGE_KEY, JSON.stringify(playlists));
  } catch {
    // ignore local fallback persistence errors
  }
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
  loading: false,

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

    const payload = {
      title: playlist.title || `${baseEmotion} Mix`,
      mood: analysis?.sub_emotion || baseEmotion,
      mood_emoji: analysis?.moodEmoji || "🎵",
      base_emotion: baseEmotion,
      tracks: playlist.tracks.length,
      track_list: playlist.tracks,
      duration: durationStr,
      gradient: MOOD_GRADIENTS[baseEmotion] || MOOD_GRADIENTS.Calm,
      accent: MOOD_ACCENTS[baseEmotion] || "#ff3c64",
      preference,
      settings,
      analysis,
    };

    // Optimistic local update for instant UI + test compatibility.
    const localId = `local-${Date.now()}`;
    const optimistic = {
      ...payload,
      moodEmoji: payload.mood_emoji,
      id: localId,
      trackList: playlist.tracks,
      date: new Date().toLocaleDateString("en-US", { month: "short", day: "numeric" }),
    };
    const optimisticUpdated = [optimistic, ...playlists].slice(0, 50);
    persistPlaylists(optimisticUpdated);
    set({ playlists: optimisticUpdated });

    moodApi.savePlaylist(payload)
      .then((saved) => {
        const normalized = {
          ...saved,
          moodEmoji: saved.mood_emoji,
          trackList: saved.trackList || [],
          date: new Date(saved.created_at || Date.now()).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
        };
        const replaced = get().playlists.map((p) => (p.id === localId ? normalized : p));
        persistPlaylists(replaced);
        set({ playlists: replaced });
      })
      .catch(() => {
        // Keep optimistic local item as offline fallback.
      });

    return localId;
  },

  /**
   * Delete a saved playlist.
   */
  deletePlaylist: (id) => {
    const updated = get().playlists.filter((p) => p.id !== id);
    persistPlaylists(updated);
    set({ playlists: updated });

    if (!String(id).startsWith("local-")) {
      moodApi.deleteSavedPlaylist(id).catch(() => {
        // no-op: UI already updated optimistically
      });
    }
  },

  fetchPlaylists: async () => {
    set({ loading: true });
    try {
      const rows = await moodApi.getSavedPlaylists();
      const normalized = rows.map((row) => ({
        ...row,
        moodEmoji: row.mood_emoji,
        trackList: row.trackList || [],
        date: new Date(row.created_at || Date.now()).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
      }));
      persistPlaylists(normalized);
      set({ playlists: normalized, loading: false });
    } catch {
      // Keep local fallback data if server fetch fails.
      set({ loading: false });
    }
  },

  /**
   * Check if current playlist data already exists.
   */
  isPlaylistSaved: (title) => {
    return get().playlists.some((p) => p.title === title);
  },
}));

export default usePlaylistStore;
