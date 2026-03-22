import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import Sidebar from "../components/Sidebar";
import api    from "../services/api";
import { CATEGORY_COLORS } from "../constants/categories";

const SCORE_CONFIG = {
  "Excellent":       { color: "#16a34a", bg: "#f0fdf4", ring: "#bbf7d0" },
  "Good":            { color: "#0ea5e9", bg: "#f0f9ff", ring: "#bae6fd" },
  "Fair":            { color: "#f59e0b", bg: "#fffbeb", ring: "#fde68a" },
  "Needs Attention": { color: "#ef4444", bg: "#fef2f2", ring: "#fecaca" },
};

const HIGHLIGHT_STYLE = {
  positive: { icon: "✅", border: "#16a34a", bg: "#f0fdf4", color: "#15803d" },
  warning:  { icon: "⚠️", border: "#f59e0b", bg: "#fffbeb", color: "#b45309" },
  negative: { icon: "❌", border: "#ef4444", bg: "#fef2f2", color: "#b91c1c" },
};

// Animated score ring
function ScoreRing({ score, label }) {
  const cfg = SCORE_CONFIG[label] || SCORE_CONFIG["Fair"];
  const r   = 52;
  const circ = 2 * Math.PI * r;
  const dash = (score / 100) * circ;

  return (
    <div className="score-ring-wrap" style={{ background: cfg.bg }}>
      <svg width="140" height="140" viewBox="0 0 140 140">
        <circle cx="70" cy="70" r={r} fill="none" stroke={cfg.ring} strokeWidth="10"/>
        <circle
          cx="70" cy="70" r={r}
          fill="none"
          stroke={cfg.color}
          strokeWidth="10"
          strokeLinecap="round"
          strokeDasharray={`${dash} ${circ}`}
          transform="rotate(-90 70 70)"
          style={{ transition: "stroke-dasharray 1s ease" }}
        />
        <text x="70" y="65" textAnchor="middle" fontSize="28" fontWeight="700"
          fill={cfg.color} dominantBaseline="central">{score}</text>
        <text x="70" y="92" textAnchor="middle" fontSize="11"
          fill={cfg.color} dominantBaseline="central">/ 100</text>
      </svg>
      <span className="score-label" style={{ color: cfg.color, background: cfg.ring }}>
        {label}
      </span>
    </div>
  );
}

// Month-over-month mini bar chart
function MiniTrend({ monthly }) {
  if (!monthly?.length) return null;
  const max = Math.max(...monthly.map(m => m.total), 1);
  return (
    <div className="mini-trend">
      {monthly.map((m, i) => {
        const h = Math.max(Math.round((m.total / max) * 60), 4);
        const isLast = i === monthly.length - 1;
        return (
          <div key={m.month} className="mini-trend-col">
            <span className="mini-trend-val">
              {Math.round(m.total / 1000)}k
            </span>
            <div className="mini-trend-bar-wrap">
              <div
                className="mini-trend-bar"
                style={{
                  height: h,
                  background: isLast ? "#6366f1" : "#c7d2fe",
                }}
              />
            </div>
            <span className="mini-trend-label">{m.month.slice(5)}</span>
          </div>
        );
      })}
    </div>
  );
}

// Category spend bar
function CategoryBar({ sym, categories }) {
  const total = categories.reduce((s, c) => s + c.total, 0);
  return (
    <div className="cat-breakdown">
      {categories.slice(0, 6).map((c) => {
        const pct = total > 0 ? ((c.total / total) * 100).toFixed(1) : 0;
        return (
          <div key={c.category} className="cat-row">
            <span className="cat-name">{c.category}</span>
            <div className="cat-bar-track">
              <div
                className="cat-bar-fill"
                style={{
                  width: `${pct}%`,
                  background: CATEGORY_COLORS[c.category] || "#6366f1",
                }}
              />
            </div>
            <span className="cat-pct">{pct}%</span>
            <span className="cat-amt">{sym}{Math.round(c.total).toLocaleString("en-IN")}</span>
          </div>
        );
      })}
    </div>
  );
}

export default function Insights() {
  const navigate  = useNavigate();
  const [data,    setData]    = useState(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get("/insights");
      if (res.data.msg === "no_data") {
        setData("empty");
      } else {
        setData(res.data);
      }
    } catch (err) {
      setError(err.response?.data?.msg || "Failed to load insights.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const insights = data?.insights;
  const meta     = data?.meta;
  const sym      = meta?.currency_sym || "₹";

  return (
    <div className="app-layout">
      <Sidebar />
      <main className="main-content">

        <div className="page-header">
          <div>
            <h1>✨ AI Insights</h1>
            <p style={{ color: "var(--text-muted)", fontSize: ".88rem", marginTop: 2 }}>
              Powered by Claude — updated each time you refresh
            </p>
          </div>
          <button
            className="btn-primary"
            onClick={load}
            disabled={loading}
          >
            {loading ? "Analysing…" : "🔄 Refresh"}
          </button>
        </div>

        {/* ── Loading ── */}
        {loading && (
          <div className="insights-loading">
            <div className="insights-spinner" />
            <p>Claude is analysing your spending patterns…</p>
            <span>This takes a few seconds</span>
          </div>
        )}

        {/* ── Error ── */}
        {!loading && error && (
          <div className="insights-error">
            <p>⚠️ {error}</p>
            {error.includes("ANTHROPIC_API_KEY") && (
              <div className="api-key-hint">
                <p>Add your API key to <code>backend/.env</code>:</p>
                <pre>ANTHROPIC_API_KEY=sk-ant-...</pre>
                <p>Get one free at <a href="https://console.anthropic.com" target="_blank" rel="noreferrer">console.anthropic.com</a></p>
              </div>
            )}
            <button className="btn-primary" onClick={load} style={{ marginTop: 16 }}>
              Try again
            </button>
          </div>
        )}

        {/* ── No data ── */}
        {!loading && data === "empty" && (
          <div className="insights-empty">
            <span>📊</span>
            <h2>No expenses yet</h2>
            <p>Add some expenses first and come back for AI-powered insights.</p>
            <button className="btn-primary" onClick={() => navigate("/dashboard")}>
              Add Expenses
            </button>
          </div>
        )}

        {/* ── Insights ── */}
        {!loading && insights && meta && (
          <div className="insights-grid">

            {/* Row 1: Score + Summary */}
            <div className="insight-card insight-score-card">
              <ScoreRing score={insights.score} label={insights.score_label} />
              <div className="insight-summary-text">
                <h2>This month's overview</h2>
                <p>{insights.summary}</p>
                <div className="insight-total-chip">
                  Total spent: {sym}{Number(meta.current_total).toLocaleString("en-IN")}
                </div>
              </div>
            </div>

            {/* Row 1: Trend */}
            <div className="insight-card">
              <h3 className="insight-card-title">📈 Spending trend</h3>
              <MiniTrend monthly={meta.monthly_totals} />
              <p className="insight-forecast">{insights.forecast}</p>
            </div>

            {/* Row 2: Highlights */}
            <div className="insight-card">
              <h3 className="insight-card-title">💡 Highlights</h3>
              <div className="highlights-list">
                {insights.highlights.map((h, i) => {
                  const s = HIGHLIGHT_STYLE[h.type] || HIGHLIGHT_STYLE.positive;
                  return (
                    <div
                      key={i}
                      className="highlight-row"
                      style={{ borderLeft: `3px solid ${s.border}`, background: s.bg }}
                    >
                      <div className="highlight-top">
                        <span className="highlight-icon" style={{ fontSize: 14 }}>{s.icon}</span>
                        <span className="highlight-title" style={{ color: s.color }}>{h.title}</span>
                      </div>
                      <p className="highlight-detail">{h.detail}</p>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Row 2: Category breakdown */}
            <div className="insight-card">
              <h3 className="insight-card-title">🥧 Category breakdown</h3>
              <CategoryBar sym={sym} categories={meta.by_category} />
            </div>

            {/* Row 3: Smart tips */}
            <div className="insight-card insight-tips-card">
              <h3 className="insight-card-title">🎯 Smart tips</h3>
              <div className="tips-grid">
                {insights.tips.map((t, i) => (
                  <div key={i} className="tip-card">
                    <span
                      className="tip-cat-dot"
                      style={{ background: CATEGORY_COLORS[t.category] || "#6366f1" }}
                    />
                    <div>
                      <div className="tip-category">{t.category}</div>
                      <div className="tip-text">{t.tip}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Row 3: Anomalies + Budget */}
            <div className="insight-card">
              {/* Anomalies */}
              {insights.anomalies?.length > 0 && (
                <>
                  <h3 className="insight-card-title">🔍 Unusual activity</h3>
                  <div style={{ marginBottom: 20 }}>
                    {insights.anomalies.map((a, i) => (
                      <div key={i} className="anomaly-row">
                        <div className="anomaly-title">{a.title}</div>
                        <div className="anomaly-detail">{a.detail}</div>
                      </div>
                    ))}
                  </div>
                </>
              )}

              {/* Budget status */}
              {meta.budgets?.length > 0 && (
                <>
                  <h3 className="insight-card-title">🎯 Budget status</h3>
                  <div className="budget-status-list">
                    {meta.budgets.map((b) => (
                      <div key={b.category} className="budget-status-row">
                        <div className="budget-status-top">
                          <span>{b.category}</span>
                          <span
                            style={{
                              color: b.pct >= 100 ? "#ef4444" : b.pct >= 80 ? "#f59e0b" : "#16a34a",
                              fontWeight: 600,
                              fontSize: ".82rem",
                            }}
                          >
                            {b.pct}%
                          </span>
                        </div>
                        <div className="budget-status-track">
                          <div
                            className="budget-status-fill"
                            style={{
                              width: `${Math.min(b.pct, 100)}%`,
                              background: b.pct >= 100 ? "#ef4444" : b.pct >= 80 ? "#f59e0b" : "#16a34a",
                            }}
                          />
                        </div>
                        <div className="budget-status-amounts">
                          {sym}{Number(b.spent).toLocaleString("en-IN")} of {sym}{Number(b.limit).toLocaleString("en-IN")}
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}

              {!insights.anomalies?.length && !meta.budgets?.length && (
                <div style={{ color: "var(--text-muted)", fontSize: ".9rem", padding: "20px 0" }}>
                  No anomalies detected and no budgets set.
                </div>
              )}
            </div>

          </div>
        )}
      </main>
    </div>
  );
}