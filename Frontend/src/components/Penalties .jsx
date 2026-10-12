import { useEffect, useState } from "react";
import API from "../api";

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
  const [penalties, setPenalties]   = useState([]);   // loan-level penalty log
  const [selected, setSelected]     = useState(null); // selected loan type for editing
  const [loan, setLoan]             = useState(null); // current loan application status
  const [toast, setToast]           = useState(null);
  const [activeSubTab, setActiveSubTab] = useState("policy"); // policy or clearance
  const showToast = (msg, type = "success") => setToast({ msg, type });

  // edit form for penalty policy
  const [policyForm, setPolicyForm] = useState({
    penalty_rate: "", grace_period_days: "", penalty_description: ""
  });
  const [saving, setSaving] = useState(false);

  // add manual penalty
  const [penaltyForm, setPenaltyForm] = useState({ amount: "", reason: "" });
  const [addingPenalty, setAddingPenalty] = useState(false);

  // penalty pay clearance form (Member)
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
      setActiveSubTab("clearance"); // Auto-focus clearance if loading a specific loan
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
      setPenalties(logs.filter(l => l.action === "PENALTY_ADDED" || l.action === "AUTO_DEDUCTION_FAILED" || l.action === "PENALTY_SUBMISSION"));
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

  const addManualPenalty = async () => {
    if (!loanId || !penaltyForm.amount) return showToast("Amount required", "error");
    setAddingPenalty(true);
    const res = await fetch(`${API}/loan-applications/${loanId}/penalty`, {
      method: "PUT", headers: hdr(),
      body: JSON.stringify({ amount: parseFloat(penaltyForm.amount), reason: penaltyForm.reason })
    });
    setAddingPenalty(false);
    if (!res.ok) return showToast("Failed to add penalty", "error");
    showToast("Penalty applied ✓");
    setPenaltyForm({ amount: "", reason: "" });
    fetchLoanDetails();
    fetchPenaltyHistory();
  };

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

  const handleRejectPenalty = async () => {
    setApproving(true);
    const res = await fetch(`${API}/loan-applications/${loanId}/reject-penalty`, {
      method: "PUT",
      headers: hdr()
    });
    setApproving(false);
    if (res.ok) {
      showToast("Penalty payment request rejected");
      fetchLoanDetails();
      fetchPenaltyHistory();
    } else {
      showToast("Failed to reject penalty", "error");
    }
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-6 max-w-4xl shadow-sm">
      {toast && <Toast {...toast} onClose={() => setToast(null)} />}

      <div className="flex justify-between items-center mb-6 border-b pb-4">
        <div>
          <h2 className="text-xl font-black text-slate-800">⚠️ Penalty Management Portal</h2>
          <p className="text-slate-400 text-sm mt-0.5">Configure penalty rules, submit separate clearances, and authorize outstanding ledger default blocks.</p>
        </div>
        {onClose && <button onClick={onClose} className="text-slate-400 hover:text-slate-700 text-xl font-bold">✕</button>}
      </div>

      {/* Sub-tab Selectors */}
      {loanId && (
        <div className="flex gap-2 mb-6">
          <button onClick={() => setActiveSubTab("policy")}
            className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${activeSubTab === "policy" ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}>
            📋 Penalty Policy Rules
          </button>
          <button onClick={() => setActiveSubTab("clearance")}
            className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${activeSubTab === "clearance" ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}>
            💸 Loan #{loanId} Clearances
          </button>
        </div>
      )}

      {/* SUB TAB 1: POLICY RULES */}
      {activeSubTab === "policy" && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Loan Type List */}
          <div>
            <h3 className="font-black text-slate-700 text-sm mb-3 uppercase tracking-widest">Loan Types</h3>
            <div className="space-y-2">
              {loanTypes.map(lt => (
                <button key={lt.id} onClick={() => selectType(lt)}
                  className={`w-full text-left p-3 rounded-xl border text-sm transition-all ${
                    selected?.id === lt.id ? "bg-blue-50 border-blue-400 font-bold text-blue-800" : "bg-slate-50 border-slate-200 text-slate-700 hover:border-blue-300"
                  }`}>
                  <p className="font-bold">{lt.name}</p>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Penalty: {lt.penalty_rate ?? 5}% · Grace: {lt.grace_period_days ?? 3}d
                  </p>
                </button>
              ))}
            </div>
          </div>

          {/* Policy Editor */}
          <div className="lg:col-span-2 space-y-4">
            {selected ? (
              <>
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-5">
                  <h3 className="font-black text-slate-800 mb-4">
                    Penalty Policy — {selected.name}
                    {!canEdit && <span className="ml-2 text-xs bg-slate-200 text-slate-500 px-2 py-0.5 rounded-full">Read-only</span>}
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                    <div>
                      <label className="text-xs text-slate-500 uppercase tracking-widest mb-1 block">Penalty Rate (% per missed installment)</label>
                      <input type="number" step="0.5" value={policyForm.penalty_rate} disabled={!canEdit}
                        onChange={e => setPolicyForm({ ...policyForm, penalty_rate: e.target.value })}
                        className="w-full border border-slate-300 rounded-lg p-2.5 text-sm outline-none focus:border-blue-500 disabled:bg-slate-100 disabled:text-slate-500" />
                      <p className="text-xs text-slate-400 mt-1">Applied on top of the missed amount</p>
                    </div>
                    <div>
                      <label className="text-xs text-slate-500 uppercase tracking-widest mb-1 block">Grace Period (days after due date)</label>
                      <input type="number" value={policyForm.grace_period_days} disabled={!canEdit}
                        onChange={e => setPolicyForm({ ...policyForm, grace_period_days: e.target.value })}
                        className="w-full border border-slate-300 rounded-lg p-2.5 text-sm outline-none focus:border-blue-500 disabled:bg-slate-100 disabled:text-slate-500" />
                      <p className="text-xs text-slate-400 mt-1">Penalty only applied after this window</p>
                    </div>
                  </div>
                  <div className="mb-4">
                    <label className="text-xs text-slate-500 uppercase tracking-widest mb-1 block">Penalty Description (shown to borrower)</label>
                    <textarea value={policyForm.penalty_description} disabled={!canEdit} rows={3}
                      onChange={e => setPolicyForm({ ...policyForm, penalty_description: e.target.value })}
                      placeholder="e.g. A 5% penalty is charged on any missed installment after a 3-day grace period..."
                      className="w-full border border-slate-300 rounded-lg p-2.5 text-sm outline-none focus:border-blue-500 resize-none disabled:bg-slate-100 disabled:text-slate-500" />
                  </div>
                  {canEdit && (
                    <button onClick={savePenaltyPolicy} disabled={saving}
                      className="bg-blue-600 text-white font-black px-5 py-2.5 rounded-lg text-sm hover:bg-blue-700 disabled:opacity-50">
                      {saving ? "Saving..." : "💾 Save Penalty Policy"}
                    </button>
                  )}
                </div>

                <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm">
                  <p className="font-black text-amber-800 mb-2">⚠️ Missed Installment Protocol</p>
                  <ol className="list-decimal list-inside space-y-1 text-amber-700">
                    <li>A <strong>{policyForm.grace_period_days}-day</strong> grace period begins after the due date</li>
                    <li>If still unpaid, a <strong>{policyForm.penalty_rate}%</strong> penalty is added to the missed amount</li>
                    <li>Loan status changes to <strong>defaulted</strong> and an SMS notification is sent</li>
                    <li>All guarantors are also notified of the default</li>
                  </ol>
                </div>
              </>
            ) : (
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-12 text-center text-slate-400">
                <p className="text-4xl mb-3">⚠️</p>
                <p>Select a loan type on the left to view or edit its penalty policy rules</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* SUB TAB 2: SPECIFIC LOAN PENALTIES & CLEARANCE HISTORY */}
      {activeSubTab === "clearance" && loanId && (
        <div className="space-y-6">
          
          {/* Status Display Card */}
          {loan ? (
            <div className="bg-slate-50 border rounded-xl p-5 grid grid-cols-1 md:grid-cols-3 gap-4 text-sm shadow-sm">
              <div>
                <span className="text-slate-400 text-xs block font-bold uppercase tracking-wider">Current Penalty Balance</span>
                <span className="font-black text-slate-800 text-lg">KES {loan.penalty?.toLocaleString() || "0"}</span>
              </div>
              <div>
                <span className="text-slate-400 text-xs block font-bold uppercase tracking-wider">Unconfirmed Penalty Payments</span>
                <span className="font-black text-amber-600 text-lg">KES {loan.penalty_paid?.toLocaleString() || "0"}</span>
              </div>
              <div>
                <span className="text-slate-400 text-xs block font-bold uppercase tracking-wider">Verification State</span>
                <span className={`inline-block px-2.5 py-0.5 rounded-full font-black text-xs mt-1 ${
                  loan.penalty_status === "pending_approval" ? "bg-amber-100 text-amber-800 border" :
                  loan.penalty === 0 ? "bg-green-100 text-green-800 border" :
                  "bg-red-100 text-red-800 border"
                }`}>
                  {loan.penalty_status === "pending_approval" ? "⏳ Pending Admin Confirmation" :
                   loan.penalty === 0 ? "✅ Clear" : "⚠️ Outstanding Penalty"}
                </span>
              </div>
            </div>
          ) : (
            <p className="text-center text-slate-400 py-6">Loading active loan parameters...</p>
          )}

          {/* TWO-TIER FLOW - MEMBER SUBMISSION FORM */}
          {loan && userRole === "member" && (
            <div className="bg-white border rounded-xl p-5 space-y-4">
              <h3 className="font-black text-slate-700 text-sm">💳 Pay & Clear Loan Penalty</h3>
              {loan.penalty_status === "pending_approval" ? (
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 text-xs text-amber-800 leading-relaxed font-semibold">
                  ⏳ <strong>Clearance Submitted:</strong> Your payment of KES {loan.penalty_paid} has been recorded. Once verified by the Administrator, this penalty will be deducted from your account, and regular loan payments will resume.
                </div>
              ) : loan.penalty > 0 ? (
                <div className="space-y-3">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <div>
                      <label className="text-xs text-slate-400 block mb-1">Clearance Amount (KES)</label>
                      <input type="number" value={payAmount} onChange={e => setPayAmount(e.target.value)}
                        className="w-full border rounded-lg p-2 text-sm bg-white text-slate-900 outline-none focus:border-emerald-500" />
                    </div>
                    <div>
                      <label className="text-xs text-slate-400 block mb-1">Payment Method</label>
                      <select value={payMethod} onChange={e => setPayMethod(e.target.value)}
                        className="w-full border rounded-lg p-2 text-sm bg-white text-slate-900 outline-none focus:border-emerald-500 font-bold">
                        <option value="mpesa">M-Pesa Mobile Money</option>
                        <option value="cash">Direct Cash / Office</option>
                        <option value="bank">Bank Transfer</option>
                      </select>
                    </div>
                    {payMethod === "mpesa" && (
                      <div>
                        <label className="text-xs text-slate-400 block mb-1">M-Pesa Reference Code</label>
                        <input type="text" placeholder="e.g. QHA4R2..." value={mpesaCode} onChange={e => setMpesaCode(e.target.value)}
                          className="w-full border rounded-lg p-2 text-sm bg-white text-slate-900 outline-none focus:border-emerald-500 font-mono uppercase" />
                      </div>
                    )}
                  </div>
                  <div>
                    <label className="text-xs text-slate-400 block mb-1">Payment Notes / Description</label>
                    <input type="text" placeholder="Add receipt description..." value={payNotes} onChange={e => setPayNotes(e.target.value)}
                      className="w-full border rounded-lg p-2 text-sm bg-white text-slate-900 outline-none focus:border-emerald-500" />
                  </div>
                  <button onClick={submitPenaltyClearance} disabled={submittingPay}
                    className="bg-emerald-600 hover:bg-emerald-700 text-white font-black py-2 px-6 rounded-lg text-sm disabled:opacity-50 font-bold shadow-sm">
                    {submittingPay ? "Submitting..." : "📨 Submit Penalty Clearance"}
                  </button>
                </div>
              ) : (
                <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-lg p-4 text-xs font-semibold">
                  🎉 All penalties are fully cleared on this loan. You may continue with your regular installment payments.
                </div>
              )}
            </div>
          )}

          {/* TWO-TIER FLOW - ADMIN DIRECT APPROVAL CONTROLS */}
          {loan && loan.penalty_status === "pending_approval" && canEdit && (
            <div className="bg-amber-50 border border-amber-300 rounded-xl p-5 space-y-3 shadow-sm">
              <h4 className="font-black text-amber-900 text-sm">⏳ Review Pending Penalty Clearance</h4>
              <p className="text-xs text-amber-800 leading-relaxed font-semibold">
                A member has submitted a separate payment of <strong>KES {loan.penalty_paid?.toLocaleString()}</strong> to clear the outstanding penalty.
                Please verify that funds have been received before confirming.
              </p>
              <div className="flex gap-2 pt-1">
                <button onClick={handleApprovePenalty} disabled={approving}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold px-4 py-2 rounded-lg text-xs shadow-sm transition-colors">
                  {approving ? "Verifying..." : "✅ Confirm Payment & Lift Block"}
                </button>
                <button onClick={handleRejectPenalty} disabled={approving}
                  className="bg-red-500 hover:bg-red-650 text-white font-extrabold px-4 py-2 rounded-lg text-xs shadow-sm transition-colors">
                  Reject Request
                </button>
              </div>
            </div>
          )}

          {/* MANUAL PENALTY ADDITION (ADMIN/HR ONLY) */}
          {canEdit && (
            <div className="bg-white border rounded-xl p-5 space-y-3">
              <h4 className="font-black text-slate-700 text-sm">Apply Manual Penalty to Loan #{loanId}</h4>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-slate-400 block mb-1">Amount (KES)</label>
                  <input type="number" placeholder="e.g. 500" value={penaltyForm.amount}
                    onChange={e => setPenaltyForm({ ...penaltyForm, amount: e.target.value })}
                    className="w-full border rounded-lg p-2 text-sm outline-none focus:border-red-400 text-slate-800 bg-white" />
                </div>
                <div>
                  <label className="text-xs text-slate-400 block mb-1">Reason</label>
                  <input placeholder="Misconduct or defaulted repayment..." value={penaltyForm.reason}
                    onChange={e => setPenaltyForm({ ...penaltyForm, reason: e.target.value })}
                    className="w-full border rounded-lg p-2 text-sm outline-none focus:border-red-400 text-slate-800 bg-white" />
                </div>
              </div>
              <button onClick={addManualPenalty} disabled={addingPenalty}
                className="bg-red-600 text-white font-black px-5 py-2.5 rounded-lg text-xs hover:bg-red-700 disabled:opacity-50">
                {addingPenalty ? "Applying..." : "⚠️ Apply Penalty"}
              </button>
            </div>
          )}

          {/* HISTORICAL LOG */}
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
            <div className="px-5 py-3 bg-slate-50 border-b border-slate-200">
              <h4 className="font-black text-slate-700 text-sm">Penalty Activity Log — Loan #{loanId}</h4>
            </div>
            {penalties.length === 0 ? (
              <p className="p-5 text-slate-400 text-sm text-center font-bold">No historical penalty entries on file.</p>
            ) : (
              <div className="divide-y divide-slate-100">
                {penalties.map((p, i) => (
                  <div key={i} className="flex justify-between items-center p-4 hover:bg-slate-50 transition-colors">
                    <div>
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                        p.action === "AUTO_DEDUCTION_FAILED" ? "bg-orange-100 text-orange-700" : 
                        p.action === "PENALTY_SUBMISSION" ? "bg-blue-100 text-blue-700" :
                        "bg-red-100 text-red-700"
                      }`}>
                        {p.action === "AUTO_DEDUCTION_FAILED" ? "Overdue Default" : 
                         p.action === "PENALTY_SUBMISSION" ? "Clearance Submitted" : "Manual Adjustment"}
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
      )}
    </div>
  );
}