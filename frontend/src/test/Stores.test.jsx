import { describe, it, expect, beforeEach, vi } from "vitest";
import usePlaylistStore from "../stores/usePlaylistStore";

// ══════════════════════════════════════
//  PLAYLIST STORE TESTS
// ══════════════════════════════════════

describe("usePlaylistStore", () => {
  beforeEach(() => {
    localStorage.clear();
    usePlaylistStore.setState({ playlists: [] });
  });

  it("starts with empty playlists", () => {
    const state = usePlaylistStore.getState();
    expect(state.playlists).toEqual([]);
  });

  it("saves a playlist", () => {
    const store = usePlaylistStore.getState();
    const playlist = {
      title: "Joy · Pop",
      tracks: [
        { name: "Song 1", artist: "Artist 1", duration: "3:30" },
        { name: "Song 2", artist: "Artist 2", duration: "4:00" },
      ],
    };
    const analysis = {
      base_emotion: "Joy",
      sub_emotion: "Excitement",
      moodEmoji: "😊",
    };

    const id = store.savePlaylist(playlist, analysis, "match", {});

    const state = usePlaylistStore.getState();
    expect(state.playlists).toHaveLength(1);
    expect(state.playlists[0].title).toBe("Joy · Pop");
    expect(state.playlists[0].tracks).toBe(2);
    expect(state.playlists[0].moodEmoji).toBe("😊");
    expect(id).toBeTruthy();
  });

  it("saves multiple playlists in reverse chronological order", () => {
    const store = usePlaylistStore.getState();

    store.savePlaylist(
      { title: "First", tracks: [{ name: "A", artist: "B", duration: "3:00" }] },
      { base_emotion: "Calm", moodEmoji: "😌" },
      "match",
      {}
    );

    store.savePlaylist(
      { title: "Second", tracks: [{ name: "C", artist: "D", duration: "3:00" }] },
      { base_emotion: "Joy", moodEmoji: "😊" },
      "match",
      {}
    );

    const state = usePlaylistStore.getState();
    expect(state.playlists).toHaveLength(2);
    expect(state.playlists[0].title).toBe("Second"); // newest first
    expect(state.playlists[1].title).toBe("First");
  });

  it("deletes a playlist by id", () => {
    const store = usePlaylistStore.getState();
    const id = store.savePlaylist(
      { title: "Delete Me", tracks: [{ name: "A", artist: "B", duration: "3:00" }] },
      { base_emotion: "Sadness", moodEmoji: "😢" },
      "match",
      {}
    );

    store.deletePlaylist(id);
    const state = usePlaylistStore.getState();
    expect(state.playlists).toHaveLength(0);
  });

  it("checks if a playlist is saved", () => {
    const store = usePlaylistStore.getState();
    store.savePlaylist(
      { title: "Unique Mix", tracks: [{ name: "A", artist: "B", duration: "3:00" }] },
      { base_emotion: "Joy", moodEmoji: "😊" },
      "match",
      {}
    );

    expect(store.isPlaylistSaved("Unique Mix")).toBe(true);
    expect(store.isPlaylistSaved("Nonexistent")).toBe(false);
  });

  it("persists playlists to localStorage", () => {
    const store = usePlaylistStore.getState();
    store.savePlaylist(
      { title: "Persist Test", tracks: [{ name: "A", artist: "B", duration: "3:00" }] },
      { base_emotion: "Calm", moodEmoji: "😌" },
      "match",
      {}
    );

    const stored = JSON.parse(localStorage.getItem("sonar_saved_playlists"));
    expect(stored).toHaveLength(1);
    expect(stored[0].title).toBe("Persist Test");
  });

  it("limits to 50 playlists max", () => {
    const store = usePlaylistStore.getState();
    for (let i = 0; i < 55; i++) {
      store.savePlaylist(
        { title: `Playlist ${i}`, tracks: [{ name: "A", artist: "B", duration: "3:00" }] },
        { base_emotion: "Joy", moodEmoji: "😊" },
        "match",
        {}
      );
    }
    const state = usePlaylistStore.getState();
    expect(state.playlists.length).toBeLessThanOrEqual(50);
  });

  it("assigns correct mood accent colors", () => {
    const store = usePlaylistStore.getState();
    store.savePlaylist(
      { title: "Sad Mix", tracks: [{ name: "A", artist: "B", duration: "3:00" }] },
      { base_emotion: "Sadness", moodEmoji: "😢" },
      "match",
      {}
    );

    const state = usePlaylistStore.getState();
    expect(state.playlists[0].accent).toBe("#7c8cff"); // Sadness accent
  });
});

// ══════════════════════════════════════
//  AUTH STORE — SIGNUP ISOLATION TEST
// ══════════════════════════════════════

describe("useAuthStore - signup isolation", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("signup does NOT store tokens or set user state", async () => {
    const { default: useAuthStore } = await import("../stores/useAuthStore");

    // Mock the fetch call
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        access_token: "mock_access",
        refresh_token: "mock_refresh",
        user: { id: "1", username: "test" },
      }),
    });

    useAuthStore.setState({
      user: null,
      accessToken: null,
      refreshToken: null,
    });

    const result = await useAuthStore.getState().signup("test", "password");

    expect(result.success).toBe(true);
    // User should NOT be set after signup
    const state = useAuthStore.getState();
    expect(state.user).toBeNull();
    expect(state.accessToken).toBeNull();
    // localStorage should NOT have tokens
    expect(localStorage.getItem("sonar_access_token")).toBeNull();
  });
});

// ══════════════════════════════════════
//  API SERVICE TESTS
// ══════════════════════════════════════

describe("API service", () => {
  it("exports all required API groups", async () => {
    const { api, authApi, moodApi } = await import("../services/api");

    expect(api).toBeDefined();
    expect(api.get).toBeTypeOf("function");
    expect(api.post).toBeTypeOf("function");
    expect(api.put).toBeTypeOf("function");
    expect(api.delete).toBeTypeOf("function");

    expect(authApi).toBeDefined();
    expect(authApi.login).toBeTypeOf("function");
    expect(authApi.signup).toBeTypeOf("function");
    expect(authApi.refresh).toBeTypeOf("function");
    expect(authApi.logout).toBeTypeOf("function");
    expect(authApi.me).toBeTypeOf("function");

    expect(moodApi).toBeDefined();
    expect(moodApi.analyze).toBeTypeOf("function");
    expect(moodApi.transcribe).toBeTypeOf("function");
    expect(moodApi.playlist).toBeTypeOf("function");
    expect(moodApi.history).toBeTypeOf("function");
    expect(moodApi.stats).toBeTypeOf("function");
  });
});

// ══════════════════════════════════════
//  PAGE IMPORT TESTS
// ══════════════════════════════════════

describe("Page imports", () => {
  it("HistoryPage is importable", async () => {
    const mod = await import("../pages/History/HistoryPage");
    expect(mod.default).toBeDefined();
    expect(typeof mod.default).toBe("function");
  });

  it("AnalyzePage is importable", async () => {
    const mod = await import("../pages/Analyze/AnalyzePage");
    expect(mod.default).toBeDefined();
  });

  it("ResultPage is importable", async () => {
    const mod = await import("../pages/Result/ResultPage");
    expect(mod.default).toBeDefined();
  });

  it("PlaylistPage is importable", async () => {
    const mod = await import("../pages/Playlist/PlaylistPage");
    expect(mod.default).toBeDefined();
  });

  it("DashboardPage is importable", async () => {
    const mod = await import("../pages/Dashboard/DashboardPage");
    expect(mod.default).toBeDefined();
  });

  it("AuthPage is importable", async () => {
    const mod = await import("../pages/Auth/AuthPage");
    expect(mod.default).toBeDefined();
  });

  it("LandingPage is importable", async () => {
    const mod = await import("../pages/Landing/LandingPage");
    expect(mod.default).toBeDefined();
  });
});
