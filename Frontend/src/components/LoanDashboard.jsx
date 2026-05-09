
import { useState, useEffect } from "react";
import API from "../api";
import { useAuth } from "../context/AuthContext";
import RepaymentAccount from "./RepaymentAccount";

const tok = () => localStorage.getItem("token");
const hdr = (json = true) => ({
  Authorization: `Bearer ${tok()}`,
  ...(json ? { "Content-Type": "application/json" } : {}),
});
const authGet = (url) =>
  fetch(`${API}${url}`, { headers: hdr() }).then(r => r.ok ? r.json() : []);

const STATUS_CONFIG = {
  pending:            { color: "bg-yellow-100 text-yellow-800 border-yellow-200",  icon: "⏳", label: "Pending Approval" },
  guarantors_pending: { color: "bg-blue-100 text-blue-800 border-blue-200",        icon: "🤝", label: "Awaiting Guarantors" },
  guarantor_rejected: { color: "bg-red-100 text-red-800 border-red-200",           icon: "❌", label: "Guarantor Rejected" },
  info_required:      { color: "bg-orange-100 text-orange-800 border-orange-200",  icon: "ℹ️", label: "More Info Required" },
  approved:           { color: "bg-green-100 text-green-800 border-green-200",     icon: "✅", label: "Approved" },
  rejected:           { color: "bg-red-100 text-red-800 border-red-200",           icon: "❌", label: "Rejected" },
  disbursed:          { color: "bg-purple-100 text-purple-800 border-purple-200",  icon: "💸", label: "Disbursed" },
  repaying:           { color: "bg-blue-100 text-blue-800 border-blue-200",        icon: "🔄", label: "Repaying" },
  cleared:            { color: "bg-green-100 text-green-800 border-green-200",     icon: "🎉", label: "Cleared" },
  defaulted:          { color: "bg-red-200 text-red-900 border-red-300",           icon: "⚠️", label: "Defaulted" },
};

const STEPS = ["Loan Type", "Terms & Conditions", "Loan Details", "Guarantors", "Submit"];

// Always-visible input — white bg, dark text, no way to miss what you're typing
const inp = "w-full border border-gray-300 rounded-lg p-3 text-sm outline-none focus:border-emerald-500 bg-white text-gray-900 placeholder-gray-400";
const textArea = `${inp} resize-none`;

function Toast({ msg, type, onClose }) {
  useEffect(() => { const t = setTimeout(onClose, 4000); return () => clearTimeout(t); }, [onClose]);
  return (
    <div className={`fixed top-5 right-5 z-[200] px-5 py-3 rounded-xl shadow-2xl text-sm font-bold max-w-sm
      ${type === "error" ? "bg-red-600 text-white" : "bg-emerald-600 text-white"}`}>
      {msg}
    </div>
  );
}

export default function LoanDashboard() {
  const { user } = useAuth();
  // views: dashboard | apply | detail | guarantors | guarantorHistory
  const [view, setView] = useState("dashboard");
  const [loans, setLoans]               = useState([]);
  const [loanTypes, setLoanTypes]       = useState([]);
  const [eligibility, setEligibility]   = useState(null);
  const [selectedLoan, setSelectedLoan] = useState(null);
  const [loanPayments, setLoanPayments] = useState([]);
  const [guarantorRequests, setGuarantorRequests] = useState([]);
  const [guarantorHistory, setGuarantorHistory]   = useState([]);
  const [members, setMembers]           = useState([]);
  const [matatus, setMatatus]           = useState([]);
  const [toast, setToast]               = useState(null);
  const [loading, setLoading]           = useState(false);
  const [showRepaymentAccount, setShowRepaymentAccount] = useState(false);

  // Apply flow
  const [step, setStep]               = useState(0);
  const [selectedType, setSelectedType] = useState(null);
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [form, setForm]               = useState({
    amount: "", repayment_months: "", purpose: "",
    matatu_id: "", supporting_doc: null, guarantor_ids: []
  });
  const [calc, setCalc]               = useState(null);
  const [guarantorSearch, setGuarantorSearch]   = useState("");
  const [showGuarantorDrop, setShowGuarantorDrop] = useState(false);

  // Payment modal
  const [showPayModal, setShowPayModal] = useState(false);
  const [payForm, setPayForm]           = useState({
    amount: "", payment_method: "cash", mpesa_code: "",
    date: new Date().toISOString().split("T")[0], proof_file: null
  });

  // Info-required response
  const [infoResponse, setInfoResponse]   = useState("");
  const [infoDoc, setInfoDoc]             = useState(null);
  const [sendingInfo, setSendingInfo]     = useState(false);

  const showToast = (msg, type = "success") => setToast({ msg, type });

  // ── fetch ──────────────────────────────────────────────────────────────────
  useEffect(() => { fetchAll(); }, []);

  const fetchAll = async () => {
    await Promise.all([
      fetchLoans(), fetchLoanTypes(), fetchEligibility(),
      fetchGuarantorRequests(), fetchGuarantorHistory(),
      fetchMembers(), fetchMatatus()
    ]);
  };

  const fetchLoans = async () => {
    const d = await authGet("/loan-applications/my");
    if (Array.isArray(d)) setLoans(d);
  };

  const fetchLoanTypes = async () => {
    const res = await fetch(`${API}/loan-types`);
    if (res.ok) setLoanTypes(await res.json());
  };

  const fetchEligibility = async () => {
    const d = await authGet("/loans/eligibility");
    setEligibility(d);
  };

  const fetchGuarantorRequests = async () => {
    const d = await authGet("/guarantors/my-requests");
    if (Array.isArray(d)) setGuarantorRequests(d);
  };

  const fetchGuarantorHistory = async () => {
    const d = await authGet("/guarantors/my-history");
    if (Array.isArray(d)) setGuarantorHistory(d);
  };

  const fetchMembers = async () => {
    const res = await fetch(`${API}/hr/members`);
    if (res.ok) {
      const d = await res.json();
      setMembers(d.filter(m => m.id !== user?.id));
    }
  };

  const fetchMatatus = async () => {
    const res = await fetch(`${API}/matatus`);
    if (res.ok) {
      const d = await res.json();
      setMatatus(d.filter(m => m.owner_member_no === user?.membership_no));
    }
  };

  const fetchLoanDetail = async (loan) => {
    setSelectedLoan(loan);
    const res = await fetch(`${API}/loan-payments/${loan.id}`, { headers: hdr() });
    if (res.ok) setLoanPayments(await res.json());
    setView("detail");
  };

  // ── calculations ───────────────────────────────────────────────────────────
  useEffect(() => {
    if (selectedType && form.amount && form.repayment_months) {
      const amount = parseFloat(form.amount);
      const months = parseInt(form.repayment_months);
      const rate   = selectedType.interest_rate;
      const totalInterest = (amount * rate / 100) * (months / 12);
      const totalPayable  = amount + totalInterest;
      const monthly       = totalPayable / months;
      setCalc({
        totalInterest: totalInterest.toFixed(2),
        totalPayable: totalPayable.toFixed(2),
        monthly: monthly.toFixed(2),
        rate
      });
    } else {
      setCalc(null);
    }
  }, [form.amount, form.repayment_months, selectedType]);

  // ── submit application ─────────────────────────────────────────────────────
  const submitApplication = async () => {
    setLoading(true);
    const fd = new FormData();
    fd.append("loan_type_id", selectedType.id);
    fd.append("amount", form.amount);
    fd.append("repayment_months", form.repayment_months);
    fd.append("purpose", form.purpose);
    if (form.matatu_id) fd.append("matatu_id", form.matatu_id);
    if (form.supporting_doc) fd.append("supporting_doc", form.supporting_doc);
    form.guarantor_ids.forEach(id => fd.append("guarantor_ids", id));

    const res = await fetch(`${API}/loan-applications`, {
      method: "POST", headers: hdr(false), body: fd
    });
    setLoading(false);
    if (!res.ok) {
      const d = await res.json();
      return showToast(d.error || "Application failed", "error");
    }
    showToast("Loan application submitted! Awaiting guarantor responses ✓");
    setView("dashboard");
    setStep(0); setSelectedType(null); setTermsAccepted(false);
    setForm({ amount:"", repayment_months:"", purpose:"", matatu_id:"", supporting_doc:null, guarantor_ids:[] });
    fetchAll();
  };

  // ── guarantor response ─────────────────────────────────────────────────────
  const respondToGuarantor = async (id, status) => {
    const res = await fetch(`${API}/guarantors/${id}/respond`, {
      method: "PUT", headers: hdr(), body: JSON.stringify({ status })
    });
    if (!res.ok) return showToast("Failed", "error");
    showToast(`Guarantor request ${status} ✓`);
    fetchGuarantorRequests(); fetchGuarantorHistory();
  };

  // ── make payment ───────────────────────────────────────────────────────────
  const makePayment = async () => {
    if (!payForm.amount) return showToast("Amount required", "error");
    setLoading(true);
    const fd = new FormData();
    fd.append("loan_id", selectedLoan.id);
    fd.append("amount", payForm.amount);
    fd.append("payment_method", payForm.payment_method);
    fd.append("mpesa_code", payForm.mpesa_code);
    fd.append("date", payForm.date);
    if (payForm.proof_file) fd.append("proof_file", payForm.proof_file);

    const res = await fetch(`${API}/loan-payments`, {
      method: "POST", headers: hdr(false), body: fd
    });
    setLoading(false);
    if (!res.ok) return showToast("Payment failed", "error");
    const d = await res.json();
    showToast(`Payment recorded! Balance: KES ${d.balance?.toLocaleString()} ✓`);
    setShowPayModal(false);
    setPayForm({ amount:"", payment_method:"cash", mpesa_code:"", date:new Date().toISOString().split("T")[0], proof_file:null });
    fetchLoans();
  };

  // ── respond to info_required ───────────────────────────────────────────────
  const sendInfoResponse = async () => {
    if (!infoResponse.trim()) return showToast("Please provide your response", "error");
    setSendingInfo(true);
    const fd = new FormData();
    fd.append("response", infoResponse);
    if (infoDoc) fd.append("doc", infoDoc);
    const res = await fetch(`${API}/loan-applications/${selectedLoan.id}/respond-info`, {
      method: "PUT", headers: hdr(false), body: fd
    });
    setSendingInfo(false);
    if (!res.ok) return showToast("Failed to send response", "error");
    showToast("Response submitted — loan is back under review ✓");
    setInfoResponse(""); setInfoDoc(null);
    fetchLoans();
    const updated = (await authGet("/loan-applications/my")).find(l => l.id === selectedLoan.id);
    if (updated) setSelectedLoan(updated);
  };

  // ── helpers ────────────────────────────────────────────────────────────────
  const addGuarantor = (m) => {
    if (form.guarantor_ids.includes(m.id)) return showToast("Already added", "error");
    if (form.guarantor_ids.length >= 3)    return showToast("Maximum 3 guarantors", "error");
    setForm({ ...form, guarantor_ids: [...form.guarantor_ids, m.id] });
    setGuarantorSearch(""); setShowGuarantorDrop(false);
  };
  const removeGuarantor = (id) => setForm({ ...form, guarantor_ids: form.guarantor_ids.filter(g => g !== id) });
  const getMember = (id) => members.find(m => m.id === id);
  const filteredMembers = members.filter(m =>
    m.name?.toLowerCase().includes(guarantorSearch.toLowerCase()) ||
    m.membership_no?.toLowerCase().includes(guarantorSearch.toLowerCase())
  );
  const activeLoan    = loans.find(l => ["repaying","disbursed","approved"].includes(l.status));
  const totalBorrowed = loans.filter(l => l.status === "cleared").reduce((s,l) => s + l.amount, 0);

  const GUARANTEE_STATUS = {
    pending:  { color:"bg-yellow-100 text-yellow-700", icon:"⏳" },
    accepted: { color:"bg-green-100 text-green-700",   icon:"✅" },
    rejected: { color:"bg-red-100 text-red-700",       icon:"❌" },
  };

  // ── RENDER ─────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-gray-50">
      {toast && <Toast {...toast} onClose={() => setToast(null)} />}

      {/* Guarantor banner */}
      {guarantorRequests.length > 0 && view === "dashboard" && (
        <div className="bg-blue-600 text-white px-6 py-3">
          <div className="max-w-5xl mx-auto flex items-center justify-between">
            <span className="text-sm font-semibold">🤝 You have {guarantorRequests.length} pending guarantor request(s)</span>
            <button onClick={() => setView("guarantors")} className="bg-white text-blue-600 text-xs font-bold px-3 py-1 rounded">Review Now</button>
          </div>
        </div>
      )}

      <div className="max-w-5xl mx-auto p-6">

        {/* Header */}
        <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
          <div>
            {view !== "dashboard" && (
              <button onClick={() => { setView("dashboard"); setStep(0); setSelectedType(null); setTermsAccepted(false); }}
                className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-800 mb-1">
                ← Back to Loan Dashboard
              </button>
            )}
            <h1 className="text-2xl font-black text-gray-900">
              {view === "dashboard"      && "💼 Loan Dashboard"}
              {view === "apply"          && "📝 Apply for a Loan"}
              {view === "detail"         && `Loan #${selectedLoan?.id} Details`}
              {view === "guarantors"     && "🤝 Pending Guarantor Requests"}
              {view === "guarantorHistory" && "🤝 My Guarantor History"}
            </h1>
          </div>

          {view === "dashboard" && (
            <div className="flex gap-2 flex-wrap">
              <button onClick={() => setView("guarantorHistory")}
                className="bg-slate-100 text-slate-700 font-bold px-4 py-2 rounded-lg text-sm hover:bg-slate-200">
                🤝 Guarantor History
              </button>
              {guarantorRequests.length > 0 && (
                <button onClick={() => setView("guarantors")}
                  className="bg-blue-100 text-blue-700 font-bold px-4 py-2 rounded-lg text-sm hover:bg-blue-200 flex items-center gap-1">
                  Pending Requests
                  <span className="bg-blue-600 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs">{guarantorRequests.length}</span>
                </button>
              )}
              <button
                onClick={() => {
                  if (eligibility?.eligible) setView("apply");
                  else showToast(eligibility?.reasons?.join(". ") || "Not eligible", "error");
                }}
                className={`font-bold px-5 py-2 rounded-lg text-sm ${eligibility?.eligible ? "bg-emerald-600 text-white hover:bg-emerald-700" : "bg-gray-300 text-gray-500 cursor-not-allowed"}`}>
                + Apply for Loan
              </button>
            </div>
          )}
        </div>

        {/* ═══════════════════════════════ DASHBOARD ══════════════════════════ */}
        {view === "dashboard" && (
          <div className="space-y-6">

            {/* Eligibility */}
            {eligibility && (
              <div className={`rounded-xl p-5 border ${eligibility.eligible ? "bg-emerald-50 border-emerald-200" : "bg-red-50 border-red-200"}`}>
                <div className="flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-xl">{eligibility.eligible ? "✅" : "❌"}</span>
                      <h3 className="font-black text-gray-800">{eligibility.eligible ? "You are eligible to apply" : "Currently not eligible"}</h3>
                    </div>
                    {eligibility.reasons?.length > 0 && (
                      <ul className="space-y-1">
                        {eligibility.reasons.map((r,i) => <li key={i} className="text-sm text-red-700">• {r}</li>)}
                      </ul>
                    )}
                  </div>
                  <div className="text-right ml-4 flex-shrink-0">
                    <p className="text-xs text-gray-500 mb-1">Max Eligible Amount</p>
                    <p className="text-2xl font-black text-emerald-700">KES {eligibility.max_eligible_amount?.toLocaleString()}</p>
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-3 mt-4 pt-3 border-t border-opacity-30"
                  style={{ borderColor: eligibility.eligible ? "#6EE7B7" : "#FCA5A5" }}>
                  {[["Savings",`KES ${eligibility.total_savings?.toLocaleString()||0}`],
                    ["Contributions",`KES ${eligibility.total_contributions?.toLocaleString()||0}`],
                    ["Past Loans",eligibility.past_loans||0]].map(([l,v],i) => (
                    <div key={i} className="text-center">
                      <p className="text-xs text-gray-500">{l}</p>
                      <p className="font-black text-gray-800 text-sm">{v}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Stats */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {[
                { label:"Active Loan",    value:activeLoan?`KES ${activeLoan.amount?.toLocaleString()}`:"None",                                           icon:"💰", color:"bg-blue-50 border-blue-200" },
                { label:"Balance Due",    value:activeLoan?`KES ${(activeLoan.total_payable-activeLoan.amount_repaid)?.toLocaleString()}`:"KES 0",       icon:"📊", color:"bg-amber-50 border-amber-200" },
                { label:"Total Borrowed", value:`KES ${totalBorrowed?.toLocaleString()}`,                                                                  icon:"📈", color:"bg-purple-50 border-purple-200" },
                { label:"Loan History",   value:`${loans.length} loan(s)`,                                                                                 icon:"📁", color:"bg-gray-50 border-gray-200" },
              ].map((s,i) => (
                <div key={i} className={`border rounded-xl p-4 ${s.color}`}>
                  <span className="text-2xl">{s.icon}</span>
                  <p className="text-xs text-gray-500 mt-1">{s.label}</p>
                  <p className="font-black text-gray-800 text-sm mt-0.5">{s.value}</p>
                </div>
              ))}
            </div>

            {/* Active loan progress */}
            {activeLoan && (
              <div className="bg-white border border-gray-200 rounded-xl p-5">
                <div className="flex justify-between items-start mb-4">
                  <div>
                    <h3 className="font-black text-gray-800">Active Loan — {activeLoan.loan_type}</h3>
                    <p className="text-gray-500 text-sm">{activeLoan.purpose}</p>
                  </div>
                  <span className={`text-xs px-3 py-1 rounded-full font-bold border ${STATUS_CONFIG[activeLoan.status]?.color}`}>
                    {STATUS_CONFIG[activeLoan.status]?.icon} {STATUS_CONFIG[activeLoan.status]?.label}
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-4 mb-4 text-sm">
                  <div><p className="text-gray-400">Loan Amount</p><p className="font-black">KES {activeLoan.amount?.toLocaleString()}</p></div>
                  <div><p className="text-gray-400">Repaid</p><p className="font-black text-green-600">KES {activeLoan.amount_repaid?.toLocaleString()}</p></div>
                  <div><p className="text-gray-400">Balance</p><p className="font-black text-red-600">KES {(activeLoan.total_payable-activeLoan.amount_repaid)?.toLocaleString()}</p></div>
                </div>
                <div className="w-full bg-gray-100 rounded-full h-3 mb-4">
                  <div className="h-3 rounded-full bg-emerald-500 transition-all duration-700"
                    style={{ width:`${Math.min((activeLoan.amount_repaid/activeLoan.total_payable)*100,100)}%` }} />
                </div>

                {/* Info required alert */}
                {activeLoan.status === "info_required" && (
                  <div className="bg-orange-50 border border-orange-300 rounded-lg p-3 mb-3">
                    <p className="text-orange-700 font-bold text-sm">ℹ️ More Information Required</p>
                    <p className="text-orange-600 text-xs mt-1">{activeLoan.admin_notes || "HR/Admin has requested additional information."}</p>
                    <button onClick={() => fetchLoanDetail(activeLoan)} className="mt-2 bg-orange-500 text-white font-bold text-xs px-3 py-1.5 rounded hover:bg-orange-600">
                      → Provide Information
                    </button>
                  </div>
                )}

                <div className="flex gap-2 flex-wrap">
                  <button onClick={() => fetchLoanDetail(activeLoan)} className="bg-gray-100 text-gray-700 font-bold px-4 py-2 rounded-lg text-sm hover:bg-gray-200">View Details</button>
                  {["approved","disbursed","repaying"].includes(activeLoan.status) && (
                    <button onClick={() => { setSelectedLoan(activeLoan); setShowPayModal(true); }}
                      className="bg-emerald-600 text-white font-bold px-4 py-2 rounded-lg text-sm hover:bg-emerald-700">💳 Make Payment</button>
                  )}
                </div>
              </div>
            )}

            {/* Loan history */}
            <div>
              <h3 className="font-black text-gray-700 mb-3">Loan History</h3>
              {loans.length === 0 ? (
                <div className="bg-white border border-gray-200 rounded-xl p-8 text-center text-gray-400">
                  <p className="text-4xl mb-2">📋</p>
                  <p>No loan applications yet</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {loans.map(loan => (
                    <div key={loan.id} onClick={() => fetchLoanDetail(loan)}
                      className="bg-white border border-gray-200 rounded-xl p-4 cursor-pointer hover:border-emerald-400 hover:shadow-sm transition-all flex justify-between items-center">
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <p className="font-black text-gray-800">KES {loan.amount?.toLocaleString()}</p>
                          <span className={`text-xs px-2 py-0.5 rounded-full font-bold border ${STATUS_CONFIG[loan.status]?.color}`}>
                            {STATUS_CONFIG[loan.status]?.icon} {STATUS_CONFIG[loan.status]?.label}
                          </span>
                        </div>
                        <p className="text-sm text-gray-500">{loan.loan_type} · {loan.purpose}</p>
                        {loan.status === "rejected" && loan.admin_notes && (
                          <p className="text-xs text-red-600 mt-1 font-bold">Reason: {loan.admin_notes}</p>
                        )}
                        {loan.status === "info_required" && loan.admin_notes && (
                          <p className="text-xs text-orange-600 mt-1">⚠️ {loan.admin_notes}</p>
                        )}
                        <p className="text-xs text-gray-400">{new Date(loan.created_at).toLocaleDateString()}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-xs text-gray-400">Balance</p>
                        <p className="font-black text-gray-700">KES {(loan.total_payable-loan.amount_repaid)?.toLocaleString()}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ═══════════════════════════════ APPLY ═══════════════════════════════ */}
        {view === "apply" && (
          <div>
            {/* Step indicator */}
            <div className="flex items-center mb-8 overflow-x-auto pb-2">
              {STEPS.map((s,i) => (
                <div key={i} className="flex items-center flex-shrink-0">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-black transition-all
                    ${i < step ? "bg-emerald-500 text-white" : i === step ? "bg-gray-900 text-white" : "bg-gray-200 text-gray-400"}`}>
                    {i < step ? "✓" : i+1}
                  </div>
                  <span className={`ml-2 text-xs font-semibold hidden md:block ${i===step?"text-gray-900":"text-gray-400"}`}>{s}</span>
                  {i < STEPS.length-1 && <div className={`w-6 md:w-10 h-0.5 mx-2 ${i < step ? "bg-emerald-500":"bg-gray-200"}`} />}
                </div>
              ))}
            </div>

            {/* STEP 0: Loan Type */}
            {step === 0 && (
              <div>
                <h2 className="text-xl font-black text-gray-800 mb-4">Select Loan Type</h2>
                {loanTypes.length === 0 ? (
                  <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-6 text-center text-yellow-700">
                    No loan types configured yet. Contact HR/Admin.
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {loanTypes.map(lt => (
                      <div key={lt.id} onClick={() => { setSelectedType(lt); setTermsAccepted(false); setStep(1); }}
                        className="border-2 rounded-xl p-5 cursor-pointer transition-all hover:shadow-md bg-white border-gray-200 hover:border-emerald-300">
                        <h3 className="font-black text-gray-800 text-lg">{lt.name}</h3>
                        <p className="text-gray-500 text-sm mt-1">{lt.description}</p>
                        <div className="mt-4 space-y-1 text-sm">
                          <div className="flex justify-between"><span className="text-gray-400">Interest</span><span className="font-bold text-emerald-700">{lt.interest_rate}% p.a.</span></div>
                          <div className="flex justify-between"><span className="text-gray-400">Min</span><span className="font-bold">KES {lt.min_amount?.toLocaleString()}</span></div>
                          <div className="flex justify-between"><span className="text-gray-400">Max</span><span className="font-bold">KES {lt.max_amount?.toLocaleString()}</span></div>
                          <div className="flex justify-between"><span className="text-gray-400">Term</span><span className="font-bold">{lt.min_months}–{lt.max_months} months</span></div>
                          {lt.penalty_rate != null && (
                            <div className="flex justify-between"><span className="text-gray-400">Late penalty</span><span className="font-bold text-red-600">{lt.penalty_rate}%</span></div>
                          )}
                        </div>
                        {lt.terms_file && (
                          <a href={lt.terms_file} target="_blank" rel="noreferrer"
                            onClick={e => e.stopPropagation()}
                            className="mt-3 flex items-center gap-1 text-xs text-blue-600 hover:underline font-bold">
                            📄 View Terms & Conditions
                          </a>
                        )}
                        <div className="mt-3 bg-emerald-50 border border-emerald-200 rounded-lg py-1 text-center text-xs text-emerald-700 font-bold">
                          Select this type →
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* STEP 1: Terms & Conditions */}
            {step === 1 && selectedType && (
              <div className="max-w-2xl">
                <h2 className="text-xl font-black text-gray-800 mb-1">Terms & Conditions</h2>
                <p className="text-gray-500 text-sm mb-4">
                  Please read and accept the terms for <span className="font-bold text-gray-700">{selectedType.name}</span>.
                </p>

                <div className="bg-white border border-gray-200 rounded-xl p-5 mb-4">
                  {selectedType.terms_file ? (
                    <>
                      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
                        <p className="text-blue-700 font-bold text-sm mb-2">📄 Official Terms & Conditions Document</p>
                        <p className="text-blue-600 text-xs mb-3">You must read the full terms before proceeding with your application.</p>
                        <a href={selectedType.terms_file} target="_blank" rel="noreferrer"
                          className="inline-flex items-center gap-2 bg-blue-600 text-white font-bold px-4 py-2 rounded-lg text-sm hover:bg-blue-700">
                          📖 Open Terms & Conditions
                        </a>
                      </div>
                    </>
                  ) : (
                    <div className="bg-gray-50 rounded-lg p-4 mb-4 text-sm text-gray-600">
                      <p className="font-bold text-gray-800 mb-2">Standard SACCO Loan Terms — {selectedType.name}</p>
                      <ul className="space-y-1.5 text-xs">
                        <li>• Loan amount: KES {selectedType.min_amount?.toLocaleString()} – KES {selectedType.max_amount?.toLocaleString()}</li>
                        <li>• Interest rate: {selectedType.interest_rate}% per annum, calculated on reducing balance</li>
                        <li>• Repayment period: {selectedType.min_months} – {selectedType.max_months} months</li>
                        {selectedType.penalty_rate != null && (
                          <li>• Late payment penalty: {selectedType.penalty_rate}% of outstanding installment</li>
                        )}
                        {selectedType.grace_period_days != null && (
                          <li>• Grace period: {selectedType.grace_period_days} days before penalty applies</li>
                        )}
                        {selectedType.penalty_description && <li>• {selectedType.penalty_description}</li>}
                        <li>• 2–3 guarantors required from active SACCO members</li>
                        <li>• Loan proceeds will be disbursed after admin approval</li>
                        <li>• Defaulting may result in guarantors becoming liable</li>
                        <li>• SACCO reserves the right to deduct repayments from member savings</li>
                      </ul>
                    </div>
                  )}

                  <label className="flex items-start gap-3 cursor-pointer mt-4">
                    <input type="checkbox" checked={termsAccepted} onChange={e => setTermsAccepted(e.target.checked)}
                      className="mt-0.5 w-5 h-5 rounded accent-emerald-600 flex-shrink-0" />
                    <span className="text-sm text-gray-700">
                      I have read and understood the Terms & Conditions for <strong>{selectedType.name}</strong>.
                      I agree to abide by all terms and understand the penalty structure for missed payments.
                    </span>
                  </label>
                </div>

                <div className="flex gap-3">
                  <button onClick={() => setStep(0)} className="bg-gray-100 text-gray-700 font-bold px-6 py-3 rounded-lg hover:bg-gray-200">← Back</button>
                  <button onClick={() => {
                    if (!termsAccepted) return showToast("You must accept the terms to continue", "error");
                    setStep(2);
                  }} className="bg-gray-900 text-white font-black px-6 py-3 rounded-lg hover:bg-gray-800">
                    Accept & Continue →
                  </button>
                </div>
              </div>
            )}

            {/* STEP 2: Loan Details */}
            {step === 2 && selectedType && (
              <div className="max-w-2xl">
                <h2 className="text-xl font-black text-gray-800 mb-1">Loan Details</h2>
                <p className="text-gray-400 text-sm mb-6">
                  Type: <span className="font-bold text-gray-700">{selectedType.name}</span> ·
                  Rate: <span className="font-bold text-emerald-600">{selectedType.interest_rate}% p.a.</span>
                </p>

                <div className="space-y-4 bg-white border border-gray-200 rounded-xl p-6 mb-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-xs text-gray-700 uppercase tracking-widest mb-1 block font-bold">
                        Loan Amount (KES) <span className="text-red-500">*</span>
                      </label>
                      <input type="number" placeholder={`${selectedType.min_amount}–${selectedType.max_amount}`}
                        value={form.amount} onChange={e => setForm({...form, amount:e.target.value})}
                        min={selectedType.min_amount} max={selectedType.max_amount}
                        className={inp} />
                    </div>
                    <div>
                      <label className="text-xs text-gray-700 uppercase tracking-widest mb-1 block font-bold">
                        Repayment Period (Months) <span className="text-red-500">*</span>
                      </label>
                      <input type="number" placeholder={`${selectedType.min_months}–${selectedType.max_months}`}
                        value={form.repayment_months} onChange={e => setForm({...form, repayment_months:e.target.value})}
                        min={selectedType.min_months} max={selectedType.max_months}
                        className={inp} />
                    </div>
                  </div>
                  <div>
                    <label className="text-xs text-gray-700 uppercase tracking-widest mb-1 block font-bold">
                      Purpose / Reason <span className="text-red-500">*</span>
                    </label>
                    <textarea placeholder="Explain what this loan will be used for..."
                      value={form.purpose} onChange={e => setForm({...form, purpose:e.target.value})} rows={3}
                      className={textArea} />
                  </div>
                  <div>
                    <label className="text-xs text-gray-700 uppercase tracking-widest mb-1 block font-bold">
                      Link to Matatu (optional)
                    </label>
                    <select value={form.matatu_id} onChange={e => setForm({...form, matatu_id:e.target.value})}
                      className={inp}>
                      <option value="">Not linked to a matatu</option>
                      {matatus.map(m => <option key={m.id} value={m.id}>{m.plate}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs text-gray-700 uppercase tracking-widest mb-1 block font-bold">
                      Supporting Documents (optional)
                    </label>
                    <input type="file" accept="image/*,.pdf"
                      onChange={e => setForm({...form, supporting_doc:e.target.files[0]})}
                      className="w-full border border-gray-300 rounded-lg p-3 text-sm bg-white text-gray-700 file:mr-3 file:bg-emerald-600 file:text-white file:border-0 file:rounded file:px-3 file:py-1 file:font-bold file:text-xs" />
                  </div>
                </div>

                {/* Calculations */}
                {calc && (
                  <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-5 mb-4">
                    <h4 className="font-black text-emerald-800 mb-3">📊 Loan Calculations</h4>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                      {[
                        ["Principal",       `KES ${parseFloat(form.amount)?.toLocaleString()}`],
                        ["Interest",        `KES ${parseFloat(calc.totalInterest)?.toLocaleString()}`],
                        ["Total Payable",   `KES ${parseFloat(calc.totalPayable)?.toLocaleString()}`],
                        ["Monthly Payment", `KES ${parseFloat(calc.monthly)?.toLocaleString()}`],
                      ].map(([l,v],i) => (
                        <div key={i} className="bg-white rounded-lg p-3 text-center">
                          <p className="text-xs text-gray-400">{l}</p>
                          <p className="font-black text-emerald-700 text-sm">{v}</p>
                        </div>
                      ))}
                    </div>
                    {selectedType.penalty_rate != null && (
                      <p className="text-xs text-red-600 mt-3 font-semibold">
                        ⚠️ Late payment penalty: {selectedType.penalty_rate}% per missed installment
                        {selectedType.grace_period_days ? ` (after ${selectedType.grace_period_days}-day grace period)` : ""}
                      </p>
                    )}
                  </div>
                )}

                <div className="flex gap-3">
                  <button onClick={() => setStep(1)} className="bg-gray-100 text-gray-700 font-bold px-6 py-3 rounded-lg hover:bg-gray-200">← Back</button>
                  <button onClick={() => {
                    if (!form.amount || !form.repayment_months || !form.purpose) return showToast("Please fill all required fields", "error");
                    setStep(3);
                  }} className="bg-gray-900 text-white font-black px-6 py-3 rounded-lg hover:bg-gray-800">
                    Next: Add Guarantors →
                  </button>
                </div>
              </div>
            )}

            {/* STEP 3: Guarantors */}
            {step === 3 && (
              <div className="max-w-2xl">
                <h2 className="text-xl font-black text-gray-800 mb-1">Select Guarantors</h2>
                <p className="text-gray-400 text-sm mb-6">Add 2–3 active SACCO members as guarantors. They must accept before your loan is reviewed.</p>

                {/* Loan summary */}
                <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 mb-6">
                  <h4 className="font-bold text-gray-600 text-xs uppercase tracking-widest mb-3">Loan Summary</h4>
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div><span className="text-gray-400">Type:</span> <span className="font-bold">{selectedType?.name}</span></div>
                    <div><span className="text-gray-400">Amount:</span> <span className="font-bold">KES {parseFloat(form.amount)?.toLocaleString()}</span></div>
                    <div><span className="text-gray-400">Monthly:</span> <span className="font-bold text-emerald-600">KES {parseFloat(calc?.monthly)?.toLocaleString()}</span></div>
                    <div><span className="text-gray-400">Total:</span> <span className="font-bold">KES {parseFloat(calc?.totalPayable)?.toLocaleString()}</span></div>
                    <div className="col-span-2"><span className="text-gray-400">Purpose:</span> <span className="font-medium">{form.purpose}</span></div>
                  </div>
                </div>

                <div className="bg-white border border-gray-200 rounded-xl p-5 mb-4">
                  <h4 className="font-black text-gray-700 mb-3">Add Guarantors ({form.guarantor_ids.length}/3)</h4>
                  <div className="relative mb-4">
                    <input type="text" placeholder="Search member by name or membership no..."
                      value={guarantorSearch}
                      onChange={e => { setGuarantorSearch(e.target.value); setShowGuarantorDrop(true); }}
                      onFocus={() => setShowGuarantorDrop(true)}
                      className={inp} />
                    {showGuarantorDrop && guarantorSearch && (
                      <div className="absolute z-50 bg-white border border-gray-200 w-full max-h-48 overflow-y-auto shadow-lg rounded-lg mt-1">
                        {filteredMembers.filter(m => !form.guarantor_ids.includes(m.id)).length > 0
                          ? filteredMembers.filter(m => !form.guarantor_ids.includes(m.id)).map(m => (
                            <div key={m.id} onClick={() => addGuarantor(m)}
                              className="p-3 hover:bg-emerald-50 cursor-pointer border-b border-gray-100">
                              <p className="font-bold text-sm text-gray-800">{m.name}</p>
                              <p className="text-xs text-gray-400">{m.membership_no} · <span className="capitalize">{m.role}</span></p>
                            </div>
                          ))
                          : <p className="p-3 text-gray-400 text-sm">No members found</p>
                        }
                      </div>
                    )}
                  </div>

                  {form.guarantor_ids.length === 0 ? (
                    <p className="text-gray-400 text-sm text-center py-4">No guarantors added yet (minimum 2 required)</p>
                  ) : (
                    <div className="space-y-2">
                      {form.guarantor_ids.map(id => {
                        const m = getMember(id);
                        return m ? (
                          <div key={id} className="flex justify-between items-center p-3 bg-emerald-50 rounded-lg border border-emerald-200">
                            <div>
                              <p className="font-bold text-sm text-gray-800">{m.name}</p>
                              <p className="text-xs text-gray-400">{m.membership_no} · <span className="capitalize">{m.role}</span></p>
                            </div>
                            <button onClick={() => removeGuarantor(id)} className="text-red-500 hover:text-red-700 text-xs font-bold">Remove</button>
                          </div>
                        ) : null;
                      })}
                    </div>
                  )}
                </div>

                <div className="flex gap-3">
                  <button onClick={() => setStep(2)} className="bg-gray-100 text-gray-700 font-bold px-6 py-3 rounded-lg hover:bg-gray-200">← Back</button>
                  <button onClick={() => {
                    if (form.guarantor_ids.length < 2) return showToast("Minimum 2 guarantors required", "error");
                    setStep(4);
                  }} className="bg-gray-900 text-white font-black px-6 py-3 rounded-lg hover:bg-gray-800">
                    Next: Review →
                  </button>
                </div>
              </div>
            )}

            {/* STEP 4: Review & Submit */}
            {step === 4 && (
              <div className="max-w-2xl">
                <h2 className="text-xl font-black text-gray-800 mb-6">Final Review & Submit</h2>
                <div className="space-y-4">
                  <div className="bg-white border border-gray-200 rounded-xl p-5">
                    <h4 className="font-black text-gray-600 text-xs uppercase tracking-widest mb-3">Loan Details</h4>
                    <div className="grid grid-cols-2 gap-3 text-sm">
                      <div><p className="text-gray-400">Loan Type</p><p className="font-black text-gray-800">{selectedType?.name}</p></div>
                      <div><p className="text-gray-400">Interest Rate</p><p className="font-black text-emerald-600">{selectedType?.interest_rate}% p.a.</p></div>
                      <div><p className="text-gray-400">Principal</p><p className="font-black text-gray-800">KES {parseFloat(form.amount)?.toLocaleString()}</p></div>
                      <div><p className="text-gray-400">Repayment Period</p><p className="font-black text-gray-800">{form.repayment_months} months</p></div>
                      <div><p className="text-gray-400">Monthly Installment</p><p className="font-black text-emerald-600">KES {parseFloat(calc?.monthly)?.toLocaleString()}</p></div>
                      <div><p className="text-gray-400">Total Payable</p><p className="font-black text-gray-800">KES {parseFloat(calc?.totalPayable)?.toLocaleString()}</p></div>
                      <div className="col-span-2"><p className="text-gray-400">Purpose</p><p className="font-medium text-gray-800">{form.purpose}</p></div>
                      {form.matatu_id && <div className="col-span-2"><p className="text-gray-400">Linked Matatu</p><p className="font-medium text-gray-800">{matatus.find(m => m.id == form.matatu_id)?.plate}</p></div>}
                    </div>
                  </div>

                  <div className="bg-white border border-gray-200 rounded-xl p-5">
                    <h4 className="font-black text-gray-600 text-xs uppercase tracking-widest mb-3">Guarantors ({form.guarantor_ids.length})</h4>
                    <div className="space-y-2">
                      {form.guarantor_ids.map(id => {
                        const m = getMember(id);
                        return m ? (
                          <div key={id} className="flex items-center gap-3 p-2 bg-gray-50 rounded">
                            <div className="w-8 h-8 rounded-full bg-emerald-100 flex items-center justify-center font-black text-emerald-700 text-sm">{m.name[0]}</div>
                            <div><p className="font-bold text-sm text-gray-800">{m.name}</p><p className="text-xs text-gray-400">{m.membership_no}</p></div>
                          </div>
                        ) : null;
                      })}
                    </div>
                  </div>

                  <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
                    <p className="text-amber-800 text-sm font-semibold">
                      ⚠️ By submitting, you confirm all information is accurate and you have read and accepted the Terms & Conditions.
                      Guarantors will be notified and must accept before admin review begins.
                    </p>
                  </div>
                </div>

                <div className="flex gap-3 mt-6">
                  <button onClick={() => setStep(3)} className="bg-gray-100 text-gray-700 font-bold px-6 py-3 rounded-lg hover:bg-gray-200">← Back</button>
                  <button onClick={submitApplication} disabled={loading}
                    className="flex-1 bg-emerald-600 text-white font-black px-6 py-3 rounded-lg hover:bg-emerald-700 disabled:opacity-50">
                    {loading ? "Submitting..." : "📨 Submit Loan Application"}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ═══════════════════════════════ DETAIL ══════════════════════════════ */}
        {view === "detail" && selectedLoan && (
          <div className="space-y-5">
            {/* Status header */}
            <div className="bg-white border border-gray-200 rounded-xl p-5">
              <div className="flex justify-between items-start mb-4 flex-wrap gap-3">
                <div>
                  <p className="text-gray-400 text-sm">{selectedLoan.loan_type}</p>
                  <p className="text-3xl font-black text-gray-900">KES {selectedLoan.amount?.toLocaleString()}</p>
                  <p className="text-gray-500 text-sm mt-1">{selectedLoan.purpose}</p>
                </div>
                <span className={`text-sm px-4 py-1.5 rounded-full font-bold border ${STATUS_CONFIG[selectedLoan.status]?.color}`}>
                  {STATUS_CONFIG[selectedLoan.status]?.icon} {STATUS_CONFIG[selectedLoan.status]?.label}
                </span>
              </div>

              {/* Rejection reason — prominent */}
              {selectedLoan.status === "rejected" && selectedLoan.admin_notes && (
                <div className="bg-red-50 border border-red-300 rounded-lg p-4 mb-4">
                  <p className="text-red-700 font-black text-sm mb-1">❌ Loan Rejected</p>
                  <p className="text-red-600 text-sm"><strong>Reason:</strong> {selectedLoan.admin_notes}</p>
                </div>
              )}

              {/* Admin notes for other statuses */}
              {selectedLoan.admin_notes && selectedLoan.status !== "rejected" && (
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-4">
                  <p className="text-xs text-blue-600 font-bold uppercase mb-1">Admin Notes</p>
                  <p className="text-blue-800 text-sm">{selectedLoan.admin_notes}</p>
                </div>
              )}

              {/* Info-required: borrower response form */}
              {selectedLoan.status === "info_required" && (
                <div className="bg-orange-50 border border-orange-300 rounded-lg p-4 mb-4">
                  <p className="text-orange-700 font-black text-sm mb-1">ℹ️ More Information Requested</p>
                  <p className="text-orange-600 text-xs mb-3">{selectedLoan.admin_notes}</p>
                  <label className="text-xs text-gray-700 uppercase tracking-widest mb-1 block font-bold">Your Response</label>
                  <textarea value={infoResponse} onChange={e => setInfoResponse(e.target.value)} rows={4}
                    placeholder="Provide the requested information here..."
                    className={`${textArea} mb-2`} />
                  <label className="text-xs text-gray-700 uppercase tracking-widest mb-1 block font-bold">Attach Document (optional)</label>
                  <input type="file" accept="image/*,.pdf"
                    onChange={e => setInfoDoc(e.target.files[0])}
                    className="w-full border border-gray-300 rounded-lg p-2 text-sm bg-white text-gray-700 file:mr-3 file:bg-orange-500 file:text-white file:border-0 file:rounded file:px-3 file:py-1 file:font-bold file:text-xs mb-3" />
                  <button onClick={sendInfoResponse} disabled={sendingInfo}
                    className="w-full bg-orange-500 text-white font-black py-2.5 rounded-lg hover:bg-orange-600 disabled:opacity-50">
                    {sendingInfo ? "Sending..." : "📤 Submit Response for Re-Review"}
                  </button>
                </div>
              )}

              {/* Loan financials */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                {[
                  ["Interest Rate", `${selectedLoan.interest_rate}% p.a.`],
                  ["Monthly Payment", `KES ${selectedLoan.monthly_installment?.toLocaleString()}`],
                  ["Total Payable", `KES ${selectedLoan.total_payable?.toLocaleString()}`],
                  ["Repayment Period", `${selectedLoan.repayment_months} months`],
                ].map(([l,v],i) => (
                  <div key={i} className="bg-gray-50 rounded-lg p-3">
                    <p className="text-gray-400 text-xs">{l}</p>
                    <p className="font-black text-gray-800 mt-0.5">{v}</p>
                  </div>
                ))}
              </div>

              {/* Repayment progress */}
              {["repaying","cleared","disbursed","approved"].includes(selectedLoan.status) && (
                <div className="mt-4">
                  <div className="flex justify-between text-xs text-gray-400 mb-1">
                    <span>Repaid: KES {selectedLoan.amount_repaid?.toLocaleString()}</span>
                    <span>Balance: KES {(selectedLoan.total_payable-selectedLoan.amount_repaid)?.toLocaleString()}</span>
                  </div>
                  <div className="w-full bg-gray-100 rounded-full h-3">
                    <div className="h-3 rounded-full bg-emerald-500 transition-all"
                      style={{ width:`${Math.min((selectedLoan.amount_repaid/selectedLoan.total_payable)*100,100)}%` }} />
                  </div>
                  {selectedLoan.penalty > 0 && (
                    <p className="text-xs text-red-600 mt-1 font-semibold">⚠️ Penalty: KES {selectedLoan.penalty?.toLocaleString()}</p>
                  )}
                </div>
              )}

              {["approved","disbursed","repaying"].includes(selectedLoan.status) && (
                <div className="flex gap-2 mt-4 flex-wrap">
                  <button onClick={() => setShowPayModal(true)}
                    className="bg-emerald-600 text-white font-black px-6 py-2.5 rounded-lg hover:bg-emerald-700">
                    💳 Make Repayment
                  </button>
                  <button onClick={() => setShowRepaymentAccount(true)}
                    className="bg-blue-600 text-white font-black px-6 py-2.5 rounded-lg hover:bg-blue-700">
                    🏦 Repayment Account
                  </button>
                </div>
              )}
            </div>

            {/* DISBURSEMENT PROOF — visible to borrower */}
            {selectedLoan.disburse_proof && (
              <div className="bg-white border border-gray-200 rounded-xl p-5">
                <h3 className="font-black text-gray-700 mb-3">💸 Disbursement Confirmation</h3>
                <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                  <p className="text-green-700 font-bold text-sm mb-1">✅ Loan Disbursed</p>
                  {selectedLoan.disburse_note && (
                    <p className="text-green-600 text-sm mb-3">{selectedLoan.disburse_note}</p>
                  )}
                  <a href={selectedLoan.disburse_proof} target="_blank" rel="noreferrer"
                    className="inline-flex items-center gap-2 bg-green-600 text-white font-bold px-4 py-2 rounded-lg text-sm hover:bg-green-700">
                    📎 View Disbursement Proof
                  </a>
                </div>
              </div>
            )}

            {/* Repayment schedule */}
            {selectedLoan.schedule?.length > 0 && (
              <div className="bg-white border border-gray-200 rounded-xl p-5">
                <h3 className="font-black text-gray-700 mb-3">Repayment Schedule</h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead><tr className="border-b border-gray-100">
                      {["#","Due Date","Amount Due","Paid","Status"].map(h => (
                        <th key={h} className="text-left p-2 text-gray-400 font-semibold text-xs">{h}</th>
                      ))}
                    </tr></thead>
                    <tbody>
                      {selectedLoan.schedule.map(s => (
                        <tr key={s.id} className="border-b border-gray-50 hover:bg-gray-50">
                          <td className="p-2 text-gray-400">{s.installment_no}</td>
                          <td className="p-2 font-medium text-gray-800">{s.due_date}</td>
                          <td className="p-2 font-bold text-gray-800">KES {s.amount_due?.toLocaleString()}</td>
                          <td className="p-2 text-emerald-600 font-bold">KES {s.amount_paid?.toLocaleString()}</td>
                          <td className="p-2">
                            <span className={`text-xs px-2 py-0.5 rounded-full font-bold ${
                              s.status === "paid"   ? "bg-green-100 text-green-700" :
                              s.status === "overdue"? "bg-red-100 text-red-700" :
                              "bg-gray-100 text-gray-600"
                            }`}>{s.status}</span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Payment history */}
            <div className="bg-white border border-gray-200 rounded-xl p-5">
              <h3 className="font-black text-gray-700 mb-3">Payment History</h3>
              {loanPayments.length === 0 ? (
                <p className="text-gray-400 text-sm text-center py-4">No payments made yet</p>
              ) : (
                <div className="space-y-2">
                  {loanPayments.map(p => (
                    <div key={p.id} className="flex justify-between items-center p-3 bg-gray-50 rounded-lg border border-gray-100">
                      <div>
                        <p className="font-black text-emerald-600">KES {p.amount?.toLocaleString()}</p>
                        <p className="text-xs text-gray-400">{p.date} · {p.payment_method}{p.mpesa_code && ` · ${p.mpesa_code}`}</p>
                      </div>
                      {p.proof_file && (
                        <a href={p.proof_file} target="_blank" rel="noreferrer"
                          className="text-xs bg-white border border-gray-200 text-gray-600 px-3 py-1 rounded hover:bg-gray-100">
                          📎 Proof
                        </a>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Guarantors */}
            {selectedLoan.guarantors?.length > 0 && (
              <div className="bg-white border border-gray-200 rounded-xl p-5">
                <h3 className="font-black text-gray-700 mb-3">Guarantors</h3>
                <div className="space-y-2">
                  {selectedLoan.guarantors.map(g => {
                    const m = getMember(g.guarantor_id);
                    return (
                      <div key={g.id} className="flex justify-between items-center p-3 bg-gray-50 rounded-lg">
                        <div>
                          <p className="font-bold text-sm text-gray-800">{m?.name || `Member #${g.guarantor_id}`}</p>
                          <p className="text-xs text-gray-400">{m?.membership_no}</p>
                        </div>
                        <span className={`text-xs px-2 py-0.5 rounded-full font-bold ${
                          g.status==="accepted"?"bg-green-100 text-green-700":
                          g.status==="rejected"?"bg-red-100 text-red-700":
                          "bg-yellow-100 text-yellow-700"
                        }`}>{g.status}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Supporting doc */}
            {selectedLoan.supporting_doc && (
              <div className="bg-white border border-gray-200 rounded-xl p-5">
                <h3 className="font-black text-gray-700 mb-3">Supporting Document</h3>
                <a href={selectedLoan.supporting_doc} target="_blank" rel="noreferrer"
                  className="inline-flex items-center gap-2 bg-blue-50 border border-blue-200 text-blue-700 font-bold px-4 py-2 rounded-lg hover:bg-blue-100">
                  📎 View Document
                </a>
              </div>
            )}
          </div>
        )}

        {/* ═══════════════════════════════ GUARANTORS ══════════════════════════ */}
        {view === "guarantors" && (
          <div className="space-y-4">
            {guarantorRequests.length === 0 ? (
              <div className="bg-white border border-gray-200 rounded-xl p-8 text-center text-gray-400">
                <p className="text-4xl mb-2">🤝</p><p>No pending guarantor requests</p>
              </div>
            ) : guarantorRequests.map(g => (
              <div key={g.id} className="bg-white border border-gray-200 rounded-xl p-5">
                <div className="flex justify-between items-start mb-3">
                  <div>
                    <h3 className="font-black text-gray-800">{g.member_name} is requesting you as a guarantor</h3>
                    <p className="text-gray-400 text-sm">{g.membership_no}</p>
                  </div>
                  <span className="text-xs text-gray-400">{new Date(g.created_at).toLocaleDateString()}</span>
                </div>
                <div className="bg-gray-50 rounded-lg p-3 mb-4 text-sm">
                  <div className="grid grid-cols-2 gap-2">
                    <div><span className="text-gray-400">Loan Amount: </span><span className="font-black text-gray-800">KES {g.loan_amount?.toLocaleString()}</span></div>
                    <div className="col-span-2"><span className="text-gray-400">Purpose: </span><span className="font-medium text-gray-800">{g.loan_purpose}</span></div>
                  </div>
                </div>
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mb-4">
                  <p className="text-amber-800 text-xs font-semibold">⚠️ As a guarantor you are liable if this member defaults on this loan.</p>
                </div>
                <div className="flex gap-3">
                  <button onClick={() => respondToGuarantor(g.id, "accepted")}
                    className="flex-1 bg-emerald-600 text-white font-black py-2.5 rounded-lg hover:bg-emerald-700">✅ Accept</button>
                  <button onClick={() => respondToGuarantor(g.id, "rejected")}
                    className="flex-1 bg-red-100 text-red-700 font-black py-2.5 rounded-lg hover:bg-red-200">❌ Reject</button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ═══════════════════════════ GUARANTOR HISTORY ═══════════════════════ */}
        {view === "guarantorHistory" && (
          <div className="space-y-4">
            <p className="text-gray-500 text-sm">All guarantor requests you have received — permanently visible regardless of status.</p>
            {guarantorHistory.length === 0 ? (
              <div className="bg-white border border-gray-200 rounded-xl p-8 text-center text-gray-400">
                <p className="text-4xl mb-2">🤝</p><p>No guarantor history yet</p>
              </div>
            ) : guarantorHistory.map(g => (
              <div key={g.id} className={`bg-white border rounded-xl p-5 ${
                g.status==="accepted"?"border-green-300":g.status==="rejected"?"border-red-200":"border-yellow-300"
              }`}>
                <div className="flex justify-between items-start mb-3 flex-wrap gap-2">
                  <div>
                    <p className="font-black text-gray-800">{g.member_name}</p>
                    <p className="text-xs text-gray-400">{g.membership_no} · {g.loan_type}</p>
                  </div>
                  <div className="flex gap-2 items-center">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-bold ${(GUARANTEE_STATUS[g.status]||{}).color}`}>
                      {(GUARANTEE_STATUS[g.status]||{}).icon} {g.status}
                    </span>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-bold ${STATUS_CONFIG[g.loan_status]?.color||"bg-gray-100 text-gray-600"}`}>
                      Loan: {g.loan_status?.replace(/_/g," ")}
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3 text-sm mb-3">
                  <div className="bg-gray-50 rounded-lg p-3">
                    <p className="text-xs text-gray-400">Loan Amount</p>
                    <p className="font-black text-gray-800">KES {g.loan_amount?.toLocaleString()}</p>
                  </div>
                  <div className="bg-gray-50 rounded-lg p-3">
                    <p className="text-xs text-gray-400">Purpose</p>
                    <p className="font-medium text-gray-700 text-xs truncate">{g.loan_purpose}</p>
                  </div>
                </div>

                {g.status === "accepted" && (
                  <div className="bg-green-50 border border-green-200 rounded-lg p-3 text-xs">
                    <p className="text-green-700 font-black mb-1">✅ You are an active guarantor for this loan</p>
                    <div className="flex gap-4 text-gray-600">
                      <span>Repaid: <span className="font-bold text-green-600">KES {g.amount_repaid?.toLocaleString()}</span></span>
                      <span>Outstanding: <span className="font-bold text-red-600">KES {((g.total_payable||0)-(g.amount_repaid||0)).toLocaleString()}</span></span>
                    </div>
                  </div>
                )}

                <p className="text-xs text-gray-400 mt-2">
                  Requested: {new Date(g.created_at).toLocaleDateString()}
                  {g.responded_at && ` · Responded: ${new Date(g.responded_at).toLocaleDateString()}`}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ══════════════════════ PAYMENT MODAL ══════════════════════ */}
      {showPayModal && selectedLoan && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
            <div className="flex justify-between items-center mb-4">
              <h3 className="font-black text-gray-900">Make Repayment</h3>
              <button onClick={() => setShowPayModal(false)} className="text-gray-400 hover:text-gray-700 text-xl">✕</button>
            </div>
            <div className="bg-gray-50 rounded-xl p-4 mb-4">
              <div className="flex justify-between text-sm">
                <span className="text-gray-400">Outstanding Balance</span>
                <span className="font-black text-red-600">KES {(selectedLoan.total_payable-selectedLoan.amount_repaid)?.toLocaleString()}</span>
              </div>
              <div className="flex justify-between text-sm mt-1">
                <span className="text-gray-400">Monthly Installment</span>
                <span className="font-black text-emerald-600">KES {selectedLoan.monthly_installment?.toLocaleString()}</span>
              </div>
            </div>
            <div className="space-y-3 mb-4">
              <div>
                <label className="text-xs text-gray-700 uppercase tracking-widest mb-1 block font-bold">Amount (KES)</label>
                <input type="number" placeholder="Amount to pay" value={payForm.amount}
                  onChange={e => setPayForm({...payForm,amount:e.target.value})} className={inp} />
              </div>
              <div>
                <label className="text-xs text-gray-700 uppercase tracking-widest mb-1 block font-bold">Payment Method</label>
                <select value={payForm.payment_method} onChange={e => setPayForm({...payForm,payment_method:e.target.value})} className={inp}>
                  <option value="cash">Cash</option>
                  <option value="mpesa">M-Pesa</option>
                  <option value="bank">Bank Transfer</option>
                </select>
              </div>
              {payForm.payment_method === "mpesa" && (
                <div>
                  <label className="text-xs text-gray-700 uppercase tracking-widest mb-1 block font-bold">M-Pesa Code</label>
                  <input placeholder="e.g. QHJ7KL..." value={payForm.mpesa_code}
                    onChange={e => setPayForm({...payForm,mpesa_code:e.target.value})} className={inp} />
                </div>
              )}
              <div>
                <label className="text-xs text-gray-700 uppercase tracking-widest mb-1 block font-bold">Date</label>
                <input type="date" value={payForm.date} onChange={e => setPayForm({...payForm,date:e.target.value})} className={inp} />
              </div>
              <div>
                <label className="text-xs text-gray-700 uppercase tracking-widest mb-1 block font-bold">Proof of Payment (optional)</label>
                <input type="file" accept="image/*,.pdf"
                  onChange={e => setPayForm({...payForm,proof_file:e.target.files[0]})}
                  className="w-full border border-gray-300 rounded-lg p-3 text-sm bg-white text-gray-700 file:mr-3 file:bg-emerald-600 file:text-white file:border-0 file:rounded file:px-3 file:py-1 file:font-bold file:text-xs" />
              </div>
            </div>
            <div className="flex gap-3">
              <button onClick={makePayment} disabled={loading}
                className="flex-1 bg-emerald-600 text-white font-black py-3 rounded-lg hover:bg-emerald-700 disabled:opacity-50">
                {loading ? "Processing..." : "✅ Confirm Payment"}
              </button>
              <button onClick={() => setShowPayModal(false)}
                className="flex-1 bg-gray-100 text-gray-700 font-bold py-3 rounded-lg hover:bg-gray-200">Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* Repayment account modal */}
      {showRepaymentAccount && selectedLoan && (
        <RepaymentAccount loan={selectedLoan} onClose={() => setShowRepaymentAccount(false)} />
      )}
    </div>
  );
}