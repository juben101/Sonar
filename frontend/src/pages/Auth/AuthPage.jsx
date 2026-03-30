import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useForm } from "react-hook-form";
import StarfieldCanvas from "../../components/StarfieldCanvas";
import { useToast, ToastContainer } from "../../components/Toast";
import useAuthStore from "../../stores/useAuthStore";
import "./AuthPage.css";

export default function AuthPage() {
  const navigate = useNavigate();
  const { login, signup, loading } = useAuthStore();
  const { toasts, addToast, removeToast } = useToast();
  const [tab, setTab] = useState("login");

  // React Hook Form — Login
  const {
    register: registerLogin,
    handleSubmit: handleLoginSubmit,
    formState: { errors: loginErrors },
  } = useForm({ mode: "onSubmit" });

  // React Hook Form — Signup
  const {
    register: registerSignup,
    handleSubmit: handleSignupSubmit,
    watch: watchSignup,
    formState: { errors: signupErrors },
  } = useForm({ mode: "onSubmit" });

  const [showLoginPass, setShowLoginPass] = useState(false);
  const [showSignupPass, setShowSignupPass] = useState(false);
  const [showConfirmPass, setShowConfirmPass] = useState(false);

  const onLogin = async (data) => {
    const result = await login(data.username, data.password);
    if (result.success) {
      addToast("Welcome back! Redirecting...", "success");
      setTimeout(() => navigate("/dashboard"), 1200);
    } else {
      addToast(result.error || "Login failed", "error");
    }
  };

  const onSignup = async (data) => {
    const result = await signup(data.username, data.password);
    if (result.success) {
      addToast("Account created! Redirecting...", "success");
      setTimeout(() => navigate("/dashboard"), 1200);
    } else {
      addToast(result.error || "Signup failed", "error");
    }
  };

  return (
    <div className="auth-root">
      <ToastContainer toasts={toasts} removeToast={removeToast} />

      {/* ── Left Panel — Atmospheric Visual ── */}
      <div className="auth-left">
        <StarfieldCanvas starCount={70} />
        <div className="auth-left-glow auth-left-glow-1" />
        <div className="auth-left-glow auth-left-glow-2" />

        <div className="auth-left-content">
          <div className="auth-left-logo">
            <span className="auth-left-logo-icon">🎵</span>
            <span className="auth-left-logo-text">Sonar</span>
          </div>

          <div className="auth-vinyl">
            <div className="auth-vinyl-disc">
              <div className="auth-vinyl-grooves" />
              <div className="auth-vinyl-center" />
            </div>
          </div>

          <h2 className="auth-left-headline">
            Feel the music. <br />
            <span className="auth-left-accent">Your way.</span>
          </h2>
          <p className="auth-left-desc">
            AI-powered playlists that understand your emotions and adapt to how you feel.
          </p>

          <div className="auth-mood-chips">
            <span className="auth-chip auth-chip--1">😊 Happy</span>
            <span className="auth-chip auth-chip--2">🌧 Melancholy</span>
            <span className="auth-chip auth-chip--3">⚡ Energetic</span>
            <span className="auth-chip auth-chip--4">😌 Calm</span>
          </div>
        </div>
      </div>

      {/* ── Right Panel — Form ── */}
      <div className="auth-right">
        <button
          className="auth-back"
          onClick={() => navigate("/")}
          aria-label="Go back to home page"
        >
          ← Back
        </button>

        <div className="auth-form-container">
          <h1 className="auth-title">
            {tab === "login" ? "Welcome back" : "Create account"}
          </h1>
          <p className="auth-subtitle">
            {tab === "login"
              ? "Sign in to continue your musical journey"
              : "Join Sonar and discover emotion-aware music"}
          </p>

          {/* Tabs */}
          <nav className="auth-tabs" aria-label="Authentication method">
            <button
              className={`auth-tab ${tab === "login" ? "auth-tab--active" : ""}`}
              onClick={() => setTab("login")}
              aria-selected={tab === "login"}
              role="tab"
            >
              Login
            </button>
            <button
              className={`auth-tab ${tab === "signup" ? "auth-tab--active" : ""}`}
              onClick={() => setTab("signup")}
              aria-selected={tab === "signup"}
              role="tab"
            >
              Sign Up
            </button>
          </nav>

          {/* Card */}
          <div className="auth-card">
            {tab === "login" ? (
              <form
                className="auth-form"
                key="login"
                onSubmit={handleLoginSubmit(onLogin)}
                noValidate
              >
                <div className="auth-field">
                  <label htmlFor="login-username">Username</label>
                  <input
                    id="login-username"
                    type="text"
                    placeholder="Enter your username"
                    aria-invalid={!!loginErrors.username}
                    {...registerLogin("username", {
                      required: "Username is required",
                      minLength: {
                        value: 3,
                        message: "Username must be at least 3 characters",
                      },
                      pattern: {
                        value: /^[a-zA-Z0-9_]+$/,
                        message: "Only letters, numbers, and underscores",
                      },
                    })}
                  />
                  {loginErrors.username && (
                    <span className="auth-error" role="alert">
                      {loginErrors.username.message}
                    </span>
                  )}
                </div>

                <div className="auth-field">
                  <label htmlFor="login-password">Password</label>
                  <div className="auth-input-wrap">
                    <input
                      id="login-password"
                      type={showLoginPass ? "text" : "password"}
                      placeholder="••••••••"
                      aria-invalid={!!loginErrors.password}
                      {...registerLogin("password", {
                        required: "Password is required",
                        minLength: {
                          value: 6,
                          message: "Password must be at least 6 characters",
                        },
                      })}
                    />
                    <button
                      className="auth-eye"
                      onClick={() => setShowLoginPass(!showLoginPass)}
                      type="button"
                      aria-label={showLoginPass ? "Hide password" : "Show password"}
                    >
                      {showLoginPass ? "🙈" : "👁"}
                    </button>
                  </div>
                  {loginErrors.password && (
                    <span className="auth-error" role="alert">
                      {loginErrors.password.message}
                    </span>
                  )}
                </div>

                <button className="auth-submit" type="submit" disabled={loading}>
                  {loading ? <span className="auth-spinner" aria-label="Loading" /> : "Login to Sonar"}
                </button>
              </form>
            ) : (
              <form
                className="auth-form"
                key="signup"
                onSubmit={handleSignupSubmit(onSignup)}
                noValidate
              >
                <div className="auth-field">
                  <label htmlFor="signup-username">Username</label>
                  <input
                    id="signup-username"
                    type="text"
                    placeholder="Choose a username"
                    aria-invalid={!!signupErrors.username}
                    {...registerSignup("username", {
                      required: "Username is required",
                      minLength: {
                        value: 3,
                        message: "Username must be at least 3 characters",
                      },
                      pattern: {
                        value: /^[a-zA-Z0-9_]+$/,
                        message: "Only letters, numbers, and underscores",
                      },
                    })}
                  />
                  {signupErrors.username && (
                    <span className="auth-error" role="alert">
                      {signupErrors.username.message}
                    </span>
                  )}
                </div>

                <div className="auth-field">
                  <label htmlFor="signup-password">Password</label>
                  <div className="auth-input-wrap">
                    <input
                      id="signup-password"
                      type={showSignupPass ? "text" : "password"}
                      placeholder="Create a strong password"
                      aria-invalid={!!signupErrors.password}
                      {...registerSignup("password", {
                        required: "Password is required",
                        minLength: {
                          value: 6,
                          message: "Password must be at least 6 characters",
                        },
                      })}
                    />
                    <button
                      className="auth-eye"
                      onClick={() => setShowSignupPass(!showSignupPass)}
                      type="button"
                      aria-label={showSignupPass ? "Hide password" : "Show password"}
                    >
                      {showSignupPass ? "🙈" : "👁"}
                    </button>
                  </div>
                  {signupErrors.password && (
                    <span className="auth-error" role="alert">
                      {signupErrors.password.message}
                    </span>
                  )}
                </div>

                <div className="auth-field">
                  <label htmlFor="signup-confirm">Confirm Password</label>
                  <div className="auth-input-wrap">
                    <input
                      id="signup-confirm"
                      type={showConfirmPass ? "text" : "password"}
                      placeholder="Confirm your password"
                      aria-invalid={!!signupErrors.confirmPassword}
                      {...registerSignup("confirmPassword", {
                        required: "Please confirm your password",
                        validate: (val) =>
                          val === watchSignup("password") || "Passwords do not match",
                      })}
                    />
                    <button
                      className="auth-eye"
                      onClick={() => setShowConfirmPass(!showConfirmPass)}
                      type="button"
                      aria-label={showConfirmPass ? "Hide password" : "Show password"}
                    >
                      {showConfirmPass ? "🙈" : "👁"}
                    </button>
                  </div>
                  {signupErrors.confirmPassword && (
                    <span className="auth-error" role="alert">
                      {signupErrors.confirmPassword.message}
                    </span>
                  )}
                </div>

                <button className="auth-submit" type="submit" disabled={loading}>
                  {loading ? <span className="auth-spinner" aria-label="Loading" /> : "Create Account"}
                </button>
              </form>
            )}
          </div>

          <p className="auth-footer-text">
            {tab === "login" ? (
              <>Don't have an account?{" "}
                <button className="auth-switch" onClick={() => setTab("signup")}>Sign up</button>
              </>
            ) : (
              <>Already have an account?{" "}
                <button className="auth-switch" onClick={() => setTab("login")}>Log in</button>
              </>
            )}
          </p>
        </div>
      </div>
    </div>
  );
}