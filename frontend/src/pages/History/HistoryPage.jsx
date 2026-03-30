import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell,
  LineChart, Line,
} from "recharts";
import { moodApi } from "../../services/api";
import PageLayout from "../../components/PageLayout";
import Navbar from "../../components/Navbar";
import "./HistoryPage.css";

const EMOTION_COLORS = {
  Joy: "#facc15",
  Sadness: "#60a5fa",
  Anger: "#f87171",
  Fear: "#c084fc",
  Calm: "#34d399",
};

const EMOTION_EMOJIS = {
  Joy: "😊",
  Sadness: "😢",
  Anger: "😤",
  Fear: "😰",
  Calm: "😌",
};

const PIE_COLORS = ["#facc15", "#60a5fa", "#f87171", "#c084fc", "#34d399", "#fb923c", "#a78bfa"];

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="mh-tooltip">
      <p className="mh-tooltip-label">{label}</p>
      {payload.map((p, i) => (
        <p key={i} className="mh-tooltip-value" style={{ color: p.color }}>
          {p.name}: {p.value}
        </p>
      ))}
    </div>
  );
};

export default function HistoryPage() {
  const navigate = useNavigate();
  const [stats, setStats] = useState(null);
  const [history, setHistory] = useState(null);
  const [loading, setLoading] = useState(true);
  const [days, setDays] = useState(30);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      setError(null);
      try {
        const [statsData, historyData] = await Promise.all([
          moodApi.stats(days),
          moodApi.history(days, 100),
        ]);
        setStats(statsData);
        setHistory(historyData);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [days]);

  const hasData = stats && stats.total_analyses > 0;

  return (
    <PageLayout>
      <Navbar centerLabel="Mood History" showBack backTo="/dashboard" />

      <main className="mh-main">
        <div className="mh-content">
          {/* Header */}
          <section className="mh-header">
            <div className="mh-header-text">
              <span className="mh-tag">📊 Emotional Insights</span>
              <h1 className="mh-title">
                Your <span className="mh-accent">emotional</span> journey
              </h1>
              <p className="mh-subtitle">
                Track how your mood evolves over time. Every analysis is recorded to reveal patterns.
              </p>
            </div>

            {/* Time range selector */}
            <div className="mh-range-selector">
              {[7, 14, 30, 90].map((d) => (
                <button
                  key={d}
                  className={`mh-range-btn ${days === d ? "mh-range-btn--active" : ""}`}
                  onClick={() => setDays(d)}
                >
                  {d}d
                </button>
              ))}
            </div>
          </section>

          {loading ? (
            <div className="mh-loading">
              <div className="mh-loading-spinner" />
              <p>Loading your emotional data...</p>
            </div>
          ) : error ? (
            <div className="mh-error">
              <p>😕 {error}</p>
              <button className="mh-retry-btn" onClick={() => setDays(days)}>Retry</button>
            </div>
          ) : !hasData ? (
            <div className="mh-empty">
              <div className="mh-empty-icon">📊</div>
              <h3>No mood data yet</h3>
              <p>Start analyzing your mood to see emotional trends here.</p>
              <button className="mh-empty-cta" onClick={() => navigate("/analyze")}>
                ✦ Analyze Your Mood
              </button>
            </div>
          ) : (
            <>
              {/* ── Stats cards ── */}
              <div className="mh-stats-grid">
                <div className="mh-stat-card">
                  <span className="mh-stat-label">Total Analyses</span>
                  <span className="mh-stat-value">{stats.total_analyses}</span>
                </div>
                <div className="mh-stat-card">
                  <span className="mh-stat-label">Avg Confidence</span>
                  <span className="mh-stat-value">{stats.avg_confidence}%</span>
                </div>
                <div className="mh-stat-card">
                  <span className="mh-stat-label">Top Genre</span>
                  <span className="mh-stat-value mh-stat-text">{stats.top_genre || "—"}</span>
                </div>
                <div className="mh-stat-card">
                  <span className="mh-stat-label">Dominant Mood</span>
                  <span className="mh-stat-value">
                    {EMOTION_EMOJIS[stats.dominant_emotion] || "🎵"} {stats.dominant_emotion}
                  </span>
                </div>
              </div>

              {/* ── Confidence + Energy Trend (Area Chart) ── */}
              <div className="mh-chart-card">
                <h3 className="mh-chart-title">📈 Confidence & Energy Trend</h3>
                <p className="mh-chart-desc">How your analysis confidence and energy levels change over time</p>
                <div className="mh-chart-wrap">
                  <ResponsiveContainer width="100%" height={280}>
                    <AreaChart data={stats.daily_moods}>
                      <defs>
                        <linearGradient id="gradConfidence" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#ff6b8a" stopOpacity={0.3} />
                          <stop offset="95%" stopColor="#ff6b8a" stopOpacity={0} />
                        </linearGradient>
                        <linearGradient id="gradEnergy" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#60a5fa" stopOpacity={0.3} />
                          <stop offset="95%" stopColor="#60a5fa" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
                      <XAxis
                        dataKey="date"
                        tickFormatter={(v) => v.slice(5)}
                        stroke="rgba(255,255,255,0.15)"
                        tick={{ fill: "rgba(255,255,255,0.3)", fontSize: 11 }}
                      />
                      <YAxis
                        domain={[0, 100]}
                        stroke="rgba(255,255,255,0.15)"
                        tick={{ fill: "rgba(255,255,255,0.3)", fontSize: 11 }}
                      />
                      <Tooltip content={<CustomTooltip />} />
                      <Area
                        type="monotone"
                        dataKey="confidence"
                        stroke="#ff6b8a"
                        fill="url(#gradConfidence)"
                        strokeWidth={2}
                        name="Confidence"
                        dot={{ fill: "#ff6b8a", r: 3 }}
                      />
                      <Area
                        type="monotone"
                        dataKey="energy"
                        stroke="#60a5fa"
                        fill="url(#gradEnergy)"
                        strokeWidth={2}
                        name="Energy"
                        dot={{ fill: "#60a5fa", r: 3 }}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* ── Row: Pie + Valence ── */}
              <div className="mh-chart-row">
                {/* Emotion Distribution (Pie) */}
                <div className="mh-chart-card mh-chart-card--half">
                  <h3 className="mh-chart-title">🎭 Emotion Distribution</h3>
                  <div className="mh-chart-wrap mh-pie-wrap">
                    <ResponsiveContainer width="100%" height={220}>
                      <PieChart>
                        <Pie
                          data={stats.emotion_distribution}
                          dataKey="count"
                          nameKey="emotion"
                          cx="50%"
                          cy="50%"
                          innerRadius={55}
                          outerRadius={85}
                          paddingAngle={3}
                          strokeWidth={0}
                        >
                          {stats.emotion_distribution.map((entry, i) => (
                            <Cell
                              key={entry.emotion}
                              fill={EMOTION_COLORS[entry.emotion] || PIE_COLORS[i % PIE_COLORS.length]}
                            />
                          ))}
                        </Pie>
                        <Tooltip content={<CustomTooltip />} />
                      </PieChart>
                    </ResponsiveContainer>
                    <div className="mh-pie-legend">
                      {stats.emotion_distribution.map((e, i) => (
                        <div key={e.emotion} className="mh-pie-legend-item">
                          <span
                            className="mh-pie-dot"
                            style={{ background: EMOTION_COLORS[e.emotion] || PIE_COLORS[i % PIE_COLORS.length] }}
                          />
                          <span className="mh-pie-label">{e.emotion}</span>
                          <span className="mh-pie-count">{e.count}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Valence Trend (Line Chart) */}
                <div className="mh-chart-card mh-chart-card--half">
                  <h3 className="mh-chart-title">💚 Valence (Happiness)</h3>
                  <p className="mh-chart-desc">Higher = more positive emotional state</p>
                  <div className="mh-chart-wrap">
                    <ResponsiveContainer width="100%" height={220}>
                      <LineChart data={stats.daily_moods}>
                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
                        <XAxis
                          dataKey="date"
                          tickFormatter={(v) => v.slice(5)}
                          stroke="rgba(255,255,255,0.15)"
                          tick={{ fill: "rgba(255,255,255,0.3)", fontSize: 11 }}
                        />
                        <YAxis
                          domain={[0, 100]}
                          stroke="rgba(255,255,255,0.15)"
                          tick={{ fill: "rgba(255,255,255,0.3)", fontSize: 11 }}
                        />
                        <Tooltip content={<CustomTooltip />} />
                        <Line
                          type="monotone"
                          dataKey="valence"
                          stroke="#34d399"
                          strokeWidth={2.5}
                          name="Valence"
                          dot={{ fill: "#34d399", r: 4, strokeWidth: 0 }}
                          activeDot={{ r: 6, fill: "#34d399", stroke: "#fff", strokeWidth: 2 }}
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </div>

              {/* ── Recent Entries ── */}
              <div className="mh-recent">
                <h3 className="mh-chart-title">🕐 Recent Analyses</h3>
                <div className="mh-entries">
                  {history.entries.slice(0, 15).map((entry, i) => (
                    <div
                      key={entry.id}
                      className="mh-entry"
                      style={{
                        animationDelay: `${i * 0.04}s`,
                        "--entry-color": EMOTION_COLORS[entry.base_emotion] || "#888",
                      }}
                    >
                      <div className="mh-entry-left">
                        <span className="mh-entry-emoji">
                          {entry.mood_emoji || EMOTION_EMOJIS[entry.base_emotion] || "🎵"}
                        </span>
                        <div className="mh-entry-info">
                          <span className="mh-entry-emotion">{entry.sub_emotion || entry.base_emotion}</span>
                          <span className="mh-entry-preview">{entry.input_preview}</span>
                        </div>
                      </div>
                      <div className="mh-entry-right">
                        <div className="mh-entry-meta">
                          <span
                            className="mh-entry-badge"
                            style={{
                              color: EMOTION_COLORS[entry.base_emotion] || "#888",
                              borderColor: `${EMOTION_COLORS[entry.base_emotion] || "#888"}33`,
                              background: `${EMOTION_COLORS[entry.base_emotion] || "#888"}11`,
                            }}
                          >
                            {entry.base_emotion}
                          </span>
                          <span className="mh-entry-conf">{entry.confidence}%</span>
                        </div>
                        <span className="mh-entry-date">
                          {new Date(entry.created_at).toLocaleDateString("en-US", {
                            month: "short", day: "numeric",
                          })}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>
      </main>
    </PageLayout>
  );
}
