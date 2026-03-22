import { useLocation, useNavigate } from "react-router-dom";

const TABS = [
  { path: "/home",      icon: "🏠", label: "Home"      },
  { path: "/dashboard", icon: "📊", label: "Dashboard" },
  { path: "/todos",     icon: "✅", label: "Tasks"     },
  { path: "/reminders", icon: "🔔", label: "Bills"     },
  { path: "/insights",  icon: "✨", label: "AI"        },
];

export default function BottomNav() {
  const location = useLocation();
  const navigate = useNavigate();

  const authPaths = ["/", "/register"];
  if (authPaths.includes(location.pathname)) return null;

  return (
    <nav className="bottom-nav">
      {TABS.map(({ path, icon, label }) => (
        <button
          key={path}
          className={`bottom-nav-item ${location.pathname === path ? "active" : ""}`}
          onClick={() => navigate(path)}
        >
          <span className="bottom-nav-icon">{icon}</span>
          <span className="bottom-nav-label">{label}</span>
        </button>
      ))}
    </nav>
  );
}
