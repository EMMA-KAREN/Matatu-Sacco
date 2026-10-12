// Sidebar.jsx
import { Link, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

const LINKS_BY_ROLE = {
  // admin:          [["/dashboard", "🏠", "Admin Dashboard"], ["/matatus", "🚐", "Matatus"], ["/hr", "👥", "HR Dashboard"]],
  // director:       [["/dashboard", "🏠", "Admin Dashboard"], ["/matatus", "🚐", "Matatus"], ["/hr", "👥", "HR Dashboard"]],
  // hr:             [["/dashboard", "🏠", "HR Dashboard"], ["/matatus", "🚐", "Matatus"]],
  // stage_operator: [["/dashboard", "🏠", "Operator Portal"]],
  // owner:          [["/dashboard", "🏠", "My Dashboard"], ["/matatus", "🚐", "My Matatus"]],
  default:        [["/dashboard", "🏠", "Dashboard"]],
};

export default function Sidebar() {
  const { user, logout } = useAuth();
  const location = useLocation();
  const links = LINKS_BY_ROLE[user?.role] || LINKS_BY_ROLE.default;

  return (
    <div className="w-64 bg-slate-900 text-white flex flex-col h-screen sticky top-0 border-r border-slate-800 shrink-0">
      {/* Sidebar Header */}
      <div className="p-5 border-b border-slate-800">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-emerald-600 flex items-center justify-center font-black text-sm text-white shrink-0">
            {(user?.name || "S")[0].toUpperCase()}
          </div>
          <div className="overflow-hidden">
            <p className="font-black text-sm truncate text-white">Sacco System</p>
            <p className="text-xs text-slate-400 truncate">{user?.name || "SaccoFlow 360"}</p>
          </div>
        </div>
      </div>

      {/* Navigation Area */}
      <nav className="flex-1 p-3 space-y-1 flex flex-col">
        <div className="space-y-1">
          {links.map(([to, icon, label]) => (
            <Link key={to} to={to}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-semibold transition-all
                ${location.pathname === to ? "bg-emerald-600 text-white font-bold shadow-md" : "text-slate-300 hover:bg-slate-800 hover:text-white"}`}>
              <span>{icon}</span> {label}
            </Link>
          ))}
        </div>

        {/* Decorative Sacco Illustration Card (Fills vertical empty space beautifully) */}
        <div className="mt-auto p-3 bg-slate-850 border border-slate-800/80 rounded-xl text-center space-y-2">
          <img 
            src="https://images.unsplash.com/photo-1544620347-c4fd4a3d5957?auto=format&fit=crop&w=300&q=80" 
            alt="CommCommuter Fleet" 
            className="w-full h-24 object-cover rounded-lg opacity-75 hover:opacity-100 transition-opacity duration-300 shadow-inner"
          />
          <div className="text-[10px] text-slate-400 font-medium">
            <span className="text-emerald-400 font-bold block uppercase tracking-wider text-[9px] mb-0.5">Sacco Operations</span>
            Safe Commute, Trusted Service
          </div>
        </div>
      </nav>

      {/* Footer Block */}
      <div className="p-3 border-t border-slate-800">
        {user ? (
          <button onClick={logout}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-semibold text-red-300 hover:bg-red-950/30 transition-all">
            🚪 Logout
          </button>
        ) : (
          <div className="space-y-1">
            <Link to="/login" className="block px-3 py-2.5 rounded-lg text-sm font-semibold text-slate-300 hover:bg-slate-800 transition-all">🔑 Login</Link>
            <Link to="/signup" className="block px-3 py-2.5 rounded-lg text-sm font-semibold text-slate-300 hover:bg-slate-800 transition-all">📝 Signup</Link>
          </div>
        )}
      </div>
    </div>
  );
}