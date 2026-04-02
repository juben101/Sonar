const API_URL = import.meta.env.VITE_API_URL || "http://localhost:8000";

/**
 * Core request function with automatic token refresh on 401.
 */
async function request(endpoint, options = {}, _retried = false) {
  const url = `${API_URL}${endpoint}`;

  const config = {
    headers: {
      "Content-Type": "application/json",
      ...options.headers,
    },
    ...options,
  };

  // Attach access token if present
  const token = localStorage.getItem("sonar_access_token");
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }

  const response = await fetch(url, config);

  // Auto-refresh on 401 (only once to avoid infinite loops)
  if (response.status === 401 && !_retried) {
    const refreshed = await tryRefreshToken();
    if (refreshed) {
      return request(endpoint, options, true);
    }
  }

  if (!response.ok) {
    const error = await response.json().catch(() => ({
      detail: "Something went wrong",
    }));
    throw new Error(error.detail || `HTTP ${response.status}`);
  }

  return response.json();
}

/**
 * Raw fetch with auth (for file uploads — no JSON content-type).
 */
async function rawRequest(endpoint, options = {}, _retried = false) {
  const url = `${API_URL}${endpoint}`;
  const token = localStorage.getItem("sonar_access_token");

  const config = {
    headers: {},
    ...options,
  };

  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }

  const response = await fetch(url, config);

  // Auto-refresh on 401 (only once to avoid infinite loops)
  if (response.status === 401 && !_retried) {
    const refreshed = await tryRefreshToken();
    if (refreshed) {
      return rawRequest(endpoint, options, true);
    }
  }

  if (!response.ok) {
    const error = await response.json().catch(() => ({
      detail: "Something went wrong",
    }));
    throw new Error(error.detail || `HTTP ${response.status}`);
  }

  return response.json();
}

/**
 * Attempt to refresh the access token using the stored refresh token.
 */
async function tryRefreshToken() {
  const refreshToken = localStorage.getItem("sonar_refresh_token");
  if (!refreshToken) return false;

  try {
    const response = await fetch(`${API_URL}/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refresh_token: refreshToken }),
    });

    if (!response.ok) {
      // Refresh token is invalid/expired — clear everything
      localStorage.removeItem("sonar_access_token");
      localStorage.removeItem("sonar_refresh_token");
      localStorage.removeItem("sonar_user");
      return false;
    }

    const data = await response.json();
    localStorage.setItem("sonar_access_token", data.access_token);
    return true;
  } catch {
    return false;
  }
}

export const api = {
  get: (endpoint) => request(endpoint, { method: "GET" }),

  post: (endpoint, data) =>
    request(endpoint, {
      method: "POST",
      body: JSON.stringify(data),
    }),

  put: (endpoint, data) =>
    request(endpoint, {
      method: "PUT",
      body: JSON.stringify(data),
    }),

  delete: (endpoint) => request(endpoint, { method: "DELETE" }),
};

// Auth-specific API calls
export const authApi = {
  login: (username, password) =>
    api.post("/auth/login", { username, password }),

  signup: (username, password) =>
    api.post("/auth/signup", { username, password }),

  refresh: (refresh_token) =>
    api.post("/auth/refresh", { refresh_token }),

  logout: (refresh_token) =>
    api.post("/auth/logout", { refresh_token }),

  me: () => api.get("/auth/me"),
};

// Mood analysis API calls
export const moodApi = {
  analyze: (text, lat = null, lon = null) =>
    api.post("/v1/mood/analyze", { text, lat, lon }),

  transcribe: (audioBlob) => {
    const formData = new FormData();
    formData.append("audio", audioBlob, "recording.webm");
    return rawRequest("/v1/mood/transcribe", {
      method: "POST",
      body: formData,
    });
  },

  playlist: (dimensions, preference, languages = [], artists = [], intensity = 50, track_count = 15, genre = "pop", base_emotion = "Calm") =>
    api.post("/v1/mood/playlist", {
      dimensions, preference, languages, artists, intensity, track_count, genre, base_emotion,
    }),

  history: (days = 30, limit = 50) =>
    api.get(`/v1/mood/history?days=${days}&limit=${limit}`),

  stats: (days = 30) =>
    api.get(`/v1/mood/stats?days=${days}`),

  // Song preferences (like/dislike)
  setPreference: (songKey, preference, songTitle = "", songArtist = "") =>
    api.put("/v1/mood/songs/preference", {
      song_key: songKey,
      preference,
      song_title: songTitle,
      song_artist: songArtist,
    }),

  removePreference: (songKey) =>
    api.delete(`/v1/mood/songs/preference/${encodeURIComponent(songKey)}`),

  getPreferences: (songKeys) =>
    api.post("/v1/mood/songs/preferences", { song_keys: songKeys }),
};
