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
      ${type === "error" ? "bg-red-500 text-white" : "bg-blue-600 text-white"}`}>
      {msg}
    </div>
  );
}

export default function StageOperator() {
  const { user, logout } = useAuth();
  const [activeTab, setActiveTab] = useState("issue");
  const [toast, setToast]         = useState(null);
  const showToast = (msg, type = "success") => setToast({ msg, type });
  const navigate = useNavigate(); 
  const token   = localStorage.getItem("token");
  const headers = { Authorization: `Bearer ${token}` };

  // ── Receipt settings configuration ──
  const [saccoSettings, setSaccoSettings] = useState({
    sacco_name: "2KM SACCO",
    location: "",
    po_box: "",
    phone_number: ""
  });

  // ── Receipt state ──
  const [routes, setRoutes]   = useState([]);
  const [matatus, setMatatus] = useState([]);
  const [matatuSearch, setMatatuSearch]   = useState("");
  const [showMatatuDrop, setShowMatatuDrop] = useState(false);
  const [draft, setDraft]     = useState(null);
  const [submitted, setSubmitted] = useState(false);
  const [vehicleTripCount, setVehicleTripCount] = useState(0);

  const [form, setForm] = useState({
    sacco_name: "2KM SACCO", matatu_id:"", plate:"", owner_name:"",
    route_id:"", from_stage:"", to_stage:"", shimo_fee:"", capacity:"",
    mode_of_payment:"Cash", date_issued: new Date().toISOString().split("T")[0],
    operator_membership_no: user?.membership_no || ""
  });

  // ── Receipts list ──
  const [receipts, setReceipts]     = useState([]);
  const [filterDate, setFilterDate] = useState(new Date().toISOString().split("T")[0]);

  // ── Daily summary & Vehicle Tracker State ──
  const [showSummary, setShowSummary]       = useState(false);
  const [summaryDate, setSummaryDate]       = useState(new Date().toISOString().split("T")[0]);
  const [summary, setSummary]               = useState(null);
  const [summaryLoading, setSummaryLoading] = useState(false);

  // Tracking states
  const [trackerPlate, setTrackerPlate]     = useState("");
  const [trackerDate, setTrackerDate]       = useState(new Date().toISOString().split("T")[0]);
  const [trackerResult, setTrackerResult]   = useState(null);
  const [cumulativeSummary, setCumulativeSummary] = useState(null);

  const fetchMatatusList = () => {
    fetch(`${API}/matatus`).then(r => r.json()).then(data => setMatatus(Array.isArray(data) ? data : [])).catch(() => {});
  };

  const fetchRoutesList = () => {
    fetch(`${API}/routes`).then(r => r.json()).then(data => setRoutes(Array.isArray(data) ? data : [])).catch(() => {});
  };

  useEffect(() => {
    fetchRoutesList();
    fetchMatatusList();

    fetch(`${API}/settings/sacco`, { headers })
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data && !Array.isArray(data)) {
          setSaccoSettings(data);
          setForm(f => ({ ...f, sacco_name: data.sacco_name || "2KM SACCO" }));
        }
      })
      .catch(() => {});
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

  // ── DYNAMIC ROUTE CHANGE HANDLER ──
  const handleRouteChange = (routeId) => {
    const route = routes.find(r => r.id === parseInt(routeId));
    if (route) {
      const feeToApply = vehicleTripCount > 0 
        ? (parseFloat(route.subsequent_fee) || 100) 
        : parseFloat(route.shimo_fee);

      setForm(f => ({
        ...f,
        route_id: route.id,
        from_stage: route.from_stage,
        to_stage: route.to_stage,
        shimo_fee: feeToApply
      }));

      if (vehicleTripCount > 0) {
        showToast(`ℹ️ Subsequent trip rate applied: KES ${feeToApply} (Trip #${vehicleTripCount + 1})`, "success");
      }
    } else {
      setForm(f => ({ ...f, route_id: "", from_stage: "", to_stage: "", shimo_fee: "" }));
    }
  };

  // ── SELECT MATATU HANDLER ──
  const selectMatatu = async (matatu) => {
    const cleanPlate = (matatu.plate || "").trim().toUpperCase();
    setMatatuSearch(cleanPlate); 
    setShowMatatuDrop(false);

    let tripsToday = 0;

    // Automated backend check for trips made today
    try {
      const res = await fetch(`${API}/receipts/check-vehicle-trips?plate=${encodeURIComponent(cleanPlate)}&date=${form.date_issued}`, { headers });
      if (res.ok) {
        const data = await res.json();
        tripsToday = data.trip_count || 0;
        setVehicleTripCount(tripsToday);
      }
    } catch (err) {
      console.error("Failed to check vehicle trip status", err);
    }

    // Resolve route fee accurately
    const targetRouteId = form.route_id || matatu.route_id;
    const currentRoute = routes.find(r => r.id === parseInt(targetRouteId));
    
    let calculatedFee = 100;
    if (currentRoute) {
      calculatedFee = tripsToday > 0 
        ? (parseFloat(currentRoute.subsequent_fee) || 100) 
        : parseFloat(currentRoute.shimo_fee);
    } else {
      calculatedFee = tripsToday > 0 ? 100 : (form.shimo_fee || 200);
    }

    setForm(f => ({
      ...f,
      matatu_id: matatu.id,
      plate: cleanPlate,
      owner_name: matatu.owner_member_no || "",
      capacity: matatu.capacity || "",
      route_id: currentRoute ? currentRoute.id : f.route_id,
      from_stage: currentRoute ? currentRoute.from_stage : f.from_stage,
      to_stage: currentRoute ? currentRoute.to_stage : f.to_stage,
      shimo_fee: calculatedFee
    }));

    if (tripsToday > 0) {
      showToast(`ℹ️ ${cleanPlate} has already made ${tripsToday} trip(s) today. Fee automatically adjusted to subsequent rate: KES ${calculatedFee} (Trip #${tripsToday + 1}).`, "success");
    } else {
      showToast(`✅ ${cleanPlate} selected for 1st Trip (KES ${calculatedFee}).`, "success");
    }
  };

  // ── STRICT VALIDATION GUARD FOR MULTI-TRIP RULE ──
  const checkVehicleTripRule = async () => {
    if (!form.plate || !form.date_issued) return true;
    try {
      const cleanPlate = form.plate.trim().toUpperCase();
      const res = await fetch(`${API}/receipts/check-vehicle-trips?plate=${encodeURIComponent(cleanPlate)}&date=${form.date_issued}`, { headers });
      if (res.ok) {
        const data = await res.json();
        if (data.trip_count > 0) {
          const currentRoute = routes.find(r => r.id === parseInt(form.route_id));
          const maxAllowedSubsequentFee = currentRoute ? (parseFloat(currentRoute.subsequent_fee) || 100) : 100;
          if (parseFloat(form.shimo_fee) > maxAllowedSubsequentFee) {
            showToast(`⚠️ Vehicle ${cleanPlate} has already completed a trip today! Subsequent trip fee must be KES ${maxAllowedSubsequentFee}.`, "error");
            return false;
          }
        }
      }
    } catch (e) {
      console.error("Trip verification check error", e);
    }
    return true;
  };

  const saveDraft = async () => {
    if (!form.matatu_id || !form.route_id || !form.mode_of_payment) {
      return showToast("Fill in matatu, route, and payment mode", "error");
    }
    
    const isValidTripFee = await checkVehicleTripRule();
    if (!isValidTripFee) return;

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
    const isValidTripFee = await checkVehicleTripRule();
    if (!isValidTripFee) return;

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
    setDraft({ ...draft, ...payload }); showToast("Draft updated ✓");
  };

  const submitReceipt = async () => {
    if (!draft?.id) return showToast("Save a draft first", "error");
    const isValidTripFee = await checkVehicleTripRule();
    if (!isValidTripFee) {
      showToast("Cannot submit: Adjust fee for subsequent trip rate!", "error");
      return;
    }

    if (!window.confirm("Submit this receipt? It cannot be edited after submission.")) return;
    const res = await fetch(`${API}/receipts/${draft.id}/submit`, { method: "PUT", headers });
    if (!res.ok) { const d = await res.json(); return showToast(d.error || "Submit failed", "error"); }
    setSubmitted(true); showToast("Receipt submitted & locked ✓");
    fetchReceipts();
  };

  const resetForm = () => {
    setDraft(null); setSubmitted(false); setMatatuSearch(""); setVehicleTripCount(0);
    fetchMatatusList(); // Refresh matatus list in background
    setForm({
      sacco_name: saccoSettings.sacco_name || "2KM SACCO", matatu_id:"", plate:"", owner_name:"",
      route_id:"", from_stage:"", to_stage:"", shimo_fee:"", capacity:"",
      mode_of_payment:"Cash", date_issued: new Date().toISOString().split("T")[0],
      operator_membership_no: user?.membership_no || ""
    });
  };

  // ── SLIP PRINTING ──
 const printReceipt = async (r) => {
  let tripNumber = 1;
  let isFirstTrip = true;
  const feePaid = parseFloat(r.shimo_fee || 0);

  try {
    const res = await fetch(
      `${API}/receipts/check-vehicle-trips?plate=${encodeURIComponent(r.plate)}&date=${r.date_issued}`,
      { headers }
    );
    if (res.ok) {
      const data = await res.json();
      const count = data.trip_count || 1;
      isFirstTrip = count <= 1 && feePaid >= 150;
      tripNumber = count;
    }
  } catch {
    isFirstTrip = feePaid >= 150;
  }

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
    .box { border-top: 1px solid #000; border-bottom: 1px solid #000; padding: 1px 0; font-weight: bold; }
    .footer { text-align: center; margin-top: 3px; font-size: 8px; line-height: 1.1; }
  </style></head>
  <body>
    <h2>${r.sacco_name || "2KM SACCO"}</h2>
    <div class="meta">
      ${r.location ? `${r.location}` : ""}${r.phone_number ? ` | Tel: ${r.phone_number}` : ""}
    </div>
    <div class="ticket">${r.ticket_number}</div>
    <div class="line"><span>Plate:</span><span class="highlight">${r.plate}</span></div>
    <div class="line"><span>Owner No:</span><span>${r.owner_name || "N/A"}</span></div>
    <div class="line"><span>Route:</span><span>${r.from_stage} → ${r.to_stage}</span></div>

    ${isFirstTrip ? `
      <div class="line box">
        <span>Savings Credited (${r.owner_name || "N/A"}):</span>
        <span class="highlight">KES 50.00</span>
      </div>
    ` : `
      <div class="line box">
        <span>Trip Cleared:</span>
        <span class="highlight">#${tripNumber}</span>
      </div>
    `}

    <div class="line"><span>${r.date_issued}</span><span>${r.time_issued || ""}</span></div>
    <div class="line"><span>Operator:</span><span>${r.operator_membership_no || user?.membership_no || "N/A"}</span></div>

    <div class="footer">
      ${isFirstTrip
        ? `*** Owner Savings Slip ***<br/>Stage Clearance Verified`
        : `*** Stage Clearance Slip (Trip #${tripNumber}) ***<br/>Stage Clearance Verified`}
    </div>
  </body></html>`);
  win.document.close();
  setTimeout(() => win.print(), 500);
};

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
            📊 Daily Summary & Tracker
          </button>
        </nav>

        <button onClick={handleLogout} className="mt-4 w-full p-3 rounded text-sm bg-red-600 hover:bg-red-500 text-white font-bold transition-all">
          🚪 Logout
        </button>
      </div>

      {/* CONTENT */}
      <div className="flex-1 p-6 overflow-y-auto">

        {/* ISSUE RECEIPT */}
        {activeTab === "issue" && (
          <div className="max-w-2xl mx-auto">
            <h2 className="text-2xl font-bold mb-6 text-gray-800">🎫 Issue Main Stage Receipt</h2>
            <div className="bg-white rounded-xl shadow p-6 space-y-4">
              
              <div>
                <label className="text-sm font-medium text-gray-700">SACCO Details (Receipt Header)</label>
                <div className="bg-gray-50 border border-gray-200 rounded-lg p-3.5 mt-1 text-xs text-gray-600 space-y-1 shadow-inner">
                  <p className="font-bold text-sm text-gray-800">🏢 {saccoSettings.sacco_name}</p>
                  {saccoSettings.location && <p>📍 Address: {saccoSettings.location}</p>}
                  {saccoSettings.po_box && <p>📬 PO Box: {saccoSettings.po_box}</p>}
                  {saccoSettings.phone_number && <p>📞 Hotline: {saccoSettings.phone_number}</p>}
                </div>
              </div>

              <div className="relative">
                <label className="text-sm font-medium text-gray-700">Matatu Plate</label>
                <input type="text" placeholder="Search plate number..." value={matatuSearch}
                  onChange={e => { setMatatuSearch(e.target.value); setShowMatatuDrop(true); }}
                  onFocus={() => { fetchMatatusList(); setShowMatatuDrop(true); }}
                  className="border border-gray-300 p-2.5 w-full rounded-lg mt-1 outline-none focus:border-blue-500 text-gray-800 bg-white uppercase font-bold"
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
                  <option value="">Select Route</option>
                  {routes.map(r => (
                    <option key={r.id} value={r.id}>
                      {r.from_stage} → {r.to_stage} (1st: KES {r.shimo_fee} | 2nd+: KES {r.subsequent_fee || 100})
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-sm font-medium text-gray-700">Shimo Fee (KES)</label>
                  <input type="number" value={form.shimo_fee} onChange={e => setForm({...form,shimo_fee:e.target.value})}
                    className="border border-gray-300 p-2.5 w-full rounded-lg mt-1 bg-white text-gray-800 font-bold text-blue-700" disabled={submitted} />
                  {vehicleTripCount > 0 ? (
                    <p className="text-[10px] text-purple-700 font-bold mt-1">✓ Trip #{vehicleTripCount + 1}: Subsequent rate active.</p>
                  ) : (
                    <p className="text-[10px] text-gray-500 mt-1">1st Trip standard route rate.</p>
                  )}
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
                  className="border border-gray-300 p-2.5 w-full rounded-lg mt-1 bg-white text-gray-800" disabled={submitted}>
                  <option value="Cash">Cash</option>
                  <option value="Mpesa">Mpesa</option>
                </select>
              </div>

              <div>
                <label className="text-sm font-medium text-gray-700">Date</label>
                <input type="date" value={form.date_issued} onChange={e => setForm({...form,date_issued:e.target.value})}
                  className="border border-gray-300 p-2.5 w-full rounded-lg mt-1 bg-white text-gray-800" disabled={submitted} />
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
                  <button onClick={() => printReceipt({...form,...draft})} className="bg-purple-600 text-white font-bold px-4 py-2.5 rounded-lg hover:bg-purple-700">🖨️ Print Slip</button>
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
                      <p className="font-bold text-blue-700">{r.ticket_number}</p>
                      <p className="text-sm text-gray-600">{r.plate} — {r.from_stage} → {r.to_stage} | Fee: KES {r.shimo_fee}</p>
                      <p className="text-xs text-gray-400">Date: {r.date_issued} {r.time_issued}</p>
                    </div>
                    <button onClick={() => printReceipt(r)} className="bg-purple-600 text-white px-3 py-1.5 rounded-lg text-sm font-bold hover:bg-purple-700">🖨️ Print Slip</button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* STAGE & EXPENSES DESK */}
        {activeTab === "stageOperations" && (
          <StageExpensesAndWelfare user={user} />
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
                <button onClick={fetchSummary} className="bg-blue-600 text-white px-4 py-2 rounded-lg font-bold text-xs hover:bg-blue-700">Load Report</button>
              </div>

              {summaryLoading && <p className="text-center text-gray-500 py-3 text-xs">Loading summary...</p>}

              {summary && !summaryLoading && (
                <div className="grid grid-cols-2 gap-3 mt-3">
                  <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 text-center">
                    <p className="text-2xl font-black text-blue-700">{summary.total_tickets}</p>
                    <p className="text-xs text-blue-600 mt-0.5">Total Tickets Issued</p>
                  </div>
                  <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 text-center">
                    <p className="text-xl font-black text-emerald-700">KES {summary.total_amount?.toLocaleString()}</p>
                    <p className="text-xs text-emerald-600 mt-0.5">Total Revenue Collected</p>
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
                <div className="mt-3 border border-blue-200 bg-blue-50 p-3 rounded-xl space-y-2 text-xs">
                  <p className="font-bold text-blue-900">Results for {trackerResult.plate} on {trackerDate}:</p>
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