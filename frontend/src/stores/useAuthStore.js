import { create } from "zustand";
import { authApi } from "../services/api";

const useAuthStore = create((set) => ({
  user: JSON.parse(localStorage.getItem("sonar_user") || "null"),
  accessToken: localStorage.getItem("sonar_access_token") || null,
  refreshToken: localStorage.getItem("sonar_refresh_token") || null,
  loading: false,
  error: null,

  login: async (username, password) => {
    set({ loading: true, error: null });
    try {
      const data = await authApi.login(username, password);
      localStorage.setItem("sonar_access_token", data.access_token);
      localStorage.setItem("sonar_refresh_token", data.refresh_token);
      localStorage.setItem("sonar_user", JSON.stringify(data.user));
      set({
        user: data.user,
        accessToken: data.access_token,
        refreshToken: data.refresh_token,
        loading: false,
      });
      return { success: true };
    } catch (err) {
      set({ loading: false, error: err.message });
      return { success: false, error: err.message };
    }
  },

  signup: async (username, password) => {
    set({ loading: true, error: null });
    try {
      // Only create account — don't store tokens (user must login separately)
      await authApi.signup(username, password);
      set({ loading: false });
      return { success: true };
    } catch (err) {
      set({ loading: false, error: err.message });
      return { success: false, error: err.message };
    }
  },

  logout: async () => {
    const refreshToken = localStorage.getItem("sonar_refresh_token");
    // Try to revoke the refresh token on the server (best effort)
    if (refreshToken) {
      try {
        await authApi.logout(refreshToken);
      } catch {
        // Ignore errors — still clear local state
      }
    }
    localStorage.removeItem("sonar_access_token");
    localStorage.removeItem("sonar_refresh_token");
    localStorage.removeItem("sonar_user");
    set({ user: null, accessToken: null, refreshToken: null, error: null });
  },

  setUser: (user) => {
    localStorage.setItem("sonar_user", JSON.stringify(user));
    set({ user });
  },

  clearError: () => set({ error: null }),
}));

export default useAuthStore;
