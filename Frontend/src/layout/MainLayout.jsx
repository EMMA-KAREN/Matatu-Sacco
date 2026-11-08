import { useState } from "react";
import { Outlet, useOutlet } from "react-router-dom";
import Sidebar from "../components/Sidebar";
import SaccoHome from "../components/SaccoHome";
import useSacco from "../hooks/useSacco";
import { useAuth } from "../context/AuthContext";

export default function MainLayout({ children }) {
  const outlet = useOutlet();
  const { user } = useAuth();
  const sacco = useSacco();
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div className="flex min-h-dvh bg-slate-50">
      <Sidebar open={menuOpen} onClose={() => setMenuOpen(false)} />

      <div className="flex-1 min-w-0 flex flex-col">
        {/* Mobile top bar */}
        <header className="lg:hidden sticky top-0 z-30 flex items-center gap-3 bg-slate-900 text-white px-4 py-3 shadow">
          <button
            onClick={() => setMenuOpen(true)}
            aria-label="Open menu"
            aria-expanded={menuOpen}
            className="w-10 h-10 flex items-center justify-center rounded-lg bg-slate-800 text-lg active:bg-slate-700"
          >
            ☰
          </button>
          <span className="font-black text-sm truncate">{sacco.sacco_name}</span>
        </header>

     <main className="flex-1 min-w-0">
    {children ?? (outlet ? <Outlet /> : <SaccoHome user={user} showActions />)}
  </main>
      </div>
    </div>
  );
}