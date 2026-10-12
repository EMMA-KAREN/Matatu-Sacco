import { useState, useEffect } from "react";
import API from "../api";

// Input styling to ensure text is ALWAYS dark and legible while typing
const inp = "w-full border border-gray-300 rounded-lg p-3 text-sm outline-none focus:border-emerald-500 bg-white text-gray-900 placeholder-gray-400 font-bold";

export default function RepaymentAccount({ loan, onClose }) {
  const [account, setAccount] = useState(null);
  const [loading, setLoading] = useState(true);
  const [depositForm, setDepositForm] = useState({
    amount: "", 
    payment_method: "mpesa", 
    mpesa_code: "",
    date: new Date().toISOString().split("T")[0], 
    description: ""
  });
  const [depositing, setDepositing] = useState(false);
  const [toast, setToast] = useState(null);
  
  // M-Pesa STK Push state
  const [showMpesa, setShowMpesa] = useState(false);
  const [mpesaPhone, setMpesaPhone] = useState("");
  const [mpesaLoading, setMpesaLoading] = useState(false);

  const token = localStorage.getItem("token");
  const headers = { Authorization: `Bearer ${token}` };

  const showToast = (msg, type = "success") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 4000);
  };

  useEffect(() => {
    fetchAccount();
  }, [loan.id]);

  const fetchAccount = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API}/repayment-account/${loan.id}`, { headers });
      if (res.ok) {
        setAccount(await res.json());
      } else {
        setAccount({ balance: 0, transactions: [] });
      }
    } catch (err) {
      setAccount({ balance: 0, transactions: [] });
    }
    setLoading(false);
  };

  const deposit = async () => {
    if (!depositForm.amount || parseFloat(depositForm.amount) <= 0) {
      return showToast("Valid amount required", "error");
    }
    setDepositing(true);

    try {
      const res = await fetch(`${API}/repayment-account/deposit`, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ loan_id: loan.id, ...depositForm })
      });

      setDepositing(false);
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        return showToast(errData.error || "Payment submission failed", "error");
      }
      
      showToast("Payment submitted! Awaiting HR/Admin confirmation before balance updates. ⏳");
      setDepositForm({
        amount: "", 
        payment_method: "mpesa", 
        mpesa_code: "", 
        date: new Date().toISOString().split("T")[0], 
        description: "" 
      });
      fetchAccount();
    } catch (e) {
      setDepositing(false);
      showToast("Network error submitting payment", "error");
    }
  };

  const initiateMpesa = async () => {
    if (!mpesaPhone || !depositForm.amount) return showToast("Phone and amount required", "error");
    setMpesaLoading(true);

    try {
      const res = await fetch(`${API}/mpesa/pay`, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({
          phone: mpesaPhone.startsWith("0") ? `254${mpesaPhone.slice(1)}` : mpesaPhone,
          amount: parseFloat(depositForm.amount)
        })
      });
      const data = await res.json();
      setMpesaLoading(false);

      if (data.ResponseCode === "0" || data.CheckoutRequestID) {
        showToast("M-Pesa prompt sent to your phone! Enter PIN to complete.");
        setShowMpesa(false);
      } else {
        showToast(data.errorMessage || "M-Pesa request failed", "error");
      }
    } catch (e) {
      setMpesaLoading(false);
      showToast("M-Pesa service unavailable", "error");
    }
  };

  // Repayment Schedules Calculations
  const nextDueSchedule = loan.schedule?.find(s => s.status === "pending");
  const overdueSchedules = loan.schedule?.filter(s => s.status === "overdue") || [];
  const canCoverNext = account && nextDueSchedule && account.balance >= nextDueSchedule.amount_due;

  // Calculate total pending approval amount
  const pendingTotal = account?.transactions
    ?.filter(t => t.status === "pending")
    .reduce((sum, t) => sum + (t.amount || 0), 0) || 0;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">

        {/* TOAST NOTIFICATION */}
        {toast && (
          <div className={`fixed top-5 right-5 z-[100] px-5 py-3 rounded-xl shadow-2xl text-sm font-bold ${
            toast.type === "error" ? "bg-red-600 text-white" : "bg-emerald-600 text-white"
          }`}>
            {toast.msg}
          </div>
        )}

        {/* MODAL HEADER */}
        <div className="flex justify-between items-center p-6 border-b border-gray-100">
          <div>
            <h2 className="text-xl font-black text-gray-900">💳 Loan Repayment Account</h2>
            <p className="text-gray-500 text-sm font-bold">Loan #{loan.id} · {loan.loan_type}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 text-xl font-bold">✕</button>
        </div>

        <div className="p-6 space-y-5">
          {loading ? (
            <div className="text-center py-8 text-gray-400 font-bold">Loading account history...</div>
          ) : (
            <>
              {/* BALANCE CARD */}
              <div className={`rounded-xl p-5 ${canCoverNext ? "bg-emerald-600" : "bg-slate-800"} text-white shadow-md`}>
                <div className="flex justify-between items-start">
                  <div>
                    <p className="text-xs uppercase tracking-wider opacity-80 mb-1 font-bold">Confirmed Balance</p>
                    <p className="text-4xl font-black">KES {account?.balance?.toLocaleString() || 0}</p>
                  </div>
                  {pendingTotal > 0 && (
                    <div className="bg-amber-500 text-slate-900 px-3 py-1.5 rounded-lg text-right font-bold">
                      <p className="text-[10px] uppercase font-bold tracking-widest text-slate-900">Pending HR Approval</p>
                      <p className="text-sm font-black">+KES {pendingTotal.toLocaleString()}</p>
                    </div>
                  )}
                </div>

                {nextDueSchedule && (
                  <p className="text-xs opacity-90 mt-3 font-semibold border-t border-white/20 pt-2">
                    {canCoverNext ? "✅ Sufficient balance for next installment auto-deduction" :
                      `⚠️ Need KES ${(nextDueSchedule.amount_due - (account?.balance || 0)).toLocaleString()} more for next installment`}
                  </p>
                )}
              </div>

              {/* OVERDUE WARNING BOX */}
              {overdueSchedules.length > 0 && (
                <div className="bg-red-50 border border-red-200 rounded-xl p-4">
                  <p className="font-black text-red-700 mb-1">⚠️ {overdueSchedules.length} Overdue Installment(s)</p>
                  {overdueSchedules.map(s => (
                    <p key={s.id} className="text-red-600 text-sm font-semibold">
                      Installment #{s.installment_no} — KES {s.amount_due?.toLocaleString()} due {s.due_date}
                    </p>
                  ))}
                  <p className="text-red-500 text-xs mt-1">Submit payment for HR confirmation to avoid defaulted penalties.</p>
                </div>
              )}

              {/* NEXT AUTO-DEDUCTION PREVIEW */}
              {nextDueSchedule && (
                <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
                  <p className="text-blue-800 text-xs uppercase tracking-widest mb-2 font-black">Next Installment</p>
                  <div className="flex justify-between items-center">
                    <div>
                      <p className="font-black text-blue-900 text-lg">KES {nextDueSchedule.amount_due?.toLocaleString()}</p>
                      <p className="text-blue-700 text-sm font-medium">Due: {nextDueSchedule.due_date} · Installment #{nextDueSchedule.installment_no}</p>
                    </div>
                    <span className={`text-xs px-3 py-1 rounded-full font-bold ${canCoverNext ? "bg-emerald-100 text-emerald-800" : "bg-red-100 text-red-800"}`}>
                      {canCoverNext ? "✓ Ready to deduct" : "⚠️ Top up needed"}
                    </span>
                  </div>
                </div>
              )}
              <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4">
                  <p className="text-emerald-800 text-xs uppercase tracking-widest mb-1.5 font-black">💡 Prepayment & Carry-Forward Rule</p>
                  <p className="text-emerald-700 text-xs font-semibold leading-relaxed">
                    You can submit payments at any time. If you top up more than the next installment amount, the system automatically marks upcoming schedules as <strong>Paid</strong> in sequence. 
                    Overdue fees will not apply to you until your prepaid intervals are exhausted. You may also pay off the entire outstanding amount at any point to fully settle this loan.
                  </p>
                </div>

            {/* REPAYMENT PAYMENT FORM */}
              {loan.penalty > 0 && loan.penalty_status !== "pending_approval" ? (
                <div className="bg-red-50 border border-red-200 rounded-xl p-5 text-center text-red-800 font-bold">
                  <p className="font-black text-base mb-1">⚠️ Standard Repayments Blocked</p>
                  <p className="text-xs font-semibold leading-relaxed">
                    You have an outstanding penalty of <strong>KES {loan.penalty.toLocaleString()}</strong>. 
                    Standard installment top-ups are blocked. Please close this window and use the <strong>"Clear Penalty"</strong> option in your loan details view first. Once approved, repayments will be unblocked.
                  </p>
                </div>
              ) : (
                <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm">
                  <h3 className="font-black text-gray-900 mb-1">Make Repayment / Top Up</h3>
                  <p className="text-xs text-gray-500 mb-4">Note: Your balance will update once HR or Admin confirms your payment.</p>

                  <div className="grid grid-cols-2 gap-3 mb-3">
                    <div>
                      <label className="text-xs text-gray-700 uppercase tracking-widest mb-1 block font-bold">Amount (KES)</label>
                      <input type="number" placeholder="e.g. 5000"
                        value={depositForm.amount}
                        onChange={e => setDepositForm({ ...depositForm, amount: e.target.value })}
                        className={inp} />
                    </div>
                    <div>
                      <label className="text-xs text-gray-700 uppercase tracking-widest mb-1 block font-bold">Payment Method</label>
                      <select value={depositForm.payment_method}
                        onChange={e => setDepositForm({ ...depositForm, payment_method: e.target.value })}
                        className={inp}>
                        <option value="mpesa">M-Pesa</option>
                        <option value="cash">Cash</option>
                        <option value="bank">Bank Transfer</option>
                      </select>
                    </div>
                  </div>

                  {depositForm.payment_method === "mpesa" && (
                    <div className="mb-3">
                      <label className="text-xs text-gray-700 uppercase tracking-widest mb-1 block font-bold">M-Pesa Transaction Ref Code</label>
                      <input placeholder="e.g. QHJ7KL5XYZ"
                        value={depositForm.mpesa_code}
                        onChange={e => setDepositForm({ ...depositForm, mpesa_code: e.target.value })}
                        className={inp} />
                    </div>
                  )}

                  <div className="mb-4">
                    <label className="text-xs text-gray-700 uppercase tracking-widest mb-1 block font-bold">Payment Date</label>
                    <input type="date" value={depositForm.date}
                      onChange={e => setDepositForm({ ...depositForm, date: e.target.value })}
                      className={inp} />
                  </div>

                  <div className="flex gap-3">
                    <button onClick={deposit} disabled={depositing}
                      className="flex-1 bg-emerald-600 text-white font-black py-3 rounded-lg hover:bg-emerald-700 disabled:opacity-50 text-sm shadow">
                      {depositing ? "Submitting..." : "📨 Submit Payment for HR Approval"}
                    </button>

                    {depositForm.payment_method === "mpesa" && (
                      <button onClick={() => setShowMpesa(true)}
                        className="bg-green-600 text-white font-bold px-4 py-3 rounded-lg hover:bg-green-700 text-sm flex items-center gap-1">
                        📱 STK Push
                      </button>
                    )}
                  </div>
                </div>
              )}
              {/* PAYMENT HISTORY */}
              <div>
                <h3 className="font-black text-gray-800 mb-3 text-sm uppercase tracking-widest">📜 Payment History</h3>
                {account?.transactions?.length === 0 ? (
                  <p className="text-gray-400 text-sm text-center py-6 bg-gray-50 rounded-xl font-bold">No payments made yet</p>
                ) : (
                  <div className="space-y-2.5">
                    {account?.transactions?.map(t => (
                      <div key={t.id} className="flex justify-between items-center p-3.5 bg-gray-50 rounded-xl border border-gray-200">
                        <div>
                          <div className="flex items-center gap-2 mb-1 flex-wrap">
                            <span className={`text-[11px] font-black px-2.5 py-0.5 rounded-full ${
                              t.transaction_type === "deposit" ? "bg-emerald-100 text-emerald-800 border border-emerald-200" :
                              t.transaction_type === "deduction" ? "bg-blue-100 text-blue-800 border border-blue-200" :
                              "bg-red-100 text-red-800 border border-red-200"
                            }`}>
                              {t.transaction_type === "deposit" ? "↑ Repayment / Top Up" :
                               t.transaction_type === "deduction" ? "↓ Installment Deducted" : "⚠️ Penalty"}
                            </span>

                            {/* Approval Status Badges */}
                            <span className={`text-[11px] font-black px-2.5 py-0.5 rounded-full ${
                              t.status === "approved" ? "bg-green-100 text-green-700 border border-green-300" :
                              t.status === "rejected" ? "bg-red-100 text-red-700 border border-red-300" :
                              "bg-amber-100 text-amber-800 border border-amber-300"
                            }`}>
                              {t.status === "approved" ? "✅ Confirmed" :
                               t.status === "rejected" ? "❌ Rejected" : "⏳ Pending HR/Admin Approval"}
                            </span>
                          </div>

                          <p className="text-xs text-gray-600 font-bold mt-1">
                            {t.payment_method?.toUpperCase() || "CASH"} {t.mpesa_code ? `· Ref: ${t.mpesa_code}` : ""} · {t.date}
                          </p>
                          {t.description && <p className="text-[11px] text-gray-500 italic mt-0.5">{t.description}</p>}
                        </div>

                        <div className="text-right">
                          <p className={`font-black text-base ${
                            t.transaction_type === "deposit" ? "text-emerald-700" : "text-red-600"
                          }`}>
                            {t.transaction_type === "deposit" ? "+" : "-"}KES {t.amount?.toLocaleString()}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {/* M-PESA STK PUSH MODAL */}
      {showMpesa && (
        <div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-[60] p-4">
          <div className="bg-white rounded-2xl p-6 w-[380px] shadow-2xl">
            <div className="text-center mb-4">
              <div className="w-14 h-14 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-2">
                <span className="text-2xl">📱</span>
              </div>
              <h3 className="font-black text-gray-900">M-Pesa STK Push</h3>
              <p className="text-gray-500 text-xs mt-1 font-bold">Enter your phone number to receive a payment prompt</p>
            </div>

            <div className="space-y-3 mb-4">
              <div>
                <label className="text-xs text-gray-700 uppercase tracking-widest mb-1 block font-bold">Phone Number</label>
                <input type="tel" placeholder="07XXXXXXXX or 254XXXXXXXXX"
                  value={mpesaPhone}
                  onChange={e => setMpesaPhone(e.target.value)}
                  className={inp} />
              </div>
              <div className="bg-green-50 border border-green-200 rounded-lg p-3">
                <p className="text-green-800 text-sm font-bold">Amount: KES {parseFloat(depositForm.amount || 0).toLocaleString()}</p>
                <p className="text-green-700 text-xs mt-0.5 font-bold">You will receive a PIN prompt on your phone</p>
              </div>
            </div>

            <div className="flex gap-3">
              <button onClick={initiateMpesa} disabled={mpesaLoading}
                className="flex-1 bg-green-600 text-white font-black py-3 rounded-lg hover:bg-green-700 disabled:opacity-50 text-sm">
                {mpesaLoading ? "Sending..." : "Send Prompt"}
              </button>
              <button onClick={() => setShowMpesa(false)}
                className="flex-1 bg-gray-100 text-gray-700 font-bold py-3 rounded-lg hover:bg-gray-200 text-sm">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}