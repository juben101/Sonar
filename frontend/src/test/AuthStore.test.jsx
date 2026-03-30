import { describe, it, expect, beforeEach } from "vitest";
import useAuthStore from "../stores/useAuthStore";

describe("useAuthStore", () => {
  beforeEach(() => {
    // Reset store state before each test
    useAuthStore.setState({
      user: null,
      accessToken: null,
      refreshToken: null,
      isAuthenticated: false,
    });
  });

  it("starts unauthenticated", () => {
    const state = useAuthStore.getState();
    expect(state.isAuthenticated).toBe(false);
    expect(state.user).toBeNull();
    expect(state.accessToken).toBeNull();
  });

  it("has login, signup, and logout methods", () => {
    const state = useAuthStore.getState();
    expect(typeof state.login).toBe("function");
    expect(typeof state.signup).toBe("function");
    expect(typeof state.logout).toBe("function");
  });

  it("tracks authentication state", () => {
    const state = useAuthStore.getState();
    expect(state).toHaveProperty("isAuthenticated");
    expect(state.isAuthenticated).toBe(false);
  });
});
