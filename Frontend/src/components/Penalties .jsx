import { useEffect, useState } from "react";
import API from "../api";
import LoanSecurity from "./LoanSecurity";

const tok = () => localStorage.getItem("token");
const hdr = (json = true) => ({
  Authorization: `Bearer ${tok()}`,
  ...(json ? { "Content-Type": "application/json" } : {}),
});

function Toast({ msg, type, onClose }) {
  useEffect(() => { const t = setTimeout(onClose, 3000); return () => clearTimeout(t); }, [onClose]);
  return (
    <div className={`fixed top-5 right-5 z-[300] px-5 py-3 rounded-xl shadow-2xl text-sm font-bold
      ${type === "error" ? "bg-red-500 text-white" : "bg-emerald-500 text-white"}`}>
      {msg}
    </div>
  );
}

export default function Penalties({ loanId, loanTypeId, userRole = "member", onClose }) {
  const [loanTypes, setLoanTypes]   = useState([]);
  const [penalties, setPenalties]   = useState([]);
  const [selected, setSelected]     = useState(null);
  const [loan, setLoan]             = useState(null);
  const [toast, setToast]           = useState(null);
  const [activeSubTab, setActiveSubTab] = useState(loanId ? "security" : "policy");
  const showToast = (msg, type = "success") => setToast({ msg, type });

  // edit form for penalty policy
  const [policyForm, setPolicyForm] = useState({
    penalty_rate: "", grace_period_days: "", penalty_description: ""
  });
  const [saving, setSaving] = useState(false);

  // Legacy manual penalty clearance form (if historical cash balance exists)
  const [payAmount, setPayAmount] = useState("");
  const [payMethod, setPayMethod] = useState("mpesa");
  const [mpesaCode, setMpesaCode] = useState("");
  const [payNotes, setPayNotes]   = useState("");
  const [submittingPay, setSubmittingPay] = useState(false);
  const [approving, setApproving] = useState(false);

  const canEdit = ["admin", "director", "hr"].includes(userRole);

  useEffect(() => { fetchLoanTypes(); }, []);
  useEffect(() => { 
    if (loanId) {
      fetchPenaltyHistory(); 
      fetchLoanDetails();
      setActiveSubTab("security");
    } 
  }, [loanId]);

  useEffect(() => {
    if (loanTypeId) {
      const found = loanTypes.find(l => l.id === loanTypeId);
      if (found) selectType(found);
    }
  }, [loanTypeId, loanTypes]);

  const fetchLoanTypes = async () => {
    const res = await fetch(`${API}/loan-types`);
    if (res.ok) setLoanTypes(await res.json());
  };

  const fetchLoanDetails = async () => {
    if (!loanId) return;
    const url = userRole === "member" ? "/loan-applications/my" : "/loan-applications/all";
    const res = await fetch(`${API}${url}`, { headers: hdr() });
    if (res.ok) {
      const list = await res.json();
      const found = list.find(l => l.id === loanId);
      if (found) {
        setLoan(found);
        setPayAmount(found.penalty || "");
      }
    }
  };

  const fetchPenaltyHistory = async () => {
    const res = await fetch(`${API}/loan-applications/${loanId}/audit`, { headers: hdr() });
    if (res.ok) {
      const logs = await res.json();
      setPenalties(logs.filter(l => 
        l.action === "PENALTY_ADDED" || 
        l.action === "AUTO_DEDUCTION_FAILED" || 
        l.action === "PENALTY_SUBMISSION" ||
        l.action.includes("SECURITY")
      ));
    }
  };

  const selectType = (lt) => {
    setSelected(lt);
    setPolicyForm({
      penalty_rate: lt.penalty_rate ?? 5,
      grace_period_days: lt.grace_period_days ?? 3,
      penalty_description: lt.penalty_description ?? ""
    });
  };

  const savePenaltyPolicy = async () => {
    if (!selected) return;
    setSaving(true);
    const res = await fetch(`${API}/loan-types/${selected.id}/penalty-policy`, {
      method: "PUT", headers: hdr(),
      body: JSON.stringify({
        penalty_rate: parseFloat(policyForm.penalty_rate),
        grace_period_days: parseInt(policyForm.grace_period_days),
        penalty_description: policyForm.penalty_description
      })
    });
    setSaving(false);
    if (!res.ok) return showToast("Failed to save policy", "error");
    showToast("Penalty policy saved ✓");
    fetchLoanTypes();
  };

  // Request vehicle logbook security instead of monetary penalties
  const requestLogbookSecurity = async () => {
    if (!loanId) return;
    const reason = prompt("Enter reason for requesting logbook security (e.g., Defaulted installment, term extension):", "Missed installment");
    if (reason === null) return;

    const res = await fetch(`${API}/loan-applications/${loanId}/penalty`, {
      method: "PUT", headers: hdr(),
      body: JSON.stringify({ reason })
    });
    if (res.ok) {
      showToast("Logbook security requested from borrower ✓");
      fetchLoanDetails();
      fetchPenaltyHistory();
    } else {
      showToast("Failed to request logbook security", "error");
    }
  };

  // Legacy penalty clearance functions
  const submitPenaltyClearance = async () => {
    if (!payAmount || isNaN(payAmount) || parseFloat(payAmount) <= 0) {
      return showToast("Please enter a valid payment amount", "error");
    }
    setSubmittingPay(true);
    const res = await fetch(`${API}/loan-applications/${loanId}/pay-penalty`, {
      method: "POST",
      headers: hdr(),
      body: JSON.stringify({
        amount: parseFloat(payAmount),
        payment_method: payMethod,
        mpesa_code: mpesaCode,
        notes: payNotes
      })
    });
    setSubmittingPay(false);
    if (res.ok) {
      showToast("Penalty payment submitted for Admin approval! ✓");
      setMpesaCode("");
      setPayNotes("");
      fetchLoanDetails();
      fetchPenaltyHistory();
    } else {
      const d = await res.json();
      showToast(d.error || "Failed to submit penalty payment", "error");
    }
  };

  const handleApprovePenalty = async () => {
    setApproving(true);
    const res = await fetch(`${API}/loan-applications/${loanId}/approve-penalty`, {
      method: "PUT",
      headers: hdr()
    });
    setApproving(false);
    if (res.ok) {
      showToast("Penalty payment approved! Account unblocked. ✓");
      fetchLoanDetails();
      fetchPenaltyHistory();
    } else {
      showToast("Failed to approve penalty", "error");
    }
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-6 max-w-4xl shadow-sm">
      {toast && <Toast {...toast} onClose={() => setToast(null)} />}

      <div className="flex justify-between items-center mb-6 border-b pb-4">
        <div>
          <h2 className="text-xl font-black text-slate-800">📘 Loan Security & Default Management</h2>
          <p className="text-slate-400 text-sm mt-0.5">Manage additional vehicle logbook collateral and review default remediation.</p>
        </div>
        {onClose && <button onClick={onClose} className="text-slate-400 hover:text-slate-700 text-xl font-bold">✕</button>}
      </div>

      {/* Sub-tab Selectors */}
      {loanId && (
        <div className="flex gap-2 mb-6">
          <button onClick={() => setActiveSubTab("security")}
            className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${activeSubTab === "security" ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}>
            📘 Loan #{loanId} Security & Logbook
          </button>
          <button onClick={() => setActiveSubTab("policy")}
            className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${activeSubTab === "policy" ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}>
            📋 Policy Rules
          </button>
        </div>
      )}

      {/* SUB TAB 1: LOGBOOK SECURITY WORKFLOW */}
      {activeSubTab === "security" && loanId && (
        <div className="space-y-6">
          {loan ? (
            <div className="space-y-5">
              
              {/* Mounted LoanSecurity Component for Member/HR/Admin */}
              <LoanSecurity 
                loan={loan} 
                userRole={userRole} 
                onDone={() => {
                  fetchLoanDetails();
                  fetchPenaltyHistory();
                }} 
                notify={showToast} 
              />

              {/* Administrative Control to Request Logbook */}
              {canEdit && (
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 flex justify-between items-center">
                  <div>
                    <h4 className="font-bold text-slate-800 text-sm">Need Additional Collateral?</h4>
                    <p className="text-slate-500 text-xs mt-0.5">Prompt the member to upload their vehicle logbook as secondary security.</p>
                  </div>
                  <button 
                    onClick={requestLogbookSecurity} 
                    className="bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold px-4 py-2 rounded-lg shadow-sm"
                  >
                    📘 Request Logbook Security
                  </button>
                </div>
              )}

              {/* Legacy Penalty Support (Only if historical cash penalty exists) */}
              {loan.penalty > 0 && (
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 space-y-3">
                  <div className="flex justify-between items-center">
                    <div>
                      <p className="font-black text-amber-900 text-sm">Historical Monetary Penalty: KES {loan.penalty.toLocaleString()}</p>
                      <p className="text-amber-800 text-xs font-semibold">This is an existing balance accrued prior to the logbook security system.</p>
                    </div>
                  </div>

                  {userRole === "member" && loan.penalty_status !== "pending_approval" && (
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-2 pt-2">
                      <input 
                        type="number" 
                        value={payAmount} 
                        onChange={e => setPayAmount(e.target.value)}
                        placeholder="Amount to clear"
                        className="border rounded-lg p-2 text-xs bg-white text-slate-800 font-bold"
                      />
                      <input 
                        type="text" 
                        value={mpesaCode} 
                        onChange={e => setMpesaCode(e.target.value)}
                        placeholder="M-Pesa code"
                        className="border rounded-lg p-2 text-xs bg-white text-slate-800 font-bold uppercase"
                      />
                      <button 
                        onClick={submitPenaltyClearance} 
                        disabled={submittingPay}
                        className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs py-2 rounded-lg"
                      >
                        {submittingPay ? "Submitting..." : "Clear Penalty"}
                      </button>
                    </div>
                  )}

                  {canEdit && loan.penalty_status === "pending_approval" && (
                    <div className="flex gap-2 pt-2">
                      <button 
                        onClick={handleApprovePenalty} 
                        disabled={approving}
                        className="bg-emerald-600 text-white font-bold text-xs px-3 py-1.5 rounded-lg"
                      >
                        Confirm Payment (KES {loan.penalty_paid})
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* Activity Log */}
              <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
                <div className="px-5 py-3 bg-slate-50 border-b border-slate-200">
                  <h4 className="font-black text-slate-700 text-sm">Security & Default Audit Log — Loan #{loanId}</h4>
                </div>
                {penalties.length === 0 ? (
                  <p className="p-5 text-slate-400 text-sm text-center font-bold">No historical security or default entries on file.</p>
                ) : (
                  <div className="divide-y divide-slate-100">
                    {penalties.map((p, i) => (
                      <div key={i} className="flex justify-between items-center p-4 hover:bg-slate-50 transition-colors">
                        <div>
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                            p.action.includes("SECURITY") ? "bg-purple-100 text-purple-700" :
                            p.action === "AUTO_DEDUCTION_FAILED" ? "bg-orange-100 text-orange-700" : 
                            "bg-slate-100 text-slate-700"
                          }`}>
                            {p.action.replace(/_/g, " ")}
                          </span>
                          <p className="text-slate-600 text-xs mt-1.5 font-semibold">{p.notes}</p>
                        </div>
                        <span className="text-xs text-slate-400 font-bold">{new Date(p.created_at).toLocaleDateString()}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ) : (
            <p className="text-center text-slate-400 py-6">Loading loan parameters...</p>
          )}
        </div>
      )}

      {/* SUB TAB 2: POLICY RULES */}
      {activeSubTab === "policy" && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div>
            <h3 className="font-black text-slate-700 text-sm mb-3 uppercase tracking-widest">Loan Types</h3>
            <div className="space-y-2">
              {loanTypes.map(lt => (
                <button key={lt.id} onClick={() => selectType(lt)}
                  className={`w-full text-left p-3 rounded-xl border text-sm transition-all ${
                    selected?.id === lt.id ? "bg-blue-50 border-blue-400 font-bold text-blue-800" : "bg-slate-50 border-slate-200 text-slate-700 hover:border-blue-300"
                  }`}>
                  <p className="font-bold">{lt.name}</p>
                  <p className="text-xs text-slate-400 mt-0.5">Grace Window: {lt.grace_period_days ?? 3} days</p>
                </button>
              ))}
            </div>
          </div>

          <div className="lg:col-span-2 space-y-4">
            {selected ? (
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-5">
                <h3 className="font-black text-slate-800 mb-4">
                  Default Remediation Protocol — {selected.name}
                  {!canEdit && <span className="ml-2 text-xs bg-slate-200 text-slate-500 px-2 py-0.5 rounded-full">Read-only</span>}
                </h3>
                <div className="mb-4">
                  <label className="text-xs text-slate-500 uppercase tracking-widest mb-1 block">Grace Period (Days)</label>
                  <input type="number" value={policyForm.grace_period_days} disabled={!canEdit}
                    onChange={e => setPolicyForm({ ...policyForm, grace_period_days: e.target.value })}
                    className="w-full border border-slate-300 rounded-lg p-2.5 text-sm outline-none focus:border-blue-500 disabled:bg-slate-100 disabled:text-slate-500" />
                  <p className="text-xs text-slate-400 mt-1">Number of grace days allowed after installment due date before defaulting</p>
                </div>
                <div className="mb-4">
                  <label className="text-xs text-slate-500 uppercase tracking-widest mb-1 block">Policy Description</label>
                  <textarea value={policyForm.penalty_description} disabled={!canEdit} rows={3}
                    onChange={e => setPolicyForm({ ...policyForm, penalty_description: e.target.value })}
                    placeholder="Describe default requirements and vehicle logbook security expectations..."
                    className="w-full border border-slate-300 rounded-lg p-2.5 text-sm outline-none focus:border-blue-500 resize-none disabled:bg-slate-100 disabled:text-slate-500" />
                </div>
                {canEdit && (
                  <button onClick={savePenaltyPolicy} disabled={saving}
                    className="bg-blue-600 text-white font-black px-5 py-2.5 rounded-lg text-sm hover:bg-blue-700 disabled:opacity-50">
                    {saving ? "Saving..." : "💾 Save Policy"}
                  </button>
                )}
              </div>
            ) : (
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-12 text-center text-slate-400">
                <p className="text-4xl mb-3">📘</p>
                <p>Select a loan type to view its default & security rules</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}