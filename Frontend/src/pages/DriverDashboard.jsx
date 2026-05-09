import { useState, useEffect, useCallback } from "react";
import API from "../api";
import { useAuth } from "../context/AuthContext";
import LoanDashboard from "../components/LoanDashboard";

const TABS = [
  { key: "home",          label: "🏠 Home" },
  { key: "daily",         label: "📅 Daily Records" },
  { key: "earnings",      label: "💰 Earnings" },
  { key: "expenditures",  label: "🧾 Expenditures" },
  { key: "savings",       label: "🏦 Savings" },
  { key: "loans",         label: "📋 Loans" },
  { key: "guarantors",    label: "🤝 Guarantor History" },
];

function Toast({ msg, type, onClose }) {
  useEffect(() => { const t = setTimeout(onClose, 3000); return () => clearTimeout(t); }, [onClose]);
  return (
    <div className={`fixed top-5 right-5 z-50 px-5 py-3 rounded-lg shadow-2xl text-sm font-bold ${type === "error" ? "bg-red-500 text-white" : "bg-emerald-500 text-white"}`}>
      {msg}
    </div>
  );
}

export default function DriverDashboard() {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState("home");
  const [assignment, setAssignment] = useState(null);
  const [assignmentError, setAssignmentError] = useState(null);
  const [toast, setToast] = useState(null);
  const showToast = (msg, type = "success") => setToast({ msg, type });

  const token = localStorage.getItem("token");
  const headers = { Authorization: `Bearer ${token}` };
  const jsonHeaders = { ...headers, "Content-Type": "application/json" };

  // ── Earnings ──
  const [earnings, setEarnings] = useState([]);
  const [earningForm, setEarningForm] = useState({ amount: "", date: new Date().toISOString().split("T")[0], notes: "", proof_file: null });
  const [earningLoading, setEarningLoading] = useState(false);

  // ── Expenditures ──
  const [expenditures, setExpenditures] = useState([]);
  const [expForm, setExpForm] = useState({ amount: "", description: "", date: new Date().toISOString().split("T")[0], proof_file: null });
  const [expLoading, setExpLoading] = useState(false);

  // ── Savings ──
  const [personalSavings, setPersonalSavings] = useState({ balance: 0, transactions: [] });
  const [matatuSavings, setMatatuSavings] = useState({ balance: 0, transactions: [] });
  const [savingTab, setSavingTab] = useState("personal"); // "personal" | "matatu"
  const [personalForm, setPersonalForm] = useState({ amount: "", description: "", date: new Date().toISOString().split("T")[0] });
  const [matatuForm, setMatatuForm] = useState({ amount: "", description: "", date: new Date().toISOString().split("T")[0] });

  // ── Daily Records (shared with conductor/driver on same matatu) ──
  const [dailyDate, setDailyDate] = useState(new Date().toISOString().split("T")[0]);
  const [dailyRecords, setDailyRecords] = useState(null);
  const [dailyLoading, setDailyLoading] = useState(false);

  // ── Guarantors ──
  const [guarantorHistory, setGuarantorHistory] = useState([]);

  // ── Assignment ──
  useEffect(() => {
    fetch(`${API}/assignments/my`, { headers })
      .then(r => r.json())
      .then(data => { if (data.error) setAssignmentError(data.error); else setAssignment(data); })
      .catch(() => setAssignmentError("Could not load assignment"));
  }, []);

  useEffect(() => {
    if (!assignment) return;
    if (activeTab === "earnings") fetchEarnings();
    if (activeTab === "expenditures") fetchExpenditures();
    if (activeTab === "savings") { fetchPersonalSavings(); fetchMatatuSavings(); }
    if (activeTab === "guarantors") fetchGuarantorHistory();
  }, [activeTab, assignment]);

  const fetchEarnings = async () => {
    const res = await fetch(`${API}/earnings/matatu/${assignment.matatu_id}`, { headers });
    setEarnings(await res.json());
  };

  const fetchExpenditures = async () => {
    const res = await fetch(`${API}/expenditures/matatu/${assignment.matatu_id}`, { headers });
    setExpenditures(await res.json());
  };

  const fetchPersonalSavings = async () => {
    const res = await fetch(`${API}/savings/my`, { headers });
    if (res.ok) setPersonalSavings(await res.json());
  };

  const fetchMatatuSavings = async () => {
    const res = await fetch(`${API}/savings/matatu/${assignment.matatu_id}`, { headers });
    if (res.ok) setMatatuSavings(await res.json());
  };

  const fetchGuarantorHistory = async () => {
    const res = await fetch(`${API}/guarantors/my-history`, { headers });
    if (res.ok) setGuarantorHistory(await res.json());
  };

  const fetchDailyRecords = async () => {
    if (!assignment) return;
    setDailyLoading(true);
    const res = await fetch(`${API}/matatu/daily-records?matatu_id=${assignment.matatu_id}&date=${dailyDate}`, { headers });
    if (res.ok) setDailyRecords(await res.json());
    setDailyLoading(false);
  };

  // ── Submit Earning ──
  const submitEarning = async () => {
    if (!earningForm.amount || !earningForm.date) return showToast("Amount and date required", "error");
    setEarningLoading(true);
    const fd = new FormData();
    fd.append("matatu_id", assignment.matatu_id);
    fd.append("owner_id", assignment.owner_id);
    fd.append("amount", earningForm.amount);
    fd.append("date", earningForm.date);
    fd.append("notes", earningForm.notes);
    if (earningForm.proof_file) fd.append("proof_file", earningForm.proof_file);
    const res = await fetch(`${API}/earnings`, { method: "POST", headers, body: fd });
    setEarningLoading(false);
    if (!res.ok) return showToast("Failed to submit earning", "error");
    showToast("Earning submitted ✓");
    setEarningForm({ amount: "", date: new Date().toISOString().split("T")[0], notes: "", proof_file: null });
    fetchEarnings();
  };

  // ── Submit Expenditure ──
  const submitExpenditure = async () => {
    if (!expForm.amount || !expForm.description) return showToast("Amount and description required", "error");
    setExpLoading(true);
    const fd = new FormData();
    fd.append("matatu_id", assignment.matatu_id);
    fd.append("amount", expForm.amount);
    fd.append("description", expForm.description);
    fd.append("date", expForm.date);
    if (expForm.proof_file) fd.append("proof_file", expForm.proof_file);
    const res = await fetch(`${API}/expenditures`, { method: "POST", headers, body: fd });
    setExpLoading(false);
    if (!res.ok) return showToast("Failed to record", "error");
    showToast("Expenditure recorded ✓");
    setExpForm({ amount: "", description: "", date: new Date().toISOString().split("T")[0], proof_file: null });
    fetchExpenditures();
  };

  // ── Deposit Personal Saving ──
  const depositPersonal = async () => {
    if (!personalForm.amount) return showToast("Amount required", "error");
    const res = await fetch(`${API}/savings/deposit`, {
      method: "POST", headers: jsonHeaders,
      body: JSON.stringify({ amount: parseFloat(personalForm.amount), description: personalForm.description, date: personalForm.date })
    });
    if (!res.ok) return showToast("Failed", "error");
    showToast("Personal savings deposited ✓");
    setPersonalForm({ amount: "", description: "", date: new Date().toISOString().split("T")[0] });
    fetchPersonalSavings();
  };

  // ── Deposit Matatu Saving ──
  const depositMatatu = async () => {
    if (!matatuForm.amount) return showToast("Amount required", "error");
    const res = await fetch(`${API}/savings/deposit`, {
      method: "POST", headers: jsonHeaders,
      body: JSON.stringify({
        amount: parseFloat(matatuForm.amount),
        description: matatuForm.description,
        date: matatuForm.date,
        matatu_id: assignment.matatu_id
      })
    });
    if (!res.ok) return showToast("Failed", "error");
    showToast("Matatu savings deposited ✓");
    setMatatuForm({ amount: "", description: "", date: new Date().toISOString().split("T")[0] });
    fetchMatatuSavings();
  };

  const GUARANTEE_STATUS = {
    pending:  { color: "bg-yellow-100 text-yellow-800", icon: "⏳" },
    accepted: { color: "bg-green-100 text-green-700",   icon: "✅" },
    rejected: { color: "bg-red-100 text-red-700",       icon: "❌" },
  };

  const LOAN_STATUS = {
    pending: "bg-yellow-100 text-yellow-800",
    approved: "bg-green-100 text-green-700",
    disbursed: "bg-purple-100 text-purple-800",
    repaying: "bg-blue-100 text-blue-800",
    cleared: "bg-green-200 text-green-900",
    defaulted: "bg-red-200 text-red-900",
    rejected: "bg-red-100 text-red-700",
  };

  return (
    <div className="flex min-h-screen bg-gray-950 text-white font-mono">
      {toast && <Toast {...toast} onClose={() => setToast(null)} />}

      {/* SIDEBAR */}
      <div className="w-64 bg-gray-900 border-r border-gray-800 flex flex-col p-5 flex-shrink-0">
        <div className="mb-8">
          <div className="w-12 h-12 rounded-full bg-emerald-500 flex items-center justify-center text-black font-black text-lg mb-3">
            {user?.name?.[0] || "D"}
          </div>
          <p className="font-bold text-white">{user?.name}</p>
          <p className="text-xs text-gray-400 uppercase tracking-widest mt-1 capitalize">{user?.role}</p>
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

        {assignment && (
          <div className="pt-6 border-t border-gray-800">
            <p className="text-xs text-gray-500 uppercase tracking-widest mb-2">Assigned Matatu</p>
            <p className="text-emerald-400 font-black text-lg">{assignment.plate}</p>
            <p className="text-xs text-gray-400 mt-1">Owner: {assignment.owner_name}</p>
            <span className="inline-block mt-1 text-xs capitalize bg-gray-700 text-gray-300 px-2 py-0.5 rounded">{assignment.role}</span>
          </div>
        )}
      </div>

      {/* CONTENT */}
      <div className="flex-1 overflow-y-auto p-8">
        {assignmentError && (
          <div className="bg-yellow-900 border border-yellow-600 text-yellow-200 p-4 rounded-lg mb-6">
            ⚠️ You are not assigned to any matatu yet. Contact your owner.
          </div>
        )}

        {/* ══════ HOME ══════ */}
        {activeTab === "home" && (
          <div>
            <h1 className="text-3xl font-black mb-1 text-white">
              Good day, <span className="text-emerald-400">{user?.name?.split(" ")[0]}</span>
            </h1>
            <p className="text-gray-400 mb-8 text-sm">{new Date().toLocaleDateString("en-KE",{weekday:"long",year:"numeric",month:"long",day:"numeric"})}</p>
            {assignment ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
                  <p className="text-gray-400 text-xs uppercase tracking-widest mb-1">Assigned Matatu</p>
                  <p className="text-4xl font-black text-emerald-400">{assignment.plate}</p>
                  <p className="text-gray-400 text-sm mt-2">Owner: <span className="text-white">{assignment.owner_name}</span></p>
                  <p className="text-gray-400 text-sm">Role: <span className="text-white capitalize">{assignment.role}</span></p>
                </div>
                <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
                  <p className="text-gray-400 text-xs uppercase tracking-widest mb-4">Quick Actions</p>
                  <div className="space-y-2">
                    <button onClick={() => setActiveTab("daily")} className="w-full bg-blue-600 text-white font-bold py-2 rounded-lg text-sm hover:bg-blue-500">📅 View Daily Records</button>
                    <button onClick={() => setActiveTab("earnings")} className="w-full bg-emerald-500 text-black font-bold py-2 rounded-lg text-sm hover:bg-emerald-400">💰 Submit Earnings</button>
                    <button onClick={() => setActiveTab("expenditures")} className="w-full bg-gray-700 text-white font-bold py-2 rounded-lg text-sm hover:bg-gray-600">🧾 Log Expenditure</button>
                    <button onClick={() => setActiveTab("savings")} className="w-full bg-gray-700 text-white font-bold py-2 rounded-lg text-sm hover:bg-gray-600">🏦 Savings</button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="bg-gray-900 border border-gray-800 rounded-xl p-8 text-center">
                <p className="text-4xl mb-3">🚐</p>
                <p className="text-gray-400">No matatu assigned yet</p>
              </div>
            )}
          </div>
        )}

        {/* ══════ DAILY RECORDS ══════ */}
        {activeTab === "daily" && (
          <div>
            <h2 className="text-2xl font-black mb-2">📅 Daily Matatu Records</h2>
            <p className="text-gray-400 text-sm mb-6">All records for your assigned matatu on a given date — visible to both driver and conductor.</p>

            {!assignment ? (
              <div className="bg-gray-900 border border-gray-800 rounded-xl p-8 text-center text-gray-500">No matatu assigned</div>
            ) : (
              <>
                <div className="flex gap-3 mb-6 items-end flex-wrap">
                  <div>
                    <label className="text-xs text-gray-400 uppercase tracking-widest mb-1 block">Select Date</label>
                    <input type="date" value={dailyDate} onChange={e => setDailyDate(e.target.value)}
                      className="bg-gray-800 border border-gray-700 rounded-lg p-2.5 text-white text-sm outline-none focus:border-emerald-500" />
                  </div>
                  <button onClick={fetchDailyRecords}
                    className="bg-emerald-500 text-black font-black px-5 py-2.5 rounded-lg text-sm hover:bg-emerald-400">
                    {dailyLoading ? "Loading..." : "View Records"}
                  </button>
                  <div className="bg-gray-800 border border-gray-700 rounded-lg px-4 py-2.5 text-sm">
                    <span className="text-gray-400">Matatu: </span>
                    <span className="text-emerald-400 font-bold">{assignment.plate}</span>
                  </div>
                </div>

                {dailyRecords ? (
                  <>
                    {/* Summary cards */}
                    <div className="grid grid-cols-3 gap-4 mb-6">
                      {[
                        { label:"Total Earnings",  value:`KES ${(dailyRecords.totals?.earnings||0).toLocaleString()}`,    color:"bg-emerald-900 border-emerald-700 text-emerald-300" },
                        { label:"Total Expenses",  value:`KES ${(dailyRecords.totals?.expenditures||0).toLocaleString()}`,color:"bg-red-900 border-red-700 text-red-300" },
                        { label:"Matatu Savings",  value:`KES ${(dailyRecords.totals?.savings||0).toLocaleString()}`,    color:"bg-blue-900 border-blue-700 text-blue-300" },
                      ].map((s,i) => (
                        <div key={i} className={`border rounded-xl p-4 ${s.color}`}>
                          <p className="text-2xl font-black">{s.value}</p>
                          <p className="text-xs opacity-70 mt-1">{s.label}</p>
                        </div>
                      ))}
                    </div>

                    {/* Earnings */}
                    <div className="bg-gray-900 border border-gray-800 rounded-xl mb-4 overflow-hidden">
                      <div className="px-5 py-3 bg-emerald-900/30 border-b border-gray-800">
                        <h3 className="font-black text-emerald-400 text-sm">💰 Earnings ({dailyRecords.earnings?.length||0})</h3>
                      </div>
                      {(!dailyRecords.earnings||dailyRecords.earnings.length===0) ? (
                        <p className="p-5 text-gray-500 text-sm">No earnings for this date</p>
                      ) : dailyRecords.earnings.map(e => (
                        <div key={e.id} className="flex justify-between items-center p-4 border-b border-gray-800">
                          <div>
                            <p className="font-black text-emerald-400 text-lg">KES {e.amount?.toLocaleString()}</p>
                            <p className="text-xs text-gray-400">{e.notes||"—"}</p>
                            <p className="text-xs text-gray-500 mt-0.5">
                              By: <span className="text-gray-300 capitalize">{e.submitted_by?.name} ({e.submitted_by?.role})</span>
                              {e.is_confirmed && <span className="ml-2 text-emerald-500 font-bold">✓ Confirmed</span>}
                            </p>
                          </div>
                          {e.proof_file && <a href={e.proof_file} target="_blank" rel="noreferrer" className="text-xs bg-gray-700 px-3 py-1 rounded text-gray-300">View Proof</a>}
                        </div>
                      ))}
                    </div>

                    {/* Expenditures */}
                    <div className="bg-gray-900 border border-gray-800 rounded-xl mb-4 overflow-hidden">
                      <div className="px-5 py-3 bg-red-900/30 border-b border-gray-800">
                        <h3 className="font-black text-red-400 text-sm">🧾 Expenditures ({dailyRecords.expenditures?.length||0})</h3>
                      </div>
                      {(!dailyRecords.expenditures||dailyRecords.expenditures.length===0) ? (
                        <p className="p-5 text-gray-500 text-sm">No expenditures for this date</p>
                      ) : dailyRecords.expenditures.map(e => (
                        <div key={e.id} className="flex justify-between items-center p-4 border-b border-gray-800">
                          <div>
                            <p className="font-black text-red-400 text-lg">KES {e.amount?.toLocaleString()}</p>
                            <p className="text-sm text-white">{e.description}</p>
                            <p className="text-xs text-gray-500 mt-0.5">By: <span className="text-gray-300 capitalize">{e.submitted_by?.name} ({e.submitted_by?.role})</span></p>
                          </div>
                          {e.proof_file && <a href={e.proof_file} target="_blank" rel="noreferrer" className="text-xs bg-gray-700 px-3 py-1 rounded text-gray-300">View Proof</a>}
                        </div>
                      ))}
                    </div>

                    {/* Matatu Savings */}
                    <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
                      <div className="px-5 py-3 bg-blue-900/30 border-b border-gray-800">
                        <h3 className="font-black text-blue-400 text-sm">🏦 Matatu Savings ({dailyRecords.savings?.length||0})</h3>
                      </div>
                      {(!dailyRecords.savings||dailyRecords.savings.length===0) ? (
                        <p className="p-5 text-gray-500 text-sm">No matatu savings for this date</p>
                      ) : dailyRecords.savings.map(s => (
                        <div key={s.id} className="flex justify-between items-center p-4 border-b border-gray-800">
                          <div>
                            <p className={`font-black text-lg ${s.transaction_type==="deposit"?"text-blue-400":"text-red-400"}`}>
                              {s.transaction_type==="deposit"?"+":"-"}KES {s.amount?.toLocaleString()}
                            </p>
                            <p className="text-xs text-gray-400">{s.description||"—"}</p>
                            <p className="text-xs text-gray-500 mt-0.5">By: <span className="text-gray-300 capitalize">{s.submitted_by?.name} ({s.submitted_by?.role})</span></p>
                          </div>
                          <span className={`text-xs px-2 py-0.5 rounded-full font-bold capitalize ${s.transaction_type==="deposit"?"bg-blue-900 text-blue-300":"bg-red-900 text-red-300"}`}>{s.transaction_type}</span>
                        </div>
                      ))}
                    </div>
                  </>
                ) : (
                  <div className="bg-gray-900 border border-gray-800 rounded-xl p-12 text-center text-gray-500">
                    <p className="text-4xl mb-3">📅</p>
                    <p>Select a date and click View Records</p>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* ══════ EARNINGS ══════ */}
        {activeTab === "earnings" && (
          <div>
            <h2 className="text-2xl font-black mb-6">💰 Daily Earnings</h2>
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 mb-6">
              <h3 className="font-bold text-emerald-400 mb-4 text-sm uppercase tracking-widest">Submit Earnings</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                <div>
                  <label className="text-xs text-gray-400 uppercase tracking-widest mb-1 block">Amount (KES)</label>
                  <input type="number" placeholder="e.g. 5000" value={earningForm.amount}
                    onChange={e => setEarningForm({...earningForm,amount:e.target.value})}
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg p-3 text-white placeholder-gray-600 focus:border-emerald-500 outline-none" />
                </div>
                <div>
                  <label className="text-xs text-gray-400 uppercase tracking-widest mb-1 block">Date</label>
                  <input type="date" value={earningForm.date}
                    onChange={e => setEarningForm({...earningForm,date:e.target.value})}
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg p-3 text-white focus:border-emerald-500 outline-none" />
                </div>
              </div>
              <div className="mb-4">
                <label className="text-xs text-gray-400 uppercase tracking-widest mb-1 block">Notes (optional)</label>
                <input placeholder="Any notes for the owner..." value={earningForm.notes}
                  onChange={e => setEarningForm({...earningForm,notes:e.target.value})}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg p-3 text-white placeholder-gray-600 focus:border-emerald-500 outline-none" />
              </div>
              <div className="mb-4">
                <label className="text-xs text-gray-400 uppercase tracking-widest mb-1 block">Proof of Payment</label>
                <input type="file" accept="image/*,.pdf" onChange={e => setEarningForm({...earningForm,proof_file:e.target.files[0]})}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg p-3 text-gray-400 file:mr-3 file:bg-emerald-500 file:text-black file:border-0 file:rounded file:px-3 file:py-1 file:font-bold" />
              </div>
              <button onClick={submitEarning} disabled={earningLoading}
                className="bg-emerald-500 text-black font-black px-6 py-3 rounded-lg hover:bg-emerald-400 disabled:opacity-50">
                {earningLoading ? "Submitting..." : "📤 Submit to Owner"}
              </button>
            </div>
            <h3 className="font-bold text-gray-400 mb-3 text-sm uppercase tracking-widest">Submission History</h3>
            {earnings.length===0 ? <p className="text-gray-600 text-sm">No earnings submitted yet</p> : (
              <div className="space-y-3">
                {earnings.map(e => (
                  <div key={e.id} className="bg-gray-900 border border-gray-800 rounded-xl p-4 flex justify-between items-center">
                    <div>
                      <p className="font-bold text-emerald-400 text-lg">KES {e.amount?.toLocaleString()}</p>
                      <p className="text-gray-400 text-sm">{e.date}{e.notes&&` · ${e.notes}`}</p>
                    </div>
                    <div className="flex items-center gap-3">
                      {e.proof_file && <a href={e.proof_file} target="_blank" rel="noreferrer" className="text-xs bg-gray-700 px-3 py-1 rounded text-gray-300">View Proof</a>}
                      <span className={`text-xs px-3 py-1 rounded-full font-bold ${e.is_confirmed?"bg-emerald-900 text-emerald-400":"bg-yellow-900 text-yellow-400"}`}>
                        {e.is_confirmed?"✓ Confirmed":"⏳ Pending"}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ══════ EXPENDITURES ══════ */}
        {activeTab === "expenditures" && (
          <div>
            <h2 className="text-2xl font-black mb-6">🧾 Expenditures</h2>
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 mb-6">
              <h3 className="font-bold text-emerald-400 mb-4 text-sm uppercase tracking-widest">Log Expenditure</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                <div>
                  <label className="text-xs text-gray-400 uppercase tracking-widest mb-1 block">Amount (KES)</label>
                  <input type="number" placeholder="e.g. 500" value={expForm.amount}
                    onChange={e => setExpForm({...expForm,amount:e.target.value})}
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg p-3 text-white placeholder-gray-600 focus:border-emerald-500 outline-none" />
                </div>
                <div>
                  <label className="text-xs text-gray-400 uppercase tracking-widest mb-1 block">Date</label>
                  <input type="date" value={expForm.date}
                    onChange={e => setExpForm({...expForm,date:e.target.value})}
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg p-3 text-white focus:border-emerald-500 outline-none" />
                </div>
              </div>
              <div className="mb-4">
                <label className="text-xs text-gray-400 uppercase tracking-widest mb-1 block">Description</label>
                <input placeholder="e.g. Tyre repair, fuel, service..." value={expForm.description}
                  onChange={e => setExpForm({...expForm,description:e.target.value})}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg p-3 text-white placeholder-gray-600 focus:border-emerald-500 outline-none" />
              </div>
              <div className="mb-4">
                <label className="text-xs text-gray-400 uppercase tracking-widest mb-1 block">Proof of Transaction</label>
                <input type="file" accept="image/*,.pdf" onChange={e => setExpForm({...expForm,proof_file:e.target.files[0]})}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg p-3 text-gray-400 file:mr-3 file:bg-emerald-500 file:text-black file:border-0 file:rounded file:px-3 file:py-1 file:font-bold" />
              </div>
              <button onClick={submitExpenditure} disabled={expLoading}
                className="bg-emerald-500 text-black font-black px-6 py-3 rounded-lg hover:bg-emerald-400 disabled:opacity-50">
                {expLoading ? "Saving..." : "📝 Record Expenditure"}
              </button>
            </div>
            {expenditures.length===0 ? <p className="text-gray-600 text-sm">No expenditures recorded yet</p> : (
              <div className="space-y-3">
                {expenditures.map(e => (
                  <div key={e.id} className="bg-gray-900 border border-gray-800 rounded-xl p-4 flex justify-between items-center">
                    <div>
                      <p className="font-bold text-red-400 text-lg">KES {e.amount?.toLocaleString()}</p>
                      <p className="text-white text-sm">{e.description}</p>
                      <p className="text-gray-500 text-xs">{e.date}</p>
                    </div>
                    {e.proof_file && <a href={e.proof_file} target="_blank" rel="noreferrer" className="text-xs bg-gray-700 px-3 py-1 rounded text-gray-300">View Proof</a>}
                  </div>
                ))}
                <div className="bg-gray-800 rounded-xl p-4 flex justify-between">
                  <span className="text-gray-400 text-sm">Total Expenditures</span>
                  <span className="font-black text-red-400">KES {expenditures.reduce((s,e)=>s+e.amount,0).toLocaleString()}</span>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ══════ SAVINGS ══════ */}
        {activeTab === "savings" && (
          <div>
            <h2 className="text-2xl font-black mb-2">🏦 Savings</h2>
            <p className="text-gray-400 text-sm mb-6">Personal savings belong to you only. Matatu savings are linked to {assignment?.plate} and visible to the owner.</p>

            {/* Tab switcher */}
            <div className="flex gap-2 mb-6">
              <button onClick={() => setSavingTab("personal")}
                className={`px-5 py-2.5 rounded-lg font-bold text-sm transition-all ${savingTab==="personal"?"bg-emerald-500 text-black":"bg-gray-800 text-gray-400 hover:text-white"}`}>
                👤 Personal Savings
              </button>
              <button onClick={() => setSavingTab("matatu")}
                className={`px-5 py-2.5 rounded-lg font-bold text-sm transition-all ${savingTab==="matatu"?"bg-blue-600 text-white":"bg-gray-800 text-gray-400 hover:text-white"}`}>
                🚐 Matatu Savings ({assignment?.plate})
              </button>
            </div>

            {savingTab === "personal" && (
              <>
                <div className="bg-gradient-to-br from-emerald-900 to-emerald-800 border border-emerald-700 rounded-xl p-6 mb-6">
                  <p className="text-emerald-300 text-xs uppercase tracking-widest mb-1">Personal Balance</p>
                  <p className="text-4xl font-black text-white">KES {personalSavings.balance?.toLocaleString()||0}</p>
                  <p className="text-emerald-400 text-xs mt-2">Only visible to you</p>
                </div>
                <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 mb-6">
                  <h3 className="font-bold text-emerald-400 mb-4 text-sm uppercase tracking-widest">Deposit to Personal Savings</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                    <div>
                      <label className="text-xs text-gray-400 uppercase tracking-widest mb-1 block">Amount (KES)</label>
                      <input type="number" placeholder="e.g. 1000" value={personalForm.amount}
                        onChange={e => setPersonalForm({...personalForm,amount:e.target.value})}
                        className="w-full bg-gray-800 border border-gray-700 rounded-lg p-3 text-white placeholder-gray-600 focus:border-emerald-500 outline-none" />
                    </div>
                    <div>
                      <label className="text-xs text-gray-400 uppercase tracking-widest mb-1 block">Date</label>
                      <input type="date" value={personalForm.date}
                        onChange={e => setPersonalForm({...personalForm,date:e.target.value})}
                        className="w-full bg-gray-800 border border-gray-700 rounded-lg p-3 text-white focus:border-emerald-500 outline-none" />
                    </div>
                  </div>
                  <div className="mb-4">
                    <label className="text-xs text-gray-400 uppercase tracking-widest mb-1 block">Description</label>
                    <input placeholder="e.g. Monthly savings" value={personalForm.description}
                      onChange={e => setPersonalForm({...personalForm,description:e.target.value})}
                      className="w-full bg-gray-800 border border-gray-700 rounded-lg p-3 text-white placeholder-gray-600 focus:border-emerald-500 outline-none" />
                  </div>
                  <button onClick={depositPersonal} className="bg-emerald-500 text-black font-black px-6 py-3 rounded-lg hover:bg-emerald-400">💳 Deposit</button>
                </div>
                <h3 className="font-bold text-gray-400 mb-3 text-sm uppercase tracking-widest">Personal Transaction History</h3>
                {(!personalSavings.transactions||personalSavings.transactions.length===0) ? (
                  <p className="text-gray-600 text-sm">No personal transactions yet</p>
                ) : (
                  <div className="space-y-2">
                    {personalSavings.transactions.map(t => (
                      <div key={t.id} className="bg-gray-900 border border-gray-800 rounded-xl p-4 flex justify-between items-center">
                        <div>
                          <p className="text-sm text-white">{t.description||"Deposit"}</p>
                          <p className="text-xs text-gray-500">{t.date}</p>
                        </div>
                        <p className={`font-black ${t.transaction_type==="deposit"?"text-emerald-400":"text-red-400"}`}>
                          {t.transaction_type==="deposit"?"+":"-"}KES {t.amount?.toLocaleString()}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}

            {savingTab === "matatu" && (
              <>
                <div className="bg-gradient-to-br from-blue-900 to-blue-800 border border-blue-700 rounded-xl p-6 mb-6">
                  <p className="text-blue-300 text-xs uppercase tracking-widest mb-1">Matatu Savings Balance — {assignment?.plate}</p>
                  <p className="text-4xl font-black text-white">KES {matatuSavings.balance?.toLocaleString()||0}</p>
                  <p className="text-blue-400 text-xs mt-2">Visible to owner and all matatu crew</p>
                </div>
                <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 mb-6">
                  <h3 className="font-bold text-blue-400 mb-4 text-sm uppercase tracking-widest">Deposit to Matatu Savings</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                    <div>
                      <label className="text-xs text-gray-400 uppercase tracking-widest mb-1 block">Amount (KES)</label>
                      <input type="number" placeholder="e.g. 1000" value={matatuForm.amount}
                        onChange={e => setMatatuForm({...matatuForm,amount:e.target.value})}
                        className="w-full bg-gray-800 border border-gray-700 rounded-lg p-3 text-white placeholder-gray-600 focus:border-blue-500 outline-none" />
                    </div>
                    <div>
                      <label className="text-xs text-gray-400 uppercase tracking-widest mb-1 block">Date</label>
                      <input type="date" value={matatuForm.date}
                        onChange={e => setMatatuForm({...matatuForm,date:e.target.value})}
                        className="w-full bg-gray-800 border border-gray-700 rounded-lg p-3 text-white focus:border-blue-500 outline-none" />
                    </div>
                  </div>
                  <div className="mb-4">
                    <label className="text-xs text-gray-400 uppercase tracking-widest mb-1 block">Description</label>
                    <input placeholder="e.g. Daily matatu savings" value={matatuForm.description}
                      onChange={e => setMatatuForm({...matatuForm,description:e.target.value})}
                      className="w-full bg-gray-800 border border-gray-700 rounded-lg p-3 text-white placeholder-gray-600 focus:border-blue-500 outline-none" />
                  </div>
                  <button onClick={depositMatatu} className="bg-blue-600 text-white font-black px-6 py-3 rounded-lg hover:bg-blue-500">💳 Deposit to Matatu</button>
                </div>
                <h3 className="font-bold text-gray-400 mb-3 text-sm uppercase tracking-widest">Matatu Savings History</h3>
                {(!matatuSavings.transactions||matatuSavings.transactions.length===0) ? (
                  <p className="text-gray-600 text-sm">No matatu savings yet</p>
                ) : (
                  <div className="space-y-2">
                    {matatuSavings.transactions.map(t => (
                      <div key={t.id} className="bg-gray-900 border border-gray-800 rounded-xl p-4 flex justify-between items-center">
                        <div>
                          <p className="text-sm text-white">{t.description||"Deposit"}</p>
                          <p className="text-xs text-gray-500">{t.date}</p>
                        </div>
                        <p className={`font-black ${t.transaction_type==="deposit"?"text-blue-400":"text-red-400"}`}>
                          {t.transaction_type==="deposit"?"+":"-"}KES {t.amount?.toLocaleString()}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* ══════ LOANS ══════ */}
        {activeTab === "loans" && <LoanDashboard />}

        {/* ══════ GUARANTOR HISTORY ══════ */}
        {activeTab === "guarantors" && (
          <div>
            <h2 className="text-2xl font-black mb-2">🤝 Guarantor History</h2>
            <p className="text-gray-400 text-sm mb-6">All loans you have been asked to guarantee — pending, accepted, and rejected. Accepted records remain permanently visible.</p>
            <button onClick={fetchGuarantorHistory} className="mb-4 bg-gray-700 text-white text-xs px-3 py-1.5 rounded hover:bg-gray-600 font-bold">🔄 Refresh</button>
            {guarantorHistory.length===0 ? (
              <div className="bg-gray-900 border border-gray-800 rounded-xl p-8 text-center text-gray-500">
                <p className="text-4xl mb-3">🤝</p>
                <p>No guarantor requests yet</p>
              </div>
            ) : (
              <div className="space-y-4">
                {guarantorHistory.map(g => (
                  <div key={g.id} className={`bg-gray-900 border rounded-xl p-5 ${g.status==="accepted"?"border-green-700":g.status==="rejected"?"border-red-800":"border-yellow-700"}`}>
                    <div className="flex justify-between items-start mb-3">
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <p className="font-black text-white">{g.member_name}</p>
                          <span className="text-xs text-gray-400">{g.membership_no}</span>
                        </div>
                        <p className="text-gray-400 text-sm">{g.loan_type} loan</p>
                      </div>
                      <span className={`text-xs px-3 py-1 rounded-full font-bold ${(GUARANTEE_STATUS[g.status]||{}).color}`}>
                        {(GUARANTEE_STATUS[g.status]||{}).icon} {g.status}
                      </span>
                    </div>
                    <div className="grid grid-cols-2 gap-3 text-sm mb-3">
                      <div className="bg-gray-800 rounded-lg p-3">
                        <p className="text-gray-400 text-xs">Loan Amount</p>
                        <p className="font-black text-white">KES {g.loan_amount?.toLocaleString()}</p>
                      </div>
                      <div className="bg-gray-800 rounded-lg p-3">
                        <p className="text-gray-400 text-xs">Loan Status</p>
                        <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${LOAN_STATUS[g.loan_status]||"bg-gray-700 text-gray-400"}`}>{g.loan_status?.replace(/_/g," ")}</span>
                      </div>
                    </div>
                    <p className="text-gray-500 text-xs">Purpose: {g.loan_purpose}</p>
                    {g.status==="accepted" && (
                      <div className="mt-3 bg-green-900/30 border border-green-800 rounded-lg p-3 text-xs">
                        <p className="text-green-400 font-bold mb-1">✅ You are an active guarantor for this loan</p>
                        <div className="flex gap-4 text-gray-400">
                          <span>Repaid: <span className="text-green-400 font-bold">KES {g.amount_repaid?.toLocaleString()}</span></span>
                          <span>Outstanding: <span className="text-red-400 font-bold">KES {((g.total_payable||0)-(g.amount_repaid||0)).toLocaleString()}</span></span>
                        </div>
                      </div>
                    )}
                    <p className="text-gray-600 text-xs mt-2">Requested: {new Date(g.created_at).toLocaleDateString()}{g.responded_at&&` · Responded: ${new Date(g.responded_at).toLocaleDateString()}`}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}