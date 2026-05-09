import { useEffect, useState, useCallback } from "react";
import API from "../api";
import { useAuth } from "../context/AuthContext";
import LoanDashboard from "./LoanDashboard";

const TABS = [
  { key: "home",         label: "🏠 Overview" },
  { key: "fleet",        label: "🚐 My Fleet" },
  { key: "records",      label: "📅 Records per Matatu" },
  { key: "earnings",     label: "💰 Earnings" },
  { key: "expenditures", label: "🧾 Expenditures" },
  { key: "trips",        label: "🎫 Trips" },
  { key: "savings",      label: "🏦 Savings" },
  { key: "loans",        label: "📋 Loans" },
  { key: "payments",     label: "💳 SACCO Payments" },
];

const SACCO_PAYMENT_TYPES = [
  "Entrance/Registration Fee","Share Capital","Branding & Licensing",
  "Monthly Deposit","Weekly Deposit","Initial Capital (33-Seater)","Other",
];

const OWNER_DOC_TYPES = [
  "Inspection Certificate","Speed Governor","SACCO Verification",
  "Logbook","Insurance","PSV Badge","Driving License","TLB",
];

function Toast({ msg, type, onClose }) {
  useEffect(() => { const t = setTimeout(onClose, 3000); return () => clearTimeout(t); }, [onClose]);
  return (
    <div className={`fixed top-5 right-5 z-50 px-5 py-3 rounded shadow-xl text-sm font-bold
      ${type === "error" ? "bg-red-600 text-white" : "bg-amber-500 text-black"}`}>
      {msg}
    </div>
  );
}

export default function OwnerDashboard() {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState("home");
  const [matatus, setMatatus]     = useState([]);
  const [selectedMatatu, setSelectedMatatu] = useState(null);
  const [toast, setToast]         = useState(null);
  const showToast = (msg, type = "success") => setToast({ msg, type });

  const token   = localStorage.getItem("token");
  const headers = { Authorization: `Bearer ${token}` };
  const jsonH   = { ...headers, "Content-Type": "application/json" };

  // fleet
  const [members, setMembers]       = useState([]);
  const [assignments, setAssignments] = useState([]);
  const [assignForm, setAssignForm] = useState({ member_id: "", role: "driver" });
  const [memberSearch, setMemberSearch] = useState("");
  const [showMemberDrop, setShowMemberDrop] = useState(false);
  const [showDocModal, setShowDocModal]     = useState(false);
  const [newDoc, setNewDoc] = useState({ number:"", type:"", issue:"", expiry:"", file:null });
  const [showProgressModal, setShowProgressModal] = useState(false);
  const [newProgress, setNewProgress] = useState({ date:"", earnings:"", expenses:"", savings:"" });

  // earnings
  const [earnings, setEarnings]     = useState([]);
  const [earningsDate, setEarningsDate] = useState("");

  // expenditures
  const [expenditures, setExpenditures] = useState([]);

  // trips
  const [trips, setTrips]           = useState([]);
  const [tripsDate, setTripsDate]   = useState(new Date().toISOString().split("T")[0]);

  // savings — OWNER PERSONAL ONLY (no driver/conductor savings)
  const [savingsData, setSavingsData] = useState({ balance: 0, transactions: [] });
  const [matatuSavings, setMatatuSavings] = useState({});  // owner-deposited matatu savings
  const [savingForm, setSavingForm] = useState({
    amount:"", description:"", date: new Date().toISOString().split("T")[0], matatu_id:""
  });

  // records per matatu
  const [recordsMatatu, setRecordsMatatu] = useState(null);
  const [recordsDate, setRecordsDate]     = useState(new Date().toISOString().split("T")[0]);
  const [recordsData, setRecordsData]     = useState(null);
  const [recordsLoading, setRecordsLoading] = useState(false);

  // loans
  const [saccoPayments, setSaccoPayments] = useState([]);
  const [paymentForm, setPaymentForm]     = useState({
    payment_type:"", amount:"", matatu_id:"",
    date: new Date().toISOString().split("T")[0], proof_file:null, notes:""
  });
  const [paymentLoading, setPaymentLoading] = useState(false);

  // ─── fetch ───────────────────────────────────────────────────
  const fetchMatatus = useCallback(async () => {
    const res  = await fetch(`${API}/matatus`);
    const data = await res.json();
    setMatatus((data || []).filter(m => m.owner_member_no === user?.membership_no));
  }, [user?.membership_no]);

  const fetchMembers = useCallback(async () => {
    const res  = await fetch(`${API}/hr/members`);
    const data = await res.json();
    setMembers((data || []).filter(m => ["driver","conductor"].includes(m.role)));
  }, []);

  const fetchAssignments = async (matatuId) => {
    const res  = await fetch(`${API}/assignments/matatu/${matatuId}`, { headers });
    const data = await res.json();
    setAssignments(data || []);
  };

  const fetchOwnerEarnings = useCallback(async () => {
    let url = `${API}/earnings/owner`;
    if (earningsDate) url += `?date=${earningsDate}`;
    const res  = await fetch(url, { headers });
    const data = await res.json();
    setEarnings(Array.isArray(data) ? data : []);
  }, [earningsDate]);

  const fetchExpenditures = async (matatuId) => {
    const res  = await fetch(`${API}/expenditures/matatu/${matatuId}`, { headers });
    const data = await res.json();
    setExpenditures(data || []);
  };

  const fetchTrips = useCallback(async () => {
    let url = `${API}/receipts/owner-trips`;
    if (tripsDate) url += `?date=${tripsDate}`;
    const res  = await fetch(url, { headers });
    const data = await res.json();
    setTrips(Array.isArray(data) ? data : []);
  }, [tripsDate]);

  // OWNER personal savings only — /savings/my returns ALL savings including where matatu_id is set
  // We filter: only show transactions where matatu_id is null (personal) in the personal view
  const fetchSavings = useCallback(async () => {
    const res  = await fetch(`${API}/savings/my`, { headers });
    const data = await res.json();
    if (data) {
      // filter to personal only (no matatu_id) for display
      const personalTx = (data.transactions || []).filter(t => !t.matatu_id);
      const personalBal = personalTx.reduce(
        (s, t) => s + (t.transaction_type === "deposit" ? t.amount : -t.amount), 0
      );
      setSavingsData({ balance: personalBal, transactions: personalTx });
    }
  }, []);

  const fetchMatatuSavings = async (matatuId) => {
    // This fetches ALL savings linked to this matatu (driver + conductor + owner deposits)
    // But owner sees it only from /savings/matatu/:id which is the total pool
    // We need to show ONLY owner's own deposits to the matatu
    const res  = await fetch(`${API}/savings/my`, { headers });
    const data = await res.json();
    if (data) {
      const mTx = (data.transactions || []).filter(t => t.matatu_id === matatuId);
      const mBal = mTx.reduce(
        (s, t) => s + (t.transaction_type === "deposit" ? t.amount : -t.amount), 0
      );
      setMatatuSavings(prev => ({ ...prev, [matatuId]: { balance: mBal, transactions: mTx } }));
    }
  };

  const fetchSaccoPayments = useCallback(async () => {
    const res = await fetch(`${API}/sacco-payments/my`, { headers });
    if (res.ok) { const d = await res.json(); setSaccoPayments(Array.isArray(d) ? d : []); }
  }, []);

  useEffect(() => { fetchMatatus(); fetchMembers(); fetchSavings(); fetchSaccoPayments(); }, []);

  useEffect(() => {
    if (activeTab === "earnings")     fetchOwnerEarnings();
    if (activeTab === "expenditures" && selectedMatatu) fetchExpenditures(selectedMatatu.id);
    if (activeTab === "trips")        fetchTrips();
    if (activeTab === "savings")      fetchSavings();
    if (activeTab === "payments")     fetchSaccoPayments();
  }, [activeTab, selectedMatatu, earningsDate, tripsDate]);

  // ─── Records per matatu ──────────────────────────────────────
  const fetchRecords = async () => {
    if (!recordsMatatu) return showToast("Select a matatu first", "error");
    setRecordsLoading(true); setRecordsData(null);
    const res = await fetch(
      `${API}/owner/matatu-records?matatu_id=${recordsMatatu.id}&date=${recordsDate}`,
      { headers }
    );
    if (res.ok) setRecordsData(await res.json());
    else showToast("Failed to load records", "error");
    setRecordsLoading(false);
  };

  // ─── fleet actions ───────────────────────────────────────────
  const getDocStatus = (doc) => {
    if (!doc) return "Missing";
    const diff = (new Date(doc.expiry) - new Date()) / 86400000;
    if (diff < 0) return "Expired";
    if (diff < 7) return "Near Expiry";
    return "Valid";
  };
  const docColor = s => s === "Expired" || s === "Missing" ? "text-red-600" : s === "Near Expiry" ? "text-yellow-500" : "text-green-600";

  const saveDocument = async () => {
    if (!selectedMatatu) return;
    const fd = new FormData();
    fd.append("matatu_id", selectedMatatu.id);
    ["number","type","issue","expiry"].forEach(k => fd.append(k, newDoc[k]));
    if (newDoc.file) fd.append("file", newDoc.file);
    const res = await fetch(`${API}/documents`, { method:"POST", body:fd });
    if (!res.ok) return showToast("Failed to save document","error");
    showToast("Document saved ✓");
    setShowDocModal(false);
    setNewDoc({ number:"", type:"", issue:"", expiry:"", file:null });
    fetchMatatus();
  };

  const saveProgress = async () => {
    if (!selectedMatatu) return;
    const res = await fetch(`${API}/progress`, {
      method:"POST", headers:jsonH,
      body: JSON.stringify({ matatu_id: selectedMatatu.id, ...newProgress })
    });
    if (!res.ok) return showToast("Failed","error");
    showToast("Progress saved ✓");
    setShowProgressModal(false);
    setNewProgress({ date:"", earnings:"", expenses:"", savings:"" });
    fetchMatatus();
  };

  const assignMember = async () => {
    if (!assignForm.member_id || !selectedMatatu) return showToast("Select a member","error");
    const res = await fetch(`${API}/assignments`, {
      method:"POST", headers:jsonH,
      body: JSON.stringify({ matatu_id:selectedMatatu.id, member_id:assignForm.member_id, role:assignForm.role })
    });
    if (!res.ok) return showToast("Assignment failed","error");
    showToast(`${assignForm.role} assigned ✓`);
    setAssignForm({ member_id:"", role:"driver" }); setMemberSearch("");
    fetchAssignments(selectedMatatu.id);
  };

  const removeAssignment = async (id) => {
    if (!window.confirm("Remove this assignment?")) return;
    await fetch(`${API}/assignments/${id}/deactivate`, { method:"PUT", headers });
    fetchAssignments(selectedMatatu.id); showToast("Assignment removed");
  };

  const confirmEarning = async (id) => {
    await fetch(`${API}/earnings/${id}/confirm`, { method:"PUT", headers });
    showToast("Earning confirmed ✓"); fetchOwnerEarnings();
  };

  const depositSaving = async () => {
    if (!savingForm.amount) return showToast("Amount required","error");
    const body = {
      amount: parseFloat(savingForm.amount),
      description: savingForm.description,
      date: savingForm.date,
    };
    if (savingForm.matatu_id) body.matatu_id = savingForm.matatu_id;
    const res = await fetch(`${API}/savings/deposit`, {
      method:"POST", headers:jsonH, body:JSON.stringify(body)
    });
    if (!res.ok) return showToast("Deposit failed","error");
    showToast("Savings deposited ✓");
    setSavingForm({ amount:"", description:"", date:new Date().toISOString().split("T")[0], matatu_id:"" });
    fetchSavings();
    if (savingForm.matatu_id) fetchMatatuSavings(savingForm.matatu_id);
  };

  const submitSaccoPayment = async () => {
    if (!paymentForm.payment_type || !paymentForm.amount) return showToast("Payment type and amount required","error");
    setPaymentLoading(true);
    const fd = new FormData();
    ["payment_type","amount","matatu_id","date","notes"].forEach(k => fd.append(k, paymentForm[k] || ""));
    if (paymentForm.proof_file) fd.append("proof_file", paymentForm.proof_file);
    const res = await fetch(`${API}/sacco-payments`, { method:"POST", headers, body:fd });
    setPaymentLoading(false);
    if (!res.ok) return showToast("Payment failed","error");
    showToast("Payment recorded ✓");
    setPaymentForm({ payment_type:"", amount:"", matatu_id:"", date:new Date().toISOString().split("T")[0], proof_file:null, notes:"" });
    fetchSaccoPayments();
  };

  const filteredMembers = members.filter(m =>
    m.name?.toLowerCase().includes(memberSearch.toLowerCase()) ||
    m.membership_no?.toLowerCase().includes(memberSearch.toLowerCase())
  );

  const totalEarnings     = earnings.reduce((s,e)=>s+(e.amount||0),0);
  const totalExpenditures = expenditures.reduce((s,e)=>s+(e.amount||0),0);

  // ─── submitter badge ──────────────────────────────────────────
  const SubmitterBadge = ({ sub }) => {
    if (!sub) return null;
    const colors = { driver:"bg-blue-100 text-blue-700", conductor:"bg-purple-100 text-purple-700", owner:"bg-amber-100 text-amber-700" };
    return (
      <span className={`text-xs px-2 py-0.5 rounded-full font-bold capitalize ${colors[sub.role]||"bg-gray-100 text-gray-600"}`}>
        {sub.name} · {sub.role}
      </span>
    );
  };

  return (
    <div className="flex min-h-screen bg-stone-50" style={{ fontFamily:"'Georgia', serif" }}>
      {toast && <Toast {...toast} onClose={() => setToast(null)} />}

      {/* SIDEBAR */}
      <div className="w-64 bg-stone-900 text-stone-100 flex flex-col p-6 flex-shrink-0">
        <div className="mb-8 pb-6 border-b border-stone-700">
          <div className="w-14 h-14 rounded-full bg-amber-500 flex items-center justify-center text-black font-black text-xl mb-3">
            {user?.name?.[0]||"O"}
          </div>
          <p className="font-bold text-white text-lg">{user?.name}</p>
          <p className="text-xs text-stone-400 uppercase tracking-widest mt-1">Vehicle Owner</p>
          <p className="text-xs text-stone-500 mt-1">{user?.membership_no}</p>
        </div>
        <nav className="space-y-1 flex-1">
          {TABS.map(tab => (
            <button key={tab.key} onClick={() => setActiveTab(tab.key)}
              className={`w-full text-left px-4 py-2.5 rounded text-sm transition-all
                ${activeTab===tab.key?"bg-amber-500 text-black font-bold":"text-stone-400 hover:bg-stone-800 hover:text-white"}`}>
              {tab.label}
            </button>
          ))}
        </nav>
        <div className="mt-6 pt-4 border-t border-stone-700">
          <p className="text-xs text-stone-500 mb-1">Fleet Size</p>
          <p className="text-2xl font-black text-amber-400">{matatus.length}</p>
          <p className="text-xs text-stone-500">matatus registered</p>
        </div>
      </div>

      {/* CONTENT */}
      <div className="flex-1 overflow-y-auto">

        {/* ══════════════ OVERVIEW ══════════════ */}
        {activeTab === "home" && (
          <div className="p-8">
            <h1 className="text-4xl font-black text-stone-800 mb-1">
              Welcome, <span className="text-amber-600">{user?.name?.split(" ")[0]}</span>
            </h1>
            <p className="text-stone-400 mb-8 text-sm">
              {new Date().toLocaleDateString("en-KE",{weekday:"long",year:"numeric",month:"long",day:"numeric"})}
            </p>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
              {[
                { label:"Matatus",        value:matatus.length,                                             color:"bg-amber-50 border-amber-200 text-amber-700" },
                { label:"Personal Savings",value:`KES ${savingsData.balance?.toLocaleString()||0}`,         color:"bg-green-50 border-green-200 text-green-700" },
                { label:"SACCO Payments", value:saccoPayments.length,                                       color:"bg-purple-50 border-purple-200 text-purple-700" },
                { label:"Today's Trips",  value:trips.length,                                               color:"bg-blue-50 border-blue-200 text-blue-700" },
              ].map((c,i) => (
                <div key={i} className={`border rounded-xl p-5 ${c.color}`}>
                  <p className="text-xs text-stone-500 uppercase tracking-widest mb-1">{c.label}</p>
                  <p className="text-2xl font-black">{c.value}</p>
                </div>
              ))}
            </div>

            <h2 className="text-lg font-black text-stone-700 mb-3">Your Fleet</h2>
            {matatus.length === 0 ? (
              <div className="bg-white border border-stone-200 rounded-xl p-8 text-center text-stone-400">No matatus registered</div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {matatus.map(m => (
                  <div key={m.id}
                    onClick={() => { setSelectedMatatu(m); setActiveTab("fleet"); fetchAssignments(m.id); fetchMatatuSavings(m.id); }}
                    className="bg-white border border-stone-200 rounded-xl p-5 cursor-pointer hover:border-amber-400 hover:shadow-md transition-all">
                    <p className="text-xl font-black text-stone-800">🚐 {m.plate}</p>
                    <p className="text-xs text-stone-400 mt-1">Click to manage</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ══════════════ FLEET ══════════════ */}
        {activeTab === "fleet" && (
          <div className="p-8">
            <h2 className="text-2xl font-black text-stone-800 mb-6">🚐 Fleet Management</h2>
            <div className="mb-6">
              <label className="text-xs text-stone-500 uppercase tracking-widest mb-2 block">Select Matatu</label>
              <div className="flex gap-2 flex-wrap">
                {matatus.map(m => (
                  <button key={m.id}
                    onClick={() => { setSelectedMatatu(m); fetchAssignments(m.id); fetchMatatuSavings(m.id); }}
                    className={`px-4 py-2 rounded-lg text-sm font-bold border transition-all
                      ${selectedMatatu?.id===m.id?"bg-amber-500 border-amber-500 text-black":"bg-white border-stone-300 text-stone-600 hover:border-amber-400"}`}>
                    {m.plate}
                  </button>
                ))}
              </div>
            </div>

            {selectedMatatu && (
              <div className="space-y-6">
                {/* DOCUMENTS */}
                <div className="bg-white border border-stone-200 rounded-xl p-6">
                  <div className="flex justify-between items-center mb-4">
                    <h3 className="font-black text-stone-700">Documents — {selectedMatatu.plate}</h3>
                    <button onClick={() => setShowDocModal(true)} className="bg-amber-500 text-black font-bold px-4 py-2 rounded-lg text-sm hover:bg-amber-400">+ Add Document</button>
                  </div>
                  {OWNER_DOC_TYPES.map(type => {
                    const doc    = selectedMatatu.documents?.find(d => d.type === type);
                    const status = getDocStatus(doc);
                    return (
                      <div key={type} className="flex justify-between items-center border-b border-stone-100 py-2">
                        <span className="text-sm text-stone-700">{type}</span>
                        <div className="flex items-center gap-3">
                          {doc?.file && <a href={doc.file.startsWith("http")?doc.file:`${API}/uploads/${doc.file}`} target="_blank" rel="noreferrer" className="text-xs text-blue-600 hover:underline">View</a>}
                          {doc && <span className="text-xs text-stone-400">{doc.expiry}</span>}
                          <span className={`text-xs font-bold ${docColor(status)}`}>{status}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* DAILY PROGRESS */}
                <div className="bg-white border border-stone-200 rounded-xl p-6">
                  <div className="flex justify-between items-center mb-4">
                    <h3 className="font-black text-stone-700">Daily Progress</h3>
                    <button onClick={() => setShowProgressModal(true)} className="bg-stone-700 text-white font-bold px-4 py-2 rounded-lg text-sm hover:bg-stone-600">+ Add Progress</button>
                  </div>
                  {selectedMatatu.progress?.length > 0 ? (
                    <div className="space-y-2 max-h-48 overflow-y-auto">
                      {selectedMatatu.progress.map((p,i) => (
                        <div key={i} className="flex justify-between text-sm p-2 bg-stone-50 rounded border border-stone-100">
                          <span className="text-stone-500">📅 {p.date}</span>
                          <span className="text-green-600">+{p.earnings}</span>
                          <span className="text-red-500">-{p.expenses}</span>
                          <span className="text-blue-600">💾 {p.savings}</span>
                        </div>
                      ))}
                    </div>
                  ) : <p className="text-stone-400 text-sm">No progress recorded</p>}
                </div>

                {/* CREW */}
                <div className="bg-white border border-stone-200 rounded-xl p-6">
                  <h3 className="font-black text-stone-700 mb-4">Current Crew</h3>
                  {assignments.length === 0 ? <p className="text-stone-400 text-sm mb-4">No crew assigned</p> : (
                    <div className="space-y-2 mb-4">
                      {assignments.map(a => (
                        <div key={a.id} className="flex justify-between items-center p-3 bg-stone-50 rounded-lg border border-stone-100">
                          <div>
                            <p className="font-bold text-stone-800">{a.member_name}</p>
                            <p className="text-xs text-stone-400">{a.membership_no} · <span className="capitalize text-amber-600 font-bold">{a.role}</span></p>
                          </div>
                          <button onClick={() => removeAssignment(a.id)} className="text-xs bg-red-50 text-red-600 border border-red-200 px-3 py-1 rounded hover:bg-red-100">Remove</button>
                        </div>
                      ))}
                    </div>
                  )}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <div className="relative md:col-span-2">
                      <input placeholder="Search driver/conductor..." value={memberSearch}
                        onChange={e => { setMemberSearch(e.target.value); setShowMemberDrop(true); }}
                        onFocus={() => setShowMemberDrop(true)}
                        className="w-full border border-stone-300 rounded-lg p-2.5 text-sm focus:border-amber-400 outline-none" />
                      {showMemberDrop && memberSearch && (
                        <div className="absolute z-50 bg-white border border-stone-200 w-full max-h-48 overflow-y-auto shadow-lg rounded-lg mt-1">
                          {filteredMembers.length > 0 ? filteredMembers.map(m => (
                            <div key={m.id} onClick={() => { setAssignForm({...assignForm,member_id:m.id}); setMemberSearch(`${m.name} (${m.membership_no})`); setShowMemberDrop(false); }}
                              className="p-3 hover:bg-amber-50 cursor-pointer border-b border-stone-100">
                              <p className="font-bold text-sm">{m.name}</p>
                              <p className="text-xs text-stone-400">{m.membership_no} · <span className="capitalize">{m.role}</span></p>
                            </div>
                          )) : <p className="p-3 text-stone-400 text-sm">No members found</p>}
                        </div>
                      )}
                    </div>
                    <select value={assignForm.role} onChange={e => setAssignForm({...assignForm,role:e.target.value})}
                      className="border border-stone-300 rounded-lg p-2.5 text-sm focus:border-amber-400 outline-none">
                      <option value="driver">Driver</option>
                      <option value="conductor">Conductor</option>
                    </select>
                  </div>
                  <button onClick={assignMember} className="mt-3 bg-amber-500 text-black font-black px-6 py-2.5 rounded-lg text-sm hover:bg-amber-400">
                    + Assign to {selectedMatatu.plate}
                  </button>
                </div>

                {/* OWNER'S OWN MATATU SAVINGS (not driver/conductor savings) */}
                {matatuSavings[selectedMatatu.id] && (
                  <div className="bg-white border border-stone-200 rounded-xl p-6">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="font-black text-stone-700">My Savings for {selectedMatatu.plate}</h3>
                      <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-bold">Owner deposits only</span>
                    </div>
                    <p className="text-3xl font-black text-green-600 mb-3">
                      KES {matatuSavings[selectedMatatu.id]?.balance?.toLocaleString()||0}
                    </p>
                    <div className="space-y-2 max-h-40 overflow-y-auto">
                      {(matatuSavings[selectedMatatu.id]?.transactions||[]).map(t => (
                        <div key={t.id} className="flex justify-between text-sm p-2 bg-stone-50 rounded">
                          <span className="text-stone-500">{t.description||"Deposit"} · {t.date}</span>
                          <span className={`font-bold ${t.transaction_type==="deposit"?"text-green-600":"text-red-500"}`}>
                            {t.transaction_type==="deposit"?"+":"-"}KES {t.amount?.toLocaleString()}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* ══════════════ RECORDS PER MATATU ══════════════ */}
        {activeTab === "records" && (
          <div className="p-8">
            <h2 className="text-2xl font-black text-stone-800 mb-2">📅 Records per Matatu</h2>
            <p className="text-stone-400 text-sm mb-6">
              View all earnings, expenditures, and savings submitted for a matatu on a specific date — including who submitted each record.
            </p>

            {/* Controls */}
            <div className="flex gap-3 mb-6 flex-wrap items-end">
              <div>
                <label className="text-xs text-stone-500 uppercase tracking-widest mb-1 block">Select Matatu</label>
                <div className="flex gap-2 flex-wrap">
                  {matatus.map(m => (
                    <button key={m.id} onClick={() => setRecordsMatatu(m)}
                      className={`px-4 py-2.5 rounded-lg text-sm font-bold border transition-all
                        ${recordsMatatu?.id===m.id?"bg-amber-500 border-amber-500 text-black":"bg-white border-stone-300 text-stone-600 hover:border-amber-400"}`}>
                      🚐 {m.plate}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="text-xs text-stone-500 uppercase tracking-widest mb-1 block">Date</label>
                <input type="date" value={recordsDate} onChange={e => setRecordsDate(e.target.value)}
                  className="border border-stone-300 rounded-lg p-2.5 text-sm focus:border-amber-400 outline-none" />
              </div>
              <button onClick={fetchRecords}
                className="bg-amber-500 text-black font-black px-5 py-2.5 rounded-lg text-sm hover:bg-amber-400">
                {recordsLoading ? "Loading..." : "View Records"}
              </button>
            </div>

            {!recordsData && !recordsLoading && (
              <div className="bg-white border border-stone-200 rounded-xl p-12 text-center text-stone-400">
                <p className="text-4xl mb-3">📅</p>
                <p>Select a matatu and date, then click View Records</p>
              </div>
            )}

            {recordsData && (
              <>
                {/* Summary cards */}
                <div className="flex items-center gap-3 mb-5">
                  <span className="text-xl font-black text-stone-700">🚐 {recordsData.matatu?.plate}</span>
                  <span className="text-stone-400">·</span>
                  <span className="text-stone-500 text-sm">{recordsDate}</span>
                </div>
                <div className="grid grid-cols-3 gap-4 mb-6">
                  {[
                    { label:"Total Earnings",     value:`KES ${(recordsData.totals?.earnings||0).toLocaleString()}`,        color:"bg-green-50 border-green-200 text-green-700" },
                    { label:"Total Expenditures", value:`KES ${(recordsData.totals?.expenditures||0).toLocaleString()}`,    color:"bg-red-50 border-red-200 text-red-700" },
                    { label:"Savings Balance",    value:`KES ${(recordsData.totals?.savings_balance||0).toLocaleString()}`, color:"bg-blue-50 border-blue-200 text-blue-700" },
                  ].map((s,i) => (
                    <div key={i} className={`border rounded-xl p-4 ${s.color}`}>
                      <p className="text-xs uppercase tracking-widest mb-1 opacity-70">{s.label}</p>
                      <p className="text-2xl font-black">{s.value}</p>
                    </div>
                  ))}
                </div>

                {/* Earnings */}
                <div className="bg-white border border-stone-200 rounded-xl mb-4 overflow-hidden">
                  <div className="px-5 py-3 bg-green-50 border-b border-stone-200 flex justify-between items-center">
                    <h3 className="font-black text-green-700 text-sm">💰 Earnings ({recordsData.earnings?.length||0})</h3>
                    <span className="font-black text-green-700">Total: KES {(recordsData.totals?.earnings||0).toLocaleString()}</span>
                  </div>
                  {(!recordsData.earnings||recordsData.earnings.length===0) ? (
                    <p className="p-5 text-stone-400 text-sm">No earnings for this date</p>
                  ) : recordsData.earnings.map(e => (
                    <div key={e.id} className="flex justify-between items-center p-4 border-b border-stone-100">
                      <div>
                        <p className="font-black text-green-600 text-xl">KES {e.amount?.toLocaleString()}</p>
                        <p className="text-stone-500 text-sm">{e.notes||"—"}</p>
                        <div className="flex items-center gap-2 mt-1">
                          <SubmitterBadge sub={e.submitted_by} />
                          {e.is_confirmed && <span className="text-xs text-green-600 font-bold">✓ Confirmed</span>}
                          {!e.is_confirmed && (
                            <button onClick={() => confirmEarning(e.id)}
                              className="text-xs bg-green-500 text-white px-2 py-0.5 rounded font-bold hover:bg-green-600">Confirm</button>
                          )}
                        </div>
                      </div>
                      {e.proof_file && <a href={e.proof_file} target="_blank" rel="noreferrer" className="text-xs bg-stone-100 text-stone-600 border border-stone-200 px-3 py-1.5 rounded">📎 Proof</a>}
                    </div>
                  ))}
                </div>

                {/* Expenditures */}
                <div className="bg-white border border-stone-200 rounded-xl mb-4 overflow-hidden">
                  <div className="px-5 py-3 bg-red-50 border-b border-stone-200 flex justify-between items-center">
                    <h3 className="font-black text-red-700 text-sm">🧾 Expenditures ({recordsData.expenditures?.length||0})</h3>
                    <span className="font-black text-red-700">Total: KES {(recordsData.totals?.expenditures||0).toLocaleString()}</span>
                  </div>
                  {(!recordsData.expenditures||recordsData.expenditures.length===0) ? (
                    <p className="p-5 text-stone-400 text-sm">No expenditures for this date</p>
                  ) : recordsData.expenditures.map(e => (
                    <div key={e.id} className="flex justify-between items-center p-4 border-b border-stone-100">
                      <div>
                        <p className="font-black text-red-600 text-xl">KES {e.amount?.toLocaleString()}</p>
                        <p className="text-stone-700 text-sm font-medium">{e.description}</p>
                        <div className="mt-1"><SubmitterBadge sub={e.submitted_by} /></div>
                      </div>
                      {e.proof_file && <a href={e.proof_file} target="_blank" rel="noreferrer" className="text-xs bg-stone-100 text-stone-600 border border-stone-200 px-3 py-1.5 rounded">📎 Proof</a>}
                    </div>
                  ))}
                </div>

                {/* Savings (matatu-linked only) */}
                <div className="bg-white border border-stone-200 rounded-xl overflow-hidden">
                  <div className="px-5 py-3 bg-blue-50 border-b border-stone-200 flex justify-between items-center">
                    <h3 className="font-black text-blue-700 text-sm">🏦 Matatu Savings ({recordsData.savings?.length||0})</h3>
                    <span className="font-black text-blue-700">Balance: KES {(recordsData.totals?.savings_balance||0).toLocaleString()}</span>
                  </div>
                  {(!recordsData.savings||recordsData.savings.length===0) ? (
                    <p className="p-5 text-stone-400 text-sm">No matatu savings for this date</p>
                  ) : recordsData.savings.map(s => (
                    <div key={s.id} className="flex justify-between items-center p-4 border-b border-stone-100">
                      <div>
                        <p className={`font-black text-xl ${s.transaction_type==="deposit"?"text-blue-600":"text-red-600"}`}>
                          {s.transaction_type==="deposit"?"+":"-"}KES {s.amount?.toLocaleString()}
                        </p>
                        <p className="text-stone-500 text-sm">{s.description||"—"}</p>
                        <div className="mt-1"><SubmitterBadge sub={s.submitted_by} /></div>
                      </div>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-bold capitalize
                        ${s.transaction_type==="deposit"?"bg-blue-100 text-blue-700":"bg-red-100 text-red-700"}`}>
                        {s.transaction_type}
                      </span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        )}

        {/* ══════════════ EARNINGS ══════════════ */}
        {activeTab === "earnings" && (
          <div className="p-8">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-2xl font-black text-stone-800">💰 Earnings from Drivers</h2>
              <div className="flex items-center gap-2">
                <input type="date" value={earningsDate} onChange={e => setEarningsDate(e.target.value)}
                  className="border border-stone-300 rounded-lg p-2 text-sm focus:border-amber-400 outline-none" />
                {earningsDate && <button onClick={() => setEarningsDate("")} className="text-xs text-red-500 hover:underline">Clear</button>}
              </div>
            </div>
            <div className="grid grid-cols-3 gap-4 mb-6">
              {[
                { label:"Total Received",  value:`KES ${totalEarnings.toLocaleString()}`,       c:"bg-green-50 border-green-200 text-green-700" },
                { label:"Confirmed",       value:earnings.filter(e=>e.is_confirmed).length,     c:"bg-amber-50 border-amber-200 text-amber-700" },
                { label:"Pending",         value:earnings.filter(e=>!e.is_confirmed).length,    c:"bg-red-50 border-red-200 text-red-700" },
              ].map((c,i) => (
                <div key={i} className={`border rounded-xl p-4 ${c.c}`}>
                  <p className="text-xs uppercase tracking-widest mb-1 opacity-70">{c.label}</p>
                  <p className="text-2xl font-black">{c.value}</p>
                </div>
              ))}
            </div>
            {earnings.length === 0 ? (
              <div className="bg-white border border-stone-200 rounded-xl p-8 text-center text-stone-400">No earnings submitted yet</div>
            ) : (
              <div className="space-y-3">
                {earnings.map(e => {
                  const matatu = matatus.find(m => m.id === e.matatu_id);
                  return (
                    <div key={e.id} className="bg-white border border-stone-200 rounded-xl p-5 flex justify-between items-center hover:border-amber-300 transition-all">
                      <div>
                        <div className="flex items-center gap-3 mb-1">
                          <p className="font-black text-stone-800 text-xl">KES {e.amount?.toLocaleString()}</p>
                          <span className={`text-xs px-2 py-0.5 rounded-full font-bold ${e.is_confirmed?"bg-green-100 text-green-700":"bg-amber-100 text-amber-700"}`}>
                            {e.is_confirmed?"✓ Confirmed":"⏳ Pending"}
                          </span>
                        </div>
                        <p className="text-sm text-stone-500">{matatu?`🚐 ${matatu.plate}`:`Matatu #${e.matatu_id}`} · {e.date}{e.notes&&` · "${e.notes}"`}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        {e.proof_file && <a href={e.proof_file} target="_blank" rel="noreferrer" className="text-xs bg-stone-100 text-stone-600 border border-stone-200 px-3 py-1.5 rounded">📎 Proof</a>}
                        {!e.is_confirmed && <button onClick={() => confirmEarning(e.id)} className="text-xs bg-green-500 text-white font-bold px-4 py-1.5 rounded hover:bg-green-600">✓ Confirm</button>}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ══════════════ EXPENDITURES ══════════════ */}
        {activeTab === "expenditures" && (
          <div className="p-8">
            <h2 className="text-2xl font-black text-stone-800 mb-6">🧾 Expenditures by Matatu</h2>
            <div className="mb-6 flex gap-2 flex-wrap">
              {matatus.map(m => (
                <button key={m.id} onClick={() => { setSelectedMatatu(m); fetchExpenditures(m.id); }}
                  className={`px-4 py-2 rounded-lg text-sm font-bold border transition-all
                    ${selectedMatatu?.id===m.id?"bg-amber-500 border-amber-500 text-black":"bg-white border-stone-300 text-stone-600 hover:border-amber-400"}`}>
                  {m.plate}
                </button>
              ))}
            </div>
            {selectedMatatu && (
              <>
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-black text-stone-700">{selectedMatatu.plate}</h3>
                  <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-2">
                    <span className="text-xs text-red-500">Total: </span>
                    <span className="font-black text-red-600">KES {totalExpenditures.toLocaleString()}</span>
                  </div>
                </div>
                {expenditures.length === 0 ? (
                  <div className="bg-white border border-stone-200 rounded-xl p-8 text-center text-stone-400">No expenditures</div>
                ) : (
                  <div className="space-y-3">
                    {expenditures.map(e => (
                      <div key={e.id} className="bg-white border border-stone-200 rounded-xl p-5 flex justify-between items-center">
                        <div>
                          <p className="font-black text-red-600 text-lg">KES {e.amount?.toLocaleString()}</p>
                          <p className="text-stone-700 text-sm font-medium">{e.description}</p>
                          <p className="text-stone-400 text-xs">{e.date}</p>
                        </div>
                        {e.proof_file && <a href={e.proof_file} target="_blank" rel="noreferrer" className="text-xs bg-stone-100 text-stone-600 border border-stone-200 px-3 py-1.5 rounded">📎 View Proof</a>}
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* ══════════════ TRIPS ══════════════ */}
        {activeTab === "trips" && (
          <div className="p-8">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-2xl font-black text-stone-800">🎫 Trips by Ticket</h2>
              <input type="date" value={tripsDate} onChange={e => setTripsDate(e.target.value)}
                className="border border-stone-300 rounded-lg p-2 text-sm focus:border-amber-400 outline-none" />
            </div>
            <div className="grid grid-cols-3 gap-4 mb-6">
              {[
                { label:"Total Trips",     value:trips.length,                                                                c:"bg-amber-50 border-amber-200 text-amber-700" },
                { label:"Total Collected", value:`KES ${trips.reduce((s,t)=>s+(t.shimo_fee||0),0).toLocaleString()}`,        c:"bg-green-50 border-green-200 text-green-700" },
                { label:"Routes Covered",  value:new Set(trips.map(t=>`${t.from_stage}-${t.to_stage}`)).size,                c:"bg-blue-50 border-blue-200 text-blue-700" },
              ].map((c,i) => (
                <div key={i} className={`border rounded-xl p-4 ${c.c}`}>
                  <p className="text-xs uppercase tracking-widest mb-1 opacity-70">{c.label}</p>
                  <p className="text-2xl font-black">{c.value}</p>
                </div>
              ))}
            </div>
            {trips.length === 0 ? (
              <div className="bg-white border border-stone-200 rounded-xl p-8 text-center text-stone-400">No trips for {tripsDate}</div>
            ) : (
              <div className="space-y-3">
                {trips.map(t => (
                  <div key={t.id} className="bg-white border border-stone-200 rounded-xl p-4 flex justify-between items-center">
                    <div>
                      <p className="font-black text-stone-800">{t.ticket_number}</p>
                      <p className="text-sm text-stone-500">🚐 {t.plate} · {t.from_stage} → {t.to_stage}</p>
                      <p className="text-xs text-stone-400">{t.time_issued} · {t.mode_of_payment}</p>
                    </div>
                    <p className="font-black text-green-600">KES {t.shimo_fee?.toLocaleString()}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ══════════════ SAVINGS (OWNER PERSONAL ONLY) ══════════════ */}
        {activeTab === "savings" && (
          <div className="p-8">
            <h2 className="text-2xl font-black text-stone-800 mb-2">🏦 Savings</h2>
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mb-6 text-sm text-amber-800">
              ℹ️ <strong>Personal savings only.</strong> Savings deposited by drivers and conductors are not shown here. To see all matatu savings (including crew), use the <button onClick={() => setActiveTab("records")} className="underline font-bold">Records per Matatu</button> tab.
            </div>

            <div className="bg-gradient-to-r from-green-800 to-green-700 rounded-xl p-6 mb-6 text-white">
              <p className="text-green-300 text-xs uppercase tracking-widest mb-1">Personal Savings Balance</p>
              <p className="text-4xl font-black">KES {savingsData.balance?.toLocaleString()||0}</p>
              <p className="text-green-300 text-xs mt-2">Your deposits only — driver/conductor savings not included</p>
            </div>

            {matatus.length > 0 && (
              <div className="mb-6">
                <h3 className="font-black text-stone-700 mb-3 text-sm uppercase tracking-widest">Your Deposits per Matatu</h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  {matatus.map(m => (
                    <div key={m.id} onClick={() => fetchMatatuSavings(m.id)}
                      className="bg-white border border-stone-200 rounded-xl p-4 cursor-pointer hover:border-amber-400 transition-all">
                      <p className="font-black text-stone-700">🚐 {m.plate}</p>
                      <p className="text-2xl font-black text-green-600 mt-1">
                        KES {matatuSavings[m.id]?.balance?.toLocaleString()||"—"}
                      </p>
                      <p className="text-xs text-stone-400 mt-1">Your deposits only · Click to load</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="bg-white border border-stone-200 rounded-xl p-6 mb-6">
              <h3 className="font-black text-stone-700 mb-4">Make a Deposit</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                <div>
                  <label className="text-xs text-stone-400 uppercase tracking-widest mb-1 block">Amount (KES)</label>
                  <input type="number" placeholder="e.g. 5000" value={savingForm.amount}
                    onChange={e => setSavingForm({...savingForm,amount:e.target.value})}
                    className="w-full border border-stone-300 rounded-lg p-2.5 text-sm focus:border-amber-400 outline-none" />
                </div>
                <div>
                  <label className="text-xs text-stone-400 uppercase tracking-widest mb-1 block">Date</label>
                  <input type="date" value={savingForm.date}
                    onChange={e => setSavingForm({...savingForm,date:e.target.value})}
                    className="w-full border border-stone-300 rounded-lg p-2.5 text-sm focus:border-amber-400 outline-none" />
                </div>
                <div>
                  <label className="text-xs text-stone-400 uppercase tracking-widest mb-1 block">Deposit for Matatu (optional)</label>
                  <select value={savingForm.matatu_id} onChange={e => setSavingForm({...savingForm,matatu_id:e.target.value})}
                    className="w-full border border-stone-300 rounded-lg p-2.5 text-sm focus:border-amber-400 outline-none">
                    <option value="">Personal savings</option>
                    {matatus.map(m => <option key={m.id} value={m.id}>{m.plate}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-stone-400 uppercase tracking-widest mb-1 block">Description</label>
                  <input placeholder="e.g. Monthly deposit" value={savingForm.description}
                    onChange={e => setSavingForm({...savingForm,description:e.target.value})}
                    className="w-full border border-stone-300 rounded-lg p-2.5 text-sm focus:border-amber-400 outline-none" />
                </div>
              </div>
              <button onClick={depositSaving} className="bg-amber-500 text-black font-black px-6 py-2.5 rounded-lg hover:bg-amber-400">💳 Deposit</button>
            </div>

            <h3 className="font-black text-stone-600 mb-3 text-sm uppercase tracking-widest">Personal Transaction History</h3>
            <div className="space-y-2">
              {(!savingsData.transactions||savingsData.transactions.length===0) ? (
                <p className="text-stone-400 text-sm">No personal transactions yet</p>
              ) : savingsData.transactions.map(t => (
                <div key={t.id} className="bg-white border border-stone-200 rounded-xl p-4 flex justify-between items-center">
                  <div>
                    <p className="text-sm font-medium text-stone-700">{t.description||"Deposit"}</p>
                    <p className="text-xs text-stone-400">{t.date}{t.matatu_id?` · Matatu #${t.matatu_id}`:""}</p>
                  </div>
                  <p className={`font-black ${t.transaction_type==="deposit"?"text-green-600":"text-red-500"}`}>
                    {t.transaction_type==="deposit"?"+":"-"}KES {t.amount?.toLocaleString()}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ══════════════ LOANS ══════════════ */}
        {activeTab === "loans" && (
          <div className="p-8">
            <LoanDashboard />
          </div>
        )}

        {/* ══════════════ SACCO PAYMENTS ══════════════ */}
        {activeTab === "payments" && (
          <div className="p-8">
            <h2 className="text-2xl font-black text-stone-800 mb-6">💳 SACCO Payments</h2>
            <div className="bg-white border border-stone-200 rounded-xl p-6 mb-6">
              <h3 className="font-black text-stone-700 mb-4">Record a Payment</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                <div>
                  <label className="text-xs text-stone-400 uppercase tracking-widest mb-1 block">Payment Type</label>
                  <select value={paymentForm.payment_type} onChange={e => setPaymentForm({...paymentForm,payment_type:e.target.value})}
                    className="w-full border border-stone-300 rounded-lg p-2.5 text-sm focus:border-amber-400 outline-none">
                    <option value="">Select Type</option>
                    {SACCO_PAYMENT_TYPES.map(t => <option key={t}>{t}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-stone-400 uppercase tracking-widest mb-1 block">Amount (KES)</label>
                  <input type="number" placeholder="e.g. 5000" value={paymentForm.amount}
                    onChange={e => setPaymentForm({...paymentForm,amount:e.target.value})}
                    className="w-full border border-stone-300 rounded-lg p-2.5 text-sm focus:border-amber-400 outline-none" />
                </div>
                <div>
                  <label className="text-xs text-stone-400 uppercase tracking-widest mb-1 block">For Matatu (optional)</label>
                  <select value={paymentForm.matatu_id} onChange={e => setPaymentForm({...paymentForm,matatu_id:e.target.value})}
                    className="w-full border border-stone-300 rounded-lg p-2.5 text-sm focus:border-amber-400 outline-none">
                    <option value="">General / Personal</option>
                    {matatus.map(m => <option key={m.id} value={m.id}>{m.plate}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-stone-400 uppercase tracking-widest mb-1 block">Date</label>
                  <input type="date" value={paymentForm.date} onChange={e => setPaymentForm({...paymentForm,date:e.target.value})}
                    className="w-full border border-stone-300 rounded-lg p-2.5 text-sm focus:border-amber-400 outline-none" />
                </div>
                <div>
                  <label className="text-xs text-stone-400 uppercase tracking-widest mb-1 block">Notes (optional)</label>
                  <input placeholder="Additional notes..." value={paymentForm.notes}
                    onChange={e => setPaymentForm({...paymentForm,notes:e.target.value})}
                    className="w-full border border-stone-300 rounded-lg p-2.5 text-sm focus:border-amber-400 outline-none" />
                </div>
                <div>
                  <label className="text-xs text-stone-400 uppercase tracking-widest mb-1 block">Proof of Payment</label>
                  <input type="file" accept="image/*,.pdf" onChange={e => setPaymentForm({...paymentForm,proof_file:e.target.files[0]})}
                    className="w-full border border-stone-300 rounded-lg p-2.5 text-sm file:mr-3 file:bg-amber-500 file:text-black file:border-0 file:rounded file:px-3 file:py-1 file:font-bold" />
                </div>
              </div>
              <button onClick={submitSaccoPayment} disabled={paymentLoading}
                className="bg-amber-500 text-black font-black px-6 py-2.5 rounded-lg hover:bg-amber-400 disabled:opacity-50">
                {paymentLoading ? "Submitting..." : "📤 Submit Payment"}
              </button>
            </div>
            {saccoPayments.length === 0 ? (
              <div className="bg-white border border-stone-200 rounded-xl p-8 text-center text-stone-400">No payments recorded yet</div>
            ) : (
              <div className="space-y-3">
                {saccoPayments.map(p => {
                  const matatu = matatus.find(m => m.id === p.matatu_id);
                  return (
                    <div key={p.id} className="bg-white border border-stone-200 rounded-xl p-5 flex justify-between items-center hover:border-amber-300 transition-all">
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-xs bg-amber-100 text-amber-700 font-bold px-2 py-0.5 rounded">{p.payment_type}</span>
                          {matatu && <span className="text-xs text-stone-400">🚐 {matatu.plate}</span>}
                        </div>
                        <p className="font-black text-stone-800 text-lg">KES {p.amount?.toLocaleString()}</p>
                        <p className="text-stone-400 text-xs">{p.date}{p.notes&&` · ${p.notes}`}</p>
                      </div>
                      {p.proof_file && <a href={p.proof_file} target="_blank" rel="noreferrer" className="text-xs bg-stone-100 text-stone-600 border border-stone-200 px-3 py-1.5 rounded">📎 View Proof</a>}
                    </div>
                  );
                })}
                <div className="bg-stone-800 text-white rounded-xl p-4 flex justify-between">
                  <span className="text-stone-300 text-sm">Total Paid to SACCO</span>
                  <span className="font-black">KES {saccoPayments.reduce((s,p)=>s+(p.amount||0),0).toLocaleString()}</span>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ADD DOCUMENT MODAL */}
      {showDocModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-2xl p-6 w-[440px]">
            <div className="flex justify-between items-center mb-4">
              <h3 className="font-black text-stone-800">Add Document — {selectedMatatu?.plate}</h3>
              <button onClick={() => setShowDocModal(false)} className="text-stone-400 hover:text-stone-700">✕</button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="text-xs text-stone-400 uppercase tracking-widest mb-1 block">Document Type</label>
                <select value={newDoc.type} onChange={e => setNewDoc({...newDoc,type:e.target.value})}
                  className="w-full border border-stone-300 rounded-lg p-2.5 text-sm focus:border-amber-400 outline-none">
                  <option value="">Select Type</option>
                  {OWNER_DOC_TYPES.map(t => <option key={t}>{t}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs text-stone-400 uppercase tracking-widest mb-1 block">Document Number</label>
                <input placeholder="e.g. INS/2024/001" value={newDoc.number} onChange={e => setNewDoc({...newDoc,number:e.target.value})}
                  className="w-full border border-stone-300 rounded-lg p-2.5 text-sm focus:border-amber-400 outline-none" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-stone-400 uppercase tracking-widest mb-1 block">Issue Date</label>
                  <input type="date" value={newDoc.issue} onChange={e => setNewDoc({...newDoc,issue:e.target.value})}
                    className="w-full border border-stone-300 rounded-lg p-2.5 text-sm focus:border-amber-400 outline-none" />
                </div>
                <div>
                  <label className="text-xs text-stone-400 uppercase tracking-widest mb-1 block">Expiry Date</label>
                  <input type="date" value={newDoc.expiry} onChange={e => setNewDoc({...newDoc,expiry:e.target.value})}
                    className="w-full border border-stone-300 rounded-lg p-2.5 text-sm focus:border-amber-400 outline-none" />
                </div>
              </div>
              <div>
                <label className="text-xs text-stone-400 uppercase tracking-widest mb-1 block">Upload Document</label>
                <input type="file" accept="image/*,.pdf" onChange={e => setNewDoc({...newDoc,file:e.target.files[0]})}
                  className="w-full border border-stone-300 rounded-lg p-2.5 text-sm file:mr-3 file:bg-amber-500 file:text-black file:border-0 file:rounded file:px-3 file:py-1 file:font-bold" />
              </div>
            </div>
            <div className="flex gap-3 mt-5">
              <button onClick={saveDocument} className="flex-1 bg-amber-500 text-black font-black py-3 rounded-lg hover:bg-amber-400">Save Document</button>
              <button onClick={() => setShowDocModal(false)} className="flex-1 bg-stone-100 text-stone-700 font-bold py-3 rounded-lg hover:bg-stone-200">Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* PROGRESS MODAL */}
      {showProgressModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-2xl p-6 w-[400px]">
            <div className="flex justify-between items-center mb-4">
              <h3 className="font-black text-stone-800">Add Daily Progress — {selectedMatatu?.plate}</h3>
              <button onClick={() => setShowProgressModal(false)} className="text-stone-400 hover:text-stone-700">✕</button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="text-xs text-stone-400 uppercase tracking-widest mb-1 block">Date</label>
                <input type="date" value={newProgress.date} onChange={e => setNewProgress({...newProgress,date:e.target.value})}
                  className="w-full border border-stone-300 rounded-lg p-2.5 text-sm focus:border-amber-400 outline-none" />
              </div>
              {[["earnings","💰 Earnings (KES)"],["expenses","💸 Expenses (KES)"],["savings","💾 Savings (KES)"]].map(([f,l]) => (
                <div key={f}>
                  <label className="text-xs text-stone-400 uppercase tracking-widest mb-1 block">{l}</label>
                  <input type="number" placeholder="0" value={newProgress[f]} onChange={e => setNewProgress({...newProgress,[f]:e.target.value})}
                    className="w-full border border-stone-300 rounded-lg p-2.5 text-sm focus:border-amber-400 outline-none" />
                </div>
              ))}
            </div>
            <div className="flex gap-3 mt-5">
              <button onClick={saveProgress} className="flex-1 bg-amber-500 text-black font-black py-3 rounded-lg hover:bg-amber-400">Save Progress</button>
              <button onClick={() => setShowProgressModal(false)} className="flex-1 bg-stone-100 text-stone-700 font-bold py-3 rounded-lg hover:bg-stone-200">Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}