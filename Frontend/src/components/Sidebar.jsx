import { useEffect } from "react";
import { Link, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

const LINKS_BY_ROLE = {
  default: [["/dashboard", "🏠", "Dashboard"]],
  owner: [
    ["/dashboard", "🏠", "Dashboard"],
    ["/matatus", "🚐", "Matatus"],
    ["/members", "👥", "Members"],
  ],
  hr: [
    ["/dashboard", "🏠", "Dashboard"],
    ["/members", "👥", "Members"],
  ],
  admin: [
    ["/dashboard", "🏠", "Dashboard"],
  
  ],
};

export default function Sidebar({ open = false, onClose = () => {} }) {
  const { user, logout } = useAuth();
  const location = useLocation();
  const links = LINKS_BY_ROLE[user?.role] || LINKS_BY_ROLE.default;

  // Close drawer when navigating
  useEffect(() => {
    onClose();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname]);

  // Escape to close + lock body scroll while open
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  return (
    <>
      {/* Backdrop (mobile only) */}
      <div
        onClick={onClose}
        aria-hidden="true"
        className={`fixed inset-0 z-40 bg-black/50 lg:hidden transition-opacity duration-300 ${
          open ? "opacity-100" : "opacity-0 pointer-events-none"
        }`}
      />

      <aside
        className={`fixed lg:sticky top-0 left-0 z-50 w-72 max-w-[85vw] lg:w-64 h-dvh shrink-0 bg-slate-900 text-white flex flex-col border-r border-slate-800
          transform transition-transform duration-300 lg:translate-x-0
          ${open ? "translate-x-0" : "-translate-x-full"}`}
      >
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-lg bg-emerald-600 flex items-center justify-center font-black text-sm shrink-0">
              {(user?.name || "S")[0].toUpperCase()}
            </div>
            <div className="min-w-0">
              <p className="font-black text-sm truncate">Sacco System</p>
              <p className="text-xs text-slate-400 truncate">{user?.name || "SaccoFlow 360"}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Close menu"
            className="lg:hidden w-10 h-10 flex items-center justify-center rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 text-lg"
          >
            ✕
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 p-3 flex flex-col overflow-y-auto">
          <div className="space-y-1">
            {links.map(([to, icon, label]) => (
              <Link
                key={to}
                to={to}
                className={`flex items-center gap-3 px-3 py-3 rounded-lg text-sm font-semibold transition-all
                  ${location.pathname === to ? "bg-emerald-600 text-white shadow-md" : "text-slate-300 hover:bg-slate-800 hover:text-white"}`}
              >
                <span>{icon}</span> {label}
              </Link>
            ))}
          </div>

          {/* Image card: hidden on short screens so it never crowds the nav */}
          <div className="mt-auto pt-4 hidden sm:block [@media(max-height:600px)]:hidden">
            <div className="p-3 bg-slate-800/50 border border-slate-800 rounded-xl text-center space-y-2">
              <img
                src="https://images.unsplash.com/photo-1544620347-c4fd4a3d5957?auto=format&fit=crop&w=300&q=80"
                alt="Commuter fleet"
                loading="lazy"
                className="w-full h-24 object-cover rounded-lg opacity-75 hover:opacity-100 transition-opacity duration-300"
              />
              <div className="text-[10px] text-slate-400 font-medium">
                <span className="text-emerald-400 font-bold block uppercase tracking-wider text-[9px] mb-0.5">
                  Sacco Operations
                </span>
                Safe Commute, Trusted Service
              </div>
            </div>
          </div>
        </nav>

        {/* Footer */}
        <div className="p-3 border-t border-slate-800 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          {user ? (
            <button
              onClick={logout}
              className="w-full flex items-center gap-3 px-3 py-3 rounded-lg text-sm font-semibold text-red-300 hover:bg-red-950/30 transition-all"
            >
              🚪 Logout
            </button>
          ) : (
            <div className="space-y-1">
              <Link to="/login" className="block px-3 py-3 rounded-lg text-sm font-semibold text-slate-300 hover:bg-slate-800 transition-all">
                🔑 Login
              </Link>
              <Link to="/signup" className="block px-3 py-3 rounded-lg text-sm font-semibold text-slate-300 hover:bg-slate-800 transition-all">
                📝 Signup
              </Link>
            </div>
          )}
        </div>
      </aside>
    </>
  );
}