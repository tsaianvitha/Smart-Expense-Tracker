import { useState, useEffect } from "react";
import api from "../services/api";
import { CATEGORIES, CATEGORY_COLORS } from "../constants/categories";

const STATUS_STYLE = {
  ok:         { bar: "#22c55e", bg: "#f0fdf4", text: "#15803d" },
  warning:    { bar: "#f59e0b", bg: "#fffbeb", text: "#b45309" },
  exceeded:   { bar: "#ef4444", bg: "#fef2f2", text: "#b91c1c" },
  unbudgeted: { bar: "#94a3b8", bg: "#f8fafc", text: "#64748b" },
};

export default function BudgetManager() {
  const [budgets,    setBudgets]    = useState([]);
  const [unbudgeted, setUnbudgeted] = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [editing,    setEditing]    = useState(null);   // category string
  const [limitInput, setLimitInput] = useState("");
  const [saving,     setSaving]     = useState(false);
  const [newCat,     setNewCat]     = useState("");
  const [newLimit,   setNewLimit]   = useState("");

  const fetch = async () => {
    setLoading(true);
    try {
      const res = await api.get("/budgets");
      setBudgets(res.data.budgets);
      setUnbudgeted(res.data.unbudgeted);
    } catch { }
    finally { setLoading(false); }
  };

  useEffect(() => { fetch(); }, []);

  const handleSave = async (category, limit) => {
    setSaving(true);
    try {
      await api.post("/budgets", { category, monthly_limit: Number(limit) });
      setEditing(null);
      setNewCat("");
      setNewLimit("");
      await fetch();
    } catch { }
    finally { setSaving(false); }
  };

  const handleDelete = async (category) => {
    if (!window.confirm(`Remove budget for ${category}?`)) return;
    await api.delete(`/budgets/${category}`);
    await fetch();
  };

  const unsetCategories = CATEGORIES.filter(
    (c) => !budgets.find((b) => b.category === c)
  );

  if (loading) return <div className="loading-state">Loading budgets…</div>;

  return (
    <div className="budget-manager">
      {/* ── Active budgets ── */}
      {budgets.length === 0 && (
        <div className="empty-state-box" style={{ marginBottom: 20 }}>
          <p>No budgets set yet. Add one below to start tracking limits.</p>
        </div>
      )}

      <div className="budget-list">
        {budgets.map((b) => {
          const style = STATUS_STYLE[b.status];
          const pct   = Math.min(b.percent_used, 100);
          const isEditing = editing === b.category;

          return (
            <div
              key={b.category}
              className="budget-card"
              style={{ background: style.bg, borderLeft: `4px solid ${style.bar}` }}
            >
              <div className="budget-header">
                <div className="budget-cat-info">
                  <span
                    className="cat-dot"
                    style={{ background: CATEGORY_COLORS[b.category] }}
                  />
                  <span className="budget-category">{b.category}</span>
                  {b.status !== "ok" && (
                    <span className="budget-badge" style={{ background: style.bar + "22", color: style.text }}>
                      {b.status === "exceeded" ? "⚠ Exceeded" : "⚠ Warning"}
                    </span>
                  )}
                </div>
                <div className="budget-actions">
                  <button className="btn-icon edit" onClick={() => { setEditing(b.category); setLimitInput(b.monthly_limit); }}>✏️</button>
                  <button className="btn-icon delete" onClick={() => handleDelete(b.category)}>🗑️</button>
                </div>
              </div>

              {/* Progress bar */}
              <div className="progress-track">
                <div
                  className="progress-fill"
                  style={{ width: `${pct}%`, background: style.bar, transition: "width .5s ease" }}
                />
              </div>

              <div className="budget-meta">
                <span style={{ color: style.text }}>
                  ₹{b.spent.toLocaleString("en-IN")} spent
                </span>
                <span style={{ color: "#64748b" }}>
                  {b.percent_used}% of ₹{b.monthly_limit.toLocaleString("en-IN")}
                </span>
                <span style={{ color: b.remaining < 0 ? "#ef4444" : "#16a34a" }}>
                  {b.remaining < 0
                    ? `₹${Math.abs(b.remaining).toLocaleString("en-IN")} over`
                    : `₹${b.remaining.toLocaleString("en-IN")} left`}
                </span>
              </div>

              {/* Inline edit */}
              {isEditing && (
                <div className="budget-edit-row">
                  <input
                    type="number"
                    value={limitInput}
                    onChange={(e) => setLimitInput(e.target.value)}
                    placeholder="New limit"
                    style={{ width: 130 }}
                  />
                  <button
                    className="btn-primary"
                    style={{ padding: "6px 14px", fontSize: ".85rem" }}
                    onClick={() => handleSave(b.category, limitInput)}
                    disabled={saving}
                  >
                    {saving ? "…" : "Save"}
                  </button>
                  <button
                    className="btn-secondary"
                    style={{ padding: "6px 12px", fontSize: ".85rem" }}
                    onClick={() => setEditing(null)}
                  >
                    Cancel
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* ── Unbudgeted categories with spend ── */}
      {unbudgeted.length > 0 && (
        <div style={{ marginTop: 20 }}>
          <p className="section-label">Spending without a budget limit</p>
          <div className="budget-list">
            {unbudgeted.map((u) => (
              <div key={u.category} className="budget-card" style={{ background: "#f8fafc", borderLeft: "4px solid #94a3b8" }}>
                <div className="budget-header">
                  <div className="budget-cat-info">
                    <span className="cat-dot" style={{ background: CATEGORY_COLORS[u.category] }} />
                    <span className="budget-category">{u.category}</span>
                    <span className="budget-badge" style={{ background: "#e2e8f0", color: "#64748b" }}>No limit set</span>
                  </div>
                  <span style={{ fontSize: ".9rem", fontWeight: 600, color: "#1e293b" }}>
                    ₹{u.spent.toLocaleString("en-IN")} spent
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Add new budget ── */}
      {unsetCategories.length > 0 && (
        <div className="budget-add-form">
          <p className="section-label">Add a budget limit</p>
          <div className="budget-add-row">
            <select value={newCat} onChange={(e) => setNewCat(e.target.value)}>
              <option value="">Select category</option>
              {unsetCategories.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
            <input
              type="number"
              placeholder="Monthly limit (₹)"
              value={newLimit}
              onChange={(e) => setNewLimit(e.target.value)}
              min="1"
            />
            <button
              className="btn-primary"
              onClick={() => handleSave(newCat, newLimit)}
              disabled={!newCat || !newLimit || saving}
            >
              {saving ? "…" : "Set Budget"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}