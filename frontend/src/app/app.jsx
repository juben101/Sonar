import { BrowserRouter, Routes, Route } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import LandingPage from "../pages/Landing/LandingPage";
import AuthPage from "../pages/Auth/AuthPage";
import DashboardPage from "../pages/Dashboard/DashboardPage";
import AnalyzePage from "../pages/Analyze/AnalyzePage";
import ResultPage from "../pages/Result/ResultPage";
import PlaylistPage from "../pages/Playlist/PlaylistPage";
import NotFoundPage from "../pages/NotFound/NotFoundPage";
import ProtectedRoute from "../components/ProtectedRoute";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000, //5 minutes
      retry: 1,
    },
  },
});

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<LandingPage />} />
          <Route path="/auth" element={<AuthPage />} />
          <Route path="/dashboard" element={<ProtectedRoute><DashboardPage /></ProtectedRoute>} />
          <Route path="/analyze" element={<ProtectedRoute><AnalyzePage /></ProtectedRoute>} />
          <Route path="/result" element={<ProtectedRoute><ResultPage /></ProtectedRoute>} />
          <Route path="/playlist" element={<ProtectedRoute><PlaylistPage /></ProtectedRoute>} />
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  );
}