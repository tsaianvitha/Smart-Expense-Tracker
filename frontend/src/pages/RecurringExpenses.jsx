import { useState, useEffect } from "react";
import Sidebar from "../components/Sidebar";
import api    from "../services/api";
import { CATEGORIES, CATEGORY_COLORS } from "../constants/categories";

const FREQ_LABELS = {
  daily:   { label: "Daily",   icon: "📅", color: "#0ea5e9" },
  weekly:  { label: "Weekly",  icon: "📆", color: "#8b5cf6" },
  monthly: { label: "Monthly", icon: "🗓️", color: "#6366f1" },
  yearly:  { label: "Yearly",  icon: "📋", color: "#f59e0b" },
};

const EMPTY_FORM = {
  title: "", amount: "", category: "", frequency: "monthly",
  start_date: new Date().toISOString().split("T")[0],
  end_date: "", note: "",
};

function CountdownBadge({ days, isActive }) {
  if (!isActive) return <span className="rec-badge paused">⏸ Paused</span>;
  if (days < 0)  return <span className="rec-badge overdue">⚠ {Math.abs(days)}d overdue</span>;
  if (days === 0) return <span className="rec-badge today">Due today!</span>;
  if (days <= 3)  return <span className="rec-badge soon">In {days}d</span>;
  return <span className="rec-badge upcoming">In {days}d</span>;
}

export default function RecurringExpenses() {
  const [items,    setItems]    = useState([]);
  const [meta,     setMeta]     = useState({ total: 0, active: 0, overdue: 0 });
  const [loading,  setLoading]  = useState(true);
  const [filter,   setFilter]   = useState("all");
  const [showForm, setShowForm] = useState(false);
  const [editing,  setEditing]  = useState(null);
  const [form,     setForm]     = useState(EMPTY_FORM);
  const [saving,   setSaving]   = useState(false);
  const [error,    setError]    = useState("");
  const [processing, setProcessing] = useState(false);
  const [processResult, setProcessResult] = useState(null);

  const sym = JSON.parse(localStorage.getItem("user") || "{}").currency_sym || "₹";

  // ── Fetch ──────────────────────────────────────────────────
  const fetchItems = async () => {
    setLoading(true);
    try {
      const res = await api.get("/recurring", { params: { status: filter } });
      setItems(res.data.recurring);
      setMeta({ total: res.data.total, active: res.data.active, overdue: res.data.overdue });
    } catch { }
    finally { setLoading(false); }
  };

  useEffect(() => { fetchItems(); }, [filter]);

  // ── Form ───────────────────────────────────────────────────
  const openAdd = () => {
    setEditing(null);
    setForm(EMPTY_FORM);
    setError("");
    setShowForm(true);
  };

  const openEdit = (item) => {
    setEditing(item);
    setForm({
      title:      item.title,
      amount:     item.amount,
      category:   item.category,
      frequency:  item.frequency,
      start_date: item.start_date,
      end_date:   item.end_date || "",
      note:       item.note || "",
    });
    setError("");
    setShowForm(true);
  };

  const handleSave = async (e) => {
    e.preventDefault();
    if (!form.title || !form.amount || !form.category) {
      setError("Title, amount and category are required.");
      return;
    }
    setSaving(true);
    try {
      const payload = { ...form, end_date: form.end_date || null };
      if (editing) {
        const res = await api.put(`/recurring/${editing.id}`, payload);
        setItems((prev) => prev.map((i) => i.id === editing.id ? res.data.recurring : i));
      } else {
        const res = await api.post("/recurring", payload);
        setItems((prev) => [res.data.recurring, ...prev]);
        setMeta((m) => ({ ...m, total: m.total + 1, active: m.active + 1 }));
      }
      setShowForm(false);
    } catch (err) {
      setError(err.response?.data?.msg || "Save failed.");
    } finally {
      setSaving(false); }
  };

  const handleToggle = async (item) => {
    const res = await api.patch(`/recurring/${item.id}/toggle`);
    setItems((prev) => prev.map((i) => i.id === item.id ? res.data.recurring : i));
    fetchItems();
  };

  const handleDelete = async (id) => {
    if (!window.confirm("Delete this recurring expense?")) return;
    await api.delete(`/recurring/${id}`);
    setItems((prev) => prev.filter((i) => i.id !== id));
    fetchItems();
  };

  // ── Manual process trigger ─────────────────────────────────
  const handleProcess = async () => {
    setProcessing(true);
    setProcessResult(null);
    try {
      const res = await api.post("/recurring/process");
      setProcessResult(res.data);
      fetchItems();
    } catch (err) {
      setProcessResult({ msg: err.response?.data?.msg || "Failed", count: 0, created: [] });
    } finally {
      setProcessing(false);
    }
  };

  // ── Monthly cost ───────────────────────────────────────────
  const monthlyCost = items
    .filter((i) => i.is_active)
    .reduce((sum, i) => {
      const a = Number(i.amount);
      if (i.frequency === "daily")   return sum + a * 30;
      if (i.frequency === "weekly")  return sum + a * 4.33;
      if (i.frequency === "monthly") return sum + a;
      if (i.frequency === "yearly")  return sum + a / 12;
      return sum;
    }, 0);

  return (
    <div className="app-layout">
      <Sidebar />
      <main className="main-content">

        <div className="page-header">
          <div>
            <h1>🔁 Recurring Expenses</h1>
            <p style={{ color: "var(--text-muted)", fontSize: ".88rem", marginTop: 2 }}>
              Set up once — auto-added to your expenses on schedule
            </p>
          </div>
          <div style={{ display: "flex", gap: 10 }}>
            <button
              className="btn-secondary"
              onClick={handleProcess}
              disabled={processing}
              title="Process any overdue recurring expenses now"
            >
              {processing ? "Processing…" : "⚡ Process Now"}
            </button>
            <button className="btn-primary" onClick={openAdd}>
              + New Recurring
            </button>
          </div>
        </div>

        {/* Process result banner */}
        {processResult && (
          <div className={`alert ${processResult.count > 0 ? "alert-success" : "alert-info"}`}
            style={{ marginBottom: 16 }}>
            {processResult.count > 0 ? (
              <>
                ✅ {processResult.count} expense{processResult.count > 1 ? "s" : ""} auto-added:{" "}
                {processResult.created.map((c) => `${c.title} (${sym}${Number(c.amount).toLocaleString("en-IN")})`).join(", ")}
              </>
            ) : (
              "✓ Nothing due — all recurring expenses are up to date."
            )}
            <button
              style={{ marginLeft: 12, background: "none", border: "none", cursor: "pointer", fontWeight: 700 }}
              onClick={() => setProcessResult(null)}
            >✕</button>
          </div>
        )}

        {/* Stats */}
        <div className="summary-cards">
          <div className="summary-card blue">
            <div className="summary-label">Total</div>
            <div className="summary-value">{meta.total}</div>
            <div className="summary-sub">recurring expenses</div>
          </div>
          <div className="summary-card green">
            <div className="summary-label">Active</div>
            <div className="summary-value">{meta.active}</div>
            <div className="summary-sub">running now</div>
          </div>
          <div className="summary-card red">
            <div className="summary-label">Overdue</div>
            <div className="summary-value">{meta.overdue}</div>
            <div className="summary-sub">not yet processed</div>
          </div>
          <div className="summary-card purple">
            <div className="summary-label">Monthly cost</div>
            <div className="summary-value" style={{ fontSize: "1.4rem" }}>
              {sym}{Math.round(monthlyCost).toLocaleString("en-IN")}
            </div>
            <div className="summary-sub">from active items</div>
          </div>
        </div>

        {/* Filters */}
        <div className="filters-bar">
          {["all", "active", "paused"].map((f) => (
            <button key={f} className={`tab ${filter === f ? "active" : ""}`}
              onClick={() => setFilter(f)}>
              {f.charAt(0).toUpperCase() + f.slice(1)}
            </button>
          ))}
        </div>

        {/* List */}
        {loading ? (
          <div className="loading-state">Loading…</div>
        ) : items.length === 0 ? (
          <div className="empty-state-box">
            <p>No recurring expenses yet. Click <strong>+ New Recurring</strong> to set one up.</p>
            <p style={{ fontSize: ".83rem", color: "var(--text-muted)", marginTop: 8 }}>
              Examples: Rent, Netflix, Gym membership, Internet bill, Insurance
            </p>
          </div>
        ) : (
          <div className="rec-list">
            {items.map((item) => {
              const freq = FREQ_LABELS[item.frequency] || FREQ_LABELS.monthly;
              return (
                <div key={item.id} className={`rec-card ${!item.is_active ? "paused" : ""} ${item.is_overdue ? "overdue" : ""}`}>

                  {/* Left: category color bar */}
                  <div className="rec-color-bar"
                    style={{ background: CATEGORY_COLORS[item.category] || "#6366f1" }} />

                  {/* Main content */}
                  <div className="rec-body">
                    <div className="rec-top">
                      <div className="rec-title-row">
                        <span className="rec-title">{item.title}</span>
                        <span className="rec-freq-badge"
                          style={{ background: freq.color + "18", color: freq.color }}>
                          {freq.icon} {freq.label}
                        </span>
                      </div>
                      <div className="rec-amount">
                        {sym}{Number(item.amount).toLocaleString("en-IN")}
                        <span className="rec-per">/{item.frequency === "monthly" ? "mo"
                          : item.frequency === "yearly" ? "yr"
                          : item.frequency === "weekly" ? "wk" : "day"}</span>
                      </div>
                    </div>

                    <div className="rec-meta">
                      <span className="rec-cat-chip"
                        style={{ background: CATEGORY_COLORS[item.category] + "18",
                                 color: CATEGORY_COLORS[item.category] }}>
                        {item.category}
                      </span>

                      <CountdownBadge days={item.days_until_due} isActive={item.is_active} />

                      <span className="rec-next-date">
                        Next: {item.next_due_date
                          ? new Date(item.next_due_date + "T12:00:00").toLocaleDateString("en-IN", {
                              day: "2-digit", month: "short", year: "numeric",
                            })
                          : "—"}
                      </span>

                      {item.last_run_date && (
                        <span className="rec-last-run">
                          Last added: {new Date(item.last_run_date + "T12:00:00").toLocaleDateString("en-IN", {
                            day: "2-digit", month: "short",
                          })}
                        </span>
                      )}

                      {item.end_date && (
                        <span className="rec-end-date">
                          Ends: {new Date(item.end_date + "T12:00:00").toLocaleDateString("en-IN", {
                            day: "2-digit", month: "short", year: "numeric",
                          })}
                        </span>
                      )}
                    </div>

                    {item.note && <div className="rec-note">{item.note}</div>}
                  </div>

                  {/* Actions */}
                  <div className="rec-actions">
                    <button
                      className={`rec-toggle-btn ${item.is_active ? "active" : "paused"}`}
                      onClick={() => handleToggle(item)}
                      title={item.is_active ? "Pause" : "Resume"}
                    >
                      {item.is_active ? "⏸" : "▶"}
                    </button>
                    <button className="btn-icon edit"   onClick={() => openEdit(item)}>✏️</button>
                    <button className="btn-icon delete" onClick={() => handleDelete(item.id)}>🗑️</button>
                  </div>

                </div>
              );
            })}
          </div>
        )}

      </main>

      {/* ── Modal ── */}
      {showForm && (
        <div className="modal-overlay" onClick={() => setShowForm(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>{editing ? "Edit Recurring Expense" : "New Recurring Expense"}</h2>
              <button className="modal-close" onClick={() => setShowForm(false)}>✕</button>
            </div>

            <form className="modal-form" onSubmit={handleSave}>
              {error && <div className="alert alert-error">{error}</div>}

              <div className="form-group">
                <label>Title</label>
                <input type="text" placeholder="e.g. Netflix, Rent, Gym"
                  value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required />
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label>Amount ({sym})</label>
                  <input type="number" placeholder="0.00" min="0" step="0.01"
                    value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} required />
                </div>
                <div className="form-group">
                  <label>Frequency</label>
                  <select value={form.frequency} onChange={(e) => setForm({ ...form, frequency: e.target.value })}>
                    <option value="daily">Daily</option>
                    <option value="weekly">Weekly</option>
                    <option value="monthly">Monthly</option>
                    <option value="yearly">Yearly</option>
                  </select>
                </div>
              </div>

              <div className="form-group">
                <label>Category</label>
                <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} required>
                  <option value="">Select Category</option>
                  {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label>Start Date</label>
                  <input type="date" value={form.start_date}
                    onChange={(e) => setForm({ ...form, start_date: e.target.value })} required />
                </div>
                <div className="form-group">
                  <label>End Date (optional)</label>
                  <input type="date" value={form.end_date}
                    onChange={(e) => setForm({ ...form, end_date: e.target.value })} />
                </div>
              </div>

              {/* Next due date override when editing */}
              {editing && (
                <div className="form-group">
                  <label>Next Due Date</label>
                  <input type="date"
                    value={form.next_due_date || editing.next_due_date}
                    onChange={(e) => setForm({ ...form, next_due_date: e.target.value })} />
                </div>
              )}

              <div className="form-group">
                <label>Note (optional)</label>
                <textarea placeholder="e.g. Paid via credit card" value={form.note} rows={2}
                  onChange={(e) => setForm({ ...form, note: e.target.value })} />
              </div>

              {/* Monthly cost preview */}
              {form.amount && form.frequency && (
                <div className="rec-cost-preview">
                  <span>Monthly cost estimate:</span>
                  <strong>
                    {sym}{Math.round(
                      form.frequency === "daily"   ? Number(form.amount) * 30 :
                      form.frequency === "weekly"  ? Number(form.amount) * 4.33 :
                      form.frequency === "monthly" ? Number(form.amount) :
                      Number(form.amount) / 12
                    ).toLocaleString("en-IN")}
                  </strong>
                </div>
              )}

              <div className="modal-actions">
                <button type="button" className="btn-secondary" onClick={() => setShowForm(false)}>Cancel</button>
                <button type="submit" className="btn-primary" disabled={saving}>
                  {saving ? "Saving…" : editing ? "Update" : "Create"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}