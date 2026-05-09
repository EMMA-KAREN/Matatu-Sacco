import { useState, useEffect } from "react";
import API from "../api";

export default function RepaymentAccount({ loan, onClose }) {
  const [account, setAccount] = useState(null);
  const [loading, setLoading] = useState(true);
  const [depositForm, setDepositForm] = useState({
    amount: "", payment_method: "mpesa", mpesa_code: "",
    date: new Date().toISOString().split("T")[0], description: ""
  });
  const [depositing, setDepositing] = useState(false);
  const [toast, setToast] = useState(null);
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
    const res = await fetch(`${API}/repayment-account/${loan.id}`, { headers });
    if (res.ok) setAccount(await res.json());
    else setAccount({ balance: 0, transactions: [] });
    setLoading(false);
  };

  const deposit = async () => {
    if (!depositForm.amount) return showToast("Amount required", "error");
    setDepositing(true);

    const res = await fetch(`${API}/repayment-account/deposit`, {
      method: "POST",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({ loan_id: loan.id, ...depositForm })
    });

    setDepositing(false);
    if (!res.ok) return showToast("Deposit failed", "error");
    const d = await res.json();
    showToast(`Account topped up! Balance: KES ${d.balance?.toLocaleString()} ✓`);
    setDepositForm({ amount: "", payment_method: "mpesa", mpesa_code: "", date: new Date().toISOString().split("T")[0], description: "" });
    fetchAccount();
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
        // After mpesa success, user manually enters the code to confirm
      } else {
        showToast(data.errorMessage || "M-Pesa request failed", "error");
      }
    } catch (e) {
      setMpesaLoading(false);
      showToast("M-Pesa service unavailable", "error");
    }
  };

  const nextDueSchedule = loan.schedule?.find(s => s.status === "pending");
  const overdueSchedules = loan.schedule?.filter(s => s.status === "overdue") || [];
  const canCoverNext = account && nextDueSchedule && account.balance >= nextDueSchedule.amount_due;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">

        {/* TOAST */}
        {toast && (
          <div className={`fixed top-5 right-5 z-50 px-5 py-3 rounded-lg shadow-xl text-sm font-bold ${
            toast.type === "error" ? "bg-red-600 text-white" : "bg-emerald-600 text-white"
          }`}>
            {toast.msg}
          </div>
        )}

        {/* HEADER */}
        <div className="flex justify-between items-center p-6 border-b border-gray-100">
          <div>
            <h2 className="text-xl font-black text-gray-900">💳 Loan Repayment Account</h2>
            <p className="text-gray-400 text-sm">Loan #{loan.id} · {loan.loan_type}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 text-xl">✕</button>
        </div>

        <div className="p-6 space-y-5">

          {loading ? (
            <div className="text-center py-8 text-gray-400">Loading account...</div>
          ) : (
            <>
              {/* BALANCE CARD */}
              <div className={`rounded-xl p-5 ${canCoverNext ? "bg-emerald-600" : "bg-red-600"} text-white`}>
                <p className="text-sm opacity-80 mb-1">Account Balance</p>
                <p className="text-4xl font-black">KES {account?.balance?.toLocaleString() || 0}</p>
                <p className="text-sm opacity-80 mt-2">
                  {canCoverNext ? "✅ Sufficient for next installment" :
                    nextDueSchedule ? `⚠️ Need KES ${(nextDueSchedule.amount_due - (account?.balance || 0)).toLocaleString()} more for next installment` :
                    "No upcoming installments"}
                </p>
              </div>

              {/* OVERDUE WARNING */}
              {overdueSchedules.length > 0 && (
                <div className="bg-red-50 border border-red-200 rounded-xl p-4">
                  <p className="font-black text-red-700 mb-1">⚠️ {overdueSchedules.length} Overdue Installment(s)</p>
                  {overdueSchedules.map(s => (
                    <p key={s.id} className="text-red-600 text-sm">
                      Installment #{s.installment_no} — KES {s.amount_due?.toLocaleString()} due {s.due_date}
                    </p>
                  ))}
                  <p className="text-red-500 text-xs mt-2">Penalties have been applied. Top up immediately to stop further penalties.</p>
                </div>
              )}

              {/* NEXT INSTALLMENT */}
              {nextDueSchedule && (
                <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
                  <p className="text-blue-700 text-xs uppercase tracking-widest mb-2 font-bold">Next Auto-Deduction</p>
                  <div className="flex justify-between items-center">
                    <div>
                      <p className="font-black text-blue-900">KES {nextDueSchedule.amount_due?.toLocaleString()}</p>
                      <p className="text-blue-600 text-sm">Due: {nextDueSchedule.due_date} · Installment #{nextDueSchedule.installment_no}</p>
                    </div>
                    <span className={`text-xs px-3 py-1 rounded-full font-bold ${canCoverNext ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700"}`}>
                      {canCoverNext ? "✓ Will auto-deduct" : "⚠️ Top up needed"}
                    </span>
                  </div>
                </div>
              )}

              {/* HOW IT WORKS */}
              <div className="bg-gray-50 border border-gray-200 rounded-xl p-4">
                <p className="font-bold text-gray-700 text-sm mb-2">📋 How Auto-Deduction Works</p>
                <div className="space-y-1 text-xs text-gray-500">
                  <p>1. Top up this account before your due date</p>
                  <p>2. On the due date, the system auto-deducts your installment</p>
                  <p>3. If balance is insufficient, a penalty is added and you receive an SMS + email alert</p>
                  <p>4. Your guarantors are also notified of any missed payments</p>
                  <p>5. Deductions run daily at 8:00 AM</p>
                </div>
              </div>

              {/* TOP UP FORM */}
              <div className="bg-white border border-gray-200 rounded-xl p-5">
                <h3 className="font-black text-gray-800 mb-4">Top Up Account</h3>

                <div className="grid grid-cols-2 gap-3 mb-3">
                  <div>
                    <label className="text-xs text-gray-400 uppercase tracking-widest mb-1 block">Amount (KES)</label>
                    <input type="number" placeholder="e.g. 5000"
                      value={depositForm.amount}
                      onChange={e => setDepositForm({ ...depositForm, amount: e.target.value })}
                      className="w-full border border-gray-300 rounded-lg p-2.5 text-sm focus:border-emerald-500 outline-none" />
                  </div>
                  <div>
                    <label className="text-xs text-gray-400 uppercase tracking-widest mb-1 block">Payment Method</label>
                    <select value={depositForm.payment_method}
                      onChange={e => setDepositForm({ ...depositForm, payment_method: e.target.value })}
                      className="w-full border border-gray-300 rounded-lg p-2.5 text-sm focus:border-emerald-500 outline-none">
                      <option value="mpesa">M-Pesa</option>
                      <option value="cash">Cash</option>
                      <option value="bank">Bank Transfer</option>
                      <option value="card">Card</option>
                    </select>
                  </div>
                </div>

                {depositForm.payment_method === "mpesa" && (
                  <div className="mb-3">
                    <label className="text-xs text-gray-400 uppercase tracking-widest mb-1 block">M-Pesa Transaction Code</label>
                    <input placeholder="e.g. QHJ7KL5XYZ"
                      value={depositForm.mpesa_code}
                      onChange={e => setDepositForm({ ...depositForm, mpesa_code: e.target.value })}
                      className="w-full border border-gray-300 rounded-lg p-2.5 text-sm focus:border-emerald-500 outline-none" />
                  </div>
                )}

                <div className="mb-3">
                  <label className="text-xs text-gray-400 uppercase tracking-widest mb-1 block">Date</label>
                  <input type="date" value={depositForm.date}
                    onChange={e => setDepositForm({ ...depositForm, date: e.target.value })}
                    className="w-full border border-gray-300 rounded-lg p-2.5 text-sm focus:border-emerald-500 outline-none" />
                </div>

                <div className="flex gap-3">
                  <button onClick={deposit} disabled={depositing}
                    className="flex-1 bg-emerald-600 text-white font-black py-3 rounded-lg hover:bg-emerald-700 disabled:opacity-50">
                    {depositing ? "Processing..." : "💳 Top Up Account"}
                  </button>

                  {/* STK PUSH BUTTON */}
                  {depositForm.payment_method === "mpesa" && (
                    <button onClick={() => setShowMpesa(true)}
                      className="bg-green-600 text-white font-bold px-4 py-3 rounded-lg hover:bg-green-700 text-sm">
                      📱 STK Push
                    </button>
                  )}
                </div>
              </div>

              {/* TRANSACTION HISTORY */}
              <div>
                <h3 className="font-black text-gray-700 mb-3 text-sm uppercase tracking-widest">Transaction History</h3>
                {account?.transactions?.length === 0 ? (
                  <p className="text-gray-400 text-sm text-center py-4">No transactions yet</p>
                ) : (
                  <div className="space-y-2">
                    {account?.transactions?.map(t => (
                      <div key={t.id} className="flex justify-between items-center p-3 bg-gray-50 rounded-lg border border-gray-100">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                              t.transaction_type === "deposit" ? "bg-green-100 text-green-700" :
                              t.transaction_type === "deduction" ? "bg-blue-100 text-blue-700" :
                              "bg-red-100 text-red-700"
                            }`}>
                              {t.transaction_type === "deposit" ? "↑ Top Up" :
                               t.transaction_type === "deduction" ? "↓ Deducted" : "⚠️ Penalty"}
                            </span>
                            {t.mpesa_code && <span className="text-xs text-gray-400">{t.mpesa_code}</span>}
                          </div>
                          <p className="text-xs text-gray-400 mt-0.5">{t.description} · {t.date}</p>
                        </div>
                        <p className={`font-black text-sm ${
                          t.transaction_type === "deposit" ? "text-green-600" : "text-red-600"
                        }`}>
                          {t.transaction_type === "deposit" ? "+" : "-"}KES {t.amount?.toLocaleString()}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {/* STK PUSH MODAL */}
      {showMpesa && (
        <div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-60">
          <div className="bg-white rounded-2xl p-6 w-[380px] shadow-2xl">
            <div className="text-center mb-4">
              <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-3">
                <span className="text-3xl">📱</span>
              </div>
              <h3 className="font-black text-gray-900">M-Pesa STK Push</h3>
              <p className="text-gray-400 text-sm mt-1">Enter your phone number to receive a payment prompt</p>
            </div>

            <div className="space-y-3 mb-4">
              <div>
                <label className="text-xs text-gray-400 uppercase tracking-widest mb-1 block">Phone Number</label>
                <input type="tel" placeholder="07XXXXXXXX or 254XXXXXXXXX"
                  value={mpesaPhone}
                  onChange={e => setMpesaPhone(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg p-3 text-sm focus:border-green-500 outline-none" />
              </div>
              <div className="bg-green-50 border border-green-200 rounded-lg p-3">
                <p className="text-green-700 text-sm font-semibold">Amount: KES {parseFloat(depositForm.amount || 0).toLocaleString()}</p>
                <p className="text-green-600 text-xs mt-0.5">You will receive a PIN prompt on your phone</p>
              </div>
            </div>

            <div className="flex gap-3">
              <button onClick={initiateMpesa} disabled={mpesaLoading}
                className="flex-1 bg-green-600 text-white font-black py-3 rounded-lg hover:bg-green-700 disabled:opacity-50">
                {mpesaLoading ? "Sending..." : "Send Prompt"}
              </button>
              <button onClick={() => setShowMpesa(false)}
                className="flex-1 bg-gray-100 text-gray-700 font-bold py-3 rounded-lg hover:bg-gray-200">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}