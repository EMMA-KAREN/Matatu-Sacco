
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
  const [toast, setToast]           = useState(null);
  const showToast = (msg, type = "success") => setToast({ msg, type });

  // edit form for penalty policy
  const [policyForm, setPolicyForm] = useState({
    penalty_rate: "", grace_period_days: "", penalty_description: ""
  });
  const [saving, setSaving] = useState(false);

  // add manual penalty
  const [penaltyForm, setPenaltyForm] = useState({ amount: "", reason: "" });
  const [addingPenalty, setAddingPenalty] = useState(false);

  const canEdit = ["admin", "director"].includes(userRole);

  useEffect(() => { fetchLoanTypes(); }, []);
  useEffect(() => { if (loanId) fetchPenaltyHistory(); }, [loanId]);
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

  const fetchPenaltyHistory = async () => {
    // Fetches audit log for PENALTY_ADDED entries on this loan
    const res = await fetch(`${API}/loan-applications/${loanId}/audit`, { headers: hdr() });
    if (res.ok) {
      const logs = await res.json();
      setPenalties(logs.filter(l => l.action === "PENALTY_ADDED" || l.action === "AUTO_DEDUCTION_FAILED"));
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
    if (!res.ok) return showToast("Failed", "error");
    showToast("Penalty applied ✓");
    setPenaltyForm({ amount: "", reason: "" });
    fetchPenaltyHistory();
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-6 max-w-4xl">
      {toast && <Toast {...toast} onClose={() => setToast(null)} />}

      <div className="flex justify-between items-center mb-6">
        <div>
          <h2 className="text-xl font-black text-slate-800">⚠️ Penalty Management</h2>
          <p className="text-slate-400 text-sm mt-0.5">Configure penalty policies per loan type and view penalty history.</p>
        </div>
        {onClose && <button onClick={onClose} className="text-slate-400 hover:text-slate-700 text-xl font-bold">✕</button>}
      </div>

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

              {/* Penalty preview card */}
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm">
                <p className="font-black text-amber-800 mb-2">⚠️ What happens when an installment is missed?</p>
                <ol className="list-decimal list-inside space-y-1 text-amber-700">
                  <li>A <strong>{policyForm.grace_period_days}-day</strong> grace period begins after the due date</li>
                  <li>If still unpaid, a <strong>{policyForm.penalty_rate}%</strong> penalty is added to the missed amount</li>
                  <li>Loan status changes to <strong>defaulted</strong> and an SMS notification is sent</li>
                  <li>All guarantors are also notified of the default</li>
                </ol>
              </div>

              {/* Manual penalty (admin/hr only) */}
              {loanId && canEdit && (
                <div className="bg-white border border-red-200 rounded-xl p-5">
                  <h4 className="font-black text-slate-700 text-sm mb-3">Apply Manual Penalty to Loan #{loanId}</h4>
                  <div className="grid grid-cols-2 gap-3 mb-3">
                    <div>
                      <label className="text-xs text-slate-400 uppercase tracking-widest mb-1 block">Amount (KES)</label>
                      <input type="number" placeholder="e.g. 500" value={penaltyForm.amount}
                        onChange={e => setPenaltyForm({ ...penaltyForm, amount: e.target.value })}
                        className="w-full border border-slate-300 rounded-lg p-2.5 text-sm outline-none focus:border-red-400 text-slate-800 bg-white" />
                    </div>
                    <div>
                      <label className="text-xs text-slate-400 uppercase tracking-widest mb-1 block">Reason</label>
                      <input placeholder="Reason for penalty" value={penaltyForm.reason}
                        onChange={e => setPenaltyForm({ ...penaltyForm, reason: e.target.value })}
                        className="w-full border border-slate-300 rounded-lg p-2.5 text-sm outline-none focus:border-red-400 text-slate-800 bg-white" />
                    </div>
                  </div>
                  <button onClick={addManualPenalty} disabled={addingPenalty}
                    className="bg-red-600 text-white font-black px-5 py-2.5 rounded-lg text-sm hover:bg-red-700 disabled:opacity-50">
                    {addingPenalty ? "Applying..." : "⚠️ Apply Penalty"}
                  </button>
                </div>
              )}

              {/* Penalty history */}
              {loanId && (
                <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                  <div className="px-5 py-3 bg-slate-50 border-b border-slate-200">
                    <h4 className="font-black text-slate-700 text-sm">Penalty History — Loan #{loanId}</h4>
                  </div>
                  {penalties.length === 0 ? (
                    <p className="p-5 text-slate-400 text-sm">No penalties recorded</p>
                  ) : penalties.map((p, i) => (
                    <div key={i} className="flex justify-between items-center p-4 border-b border-slate-100">
                      <div>
                        <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${p.action === "AUTO_DEDUCTION_FAILED" ? "bg-orange-100 text-orange-700" : "bg-red-100 text-red-700"}`}>
                          {p.action === "AUTO_DEDUCTION_FAILED" ? "Auto Penalty" : "Manual Penalty"}
                        </span>
                        <p className="text-slate-600 text-sm mt-1">{p.notes}</p>
                      </div>
                      <span className="text-xs text-slate-400">{new Date(p.created_at).toLocaleDateString()}</span>
                    </div>
                  ))}
                </div>
              )}
            </>
          ) : (
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-12 text-center text-slate-400">
              <p className="text-4xl mb-3">⚠️</p>
              <p>Select a loan type to view or edit its penalty policy</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}