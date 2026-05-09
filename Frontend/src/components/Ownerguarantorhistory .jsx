import { useState, useEffect } from "react";
import API from "../api";
import { useAuth } from "../context/AuthContext";

const LOAN_STATUS_COLORS = {
  pending:           "bg-yellow-100 text-yellow-800",
  guarantors_pending:"bg-blue-100 text-blue-800",
  approved:          "bg-green-100 text-green-700",
  rejected:          "bg-red-100 text-red-700",
  disbursed:         "bg-purple-100 text-purple-800",
  repaying:          "bg-blue-100 text-blue-800",
  cleared:           "bg-green-200 text-green-900",
  defaulted:         "bg-red-200 text-red-900",
};

export default function OwnerGuarantorHistory() {
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);

  const token   = localStorage.getItem("token");
  const headers = { Authorization: `Bearer ${token}` };

  useEffect(() => {
    fetch(`${API}/guarantors/my-history`, { headers })
      .then(r => r.ok ? r.json() : [])
      .then(d => { setHistory(d); setLoading(false); });
  }, []);

  const GUARANTEE_STATUS = {
    pending:  { color:"bg-yellow-100 text-yellow-800 border-yellow-300", icon:"⏳", label:"Pending" },
    accepted: { color:"bg-green-100 text-green-700 border-green-300",   icon:"✅", label:"Accepted" },
    rejected: { color:"bg-red-100 text-red-700 border-red-200",         icon:"❌", label:"Rejected" },
  };

  return (
    <div className="p-8">
      <h2 className="text-2xl font-black text-stone-800 mb-2">🤝 Guarantor History</h2>
      <p className="text-stone-400 text-sm mb-6">
        All loans you've been asked to guarantee — permanently visible. Accepted records show repayment progress.
      </p>

      <button onClick={() => {
        setLoading(true);
        fetch(`${API}/guarantors/my-history`, { headers }).then(r=>r.json()).then(d=>{setHistory(d);setLoading(false);});
      }} className="mb-4 bg-stone-100 text-stone-600 border border-stone-200 text-xs px-3 py-1.5 rounded hover:bg-stone-200 font-bold">
        🔄 Refresh
      </button>

      {loading ? (
        <div className="bg-white border border-stone-200 rounded-xl p-8 text-center text-stone-400">Loading...</div>
      ) : history.length === 0 ? (
        <div className="bg-white border border-stone-200 rounded-xl p-8 text-center text-stone-400">
          <p className="text-4xl mb-3">🤝</p>
          <p>No guarantor requests yet</p>
        </div>
      ) : (
        <div className="space-y-4">
          {history.map(g => {
            const cfg = GUARANTEE_STATUS[g.status] || GUARANTEE_STATUS.pending;
            return (
              <div key={g.id} className={`bg-white border rounded-xl p-5 ${g.status==="accepted"?"border-green-300":g.status==="rejected"?"border-red-200":"border-amber-300"}`}>
                <div className="flex justify-between items-start mb-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="font-black text-stone-800 text-lg">{g.member_name}</p>
                      <span className="text-xs text-stone-400">{g.membership_no}</span>
                    </div>
                    <p className="text-stone-500 text-sm">{g.loan_type} loan</p>
                  </div>
                  <span className={`text-xs px-3 py-1 rounded-full font-bold border ${cfg.color}`}>
                    {cfg.icon} {cfg.label}
                  </span>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-sm mb-3">
                  <div className="bg-stone-50 rounded-lg p-3">
                    <p className="text-stone-400 text-xs">Loan Amount</p>
                    <p className="font-black text-stone-800">KES {g.loan_amount?.toLocaleString()}</p>
                  </div>
                  <div className="bg-stone-50 rounded-lg p-3">
                    <p className="text-stone-400 text-xs">Loan Status</p>
                    <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${LOAN_STATUS_COLORS[g.loan_status]||"bg-stone-100 text-stone-600"}`}>
                      {g.loan_status?.replace(/_/g," ")}
                    </span>
                  </div>
                  <div className="bg-stone-50 rounded-lg p-3">
                    <p className="text-stone-400 text-xs">Loan Type</p>
                    <p className="font-bold text-stone-700">{g.loan_type || "—"}</p>
                  </div>
                </div>

                <p className="text-stone-500 text-sm mb-2">Purpose: {g.loan_purpose}</p>

                {/* Repayment progress — only for accepted */}
                {g.status === "accepted" && (
                  <div className="bg-green-50 border border-green-200 rounded-xl p-4 mt-2">
                    <p className="font-black text-green-800 text-sm mb-2">✅ You are an active guarantor for this loan</p>
                    <div className="flex gap-4 text-sm mb-3">
                      <div>
                        <p className="text-stone-400 text-xs">Amount Repaid</p>
                        <p className="font-black text-green-700">KES {g.amount_repaid?.toLocaleString()}</p>
                      </div>
                      <div>
                        <p className="text-stone-400 text-xs">Outstanding</p>
                        <p className="font-black text-red-600">KES {((g.total_payable||0)-(g.amount_repaid||0)).toLocaleString()}</p>
                      </div>
                      <div>
                        <p className="text-stone-400 text-xs">Total Payable</p>
                        <p className="font-black text-stone-700">KES {g.total_payable?.toLocaleString()}</p>
                      </div>
                    </div>
                    {g.total_payable > 0 && (
                      <div>
                        <div className="flex justify-between text-xs text-stone-400 mb-1">
                          <span>{Math.round((g.amount_repaid/g.total_payable)*100)}% repaid</span>
                          <span>{100-Math.round((g.amount_repaid/g.total_payable)*100)}% remaining</span>
                        </div>
                        <div className="w-full bg-stone-200 rounded-full h-2.5">
                          <div className="h-2.5 rounded-full bg-green-500" style={{width:`${Math.min((g.amount_repaid/g.total_payable)*100,100)}%`}} />
                        </div>
                      </div>
                    )}
                    {(g.loan_status === "defaulted") && (
                      <div className="mt-3 bg-red-50 border border-red-200 rounded-lg p-2">
                        <p className="text-red-700 text-xs font-bold">⚠️ This loan is in default. As guarantor you may be liable.</p>
                      </div>
                    )}
                  </div>
                )}

                <p className="text-stone-400 text-xs mt-3">
                  Requested: {new Date(g.created_at).toLocaleDateString()}
                  {g.responded_at && ` · Responded: ${new Date(g.responded_at).toLocaleDateString()}`}
                </p>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}