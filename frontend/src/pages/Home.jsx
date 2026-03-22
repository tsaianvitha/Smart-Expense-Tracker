import { useState, useEffect } from "react";
import { useNavigate }         from "react-router-dom";
import Sidebar                 from "../components/Sidebar";
import InstallBanner           from "../components/InstallBanner";
import api                     from "../services/api";
import { CATEGORY_COLORS }     from "../constants/categories";

export default function Home() {
  const navigate = useNavigate();
  const [data,    setData]    = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const [sumRes, budRes, remRes, todoRes] = await Promise.all([
          api.get("/expenses/summary"),
          api.get("/budgets/alerts"),
          api.get("/reminders/upcoming"),
          api.get("/todos", { params: { status: "pending", sort: "priority" } }),
        ]);
        setData({
          summary:  sumRes.data,
          alerts:   budRes.data.alerts,
          upcoming: remRes.data.upcoming,
          todos:    todoRes.data.todos.slice(0, 5),
        });
      } catch { }
      finally { setLoading(false); }
    };
    load();
  }, []);

  const user     = JSON.parse(localStorage.getItem("user") || "{}");
  const hour     = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";

  return (
    <div className="app-layout">
      <Sidebar />

      <main className="main-content">
        {/* PWA Install Banner */}
        <InstallBanner />

        {/* Greeting */}
        <div className="home-greeting">
          <h1>{greeting}, {user.name?.split(" ")[0] || "there"} 👋</h1>
          <p>{new Date().toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}</p>
        </div>

        {loading ? (
          <div className="loading-state">Loading your dashboard…</div>
        ) : (
          <div className="home-grid">

            {/* Monthly spend */}
            <div className="home-card wide">
              <div className="home-card-header">
                <h2>📊 This Month's Spend</h2>
                <button className="btn-link" onClick={() => navigate("/dashboard")}>View all →</button>
              </div>
              <div className="home-spend-row">
                <div>
                  <div className="home-big-num">
                    ₹{Number(data?.summary?.monthly_total || 0).toLocaleString("en-IN")}
                  </div>
                  <div className="home-sub">
                    {new Date().toLocaleString("en-IN", { month: "long", year: "numeric" })}
                  </div>
                </div>
                <div className="home-cat-bars">
                  {(data?.summary?.by_category || [])
                    .sort((a, b) => b.total - a.total)
                    .slice(0, 5)
                    .map((c) => {
                      const pct = data?.summary?.monthly_total
                        ? Math.round((c.total / data.summary.monthly_total) * 100) : 0;
                      return (
                        <div key={c.category} className="mini-bar-row">
                          <span className="mini-bar-label">{c.category}</span>
                          <div className="mini-bar-track">
                            <div className="mini-bar-fill"
                              style={{ width: `${pct}%`, background: CATEGORY_COLORS[c.category] }} />
                          </div>
                          <span className="mini-bar-pct">{pct}%</span>
                        </div>
                      );
                    })}
                </div>
              </div>
            </div>

            {/* Budget alerts */}
            <div className="home-card">
              <div className="home-card-header">
                <h2>🎯 Budget Alerts</h2>
                <button className="btn-link" onClick={() => navigate("/dashboard?tab=budgets")}>Manage →</button>
              </div>
              {!data?.alerts?.length ? (
                <div className="home-empty"><span>✅</span><p>All budgets on track</p></div>
              ) : (
                <div className="alert-list">
                  {data.alerts.map((a) => (
                    <div key={a.category} className="alert-row"
                      style={{ borderLeft: `3px solid ${a.status === "exceeded" ? "#ef4444" : "#f59e0b"}` }}>
                      <div className="alert-row-top">
                        <span className="alert-cat">{a.category}</span>
                        <span className="alert-status"
                          style={{ color: a.status === "exceeded" ? "#dc2626" : "#d97706" }}>
                          {a.percent_used}%
                        </span>
                      </div>
                      <div className="alert-bar-track">
                        <div className="alert-bar-fill"
                          style={{ width: `${Math.min(a.percent_used, 100)}%`,
                                   background: a.status === "exceeded" ? "#ef4444" : "#f59e0b" }} />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Upcoming bills */}
            <div className="home-card">
              <div className="home-card-header">
                <h2>🔔 Upcoming Bills</h2>
                <button className="btn-link" onClick={() => navigate("/reminders")}>All →</button>
              </div>
              {!data?.upcoming?.length ? (
                <div className="home-empty"><span>✅</span><p>No bills due in 7 days</p></div>
              ) : (
                <div className="upcoming-list">
                  {data.upcoming.map((r) => (
                    <div key={r.id} className="upcoming-row">
                      <div className="upcoming-info">
                        <span className="upcoming-title">{r.title}</span>
                        <span className={`upcoming-due ${r.is_overdue ? "overdue" : r.due_soon ? "due-soon" : ""}`}>
                          {r.days_until_due === 0 ? "Due today"
                            : r.days_until_due < 0 ? `${Math.abs(r.days_until_due)}d overdue`
                            : `In ${r.days_until_due}d`}
                        </span>
                      </div>
                      {r.amount && <span className="upcoming-amount">₹{Number(r.amount).toLocaleString("en-IN")}</span>}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Pending todos */}
            <div className="home-card">
              <div className="home-card-header">
                <h2>✅ Pending Tasks</h2>
                <button className="btn-link" onClick={() => navigate("/todos")}>All tasks →</button>
              </div>
              {!data?.todos?.length ? (
                <div className="home-empty"><span>🎉</span><p>All caught up!</p></div>
              ) : (
                <div className="todo-quick-list">
                  {data.todos.map((t) => (
                    <div key={t.id} className="todo-quick-row">
                      <span className="todo-quick-dot"
                        style={{ background: t.priority === "high" ? "#ef4444" : t.priority === "medium" ? "#f59e0b" : "#22c55e" }} />
                      <span className="todo-quick-title">{t.title}</span>
                      {t.due_date && (
                        <span className="todo-quick-due">
                          {new Date(t.due_date).toLocaleDateString("en-IN", { day: "2-digit", month: "short" })}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

          </div>
        )}
      </main>
    </div>
  );
}