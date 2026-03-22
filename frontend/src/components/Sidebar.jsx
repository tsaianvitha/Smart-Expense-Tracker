import { useState, useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";

const NAV = [
  { path: "/home",      label: "🏠 Home"             },
  { path: "/dashboard", label: "📊 Dashboard"         },
  { path: "/insights",  label: "✨ AI Insights"       },
  { path: "/receipts",  label: "📷 Receipt Scanner"   },
  { path: "/recurring", label: "🔁 Recurring"         },
  { path: "/calendar",  label: "📅 Calendar"          },
  { path: "/todos",     label: "✅ To-Do List"        },
  { path: "/reminders", label: "🔔 Reminders"         },
];

export default function Sidebar({ onAddExpense }) {
  const location  = useLocation();
  const navigate  = useNavigate();
  const [open, setOpen] = useState(false);
  const user = JSON.parse(localStorage.getItem("user") || "{}");

  // Close sidebar on route change (mobile)
  useEffect(() => { setOpen(false); }, [location.pathname]);

  // Prevent body scroll when sidebar open on mobile
  useEffect(() => {
    if (open) document.body.style.overflow = "hidden";
    else      document.body.style.overflow = "";
    return () => { document.body.style.overflow = ""; };
  }, [open]);

  const handleLogout = () => {
    localStorage.clear();
    window.location.href = "/";
  };

  const handleNav = (path) => {
    navigate(path);
    setOpen(false);
  };

  return (
    <>
      {/* ── Mobile header bar ── */}
      <div className="mobile-header">
        <button className="hamburger" onClick={() => setOpen(true)} aria-label="Open menu">
          <span /><span /><span />
        </button>
        <div className="mobile-brand">
          <span>💰</span>
          <span>SpendSmart</span>
        </div>
        {location.pathname === "/dashboard" && onAddExpense && (
          <button className="mobile-add-btn" onClick={onAddExpense}>+</button>
        )}
      </div>

      {/* ── Overlay (mobile only) ── */}
      {open && (
        <div className="sidebar-overlay" onClick={() => setOpen(false)} />
      )}

      {/* ── Sidebar ── */}
      <aside className={`sidebar ${open ? "sidebar-open" : ""}`}>
        {/* Close button (mobile) */}
        <button className="sidebar-close" onClick={() => setOpen(false)}>✕</button>

        <div className="sidebar-brand">
          <span className="brand-icon">💰</span>
          <span className="brand-name">SpendSmart</span>
        </div>

        {user.name && (
          <div
            className={`sidebar-user ${location.pathname === "/profile" ? "active-user" : ""}`}
            onClick={() => handleNav("/profile")}
          >
            <div className="user-avatar">{user.name[0].toUpperCase()}</div>
            <div>
              <div className="user-name">{user.name}</div>
              <div className="user-email">{user.email}</div>
            </div>
          </div>
        )}

        {location.pathname === "/dashboard" && onAddExpense && (
          <button className="btn-add-expense" onClick={() => { onAddExpense(); setOpen(false); }}>
            + Add Expense
          </button>
        )}

        <nav className="sidebar-nav">
          {NAV.map(({ path, label }) => (
            <button
              key={path}
              className={`nav-item ${location.pathname === path ? "active" : ""}`}
              onClick={() => handleNav(path)}
            >
              {label}
            </button>
          ))}
        </nav>

        <button
          className={`nav-item ${location.pathname === "/profile" ? "active" : ""}`}
          onClick={() => handleNav("/profile")}
          style={{ marginTop: "auto" }}
        >
          ⚙️ Settings
        </button>

        <button className="btn-logout" onClick={handleLogout}>
          🚪 Logout
        </button>
      </aside>
    </>
  );
}