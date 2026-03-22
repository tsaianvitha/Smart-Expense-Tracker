import { useState, useEffect } from "react";
import Sidebar from "../components/Sidebar";
import api     from "../services/api";

const PRIORITY_STYLE = {
  high:   { bg: "#fef2f2", color: "#dc2626", label: "🔴 High"   },
  medium: { bg: "#fffbeb", color: "#d97706", label: "🟡 Medium" },
  low:    { bg: "#f0fdf4", color: "#16a34a", label: "🟢 Low"    },
};

const EMPTY_FORM = { title: "", description: "", priority: "medium", due_date: "" };

export default function Todos() {
  const [todos,   setTodos]   = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter,  setFilter]  = useState("all");    // all | pending | completed
  const [priFilter, setPriFilter] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editing,  setEditing]  = useState(null);   // todo object or null
  const [form,     setForm]     = useState(EMPTY_FORM);
  const [saving,   setSaving]   = useState(false);
  const [error,    setError]    = useState("");

  // ── Fetch ──────────────────────────────────────────────────────────────────
  const fetchTodos = async () => {
    setLoading(true);
    try {
      const params = {};
      if (filter !== "all") params.status = filter;
      if (priFilter)        params.priority = priFilter;
      params.sort = "priority";
      const res = await api.get("/todos", { params });
      setTodos(res.data.todos);
    } catch { /* interceptor handles 401 */ }
    finally { setLoading(false); }
  };

  useEffect(() => { fetchTodos(); }, [filter, priFilter]);

  // ── Form helpers ───────────────────────────────────────────────────────────
  const openAdd = () => {
    setEditing(null);
    setForm(EMPTY_FORM);
    setError("");
    setShowForm(true);
  };

  const openEdit = (todo) => {
    setEditing(todo);
    setForm({
      title:       todo.title,
      description: todo.description || "",
      priority:    todo.priority,
      due_date:    todo.due_date || "",
    });
    setError("");
    setShowForm(true);
  };

  const handleSave = async (e) => {
    e.preventDefault();
    if (!form.title.trim()) { setError("Title is required."); return; }
    setSaving(true);
    try {
      if (editing) {
        const res = await api.put(`/todos/${editing.id}`, form);
        setTodos((prev) => prev.map((t) => t.id === editing.id ? res.data.todo : t));
      } else {
        const res = await api.post("/todos", form);
        setTodos((prev) => [res.data.todo, ...prev]);
      }
      setShowForm(false);
    } catch (err) {
      setError(err.response?.data?.msg || "Save failed.");
    } finally {
      setSaving(false);
    }
  };

  const handleToggle = async (todo) => {
    const res = await api.patch(`/todos/${todo.id}/toggle`);
    setTodos((prev) => prev.map((t) => t.id === todo.id ? res.data.todo : t));
  };

  const handleDelete = async (id) => {
    if (!window.confirm("Delete this task?")) return;
    await api.delete(`/todos/${id}`);
    setTodos((prev) => prev.filter((t) => t.id !== id));
  };

  // ── Stats ──────────────────────────────────────────────────────────────────
  const total     = todos.length;
  const completed = todos.filter((t) => t.is_completed).length;
  const pending   = total - completed;

  return (
    <div className="app-layout">
      <Sidebar />

      <main className="main-content">
        <div className="page-header">
          <h1>✅ To-Do List</h1>
          <button className="btn-primary" onClick={openAdd}>+ New Task</button>
        </div>

        {/* Stats */}
        <div className="summary-cards">
          <div className="summary-card blue">
            <div className="summary-label">Total Tasks</div>
            <div className="summary-value">{total}</div>
          </div>
          <div className="summary-card green">
            <div className="summary-label">Completed</div>
            <div className="summary-value">{completed}</div>
          </div>
          <div className="summary-card purple">
            <div className="summary-label">Pending</div>
            <div className="summary-value">{pending}</div>
          </div>
        </div>

        {/* Filters */}
        <div className="filters-bar">
          {["all", "pending", "completed"].map((f) => (
            <button
              key={f}
              className={`tab ${filter === f ? "active" : ""}`}
              onClick={() => setFilter(f)}
            >
              {f.charAt(0).toUpperCase() + f.slice(1)}
            </button>
          ))}
          <select value={priFilter} onChange={(e) => setPriFilter(e.target.value)}>
            <option value="">All Priorities</option>
            <option value="high">High</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
          </select>
        </div>

        {/* List */}
        {loading ? (
          <div className="loading-state">Loading tasks…</div>
        ) : todos.length === 0 ? (
          <div className="empty-state-box">
            <p>No tasks found. Click <strong>+ New Task</strong> to add one.</p>
          </div>
        ) : (
          <div className="todo-list">
            {todos.map((todo) => {
              const pri = PRIORITY_STYLE[todo.priority];
              const overdue = todo.due_date && !todo.is_completed &&
                new Date(todo.due_date) < new Date(new Date().toDateString());

              return (
                <div key={todo.id} className={`todo-card ${todo.is_completed ? "completed" : ""}`}>
                  <input
                    type="checkbox"
                    checked={todo.is_completed}
                    onChange={() => handleToggle(todo)}
                    className="todo-checkbox"
                  />

                  <div className="todo-body">
                    <div className="todo-title">{todo.title}</div>
                    {todo.description && (
                      <div className="todo-desc">{todo.description}</div>
                    )}
                    <div className="todo-meta">
                      <span
                        className="priority-badge"
                        style={{ background: pri.bg, color: pri.color }}
                      >
                        {pri.label}
                      </span>

                      {todo.due_date && (
                        <span className={`due-date ${overdue ? "overdue" : ""}`}>
                          📅 {new Date(todo.due_date).toLocaleDateString("en-IN", {
                            day: "2-digit", month: "short", year: "numeric",
                          })}
                          {overdue && " — Overdue!"}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="action-btns">
                    <button className="btn-icon edit"   onClick={() => openEdit(todo)}>✏️</button>
                    <button className="btn-icon delete" onClick={() => handleDelete(todo.id)}>🗑️</button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>

      {/* Modal */}
      {showForm && (
        <div className="modal-overlay" onClick={() => setShowForm(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>{editing ? "Edit Task" : "New Task"}</h2>
              <button className="modal-close" onClick={() => setShowForm(false)}>✕</button>
            </div>

            <form className="modal-form" onSubmit={handleSave}>
              {error && <div className="alert alert-error">{error}</div>}

              <div className="form-group">
                <label>Title</label>
                <input
                  type="text"
                  placeholder="What needs to be done?"
                  value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                  required
                />
              </div>

              <div className="form-group">
                <label>Description (optional)</label>
                <textarea
                  placeholder="More details…"
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  rows={2}
                />
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label>Priority</label>
                  <select value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })}>
                    <option value="low">🟢 Low</option>
                    <option value="medium">🟡 Medium</option>
                    <option value="high">🔴 High</option>
                  </select>
                </div>

                <div className="form-group">
                  <label>Due Date (optional)</label>
                  <input
                    type="date"
                    value={form.due_date}
                    onChange={(e) => setForm({ ...form, due_date: e.target.value })}
                  />
                </div>
              </div>

              <div className="modal-actions">
                <button type="button" className="btn-secondary" onClick={() => setShowForm(false)}>Cancel</button>
                <button type="submit" className="btn-primary" disabled={saving}>
                  {saving ? "Saving…" : editing ? "Update Task" : "Add Task"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}