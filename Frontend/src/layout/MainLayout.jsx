// MainLayout.jsx
import { useState, useEffect } from "react";
import { Outlet, useOutlet } from "react-router-dom";
import Sidebar from "../components/Sidebar";
import API from "../api"; // Adjust this path if your api.js is in another folder

export default function MainLayout() {
  const outlet = useOutlet();
  
  // Default values to display while the database settings load
  const [sacco, setSacco] = useState({
    sacco_name: "2KM SACCO",
    location: "Mombasa Terminal Main Office",
    po_box: "P.O. Box 12345 - 80100",
    phone_number: "+254 712 345 678"
  });

  // Fetch the custom SACCO configuration dynamically from the database
  useEffect(() => {
    const token = localStorage.getItem("token");
    if (token) {
      fetch(`${API}/settings/sacco`, {
        headers: { Authorization: `Bearer ${token}` }
      })
        .then(r => r.ok ? r.json() : null)
        .then(data => {
          if (data && !Array.isArray(data)) {
            setSacco(data);
          }
        })
        .catch(() => {});
    }
  }, []);

  return (
    <div className="flex min-h-screen bg-slate-50">
      {/* Outer Sidebar on the Left */}
      <Sidebar />
      
      {/* Main Content Area on the Right */}
      <div className="flex-1 overflow-y-auto">
        {outlet ? (
          /* Render the active child page (like /matatus, /savings, etc.) */
          <Outlet />
        ) : (
          /* Sacco Portal Home Content (Displays when on /dashboard or / with no sub-pages) */
          <div className="p-8 max-w-6xl mx-auto space-y-8 bg-slate-50 text-slate-800">
            
            {/* Welcome Banner */}
            <div className="bg-gradient-to-r from-emerald-600 to-teal-700 rounded-2xl p-8 text-white shadow-xl relative overflow-hidden">
              <div className="absolute right-0 top-0 opacity-10 transform translate-x-12 -translate-y-12 select-none pointer-events-none">
                <span className="text-[200px] font-black">🚐</span>
              </div>
              <div className="relative z-10 max-w-xl">
                <span className="bg-emerald-500/30 text-emerald-100 text-xs px-3 py-1 rounded-full font-bold uppercase tracking-wider">
                  Sacco Portal Home
                </span>
                <h1 className="text-3xl md:text-4xl font-black mt-3">Welcome to {sacco.sacco_name}</h1>
                <p className="text-emerald-100 text-sm mt-2 leading-relaxed">
                  Empowering matatu owners, drivers, conductors, and crew members through unified financial growth, safe operations, and community solidarity.
                </p>
              </div>
            </div>

            {/* Sacco Overview Information Grid */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-3">
                <div className="w-12 h-12 bg-emerald-50 rounded-xl flex items-center justify-center text-2xl">🏦</div>
                <h3 className="font-bold text-lg text-slate-800">Welfare & Savings</h3>
                <p className="text-sm text-slate-500 leading-relaxed">
                  Grow your personal savings account regularly to secure competitive low-interest loans. Your financial safety net is our absolute priority.
                </p>
              </div>
              <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-3">
                <div className="w-12 h-12 bg-blue-50 rounded-xl flex items-center justify-center text-2xl">📋</div>
                <h3 className="font-bold text-lg text-slate-800">Safe Fleet Standards</h3>
                <p className="text-sm text-slate-500 leading-relaxed">
                  We enforce strict compliance with national transport regulations. Ensure your driver and conductor certifications are always up-to-date.
                </p>
              </div>
              <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-3">
                <div className="w-12 h-12 bg-purple-50 rounded-xl flex items-center justify-center text-2xl">🤝</div>
                <h3 className="font-bold text-lg text-slate-800">Community Support</h3>
                <p className="text-sm text-slate-500 leading-relaxed">
                  Need assistance? Get in touch with our office administrators for support with routing, fleet assignments, or emergency services.
                </p>
              </div>
            </div>

            {/* Code of Conduct & Directory */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              
              {/* Guidelines */}
              <div className="lg:col-span-2 bg-white rounded-2xl border border-slate-200 p-6 shadow-sm space-y-4">
                <h2 className="text-xl font-black text-slate-800">📜 Sacco Code of Conduct</h2>
                <div className="space-y-3">
                  {[
                    { title: "Passenger Safety First", desc: "Always drive responsibly. Speed limits and traffic laws must be strictly observed to protect our valued clients." },
                    { title: "Professional Customer Care", desc: "Drivers and conductors must treat passengers with courtesy and maintain professional hygiene standards." },
                    { title: "Compliance Check", desc: "Ensure your vehicle possesses valid inspection stickers, licenses, and Sacco-registered routes before operating." },
                    { title: "Welfare Contributions", desc: "Consistent contributions to Sacco welfare schemes strengthen our community and increase your borrowing capacity." }
                  ].map((item, idx) => (
                    <div key={idx} className="flex gap-4 items-start border-b border-slate-100 pb-3 last:border-0 last:pb-0">
                      <span className="w-6 h-6 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center text-xs font-bold shrink-0 mt-0.5">
                        {idx + 1}
                      </span>
                      <div>
                        <h4 className="font-bold text-slate-800 text-sm">{item.title}</h4>
                        <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">{item.desc}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Directory Contact Card */}
              <div className="bg-slate-900 text-white rounded-2xl p-6 shadow-xl flex flex-col justify-between min-h-[350px]">
                <div className="space-y-4">
                  <span className="bg-slate-800 text-slate-300 text-[10px] px-2.5 py-1 rounded-full font-bold uppercase tracking-widest">
                    Official Directory
                  </span>
                  <h3 className="text-lg font-black">{sacco.sacco_name} Headquarters</h3>
                  <p className="text-xs text-slate-400 leading-relaxed">
                    For official documentation, license submissions, disputes, or welfare registrations, please contact our headquarters.
                  </p>
                </div>

                <div className="space-y-3 text-xs border-t border-slate-800 pt-4 mt-6">
                  <div className="flex items-center gap-3">
                    <span className="text-lg">📍</span>
                    <div>
                      <p className="text-slate-400 text-[10px] uppercase font-bold">Office Location</p>
                      <p className="font-semibold text-slate-200">{sacco.location || "Central Terminal Office"}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-lg">📬</span>
                    <div>
                      <p className="text-slate-400 text-[10px] uppercase font-bold">Postal Address</p>
                      <p className="font-semibold text-slate-200">{sacco.po_box || "P.O. Box 80100"}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-lg">📞</span>
                    <div>
                      <p className="text-slate-400 text-[10px] uppercase font-bold">Help Desk & Hotline</p>
                      <p className="font-semibold text-emerald-400">{sacco.phone_number || "+254 712 345 678"}</p>
                    </div>
                  </div>
                </div>
              </div>

            </div>
          </div>
        )}
      </div>
    </div>
  );
}