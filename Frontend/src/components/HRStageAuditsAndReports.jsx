import { useState, useEffect } from "react";
import API from "../api";

export default function HRStageAuditsAndReports({ user }) {
  const token = localStorage.getItem("token");
  const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };

  const [toast, setToast] = useState(null);
  const [activeTab, setActiveTab] = useState("attendance");
  const [absenteeReports, setAbsenteeReports] = useState([]);
  const [penaltyLogs, setPenaltyLogs] = useState([]);
  const [expenseLogs, setExpenseLogs] = useState([]);
  const [loading, setLoading] = useState(false);

  const showToast = (msg, type = "success") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  };

  // Derived arrays (placed AFTER state declarations to prevent ReferenceErrors)
  const activeSuspensions = penaltyLogs.filter(p => p.action_type === "Suspend" && !p.is_lifted);
  const liftedSuspensions = penaltyLogs.filter(p => p.action_type === "Suspend" && p.is_lifted);
  const cashPenalties = penaltyLogs.filter(p => p.action_type === "Cash");

  const fetchStageAudits = async () => {
    setLoading(true);
    try {
      // Fetch permanent audit logs filtered for stage reports and attendance flags
      const res = await fetch(`${API}/audit/permanent?category=hr`, { headers });
      if (res.ok) {
        const data = await res.json();
        setAbsenteeReports(Array.isArray(data) ? data.filter(l => l.action === "STAGE_ATTENDANCE_SUBMITTED") : []);
      }

      // Fetch penalties logged by stage operators
      const penRes = await fetch(`${API}/stage/penalties-all`, { headers });
      if (penRes.ok) {
        const penData = await penRes.json();
        setPenaltyLogs(Array.isArray(penData) ? penData : []);
      }

      // Fetch official stage expenses
      const expRes = await fetch(`${API}/stage/expenses`, { headers });
      if (expRes.ok) {
        const expData = await expRes.json();
        setExpenseLogs(Array.isArray(expData) ? expData : []);
      }
    } catch {
      showToast("Failed to load audit records", "error");
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchStageAudits();
  }, [activeTab]);

  const liftMemberSuspension = async (memberId) => {
    if (!window.confirm("Lift this worker's suspension and restore their login access?")) return;
    const res = await fetch(`${API}/hr/members/${memberId}/lift-suspension`, { method: "PUT", headers });
    if (res.ok) {
      showToast("Suspension lifted successfully ✓");
      fetchStageAudits();
    } else {
      showToast("Failed to lift suspension", "error");
    }
  };

  const deleteLiftedRecord = async (penaltyId) => {
    if (!window.confirm("Permanently delete this lifted suspension record?")) return;
    const res = await fetch(`${API}/stage/penalties/${penaltyId}`, { method: "DELETE", headers });
    if (res.ok) {
      showToast("Record deleted successfully ✓");
      fetchStageAudits();
    } else {
      const d = await res.json();
      showToast(d.error || "Failed to delete record", "error");
    }
  };

  return (
    <div className="bg-white rounded-2xl shadow-xl p-6 mt-6 border border-gray-200">
      {toast && (
        <div className={`fixed top-5 right-5 z-50 px-4 py-2 rounded-lg text-white font-bold text-sm shadow-lg ${toast.type === "error" ? "bg-red-500" : "bg-emerald-600"}`}>
          {toast.msg}
        </div>
      )}

      <div className="border-b border-gray-200 pb-4 mb-6 flex justify-between items-center">
        <div>
          <h2 className="text-xl font-black text-gray-900">📊 HR & Admin Stage Audit & Compliance Dashboard</h2>
          <p className="text-xs text-gray-500">Monitor crew absenteeism, stage expense audits, active countdowns, and disciplinary records.</p>
        </div>
        <button onClick={fetchStageAudits} className="bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs font-bold px-3 py-2 rounded-lg">
          🔄 Refresh Reports
        </button>
      </div>

      {/* TABS */}
      <div className="flex flex-wrap gap-2 mb-6 bg-gray-50 p-1.5 rounded-xl border border-gray-200">
        {[
          { key: "attendance", label: "📋 Absenteeism & Attendance Flags" },
          { key: "penalties", label: "⚠️ Driver / Conductor Penalties" },
          { key: "expenses", label: "💸 Stage Expense Audits" },  
          { key: "activeSuspensions", label: `🚨 Active Suspensions (${activeSuspensions.length})` },
          { key: "liftedSuspensions", label: `📁 Lifted Suspensions Archive (${liftedSuspensions.length})` },
          { key: "cashPenalties", label: `💵 Cash Penalties (${cashPenalties.length})` },
        ].map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${
              activeTab === tab.key ? "bg-blue-600 text-white shadow" : "text-gray-600 hover:bg-gray-200"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {loading ? (
        <p className="text-center text-gray-400 py-8 text-xs">Loading audit records...</p>
      ) : (
        <>
          {/* ACTIVE SUSPENSIONS TAB */}
          {activeTab === "activeSuspensions" && (
            <div className="space-y-4">
              <div className="border border-gray-200 rounded-xl overflow-hidden bg-white">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-gray-100 text-gray-700 border-b">
                      <th className="p-3">Worker Name</th>
                      <th className="p-3">Role</th>
                      <th className="p-3">Offense / Mistake</th>
                      <th className="p-3">Original Action Taken</th>
                      <th className="p-3">Remaining Countdown</th>
                      <th className="p-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {activeSuspensions.length === 0 ? (
                      <tr><td colSpan="6" className="p-6 text-center text-gray-400">No active suspensions. All crew members are cleared.</td></tr>
                    ) : (
                      activeSuspensions.map(p => (
                        <tr key={p.id} className="border-b hover:bg-gray-50">
                          <td className="p-3 font-bold text-gray-900">{p.member_name} ({p.membership_no})</td>
                          <td className="p-3 uppercase text-gray-600 font-semibold">{p.role}</td>
                          <td className="p-3 text-gray-800">{p.mistake}</td>
                          <td className="p-3 font-medium text-amber-700">{p.suspension_days} Day(s) Initial</td>
                          <td className="p-3 font-black text-red-600">
                            ⏱️ {p.remaining_days} Day(s) Left
                          </td>
                          <td className="p-3 text-right">
                            <button onClick={() => liftMemberSuspension(p.member_id)} className="bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-1.5 rounded-lg text-xs font-bold shadow">
                              Lift Suspension
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* LIFTED SUSPENSIONS ARCHIVE TAB */}
          {activeTab === "liftedSuspensions" && (
            <div className="space-y-4">
              <div className="border border-gray-200 rounded-xl overflow-hidden bg-white">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-gray-100 text-gray-700 border-b">
                      <th className="p-3">Worker Name</th>
                      <th className="p-3">Role</th>
                      <th className="p-3">Original Offense</th>
                      <th className="p-3">Status</th>
                      <th className="p-3 text-right">Permanently Delete</th>
                    </tr>
                  </thead>
                  <tbody>
                    {liftedSuspensions.length === 0 ? (
                      <tr><td colSpan="5" className="p-6 text-center text-gray-400">No lifted suspension records in archive.</td></tr>
                    ) : (
                      liftedSuspensions.map(p => (
                        <tr key={p.id} className="border-b hover:bg-gray-50">
                          <td className="p-3 font-bold text-gray-900">{p.member_name} ({p.membership_no})</td>
                          <td className="p-3 uppercase text-gray-600 font-semibold">{p.role}</td>
                          <td className="p-3 text-gray-800">{p.mistake}</td>
                          <td className="p-3 text-emerald-700 font-bold">✓ Lifted / Cleared</td>
                          <td className="p-3 text-right">
                            <button onClick={() => deleteLiftedRecord(p.id)} className="bg-red-600 hover:bg-red-700 text-white px-3 py-1 rounded text-xs font-bold shadow">
                              🗑️ Delete Record
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* CASH PENALTIES TAB */}
          {activeTab === "cashPenalties" && (
            <div className="space-y-4">
              <div className="border border-gray-200 rounded-xl overflow-hidden bg-white">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-gray-100 text-gray-700 border-b">
                      <th className="p-3">Date</th>
                      <th className="p-3">Worker Name</th>
                      <th className="p-3">Role</th>
                      <th className="p-3">Offense</th>
                      <th className="p-3">Amount Paid</th>
                    </tr>
                  </thead>
                  <tbody>
                    {cashPenalties.length === 0 ? (
                      <tr><td colSpan="5" className="p-6 text-center text-gray-400">No cash penalties recorded.</td></tr>
                    ) : (
                      cashPenalties.map(p => (
                        <tr key={p.id} className="border-b hover:bg-gray-50">
                          <td className="p-3 text-gray-600">{p.date}</td>
                          <td className="p-3 font-bold text-gray-900">{p.member_name} ({p.membership_no})</td>
                          <td className="p-3 uppercase text-gray-600 font-semibold">{p.role}</td>
                          <td className="p-3 text-gray-800">{p.mistake}</td>
                          <td className="p-3 font-bold text-emerald-700">KES {p.amount_paid}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        
          {/* ABSENTEEISM REPORTS TAB */}
          {activeTab === "attendance" && (
            <div className="space-y-4">
              <h3 className="text-sm font-bold text-gray-800">Flagged Staff & Crew Absences</h3>
              <div className="border border-gray-200 rounded-xl overflow-hidden bg-white">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-gray-100 text-gray-700 border-b">
                      <th className="p-3">Logged Timestamp</th>
                      <th className="p-3">Reported By</th>
                      <th className="p-3">Details & Absentee Summary</th>
                    </tr>
                  </thead>
                  <tbody>
                    {absenteeReports.length === 0 ? (
                      <tr><td colSpan="3" className="p-4 text-center text-gray-400">No absentee flags reported.</td></tr>
                    ) : (
                      absenteeReports.map((rep, idx) => (
                        <tr key={idx} className="border-b hover:bg-gray-50">
                          <td className="p-3 text-gray-600">{new Date(rep.created_at).toLocaleString()}</td>
                          <td className="p-3 font-semibold text-gray-900">{rep.performed_by_name} ({rep.performed_by_role})</td>
                          <td className="p-3 text-red-600 font-medium">{rep.details}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* PENALTIES TAB */}
          {activeTab === "penalties" && (
            <div className="space-y-4">
              <h3 className="text-sm font-bold text-gray-800">Crew Disciplinary Logs (Drivers & Conductors)</h3>
              <div className="border border-gray-200 rounded-xl overflow-hidden bg-white">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-gray-100 text-gray-700 border-b">
                      <th className="p-3">Date</th>
                      <th className="p-3">Member Name</th>
                      <th className="p-3">Role</th>
                      <th className="p-3">Offense / Mistake</th>
                      <th className="p-3">Action Details</th>
                      <th className="p-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {penaltyLogs.length === 0 ? (
                      <tr><td colSpan="6" className="p-4 text-center text-gray-400">No disciplinary records found.</td></tr>
                    ) : (
                      penaltyLogs.map((p, idx) => (
                        <tr key={idx} className="border-b hover:bg-gray-50">
                          <td className="p-3 text-gray-600">{p.date}</td>
                          <td className="p-3 font-bold text-gray-900">{p.member_name} ({p.membership_no})</td>
                          <td className="p-3 uppercase text-gray-600 font-semibold">{p.role}</td>
                          <td className="p-3 text-gray-800">{p.mistake}</td>
                          <td className="p-3 font-bold">
                            {p.action_type === "Cash" ? (
                              <span className="text-emerald-700">Paid Cash: KES {p.amount_paid}</span>
                            ) : (
                              <span className="text-amber-700">Suspended: {p.suspension_days} Day(s)</span>
                            )}
                          </td>
                          <td className="p-3 text-right">
                            {p.action_type === "Suspend" && !p.is_lifted ? (
                              <button onClick={() => liftMemberSuspension(p.member_id)} className="bg-emerald-600 hover:bg-emerald-700 text-white px-2 py-1 rounded text-[10px] font-bold shadow">
                                Lift Suspension
                              </button>
                            ) : (
                              <span className="text-gray-400 text-[10px] italic">{p.is_lifted ? "Lifted" : "N/A"}</span>
                            )}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* STAGE EXPENSES AUDIT TAB */}
          {activeTab === "expenses" && (
            <div className="space-y-4">
              <h3 className="text-sm font-bold text-gray-800">Official Stage Operational Expenses Audit</h3>
              <div className="border border-gray-200 rounded-xl overflow-hidden bg-white">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-gray-100 text-gray-700 border-b">
                      <th className="p-3">Date</th>
                      <th className="p-3">Plate</th>
                      <th className="p-3">Expense Type</th>
                      <th className="p-3">Source Account</th>
                      <th className="p-3">Amount</th>
                      <th className="p-3">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {expenseLogs.length === 0 ? (
                      <tr><td colSpan="6" className="p-4 text-center text-gray-400">No stage expenses recorded.</td></tr>
                    ) : (
                      expenseLogs.map((ex, idx) => (
                        <tr key={idx} className="border-b hover:bg-gray-50">
                          <td className="p-3 text-gray-600">{ex.date}</td>
                          <td className="p-3 font-bold text-gray-900">{ex.matatu_plate || "N/A"}</td>
                          <td className="p-3 text-blue-700 font-medium">{ex.type}</td>
                          <td className="p-3 text-gray-500">{ex.source_account}</td>
                          <td className="p-3 font-bold text-emerald-700">KES {ex.amount}</td>
                          <td className="p-3">
                            <span className={`px-2 py-0.5 rounded font-bold text-[10px] ${ex.is_submitted ? 'bg-emerald-100 text-emerald-800' : 'bg-yellow-100 text-yellow-800'}`}>
                              {ex.is_submitted ? 'Locked / Audited' : 'Draft'}
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
        </>
      )}
    </div>
  );
}