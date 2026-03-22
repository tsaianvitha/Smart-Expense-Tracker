import { useState, useEffect } from "react";
import Sidebar from "../components/Sidebar";
import api    from "../services/api";

const DAYS   = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["January","February","March","April","May","June",
                "July","August","September","October","November","December"];

const TYPE_STYLE = {
  expense:  { color: "#6366f1", bg: "#eef2ff" },
  reminder: { color: "#dc2626", bg: "#fef2f2" },
  todo:     { color: "#16a34a", bg: "#f0fdf4" },
};

export default function Calendar() {
  const today  = new Date();
  const [year,  setYear]  = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth());  // 0-indexed
  const [items, setItems] = useState({});    // { "YYYY-MM-DD": [event, ...] }
  const [selected, setSelected] = useState(null);  // "YYYY-MM-DD"
  const [loading, setLoading]   = useState(true);

  const monthStr = `${year}-${String(month + 1).padStart(2, "0")}`;

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const [expRes, remRes, todoRes] = await Promise.all([
          api.get("/expenses", { params: { month: monthStr, sort: "newest" } }),
          api.get("/reminders"),
          api.get("/todos"),
        ]);

        const map = {};

        const add = (dateStr, item) => {
          if (!dateStr) return;
          const key = dateStr.slice(0, 10);
          if (!map[key]) map[key] = [];
          map[key].push(item);
        };

        expRes.data.expenses.forEach((e) =>
          add(e.expense_date, {
            type: "expense",
            label: e.title,
            sub:   `₹${Number(e.amount).toLocaleString("en-IN")} · ${e.category}`,
            raw:   e,
          })
        );

        remRes.data.reminders.forEach((r) =>
          add(r.due_date, {
            type:  "reminder",
            label: r.title,
            sub:   r.amount ? `₹${Number(r.amount).toLocaleString("en-IN")}` : "Bill due",
            raw:   r,
          })
        );

        todoRes.data.todos.forEach((t) =>
          t.due_date && add(t.due_date, {
            type:  "todo",
            label: t.title,
            sub:   `Priority: ${t.priority}`,
            raw:   t,
          })
        );

        setItems(map);
      } catch { }
      finally { setLoading(false); }
    };
    load();
  }, [monthStr]);

  // ── Calendar grid math ────────────────────────────────────────────────────
  const firstDay   = new Date(year, month, 1).getDay();     // 0=Sun
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const todayStr    = today.toISOString().slice(0, 10);

  const prevMonth = () => { if (month === 0) { setYear(y => y - 1); setMonth(11); } else setMonth(m => m - 1); };
  const nextMonth = () => { if (month === 11) { setYear(y => y + 1); setMonth(0); } else setMonth(m => m + 1); };

  const cells = [];
  for (let i = 0; i < firstDay; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);

  const selectedItems = selected ? (items[selected] || []) : [];

  return (
    <div className="app-layout">
      <Sidebar />

      <main className="main-content">
        <div className="page-header">
          <h1>📅 Calendar</h1>
          {/* Legend */}
          <div className="cal-legend">
            {Object.entries(TYPE_STYLE).map(([type, s]) => (
              <span key={type} className="cal-legend-item">
                <span className="cal-legend-dot" style={{ background: s.color }} />
                {type.charAt(0).toUpperCase() + type.slice(1)}
              </span>
            ))}
          </div>
        </div>

        <div className="calendar-layout">
          {/* ── Calendar ── */}
          <div className="cal-panel">
            {/* Month nav */}
            <div className="cal-nav">
              <button className="btn-icon" onClick={prevMonth} style={{ fontSize: "1.2rem" }}>‹</button>
              <span className="cal-month-label">{MONTHS[month]} {year}</span>
              <button className="btn-icon" onClick={nextMonth} style={{ fontSize: "1.2rem" }}>›</button>
            </div>

            {loading ? (
              <div className="loading-state">Loading calendar…</div>
            ) : (
              <>
                {/* Day headers */}
                <div className="cal-grid">
                  {DAYS.map((d) => (
                    <div key={d} className="cal-day-header">{d}</div>
                  ))}

                  {/* Cells */}
                  {cells.map((day, idx) => {
                    if (!day) return <div key={`empty-${idx}`} className="cal-cell empty" />;

                    const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
                    const dayItems = items[dateStr] || [];
                    const isToday  = dateStr === todayStr;
                    const isSelected = dateStr === selected;

                    // Count by type for dots
                    const typeCounts = {};
                    dayItems.forEach((i) => { typeCounts[i.type] = (typeCounts[i.type] || 0) + 1; });

                    return (
                      <div
                        key={dateStr}
                        className={`cal-cell ${isToday ? "today" : ""} ${isSelected ? "selected" : ""} ${dayItems.length ? "has-items" : ""}`}
                        onClick={() => setSelected(isSelected ? null : dateStr)}
                      >
                        <span className="cal-day-num">{day}</span>
                        {dayItems.length > 0 && (
                          <div className="cal-dots">
                            {Object.entries(typeCounts).map(([type, count]) => (
                              <span
                                key={type}
                                className="cal-dot"
                                style={{ background: TYPE_STYLE[type].color }}
                                title={`${count} ${type}${count > 1 ? "s" : ""}`}
                              />
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </div>

          {/* ── Day detail panel ── */}
          <div className="cal-detail">
            {selected ? (
              <>
                <div className="cal-detail-header">
                  <h3>
                    {new Date(selected + "T12:00:00").toLocaleDateString("en-IN", {
                      weekday: "long", day: "numeric", month: "long",
                    })}
                  </h3>
                  <button className="modal-close" onClick={() => setSelected(null)}>✕</button>
                </div>

                {selectedItems.length === 0 ? (
                  <div className="cal-detail-empty">
                    <p>Nothing scheduled for this day.</p>
                  </div>
                ) : (
                  <div className="cal-detail-list">
                    {["expense", "reminder", "todo"].map((type) => {
                      const typeItems = selectedItems.filter((i) => i.type === type);
                      if (!typeItems.length) return null;
                      const s = TYPE_STYLE[type];
                      return (
                        <div key={type}>
                          <div className="cal-detail-section" style={{ color: s.color }}>
                            {type === "expense" ? "💸 Expenses" : type === "reminder" ? "🔔 Bills" : "✅ Tasks"}
                          </div>
                          {typeItems.map((item, i) => (
                            <div
                              key={i}
                              className="cal-item-row"
                              style={{ borderLeft: `3px solid ${s.color}`, background: s.bg }}
                            >
                              <div className="cal-item-label">{item.label}</div>
                              <div className="cal-item-sub">{item.sub}</div>
                            </div>
                          ))}
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Daily total if expenses exist */}
                {selectedItems.some((i) => i.type === "expense") && (
                  <div className="cal-detail-total">
                    Daily spend: ₹{selectedItems
                      .filter((i) => i.type === "expense")
                      .reduce((s, i) => s + Number(i.raw.amount), 0)
                      .toLocaleString("en-IN")}
                  </div>
                )}
              </>
            ) : (
              <div className="cal-detail-placeholder">
                <span>📅</span>
                <p>Click a date to see what's scheduled</p>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}