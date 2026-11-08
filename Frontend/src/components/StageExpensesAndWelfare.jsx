import { useState, useEffect } from "react";
import API from "../api";

export default function StageExpensesAndWelfare({ user }) {
  const token = localStorage.getItem("token");
  const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };

  const [toast, setToast] = useState(null);
  const showToast = (msg, type = "success") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  };

  const [accounts] = useState(["Equity Bank - Stage Acc", "M-Pesa Till 554433", "Petty Cash Box"]);
  const [vehicles, setVehicles] = useState([]);
  const [driversAndConductors, setDriversAndConductors] = useState([]);
  const [attendanceList, setAttendanceList] = useState([]);
  
  // Sub-tabs
  const [subTab, setSubTab] = useState("expenses");

  // 1. POLICE POOL & EXPENSES STATE
  const [policeBalance, setPoliceBalance] = useState(0);
  const [policePayouts, setPolicePayouts] = useState([]);
  const [showPolicePayoutForm, setShowPolicePayoutForm] = useState(false);

  const [policePayoutForm, setPolicePayoutForm] = useState({
    amount: "",
    recipient: "Traffic Base / Officer on Duty",
    source_account: "Petty Cash Box",
    date: new Date().toISOString().split("T")[0],
    notes: ""
  });

  const [expenseList, setExpenseList] = useState([]);
  const [expenseFilterDate, setExpenseFilterDate] = useState("");

  // 2. DELIVERY FEE & VEHICLE PERFORMANCE STATE
  const [deliveryDateFilter, setDeliveryDateFilter] = useState(new Date().toISOString().split("T")[0]);
  const [dailyDeliverySummary, setDailyDeliverySummary] = useState(null);
  const [searchPlate, setSearchPlate] = useState("");
  const [vehiclePerformance, setVehiclePerformance] = useState(null);
  const [loadingPerformance, setLoadingPerformance] = useState(false);

  // 3. PENALTIES STATE
  const [penaltyForm, setPenaltyForm] = useState({
    member_id: "",
    member_name: "",
    membership_no: "",
    role: "Driver",
    mistake: "",
    action_type: "Cash",
    amount_paid: "",
    suspension_days: "",
    date: new Date().toISOString().split("T")[0]
  });

  // 4. WELFARE & CASUAL PAYMENTS WALLET LEDGER
  const [welfareTxnForm, setWelfareTxnForm] = useState({
    type: "Payout", 
    recipient_or_source: "",
    amount: "",
    reason: "",
    date: new Date().toISOString().split("T")[0]
  });
  const [welfareTransactions, setWelfareTransactions] = useState([]);
  const [welfareBalance, setWelfareBalance] = useState(0);

  useEffect(() => {
    fetch(`${API}/matatus`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.ok ? r.json() : [])
      .then(data => setVehicles(Array.isArray(data) ? data : []))
      .catch(() => {});

    fetch(`${API}/members`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.ok ? r.json() : [])
      .then(data => {
        const list = Array.isArray(data) ? data : [];
        const crew = list.filter(m => {
          const r = (m.role || "").toLowerCase();
          return r === "driver" || r === "conductor";
        });
        setDriversAndConductors(crew.length > 0 ? crew : list);

        const staff = list.filter(m => {
          const r = (m.role || "").toLowerCase();
          return !["owner", "hr", "director", "admin"].includes(r);
        });
        setAttendanceList(staff.map(m => ({ ...m, status: "Present" })));
      })
      .catch(() => {});

    fetchWelfareTransactions();
    fetchStageExpenses();
    fetchPolicePoolData();
  }, []);
  
  useEffect(() => {
    if (subTab === "delivery") {
      fetchDailyDeliverySummary();
    }
  }, [subTab, deliveryDateFilter]);

  useEffect(() => {
    fetchStageExpenses();
  }, [expenseFilterDate]);

  // Fetch police pool & payouts
  const fetchPolicePoolData = async () => {
    try {
      const res = await fetch(`${API}/stage/police-pool`, { headers: { Authorization: `Bearer ${token}` } });
      if (res.ok) {
        const data = await res.json();
        setPoliceBalance(data.current_balance ?? data.balance ?? 0);
        setPolicePayouts(Array.isArray(data.payouts) ? data.payouts : []);
      }
    } catch {
      // Fallback
    }
  };

  const fetchWelfareTransactions = async () => {
    const res = await fetch(`${API}/stage/welfare-ledger`, { headers: { Authorization: `Bearer ${token}` } });
    if (res.ok) {
      const data = await res.json();
      setWelfareTransactions(Array.isArray(data.transactions) ? data.transactions : []);
      setWelfareBalance(data.balance || 0);
    }
  };

  const fetchStageExpenses = async () => {
    const url = expenseFilterDate ? `${API}/stage/expenses?date=${expenseFilterDate}` : `${API}/stage/expenses`;
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (res.ok) {
      const data = await res.json();
      setExpenseList(Array.isArray(data) ? data : []);
    }
  };
  
  const fetchDailyDeliverySummary = async () => {
    const res = await fetch(`${API}/stage/delivery-summary?date=${deliveryDateFilter}`, { headers: { Authorization: `Bearer ${token}` } });
    if (res.ok) {
      const data = await res.json();
      setDailyDeliverySummary(data);
    } else {
      setDailyDeliverySummary(null);
    }
  };

  // ── POLICE PAYOUT DISBURSEMENT HANDLER ──
  const handlePolicePayoutSubmit = async (e) => {
    e.preventDefault();
    const amountNum = parseFloat(policePayoutForm.amount);
    if (!amountNum || amountNum <= 0) return showToast("Enter a valid payout amount", "error");
    if (amountNum > policeBalance) {
      if (!window.confirm(`Warning: Payout of KES ${amountNum} exceeds current accumulated police balance of KES ${policeBalance}. Proceed anyway?`)) {
        return;
      }
    }

    try {
      const res = await fetch(`${API}/stage/police-payout`, {
        method: "POST",
        headers,
        body: JSON.stringify(policePayoutForm)
      });
      if (res.ok) {
        showToast(`Police payment of KES ${amountNum} recorded & deducted ✓`);
        setPolicePayoutForm({
          amount: "",
          recipient: "Traffic Base / Officer on Duty",
          source_account: "Petty Cash Box",
          date: new Date().toISOString().split("T")[0],
          notes: ""
        });
        setShowPolicePayoutForm(false);
        fetchPolicePoolData();
        fetchStageExpenses();
      } else {
        const err = await res.json();
        showToast(err.error || "Failed to record police payout", "error");
      }
    } catch {
      showToast("Network error submitting police payout", "error");
    }
  };

  const handleSearchVehiclePerformance = async (e) => {
    e.preventDefault();
    if (!searchPlate) return showToast("Enter or select a vehicle plate to search", "error");
    
    setLoadingPerformance(true);
    try {
      const res = await fetch(`${API}/stage/vehicle-performance?plate=${searchPlate.trim().toUpperCase()}&date=${deliveryDateFilter}`, { headers: { Authorization: `Bearer ${token}` } });
      if (res.ok) {
        const data = await res.json();
        setVehiclePerformance(data);
      } else {
        showToast("Could not retrieve vehicle performance data", "error");
        setVehiclePerformance(null);
      }
    } catch {
      showToast("Network error fetching performance data", "error");
    }
    setLoadingPerformance(false);
  };

  const handleMemberSelect = (e) => {
    const memId = e.target.value;
    const found = driversAndConductors.find(m => String(m.id) === String(memId));
    if (found) {
      setPenaltyForm(f => ({
        ...f,
        member_id: found.id,
        member_name: found.name || `${found.first_name || ""} ${found.last_name || ""}`,
        membership_no: found.membership_no || found.id,
        role: found.role ? found.role.charAt(0).toUpperCase() + found.role.slice(1) : "Driver"
      }));
    }
  };

  const handlePenaltySubmit = async (e) => {
    e.preventDefault();
    if (!penaltyForm.member_id) return showToast("Select a driver or conductor", "error");
    const res = await fetch(`${API}/stage/penalties`, {
      method: "POST",
      headers,
      body: JSON.stringify(penaltyForm)
    });
    if (res.ok) {
      showToast(`Penalty logged. Action: ${penaltyForm.action_type === "Cash" ? "Paid by Cash" : `Suspended for ${penaltyForm.suspension_days} days`}`);
      setPenaltyForm(f => ({ ...f, mistake: "", amount_paid: "", suspension_days: "", member_id: "" }));
    } else {
      showToast("Failed to record penalty", "error");
    }
  };

  const handleWelfareTxnSubmit = async (e) => {
    e.preventDefault();
    const res = await fetch(`${API}/stage/welfare-ledger`, {
      method: "POST",
      headers,
      body: JSON.stringify(welfareTxnForm)
    });
    if (res.ok) {
      showToast(`Welfare transaction recorded successfully (${welfareTxnForm.type}) ✓`);
      setWelfareTxnForm({
        type: "Payout",
        recipient_or_source: "",
        amount: "",
        reason: "",
        date: new Date().toISOString().split("T")[0]
      });
      fetchWelfareTransactions();
    } else {
      showToast("Failed to process welfare transaction", "error");
    }
  };

  const handleAttendanceChange = (index, status) => {
    const updated = [...attendanceList];
    updated[index].status = status;
    setAttendanceList(updated);
  };

  const submitAttendanceToHR = async () => {
    const absentees = attendanceList.filter(a => a.status === "Absent");
    const res = await fetch(`${API}/stage/attendance-report`, {
      method: "POST", headers,
      body: JSON.stringify({ date: new Date().toISOString().split("T")[0], attendance: attendanceList, absent_count: absentees.length })
    });
    if (res.ok) {
      showToast(`Attendance submitted. ${absentees.length} absence notification(s) sent to HR ✓`);
    } else {
      showToast("Failed to submit attendance", "error");
    }
  };

  return (
    <div className="bg-white rounded-2xl shadow-xl p-6 mt-6 border border-gray-200">
      {toast && (
        <div className={`fixed top-5 right-5 z-50 px-4 py-2 rounded-lg text-white font-bold text-sm shadow-lg ${toast.type === "error" ? "bg-red-500" : "bg-emerald-600"}`}>
          {toast.msg}
        </div>
      )}

      <div className="border-b border-gray-200 pb-4 mb-6">
        <h2 className="text-xl font-black text-gray-900">🛡️ Stage Operations, Expenses & Compliance Desk</h2>
        <p className="text-xs text-gray-500">Track accumulated police funds, pay out police clearances, and manage welfare ledger.</p>
      </div>

      <div className="flex flex-wrap gap-2 mb-6 bg-gray-50 p-1.5 rounded-xl border border-gray-200">
        {[
          { key: "expenses", label: "👮 Police Fund & Stage Expenses" },
          { key: "delivery", label: "🚐 Vehicle Performance & Summaries" },
          { key: "penalties", label: "⚠️ Driver Penalties" },
          { key: "attendance", label: "📋 Attendance & HR" },
          { key: "welfare", label: "🔒 Welfare & Casuals Ledger" },
        ].map(tab => (
          <button
            key={tab.key}
            onClick={() => setSubTab(tab.key)}
            className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${
              subTab === tab.key ? "bg-blue-600 text-white shadow" : "text-gray-600 hover:bg-gray-200"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* TAB 1: POLICE POOL & STAGE EXPENSES */}
      {subTab === "expenses" && (
        <div className="space-y-6 max-w-3xl">
          
          {/* ── POLICE POOL BALANCE & QUICK PAYOUT CARD ── */}
          <div className="bg-gradient-to-r from-blue-900 to-indigo-900 text-white p-5 rounded-2xl shadow-lg flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <div>
              <span className="text-[11px] bg-blue-700 text-blue-100 uppercase tracking-widest px-2.5 py-0.5 rounded-full font-bold">
                Clearance Fund Tracker
              </span>
              <h3 className="text-xl font-extrabold mt-1">👮 Police Fee Accumulated Pool</h3>
              <p className="text-xs text-blue-200 mt-0.5">
                Automatically accumulated when receipts are issued. Disbursing will subtract from this balance.
              </p>
            </div>
            <div className="text-left sm:text-right bg-white/10 backdrop-blur-sm px-5 py-3 rounded-xl border border-white/20 w-full sm:w-auto flex sm:flex-col justify-between items-center sm:items-end">
              <span className="text-[11px] text-blue-200 font-bold uppercase tracking-wider">Current Police Balance</span>
              <span className="text-2xl font-black text-emerald-300">KES {Number(policeBalance).toLocaleString()}</span>
              <button
                type="button"
                onClick={() => setShowPolicePayoutForm(!showPolicePayoutForm)}
                className="mt-2 text-xs bg-emerald-500 hover:bg-emerald-600 text-white font-bold px-3 py-1.5 rounded-lg transition-all shadow"
              >
                {showPolicePayoutForm ? "✕ Close Payout Form" : "💸 Record Police Payment"}
              </button>
            </div>
          </div>

          {/* ── POLICE PAYOUT DISBURSEMENT FORM (SUBTRACTS FROM BALANCE) ── */}
          {showPolicePayoutForm && (
            <form onSubmit={handlePolicePayoutSubmit} className="space-y-4 bg-blue-50/70 p-5 rounded-2xl border-2 border-blue-200 animate-fadeIn">
              <div className="flex justify-between items-center border-b border-blue-200 pb-2">
                <h4 className="text-xs font-bold text-blue-900 uppercase tracking-wide">
                  👮 Record Police Clearance Payment (Deduct From Pool)
                </h4>
                <span className="text-[11px] text-blue-700 font-bold">
                  Current Pool Available: KES {Number(policeBalance).toLocaleString()}
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="text-xs font-medium text-gray-700">Amount Paid (KES) <span className="text-red-500">*</span></label>
                  <input
                    type="number"
                    placeholder="e.g. 1500"
                    value={policePayoutForm.amount}
                    onChange={e => setPolicePayoutForm(f => ({ ...f, amount: e.target.value }))}
                    className="w-full mt-1 border border-gray-300 rounded-lg p-2.5 text-xs bg-white text-gray-800 font-bold text-emerald-700"
                    required
                  />
                </div>

                <div>
                  <label className="text-xs font-medium text-gray-700">Recipient / Officer / Base <span className="text-red-500">*</span></label>
                  <input
                    type="text"
                    placeholder="e.g. Traffic Base Commander / Stage Patrol"
                    value={policePayoutForm.recipient}
                    onChange={e => setPolicePayoutForm(f => ({ ...f, recipient: e.target.value }))}
                    className="w-full mt-1 border border-gray-300 rounded-lg p-2.5 text-xs bg-white text-gray-800"
                    required
                  />
                </div>

                <div>
                  <label className="text-xs font-medium text-gray-700">Disbursement Date <span className="text-red-500">*</span></label>
                  <input
                    type="date"
                    value={policePayoutForm.date}
                    onChange={e => setPolicePayoutForm(f => ({ ...f, date: e.target.value }))}
                    className="w-full mt-1 border border-gray-300 rounded-lg p-2.5 text-xs bg-white text-gray-800"
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-medium text-gray-700">Source Account</label>
                  <select
                    value={policePayoutForm.source_account}
                    onChange={e => setPolicePayoutForm(f => ({ ...f, source_account: e.target.value }))}
                    className="w-full mt-1 border border-gray-300 rounded-lg p-2.5 text-xs bg-white text-gray-800"
                  >
                    {accounts.map(acc => <option key={acc} value={acc}>{acc}</option>)}
                  </select>
                </div>

                <div>
                  <label className="text-xs font-medium text-gray-700">Reference Note / Officer Details</label>
                  <input
                    type="text"
                    placeholder="e.g. Morning stage clearance slip"
                    value={policePayoutForm.notes}
                    onChange={e => setPolicePayoutForm(f => ({ ...f, notes: e.target.value }))}
                    className="w-full mt-1 border border-gray-300 rounded-lg p-2.5 text-xs bg-white text-gray-800"
                  />
                </div>
              </div>

              <div className="flex gap-2 pt-1">
                <button
                  type="submit"
                  className="bg-blue-800 hover:bg-blue-900 text-white font-bold text-xs px-5 py-2.5 rounded-lg shadow"
                >
                  ✓ Deduct & Save Police Payment
                </button>
                <button
                  type="button"
                  onClick={() => setShowPolicePayoutForm(false)}
                  className="bg-gray-200 hover:bg-gray-300 text-gray-700 font-bold text-xs px-4 py-2.5 rounded-lg"
                >
                  Cancel
                </button>
              </div>
            </form>
          )}

          {/* ── POLICE DISBURSEMENT & EXPENSE RECORDS LEDGER ── */}
          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <h4 className="text-xs font-bold text-gray-800 uppercase tracking-wide">📋 Stage Expense & Police Ledger</h4>
              <div className="flex items-center gap-2">
                <label className="text-[11px] text-gray-500">Filter Date:</label>
                <input
                  type="date"
                  value={expenseFilterDate}
                  onChange={e => setExpenseFilterDate(e.target.value)}
                  className="border border-gray-300 p-1.5 rounded-lg text-xs bg-white text-gray-800"
                />
                {expenseFilterDate && (
                  <button onClick={() => setExpenseFilterDate("")} className="text-xs text-blue-600 underline">Clear</button>
                )}
              </div>
            </div>

            <div className="border border-gray-200 rounded-xl overflow-hidden bg-white shadow-sm">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-gray-100 text-gray-700 border-b border-gray-200">
                    <th className="p-2.5">Date</th>
                    <th className="p-2.5">Type / Description</th>
                    <th className="p-2.5">Recipient / Source</th>
                    <th className="p-2.5">Amount</th>
                    <th className="p-2.5">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {expenseList.length === 0 ? (
                    <tr><td colSpan="5" className="p-4 text-center text-gray-400">No expense records found.</td></tr>
                  ) : (
                    expenseList.map((ex, i) => (
                      <tr key={i} className="border-b border-gray-100 hover:bg-gray-50">
                        <td className="p-2.5 text-gray-600">{ex.date}</td>
                        <td className="p-2.5">
                          <p className="font-bold text-gray-900">{ex.type || ex.expense_type || "Expense"}</p>
                          {ex.description && <p className="text-[11px] text-gray-500">{ex.description}</p>}
                        </td>
                        <td className="p-2.5 text-gray-600">{ex.source_account || ex.recipient || "N/A"}</td>
                        <td className="p-2.5 font-bold text-emerald-700">KES {ex.amount || ex.total_amount}</td>
                        <td className="p-2.5">
                          <span className={`px-2 py-0.5 rounded font-bold text-[10px] ${ex.is_submitted !== false ? 'bg-emerald-100 text-emerald-800' : 'bg-yellow-100 text-yellow-800'}`}>
                            {ex.is_submitted !== false ? 'Confirmed' : 'Draft'}
                          </span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: VEHICLE PERFORMANCE & ROUTE SUMMARIES */}
      {subTab === "delivery" && (
        <div className="space-y-6">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-gray-50 p-4 rounded-xl border border-gray-200">
            <div>
              <h3 className="text-sm font-bold text-gray-800">Vehicle Performance & Route Summaries</h3>
              <p className="text-xs text-gray-500">Lookup any vehicle plate to fetch complete backend trip logs and delivery performance.</p>
            </div>
            <div className="flex items-center gap-2">
              <label className="text-xs font-bold text-gray-600">Filter Date:</label>
              <input
                type="date"
                value={deliveryDateFilter}
                onChange={e => setDeliveryDateFilter(e.target.value)}
                className="border border-gray-300 p-2 rounded-lg text-xs bg-white text-gray-800"
              />
            </div>
          </div>

          <form onSubmit={handleSearchVehiclePerformance} className="flex gap-3 max-w-lg items-end">
            <div className="flex-1">
              <label className="text-xs font-medium text-gray-600">Search Vehicle Plate Performance</label>
              <input
                type="text"
                placeholder="e.g. KBC 123A"
                value={searchPlate}
                onChange={e => setSearchPlate(e.target.value)}
                list="lookup-plates"
                className="w-full mt-1 border border-gray-300 rounded-lg p-2 text-xs uppercase bg-white text-gray-800"
                required
              />
              <datalist id="lookup-plates">
                {vehicles.map(v => <option key={v.id} value={v.plate} />)}
              </datalist>
            </div>
            <button type="submit" className="bg-gray-800 hover:bg-gray-900 text-white font-bold text-xs px-5 py-2 rounded-lg h-[34px]">
              {loadingPerformance ? "Fetching..." : "Fetch Performance"}
            </button>
          </form>

          {vehiclePerformance && (
            <div className="border border-blue-200 bg-blue-50 p-5 rounded-2xl space-y-3 text-xs">
              <div className="flex justify-between items-center border-b border-blue-200 pb-2">
                <p className="font-black text-blue-900 text-sm">🚐 Vehicle Performance: {vehiclePerformance.plate}</p>
                <span className="bg-blue-600 text-white px-2.5 py-1 rounded-md text-[10px] font-bold">Filtered Date: {vehiclePerformance.date_filtered}</span>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-white p-3 rounded-xl border border-blue-100 shadow-sm">
                  <p className="text-gray-500">Total Trips Made</p>
                  <p className="text-xl font-black text-blue-700">{vehiclePerformance.total_trips || 0}</p>
                </div>
                <div className="bg-white p-3 rounded-xl border border-blue-100 shadow-sm">
                  <p className="text-gray-500">Total Revenue Collected</p>
                  <p className="text-xl font-black text-emerald-700">KES {vehiclePerformance.total_collected || 0}</p>
                </div>
              </div>

              <div className="pt-2">
                <p className="font-bold text-gray-700 mb-1.5 uppercase tracking-wide text-[11px]">Trip History Log:</p>
                {vehiclePerformance.trips && vehiclePerformance.trips.length > 0 ? (
                  <div className="space-y-1.5 max-h-48 overflow-y-auto">
                    {vehiclePerformance.trips.map((t, idx) => (
                      <div key={idx} className="bg-white p-2.5 rounded-lg border border-gray-200 flex justify-between items-center text-xs">
                        <div>
                          <span className="font-bold text-blue-700">{t.ticket_number}</span> — <span className="text-gray-700">{t.route}</span>
                        </div>
                        <div className="text-right">
                          <span className="font-bold text-emerald-700">KES {t.shimo_fee}</span>
                          <p className="text-[10px] text-gray-400">{t.date_issued} {t.time_issued}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-gray-500 italic">No trip records found for this vehicle on the specified date.</p>
                )}
              </div>
            </div>
          )}

          {dailyDeliverySummary ? (
            <div className="space-y-6 pt-4 border-t border-gray-200">
              <h4 className="text-xs font-bold text-gray-800 uppercase tracking-wide">Stage-Wide Daily Collections ({deliveryDateFilter})</h4>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-blue-50 border border-blue-200 p-4 rounded-xl text-center">
                  <p className="text-2xl font-black text-blue-700">{dailyDeliverySummary.total_vehicles || 0}</p>
                  <p className="text-xs text-blue-600 mt-1">Active Vehicles On Date</p>
                </div>
                <div className="bg-purple-50 border border-purple-200 p-4 rounded-xl text-center">
                  <p className="text-2xl font-black text-purple-700">{dailyDeliverySummary.total_trips || 0}</p>
                  <p className="text-xs text-purple-600 mt-1">Total Trips Recorded</p>
                </div>
                <div className="bg-emerald-50 border border-emerald-200 p-4 rounded-xl text-center">
                  <p className="text-2xl font-black text-emerald-700">KES {dailyDeliverySummary.total_amount?.toLocaleString() || 0}</p>
                  <p className="text-xs text-emerald-600 mt-1">Total Delivery Revenue</p>
                </div>
              </div>

              <div>
                <h4 className="text-xs font-bold text-gray-800 uppercase tracking-wide mb-3">📍 Collections Grouped By Route</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {dailyDeliverySummary.by_route && Object.entries(dailyDeliverySummary.by_route).length > 0 ? (
                    Object.entries(dailyDeliverySummary.by_route).map(([routeName, data]) => (
                      <div key={routeName} className="border border-gray-200 rounded-xl p-4 bg-gray-50 flex justify-between items-center text-xs">
                        <span className="font-bold text-xs text-gray-900">{routeName}</span>
                        <span className="font-bold text-emerald-700">KES {data.total?.toLocaleString()} ({data.count} tickets)</span>
                      </div>
                    ))
                  ) : (
                    <p className="text-xs text-gray-500">No route collections found for this date.</p>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <div className="bg-gray-50 border border-gray-200 p-8 rounded-xl text-center text-gray-500 text-xs">
              Loading daily delivery summary...
            </div>
          )}
        </div>
      )}

      {/* TAB 3: PENALTIES */}
      {subTab === "penalties" && (
        <form onSubmit={handlePenaltySubmit} className="space-y-4 max-w-xl">
          <h3 className="text-sm font-bold text-gray-800">Log Driver / Conductor Penalty</h3>
          
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-medium text-gray-600">Select Driver / Conductor</label>
              <select
                value={penaltyForm.member_id}
                onChange={handleMemberSelect}
                className="w-full mt-1 border border-gray-300 rounded-lg p-2.5 text-xs bg-white text-gray-800"
                required
              >
                <option value="">-- Choose Driver / Conductor --</option>
                {driversAndConductors.map(m => (
                  <option key={m.id} value={m.id}>
                    {m.name || `${m.first_name || ""} ${m.last_name || ""}`} ({m.role?.toUpperCase() || "CREW"} - {m.membership_no || "No ID"})
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="text-xs font-medium text-gray-600">Mistake / Offense Description</label>
            <input
              type="text"
              placeholder="e.g., Late reporting, bad conduct"
              value={penaltyForm.mistake}
              onChange={e => setPenaltyForm(f => ({ ...f, mistake: e.target.value }))}
              className="w-full mt-1 border border-gray-300 rounded-lg p-2.5 text-xs bg-white text-gray-800"
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-medium text-gray-600">Penalty Action</label>
              <select
                value={penaltyForm.action_type}
                onChange={e => setPenaltyForm(f => ({ ...f, action_type: e.target.value }))}
                className="w-full mt-1 border border-gray-300 rounded-lg p-2.5 text-xs bg-white text-gray-800"
              >
                <option value="Cash">Paid by Cash</option>
                <option value="Suspend">Suspend (Days)</option>
              </select>
            </div>

            {penaltyForm.action_type === "Cash" ? (
              <div>
                <label className="text-xs font-medium text-gray-600">Amount Paid (KES)</label>
                <input
                  type="number"
                  value={penaltyForm.amount_paid}
                  onChange={e => setPenaltyForm(f => ({ ...f, amount_paid: e.target.value }))}
                  className="w-full mt-1 border border-gray-300 rounded-lg p-2.5 text-xs bg-white text-gray-800"
                />
              </div>
            ) : (
              <div>
                <label className="text-xs font-medium text-gray-600">Suspension Days</label>
                <input
                  type="number"
                  value={penaltyForm.suspension_days}
                  onChange={e => setPenaltyForm(f => ({ ...f, suspension_days: e.target.value }))}
                  className="w-full mt-1 border border-gray-300 rounded-lg p-2.5 text-xs bg-white text-gray-800"
                />
              </div>
            )}
          </div>

          <div className="bg-amber-50 border border-amber-200 p-3 rounded-lg text-[11px] text-amber-800">
            ⚠️ <b>Note:</b> Suspension applies to the individual member. <b>It does not affect the Sacco account or the Matatu vehicle operation.</b>
          </div>

          <button type="submit" className="bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs px-5 py-2.5 rounded-lg">
            Record Penalty & Action
          </button>
        </form>
      )}

      {/* TAB 4: ATTENDANCE & HR */}
      {subTab === "attendance" && (
        <div className="space-y-4 max-w-2xl">
          <div className="flex justify-between items-center">
            <h3 className="text-sm font-bold text-gray-800">Daily Staff & Crew Attendance Sheet</h3>
            <button onClick={submitAttendanceToHR} className="bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs px-4 py-2 rounded-lg">
              Submit Attendance to Admin & HR
            </button>
          </div>
          <p className="text-xs text-gray-500">Showing eligible stage members (Owners, HR, Directors & Admins are excluded).</p>

          <div className="border border-gray-200 rounded-xl overflow-hidden">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-gray-100 text-gray-700 border-b border-gray-200">
                  <th className="p-3">Member Name</th>
                  <th className="p-3">Membership No</th>
                  <th className="p-3">Role</th>
                  <th className="p-3">Status</th>
                </tr>
              </thead>
              <tbody>
                {attendanceList.length === 0 ? (
                  <tr><td colSpan="4" className="p-4 text-center text-gray-400">No eligible members found.</td></tr>
                ) : (
                  attendanceList.map((m, idx) => (
                    <tr key={m.id || idx} className="border-b border-gray-100 hover:bg-gray-50">
                      <td className="p-3 font-medium text-gray-900">{m.name || `${m.first_name || ""} ${m.last_name || ""}`}</td>
                      <td className="p-3 text-gray-600">{m.membership_no || "N/A"}</td>
                      <td className="p-3 uppercase text-gray-500 font-semibold">{m.role || "Member"}</td>
                      <td className="p-3">
                        <select
                          value={m.status}
                          onChange={e => handleAttendanceChange(idx, e.target.value)}
                          className={`p-1.5 rounded text-xs font-bold ${m.status === "Present" ? "bg-emerald-100 text-emerald-800" : "bg-red-100 text-red-800"}`}
                        >
                          <option value="Present">Present</option>
                          <option value="Absent">Absent</option>
                        </select>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 5: WELFARE & CASUAL PAYMENTS WALLET LEDGER */}
      {subTab === "welfare" && (
        <div className="space-y-6 max-w-3xl">
          <div className="bg-purple-50 border border-purple-200 p-4 rounded-xl flex justify-between items-center">
            <div>
              <h3 className="text-sm font-bold text-purple-900">🔒 Isolated Welfare & Casual Payments Wallet</h3>
              <p className="text-xs text-purple-700 mt-1">
                Inflows add money (`+=`). Outflows subtract money (`-=`). Completely isolated from general audits.
              </p>
            </div>
            <div className="bg-white px-4 py-2 rounded-xl shadow border border-purple-200 text-right">
              <p className="text-[10px] text-purple-500 font-bold uppercase tracking-wider">Current Pool Balance</p>
              <p className="text-lg font-black text-purple-700">KES {welfareBalance.toLocaleString()}</p>
            </div>
          </div>

          <form onSubmit={handleWelfareTxnSubmit} className="space-y-4 border border-gray-200 p-4 rounded-xl bg-gray-50">
            <h4 className="text-xs font-bold text-gray-800 uppercase tracking-wide">Record Wallet Transaction (Inflow / Payout)</h4>
            
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-medium text-gray-600">Transaction Type</label>
                <select
                  value={welfareTxnForm.type}
                  onChange={e => setWelfareTxnForm(f => ({ ...f, type: e.target.value }))}
                  className="w-full mt-1 border border-gray-300 rounded-lg p-2.5 text-xs bg-white text-gray-800"
                >
                  <option value="Payout">Payout / Expense (- Deduct)</option>
                  <option value="Inflow">Inflow / Deposit (+ Add)</option>
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600">Amount (KES)</label>
                <input
                  type="number"
                  placeholder="e.g., 500"
                  value={welfareTxnForm.amount}
                  onChange={e => setWelfareTxnForm(f => ({ ...f, amount: e.target.value }))}
                  className="w-full mt-1 border border-gray-300 rounded-lg p-2.5 text-xs bg-white text-gray-800"
                  required
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-medium text-gray-600">Recipient or Source Name</label>
                <input
                  type="text"
                  placeholder="e.g., Cleaner / Stage Contribution"
                  value={welfareTxnForm.recipient_or_source}
                  onChange={e => setWelfareTxnForm(f => ({ ...f, recipient_or_source: e.target.value }))}
                  className="w-full mt-1 border border-gray-300 rounded-lg p-2.5 text-xs bg-white text-gray-800"
                  required
                />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600">Date</label>
                <input
                  type="date"
                  value={welfareTxnForm.date}
                  onChange={e => setWelfareTxnForm(f => ({ ...f, date: e.target.value }))}
                  className="w-full mt-1 border border-gray-300 rounded-lg p-2.5 text-xs bg-white text-gray-800"
                />
              </div>
            </div>

            <div>
              <label className="text-xs font-medium text-gray-600">Reason / Details</label>
              <input
                type="text"
                placeholder="e.g., Casual payment for sweeping stage"
                value={welfareTxnForm.reason}
                onChange={e => setWelfareTxnForm(f => ({ ...f, reason: e.target.value }))}
                className="w-full mt-1 border border-gray-300 rounded-lg p-2.5 text-xs bg-white text-gray-800"
              />
            </div>

            <button type="submit" className="bg-purple-600 hover:bg-purple-700 text-white font-bold text-xs px-4 py-2.5 rounded-lg shadow">
              Process Wallet Transaction
            </button>
          </form>

          <div>
            <h4 className="text-xs font-bold text-gray-700 mb-2 uppercase tracking-wide">Isolated Wallet Audit Trail</h4>
            <div className="border border-gray-200 rounded-xl overflow-hidden bg-white">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-gray-100 text-gray-700 border-b border-gray-200">
                    <th className="p-2.5">Date</th>
                    <th className="p-2.5">Type</th>
                    <th className="p-2.5">Recipient / Source</th>
                    <th className="p-2.5">Reason</th>
                    <th className="p-2.5">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {welfareTransactions.length === 0 ? (
                    <tr><td colSpan="5" className="p-4 text-center text-gray-400">No transactions recorded in the welfare wallet.</td></tr>
                  ) : (
                    welfareTransactions.map((w, i) => (
                      <tr key={i} className="border-b border-gray-100">
                        <td className="p-2.5 text-gray-600">{w.date}</td>
                        <td className="p-2.5">
                          <span className={`px-2 py-0.5 rounded font-bold text-[10px] ${w.type === 'Inflow' ? 'bg-emerald-100 text-emerald-800' : 'bg-red-100 text-red-800'}`}>
                            {w.type}
                          </span>
                        </td>
                        <td className="p-2.5 font-medium text-gray-900">{w.recipient_or_source}</td>
                        <td className="p-2.5 text-gray-600">{w.reason}</td>
                        <td className={`p-2.5 font-bold ${w.type === 'Inflow' ? 'text-emerald-700' : 'text-red-700'}`}>
                          {w.type === 'Inflow' ? '+' : '-'}KES {w.amount}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>c
        </div>
      )}
    </div>
  );
}