import { useState, useEffect } from "react";
import API from "../api";
import { useAuth } from "../context/AuthContext";
import LoanDashboard from "../components/LoanDashboard";



const TABS = [
  { key: "issue",            label: "🎫 Issue Receipt" },
  { key: "receipts",         label: "📋 My Receipts" },
  { key: "savings",          label: "🏦 Savings" },
  { key: "loans",            label: "💼 Loans" },
  { key: "guarantorHistory", label: "🤝 Guarantor History" },
];

function Toast({ msg, type, onClose }) {
  useEffect(() => { const t = setTimeout(onClose, 3000); return () => clearTimeout(t); }, [onClose]);
  return (
    <div className={`fixed top-5 right-5 z-50 px-5 py-3 rounded-lg shadow-2xl text-sm font-bold
      ${type === "error" ? "bg-red-500 text-white" : "bg-blue-600 text-white"}`}>
      {msg}
    </div>
  );
}

export default function StageOperator() {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState("issue");
  const [toast, setToast]         = useState(null);
  const showToast = (msg, type = "success") => setToast({ msg, type });

  const token   = localStorage.getItem("token");
  const headers = { Authorization: `Bearer ${token}` };

  // ── Receipt state ──
  const [routes, setRoutes]   = useState([]);
  const [matatus, setMatatus] = useState([]);
  const [matatuSearch, setMatatuSearch]   = useState("");
  const [showMatatuDrop, setShowMatatuDrop] = useState(false);
  const [draft, setDraft]     = useState(null);
  const [submitted, setSubmitted] = useState(false);
  const [form, setForm] = useState({
    sacco_name: "Matatu SACCO", matatu_id:"", plate:"", owner_name:"",
    route_id:"", from_stage:"", to_stage:"", shimo_fee:"", capacity:"",
    mode_of_payment:"Cash", date_issued: new Date().toISOString().split("T")[0],
    operator_membership_no: user?.membership_no || ""
  });

  // ── Receipts list ──
  const [receipts, setReceipts]     = useState([]);
  const [filterDate, setFilterDate] = useState(new Date().toISOString().split("T")[0]);

  // ── Daily summary ──
  const [showSummary, setShowSummary]       = useState(false);
  const [summaryDate, setSummaryDate]       = useState(new Date().toISOString().split("T")[0]);
  const [summary, setSummary]               = useState(null);
  const [summaryLoading, setSummaryLoading] = useState(false);

  // ── Savings ──
  const [savingsData, setSavingsData] = useState({ balance: 0, transactions: [] });
  const [savingForm, setSavingForm]   = useState({ amount:"", description:"", date: new Date().toISOString().split("T")[0] });
  const [savingLoading, setSavingLoading] = useState(false);

  // ── Guarantor history ──
  const [guarantorHistory, setGuarantorHistory] = useState([]);
  const [loadingGuarantors, setLoadingGuarantors] = useState(false);

  // ── fetch ──
  useEffect(() => {
    fetch(`${API}/routes`).then(r => r.json()).then(setRoutes);
    fetch(`${API}/matatus`).then(r => r.json()).then(setMatatus);
  }, []);

  useEffect(() => { fetchReceipts(); }, [filterDate]);
  useEffect(() => {
    if (activeTab === "savings") fetchSavings();
    if (activeTab === "guarantorHistory") fetchGuarantorHistory();
  }, [activeTab]);

  const fetchReceipts = async () => {
    const res = await fetch(`${API}/receipts/my?date=${filterDate}`, { headers });
    setReceipts(Array.isArray(await res.json()) ? await (await fetch(`${API}/receipts/my?date=${filterDate}`,{headers})).json() : []);
  };

  const fetchSavings = async () => {
    const res = await fetch(`${API}/savings/my`, { headers });
    if (res.ok) setSavingsData(await res.json());
  };

  const fetchGuarantorHistory = async () => {
    setLoadingGuarantors(true);
    const res = await fetch(`${API}/guarantors/my-history`, { headers });
    if (res.ok) setGuarantorHistory(await res.json());
    setLoadingGuarantors(false);
  };

  // ── receipt helpers ──
  const filteredMatatus = matatus.filter(m =>
    m.plate?.toLowerCase().includes(matatuSearch.toLowerCase())
  );

  const handleRouteChange = (routeId) => {
    const route = routes.find(r => r.id === parseInt(routeId));
    if (route) setForm(f => ({ ...f, route_id: route.id, from_stage: route.from_stage, to_stage: route.to_stage, shimo_fee: route.shimo_fee }));
  };

  const selectMatatu = (matatu) => {
    setForm(f => ({ ...f, matatu_id: matatu.id, plate: matatu.plate, owner_name: matatu.owner_member_no || "", capacity: matatu.capacity || "" }));
    setMatatuSearch(matatu.plate); setShowMatatuDrop(false);
  };

  const saveDraft = async () => {
    if (!form.matatu_id || !form.route_id || !form.mode_of_payment) return showToast("Fill in matatu, route, and payment mode", "error");
    const res = await fetch(`${API}/receipts`, {
      method: "POST", headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({ ...form, issued_by: user?.id, operator_membership_no: user?.membership_no })
    });
    const data = await res.json();
    if (!res.ok) return showToast(data.error || "Failed to save draft", "error");
    setDraft({ ...form, id: data.id, ticket_number: data.ticket_number });
    setSubmitted(false);
    showToast(`Draft saved — ${data.ticket_number}`);
  };

  const updateDraft = async () => {
    if (!draft?.id) return;
    const res = await fetch(`${API}/receipts/${draft.id}`, {
      method: "PUT", headers: { ...headers, "Content-Type": "application/json" }, body: JSON.stringify(form)
    });
    if (!res.ok) { const d = await res.json(); return showToast(d.error || "Update failed", "error"); }
    setDraft({ ...draft, ...form }); showToast("Draft updated ✓");
  };

  const submitReceipt = async () => {
    if (!draft?.id) return showToast("Save a draft first", "error");
    if (!window.confirm("Submit this receipt? It cannot be edited after submission.")) return;
    const res = await fetch(`${API}/receipts/${draft.id}/submit`, { method: "PUT", headers });
    if (!res.ok) { const d = await res.json(); return showToast(d.error || "Submit failed", "error"); }
    setSubmitted(true); showToast("Receipt submitted & locked ✓");
    fetchReceipts();
  };

  const resetForm = () => {
    setDraft(null); setSubmitted(false); setMatatuSearch("");
    setForm({
      sacco_name:"Matatu SACCO", matatu_id:"", plate:"", owner_name:"",
      route_id:"", from_stage:"", to_stage:"", shimo_fee:"", capacity:"",
      mode_of_payment:"Cash", date_issued: new Date().toISOString().split("T")[0],
      operator_membership_no: user?.membership_no || ""
    });
  };

  const printReceipt = (r) => {
    const win = window.open("", "_blank");
    win.document.write(`<html><head><title>Receipt ${r.ticket_number}</title>
      <style>body{font-family:monospace;padding:20px;max-width:400px;margin:auto;}
      h2{text-align:center;}.line{display:flex;justify-content:space-between;margin:6px 0;border-bottom:1px dashed #ccc;padding-bottom:4px;}
      .ticket{text-align:center;font-size:20px;font-weight:bold;margin:16px 0;letter-spacing:2px;}
      .footer{text-align:center;margin-top:20px;font-size:12px;color:#666;}</style></head>
      <body><h2>${r.sacco_name||"Matatu SACCO"}</h2>
      <div class="ticket">🎫 ${r.ticket_number}</div>
      <div class="line"><span>Plate:</span><span>${r.plate}</span></div>
      <div class="line"><span>Owner:</span><span>${r.owner_name||"N/A"}</span></div>
      <div class="line"><span>Route:</span><span>${r.from_stage} → ${r.to_stage}</span></div>
      <div class="line"><span>Shimo Fee:</span><span>KES ${r.shimo_fee}</span></div>
      <div class="line"><span>Capacity:</span><span>${r.capacity||"N/A"}</span></div>
      <div class="line"><span>Payment:</span><span>${r.mode_of_payment}</span></div>
      <div class="line"><span>Operator:</span><span>${r.operator_membership_no}</span></div>
      <div class="line"><span>Date:</span><span>${r.date_issued}</span></div>
      <div class="line"><span>Time:</span><span>${r.time_issued||""}</span></div>
      <div class="footer">This receipt is valid and cannot be altered.</div>
      </body></html>`);
    win.document.close(); setTimeout(() => win.print(), 500);
  };

  const fetchSummary = async () => {
    setSummaryLoading(true);
    const res = await fetch(`${API}/receipts/summary?date=${summaryDate}`, { headers });
    if (res.ok) setSummary(await res.json());
    setSummaryLoading(false);
  };

  const depositSaving = async () => {
    if (!savingForm.amount) return showToast("Amount required", "error");
    setSavingLoading(true);
    const res = await fetch(`${API}/savings/deposit`, {
      method:"POST", headers:{ ...headers, "Content-Type":"application/json" },
      body: JSON.stringify({ amount: parseFloat(savingForm.amount), description: savingForm.description, date: savingForm.date })
    });
    setSavingLoading(false);
    if (!res.ok) return showToast("Deposit failed", "error");
    showToast("Savings deposited ✓");
    setSavingForm({ amount:"", description:"", date: new Date().toISOString().split("T")[0] });
    fetchSavings();
  };

  const routeColors = ["#3B82F6","#10B981","#F59E0B","#EF4444","#8B5CF6","#EC4899"];

  const GUARANTEE_STATUS = {
    pending:  { color:"bg-yellow-100 text-yellow-700", icon:"⏳" },
    accepted: { color:"bg-green-100 text-green-700",   icon:"✅" },
    rejected: { color:"bg-red-100 text-red-700",       icon:"❌" },
  };

  return (
    <div className="flex min-h-screen bg-gray-100">
      {toast && <Toast {...toast} onClose={() => setToast(null)} />}

      {/* SIDEBAR */}
      <div className="w-64 bg-gray-900 text-white flex flex-col p-5 flex-shrink-0">
        <div className="mb-8">
          <div className="w-12 h-12 rounded-full bg-blue-600 flex items-center justify-center text-white font-black text-lg mb-3">
            {user?.name?.[0]||"S"}
          </div>
          <p className="font-bold text-white">{user?.name}</p>
          <p className="text-xs text-gray-400 uppercase tracking-widest mt-1">Stage Operator</p>
          <p className="text-xs text-gray-500 mt-1">{user?.membership_no}</p>
        </div>

        <nav className="space-y-1 flex-1">
          {TABS.map(tab => (
            <button key={tab.key} onClick={() => setActiveTab(tab.key)}
              className={`w-full text-left p-3 rounded text-sm transition-all font-medium
                ${activeTab===tab.key?"bg-blue-600 text-white":"text-gray-400 hover:bg-gray-700 hover:text-white"}`}>
              {tab.label}
            </button>
          ))}
          <button onClick={() => setShowSummary(true)}
            className="w-full text-left p-3 rounded text-sm text-gray-400 hover:bg-gray-700 hover:text-white font-medium">
            📊 Daily Summary
          </button>
        </nav>

        <div className="pt-4 border-t border-gray-800 text-xs text-gray-500 space-y-1">
          <p>Receipts: <span className="text-white font-bold">{receipts.length}</span></p>
          <p>Savings: <span className="text-blue-400 font-bold">KES {savingsData.balance?.toLocaleString()||0}</span></p>
        </div>
      </div>

      {/* CONTENT */}
      <div className="flex-1 p-6 overflow-y-auto">

        {/* ISSUE RECEIPT */}
        {activeTab === "issue" && (
          <div className="max-w-2xl mx-auto">
            <h2 className="text-2xl font-bold mb-6 text-gray-800">🎫 Issue Receipt</h2>
            <div className="bg-white rounded-xl shadow p-6 space-y-4">

              <div>
                <label className="text-sm font-medium text-gray-700">SACCO / Company Name</label>
                <input value={form.sacco_name} onChange={e => setForm({...form,sacco_name:e.target.value})}
                  className="border border-gray-300 p-2.5 w-full rounded-lg mt-1 outline-none focus:border-blue-500 text-gray-800 bg-white" disabled={submitted} />
              </div>

              <div className="relative">
                <label className="text-sm font-medium text-gray-700">Matatu Plate</label>
                <input type="text" placeholder="Search plate number..." value={matatuSearch}
                  onChange={e => { setMatatuSearch(e.target.value); setShowMatatuDrop(true); }}
                  onFocus={() => setShowMatatuDrop(true)}
                  className="border border-gray-300 p-2.5 w-full rounded-lg mt-1 outline-none focus:border-blue-500 text-gray-800 bg-white"
                  disabled={submitted} />
                {showMatatuDrop && matatuSearch && (
                  <div className="absolute z-50 bg-white border border-gray-200 w-full max-h-48 overflow-y-auto shadow-lg rounded-lg mt-1">
                    {filteredMatatus.length > 0 ? filteredMatatus.map(m => (
                      <div key={m.id} onClick={() => selectMatatu(m)} className="p-3 hover:bg-blue-50 cursor-pointer border-b border-gray-100">
                        <p className="font-bold text-sm text-gray-800">{m.plate}</p>
                        <p className="text-xs text-gray-500">Owner: {m.owner_member_no}</p>
                      </div>
                    )) : <p className="p-3 text-gray-500 text-sm">No matatu found</p>}
                  </div>
                )}
              </div>

              <div>
                <label className="text-sm font-medium text-gray-700">Owner Name / Member No</label>
                <input value={form.owner_name} onChange={e => setForm({...form,owner_name:e.target.value})}
                  className="border border-gray-300 p-2.5 w-full rounded-lg mt-1 bg-gray-50 text-gray-700 outline-none" placeholder="Auto-filled" disabled={submitted} />
              </div>

              <div>
                <label className="text-sm font-medium text-gray-700">Route</label>
                <select value={form.route_id} onChange={e => handleRouteChange(e.target.value)}
                  className="border border-gray-300 p-2.5 w-full rounded-lg mt-1 outline-none focus:border-blue-500 text-gray-800 bg-white" disabled={submitted}>
                  <option value="">Select Route</option>
                  {routes.map(r => <option key={r.id} value={r.id}>{r.from_stage} → {r.to_stage} (KES {r.shimo_fee})</option>)}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                {[["From Stage",form.from_stage],["To Stage",form.to_stage]].map(([l,v]) => (
                  <div key={l}>
                    <label className="text-sm font-medium text-gray-700">{l}</label>
                    <input value={v} readOnly className="border p-2.5 w-full rounded-lg mt-1 bg-gray-50 text-gray-700" />
                  </div>
                ))}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-sm font-medium text-gray-700">Shimo Fee (KES)</label>
                  <input type="number" value={form.shimo_fee} onChange={e => setForm({...form,shimo_fee:e.target.value})}
                    className="border border-gray-300 p-2.5 w-full rounded-lg mt-1 outline-none focus:border-blue-500 text-gray-800 bg-white" disabled={submitted} />
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-700">Capacity</label>
                  <input type="number" value={form.capacity} onChange={e => setForm({...form,capacity:e.target.value})}
                    placeholder="e.g. 14" className="border border-gray-300 p-2.5 w-full rounded-lg mt-1 outline-none focus:border-blue-500 text-gray-800 bg-white" disabled={submitted} />
                </div>
              </div>

              <div>
                <label className="text-sm font-medium text-gray-700">Mode of Payment</label>
                <select value={form.mode_of_payment} onChange={e => setForm({...form,mode_of_payment:e.target.value})}
                  className="border border-gray-300 p-2.5 w-full rounded-lg mt-1 outline-none focus:border-blue-500 text-gray-800 bg-white" disabled={submitted}>
                  <option value="Cash">Cash</option>
                  <option value="Mpesa">Mpesa</option>
                </select>
              </div>

              <div>
                <label className="text-sm font-medium text-gray-700">Operator Membership No</label>
                <input value={form.operator_membership_no} onChange={e => setForm({...form,operator_membership_no:e.target.value})}
                  className="border border-gray-300 p-2.5 w-full rounded-lg mt-1 bg-gray-50 text-gray-700 outline-none" disabled={submitted} />
              </div>

              <div>
                <label className="text-sm font-medium text-gray-700">Date</label>
                <input type="date" value={form.date_issued} onChange={e => setForm({...form,date_issued:e.target.value})}
                  className="border border-gray-300 p-2.5 w-full rounded-lg mt-1 outline-none focus:border-blue-500 text-gray-800 bg-white" disabled={submitted} />
              </div>

              {draft?.ticket_number && (
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                  <p className="text-sm text-blue-700">Ticket: <span className="font-bold text-lg">{draft.ticket_number}</span></p>
                </div>
              )}
              {submitted && (
                <div className="bg-green-50 border border-green-300 rounded-lg p-3 text-center">
                  <p className="text-green-700 font-bold">✅ Receipt Submitted & Locked</p>
                </div>
              )}

              <div className="flex gap-3 pt-2">
                {!draft && <button onClick={saveDraft} className="bg-yellow-500 text-white font-bold px-4 py-2.5 rounded-lg hover:bg-yellow-600">💾 Save Draft</button>}
                {draft && !submitted && (<>
                  <button onClick={updateDraft} className="bg-yellow-500 text-white font-bold px-4 py-2.5 rounded-lg hover:bg-yellow-600">✏️ Update Draft</button>
                  <button onClick={submitReceipt} className="bg-green-600 text-white font-bold px-4 py-2.5 rounded-lg hover:bg-green-700">✅ Submit</button>
                </>)}
                {submitted && (<>
                  <button onClick={() => printReceipt({...form,...draft})} className="bg-purple-600 text-white font-bold px-4 py-2.5 rounded-lg hover:bg-purple-700">🖨️ Print</button>
                  <button onClick={resetForm} className="bg-blue-600 text-white font-bold px-4 py-2.5 rounded-lg hover:bg-blue-700">+ New Receipt</button>
                </>)}
              </div>
            </div>
          </div>
        )}

        {/* MY RECEIPTS */}
        {activeTab === "receipts" && (
          <div>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-2xl font-bold text-gray-800">📋 My Receipts</h2>
              <div className="flex items-center gap-2">
                <label className="text-sm text-gray-600">Date:</label>
                <input type="date" value={filterDate} onChange={e => setFilterDate(e.target.value)}
                  className="border border-gray-300 p-2 rounded-lg text-sm text-gray-800 bg-white outline-none" />
              </div>
            </div>
            {receipts.length === 0 ? (
              <div className="bg-white rounded-xl shadow p-8 text-center text-gray-500">No receipts for {filterDate}</div>
            ) : (
              <div className="space-y-3">
                {receipts.map(r => (
                  <div key={r.id} className="bg-white rounded-xl shadow p-4 flex justify-between items-center">
                    <div>
                      <p className="font-bold text-blue-700">{r.ticket_number}</p>
                      <p className="text-sm text-gray-600">{r.plate} — {r.from_stage} → {r.to_stage}</p>
                      <p className="text-sm text-gray-500">KES {r.shimo_fee} · {r.mode_of_payment} · {r.time_issued}</p>
                    </div>
                    <button onClick={() => printReceipt(r)} className="bg-purple-600 text-white px-3 py-1.5 rounded-lg text-sm hover:bg-purple-700">🖨️ Print</button>
                  </div>
                ))}
                <div className="bg-gray-800 text-white rounded-xl p-4 flex justify-between">
                  <span>Total: <b>{receipts.length}</b></span>
                  <span>Collected: <b>KES {receipts.reduce((s,r)=>s+r.shimo_fee,0).toLocaleString()}</b></span>
                </div>
              </div>
            )}
          </div>
        )}

        {/* SAVINGS */}
        {activeTab === "savings" && (
          <div className="max-w-2xl">
            <h2 className="text-2xl font-bold text-gray-800 mb-2">🏦 Personal Savings</h2>
            <p className="text-gray-500 text-sm mb-6">Your personal SACCO savings. Private to you.</p>
            <div className="bg-gradient-to-br from-blue-700 to-blue-600 rounded-xl p-6 mb-6 text-white">
              <p className="text-blue-200 text-xs uppercase tracking-widest mb-1">Current Balance</p>
              <p className="text-4xl font-black">KES {savingsData.balance?.toLocaleString()||0}</p>
            </div>
            <div className="bg-white rounded-xl shadow p-6 mb-6">
              <h3 className="font-bold text-gray-700 mb-4 text-sm uppercase tracking-widest">Make a Deposit</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                <div>
                  <label className="text-xs text-gray-500 uppercase tracking-widest mb-1 block">Amount (KES)</label>
                  <input type="number" placeholder="e.g. 1000" value={savingForm.amount}
                    onChange={e => setSavingForm({...savingForm,amount:e.target.value})}
                    className="w-full border border-gray-300 rounded-lg p-2.5 text-sm text-gray-800 bg-white outline-none focus:border-blue-500" />
                </div>
                <div>
                  <label className="text-xs text-gray-500 uppercase tracking-widest mb-1 block">Date</label>
                  <input type="date" value={savingForm.date}
                    onChange={e => setSavingForm({...savingForm,date:e.target.value})}
                    className="w-full border border-gray-300 rounded-lg p-2.5 text-sm text-gray-800 bg-white outline-none focus:border-blue-500" />
                </div>
              </div>
              <div className="mb-4">
                <label className="text-xs text-gray-500 uppercase tracking-widest mb-1 block">Description (optional)</label>
                <input placeholder="e.g. Monthly savings" value={savingForm.description}
                  onChange={e => setSavingForm({...savingForm,description:e.target.value})}
                  className="w-full border border-gray-300 rounded-lg p-2.5 text-sm text-gray-800 bg-white outline-none focus:border-blue-500" />
              </div>
              <button onClick={depositSaving} disabled={savingLoading}
                className="bg-blue-600 text-white font-bold px-6 py-2.5 rounded-lg hover:bg-blue-700 disabled:opacity-50">
                {savingLoading ? "Depositing..." : "💳 Deposit"}
              </button>
            </div>
            <h3 className="font-bold text-gray-600 mb-3 text-sm uppercase tracking-widest">Transaction History</h3>
            {(!savingsData.transactions||savingsData.transactions.length===0) ? (
              <div className="bg-white rounded-xl shadow p-8 text-center text-gray-400">No transactions yet</div>
            ) : (
              <div className="space-y-2">
                {savingsData.transactions.map(t => (
                  <div key={t.id} className="bg-white rounded-xl shadow p-4 flex justify-between items-center">
                    <div>
                      <p className="text-sm font-medium text-gray-700">{t.description||"Deposit"}</p>
                      <p className="text-xs text-gray-400">{t.date}</p>
                    </div>
                    <p className={`font-black ${t.transaction_type==="deposit"?"text-blue-600":"text-red-500"}`}>
                      {t.transaction_type==="deposit"?"+":"-"}KES {t.amount?.toLocaleString()}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* LOANS — stage operators CAN apply */}
        {activeTab === "loans" && <LoanDashboard />}

        {/* GUARANTOR HISTORY */}
        {activeTab === "guarantorHistory" && (
          <div>
            <h2 className="text-2xl font-bold text-gray-800 mb-2">🤝 Guarantor History</h2>
            <p className="text-gray-500 text-sm mb-6">All loans you have been asked to guarantee — permanently visible after responding.</p>
            <button onClick={fetchGuarantorHistory} className="mb-4 bg-gray-200 text-gray-700 text-xs px-3 py-1.5 rounded hover:bg-gray-300 font-bold">
              🔄 Refresh
            </button>
            {loadingGuarantors ? (
              <div className="text-center text-gray-500 py-8">Loading...</div>
            ) : guarantorHistory.length === 0 ? (
              <div className="bg-white rounded-xl shadow p-8 text-center text-gray-400">
                <p className="text-4xl mb-2">🤝</p><p>No guarantor history yet</p>
              </div>
            ) : (
              <div className="space-y-4">
                {guarantorHistory.map(g => (
                  <div key={g.id} className={`bg-white rounded-xl shadow p-5 border-l-4 ${g.status==="accepted"?"border-green-500":g.status==="rejected"?"border-red-400":"border-yellow-400"}`}>
                    <div className="flex justify-between items-start mb-3">
                      <div>
                        <p className="font-black text-gray-800">{g.member_name}</p>
                        <p className="text-gray-400 text-sm">{g.membership_no} · {g.loan_type} loan</p>
                      </div>
                      <span className={`text-xs px-3 py-1 rounded-full font-bold ${(GUARANTEE_STATUS[g.status]||{}).color}`}>
                        {(GUARANTEE_STATUS[g.status]||{}).icon} {g.status}
                      </span>
                    </div>
                    <div className="grid grid-cols-2 gap-3 text-sm mb-2">
                      <div className="bg-gray-50 rounded-lg p-3">
                        <p className="text-gray-400 text-xs">Loan Amount</p>
                        <p className="font-black text-gray-800">KES {g.loan_amount?.toLocaleString()}</p>
                      </div>
                      <div className="bg-gray-50 rounded-lg p-3">
                        <p className="text-gray-400 text-xs">Loan Status</p>
                        <p className="font-bold text-gray-700 capitalize">{g.loan_status?.replace(/_/g," ")}</p>
                      </div>
                    </div>
                    <p className="text-gray-500 text-xs">Purpose: {g.loan_purpose}</p>
                    {g.status === "accepted" && (
                      <div className="mt-3 bg-green-50 border border-green-200 rounded-lg p-3 text-xs">
                        <p className="text-green-700 font-bold mb-1">✅ Active guarantor</p>
                        <div className="flex gap-4 text-gray-600">
                          <span>Repaid: <span className="text-green-600 font-bold">KES {g.amount_repaid?.toLocaleString()}</span></span>
                          <span>Outstanding: <span className="text-red-500 font-bold">KES {((g.total_payable||0)-(g.amount_repaid||0)).toLocaleString()}</span></span>
                        </div>
                      </div>
                    )}
                    <p className="text-gray-400 text-xs mt-2">{new Date(g.created_at).toLocaleDateString()}{g.responded_at&&` · Responded: ${new Date(g.responded_at).toLocaleDateString()}`}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* DAILY SUMMARY MODAL */}
      {showSummary && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-2xl w-[500px] max-h-[90vh] overflow-y-auto p-6">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-xl font-bold text-gray-800">📊 Daily Summary</h3>
              <button onClick={() => setShowSummary(false)} className="text-gray-400 hover:text-gray-700 text-xl">✕</button>
            </div>
            <div className="flex gap-3 mb-4">
              <input type="date" value={summaryDate} onChange={e => setSummaryDate(e.target.value)}
                className="border border-gray-300 p-2.5 rounded-lg flex-1 text-gray-800 bg-white outline-none focus:border-blue-500" />
              <button onClick={fetchSummary} className="bg-blue-600 text-white px-4 py-2.5 rounded-lg hover:bg-blue-700 font-bold">View</button>
            </div>
            {summaryLoading && <p className="text-center text-gray-500 py-4">Loading...</p>}
            {summary && !summaryLoading && (
              <>
                <div className="grid grid-cols-2 gap-3 mb-4">
                  <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 text-center">
                    <p className="text-3xl font-black text-blue-700">{summary.total_tickets}</p>
                    <p className="text-sm text-blue-600 mt-1">Tickets Issued</p>
                  </div>
                  <div className="bg-green-50 border border-green-200 rounded-xl p-4 text-center">
                    <p className="text-2xl font-black text-green-700">KES {summary.total_amount?.toLocaleString()}</p>
                    <p className="text-sm text-green-600 mt-1">Total Collected</p>
                  </div>
                </div>
                <h4 className="font-bold text-gray-700 mb-3">By Route</h4>
                {Object.keys(summary.by_route||{}).length === 0 ? (
                  <p className="text-gray-500 text-sm text-center py-4">No data for this date</p>
                ) : Object.entries(summary.by_route).map(([route,data],idx) => {
                  const maxTotal = Math.max(...Object.values(summary.by_route).map(d=>d.total));
                  const width = maxTotal > 0 ? (data.total/maxTotal)*100 : 0;
                  return (
                    <div key={route} className="mb-3">
                      <div className="flex justify-between text-sm mb-1">
                        <span className="text-gray-700 font-medium">{route}</span>
                        <span className="text-gray-500">{data.count} · KES {data.total.toLocaleString()}</span>
                      </div>
                      <div className="w-full bg-gray-100 rounded-full h-4">
                        <div className="h-4 rounded-full" style={{width:`${width}%`,backgroundColor:routeColors[idx%routeColors.length]}} />
                      </div>
                    </div>
                  );
                })}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}