import { useState, useEffect } from "react";
import API from "../api";
import { useAuth } from "../context/AuthContext";
import LoanDashboard from "../components/LoanDashboard";
import Savings from "../components/Savings";

const TABS = [
  { key: "home",    label: "🏠 Overview" },
  { key: "savings", label: "🏦 Savings & Contributions" },
  { key: "loans",   label: "📋 Loans & Guarantors" },
];

function Toast({ msg, type, onClose }) {
  useEffect(() => { const t = setTimeout(onClose, 3000); return () => clearTimeout(t); }, [onClose]);
  return (
    <div className={`fixed top-5 right-5 z-50 px-5 py-3 rounded-lg shadow-2xl text-sm font-bold ${type === "error" ? "bg-red-500 text-white" : "bg-emerald-500 text-white"}`}>
      {msg}
    </div>
  );
}

export default function MemberDashboard() {
  const { user, logout } = useAuth();
  const [activeTab, setActiveTab] = useState("home");
  const [toast, setToast] = useState(null);
  const showToast = (msg, type = "success") => setToast({ msg, type });

  const token = localStorage.getItem("token");
  const headers = { Authorization: `Bearer ${token}` };

  const [statement, setStatement] = useState(null);

  useEffect(() => {
    if (user?.id) {
      fetch(`${API}/members/${user.id}/statement`, { headers })
        .then(r => r.json())
        .then(data => { if (!data.error) setStatement(data); })
        .catch(() => console.error("Could not load statement"));
    }
  }, [user]);

  const handleLogout = async (e) => {
    if (e) e.preventDefault();
    try {
      if (typeof logout === "function") await logout();
    } catch (err) {
      console.error("Logout error:", err);
    } finally {
      localStorage.removeItem("token");
      localStorage.removeItem("user");
      sessionStorage.clear();
      window.location.href = "/login";
    }
  };

  return (
    <div className="flex min-h-screen bg-gray-950 text-white font-mono">
      {toast && <Toast {...toast} onClose={() => setToast(null)} />}

      {/* SIDEBAR */}
      <div className="w-64 bg-gray-900 border-r border-gray-800 flex flex-col p-5 flex-shrink-0">
        <div className="mb-8">
          <div className="w-12 h-12 rounded-full bg-emerald-500 flex items-center justify-center text-black font-black text-lg mb-3">
            {user?.name?.[0] || "M"}
          </div>
          <p className="font-bold text-white">{user?.name}</p>
          <p className="text-xs text-gray-400 uppercase tracking-widest mt-1 capitalize">{user?.role || "Member"}</p>
          <p className="text-xs text-gray-500 mt-1">{user?.membership_no}</p>
        </div>

        <nav className="space-y-0.5 flex-1">
          {TABS.map(tab => (
            <button key={tab.key} onClick={() => setActiveTab(tab.key)}
              className={`w-full text-left px-4 py-3 rounded-lg text-sm transition-all ${
                activeTab === tab.key ? "bg-emerald-500 text-black font-bold" : "text-gray-400 hover:bg-gray-800 hover:text-white"
              }`}>
              {tab.label}
            </button>
          ))}
        </nav>

        <div className="pt-6 border-t border-gray-800">
          <button
            onClick={handleLogout}
            className="w-full px-3 py-2 rounded-lg text-sm bg-red-600 hover:bg-red-700 text-white font-bold transition-all text-center block"
          >
            🚪 Logout
          </button>
        </div>
      </div>

      {/* CONTENT AREA */}
      <div className="flex-1 overflow-y-auto p-8">
        
        {/* ══════ HOME / OVERVIEW ══════ */}
        {activeTab === "home" && (
          <div>
            <h1 className="text-3xl font-black mb-1 text-white">
              Welcome back, <span className="text-emerald-400">{user?.name?.split(" ")[0]}</span>
            </h1>
            <p className="text-gray-400 mb-8 text-sm">
              {new Date().toLocaleDateString("en-KE", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}
            </p>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
              <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
                <p className="text-gray-400 text-xs uppercase tracking-widest mb-1">Total Savings</p>
                <p className="text-3xl font-black text-emerald-400">
                  KES {statement?.totals?.total_savings?.toLocaleString() || 0}
                </p>
              </div>
              <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
                <p className="text-gray-400 text-xs uppercase tracking-widest mb-1">Sacco Contributions</p>
                <p className="text-3xl font-black text-blue-400">
                  KES {statement?.totals?.sacco_contributions?.toLocaleString() || 0}
                </p>
              </div>
              <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
                <p className="text-gray-400 text-xs uppercase tracking-widest mb-1">Loan Repayments Made</p>
                <p className="text-3xl font-black text-purple-400">
                  KES {statement?.totals?.loan_repayments?.toLocaleString() || 0}
                </p>
              </div>
            </div>

            <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
              <h3 className="font-bold text-white text-sm uppercase tracking-widest mb-4">Quick Financial Summary</h3>
              <p className="text-sm text-gray-400 mb-4">
                Use the sidebar options to manage your personal SACCO savings deposits, view your loan qualification metrics, or apply for new loans and review guarantor history.
              </p>
              <div className="flex gap-4">
                <button onClick={() => setActiveTab("savings")} className="bg-emerald-500 text-black font-bold px-4 py-2 rounded-lg text-sm hover:bg-emerald-400">
                  🏦 Deposit Savings
                </button>
                <button onClick={() => setActiveTab("loans")} className="bg-blue-600 text-white font-bold px-4 py-2 rounded-lg text-sm hover:bg-blue-500">
                  📋 View Loans
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ══════ SAVINGS ══════ */}
        {activeTab === "savings" && (
          <div>
            <Savings />
          </div>
        )}

        {/* ══════ LOANS ══════ */}
        {activeTab === "loans" && (
          <div>
            <LoanDashboard />
          </div>
        )}

      </div>
    </div>
  );
}