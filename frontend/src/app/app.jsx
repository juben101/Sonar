import { lazy, Suspense } from "react";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import Snowfall from "react-snowfall";
import LandingPage from "../pages/Landing/LandingPage";
import AuthPage from "../pages/Auth/AuthPage";
import ProtectedRoute from "../components/ProtectedRoute";
import ChatWidget from "../components/ChatWidget";
import NotFoundPage from "../pages/NotFound/NotFoundPage";

// ── Code-split heavy pages (lazy load) ──
const DashboardPage = lazy(() => import("../pages/Dashboard/DashboardPage"));
const AnalyzePage = lazy(() => import("../pages/Analyze/AnalyzePage"));
const ResultPage = lazy(() => import("../pages/Result/ResultPage"));
const PlaylistPage = lazy(() => import("../pages/Playlist/PlaylistPage"));
const HistoryPage = lazy(() => import("../pages/History/HistoryPage"));

// ── Suspense fallback (minimal loading state) ──
function PageLoader() {
  return (
    <div style={{
      minHeight: "100vh",
      background: "#080808",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
    }}>
      <div style={{
        width: 32,
        height: 32,
        border: "2px solid rgba(255,255,255,0.06)",
        borderTopColor: "#ff6b8a",
        borderRadius: "50%",
        animation: "spin 0.8s linear infinite",
      }} />
    </div>
  );
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000, //5 minutes
      retry: 1,
    },
  },
});

function ProtectedPage({ children }) {
  return (
    <ProtectedRoute>
      {children}
      <ChatWidget />
    </ProtectedRoute>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        {/* Global snowfall overlay */}
        <Snowfall
          color="rgba(255, 255, 255, 0.4)"
          snowflakeCount={100}
          speed={[0.3, 1.0]}
          radius={[0.5, 2.0]}
          wind={[-0.3, 0.5]}
          style={{
            position: "fixed",
            width: "100vw",
            height: "100vh",
            zIndex: 9999,
            pointerEvents: "none",
          }}
        />
        <Suspense fallback={<PageLoader />}>
          <Routes>
            <Route path="/" element={<LandingPage />} />
            <Route path="/auth" element={<AuthPage />} />
            <Route path="/dashboard" element={<ProtectedPage><DashboardPage /></ProtectedPage>} />
            <Route path="/analyze" element={<ProtectedPage><AnalyzePage /></ProtectedPage>} />
            <Route path="/result" element={<ProtectedPage><ResultPage /></ProtectedPage>} />
            <Route path="/playlist" element={<ProtectedPage><PlaylistPage /></ProtectedPage>} />
            <Route path="/history" element={<ProtectedPage><HistoryPage /></ProtectedPage>} />
            <Route path="*" element={<NotFoundPage />} />
          </Routes>
        </Suspense>
      </BrowserRouter>
    </QueryClientProvider>
  );
}