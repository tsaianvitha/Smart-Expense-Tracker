import { useState, useEffect } from "react";
import Sidebar from "../components/Sidebar";
import api     from "../services/api";

const RECURRENCE_LABELS = {
  none:    "One-time",
  weekly:  "Weekly",
  monthly: "Monthly",
  yearly:  "Yearly",
};

const EMPTY_FORM = {
  title: "", amount: "", due_date: "",
  recurrence: "none", notify_days_before: 3, note: "",
};

export default function Reminders() {
  const [reminders, setReminders] = useState([]);
  const [meta,      setMeta]      = useState({ total: 0, overdue: 0, due_soon: 0 });
  const [loading,   setLoading]   = useState(true);
  const [filter,    setFilter]    = useState("all");   // all | unpaid | paid | overdue
  const [showForm,  setShowForm]  = useState(false);
  const [editing,   setEditing]   = useState(null);
  const [form,      setForm]      = useState(EMPTY_FORM);
  const [saving,    setSaving]    = useState(false);
  const [error,     setError]     = useState("");

  // ── Fetch ──────────────────────────────────────────────────────────────────
  const fetchReminders = async () => {
    setLoading(true);
    try {
      const params = filter !== "all" ? { status: filter } : {};
      const res = await api.get("/reminders", { params });
      setReminders(res.data.reminders);
      setMeta({ total: res.data.total, overdue: res.data.overdue, due_soon: res.data.due_soon });
    } catch { }
    finally { setLoading(false); }
  };

  useEffect(() => { fetchReminders(); }, [filter]);

  // ── Form helpers ───────────────────────────────────────────────────────────
  const openAdd = () => {
    setEditing(null);
    setForm(EMPTY_FORM);
    setError("");
    setShowForm(true);
  };

  const openEdit = (reminder) => {
    setEditing(reminder);
    setForm({
      title:              reminder.title,
      amount:             reminder.amount || "",
      due_date:           reminder.due_date || "",
      recurrence:         reminder.recurrence,
      notify_days_before: reminder.notify_days_before,
      note:               reminder.note || "",
    });
    setError("");
    setShowForm(true);
  };

  const handleSave = async (e) => {
    e.preventDefault();
    if (!form.title.trim() || !form.due_date) { setError("Title and due date are required."); return; }
    setSaving(true);
    try {
      if (editing) {
        const res = await api.put(`/reminders/${editing.id}`, form);
        setReminders((prev) => prev.map((r) => r.id === editing.id ? res.data.reminder : r));
      } else {
        const res = await api.post("/reminders", form);
        setReminders((prev) => [res.data.reminder, ...prev]);
        setMeta((m) => ({ ...m, total: m.total + 1 }));
      }
      setShowForm(false);
    } catch (err) {
      setError(err.response?.data?.msg || "Save failed.");
    } finally {
      setSaving(false);
    }
  };

  const handleTogglePaid = async (reminder) => {
    const res = await api.patch(`/reminders/${reminder.id}/pay`);
    setReminders((prev) => {
      let updated = prev.map((r) => r.id === reminder.id ? res.data.reminder : r);
      // If a new recurring reminder was created, add it
      if (res.data.next_reminder) updated = [...updated, res.data.next_reminder];
      return updated;
    });
    fetchReminders(); // refresh counts
  };

  const handleDelete = async (id) => {
    if (!window.confirm("Delete this reminder?")) return;
    await api.delete(`/reminders/${id}`);
    setReminders((prev) => prev.filter((r) => r.id !== id));
  };

  // ── Card color ─────────────────────────────────────────────────────────────
  const cardClass = (r) => {
    if (r.is_paid)    return "reminder-card paid";
    if (r.is_overdue) return "reminder-card overdue";
    if (r.due_soon)   return "reminder-card due-soon";
    return "reminder-card";
  };

  return (
    <div className="app-layout">
      <Sidebar />

      <main className="main-content">
        <div className="page-header">
          <h1>🔔 Bill Reminders</h1>
          <button className="btn-primary" onClick={openAdd}>+ New Reminder</button>
        </div>

        {/* Stats */}
        <div className="summary-cards">
          <div className="summary-card blue">
            <div className="summary-label">Total Bills</div>
            <div className="summary-value">{meta.total}</div>
          </div>
          <div className="summary-card red">
            <div className="summary-label">Overdue</div>
            <div className="summary-value">{meta.overdue}</div>
          </div>
          <div className="summary-card yellow">
            <div className="summary-label">Due Soon</div>
            <div className="summary-value">{meta.due_soon}</div>
          </div>
        </div>

        {/* Filters */}
        <div className="filters-bar">
          {["all", "unpaid", "paid", "overdue"].map((f) => (
            <button
              key={f}
              className={`tab ${filter === f ? "active" : ""}`}
              onClick={() => setFilter(f)}
            >
              {f.charAt(0).toUpperCase() + f.slice(1)}
            </button>
          ))}
        </div>

        {/* List */}
        {loading ? (
          <div className="loading-state">Loading reminders…</div>
        ) : reminders.length === 0 ? (
          <div className="empty-state-box">
            <p>No reminders found. Click <strong>+ New Reminder</strong> to add one.</p>
          </div>
        ) : (
          <div className="reminder-list">
            {reminders.map((r) => (
              <div key={r.id} className={cardClass(r)}>
                <div className="reminder-left">
                  {/* Paid toggle */}
                  <button
                    className={`paid-toggle ${r.is_paid ? "is-paid" : ""}`}
                    onClick={() => handleTogglePaid(r)}
                    title={r.is_paid ? "Mark as unpaid" : "Mark as paid"}
                  >
                    {r.is_paid ? "✅" : "⭕"}
                  </button>
                </div>

                <div className="reminder-body">
                  <div className="reminder-title">{r.title}</div>

                  <div className="reminder-meta">
                    {r.amount && (
                      <span className="reminder-amount">
                        ₹ {Number(r.amount).toLocaleString("en-IN")}
                      </span>
                    )}
                    <span className={`reminder-due ${r.is_overdue ? "overdue-text" : ""}`}>
                      📅 {new Date(r.due_date).toLocaleDateString("en-IN", {
                        day: "2-digit", month: "short", year: "numeric",
                      })}
                      {r.is_overdue && " — Overdue!"}
                      {r.due_soon && !r.is_overdue && ` — Due in ${r.days_until_due}d`}
                    </span>
                    <span className="recurrence-badge">
                      🔁 {RECURRENCE_LABELS[r.recurrence]}
                    </span>
                  </div>

                  {r.note && <div className="reminder-note">{r.note}</div>}
                </div>

                <div className="action-btns">
                  <button className="btn-icon edit"   onClick={() => openEdit(r)}>✏️</button>
                  <button className="btn-icon delete" onClick={() => handleDelete(r.id)}>🗑️</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>

      {/* Modal */}
      {showForm && (
        <div className="modal-overlay" onClick={() => setShowForm(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>{editing ? "Edit Reminder" : "New Reminder"}</h2>
              <button className="modal-close" onClick={() => setShowForm(false)}>✕</button>
            </div>

            <form className="modal-form" onSubmit={handleSave}>
              {error && <div className="alert alert-error">{error}</div>}

              <div className="form-group">
                <label>Bill Name</label>
                <input
                  type="text"
                  placeholder="e.g. Electricity Bill, Netflix"
                  value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                  required
                />
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label>Amount (₹) — optional</label>
                  <input
                    type="number"
                    placeholder="0.00"
                    min="0"
                    step="0.01"
                    value={form.amount}
                    onChange={(e) => setForm({ ...form, amount: e.target.value })}
                  />
                </div>

                <div className="form-group">
                  <label>Due Date</label>
                  <input
                    type="date"
                    value={form.due_date}
                    onChange={(e) => setForm({ ...form, due_date: e.target.value })}
                    required
                  />
                </div>
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label>Recurrence</label>
                  <select value={form.recurrence} onChange={(e) => setForm({ ...form, recurrence: e.target.value })}>
                    <option value="none">One-time</option>
                    <option value="weekly">Weekly</option>
                    <option value="monthly">Monthly</option>
                    <option value="yearly">Yearly</option>
                  </select>
                </div>

                <div className="form-group">
                  <label>Notify Days Before</label>
                  <input
                    type="number"
                    min="0"
                    max="30"
                    value={form.notify_days_before}
                    onChange={(e) => setForm({ ...form, notify_days_before: e.target.value })}
                  />
                </div>
              </div>

              <div className="form-group">
                <label>Note (optional)</label>
                <textarea
                  placeholder="Extra details…"
                  value={form.note}
                  onChange={(e) => setForm({ ...form, note: e.target.value })}
                  rows={2}
                />
              </div>

              <div className="modal-actions">
                <button type="button" className="btn-secondary" onClick={() => setShowForm(false)}>Cancel</button>
                <button type="submit" className="btn-primary" disabled={saving}>
                  {saving ? "Saving…" : editing ? "Update" : "Add Reminder"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}