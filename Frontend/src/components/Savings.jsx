import { useState, useEffect, useCallback } from "react";
import API from "../api";
import { useAuth } from "../context/AuthContext";

const PAYMENT_METHODS = [
  { key: "paybill", label: "📱 M-Pesa Paybill" },
  { key: "till", label: "🏪 M-Pesa Buy Goods Till" },
  { key: "pochi", label: "👤 Pochi La Biashara" },
  { key: "send_money", label: "💸 Send Money (M-Pesa)" },
  { key: "bank", label: "🏦 Direct Bank Transfer" },
  { key: "cash", label: "💵 Direct Cash at Sacco Office" }
];

export default function Savings() {
  const { user } = useAuth();
  const [activeSubTab, setActiveSubTab] = useState("dashboard"); // 'dashboard', 'history', 'desk', 'matatuOversight', 'matatuPool', 'reports'

  const [personalBalance, setPersonalBalance] = useState(0);
  const [matatuContributed, setMatatuContributed] = useState(0);
  const [personalHistory, setPersonalHistory] = useState([]);
  const [matatus, setMatatus] = useState([]);
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  const isAdministrativeRole = ["hr", "admin", "director"].includes(user?.role);
  const isAdminOrDirector = ["admin", "director"].includes(user?.role);
  const isCrewOrOwner = ["driver", "conductor", "owner"].includes(user?.role);

  // Deposit Form State (For normal members: Drivers, Conductors, Owners)
  const [depositForm, setDepositForm] = useState({
    amount: "",
    payment_method: "paybill",
    mpesa_code: "",
    description: "",
    date: new Date().toISOString().split("T")[0],
    matatu_id: "",
    proof_file: null
  });

  // HR Manual Contribution Form State
  const [hrManualForm, setHrManualForm] = useState({
    member_id: "",
    matatu_id: "",
    amount: "",
    payment_method: "cash",
    mpesa_code: "",
    description: "",
    date: new Date().toISOString().split("T")[0],
    proof_file: null
  });
  const [memberSearch, setMemberSearch] = useState("");
  const [showMemberDrop, setShowMemberDrop] = useState(false);

  // HR Prompt Form State
  const [promptForm, setPromptForm] = useState({
    member_id: "",
    message: "Dear Member, please update and deposit your regular Sacco savings/shares to maintain your loan limits."
  });
  const [promptSearch, setPromptSearch] = useState("");
  const [showPromptDrop, setShowPromptDrop] = useState(false);

  // Approvals Desk state
  const [pendingSavings, setPendingSavings] = useState([]);

  // Reports Engine state
  const [reportPeriod, setReportPeriod] = useState("monthly");
  const [reportData, setReportData] = useState(null);
  const [reportFilterMember, setReportFilterMember] = useState("");
  const [reportFilterMatatu, setReportFilterMatatu] = useState("");

  // Matatu Savings list for Admin Oversight
  const [matatuSavingsAdmin, setMatatuSavingsAdmin] = useState([]);

  // Matatu savings pool (driver / conductor / owner view)
  const [poolMatatuId, setPoolMatatuId] = useState("");
  const [matatuPool, setMatatuPool] = useState(null);

  const token = localStorage.getItem("token");
  const headers = { Authorization: `Bearer ${token}` };

  const plateOf = (id) => {
    const m = matatus.find((x) => x.id === id);
    return m ? m.plate : `#${id}`;
  };

  const triggerToast = (msg, isError = false) => {
    if (isError) {
      setErrorMessage(msg);
      setTimeout(() => setErrorMessage(""), 4000);
    } else {
      setSuccessMessage(msg);
      setTimeout(() => setSuccessMessage(""), 4000);
    }
  };

  const fetchMySavings = useCallback(async () => {
    if (isAdministrativeRole) return; // Admins/HR do not have personal statements
    setLoading(true);
    try {
      const res = await fetch(`${API}/savings/my`, { headers });
      if (res.ok) {
        const data = await res.json();
        setPersonalBalance(data.balance || 0);          // personal only, approved only
        setMatatuContributed(data.matatu_contributed || 0); // info only
        setPersonalHistory(data.transactions || []);
      }
    } catch (e) {
      triggerToast("Failed to load balance metrics", true);
    }
    setLoading(false);
  }, [isAdministrativeRole]);

  const fetchMatatus = useCallback(async () => {
    try {
      const res = await fetch(`${API}/matatus/plates`, { headers });
      if (res.ok) setMatatus(await res.json());
    } catch (e) {}
  }, []);

  const fetchMembers = useCallback(async () => {
    try {
      const res = await fetch(`${API}/members`, { headers });
      if (res.ok) setMembers(await res.json());
    } catch (e) {}
  }, []);

  const fetchPendingSavings = useCallback(async () => {
    if (!isAdministrativeRole) return;
    try {
      const res = await fetch(`${API}/savings/pending`, { headers });
      if (res.ok) setPendingSavings(await res.json());
    } catch (e) {}
  }, [isAdministrativeRole]);

  const fetchMatatuSavingsAdmin = useCallback(async () => {
    if (!isAdminOrDirector) return;
    try {
      const res = await fetch(`${API}/admin/matatu-savings`, { headers });
      if (res.ok) setMatatuSavingsAdmin(await res.json());
    } catch (e) {}
  }, [isAdminOrDirector]);

  const fetchMatatuPool = useCallback(async (id) => {
    if (!id) return;
    try {
      const res = await fetch(`${API}/savings/matatu/${id}`, { headers });
      if (res.ok) setMatatuPool(await res.json());
    } catch (e) {}
  }, []);

  const fetchReport = useCallback(async () => {
    setLoading(true);
    let url = `${API}/savings/reports?period=${reportPeriod}`;
    if (reportFilterMember) url += `&member_id=${reportFilterMember}`;
    if (reportFilterMatatu) url += `&matatu_id=${reportFilterMatatu}`;
    try {
      const res = await fetch(url, { headers });
      if (res.ok) setReportData(await res.json());
    } catch (e) {
      triggerToast("Error producing report", true);
    }
    setLoading(false);
  }, [reportPeriod, reportFilterMember, reportFilterMatatu]);

  useEffect(() => {
    fetchMySavings();
    fetchMatatus();
    if (isAdministrativeRole) {
      fetchMembers();
      fetchPendingSavings();
    }
    if (isAdminOrDirector) {
      fetchMatatuSavingsAdmin();
    }
  }, [fetchMySavings, fetchMatatus, fetchMembers, fetchPendingSavings, fetchMatatuSavingsAdmin, isAdministrativeRole, isAdminOrDirector]);

  // Default the pool view to the first matatu available to this user
  useEffect(() => {
    if (isCrewOrOwner && matatus.length && !poolMatatuId) {
      setPoolMatatuId(String(matatus[0].id));
    }
  }, [matatus, isCrewOrOwner, poolMatatuId]);

  // Load the pool when the tab is opened or the matatu changes
  useEffect(() => {
    if (poolMatatuId && activeSubTab === "matatuPool") fetchMatatuPool(poolMatatuId);
  }, [poolMatatuId, activeSubTab, fetchMatatuPool]);

  const handleDepositSubmit = async (e) => {
    e.preventDefault();
    if (!depositForm.amount || parseFloat(depositForm.amount) <= 0) {
      return triggerToast("Specify a valid deposit amount", true);
    }
    if (depositForm.payment_method !== "cash" && !depositForm.mpesa_code && !depositForm.proof_file) {
      return triggerToast("M-Pesa code or Proof document upload is required", true);
    }

    setLoading(true);
    const fd = new FormData();
    fd.append("amount", depositForm.amount);
    fd.append("payment_method", depositForm.payment_method);
    fd.append("mpesa_code", depositForm.mpesa_code);
    fd.append("description", depositForm.description || `Deposit via ${depositForm.payment_method}`);
    fd.append("date", depositForm.date);
    if (depositForm.matatu_id) fd.append("matatu_id", depositForm.matatu_id);
    if (depositForm.proof_file) fd.append("proof_file", depositForm.proof_file);

    try {
      const res = await fetch(`${API}/savings/deposit`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: fd
      });
      if (res.ok) {
        triggerToast(
          depositForm.matatu_id
            ? "Matatu savings request queued! It will appear in the matatu account after final Admin approval."
            : "Savings request successfully queued! Verified money will reflect after Sacco clearance."
        );
        setDepositForm({
          amount: "", payment_method: "paybill", mpesa_code: "",
          description: "", date: new Date().toISOString().split("T")[0],
          matatu_id: "", proof_file: null
        });
        fetchMySavings();
      } else {
        const err = await res.json();
        triggerToast(err.error || "Deposit failed", true);
      }
    } catch (e) {
      triggerToast("Error connecting to storage gateway", true);
    }
    setLoading(false);
  };

  const handleHrManualSubmit = async (e) => {
    e.preventDefault();
    if (!hrManualForm.member_id || !hrManualForm.amount || !hrManualForm.proof_file) {
      return triggerToast("Member, Amount, and Proof of Payment are strictly mandatory.", true);
    }

    setLoading(true);
    const fd = new FormData();
    fd.append("member_id", hrManualForm.member_id);
    fd.append("amount", hrManualForm.amount);
    fd.append("payment_method", hrManualForm.payment_method);
    fd.append("mpesa_code", hrManualForm.mpesa_code);
    fd.append("description", hrManualForm.description || `Manual addition by ${user?.role}`);
    fd.append("date", hrManualForm.date);
    fd.append("proof_file", hrManualForm.proof_file);
    if (hrManualForm.matatu_id) fd.append("matatu_id", hrManualForm.matatu_id);

    try {
      const res = await fetch(`${API}/savings/hr-add`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: fd
      });
      if (res.ok) {
        triggerToast("Manual override entry logged. Sent to Admin final queue for sign-off.");
        setHrManualForm({
          member_id: "", matatu_id: "", amount: "", payment_method: "cash", mpesa_code: "",
          description: "", date: new Date().toISOString().split("T")[0], proof_file: null
        });
        setMemberSearch("");
        fetchPendingSavings();
        if (isAdminOrDirector) fetchMatatuSavingsAdmin();
      } else {
        const err = await res.json();
        triggerToast(err.error || "Operation failed", true);
      }
    } catch (e) {
      triggerToast("Upload failure", true);
    }
    setLoading(false);
  };

  const handleSendPrompt = async (e) => {
    e.preventDefault();
    if (!promptForm.member_id) return triggerToast("Select a member first", true);

    setLoading(true);
    try {
      const res = await fetch(`${API}/savings/prompt`, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify(promptForm)
      });
      if (res.ok) {
        triggerToast("Alert prompt sent ✓");
        setPromptForm({ member_id: "", message: promptForm.message });
        setPromptSearch("");
      }
    } catch (e) {
      triggerToast("Error sending notification reminder", true);
    }
    setLoading(false);
  };

  const handleHrRecommend = async (id) => {
    if (!window.confirm("Verify and forward this savings entry to Admin?")) return;
    try {
      const res = await fetch(`${API}/savings/${id}/hr-recommend`, { method: "PUT", headers });
      if (res.ok) {
        triggerToast("First approval verified. Forwarded to Admin final queue.");
        fetchPendingSavings();
      } else {
        const err = await res.json();
        triggerToast(err.error || "Action failed", true);
      }
    } catch (e) {
      triggerToast("Action failed", true);
    }
  };

  const handleAdminApprove = async (id) => {
    if (!window.confirm("Grant final sign-off and credit this savings transaction?")) return;
    try {
      const res = await fetch(`${API}/savings/${id}/admin-approve`, { method: "PUT", headers });
      if (res.ok) {
        triggerToast("Sacco final sign-off complete. Funds credited.");
        fetchPendingSavings();
        fetchMatatuSavingsAdmin();
        fetchMySavings();
        if (poolMatatuId) fetchMatatuPool(poolMatatuId);
      } else {
        const err = await res.json();
        triggerToast(err.error || "Final approval failed", true);
      }
    } catch (e) {
      triggerToast("Action failed", true);
    }
  };

  const handleReject = async (id) => {
    if (!window.confirm("Reject this savings entry? This will flag it as 'rejected' on the member statement.")) return;
    try {
      const res = await fetch(`${API}/savings/${id}/reject`, { method: "PUT", headers });
      if (res.ok) {
        triggerToast("Savings request rejected.");
        fetchPendingSavings();
        fetchMatatuSavingsAdmin();
      }
    } catch (e) {
      triggerToast("Action failed", true);
    }
  };

  const exportCSV = () => {
    if (!reportData || !reportData.transactions.length) return;
    let csv = "ID,Member ID,Matatu ID,Amount (KES),Type,Method,Ref Code,Date,Description\n";
    reportData.transactions.forEach((t) => {
      csv += `${t.id},${t.member_id},${t.matatu_id || ""},${t.amount},${t.transaction_type},${t.payment_method},${t.mpesa_code},${t.date},"${t.description}"\n`;
    });
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.setAttribute("download", `Sacco_Savings_Report_${reportPeriod}.csv`);
    link.click();
  };

  return (
    <div className="p-6 bg-slate-900 min-h-screen text-slate-100 font-sans rounded-2xl border border-slate-800">

      {/* Toasts */}
      {(errorMessage || successMessage) && (
        <div
          className={`fixed top-5 right-5 z-[60] max-w-sm px-5 py-3 rounded-xl shadow-2xl text-xs font-bold ${
            errorMessage ? "bg-red-500 text-white" : "bg-emerald-500 text-slate-950"
          }`}
        >
          {errorMessage || successMessage}
        </div>
      )}

      <div className="max-w-6xl mx-auto space-y-6">

        {/* Module Header */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between border-b border-slate-800 pb-5">
          <div>
            <h1 className="text-3xl font-black tracking-tight text-white">🏦 Sacco Savings Portfolio</h1>
            <p className="text-xs text-slate-400 mt-1">Manage, verify, and generate certified weekly, monthly, and yearly statements.</p>
          </div>

          <div className="mt-4 md:mt-0 flex flex-wrap gap-1 bg-slate-800 p-1 rounded-xl">
            {[
              { key: "dashboard", label: "📊 Dashboard" },
              { key: "history", label: "🕒 My History" },
              { key: "desk", label: "🛡️ Approvals Desk", roles: ["hr", "admin", "director"] },
              { key: "matatuOversight", label: "🚐 Matatu Audit Desk", roles: ["admin", "director"] },
              { key: "matatuPool", label: "🚐 Matatu Savings", roles: ["driver", "conductor", "owner"] },
              { key: "reports", label: "📋 Reports Engine" }
            ].map((t) => {
              if (t.roles && !t.roles.includes(user?.role)) return null;
              return (
                <button
                  key={t.key}
                  onClick={() => setActiveSubTab(t.key)}
                  className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${
                    activeSubTab === t.key ? "bg-emerald-500 text-slate-950 shadow" : "text-slate-300 hover:bg-slate-700 hover:text-white"
                  }`}
                >
                  {t.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* ==================================================================== */}
        {/* SUBTAB 1: SAVINGS DASHBOARD */}
        {/* ==================================================================== */}
        {activeSubTab === "dashboard" && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

            <div className="lg:col-span-1 space-y-6">
              {!isAdministrativeRole ? (
                <div className="bg-gradient-to-br from-emerald-800 to-teal-900 border border-emerald-600/30 rounded-2xl p-6 shadow-xl text-white">
                  <span className="text-emerald-300 text-xs font-bold uppercase tracking-wider block">Your Personal Savings Balance</span>
                  <p className="text-4xl font-extrabold tracking-tight mt-1">KES {personalBalance.toLocaleString()}</p>
                  <div className="mt-4 p-3 bg-emerald-950/40 rounded-xl border border-emerald-500/20 text-[11px] leading-relaxed text-emerald-100">
                    🛡️ This balance only reflects your personal contributions fully approved and cleared by Sacco Administration. Money saved to a matatu is not counted here.
                  </div>
                  {isCrewOrOwner && matatuContributed !== 0 && (
                    <div className="mt-3 p-3 bg-blue-950/40 rounded-xl border border-blue-500/20 text-[11px] text-blue-100">
                      🚐 Contributed to matatu accounts (approved): <b>KES {matatuContributed.toLocaleString()}</b>
                      <span className="block text-blue-300/80">Held in the matatu's savings account, not your personal balance.</span>
                    </div>
                  )}
                </div>
              ) : (
                <div className="bg-slate-800 border border-slate-700 rounded-2xl p-6 shadow-xl text-slate-300 text-center">
                  <span className="text-3xl block">👔</span>
                  <p className="font-extrabold mt-2 text-white">Administrative Portal</p>
                  <p className="text-xs text-slate-400 mt-1">Sacco Staff and Admins cannot lodge personal deposits. Use the Approvals or Manual override panels.</p>
                </div>
              )}

              {/* Sacco Payment Instructions Card */}
              <div className="bg-slate-800 rounded-2xl border border-slate-700 p-5 space-y-4">
                <h3 className="font-extrabold text-sm text-slate-200">📋 Sacco Payment Directories</h3>
                <div className="space-y-3 text-[11px]">
                  <div className="border-b border-slate-700/50 pb-2">
                    <p className="text-slate-400 font-bold">M-Pesa Buy Goods Till</p>
                    <p className="text-white font-mono text-sm mt-0.5">Till Number: <span className="text-emerald-400 font-bold">..</span></p>
                  </div>
                  <div className="border-b border-slate-700/50 pb-2">
                    <p className="text-slate-400 font-bold">M-Pesa Paybill</p>
                    <p className="text-white font-mono text-sm mt-0.5">Business No: <span className="text-emerald-400 font-bold">..</span></p>
                    <p className="text-slate-500">Account No: [Your Membership Number]</p>
                  </div>
                  <div>
                    <p className="text-slate-400 font-bold">Equity Bank Sacco Shares Account</p>
                    <p className="text-white font-mono mt-0.5">Account: <span className="text-emerald-400 font-bold">..</span></p>
                  </div>
                </div>
              </div>
            </div>

            {/* Standard Deposit Entry Form */}
            <div className="lg:col-span-2">
              {!isAdministrativeRole ? (
                <form onSubmit={handleDepositSubmit} className="bg-slate-800 rounded-2xl border border-slate-700 p-6 space-y-4 shadow-xl">
                  <h3 className="font-black text-lg text-white">💰 Lodge Savings Deposit</h3>
                  <p className="text-xs text-slate-400">Save to your personal account, or route the money to your assigned matatu's savings account.</p>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="text-xs text-slate-400 block mb-1">Amount (KES)</label>
                      <input
                        type="number"
                        required
                        placeholder="e.g. 5000"
                        value={depositForm.amount}
                        onChange={(e) => setDepositForm({ ...depositForm, amount: e.target.value })}
                        className="w-full bg-slate-900 border border-slate-700 rounded-xl p-3 text-sm text-white focus:border-emerald-500 outline-none"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-slate-400 block mb-1">Channel / Payment Method</label>
                      <select
                        value={depositForm.payment_method}
                        onChange={(e) => setDepositForm({ ...depositForm, payment_method: e.target.value })}
                        className="w-full bg-slate-900 border border-slate-700 rounded-xl p-3 text-sm text-white focus:border-emerald-500 outline-none"
                      >
                        {PAYMENT_METHODS.map((m) => (
                          <option key={m.key} value={m.key}>{m.label}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="text-xs text-slate-400 block mb-1">Transaction Ref Code / M-Pesa Code</label>
                      <input
                        type="text"
                        placeholder="e.g. QX8102938J"
                        value={depositForm.mpesa_code}
                        onChange={(e) => setDepositForm({ ...depositForm, mpesa_code: e.target.value.toUpperCase() })}
                        className="w-full bg-slate-900 border border-slate-700 rounded-xl p-3 text-sm text-white font-mono focus:border-emerald-500 outline-none"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-slate-400 block mb-1">Contribution Date</label>
                      <input
                        type="date"
                        value={depositForm.date}
                        onChange={(e) => setDepositForm({ ...depositForm, date: e.target.value })}
                        className="w-full bg-slate-900 border border-slate-700 rounded-xl p-3 text-sm text-white focus:border-emerald-500 outline-none"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-slate-400 block mb-1">Save To</label>
                      <select
                        value={depositForm.matatu_id}
                        onChange={(e) => setDepositForm({ ...depositForm, matatu_id: e.target.value })}
                        className="w-full bg-slate-900 border border-slate-700 rounded-xl p-3 text-sm text-white focus:border-emerald-500 outline-none"
                      >
                        <option value="">Personal savings (my own account)</option>
                        {matatus.map((m) => (
                          <option key={m.id} value={m.id}>🚐 {m.plate} (matatu account)</option>
                        ))}
                      </select>
                      {depositForm.matatu_id && (
                        <p className="text-[10px] text-amber-400 mt-1">
                          This goes to the matatu's savings account (visible to the owner), not your personal balance.
                        </p>
                      )}
                    </div>
                    <div>
                      <label className="text-xs text-slate-400 block mb-1">Description</label>
                      <input
                        type="text"
                        placeholder="e.g. Monthly welfare contribution"
                        value={depositForm.description}
                        onChange={(e) => setDepositForm({ ...depositForm, description: e.target.value })}
                        className="w-full bg-slate-900 border border-slate-700 rounded-xl p-3 text-sm text-white focus:border-emerald-500 outline-none"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="text-xs text-slate-400 block mb-1">Proof of Transaction (M-Pesa receipt screenshot / Bank slip)</label>
                    <input
                      type="file"
                      accept="image/*,.pdf"
                      onChange={(e) => setDepositForm({ ...depositForm, proof_file: e.target.files[0] })}
                      className="w-full bg-slate-900 border border-slate-700 rounded-xl p-2.5 text-xs text-slate-400 file:mr-3 file:bg-emerald-500 file:text-slate-950 file:border-0 file:rounded-lg file:px-3 file:py-1 file:font-bold cursor-pointer"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-slate-950 font-black py-3 rounded-xl transition-all text-xs"
                  >
                    {loading ? "LODGING TRANSACTION..." : "📤 SUBMIT SAVINGS DEPOSIT FOR HR VERIFICATION"}
                  </button>
                </form>
              ) : (
                <div className="bg-slate-800 rounded-2xl border border-slate-700 p-8 text-center text-slate-500 h-full flex flex-col justify-center items-center">
                  <p className="text-5xl mb-4">👮</p>
                  <h3 className="text-white font-extrabold text-lg">Admin / Staff Savings Control Desk</h3>
                  <p className="text-xs max-w-md mx-auto mt-2">To audit pending logs or run overrides, navigate to the <button onClick={() => setActiveSubTab("desk")} className="text-emerald-400 underline font-bold">Approvals Desk</button> or <button onClick={() => setActiveSubTab("reports")} className="text-emerald-400 underline font-bold">Reports Engine</button> tab.</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ==================================================================== */}
        {/* SUBTAB 2: TRANSACTION HISTORY */}
        {/* ==================================================================== */}
        {activeSubTab === "history" && (
          <div className="bg-slate-800 rounded-2xl border border-slate-700 overflow-hidden shadow-xl">
            <div className="px-6 py-4 bg-slate-700/50 border-b border-slate-700 flex justify-between items-center">
              <h3 className="font-extrabold text-sm text-white">🕒 Sacco Statement Ledger History</h3>
              <span className="text-xs bg-slate-800 text-slate-400 px-3 py-1 rounded-full font-bold">Total: {personalHistory.length} transactions</span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-900 text-slate-300">
                  <tr>
                    <th className="p-3">Reference/M-Pesa</th>
                    <th className="p-3">Saved To</th>
                    <th className="p-3">Method</th>
                    <th className="p-3">Amount</th>
                    <th className="p-3">Date</th>
                    <th className="p-3">Verification Status</th>
                    <th className="p-3">Proof Document</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-700">
                  {isAdministrativeRole ? (
                    <tr>
                      <td colSpan="7" className="p-8 text-center text-slate-400 font-bold">Staff/Admins do not maintain personal statement logs. Use the Reports Engine tab.</td>
                    </tr>
                  ) : personalHistory.length === 0 ? (
                    <tr>
                      <td colSpan="7" className="p-8 text-center text-slate-500 font-bold">No contributions found on this account.</td>
                    </tr>
                  ) : (
                    personalHistory.map((h) => (
                      <tr key={h.id} className="hover:bg-slate-700/30">
                        <td className="p-3 font-bold font-mono text-emerald-400">{h.mpesa_code || "N/A"}</td>
                        <td className="p-3 text-slate-300 font-bold">
                          {h.matatu_id ? `🚐 ${plateOf(h.matatu_id)}` : "Personal"}
                        </td>
                        <td className="p-3 capitalize text-slate-400">{h.payment_method}</td>
                        <td className="p-3 font-black text-white text-sm">KES {h.amount?.toLocaleString()}</td>
                        <td className="p-3 text-slate-400">{h.date}</td>
                        <td className="p-3">
                          <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase ${
                            h.status === "approved" ? "bg-emerald-950 border border-emerald-500/30 text-emerald-400" :
                            h.status === "rejected" ? "bg-red-950 border border-red-500/30 text-red-400" :
                            "bg-amber-950 border border-amber-500/30 text-amber-400"
                          }`}>
                            {h.status === "pending_admin" ? "Awaiting final Admin Approval" : h.status?.replace("_", " ")}
                          </span>
                        </td>
                        <td className="p-3">
                          {h.proof_file ? (
                            <a href={h.proof_file} target="_blank" rel="noreferrer" className="bg-slate-900 text-slate-300 border border-slate-600 px-3 py-1.5 rounded-lg font-bold hover:bg-slate-800">
                              📎 Open File
                            </a>
                          ) : <span className="text-slate-600">None</span>}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ==================================================================== */}
        {/* SUBTAB 3: HR / ADMIN VERIFICATION & OVERRIDES DESK */}
        {/* ==================================================================== */}
        {activeSubTab === "desk" && (
          <div className="space-y-6">

            {/* Multi-tier pending approvals queue */}
            <div className="bg-slate-800 rounded-2xl border border-slate-700 overflow-hidden shadow-xl">
              <div className="px-6 py-4 bg-slate-700/50 border-b border-slate-700 flex justify-between items-center">
                <h3 className="font-extrabold text-sm text-white">🔍 Verification Approval Queue</h3>
                <span className="text-xs bg-slate-900 text-emerald-400 px-3 py-1 rounded-full font-bold">{pendingSavings.length} items needing action</span>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-900 text-slate-300">
                    <tr>
                      <th className="p-3">Member</th>
                      <th className="p-3">Saved To</th>
                      <th className="p-3">Amount</th>
                      <th className="p-3">Reference/M-Pesa</th>
                      <th className="p-3">Channel</th>
                      <th className="p-3">Date</th>
                      <th className="p-3">Verification Tier</th>
                      <th className="p-3">Proof Slip</th>
                      <th className="p-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-700">
                    {pendingSavings.length === 0 ? (
                      <tr>
                        <td colSpan="9" className="p-8 text-center text-slate-500 font-bold">Verification queue is clean.</td>
                      </tr>
                    ) : (
                      pendingSavings.map((item) => {
                        const canHrApprove = user?.role === "hr" && item.status === "pending_hr";
                        const canAdminApprove = isAdminOrDirector && item.status === "pending_admin";

                        return (
                          <tr key={item.id} className="hover:bg-slate-700/30">
                            <td className="p-3">
                              <p className="font-bold text-white">{item.member_name}</p>
                              <p className="text-[10px] text-slate-400 font-mono">{item.membership_no}</p>
                            </td>
                            <td className="p-3 text-slate-300 font-bold">
                              {item.matatu_id ? `🚐 ${plateOf(item.matatu_id)}` : "Personal"}
                            </td>
                            <td className="p-3 font-extrabold text-white text-sm">KES {item.amount?.toLocaleString()}</td>
                            <td className="p-3 font-mono text-emerald-400 font-bold">{item.mpesa_code || "N/A"}</td>
                            <td className="p-3 capitalize text-slate-300">{item.payment_method}</td>
                            <td className="p-3 text-slate-400">{item.date}</td>
                            <td className="p-3">
                              <span className={`px-2 py-0.5 rounded text-[9px] font-black uppercase ${
                                item.status === "pending_admin" ? "bg-purple-950 text-purple-400 border border-purple-500/20" : "bg-blue-950 text-blue-400 border border-blue-500/20"
                              }`}>
                                {item.status === "pending_hr" ? "1st Tier: Pending HR" : "2nd Tier: Pending Admin"}
                              </span>
                            </td>
                            <td className="p-3">
                              {item.proof_file ? (
                                <a href={item.proof_file} target="_blank" rel="noreferrer" className="text-blue-400 underline font-bold">
                                  Open Proof Slip
                                </a>
                              ) : <span className="text-slate-600">No Slip</span>}
                            </td>
                            <td className="p-3 text-right space-x-1 whitespace-nowrap">
                              {/* HR recommend Action (First Tier) */}
                              {canHrApprove && (
                                <button
                                  onClick={() => handleHrRecommend(item.id)}
                                  className="bg-blue-600 hover:bg-blue-500 text-white text-[10px] px-2.5 py-1.5 rounded-lg font-bold"
                                >
                                  Recommend
                                </button>
                              )}
                              {/* Admin Signoff Action (Second Tier) */}
                              {canAdminApprove && (
                                <button
                                  onClick={() => handleAdminApprove(item.id)}
                                  className="bg-emerald-600 hover:bg-emerald-500 text-slate-950 text-[10px] px-2.5 py-1.5 rounded-lg font-bold"
                                >
                                  Approve Contribution
                                </button>
                              )}

                              <button
                                onClick={() => handleReject(item.id)}
                                className="bg-red-600/80 hover:bg-red-500 text-white text-[10px] px-2.5 py-1.5 rounded-lg font-bold"
                              >
                                Reject
                              </button>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Overrides and prompts forms panels */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

              {/* HR / Admin Manual Override Form */}
              <div className="bg-slate-800 rounded-2xl border border-slate-700 p-5 space-y-4 shadow-xl">
                <div className="border-b border-slate-700 pb-2">
                  <h3 className="font-extrabold text-white text-sm">🛠️ Sacco Manual Deposit Override</h3>
                  <p className="text-[11px] text-slate-400 mt-0.5">Logs manual contribution for a member. Mandates proof upload and requires Admin final sign-off.</p>
                </div>

                <form onSubmit={handleHrManualSubmit} className="space-y-3">
                  <div className="relative">
                    <label className="text-[11px] text-slate-400 block mb-1">Select Sacco Member</label>
                    <input
                      type="text"
                      placeholder="Search member name or no..."
                      value={memberSearch}
                      onChange={(e) => {
                        setMemberSearch(e.target.value);
                        setShowMemberDrop(true);
                      }}
                      onFocus={() => setShowMemberDrop(true)}
                      className="w-full bg-slate-900 border border-slate-700 rounded-xl p-2.5 text-xs text-white outline-none focus:border-emerald-500"
                    />
                    {showMemberDrop && memberSearch && (
                      <div className="absolute z-50 bg-slate-950 border border-slate-700 w-full max-h-36 overflow-y-auto rounded-xl mt-1 shadow-2xl">
                        {members
                          .filter((m) =>
                            m.name?.toLowerCase().includes(memberSearch.toLowerCase()) ||
                            m.membership_no?.toLowerCase().includes(memberSearch.toLowerCase())
                          )
                          .map((m) => (
                            <div
                              key={m.id}
                              onClick={() => {
                                setHrManualForm({ ...hrManualForm, member_id: m.id });
                                setMemberSearch(`${m.name} (${m.membership_no})`);
                                setShowMemberDrop(false);
                              }}
                              className="p-2.5 hover:bg-slate-800 cursor-pointer border-b border-slate-800 text-xs"
                            >
                              <p className="font-bold text-white">{m.name}</p>
                              <p className="text-[10px] text-slate-400">{m.membership_no} · <span className="capitalize">{m.role}</span></p>
                            </div>
                          ))}
                      </div>
                    )}
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-[11px] text-slate-400 block mb-1">Amount (KES)</label>
                      <input
                        type="number"
                        required
                        placeholder="Amount"
                        value={hrManualForm.amount}
                        onChange={(e) => setHrManualForm({ ...hrManualForm, amount: e.target.value })}
                        className="w-full bg-slate-900 border border-slate-700 rounded-xl p-2.5 text-xs text-white outline-none focus:border-emerald-500"
                      />
                    </div>
                    <div>
                      <label className="text-[11px] text-slate-400 block mb-1">Payment Method</label>
                      <select
                        value={hrManualForm.payment_method}
                        onChange={(e) => setHrManualForm({ ...hrManualForm, payment_method: e.target.value })}
                        className="w-full bg-slate-900 border border-slate-700 rounded-xl p-2.5 text-xs text-white outline-none focus:border-emerald-500"
                      >
                        {PAYMENT_METHODS.map((m) => (
                          <option key={m.key} value={m.key}>{m.label}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-[11px] text-slate-400 block mb-1">M-Pesa / Reference Code</label>
                      <input
                        type="text"
                        placeholder="Ref Code"
                        value={hrManualForm.mpesa_code}
                        onChange={(e) => setHrManualForm({ ...hrManualForm, mpesa_code: e.target.value.toUpperCase() })}
                        className="w-full bg-slate-900 border border-slate-700 rounded-xl p-2.5 text-xs text-white font-mono outline-none focus:border-emerald-500"
                      />
                    </div>
                    <div>
                      <label className="text-[11px] text-slate-400 block mb-1">Date</label>
                      <input
                        type="date"
                        value={hrManualForm.date}
                        onChange={(e) => setHrManualForm({ ...hrManualForm, date: e.target.value })}
                        className="w-full bg-slate-900 border border-slate-700 rounded-xl p-2.5 text-xs text-white outline-none"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div>
                      <label className="text-[11px] text-slate-400 block mb-1">Assign to Fleet Vehicle (Optional)</label>
                      <select
                        value={hrManualForm.matatu_id}
                        onChange={(e) => setHrManualForm({ ...hrManualForm, matatu_id: e.target.value })}
                        className="w-full bg-slate-900 border border-slate-700 rounded-xl p-2.5 text-xs text-white outline-none focus:border-emerald-500"
                      >
                        <option value="">Personal savings (No Vehicle)</option>
                        {matatus.map((m) => (
                          <option key={m.id} value={m.id}>🚐 {m.plate}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="text-[11px] text-slate-400 block mb-1">Override Description</label>
                      <input
                        type="text"
                        placeholder="e.g. Welfare back-payments"
                        value={hrManualForm.description}
                        onChange={(e) => setHrManualForm({ ...hrManualForm, description: e.target.value })}
                        className="w-full bg-slate-900 border border-slate-700 rounded-xl p-2.5 text-xs text-white outline-none focus:border-emerald-500"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="text-[11px] text-slate-400 block mb-1">Proof document file (Strictly Mandatory)</label>
                    <input
                      type="file"
                      required
                      accept="image/*,.pdf"
                      onChange={(e) => setHrManualForm({ ...hrManualForm, proof_file: e.target.files[0] })}
                      className="w-full bg-slate-900 border border-slate-700 rounded-xl p-2 text-xs text-slate-400 cursor-pointer"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full bg-blue-600 hover:bg-blue-500 text-white font-black py-2.5 rounded-xl transition-all text-xs"
                  >
                    {isAdminOrDirector
                      ? "💾 DIRECT DEPOSIT FOR ADMIN CONFIRMATION"
                      : "💾 RECORD CONTRIBUTION & FORWARD TO ADMIN SIGN-OFF"
                    }
                  </button>
                </form>
              </div>

              {/* Sacco Savings Reminders Form */}
              <div className="bg-slate-800 rounded-2xl border border-slate-700 p-5 space-y-4 shadow-xl">
                <div className="border-b border-slate-700 pb-2">
                  <h3 className="font-extrabold text-white text-sm">📢 Savings Contribution Prompts</h3>
                  <p className="text-[11px] text-slate-400 mt-0.5">Send a system alert and integrated SMS reminder directly to a selected member.</p>
                </div>

                <form onSubmit={handleSendPrompt} className="space-y-3">
                  <div className="relative">
                    <label className="text-[11px] text-slate-400 block mb-1">Recipient Member</label>
                    <input
                      type="text"
                      placeholder="Type name or membership code..."
                      value={promptSearch}
                      onChange={(e) => {
                        setPromptSearch(e.target.value);
                        setShowPromptDrop(true);
                      }}
                      onFocus={() => setShowPromptDrop(true)}
                      className="w-full bg-slate-900 border border-slate-700 rounded-xl p-2.5 text-xs text-white outline-none focus:border-emerald-500"
                    />
                    {showPromptDrop && promptSearch && (
                      <div className="absolute z-50 bg-slate-950 border border-slate-700 w-full max-h-36 overflow-y-auto rounded-xl mt-1 shadow-2xl">
                        {members
                          .filter((m) =>
                            m.name?.toLowerCase().includes(promptSearch.toLowerCase()) ||
                            m.membership_no?.toLowerCase().includes(promptSearch.toLowerCase())
                          )
                          .map((m) => (
                            <div
                              key={m.id}
                              onClick={() => {
                                setPromptForm({ ...promptForm, member_id: m.id });
                                setPromptSearch(`${m.name} (${m.membership_no})`);
                                setShowPromptDrop(false);
                              }}
                              className="p-2.5 hover:bg-slate-800 cursor-pointer border-b border-slate-800 text-xs"
                            >
                              <p className="font-bold text-white">{m.name}</p>
                              <p className="text-[10px] text-slate-400">{m.membership_no} · <span className="capitalize">{m.role}</span></p>
                            </div>
                          ))}
                      </div>
                    )}
                  </div>

                  <div>
                    <label className="text-[11px] text-slate-400 block mb-1">Alert Message</label>
                    <textarea
                      rows={3}
                      value={promptForm.message}
                      onChange={(e) => setPromptForm({ ...promptForm, message: e.target.value })}
                      className="w-full bg-slate-900 border border-slate-700 rounded-xl p-2.5 text-xs text-white outline-none resize-none focus:border-emerald-500"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full bg-amber-500 text-slate-950 hover:bg-amber-400 font-black py-2.5 rounded-xl transition-all text-xs"
                  >
                    📤 DISPATCH SAVINGS REMINDER
                  </button>
                </form>
              </div>

            </div>
          </div>
        )}

        {/* ==================================================================== */}
        {/* SUBTAB 4: ADMIN VEHICLE FLEET OVERSIGHT (Anti-Fraud protection) */}
        {/* ==================================================================== */}
        {activeSubTab === "matatuOversight" && isAdminOrDirector && (
          <div className="bg-slate-800 rounded-2xl border border-slate-700 overflow-hidden shadow-xl space-y-4">
            <div className="px-6 py-4 bg-slate-700/50 border-b border-slate-700 flex justify-between items-center">
              <div>
                <h3 className="font-black text-sm text-white">🚐 Fleet Matatu Savings Oversight Desk</h3>
                <p className="text-[10px] text-slate-400 mt-0.5">Inspects matatu-bound entries logged by drivers, conductors, and overrides to detect fraud.</p>
              </div>
              <button
                onClick={fetchMatatuSavingsAdmin}
                className="bg-slate-900 border border-slate-700 hover:bg-slate-800 text-slate-200 text-xs px-3 py-1.5 rounded-lg"
              >
                🔄 Refresh Logs
              </button>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-900 text-slate-300">
                  <tr>
                    <th className="p-3">Matatu Plate</th>
                    <th className="p-3">Depositor/Role</th>
                    <th className="p-3">Amount</th>
                    <th className="p-3">Ref Code</th>
                    <th className="p-3">Channel</th>
                    <th className="p-3">Date</th>
                    <th className="p-3">Verification status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-700">
                  {matatuSavingsAdmin.length === 0 ? (
                    <tr>
                      <td colSpan="7" className="p-8 text-center text-slate-500 font-bold">No matatu savings transactions logged in database.</td>
                    </tr>
                  ) : (
                    matatuSavingsAdmin.map((m) => (
                      <tr key={m.id} className="hover:bg-slate-700/30">
                        <td className="p-3 font-extrabold text-white text-sm">{m.plate}</td>
                        <td className="p-3 text-slate-300 font-medium">{m.submitted_by}</td>
                        <td className="p-3 font-black text-emerald-400 text-sm">KES {m.amount?.toLocaleString()}</td>
                        <td className="p-3 font-mono text-slate-400">{m.mpesa_code || "—"}</td>
                        <td className="p-3 capitalize text-slate-400">{m.payment_method}</td>
                        <td className="p-3 text-slate-400">{m.date}</td>
                        <td className="p-3">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-black uppercase ${
                            m.status === "approved" ? "bg-emerald-950 text-emerald-400" :
                            m.status === "rejected" ? "bg-red-950 text-red-400" :
                            "bg-amber-950 text-amber-400"
                          }`}>
                            {m.status?.replace("_", " ")}
                          </span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ==================================================================== */}
        {/* SUBTAB 5: MATATU SAVINGS POOL (driver / conductor / owner) */}
        {/* ==================================================================== */}
        {activeSubTab === "matatuPool" && isCrewOrOwner && (
          <div className="space-y-6">

            {/* Matatu selector */}
            <div className="bg-slate-800 rounded-2xl border border-slate-700 p-5 flex flex-wrap gap-2 items-center shadow-xl">
              <span className="text-xs text-slate-400 mr-2">Matatu:</span>
              {matatus.map((m) => (
                <button
                  key={m.id}
                  onClick={() => setPoolMatatuId(String(m.id))}
                  className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${
                    String(m.id) === poolMatatuId
                      ? "bg-emerald-500 text-slate-950"
                      : "bg-slate-900 text-slate-300 hover:bg-slate-700"
                  }`}
                >
                  🚐 {m.plate}
                </button>
              ))}
              {matatus.length === 0 && <span className="text-xs text-slate-500">No matatu assigned.</span>}
              {poolMatatuId && (
                <button
                  onClick={() => fetchMatatuPool(poolMatatuId)}
                  className="ml-auto bg-slate-900 border border-slate-700 hover:bg-slate-800 text-slate-200 text-xs px-3 py-1.5 rounded-lg"
                >
                  🔄 Refresh
                </button>
              )}
            </div>

            {matatuPool && (
              <>
                {/* Balance card */}
                <div className="bg-gradient-to-br from-blue-800 to-indigo-900 border border-blue-600/30 rounded-2xl p-6 text-white shadow-xl">
                  <span className="text-blue-300 text-xs font-bold uppercase tracking-wider block">
                    Matatu Savings Balance (approved only)
                  </span>
                  <p className="text-4xl font-extrabold tracking-tight mt-1">
                    KES {(matatuPool.balance || 0).toLocaleString()}
                  </p>
                  <div className="flex flex-wrap gap-2 mt-3">
                    {(matatuPool.by_contributor || []).map((c) => (
                      <span key={c.name} className="text-[11px] bg-blue-950/50 px-3 py-1 rounded-full capitalize">
                        {c.name} ({c.role}): KES {c.total.toLocaleString()}
                      </span>
                    ))}
                  </div>
                  <p className="text-[11px] text-blue-200/80 mt-3">
                    🛡️ Only deposits that received final Admin approval appear here. This is the matatu's money, not anyone's personal savings.
                  </p>
                </div>

                {/* Transactions */}
                <div className="bg-slate-800 rounded-2xl border border-slate-700 overflow-hidden shadow-xl">
                  <div className="px-6 py-4 bg-slate-700/50 border-b border-slate-700">
                    <h3 className="font-extrabold text-sm text-white">🚐 Matatu Savings Ledger</h3>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-slate-900 text-slate-300">
                        <tr>
                          <th className="p-3">Date</th>
                          <th className="p-3">Saved By</th>
                          <th className="p-3">Method</th>
                          <th className="p-3">Ref</th>
                          <th className="p-3">Amount</th>
                          <th className="p-3">Proof</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-700">
                        {(matatuPool.transactions || []).length === 0 ? (
                          <tr>
                            <td colSpan="6" className="p-8 text-center text-slate-500 font-bold">
                              No approved matatu savings yet.
                            </td>
                          </tr>
                        ) : (
                          matatuPool.transactions.map((t) => (
                            <tr key={t.id} className="hover:bg-slate-700/30">
                              <td className="p-3 text-slate-400">{t.date}</td>
                              <td className="p-3 text-white font-bold">
                                {t.submitted_by?.name || "Unknown"}{" "}
                                <span className="text-slate-500 capitalize font-normal">({t.submitted_by?.role})</span>
                              </td>
                              <td className="p-3 capitalize text-slate-400">{t.payment_method}</td>
                              <td className="p-3 font-mono text-emerald-400">{t.mpesa_code || "—"}</td>
                              <td className="p-3 font-black text-white">
                                {t.transaction_type === "deposit" ? "+" : "-"}KES {t.amount?.toLocaleString()}
                              </td>
                              <td className="p-3">
                                {t.proof_file ? (
                                  <a href={t.proof_file} target="_blank" rel="noreferrer" className="text-blue-400 underline font-bold">
                                    Open
                                  </a>
                                ) : <span className="text-slate-600">—</span>}
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </>
            )}
          </div>
        )}

        {/* ==================================================================== */}
        {/* SUBTAB 6: REPORTS ENGINE */}
        {/* ==================================================================== */}
        {activeSubTab === "reports" && (
          <div className="space-y-6">

            {/* Filter and options panel */}
            <div className="bg-slate-800 rounded-2xl border border-slate-700 p-5 shadow-xl">
              <h3 className="font-extrabold text-sm text-white mb-3">📋 Certified Sacco Reports Parameter Filters</h3>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end text-xs">

                <div>
                  <label className="text-slate-400 block mb-1">Timeframe Period</label>
                  <select
                    value={reportPeriod}
                    onChange={(e) => setReportPeriod(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl p-3 text-white focus:border-emerald-500 outline-none font-bold"
                  >
                    <option value="weekly">📅 Rolling Weekly (7 Days)</option>
                    <option value="monthly">📅 Current Monthly</option>
                    <option value="yearly">📅 Current Calendar Year</option>
                  </select>
                </div>

                {isAdministrativeRole && (
                  <>
                    <div>
                      <label className="text-slate-400 block mb-1">Member Filter (Optional)</label>
                      <select
                        value={reportFilterMember}
                        onChange={(e) => setReportFilterMember(e.target.value)}
                        className="w-full bg-slate-900 border border-slate-700 rounded-xl p-3 text-white focus:border-emerald-500 outline-none"
                      >
                        <option value="">All Members</option>
                        {members.map((m) => (
                          <option key={m.id} value={m.id}>{m.name} ({m.membership_no})</option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="text-slate-400 block mb-1">Vehicle Fleet Filter (Optional)</label>
                      <select
                        value={reportFilterMatatu}
                        onChange={(e) => setReportFilterMatatu(e.target.value)}
                        className="w-full bg-slate-900 border border-slate-700 rounded-xl p-3 text-white focus:border-emerald-500 outline-none"
                      >
                        <option value="">All Fleet</option>
                        {matatus.map((m) => (
                          <option key={m.id} value={m.id}>🚐 {m.plate}</option>
                        ))}
                      </select>
                    </div>
                  </>
                )}

                <div className="flex gap-2">
                  <button
                    onClick={fetchReport}
                    className="flex-1 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black py-3 rounded-xl transition-all font-bold animate-pulse"
                  >
                    Generate Report
                  </button>
                  {reportData && (
                    <button
                      onClick={exportCSV}
                      className="bg-slate-700 hover:bg-slate-600 text-white font-black px-4 rounded-xl transition-all"
                      title="Download as CSV spreadsheet"
                    >
                      📥 CSV
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* Generated Report output */}
            {reportData ? (
              <div id="print-area" className="bg-slate-800 rounded-2xl border border-slate-700 p-6 shadow-xl text-slate-100 print:bg-white print:text-black">

                {/* Print layout branding */}
                <div className="text-center border-b border-slate-700 pb-5 mb-5 space-y-1">
                  <h2 className="text-2xl font-black text-white print:text-black">2KM SACCO</h2>
                  <p className="text-xs uppercase tracking-widest text-slate-400 print:text-slate-600">Savings Contribution Ledger Report</p>
                  <p className="text-[10px] text-slate-500">Timeframe: {reportPeriod.toUpperCase()} | Generated: {new Date().toLocaleDateString()}</p>
                </div>

                {/* KPI Summaries */}
                <div className="grid grid-cols-3 gap-4 mb-6 text-center">
                  <div className="bg-slate-900/50 border border-slate-700 rounded-xl p-4 print:border-black">
                    <span className="text-[10px] text-slate-400 uppercase font-bold tracking-wider">Total Certified Deposits</span>
                    <p className="text-xl font-black text-emerald-400 mt-1">KES {reportData.total_deposits?.toLocaleString()}</p>
                  </div>
                  <div className="bg-slate-900/50 border border-slate-700 rounded-xl p-4 print:border-black">
                    <span className="text-[10px] text-slate-400 uppercase font-bold tracking-wider">Total Certified Withdrawals</span>
                    <p className="text-xl font-black text-red-400 mt-1">KES {reportData.total_withdrawals?.toLocaleString()}</p>
                  </div>
                  <div className="bg-slate-900/50 border border-slate-700 rounded-xl p-4 print:border-black">
                    <span className="text-[10px] text-slate-400 uppercase font-bold tracking-wider">Net Growth balance</span>
                    <p className="text-xl font-black text-blue-400 mt-1">KES {reportData.net_savings?.toLocaleString()}</p>
                  </div>
                </div>

                {/* Ledgers table */}
                <div className="border border-slate-700 rounded-xl overflow-hidden print:border-black">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-900 text-slate-300 print:bg-slate-200 print:text-black">
                      <tr>
                        <th className="p-3">Reference</th>
                        <th className="p-3">Category</th>
                        <th className="p-3">Saved To</th>
                        <th className="p-3">Method</th>
                        <th className="p-3">Amount</th>
                        <th className="p-3">Date</th>
                        <th className="p-3">Description</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-700 print:divide-black">
                      {reportData.transactions.length === 0 ? (
                        <tr>
                          <td colSpan="7" className="p-5 text-center text-slate-500 font-bold">No processed logs match this filter period.</td>
                        </tr>
                      ) : (
                        reportData.transactions.map((t) => (
                          <tr key={t.id} className="hover:bg-slate-700/30">
                            <td className="p-3 font-mono font-bold text-emerald-400 print:text-black">{t.mpesa_code || "N/A"}</td>
                            <td className="p-3 capitalize font-bold text-slate-300 print:text-black">{t.transaction_type}</td>
                            <td className="p-3 text-slate-300 print:text-black">{t.matatu_id ? `🚐 ${plateOf(t.matatu_id)}` : "Personal"}</td>
                            <td className="p-3 capitalize text-slate-400 print:text-black">{t.payment_method}</td>
                            <td className={`p-3 font-black text-sm ${t.transaction_type === "deposit" ? "text-emerald-400" : "text-red-400"} print:text-black`}>
                              {t.transaction_type === "deposit" ? "+" : "-"}KES {t.amount?.toLocaleString()}
                            </td>
                            <td className="p-3 text-slate-400 print:text-black">{t.date}</td>
                            <td className="p-3 text-slate-400 print:text-black">{t.description || "—"}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>

                {/* Print Execution Action block */}
                <div className="mt-5 flex justify-end gap-2 print:hidden">
                  <button
                    onClick={() => window.print()}
                    className="bg-slate-700 hover:bg-slate-600 text-white font-bold px-5 py-2 rounded-lg text-xs"
                  >
                    🖨️ Print Sacco Statement
                  </button>
                </div>

              </div>
            ) : (
              <div className="bg-slate-800 border border-slate-700 rounded-2xl p-12 text-center text-slate-500 shadow-xl">
                <p className="text-4xl mb-3">📋</p>
                <p className="font-bold">Select report specifications and parameters above, then click Generate.</p>
              </div>
            )}
          </div>
        )}

      </div>
    </div>
  );
}