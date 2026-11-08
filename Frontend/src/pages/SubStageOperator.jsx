import { useState, useEffect } from "react";
import API from "../api";
import { useAuth } from "../context/AuthContext";
import { useNavigate } from "react-router-dom";
import StageExpensesAndWelfare from "../components/StageExpensesAndWelfare";

const TABS = [
  { key: "issue",            label: "🎫 Issue Receipt" },
  { key: "receipts",         label: "📋 My Receipts" },
  { key: "stageOperations",  label: "🛡️ Stage & Expenses" }, 
];

function Toast({ msg, type, onClose }) {
  useEffect(() => { const t = setTimeout(onClose, 3500); return () => clearTimeout(t); }, [onClose]);
  return (
    <div className={`fixed top-5 right-5 z-50 px-5 py-3 rounded-lg shadow-2xl text-sm font-bold animate-bounce
      ${type === "error" ? "bg-red-500 text-white" : "bg-purple-600 text-white"}`}>
      {msg}
    </div>
  );
}

export default function SubStageOperator() {
  const { user, logout } = useAuth();
  const [activeTab, setActiveTab] = useState("issue");
  const [toast, setToast]         = useState(null);
  const showToast = (msg, type = "success") => setToast({ msg, type });
  const navigate = useNavigate(); 
  const token   = localStorage.getItem("token");
  const headers = { Authorization: `Bearer ${token}` };

  // ── SACCO Settings with full header details ──
  const [saccoSettings, setSaccoSettings] = useState({
    sacco_name: "2KM SACCO",
    location: "Nairobi",
    po_box: "P.o.box 90300",
    phone_number: "+254110928525"
  });

  // ── Receipt Form & Draft ──
  const [routes, setRoutes]               = useState([]);
  const [matatus, setMatatus]             = useState([]);
  const [matatuSearch, setMatatuSearch]   = useState("");
  const [showMatatuDrop, setShowMatatuDrop] = useState(false);
  const [draft, setDraft]                 = useState(null);
  const [submitted, setSubmitted]         = useState(false);

  const [form, setForm] = useState({
    sacco_name: "2KM SACCO", matatu_id: "", plate: "", owner_name: "",
    route_id: "", from_stage: "Sub-Branch Stage", to_stage: "", shimo_fee: "100", capacity: "",
    mode_of_payment: "Cash", date_issued: new Date().toISOString().split("T")[0],
    operator_membership_no: user?.membership_no || ""
  });

  // ── Receipts List ──
  const [receipts, setReceipts]     = useState([]);
  const [filterDate, setFilterDate] = useState(new Date().toISOString().split("T")[0]);

  // ── Daily Summary & Tracker ──
  const [showSummary, setShowSummary]       = useState(false);
  const [summaryDate, setSummaryDate]       = useState(new Date().toISOString().split("T")[0]);
  const [summary, setSummary]               = useState(null);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [trackerPlate, setTrackerPlate]     = useState("");
  const [trackerDate, setTrackerDate]       = useState(new Date().toISOString().split("T")[0]);
  const [trackerResult, setTrackerResult]   = useState(null);
  const [cumulativeSummary, setCumulativeSummary] = useState(null);

  const fetchMatatusList = () => {
    fetch(`${API}/matatus`).then(r => r.json()).then(data => setMatatus(Array.isArray(data) ? data : [])).catch(() => {});
  };

  const fetchRoutesList = () => {
    fetch(`${API}/routes`).then(r => r.json()).then(data => {
      setRoutes(Array.isArray(data) ? data : []);
    }).catch(() => {});
  };

  useEffect(() => {
    fetchRoutesList();
    fetchMatatusList();

    fetch(`${API}/settings/sacco`, { headers })
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data && !Array.isArray(data)) {
          setSaccoSettings({
            sacco_name: data.sacco_name || "2KM SACCO",
            location: data.location || "Nairobi",
            po_box: data.po_box || "P.o.box 90300",
            phone_number: data.phone_number || "+254110928525"
          });
          setForm(f => ({ ...f, sacco_name: data.sacco_name || "2KM SACCO" }));
        }
      }).catch(() => {});
  }, []);

  useEffect(() => { fetchReceipts(); }, [filterDate]);

  const fetchReceipts = async () => {
    const res = await fetch(`${API}/receipts/my?date=${filterDate}`, { headers });
    if(res.ok) {
      const data = await res.json();
      setReceipts(Array.isArray(data) ? data : []);
    }
  };

  const filteredMatatus = matatus.filter(m =>
    m.plate?.toLowerCase().includes(matatuSearch.toLowerCase())
  );

  // 1. Keep operator's entered fee on route change
const handleRouteChange = (routeId) => {
  const route = routes.find(r => r.id === parseInt(routeId));
  setForm(f => route
    ? { ...f, route_id: route.id, from_stage: route.from_stage, to_stage: route.to_stage }
    : { ...f, route_id: "", from_stage: "Sub-Branch Stage", to_stage: "" }
  );
};

// 2. In selectMatatu, do NOT overwrite the operator's fee
const selectMatatu = (matatu) => {
  const cleanPlate = (matatu.plate || "").trim().toUpperCase();
  setMatatuSearch(cleanPlate);
  setShowMatatuDrop(false);

  const targetRoute = routes.find(r => r.id === parseInt(form.route_id || matatu.route_id)) || routes[0];

  setForm(f => ({
    ...f,
    matatu_id: matatu.id,
    plate: cleanPlate,
    owner_name: matatu.owner_member_no || "",
    capacity: matatu.capacity || "",
    route_id: targetRoute ? targetRoute.id : f.route_id,
    from_stage: targetRoute ? targetRoute.from_stage : f.from_stage,
    to_stage: targetRoute ? targetRoute.to_stage : f.to_stage
    // Notice: shimo_fee is preserved
  }));

  showToast(`✅ ${cleanPlate} selected for Sub-Branch clearance`, "success");
};

  const saveDraft = async () => {
    if (!form.matatu_id || !form.route_id || !form.mode_of_payment) {
      return showToast("Fill in matatu, route, and payment mode", "error");
    }

    const payload = {
      ...form,
      sacco_name: saccoSettings.sacco_name,
      location: saccoSettings.location,
      po_box: saccoSettings.po_box,
      phone_number: saccoSettings.phone_number,
      issued_by: user?.id,
      operator_membership_no: user?.membership_no
    };

    const res = await fetch(`${API}/receipts`, {
      method: "POST", headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (!res.ok) return showToast(data.error || "Failed to save draft", "error");
    setDraft({ ...payload, id: data.id, ticket_number: data.ticket_number });
    setSubmitted(false);
    showToast(`Draft saved — ${data.ticket_number}`);
  };

  const updateDraft = async () => {
    if (!draft?.id) return;
    const payload = {
      ...form,
      sacco_name: saccoSettings.sacco_name,
      location: saccoSettings.location,
      po_box: saccoSettings.po_box,
      phone_number: saccoSettings.phone_number
    };
    const res = await fetch(`${API}/receipts/${draft.id}`, {
      method: "PUT", headers: { ...headers, "Content-Type": "application/json" }, body: JSON.stringify(payload)
    });
    if (!res.ok) { const d = await res.json(); return showToast(d.error || "Update failed", "error"); }
    setDraft({ ...draft, ...payload });
    showToast("Draft updated ✓");
  };

  // 3. Dynamic submit prompt
const submitReceipt = async () => {
  if (!draft?.id) return showToast("Save a draft first", "error");
  if (!window.confirm(`Submit this receipt? KES ${form.shimo_fee} is credited directly to Sub-Branch Welfare Pool.`)) return;

  const res = await fetch(`${API}/receipts/${draft.id}/submit`, { method: "PUT", headers });
  if (!res.ok) { const d = await res.json(); return showToast(d.error || "Submit failed", "error"); }
  setSubmitted(true);
  showToast("Receipt submitted & welfare credited ✓");
  fetchReceipts();
};

// 4. In resetForm, preserve the operator's fee
const resetForm = () => {
  setDraft(null); setSubmitted(false); setMatatuSearch("");
  fetchMatatusList();
  setForm(f => ({
    sacco_name: saccoSettings.sacco_name || "2KM SACCO", matatu_id: "", plate: "", owner_name: "",
    route_id: "", from_stage: "Sub-Branch Stage", to_stage: "",
    shimo_fee: f.shimo_fee || "100", 
    capacity: "",
    mode_of_payment: "Cash", date_issued: new Date().toISOString().split("T")[0],
    operator_membership_no: user?.membership_no || ""
  }));
};

  // ── SLIP PRINTING: FULL SACCO DETAILS INCLUDED & SHIMO FEE REMOVED ──
  const printReceipt = (r) => {
    const win = window.open("", "_blank");
    win.document.write(`<html><head><title>Receipt ${r.ticket_number}</title>
  <style>
    @page { size: 58mm auto; margin: 0; }
    html, body { margin: 0; padding: 0; }
    body { font-family: monospace; width: 48mm; padding: 1mm 2mm; font-size: 9px; line-height: 1.15; color: #000; }
    h2 { font-size: 11px; text-align: center; margin: 0; }
    .meta { text-align: center; font-size: 8px; margin: 0 0 2px; line-height: 1.1; }
    .ticket { text-align: center; font-size: 10px; font-weight: bold; margin: 2px 0; padding: 1px 0; border: 1px solid #000; white-space: nowrap; }
    .line { display: flex; justify-content: space-between; gap: 4px; margin: 1px 0; padding-bottom: 1px; border-bottom: 1px dashed #999; font-size: 9px; }
    .line span:last-child { text-align: right; }
    .highlight { font-weight: bold; }
    .footer { text-align: center; margin-top: 3px; font-size: 8px; line-height: 1.1; }
  </style></head>
  <body>
    <h2>${r.sacco_name || saccoSettings.sacco_name || "2KM SACCO"}</h2>
    <div class="meta">
      ${r.location || saccoSettings.location || "Nairobi"} | PO Box: ${r.po_box || saccoSettings.po_box || ""}<br/>
      Tel: ${r.phone_number || saccoSettings.phone_number || ""}
    </div>
    <div class="ticket">${r.ticket_number}</div>
    <div class="line"><span>Plate:</span><span class="highlight">${r.plate}</span></div>
    <div class="line"><span>Owner:</span><span>${r.owner_name || "N/A"}</span></div>
    <div class="line"><span>Route:</span><span>${r.from_stage} → ${r.to_stage}</span></div>
    <div class="line"><span>${r.date_issued}</span><span>${r.time_issued || ""}</span></div>
    <div class="line"><span>Operator:</span><span>${r.operator_membership_no || user?.membership_no || "Sub-Branch"}</span></div>
    <div class="footer">*** Sub-Branch Entry Slip ***<br/>Validated for Stage Dispatch</div>
  </body></html>`);
    win.document.close();
    setTimeout(() => win.print(), 500);
  };

  // ── Summary & Tracker ──
  const fetchSummary = async () => {
    setSummaryLoading(true);
    const res = await fetch(`${API}/receipts/summary?date=${summaryDate}`, { headers });
    if (res.ok) setSummary(await res.json());

    const cumRes = await fetch(`${API}/stage/delivery-summary?date=${summaryDate}`, { headers });
    if (cumRes.ok) setCumulativeSummary(await cumRes.json());
    setSummaryLoading(false);
  };

  const lookupVehicleTracker = async (e) => {
    e.preventDefault();
    if (!trackerPlate) return showToast("Enter a vehicle plate", "error");
    const res = await fetch(`${API}/stage/vehicle-performance?plate=${trackerPlate.trim().toUpperCase()}&date=${trackerDate}`, { headers });
    if (res.ok) {
      setTrackerResult(await res.json());
    } else {
      showToast("Failed to fetch tracker history", "error");
    }
  };

  const handleLogout = () => { logout(); navigate("/"); };

  return (
    <div className="flex min-h-screen bg-gray-100">
      {toast && <Toast {...toast} onClose={() => setToast(null)} />}

      {/* SIDEBAR */}
      <div className="w-64 bg-gray-900 text-white flex flex-col p-5 flex-shrink-0">
        <div className="mb-8">
          <div className="w-12 h-12 rounded-full bg-purple-600 flex items-center justify-center text-white font-black text-lg mb-3 shadow">
            {user?.name?.[0] || "S"}
          </div>
          <p className="font-bold text-white">{user?.name}</p>
          <p className="text-xs text-purple-400 uppercase font-bold tracking-widest mt-1">Sub Stage Operator</p>
          <p className="text-xs text-gray-500 mt-1">{user?.membership_no}</p>
        </div>

        <nav className="space-y-1 flex-1">
          {TABS.map(tab => (
            <button key={tab.key} onClick={() => setActiveTab(tab.key)}
              className={`w-full text-left p-3 rounded text-sm font-medium transition-all
                ${activeTab === tab.key ? "bg-purple-600 text-white font-bold" : "text-gray-400 hover:bg-gray-800"}`}>
              {tab.label}
            </button>
          ))}
          <button onClick={() => setShowSummary(true)}
            className="w-full text-left p-3 rounded text-sm text-gray-400 hover:bg-gray-800 hover:text-white font-medium">
            📊 Daily Summary & Tracker
          </button>
        </nav>

        <button onClick={handleLogout} className="mt-4 w-full p-3 rounded text-sm bg-red-600 hover:bg-red-500 text-white font-bold transition-all">
          🚪 Logout
        </button>
      </div>

      {/* CONTENT */}
      <div className="flex-1 p-6 overflow-y-auto">

        {/* ══ TAB 1: ISSUE RECEIPT ══ */}
        {activeTab === "issue" && (
          <div className="max-w-2xl mx-auto">
            <h2 className="text-2xl font-bold mb-6 text-gray-800">🎫 Issue Sub-Branch Receipt</h2>
            
            <div className="bg-white rounded-xl shadow p-6 space-y-4">
              
              {/* SACCO Details Card */}
              <div>
                <label className="text-sm font-medium text-gray-700">SACCO Details (Receipt Header)</label>
                <div className="bg-gray-50 border border-gray-200 rounded-lg p-3.5 mt-1 text-xs text-gray-600 space-y-1.5 shadow-inner">
                  <p className="font-bold text-sm text-gray-800">🏢 {saccoSettings.sacco_name}</p>
                  <p>📍 Address: {saccoSettings.location}</p>
                  <p>📬 PO Box: {saccoSettings.po_box}</p>
                  <p>📞 Hotline: {saccoSettings.phone_number}</p>
                </div>
              </div>

              <div className="relative">
                <label className="text-sm font-medium text-gray-700">Matatu Plate</label>
                <input type="text" placeholder="Search plate number..." value={matatuSearch}
                  onChange={e => { setMatatuSearch(e.target.value); setShowMatatuDrop(true); }}
                  onFocus={() => { fetchMatatusList(); setShowMatatuDrop(true); }}
                  className="border border-gray-300 p-2.5 w-full rounded-lg mt-1 outline-none focus:border-purple-500 text-gray-800 bg-white uppercase font-bold"
                  disabled={submitted} />
                {showMatatuDrop && matatuSearch && (
                  <div className="absolute z-50 bg-white border border-gray-200 w-full max-h-48 overflow-y-auto shadow-lg rounded-lg mt-1">
                    {filteredMatatus.length > 0 ? filteredMatatus.map(m => (
                      <div key={m.id} onClick={() => selectMatatu(m)} className="p-3 hover:bg-purple-50 cursor-pointer border-b border-gray-100">
                        <p className="font-bold text-sm text-gray-800">{m.plate}</p>
                        <p className="text-xs text-gray-500">Owner: {m.owner_member_no}</p>
                      </div>
                    )) : <p className="p-3 text-gray-500 text-sm">No matatu found</p>}
                  </div>
                )}
              </div>

              <div>
                <label className="text-sm font-medium text-gray-700">Owner Name / Member No</label>
                <input value={form.owner_name} readOnly className="border p-2.5 w-full rounded-lg mt-1 bg-gray-50 text-gray-700" />
              </div>

              <div>
                <label className="text-sm font-medium text-gray-700">Route</label>
                <select 
                  value={form.route_id} 
                  onChange={e => handleRouteChange(e.target.value)}
                  className="border border-gray-300 p-2.5 w-full rounded-lg mt-1 bg-white text-gray-800" 
                  disabled={submitted}
                >
                  <option value="">Select Sub-Branch Route</option>
                  {routes.map(r => (
                    <option key={r.id} value={r.id}>
                      {r.from_stage} → {r.to_stage} (KES {r.shimo_fee || 100})
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
             <div>
  <label className="text-sm font-medium text-gray-700">Sub-Stage Fee (KES)</label>
  <input 
    type="number" 
    value={form.shimo_fee} 
    onChange={e => setForm({ ...form, shimo_fee: e.target.value })}
    placeholder="Enter fee amount"
    className="border border-gray-300 p-2.5 w-full rounded-lg mt-1 bg-white text-purple-700 font-bold outline-none focus:border-purple-500" 
    disabled={submitted} 
  />
  <p className="text-[10px] text-purple-600 font-bold mt-1">
    100% of KES {form.shimo_fee || 0} routed to Sub-Branch Welfare Pool
  </p>
</div>
                <div>
                  <label className="text-sm font-medium text-gray-700">Capacity</label>
                  <input type="number" value={form.capacity} onChange={e => setForm({...form, capacity: e.target.value})}
                    placeholder="e.g. 14" className="border border-gray-300 p-2.5 w-full rounded-lg mt-1 outline-none focus:border-purple-500 text-gray-800 bg-white" disabled={submitted} />
                </div>
              </div>

              <div>
                <label className="text-sm font-medium text-gray-700">Mode of Payment</label>
                <select value={form.mode_of_payment} onChange={e => setForm({...form, mode_of_payment: e.target.value})}
                  className="border border-gray-300 p-2.5 w-full rounded-lg mt-1 bg-white text-gray-800" disabled={submitted}>
                  <option value="Cash">Cash</option>
                  <option value="Mpesa">Mpesa</option>
                </select>
              </div>

              <div>
                <label className="text-sm font-medium text-gray-700">Date</label>
                <input type="date" value={form.date_issued} onChange={e => setForm({...form, date_issued: e.target.value})}
                  className="border border-gray-300 p-2.5 w-full rounded-lg mt-1 bg-white text-gray-800" disabled={submitted} />
              </div>

              {draft?.ticket_number && (
                <div className="bg-purple-50 border border-purple-200 rounded-lg p-3">
                  <p className="text-sm text-purple-700">Draft Ticket: <span className="font-bold text-lg">{draft.ticket_number}</span></p>
                </div>
              )}
              {submitted && (
                <div className="bg-green-50 border border-green-300 rounded-lg p-3 text-center">
                  <p className="text-green-700 font-bold">✅ Receipt Submitted & KES 100 Credited to Welfare</p>
                </div>
              )}

              <div className="flex gap-3 pt-2">
                {!draft && <button onClick={saveDraft} className="bg-yellow-500 text-white font-bold px-4 py-2.5 rounded-lg hover:bg-yellow-600">💾 Save Draft</button>}
                {draft && !submitted && (<>
                  <button onClick={updateDraft} className="bg-yellow-500 text-white font-bold px-4 py-2.5 rounded-lg hover:bg-yellow-600">✏️ Update Draft</button>
                  <button onClick={submitReceipt} className="bg-purple-600 text-white font-bold px-4 py-2.5 rounded-lg hover:bg-purple-700">✅ Submit</button>
                </>)}
                {submitted && (<>
                  <button onClick={() => printReceipt({...form, ...draft})} className="bg-purple-600 text-white font-bold px-4 py-2.5 rounded-lg hover:bg-purple-700">🖨️ Print Slip</button>
                  <button onClick={resetForm} className="bg-blue-600 text-white font-bold px-4 py-2.5 rounded-lg hover:bg-blue-700">+ New Receipt</button>
                </>)}
              </div>
            </div>
          </div>
        )}

        {/* ══ TAB 2: MY RECEIPTS ══ */}
        {activeTab === "receipts" && (
          <div>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-2xl font-bold text-gray-800">📋 My Sub-Branch Receipts</h2>
              <input type="date" value={filterDate} onChange={e => setFilterDate(e.target.value)}
                className="border border-gray-300 p-2 rounded-lg text-sm text-gray-800 bg-white" />
            </div>
            {receipts.length === 0 ? (
              <div className="bg-white rounded-xl shadow p-8 text-center text-gray-500">No receipts for {filterDate}</div>
            ) : (
              <div className="space-y-3">
                {receipts.map(r => (
                  <div key={r.id} className="bg-white rounded-xl shadow p-4 flex justify-between items-center">
                    <div>
                      <p className="font-bold text-purple-700">{r.ticket_number}</p>
                      <p className="text-sm text-gray-600">{r.plate} — {r.from_stage} → {r.to_stage}</p>
                      <p className="text-xs text-gray-400">Date: {r.date_issued} {r.time_issued}</p>
                    </div>
                    <button onClick={() => printReceipt(r)} className="bg-purple-600 text-white px-3 py-1.5 rounded-lg text-sm font-bold hover:bg-purple-700">🖨️ Print Slip</button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ══ TAB 3: STAGE & EXPENSES (POLICE REMOVED) ══ */}
        {activeTab === "stageOperations" && (
          <StageExpensesAndWelfare user={user} isSubStage={true} />
        )}
      </div>

      {/* ── EXPANDED DAILY SUMMARY & TRACKER MODAL ── */}
      {showSummary && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-2xl w-[600px] max-h-[90vh] overflow-y-auto p-6 space-y-6">
            <div className="flex justify-between items-center border-b pb-3">
              <h3 className="text-xl font-bold text-gray-800">📊 Daily Summary & Vehicle Tracker</h3>
              <button onClick={() => setShowSummary(false)} className="text-gray-400 hover:text-gray-700 text-xl font-bold">✕</button>
            </div>

            <div>
              <label className="text-xs font-bold text-gray-600 uppercase">Select Summary Date</label>
              <div className="flex gap-3 mt-1">
                <input type="date" value={summaryDate} onChange={e => setSummaryDate(e.target.value)}
                  className="border border-gray-300 p-2 rounded-lg flex-1 text-gray-800 bg-white" />
                <button onClick={fetchSummary} className="bg-purple-600 text-white px-4 py-2 rounded-lg font-bold text-xs hover:bg-purple-700">Load Report</button>
              </div>

              {summaryLoading && <p className="text-center text-gray-500 py-3 text-xs">Loading summary...</p>}

              {summary && !summaryLoading && (
                <div className="grid grid-cols-2 gap-3 mt-3">
                  <div className="bg-purple-50 border border-purple-200 rounded-xl p-3 text-center">
                    <p className="text-2xl font-black text-purple-700">{summary.total_tickets}</p>
                    <p className="text-xs text-purple-600 mt-0.5">Total Tickets Issued</p>
                  </div>
                  <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 text-center">
                    <p className="text-xl font-black text-emerald-700">KES {summary.total_amount?.toLocaleString()}</p>
                    <p className="text-xs text-emerald-600 mt-0.5">Total Revenue Collected (Welfare)</p>
                  </div>
                </div>
              )}
            </div>

            <div className="border-t pt-4">
              <h4 className="text-xs font-bold text-gray-800 uppercase tracking-wide mb-2">🔍 Vehicle Performance & Trip History Tracker</h4>
              <form onSubmit={lookupVehicleTracker} className="bg-gray-50 p-4 rounded-xl border border-gray-200 space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[11px] font-medium text-gray-600">Vehicle Plate</label>
                    <input type="text" placeholder="e.g., KBC 123A" value={trackerPlate}
                      onChange={e => setTrackerPlate(e.target.value)}
                      className="w-full mt-1 border border-gray-300 rounded-lg p-2 text-xs uppercase bg-white text-gray-800" />
                  </div>
                  <div>
                    <label className="text-[11px] font-medium text-gray-600">Date</label>
                    <input type="date" value={trackerDate} onChange={e => setTrackerDate(e.target.value)}
                      className="w-full mt-1 border border-gray-300 rounded-lg p-2 text-xs bg-white text-gray-800" />
                  </div>
                </div>
                <button type="submit" className="bg-gray-800 hover:bg-gray-900 text-white font-bold text-xs px-4 py-2 rounded-lg">
                  Search Vehicle Trips
                </button>
              </form>

              {trackerResult && (
                <div className="mt-3 border border-purple-200 bg-purple-50 p-3 rounded-xl space-y-2 text-xs">
                  <p className="font-bold text-purple-900">Results for {trackerResult.plate} on {trackerDate}:</p>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="bg-white p-2 rounded border">
                      <span className="text-gray-500">Total Trips Made:</span> <b>{trackerResult.total_trips || 0}</b>
                    </div>
                    <div className="bg-white p-2 rounded border">
                      <span className="text-gray-500">Total Fees Collected:</span> <b className="text-emerald-700">KES {trackerResult.total_collected || 0}</b>
                    </div>
                  </div>
                </div>
              )}
            </div>

          </div>
        </div>
      )}
    </div>
  );
}