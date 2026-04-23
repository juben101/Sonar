import { useState, useEffect, useRef, useCallback } from "react";
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

const EMOTION_GRADIENTS = {
  Joy: "linear-gradient(135deg, #facc15, #f59e0b)",
  Sadness: "linear-gradient(135deg, #60a5fa, #3b82f6)",
  Anger: "linear-gradient(135deg, #f87171, #ef4444)",
  Fear: "linear-gradient(135deg, #c084fc, #a855f7)",
  Calm: "linear-gradient(135deg, #34d399, #10b981)",
};

const EMOTION_EMOJIS = {
  Joy: "😊", Sadness: "😢", Anger: "😤", Fear: "😰", Calm: "😌",
};

const PIE_COLORS = ["#facc15", "#60a5fa", "#f87171", "#c084fc", "#34d399", "#fb923c"];

// ── Animated counter hook ──
function useCountUp(target, duration = 1200) {
  const [value, setValue] = useState(0);
  const ref = useRef(null);

  useEffect(() => {
    if (target == null) return;
    const start = 0;
    const startTime = performance.now();

    const tick = (now) => {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);
      // Ease-out cubic
      const eased = 1 - Math.pow(1 - progress, 3);
      setValue(Math.round(start + (target - start) * eased));
      if (progress < 1) {
        ref.current = requestAnimationFrame(tick);
      }
    };

    ref.current = requestAnimationFrame(tick);
    return () => ref.current && cancelAnimationFrame(ref.current);
  }, [target, duration]);

  return value;
}

// ── Custom Tooltip ──
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

// ── Radar Chart (pure SVG) ──
function EmotionRadar({ dimensions = [] }) {
  if (!dimensions || dimensions.length < 5) return null;

  const labels = ["Sadness", "Joy", "Anger", "Fear", "Calm", "Energy"];
  const colors = ["#7c8cff", "#ffcc00", "#ff4444", "#ff6b00", "#00d4aa", "#ff3c64"];
  const size = 200;
  const cx = size / 2;
  const cy = size / 2;
  const maxR = 75;
  const levels = 4;

  // Map dimensions to values (0-100)
  const vals = labels.map((l) => {
    const dim = dimensions.find(
      (d) => d.name?.toLowerCase() === l.toLowerCase()
    );
    return dim ? dim.value / 100 : 0.2;
  });

  const angles = labels.map((_, i) => (Math.PI * 2 * i) / labels.length - Math.PI / 2);

  const getPoint = (angle, r) => ({
    x: cx + r * Math.cos(angle),
    y: cy + r * Math.sin(angle),
  });

  const dataPoints = vals.map((v, i) => getPoint(angles[i], v * maxR));

  return (
    <svg viewBox={`0 0 ${size} ${size}`} className="mh-radar-svg" role="img" aria-label="Emotion radar chart showing distribution of Sadness, Joy, Anger, Fear, Calm, and Energy">
      {/* Grid levels */}
      {Array.from({ length: levels }, (_, i) => {
        const r = (maxR * (i + 1)) / levels;
        const pts = angles.map((a) => getPoint(a, r));
        return (
          <polygon
            key={i}
            points={pts.map((p) => `${p.x},${p.y}`).join(" ")}
            fill="none"
            stroke="rgba(255,255,255,0.06)"
            strokeWidth="1"
          />
        );
      })}
      {/* Axes */}
      {angles.map((a, i) => {
        const end = getPoint(a, maxR);
        return (
          <line
            key={i}
            x1={cx} y1={cy} x2={end.x} y2={end.y}
            stroke="rgba(255,255,255,0.06)"
            strokeWidth="1"
          />
        );
      })}
      {/* Data shape */}
      <polygon
        points={dataPoints.map((p) => `${p.x},${p.y}`).join(" ")}
        fill="rgba(255, 60, 100, 0.12)"
        stroke="#ff6b8a"
        strokeWidth="1.5"
        className="mh-radar-shape"
      />
      {/* Data dots */}
      {dataPoints.map((p, i) => (
        <circle key={i} cx={p.x} cy={p.y} r="3.5" fill={colors[i]} />
      ))}
      {/* Labels */}
      {angles.map((a, i) => {
        const labelR = maxR + 18;
        const pt = getPoint(a, labelR);
        return (
          <text
            key={i}
            x={pt.x}
            y={pt.y}
            textAnchor="middle"
            dominantBaseline="central"
            className="mh-radar-label"
          >
            {labels[i]}
          </text>
        );
      })}
    </svg>
  );
}

// ── Calendar Heatmap ──
function CalendarHeatmap({ data = [] }) {
  const today = new Date();
  const days = 91; // 13 weeks
  const cellSize = 13;
  const gap = 3;

  // Build a map of date → entry
  const dateMap = {};
  data.forEach((d) => { dateMap[d.date] = d; });

  // Generate grid: 7 rows (Mon-Sun) × 13 cols
  const cells = [];
  const startDate = new Date(today);
  startDate.setDate(startDate.getDate() - days + 1);
  // Adjust to start on Monday
  const startDay = startDate.getDay();
  const offset = startDay === 0 ? 6 : startDay - 1;
  startDate.setDate(startDate.getDate() - offset);

  const months = [];
  let lastMonth = -1;

  const todayStr = today.toISOString().split("T")[0];
  const maxCount = Math.max(1, ...data.map((d) => d.count || 0));

  const getCellOpacity = (count) => {
    if (count <= 0) return 1;
    // Granular scaling that saturates slower than the old linear formula.
    const normalized = Math.min(count / (maxCount + 2), 1);
    return 0.18 + normalized * 0.74;
  };

  const getCellCountLabel = (count) => {
    if (count <= 0) return "";
    if (count < 10) return String(count);
    return "9+";
  };

  for (let i = 0; i < 13 * 7; i++) {
    const d = new Date(startDate);
    d.setDate(d.getDate() + i);
    const dateStr = d.toISOString().split("T")[0];
    const col = Math.floor(i / 7);
    const row = i % 7;
    const entry = dateMap[dateStr];
    const isFuture = d > today;

    // Track month labels
    if (d.getMonth() !== lastMonth && row === 0) {
      lastMonth = d.getMonth();
      months.push({
        label: d.toLocaleDateString("en-US", { month: "short" }),
        x: col * (cellSize + gap),
      });
    }

    cells.push({
      x: col * (cellSize + gap),
      y: row * (cellSize + gap) + 16,
      date: dateStr,
      count: entry?.count || 0,
      emotion: entry?.dominant_emotion || "",
      isFuture,
      isToday: dateStr === todayStr,
    });
  }

  const width = 13 * (cellSize + gap);
  const height = 7 * (cellSize + gap) + 20;

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="mh-cal-svg" role="img" aria-label="Mood calendar heatmap showing analysis activity over the last 13 weeks">
      {/* Month labels */}
      {months.map((m, i) => (
        <text key={i} x={m.x} y={10} className="mh-cal-month">{m.label}</text>
      ))}
      {/* Day cells */}
      {cells.map((c, i) => (
        <g key={i}>
          <rect
            x={c.x}
            y={c.y}
            width={cellSize}
            height={cellSize}
            rx="2.5"
            fill={
              c.isFuture
                ? "transparent"
                : c.count === 0
                ? "rgba(255,255,255,0.03)"
                : EMOTION_COLORS[c.emotion] || "#ff6b8a"
            }
            opacity={c.isFuture ? 0 : c.count === 0 ? 1 : getCellOpacity(c.count)}
            className={`${c.count > 0 && !c.isFuture ? "mh-cal-active" : ""} ${c.isToday ? "mh-cal-today" : ""}`.trim()}
          >
            {!c.isFuture && c.count > 0 && (
              <title>{`${c.date}: ${c.count} ${c.count === 1 ? "analysis" : "analyses"} (${c.emotion})`}</title>
            )}
            {!c.isFuture && c.count === 0 && <title>{`${c.date}: no analyses`}</title>}
          </rect>
          {!c.isFuture && c.isToday && (
            <rect
              x={c.x - 1}
              y={c.y - 1}
              width={cellSize + 2}
              height={cellSize + 2}
              rx="3.5"
              fill="none"
              stroke="rgba(255,255,255,0.9)"
              strokeWidth="1.1"
              className="mh-cal-today-ring"
            />
          )}
          {!c.isFuture && c.count > 0 && (
            <text
              x={c.x + cellSize / 2}
              y={c.y + cellSize / 2 + 0.4}
              textAnchor="middle"
              dominantBaseline="central"
              className="mh-cal-count"
            >
              {getCellCountLabel(c.count)}
            </text>
          )}
        </g>
      ))}
    </svg>
  );
}

// ── Delta Badge ──
function DeltaBadge({ value, label, unit = "" }) {
  const isPositive = value > 0;
  const isNeutral = value === 0;
  return (
    <div className="mh-delta">
      <span className={`mh-delta-val ${isPositive ? "mh-delta--up" : isNeutral ? "" : "mh-delta--down"}`}>
        {isPositive ? "↑" : isNeutral ? "→" : "↓"} {Math.abs(value)}{unit}
      </span>
      <span className="mh-delta-label">{label}</span>
    </div>
  );
}


export default function HistoryPage() {
  const navigate = useNavigate();
  const [stats, setStats] = useState(null);
  const [history, setHistory] = useState(null);
  const [loading, setLoading] = useState(true);
  const [days, setDays] = useState(30);
  const [error, setError] = useState(null);

  // Fetch data based on selected range — memoized to avoid lint warnings
  const fetchData = useCallback(async () => {
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
  }, [days]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const hasData = stats && stats.total_analyses > 0;

  // Animated counters
  const animTotal = useCountUp(hasData ? stats.total_analyses : 0);
  const animConf = useCountUp(hasData ? stats.avg_confidence : 0);
  const animStreak = useCountUp(hasData ? stats.streak : 0);

  // Mood gradient based on dominant emotion
  const gradient = hasData
    ? EMOTION_GRADIENTS[stats.dominant_emotion] || EMOTION_GRADIENTS.Calm
    : "linear-gradient(135deg, rgba(255,255,255,0.05), rgba(255,255,255,0.02))";

  // Build radar data from the most recent history entry's dimensions
  // or average across daily_moods
  const radarDims = hasData && history?.entries?.length > 0
    ? (() => {
        // Aggregate from daily moods and emotion distribution
        const dist = stats.emotion_distribution || [];
        const total = dist.reduce((s, e) => s + e.count, 0) || 1;
        return [
          { name: "Sadness", value: Math.round((dist.find((e) => e.emotion === "Sadness")?.count || 0) / total * 100) || 10 },
          { name: "Joy", value: Math.round((dist.find((e) => e.emotion === "Joy")?.count || 0) / total * 100) || 10 },
          { name: "Anger", value: Math.round((dist.find((e) => e.emotion === "Anger")?.count || 0) / total * 100) || 10 },
          { name: "Fear", value: Math.round((dist.find((e) => e.emotion === "Fear")?.count || 0) / total * 100) || 10 },
          { name: "Calm", value: Math.round((dist.find((e) => e.emotion === "Calm")?.count || 0) / total * 100) || 10 },
          { name: "Energy", value: Math.round(stats.avg_confidence) || 50 },
        ];
      })()
    : null;

  return (
    <PageLayout>
      <Navbar centerLabel="Mood History" showBack backTo="/dashboard" />

      <main className="mh-main">
        <div className="mh-content">

          {/* ── Gradient Banner Header ── */}
          <section className="mh-header" style={{ "--mood-gradient": gradient }}>
            <div className="mh-header-glow" />
            <div className="mh-header-text">
              <span className="mh-tag">📊 Emotional Insights</span>
              <h1 className="mh-title">
                Your <span className="mh-accent">emotional</span> journey
              </h1>
              <p className="mh-subtitle">
                Track how your mood evolves over time. Every analysis is recorded to reveal patterns.
              </p>
            </div>

            {/* Time range + streak */}
            <div className="mh-header-controls">
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
              {hasData && stats.streak > 0 && (
                <div className="mh-streak">
                  <span className="mh-streak-flame">🔥</span>
                  <span className="mh-streak-num">{animStreak}</span>
                  <span className="mh-streak-label">day streak</span>
                </div>
              )}
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
              <button className="mh-retry-btn" onClick={fetchData}>Retry</button>
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
            <div className="mh-dashboard-grid">
              {/* ── Stats + Week Comparison Row ── */}
              <div className="mh-stats-grid mh-grid-span-left">
                <div className="mh-stat-card">
                  <span className="mh-stat-label">Total Analyses</span>
                  <span className="mh-stat-value">{animTotal}</span>
                </div>
                <div className="mh-stat-card">
                  <span className="mh-stat-label">Avg Confidence</span>
                  <span className="mh-stat-value">{animConf}%</span>
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

              {/* ── Week-over-Week Comparison ── */}
              {stats.week_comparison && (
                <div className="mh-wow-card mh-grid-span-right">
                  <h3 className="mh-wow-title">📊 This Week vs Last Week</h3>
                  <div className="mh-wow-grid">
                    <DeltaBadge value={stats.week_comparison.confidence_delta} label="Confidence" unit="%" />
                    <DeltaBadge value={stats.week_comparison.energy_delta} label="Energy" />
                    <DeltaBadge value={stats.week_comparison.valence_delta} label="Happiness" />
                    <div className="mh-delta">
                      <span className="mh-delta-val">
                        {stats.week_comparison.this_week_analyses}
                      </span>
                      <span className="mh-delta-label">analyses this week</span>
                    </div>
                  </div>
                </div>
              )}

              {/* ── Calendar + Recent Row ── */}
              <div className="mh-heatmap-row mh-grid-full">
                {stats.calendar_data && (
                  <div className="mh-chart-card mh-chart-card--heatmap">
                    <h3 className="mh-chart-title">🗓️ Mood Calendar</h3>
                    <p className="mh-chart-desc">Your analysis activity over the last 13 weeks</p>
                    <div className="mh-cal-wrap">
                      <CalendarHeatmap data={stats.calendar_data} />
                    </div>
                    <div className="mh-cal-legend">
                      <span className="mh-cal-legend-label">Less</span>
                      {[0.15, 0.3, 0.55, 0.8, 1].map((op, i) => (
                        <span
                          key={i}
                          className="mh-cal-legend-cell"
                          style={{ opacity: op, background: EMOTION_COLORS[stats.dominant_emotion] || "#ff6b8a" }}
                        />
                      ))}
                      <span className="mh-cal-legend-label">More</span>
                    </div>
                  </div>
                )}

                {/* ── Recent Entries ── */}
                <div className="mh-chart-card mh-recent mh-recent-card">
                  <h3 className="mh-chart-title">🕐 Recent Analyses</h3>
                  <div className="mh-entries mh-entries--compact">
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
              </div>

              {/* ── Row: Radar + Pie + Confidence ── */}
              <div className="mh-chart-row mh-grid-full">
                {/* Emotion Radar */}
                {radarDims && (
                  <div className="mh-chart-card mh-chart-card--half">
                    <h3 className="mh-chart-title">🕸️ Emotion Profile</h3>
                    <p className="mh-chart-desc">Your emotional distribution as a radar</p>
                    <div className="mh-radar-wrap">
                      <EmotionRadar dimensions={radarDims} />
                    </div>
                  </div>
                )}

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
              </div>

              {/* ── Confidence + Energy Trend ── */}
              <div className="mh-chart-card mh-grid-half">
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
                        type="monotone" dataKey="confidence" stroke="#ff6b8a"
                        fill="url(#gradConfidence)" strokeWidth={2} name="Confidence"
                        dot={{ fill: "#ff6b8a", r: 3 }}
                      />
                      <Area
                        type="monotone" dataKey="energy" stroke="#60a5fa"
                        fill="url(#gradEnergy)" strokeWidth={2} name="Energy"
                        dot={{ fill: "#60a5fa", r: 3 }}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* ── Valence Trend ── */}
              <div className="mh-chart-card mh-grid-half">
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
                        type="monotone" dataKey="valence" stroke="#34d399"
                        strokeWidth={2.5} name="Valence"
                        dot={{ fill: "#34d399", r: 4, strokeWidth: 0 }}
                        activeDot={{ r: 6, fill: "#34d399", stroke: "#fff", strokeWidth: 2 }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>

            </div>
          )}
        </div>
      </main>
    </PageLayout>
  );
}
