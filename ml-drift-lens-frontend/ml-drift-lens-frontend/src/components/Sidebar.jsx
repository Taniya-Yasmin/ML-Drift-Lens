import { NavLink } from "react-router-dom";

const icons = {
  dashboard: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <rect x="3" y="3" width="7" height="9" rx="1.5" />
      <rect x="14" y="3" width="7" height="5" rx="1.5" />
      <rect x="14" y="12" width="7" height="9" rx="1.5" />
      <rect x="3" y="16" width="7" height="5" rx="1.5" />
    </svg>
  ),
  drift: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M3 17l5-6 4 4 4-9 5 7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  models: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <ellipse cx="12" cy="6" rx="8" ry="3" />
      <path d="M4 6v6c0 1.7 3.6 3 8 3s8-1.3 8-3V6" />
      <path d="M4 12v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6" />
    </svg>
  ),
  alerts: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M12 2a6 6 0 00-6 6v3.5c0 .8-.3 1.6-.9 2.2L4 15h16l-1.1-1.3a3 3 0 01-.9-2.2V8a6 6 0 00-6-6z" />
      <path d="M9.5 19a2.5 2.5 0 005 0" />
    </svg>
  ),
  retraining: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M21 12a9 9 0 11-3-6.7" strokeLinecap="round" />
      <path d="M21 3v6h-6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  predictions: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M4 19h16" strokeLinecap="round" />
      <path d="M6 15l3-4 3 2 4-6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
};

const links = [
  { to: "/", label: "Overview", icon: "dashboard", end: true },
  { to: "/drift", label: "Drift Monitoring", icon: "drift" },
  { to: "/models", label: "Models", icon: "models" },
  { to: "/alerts", label: "Alerts", icon: "alerts" },
  { to: "/retraining", label: "Retraining", icon: "retraining" },
  { to: "/predictions", label: "Predictions", icon: "predictions" },
];

export default function Sidebar() {
  return (
    <aside className="sidebar">
      <div className="sidebar-brand">
        <div className="sidebar-brand-mark">
          <span className="dot" />
          ML-Drift-Lens
        </div>
        <div className="sidebar-brand-sub">MODEL WATCH / v1</div>
      </div>
      <nav className="sidebar-nav">
        {links.map((link) => (
          <NavLink
            key={link.to}
            to={link.to}
            end={link.end}
            className={({ isActive }) => `sidebar-link${isActive ? " active" : ""}`}
          >
            {icons[link.icon]}
            {link.label}
          </NavLink>
        ))}
      </nav>
      <div className="sidebar-foot">localhost:3000 · postgres</div>
    </aside>
  );
}
