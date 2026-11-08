import { useState, useEffect } from "react";
import API from "../api";
import { useAuth } from "../context/AuthContext";
import RepaymentAccount from "./RepaymentAccount";
import MemberStatement from "./MemberStatement";
import LoanRequirements from "./LoanRequirements";
import LoanSecurity from "./LoanSecurity";

const tok = () => localStorage.getItem("token");
const hdr = (json = true) => ({
  Authorization: `Bearer ${tok()}`,
  ...(json ? { "Content-Type": "application/json" } : {}),
});
const authGet = (url) =>
  fetch(`${API}${url}`, { headers: hdr() }).then(r => r.ok ? r.json() : []);
const authPost = (url, body) => fetch(`${API}${url}`, { method: "POST", headers: hdr(), body: JSON.stringify(body) });
const authPut  = (url, body) => fetch(`${API}${url}`, { method: "PUT",  headers: hdr(), body: body ? JSON.stringify(body) : undefined });

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
  requirements_pending: { color: "bg-amber-100 text-amber-800 border-amber-200", icon: "📄", label: "Submit Requirements" },
  hr_approved:          { color: "bg-blue-100 text-blue-800 border-blue-200",   icon: "🔎", label: "Awaiting Admin" },
};

const STEPS = ["Loan Type", "Terms & Conditions", "Loan Details", "Guarantors", "Submit"];

const inp = "w-full border border-gray-300 rounded-lg p-3 text-sm outline-none focus:border-emerald-500 bg-white text-gray-900 placeholder-gray-400 font-bold";
const textArea = `${inp} resize-none`;

const isPreexistingLoan = (loan) => {
  if (!loan) return false;
  return Boolean(
    loan.is_existing ||
    loan.is_existing_loan ||
    loan.is_preexisting ||
    loan.onboarded_by_hr ||
    loan.purpose?.toLowerCase().includes("existing loan") ||
    loan.purpose?.toLowerCase().includes("onboarded")
  );
};

function Toast({ msg, type, onClose }) {
  useEffect(() => { const t = setTimeout(onClose, 4000); return () => clearTimeout(t); }, [onClose]);
  return (
    <div className={`fixed top-5 right-5 z-[300] px-5 py-3 rounded-xl shadow-2xl text-sm font-bold max-w-sm
      ${type === "error" ? "bg-red-600 text-white" : "bg-emerald-600 text-white"}`}>
      {msg}
    </div>
  );
}

export default function LoanDashboard() {
  const { user } = useAuth();
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
  
  // Real-time Notifications
  const [notifications, setNotifications] = useState([]);
  const [showNotesDrop, setShowNotesDrop] = useState(false);

  // Apply & Config flows
  const [step, setStep]               = useState(0);
  const [selectedType, setSelectedType] = useState(null);
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [form, setForm]               = useState({
    name: "", amount: "", repayment_months: "", purpose: "",
    matatu_id: "", supporting_doc: null, guarantor_ids: [],
    interest_rate: "", min_amount: "", max_amount: "", min_months: "", max_months: "", description: "",
    repayment_frequency: "monthly", repayment_start_rule: "next_period",
    penalty_type: "percentage", penalty_amount: 5, penalty_frequency: "monthly", grace_period_days: 3
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

  useEffect(() => { fetchAll(); }, []);

  const fetchAll = async () => {
    await Promise.all([
      fetchLoans(), fetchLoanTypes(), fetchEligibility(),
      fetchGuarantorRequests(), fetchGuarantorHistory(),
      fetchMembers(), fetchMatatus(), fetchNotifications()
    ]);
  };

  const refreshSelected = async () => {
    await fetchAll();
    if (selectedLoan) {
      const myLoans = await authGet("/loan-applications/my");
      const u = Array.isArray(myLoans) ? myLoans.find(l => l.id === selectedLoan.id) : null;
      if (u) setSelectedLoan(u);
    }
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

  const fetchNotifications = async () => {
    const d = await authGet("/notifications/my");
    if (Array.isArray(d)) setNotifications(d);
  };

  const markNotificationRead = async (id) => {
    await authPut(`/notifications/${id}/read`);
    fetchNotifications();
  };

  const fetchLoanDetail = async (loan) => {
    setSelectedLoan(loan);
    const res = await fetch(`${API}/loan-payments/${loan.id}`, { headers: hdr() });
    if (res.ok) setLoanPayments(await res.json());
    setView("detail");
  };

  useEffect(() => {
    if (selectedType && form.amount && form.repayment_months) {
      const amount = parseFloat(form.amount);
      const periods = parseInt(form.repayment_months);
      const rate   = selectedType.interest_rate;
      
      let annualMultiplier = periods / 12;
      if (selectedType.repayment_frequency === "daily") annualMultiplier = periods / 365;
      if (selectedType.repayment_frequency === "weekly") annualMultiplier = periods / 52;

      const totalInterest = (amount * rate / 100) * annualMultiplier;
      const totalPayable  = amount + totalInterest;
      const singleInstallment = totalPayable / periods;

      setCalc({
        totalInterest: totalInterest.toFixed(2),
        totalPayable: totalPayable.toFixed(2),
        monthly: singleInstallment.toFixed(2),
        rate
      });
    } else {
      setCalc(null);
    }
  }, [form.amount, form.repayment_months, selectedType]);

  const handleFileUpload = async (ltId, file) => {
    if (!file) return;
    const fd = new FormData();
    fd.append("terms_file", file);
    setLoading(true);
    const res = await fetch(`${API}/loan-types/${ltId}/terms`, {
      method: "PUT",
      headers: { Authorization: `Bearer ${tok()}` },
      body: fd
    });
    setLoading(false);
    if (res.ok) {
      showToast("Terms & Conditions uploaded successfully ✓");
      fetchLoanTypes();
    } else {
      showToast("T&C Upload failed", "error");
    }
  };

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

  const respondToGuarantor = async (id, status) => {
    const res = await fetch(`${API}/guarantors/${id}/respond`, {
      method: "PUT", headers: hdr(), body: JSON.stringify({ status })
    });
    if (!res.ok) return showToast("Failed to record decision", "error");
    showToast(`Guarantor request ${status} ✓`);
    fetchGuarantorRequests(); 
    fetchGuarantorHistory();
    setView("dashboard");
  };

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
    showToast(`Payment recorded for approval! KES ${parseFloat(payForm.amount).toLocaleString()} ✓`);
    setShowPayModal(false);
    setPayForm({ amount:"", payment_method:"cash", mpesa_code:"", date:new Date().toISOString().split("T")[0], proof_file:null });
    fetchLoans();
  };

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
    refreshSelected();
  };

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
  
  const activeLoan    = loans.find(l => ["requirements_pending","approved","disbursed","repaying","defaulted"].includes(l.status));
  const totalBorrowed = loans.filter(l => l.status === "cleared").reduce((s,l) => s + l.amount, 0);

  const GUARANTEE_STATUS = {
    pending:  { color:"bg-yellow-100 text-yellow-800 border-yellow-300", icon:"⏳", label:"Pending" },
    accepted: { color:"bg-green-100 text-green-700 border-green-300",   icon:"✅", label:"Accepted" },
    rejected: { color:"bg-red-100 text-red-700 border-red-200",         icon:"❌", label:"Rejected" },
  };

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
            <h1 className="text-2xl font-black text-gray-900 font-bold">
              {view === "dashboard"      && "💼 Loan Dashboard"}
              {view === "apply"          && "📝 Apply for a Loan"}
              {view === "detail"         && `Loan #${selectedLoan?.id} Details`}
              {view === "guarantors"     && "🤝 Pending Guarantor Requests"}
              {view === "guarantorHistory" && "🤝 My Guarantor History"}
              {view === "adminLoanTypes"  && "⚙️ Manage Configure Loan Types"}
            </h1>
          </div>

          {view === "dashboard" && (
            <div className="flex gap-2 flex-wrap items-center">
              
              {/* Notifications Panel */}
              <div className="relative z-50">
                <button onClick={() => setShowNotesDrop(!showNotesDrop)}
                  className="bg-white border border-gray-300 text-slate-800 font-extrabold px-4 py-2 rounded-lg text-sm hover:bg-slate-100 flex items-center gap-1.5 relative shadow-sm">
                  🔔 Notifications
                  {notifications.filter(n => !n.is_read).length > 0 && (
                    <span className="absolute -top-1 -right-1 bg-red-600 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs animate-pulse font-black">
                      {notifications.filter(n => !n.is_read).length}
                    </span>
                  )}
                </button>
                
                {showNotesDrop && (
                   <div className="absolute left-0 mt-2 w-[calc(100vw-2rem)] sm:w-96 bg-white border border-gray-300 rounded-xl shadow-2xl z-[999] overflow-hidden flex flex-col">
                    <div className="bg-slate-100 border-b border-gray-200 p-3 flex justify-between items-center">
                      <span className="font-bold text-sm text-slate-900">In-App Alerts</span>
                      {notifications.filter(n => !n.is_read).length > 0 && (
                        <button onClick={async () => {
                          await authPut("/notifications/read-all");
                          fetchNotifications();
                        }} className="text-xs text-blue-700 font-bold hover:underline">Mark all read</button>
                      )}
                    </div>
                    <div className="overflow-y-auto flex-1 divide-y divide-gray-200 max-h-80">
                      {notifications.length === 0 ? (
                        <p className="p-8 text-center text-gray-500 text-sm font-semibold">No notifications yet</p>
                      ) : (
                        notifications.map(n => (
                          <div key={n.id} className={`p-4 transition-colors hover:bg-slate-50 flex flex-col gap-1.5 ${!n.is_read ? "bg-blue-50 border-l-4 border-blue-600" : "border-l-4 border-transparent"}`}>
                            <div className="flex justify-between items-start gap-2">
                              <span className="font-extrabold text-sm text-slate-900">{n.title}</span>
                              {!n.is_read && (
                                <button onClick={() => markNotificationRead(n.id)} className="text-xs text-blue-700 font-extrabold hover:underline whitespace-nowrap bg-blue-100 px-2 py-0.5 rounded">
                                  Mark Read
                                </button>
                              )}
                            </div>
                            <p className="text-sm text-slate-800 leading-relaxed font-semibold break-words">
                              {n.message}
                            </p>
                            <div className="flex justify-between items-center text-xs text-slate-500 mt-1 font-semibold">
                              <span className="bg-slate-100 px-2 py-0.5 rounded text-slate-700 font-bold">{n.sender_name}</span>
                              <span>{new Date(n.created_at).toLocaleDateString()}</span>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                )}
              </div>

              {["hr", "admin", "director"].includes(user?.role) && (
                <button onClick={() => { setView("adminLoanTypes"); setSelectedType(null); }}
                  className="bg-purple-600 text-white font-bold px-4 py-2 rounded-lg text-sm hover:bg-purple-700">
                  ⚙️ Admin: Rules Portal
                </button>
              )}
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

            {/* ACTION REQUIRED BANNER: POST-APPROVAL REQUIREMENTS */}
            {loans.some(l => l.status === "requirements_pending") && (
              <div className="bg-amber-50 border-2 border-amber-300 rounded-2xl p-5 shadow-sm flex items-center justify-between gap-4 flex-wrap">
                <div className="flex items-center gap-3">
                  <span className="text-3xl">📄</span>
                  <div>
                    <h4 className="font-black text-amber-900 text-base">Loan Approved – Post-Approval Requirements Pending</h4>
                    <p className="text-amber-800 text-xs font-semibold mt-0.5">
                      Your loan has been approved! Submit your signed loan form, insurance document, and bank charges reference to release the cheque.
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => {
                    const reqLoan = loans.find(l => l.status === "requirements_pending");
                    if (reqLoan) fetchLoanDetail(reqLoan);
                  }}
                  className="bg-amber-600 hover:bg-amber-700 text-white font-black text-xs px-4 py-2.5 rounded-lg shadow-sm"
                >
                  Submit Requirements →
                </button>
              </div>
            )}

            {/* ACTION REQUIRED BANNER: VEHICLE LOGBOOK SECURITY */}
            {(activeLoan?.security_status === "required" || loans.some(l => l.security_status === "required")) && (
              <div className="bg-red-50 border-2 border-red-300 rounded-2xl p-5 shadow-sm flex items-center justify-between gap-4 flex-wrap">
                <div className="flex items-center gap-3">
                  <span className="text-3xl">📘</span>
                  <div>
                    <h4 className="font-black text-red-900 text-base">Action Required: Additional Security (Logbook)</h4>
                    <p className="text-red-800 text-xs font-semibold mt-0.5">
                      SACCO administration has requested your vehicle logbook as additional security. Open the loan details to upload your copy.
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => {
                    const secLoan = loans.find(l => l.security_status === "required") || activeLoan;
                    if (secLoan) fetchLoanDetail(secLoan);
                  }}
                  className="bg-red-600 hover:bg-red-700 text-white font-black text-xs px-4 py-2.5 rounded-lg shadow-sm"
                >
                  Upload Logbook →
                </button>
              </div>
            )}

            {/* Eligibility Card */}
            {eligibility && (
              <div className={`rounded-xl p-5 border ${eligibility.eligible ? "bg-emerald-50 border-emerald-200" : "bg-red-50 border-red-200"}`}>
                <div className="flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-xl">{eligibility.eligible ? "✅" : "❌"}</span>
                      <h3 className="font-black text-gray-800 font-bold">{eligibility.eligible ? "You are eligible to apply" : "Currently not eligible"}</h3>
                    </div>
                    {eligibility.reasons?.length > 0 && (
                      <ul className="space-y-1">
                        {eligibility.reasons.map((r,i) => <li key={i} className="text-sm text-red-700">• {r}</li>)}
                      </ul>
                    )}
                  </div>
                  <div className="text-right ml-4 flex-shrink-0">
                    <p className="text-xs text-gray-500 mb-1 font-bold">Max Eligible Amount</p>
                    <p className="text-2xl font-black text-emerald-700 font-bold">KES {eligibility.max_eligible_amount?.toLocaleString()}</p>
                  </div>
                </div>
              </div>
            )}

            {/* Policy Rate Change Notice Card */}
            {activeLoan?.rate_change_pending && (
              <div className="bg-blue-50 border-2 border-blue-300 rounded-2xl p-5 shadow-lg space-y-4">
                <div className="flex items-center gap-2 text-blue-900 border-b border-blue-100 pb-2">
                  <span className="text-2xl">📢</span>
                  <h3 className="font-black text-base font-bold text-slate-800">Attention Required: Sacco Rate Modification Notice</h3>
                </div>
                <p className="text-sm text-slate-700 leading-relaxed font-semibold bg-white/75 p-4 rounded-xl border border-blue-200">
                  {activeLoan.rate_change_notes}
                </p>
                <div className="flex flex-wrap gap-2 pt-1">
                  <button
                    onClick={async () => {
                      if (!window.confirm("Do you agree to accept these revised terms and update your active schedules?")) return;
                      setLoading(true);
                      const res = await authPut(`/loan-applications/${activeLoan.id}/commitment`, { status: "agreed" });
                      setLoading(false);
                      if (res.ok) {
                        showToast("Commitment agreement accepted successfully ✓");
                        fetchAll();
                      } else {
                        showToast("Agreement action failed", "error");
                      }
                    }}
                    disabled={loading}
                    className="bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-xs font-black px-4 py-2.5 rounded-lg shadow-sm"
                  >
                    {loading ? "Processing..." : "✅ Agree & Accept New Terms"}
                  </button>
                  <button
                    onClick={async () => {
                      const reason = prompt("State your reason for declining these revised loan terms:");
                      if (reason === null) return;
                      setLoading(true);
                      const res = await authPut(`/loan-applications/${activeLoan.id}/commitment`, { status: "disagreed", reason });
                      setLoading(false);
                      if (res.ok) {
                        showToast("Decline notification sent back to HR/Admin ✓");
                        fetchAll();
                      } else {
                        showToast("Action failed", "error");
                      }
                    }}
                    disabled={loading}
                    className="bg-red-50 hover:bg-red-100 border border-red-200 text-red-700 text-xs font-black px-4 py-2.5 rounded-lg"
                  >
                    ❌ Disagree & Request Review
                  </button>
                </div>
              </div>
            )}

            {/* Stats Cards */}
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
                  <p className="font-black text-gray-800 text-sm mt-0.5 font-bold">{s.value}</p>
                </div>
              ))}
            </div>

            {/* Active Loan Progress Card */}
            {activeLoan && (
              <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm">
                <div className="flex justify-between items-start mb-4">
                  <div>
                    <h3 className="font-black text-gray-800 font-bold">Active Loan — {activeLoan.loan_type || "Standard Loan"}</h3>
                    <p className="text-gray-500 text-sm">{activeLoan.purpose}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`text-xs px-3 py-1 rounded-full font-bold border ${STATUS_CONFIG[activeLoan.status]?.color || "bg-blue-100 text-blue-800"}`}>
                      {STATUS_CONFIG[activeLoan.status]?.icon || "🔄"} {STATUS_CONFIG[activeLoan.status]?.label || activeLoan.status}
                    </span>
                    {isPreexistingLoan(activeLoan) && (
                      <span className="text-xs px-2.5 py-1 rounded-full font-bold bg-slate-100 text-slate-700 border border-slate-300">
                        Pre-existing
                      </span>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-4 mb-4 text-sm">
                  <div><p className="text-gray-400 text-xs font-semibold">Loan Amount</p><p className="font-black font-bold">KES {activeLoan.amount?.toLocaleString()}</p></div>
                  <div><p className="text-gray-400 text-xs font-semibold">Repaid</p><p className="font-black text-green-600 font-bold">KES {activeLoan.amount_repaid?.toLocaleString()}</p></div>
                  <div><p className="text-gray-400 text-xs font-semibold">Balance</p><p className="font-black text-red-600 font-bold">KES {(activeLoan.total_payable - activeLoan.amount_repaid)?.toLocaleString()}</p></div>
                </div>

                <div className="w-full bg-gray-100 rounded-full h-3 mb-4">
                  <div className="h-3 rounded-full bg-emerald-500 transition-all duration-700"
                    style={{ width: `${Math.min(((activeLoan.amount_repaid || 0) / (activeLoan.total_payable || 1)) * 100, 100)}%` }} />
                </div>

                <div className="flex gap-2 flex-wrap">
                  <button onClick={() => fetchLoanDetail(activeLoan)} className="bg-gray-100 text-gray-700 font-bold px-4 py-2 rounded-lg text-sm hover:bg-gray-200">
                    View Schedule & Logs
                  </button>

                  {/* Payment option only visible once funds are disbursed / in repayment */}
                  {["disbursed", "repaying", "defaulted"].includes(activeLoan.status) && (
                    <button onClick={() => { setSelectedLoan(activeLoan); setShowPayModal(true); }}
                      className="bg-emerald-600 text-white font-bold px-4 py-2 rounded-lg text-sm hover:bg-emerald-700">
                      💳 Make Payment
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* History Table */}
            <div>
              <h3 className="font-black text-gray-700 mb-3 font-bold">Loan History</h3>
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
                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                          <p className="font-black text-gray-800 font-bold">KES {loan.amount?.toLocaleString()}</p>
                          <span className={`text-xs px-2 py-0.5 rounded-full font-bold border ${STATUS_CONFIG[loan.status]?.color || "bg-gray-100 text-gray-700 border-gray-200"}`}>
                            {STATUS_CONFIG[loan.status]?.icon} {STATUS_CONFIG[loan.status]?.label || loan.status}
                          </span>
                        </div>
                        <p className="text-sm text-gray-500 font-semibold">{loan.loan_type} · {loan.purpose}</p>
                        <p className="text-xs text-gray-400 font-semibold">{new Date(loan.created_at).toLocaleDateString()}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-xs text-gray-400 font-bold">Balance</p>
                        <p className="font-black text-gray-700 font-bold">KES {(loan.total_payable - loan.amount_repaid)?.toLocaleString()}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ═══════════════════════════════ APPLY FLOW ═════════════════════════ */}
        {view === "apply" && (
          <div>
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

            {/* STEP 0: Select Loan Type */}
            {step === 0 && (
              <div>
                <h2 className="text-xl font-black text-gray-800 mb-4 font-bold">Select Loan Type</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {loanTypes.map(lt => (
                    <div key={lt.id} onClick={() => { setSelectedType(lt); setTermsAccepted(false); setStep(1); }}
                      className="border-2 rounded-xl p-5 cursor-pointer transition-all hover:shadow-md bg-white border-gray-200 hover:border-emerald-300">
                      <h3 className="font-black text-gray-800 text-lg font-bold">{lt.name}</h3>
                      <p className="text-gray-500 text-sm mt-1 font-semibold">{lt.description}</p>
                      <div className="mt-4 space-y-1.5 text-sm border-t border-gray-100 pt-3">
                        <div className="flex justify-between"><span className="text-gray-400 font-bold">Interest</span><span className="font-bold text-emerald-700">{lt.interest_rate}% p.a.</span></div>
                        <div className="flex justify-between"><span className="text-gray-400 font-bold">Limits</span><span className="font-bold">KES {lt.min_amount?.toLocaleString()} - {lt.max_amount?.toLocaleString()}</span></div>
                        <div className="flex justify-between"><span className="text-gray-400 font-bold">Frequencies</span><span className="font-bold capitalize">{lt.repayment_frequency || "monthly"}</span></div>
                        <div className="flex justify-between"><span className="text-gray-400 font-bold">Grace Period</span><span className="font-bold">{lt.grace_period_days || 3} Days</span></div>
                        <div className="flex justify-between">
                          <span className="text-gray-400 font-bold">Rule Type</span>
                          <span className="font-bold text-xs capitalize text-blue-600 font-extrabold">
                            {lt.repayment_start_rule === "same_day" ? "Same day as approval" : "Standard next period"}
                          </span>
                        </div>
                      </div>
                      <div className="mt-3 bg-emerald-50 border border-emerald-200 rounded-lg py-1.5 text-center text-xs text-emerald-700 font-bold">
                        Choose {lt.name} →
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* STEP 1: Terms & Conditions Document Verification */}
            {step === 1 && selectedType && (
              <div className="max-w-2xl">
                <h2 className="text-xl font-black text-gray-800 mb-1 font-bold">Terms & Conditions Agreement</h2>
                <p className="text-gray-500 text-sm mb-4">
                  Review the regulatory rules for <span className="font-bold text-gray-700">{selectedType.name}</span>.
                </p>

                <div className="bg-white border border-gray-200 rounded-xl p-5 mb-4">
                  {selectedType.terms_file ? (
                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
                      <p className="text-blue-700 font-bold text-sm mb-2">📄 Read Terms & Conditions Document</p>
                      <p className="text-blue-600 text-xs mb-3 font-semibold">An official document has been linked by HR. Open it below to read the complete rules.</p>
                      <a href={selectedType.terms_file} target="_blank" rel="noreferrer"
                        className="inline-flex items-center gap-2 bg-blue-600 text-white font-bold px-4 py-2 rounded-lg text-sm hover:bg-blue-700 shadow-sm">
                        📖 View Terms (PDF / Image)
                      </a>
                    </div>
                  ) : (
                    <div className="bg-gray-50 rounded-lg p-4 mb-4 text-sm text-gray-600 space-y-2">
                      <p className="font-bold text-gray-800">Dynamic Schedule Regulations</p>
                      <ul className="space-y-1 text-xs font-semibold">
                        <li>• Limits: KES {selectedType.min_amount?.toLocaleString()} – KES {selectedType.max_amount?.toLocaleString()}</li>
                        <li>• Repayment Frequency: Paid <span className="text-emerald-700 capitalize">{selectedType.repayment_frequency}</span></li>
                        <li>• Start Date Policy: {selectedType.repayment_start_rule === "same_day" ? "Schedules activate on the exact day of borrowing / approval" : "First payment occurs at the end of the first cycle"}</li>
                      </ul>
                    </div>
                  )}

                  <label className="flex items-start gap-3 cursor-pointer mt-4">
                    <input type="checkbox" checked={termsAccepted} onChange={e => setTermsAccepted(e.target.checked)}
                      className="mt-0.5 w-5 h-5 rounded accent-emerald-600 flex-shrink-0" />
                    <span className="text-sm text-gray-700 font-bold">
                      I confirm I have opened, read, and accepted all Terms & Conditions.
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

            {/* STEP 2: Application Details */}
            {step === 2 && selectedType && (
              <div className="max-w-2xl">
                <h2 className="text-xl font-black text-gray-800 mb-1 font-bold">Enter Application Details</h2>
                <p className="text-gray-400 text-sm mb-6 font-semibold">
                  Repayment Cycle: <span className="font-bold text-emerald-600 capitalize">{selectedType.repayment_frequency}</span>
                </p>

                <div className="space-y-4 bg-white border border-gray-200 rounded-xl p-6 mb-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-xs text-gray-700 uppercase tracking-widest mb-1 block font-bold">Requested Loan Amount (KES)</label>
                      <input type="number" placeholder={`${selectedType.min_amount}–${selectedType.max_amount}`}
                        value={form.amount} onChange={e => setForm({...form, amount:e.target.value})}
                        min={selectedType.min_amount} max={selectedType.max_amount} className={inp} />
                    </div>
                    <div>
                      <label className="text-xs text-gray-700 uppercase tracking-widest mb-1 block font-bold">Installments ({selectedType.repayment_frequency})</label>
                      <input type="number" placeholder={`${selectedType.min_months}–${selectedType.max_months}`}
                        value={form.repayment_months} onChange={e => setForm({...form, repayment_months:e.target.value})}
                        min={selectedType.min_months} max={selectedType.max_months} className={inp} />
                    </div>
                  </div>

                  <div>
                    <label className="text-xs text-gray-700 uppercase tracking-widest mb-1 block font-bold">Explanation / Purpose</label>
                    <textarea placeholder="Write reason for loan application..."
                      value={form.purpose} onChange={e => setForm({...form, purpose:e.target.value})} rows={3} className={textArea} />
                  </div>
                </div>

                {calc && (
                  <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-5 mb-4">
                    <h4 className="font-black text-emerald-800 mb-3 font-bold">📊 Schedule Preview Plan</h4>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                      {[
                        ["Principal",       `KES ${parseFloat(form.amount)?.toLocaleString()}`],
                        ["Interest",        `KES ${parseFloat(calc.totalInterest)?.toLocaleString()}`],
                        ["Total Payable",   `KES ${parseFloat(calc.totalPayable)?.toLocaleString()}`],
                        ["Per Installment", `KES ${parseFloat(calc.monthly)?.toLocaleString()}`],
                      ].map(([l,v],i) => (
                        <div key={i} className="bg-white rounded-lg p-3 text-center">
                          <p className="text-xs text-gray-400 font-bold">{l}</p>
                          <p className="font-black text-emerald-700 text-sm font-bold">{v}</p>
                        </div>
                      ))}
                    </div>
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

            {/* STEP 3: Add Guarantors */}
            {step === 3 && (
              <div className="max-w-2xl">
                <h2 className="text-xl font-black text-gray-800 mb-1 font-bold">Select Guarantors</h2>
                <p className="text-gray-400 text-sm mb-6 font-semibold">Assign 2–3 active SACCO members as guarantors.</p>

                <div className="bg-white border border-gray-200 rounded-xl p-5 mb-4">
                  <h4 className="font-black text-gray-700 mb-3 font-bold">Add Guarantors ({form.guarantor_ids.length}/3)</h4>
                  <div className="relative mb-4">
                    <input type="text" placeholder="Search by name or member ID..."
                      value={guarantorSearch}
                      onChange={e => { setGuarantorSearch(e.target.value); setShowGuarantorDrop(true); }}
                      className={inp} />
                    {showGuarantorDrop && guarantorSearch && (
                      <div className="absolute z-50 bg-white border border-gray-200 w-full max-h-48 overflow-y-auto shadow-lg rounded-lg mt-1">
                        {filteredMembers.filter(m => !form.guarantor_ids.includes(m.id)).map(m => (
                          <div key={m.id} onClick={() => addGuarantor(m)} className="p-3 hover:bg-emerald-50 cursor-pointer border-b border-gray-100">
                            <p className="font-bold text-sm text-gray-800 font-bold">{m.name}</p>
                            <p className="text-xs text-gray-400 font-semibold">{m.membership_no}</p>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="space-y-2">
                    {form.guarantor_ids.map(id => {
                      const m = getMember(id);
                      return m ? (
                        <div key={id} className="flex justify-between items-center p-3 bg-emerald-50 rounded-lg border border-emerald-200">
                          <div>
                            <p className="font-bold text-sm text-gray-800 font-bold">{m.name}</p>
                            <p className="text-xs text-gray-400 font-semibold">{m.membership_no}</p>
                          </div>
                          <button onClick={() => removeGuarantor(id)} className="text-red-500 hover:text-red-700 text-xs font-bold">Remove</button>
                        </div>
                      ) : null;
                    })}
                  </div>
                </div>

                <div className="flex gap-3">
                  <button onClick={() => setStep(2)} className="bg-gray-100 text-gray-700 font-bold px-6 py-3 rounded-lg hover:bg-gray-200">← Back</button>
                  <button onClick={() => {
                    if (form.guarantor_ids.length < 2) return showToast("Minimum 2 guarantors required", "error");
                    setStep(4);
                  }} className="bg-gray-900 text-white font-black px-6 py-3 rounded-lg hover:bg-gray-800">
                    Next: Final Review →
                  </button>
                </div>
              </div>
            )}

            {/* STEP 4: Final Review */}
            {step === 4 && (
              <div className="max-w-2xl">
                <h2 className="text-xl font-black text-gray-800 mb-6 font-bold">Final Review & Submit</h2>
                <div className="space-y-4">
                  <div className="bg-white border border-gray-200 rounded-xl p-5">
                    <h4 className="font-black text-gray-600 text-xs uppercase tracking-widest mb-3">Application details</h4>
                    <div className="grid grid-cols-2 gap-3 text-sm">
                      <div><p className="text-gray-400 font-semibold">Loan Type</p><p className="font-black text-gray-800">{selectedType?.name}</p></div>
                      <div><p className="text-gray-400 font-semibold">Intervals</p><p className="font-black text-gray-800">{form.repayment_months} ({selectedType?.repayment_frequency})</p></div>
                      <div><p className="text-gray-400 font-semibold">Total Payable</p><p className="font-black text-gray-800">KES {parseFloat(calc?.totalPayable)?.toLocaleString()}</p></div>
                      <div><p className="text-gray-400 font-semibold">Purpose</p><p className="font-medium text-gray-800">{form.purpose}</p></div>
                    </div>
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

        {/* ═════════════════════════════ DETAILED VIEW ═══════════════════════ */}
        {view === "detail" && selectedLoan && (
          <div className="space-y-5">
            <div className="bg-white border border-gray-200 rounded-xl p-5">
              <div className="flex justify-between items-start mb-4 flex-wrap gap-3">
                <div>
                  <p className="text-gray-400 text-sm font-semibold">{selectedLoan.loan_type}</p>
                  <p className="text-3xl font-black text-gray-900">KES {selectedLoan.amount?.toLocaleString()}</p>
                  <p className="text-gray-500 text-sm mt-1 font-semibold">{selectedLoan.purpose}</p>
                </div>
                <span className={`text-sm px-4 py-1.5 rounded-full font-bold border ${STATUS_CONFIG[selectedLoan.status]?.color}`}>
                  {STATUS_CONFIG[selectedLoan.status]?.icon} {STATUS_CONFIG[selectedLoan.status]?.label}
                </span>
              </div>

              {selectedLoan.admin_notes && (
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-4">
                  <p className="text-xs text-blue-600 font-bold uppercase mb-1">Admin Notes</p>
                  <p className="text-blue-800 text-sm">{selectedLoan.admin_notes}</p>
                </div>
              )}

              {selectedLoan.status === "info_required" && (
                <div className="bg-amber-50 border border-amber-300 rounded-xl p-5 mb-4">
                  <h4 className="font-black text-amber-900 text-sm mb-1">ℹ️ Action Required: Upload Additional Information</h4>
                  <p className="text-amber-800 text-xs mb-3 font-semibold">{selectedLoan.admin_notes || "Please upload the requested verification file below."}</p>
                  
                  <div className="space-y-3">
                    <textarea
                      value={infoResponse}
                      onChange={e => setInfoResponse(e.target.value)}
                      rows={2}
                      placeholder="Type explanation / details here..."
                      className="w-full border border-amber-300 rounded-lg p-2.5 text-xs bg-white text-gray-900 font-semibold"
                    />
                    <div>
                      <label className="text-[11px] font-bold text-gray-700 block mb-1">Attach Supporting Document (PDF / Image)</label>
                      <input
                        type="file"
                        accept="image/*,.pdf"
                        onChange={e => setInfoDoc(e.target.files[0])}
                        className="text-xs text-gray-600 file:bg-amber-600 file:text-white file:border-0 file:rounded file:px-3 file:py-1 file:font-bold"
                      />
                    </div>
                    <button
                      onClick={sendInfoResponse}
                      disabled={sendingInfo}
                      className="bg-amber-600 text-white font-black px-4 py-2 rounded-lg text-xs hover:bg-amber-700"
                    >
                      {sendingInfo ? "Uploading..." : "📨 Submit Response & Document"}
                    </button>
                  </div>
                </div>
              )}

              {/* POST-APPROVAL REQUIREMENTS & VEHICLE LOGBOOK SECURITY WORKFLOWS */}
              <div className="space-y-4 mb-4">
                <LoanRequirements loan={selectedLoan} userRole="member" onDone={refreshSelected} notify={showToast} />
                <LoanSecurity     loan={selectedLoan} userRole="member" onDone={refreshSelected} notify={showToast} />
              </div>

              {/* Policy Rate Revision Notice */}
              {selectedLoan.rate_change_pending && (
                <div className="bg-blue-50 border-2 border-blue-300 rounded-xl p-5 mb-5 shadow-sm">
                  <h4 className="font-black text-blue-900 text-base mb-2 flex items-center gap-2">📢 Policy Rate Modification Notice</h4>
                  <p className="text-blue-900 text-sm mb-4 leading-relaxed font-semibold bg-white/60 p-3 rounded-lg border border-blue-100">
                    {selectedLoan.rate_change_notes}
                  </p>
                  <div className="flex gap-3">
                    <button
                      onClick={async () => {
                        const res = await authPut(`/loan-applications/${selectedLoan.id}/commitment`, { status: "agreed" });
                        if (res.ok) {
                          showToast("Commitment agreement sent to HR/Admin ✓");
                          refreshSelected();
                        } else {
                          showToast("Failed to agree", "error");
                        }
                      }}
                      className="bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-bold px-4 py-2 rounded-lg flex items-center gap-1.5 transition-colors shadow-sm"
                    >
                      ✅ Agree & Accept New Terms
                    </button>
                    <button
                      onClick={async () => {
                        const reason = prompt("State your reason for declining this rate change:");
                        if (reason === null) return;
                        const res = await authPut(`/loan-applications/${selectedLoan.id}/commitment`, { status: "disagreed", reason });
                        if (res.ok) {
                          showToast("Notice sent back to HR/Admin ✓");
                          refreshSelected();
                        } else {
                          showToast("Failed to decline", "error");
                        }
                      }}
                      className="bg-red-50 hover:bg-red-100 border border-red-200 text-red-700 text-sm font-bold px-4 py-2 rounded-lg transition-colors"
                    >
                      ❌ Disagree & Request Review
                    </button>
                  </div>
                </div>
              )}

              {/* Installment parameters */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                {[
                  ["Interest Rate", `${selectedLoan.interest_rate}% p.a.`],
                  ["Scheduled Payment", `KES ${selectedLoan.monthly_installment?.toLocaleString()}`],
                  ["Total Payable", `KES ${selectedLoan.total_payable?.toLocaleString()}`],
                  ["Schedule Terms", `${selectedLoan.repayment_months} periods`],
                ].map(([l,v],i) => (
                  <div key={i} className="bg-gray-50 rounded-lg p-3">
                    <p className="text-gray-400 text-xs font-bold">{l}</p>
                    <p className="font-black text-gray-800 mt-0.5">{v}</p>
                  </div>
                ))}
              </div>

              {/* Repay progress */}
              {["repaying","cleared","disbursed"].includes(selectedLoan.status) && (
                <div className="mt-4">
                  <div className="flex justify-between text-xs text-gray-400 mb-1">
                    <span>Repaid: KES {selectedLoan.amount_repaid?.toLocaleString()}</span>
                    <span>Remaining Balance: KES {(selectedLoan.total_payable-selectedLoan.amount_repaid)?.toLocaleString()}</span>
                  </div>
                  <div className="w-full bg-gray-100 rounded-full h-3">
                    <div className="h-3 rounded-full bg-emerald-500 transition-all"
                      style={{ width:`${Math.min((selectedLoan.amount_repaid/selectedLoan.total_payable)*100,100)}%` }} />
                  </div>
                </div>
              )}

              {/* Payment actions only active once disbursed / active */}
              {["disbursed", "repaying", "defaulted"].includes(selectedLoan.status) && (
                <div className="flex gap-2 mt-4 flex-wrap">
                  <button onClick={() => setShowPayModal(true)}
                    className="bg-emerald-600 text-white font-black px-6 py-2.5 rounded-lg hover:bg-emerald-700">
                    💳 Record Payment
                  </button>
                  <button onClick={() => setShowRepaymentAccount(true)}
                    className="bg-blue-600 text-white font-black px-6 py-2.5 rounded-lg hover:bg-blue-700">
                    🏦 Repayment Account & Logs
                  </button>
                </div>
              )}
            </div>

            {/* Repayment schedule */}
            {selectedLoan.schedule?.length > 0 && (
              <div className="bg-white border border-gray-200 rounded-xl p-5">
                <h3 className="font-black text-gray-700 mb-3">Installment Repayment Schedule</h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-100">
                        {["No.","Due Date","Amount Due","Paid","Status"].map(h => (
                          <th key={h} className="text-left p-2 text-gray-400 font-semibold text-xs">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {selectedLoan.schedule.map(s => (
                        <tr key={s.id} className="border-b border-gray-50 hover:bg-gray-50 font-bold">
                          <td className="p-2 text-gray-400">#{s.installment_no}</td>
                          <td className="p-2 text-gray-855">{s.due_date}</td>
                          <td className="p-2 text-gray-855">KES {s.amount_due?.toLocaleString()}</td>
                          <td className="p-2 text-emerald-600">KES {s.amount_paid?.toLocaleString()}</td>
                          <td className="p-2">
                            <span className={`text-xs px-2.5 py-0.5 rounded-full font-bold ${
                              s.status === "paid"   ? "bg-green-100 text-green-700 border border-green-250" :
                              s.status === "overdue"? "bg-red-100 text-red-700 border border-red-250" :
                              "bg-gray-100 text-gray-650"
                            }`}>{s.status}</span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ════════════════ GUARANTOR FLOWS ════════════════ */}
        {view === "guarantors" && (
          <div className="space-y-4">
            <h3 className="font-black text-gray-800 text-lg mb-2">Pending Requests</h3>
            {guarantorRequests.length === 0 ? (
              <div className="bg-white border border-gray-200 rounded-xl p-8 text-center text-gray-400">
                <p className="text-4xl mb-3">🤝</p>
                <p>No pending guarantor requests</p>
              </div>
            ) : (
              guarantorRequests.map(g => (
                <div key={g.id} className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm space-y-4">
                  <div className="flex justify-between items-start">
                    <div>
                      <h4 className="font-black text-gray-800 text-base">{g.member_name}</h4>
                      <p className="text-xs text-gray-400 font-mono">{g.membership_no}</p>
                      <p className="text-sm text-gray-600 mt-2">
                        Has asked you to guarantee a loan of <strong className="text-gray-900">KES {g.loan_amount?.toLocaleString()}</strong>.
                      </p>
                    </div>
                    <span className="text-xs text-gray-400">{new Date(g.created_at).toLocaleDateString()}</span>
                  </div>
                  <div className="bg-gray-50 border border-gray-200 rounded-xl p-3 text-xs text-gray-700">
                    <strong>Purpose:</strong> {g.loan_purpose}
                  </div>
                  <div className="flex gap-2 pt-2">
                    <button
                      onClick={() => respondToGuarantor(g.id, "accepted")}
                      className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-4 py-2 rounded-lg text-xs"
                    >
                      ✅ Guarantee / Accept Request
                    </button>
                    <button
                      onClick={() => respondToGuarantor(g.id, "rejected")}
                      className="bg-red-600 hover:bg-red-750 text-white font-bold px-4 py-2 rounded-lg text-xs"
                    >
                      ❌ Reject / Decline Request
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {view === "guarantorHistory" && (
          <div className="space-y-4">
            <h3 className="font-black text-gray-800 text-lg mb-2">Guarantorship History</h3>
            {guarantorHistory.length === 0 ? (
              <div className="bg-white border border-gray-200 rounded-xl p-8 text-center text-gray-400">
                <p className="text-4xl mb-3">🤝</p>
                <p>No historical requests recorded on your profile</p>
              </div>
            ) : (
              guarantorHistory.map(g => {
                const cfg = GUARANTEE_STATUS[g.status] || { color: "bg-gray-100 text-gray-700 border-gray-200", icon: "⏳" };
                return (
                  <div key={g.id} className={`bg-white border rounded-xl p-5 ${g.status === "accepted" ? "border-green-300" : g.status === "rejected" ? "border-red-200" : "border-amber-300"}`}>
                    <div className="flex justify-between items-start mb-3">
                      <div>
                        <div className="flex items-center gap-2">
                          <p className="font-black text-gray-800 text-lg">{g.member_name}</p>
                          <span className="text-xs text-gray-400">{g.membership_no}</span>
                        </div>
                        <p className="text-gray-500 text-sm capitalize">{g.loan_type} Loan</p>
                      </div>
                      <span className={`text-xs px-3 py-1 rounded-full font-bold border ${cfg.color}`}>
                        {cfg.icon} {cfg.label || g.status}
                      </span>
                    </div>

                    <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-sm mb-3">
                      <div className="bg-gray-50 rounded-lg p-3">
                        <p className="text-gray-400 text-xs">Loan Amount</p>
                        <p className="font-black">KES {g.loan_amount?.toLocaleString()}</p>
                      </div>
                      <div className="bg-gray-50 rounded-lg p-3">
                        <p className="text-gray-400 text-xs">Loan Status</p>
                        <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-gray-100 text-gray-700 capitalize">
                          {g.loan_status?.replace(/_/g," ")}
                        </span>
                      </div>
                      <div className="bg-gray-50 rounded-lg p-3">
                        <p className="text-gray-400 text-xs">Loan Type</p>
                        <p className="font-bold text-gray-700">{g.loan_type || "—"}</p>
                      </div>
                    </div>

                    <p className="text-gray-500 text-sm mb-2">Purpose: {g.loan_purpose}</p>

                    {g.status === "accepted" && (
                      <div className="bg-green-50 border border-green-200 rounded-xl p-4 mt-2">
                        <p className="font-black text-green-800 text-sm mb-2">✅ You are an active guarantor for this loan</p>
                        <div className="flex gap-4 text-sm mb-3">
                          <div>
                            <p className="text-gray-400 text-xs">Amount Repaid</p>
                            <p className="font-black text-green-700">KES {g.amount_repaid?.toLocaleString()}</p>
                          </div>
                          <div>
                            <p className="text-gray-400 text-xs">Outstanding</p>
                            <p className="font-black text-red-650">KES {((g.total_payable||0)-(g.amount_repaid||0)).toLocaleString()}</p>
                          </div>
                          <div>
                            <p className="text-gray-400 text-xs">Total Payable</p>
                            <p className="font-black text-gray-700 font-bold">KES {g.total_payable?.toLocaleString()}</p>
                          </div>
                        </div>
                        {g.total_payable > 0 && (
                          <div>
                            <div className="flex justify-between text-xs text-gray-400 mb-1">
                              <span>{Math.round((g.amount_repaid/g.total_payable)*100)}% repaid</span>
                            </div>
                            <div className="w-full bg-gray-200 rounded-full h-2">
                              <div className="h-2 rounded-full bg-green-500" style={{width:`${Math.min((g.amount_repaid/g.total_payable)*100,100)}%`}} />
                            </div>
                          </div>
                        )}
                        {g.loan_status === "defaulted" && (
                          <div className="mt-3 bg-red-50 border border-red-200 rounded-lg p-2">
                            <p className="text-red-700 text-xs font-bold animate-pulse">⚠️ This loan is in default. As guarantor you may be liable.</p>
                          </div>
                        )}
                      </div>
                    )}

                    <p className="text-gray-400 text-xs mt-3">
                      Requested: {new Date(g.created_at).toLocaleDateString()}
                      {g.responded_at && ` · Responded: ${new Date(g.responded_at).toLocaleDateString()}`}
                    </p>
                  </div>
                );
              })
            )}
          </div>
        )}

        {/* ════════════════ ADMIN: MANAGE CONFIG LOAN TYPES ════════════════ */}
        {view === "adminLoanTypes" && (
          <div className="space-y-6">
            <div className="flex justify-between items-center bg-white border border-gray-200 rounded-xl p-5 shadow-sm">
              <div>
                <h2 className="text-xl font-black text-gray-900 font-bold">⚙️ Advanced Loan Types Configuration</h2>
                <p className="text-gray-500 text-sm font-semibold">Define custom repayment cycles, start rules, T&C document references, and penalty matrices.</p>
              </div>
              <button onClick={() => { setSelectedType(null); setView("dashboard"); }}
                className="bg-gray-100 text-gray-700 font-bold px-4 py-2 rounded-lg text-sm hover:bg-gray-200">
                ← Exit Rules Portal
              </button>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="space-y-3 bg-white border border-gray-200 rounded-xl p-5 shadow-sm">
                <h3 className="font-black text-gray-800 text-sm mb-2 uppercase tracking-wider">Configured Types</h3>
                {loanTypes.map(lt => (
                  <div key={lt.id} className="p-4 rounded-xl border border-gray-155 bg-gray-50 hover:border-emerald-500 transition-all">
                    <div className="flex justify-between items-start">
                      <div>
                        <h4 className="font-black text-gray-800 text-sm">{lt.name}</h4>
                        <p className="text-xs text-gray-400 font-semibold">{lt.min_amount?.toLocaleString()} - {lt.max_amount?.toLocaleString()} KES</p>
                        <p className="text-[11px] text-emerald-600 font-bold mt-1 uppercase">Cycle: {lt.repayment_frequency || "monthly"}</p>
                      </div>
                      <button onClick={() => {
                        setSelectedType(lt);
                        setForm({
                          ...form,
                          name: lt.name,
                          interest_rate: lt.interest_rate,
                          min_amount: lt.min_amount,
                          max_amount: lt.max_amount,
                          min_months: lt.min_months,
                          max_months: lt.max_months,
                          description: lt.description,
                          repayment_frequency: lt.repayment_frequency || "monthly",
                          repayment_start_rule: lt.repayment_start_rule || "next_period",
                          penalty_type: lt.penalty_type || "percentage",
                          penalty_amount: lt.penalty_amount || 5.0,
                          penalty_frequency: lt.penalty_frequency || "monthly",
                          grace_period_days: lt.grace_period_days || 3,
                        });
                      }} className="text-xs bg-emerald-600 text-white px-2.5 py-1 rounded font-bold hover:bg-emerald-700">
                        Edit Rule
                      </button>
                    </div>
                  </div>
                ))}
                <button onClick={() => {
                  setSelectedType(null);
                  setForm({
                    name: "", interest_rate: "", max_amount: "", min_amount: "", max_months: "", min_months: "", description: "",
                    repayment_frequency: "monthly", repayment_start_rule: "next_period", penalty_type: "percentage", penalty_amount: 5, penalty_frequency: "monthly", grace_period_days: 3
                  });
                }} className="w-full bg-slate-900 text-white font-black py-2.5 rounded-lg text-sm hover:bg-slate-800">
                  + Configure New Type
                </button>
              </div>

              <div className="lg:col-span-2 bg-white border border-gray-200 rounded-xl p-5 shadow-sm space-y-4">
                <h3 className="font-black text-gray-800 text-sm border-b border-gray-100 pb-2">
                  {selectedType ? `Modify ${selectedType.name} Specifications` : "Configure a New Loan Type"}
                </h3>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs text-gray-700 uppercase tracking-widest font-bold mb-1 block">Loan Name</label>
                    <input type="text" placeholder="e.g. Weekly Matatu Loan" value={form.name || ""}
                      onChange={e => setForm({ ...form, name: e.target.value })} className={inp} />
                  </div>
                  <div>
                    <label className="text-xs text-gray-700 uppercase tracking-widest font-bold mb-1 block">Interest Rate (% p.a.)</label>
                    <input type="number" placeholder="e.g. 10" value={form.interest_rate || ""}
                      onChange={e => setForm({ ...form, interest_rate: e.target.value })} className={inp} />
                  </div>
                  <div>
                    <label className="text-xs text-gray-700 uppercase tracking-widest font-bold mb-1 block">Min Borrowing Limit (KES)</label>
                    <input type="number" placeholder="e.g. 1000" value={form.min_amount || ""}
                      onChange={e => setForm({ ...form, min_amount: e.target.value })} className={inp} />
                  </div>
                  <div>
                    <label className="text-xs text-gray-700 uppercase tracking-widest font-bold mb-1 block">Max Borrowing Limit (KES)</label>
                    <input type="number" placeholder="e.g. 150000" value={form.max_amount || ""}
                      onChange={e => setForm({ ...form, max_amount: e.target.value })} className={inp} />
                  </div>
                  <div>
                    <label className="text-xs text-gray-700 uppercase tracking-widest font-bold mb-1 block">Min Installment Cycles</label>
                    <input type="number" placeholder="e.g. 4" value={form.min_months || ""}
                      onChange={e => setForm({ ...form, min_months: e.target.value })} className={inp} />
                  </div>
                  <div>
                    <label className="text-xs text-gray-700 uppercase tracking-widest font-bold mb-1 block">Max Installment Cycles</label>
                    <input type="number" placeholder="e.g. 52" value={form.max_months || ""}
                      onChange={e => setForm({ ...form, max_months: e.target.value })} className={inp} />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4 border-t border-gray-100 pt-3">
                  <div>
                    <label className="text-xs text-gray-700 uppercase tracking-widest font-bold mb-1 block">Repayment Frequency</label>
                    <select value={form.repayment_frequency || "monthly"}
                      onChange={e => setForm({ ...form, repayment_frequency: e.target.value })} className={inp}>
                      <option value="daily">Daily Repayments</option>
                      <option value="weekly">Weekly Repayments</option>
                      <option value="monthly">Monthly Repayments</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-xs text-gray-700 uppercase tracking-widest font-bold mb-1 block">First Payment Due Date</label>
                    <select value={form.repayment_start_rule || "next_period"}
                      onChange={e => setForm({ ...form, repayment_start_rule: e.target.value })} className={inp}>
                      <option value="same_day">Same day since borrowed ("loan approved")</option>
                      <option value="next_period">Standard next period (e.g. next month/week/day)</option>
                    </select>
                  </div>
                </div>

                <div className="border-t border-gray-100 pt-3">
                  <label className="text-xs text-gray-700 uppercase tracking-widest font-bold mb-1 block">Description</label>
                  <textarea placeholder="Write a short description..." value={form.description || ""}
                    onChange={e => setForm({ ...form, description: e.target.value })} rows={2} className={`${inp} resize-none`} />
                </div>

                {selectedType && (
                  <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 space-y-2">
                    <p className="text-xs text-blue-700 font-bold uppercase tracking-wide">📄 Upload / Update Terms & Conditions (PDF / Image)</p>
                    <p className="text-[11px] text-blue-600 font-bold">Borrowers must read and accept this before applying.</p>
                    <input type="file" accept="image/*,.pdf"
                      onChange={e => handleFileUpload(selectedType.id, e.target.files[0])}
                      className="w-full border border-blue-300 rounded-lg p-2 text-xs bg-white text-gray-700 file:mr-3 file:bg-blue-600 file:text-white file:border-0 file:rounded file:px-3 file:py-1 file:font-bold file:text-xs" />
                    {selectedType.terms_file && (
                      <a href={selectedType.terms_file} target="_blank" rel="noreferrer" className="text-xs text-blue-600 font-bold underline block">
                        View current document →
                      </a>
                    )}
                  </div>
                )}

                <div className="flex gap-3 justify-end pt-3">
                  <button onClick={async () => {
                    setLoading(true);
                    const payload = {
                      name: form.name,
                      interest_rate: parseFloat(form.interest_rate),
                      min_amount: parseFloat(form.min_amount),
                      max_amount: parseFloat(form.max_amount),
                      min_months: parseInt(form.min_months),
                      max_months: parseInt(form.max_months),
                      description: form.description,
                      repayment_frequency: form.repayment_frequency,
                      repayment_start_rule: form.repayment_start_rule
                    };

                    const url = selectedType ? `${API}/loan-types/${selectedType.id}` : `${API}/loan-types`;
                    const method = selectedType ? "PUT" : "POST";

                    const res = await fetch(url, {
                      method, headers: hdr(), body: JSON.stringify(payload)
                    });
                    setLoading(false);
                    if (res.ok) {
                      showToast(selectedType ? "Specifications updated successfully ✓" : "New configuration saved successfully ✓");
                      setSelectedType(null);
                      setView("dashboard");
                      fetchAll();
                    } else {
                      showToast("Configuration save failed", "error");
                    }
                  }} className="bg-emerald-600 text-white font-black px-6 py-3 rounded-lg text-sm hover:bg-emerald-700">
                    {selectedType ? "Save Changes" : "Save Configuration"}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

      </div>

      {/* Payment prompt Modal */}
      {showPayModal && selectedLoan && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
            <div className="flex justify-between items-center mb-4">
              <h3 className="font-black text-gray-900 font-bold">Record Payment</h3>
              <button onClick={() => setShowPayModal(false)} className="text-gray-400 hover:text-gray-700 text-xl">✕</button>
            </div>
            <div className="bg-gray-50 rounded-xl p-4 mb-4">
              <div className="flex justify-between text-sm">
                <span className="text-gray-400 font-bold">Outstanding Balance</span>
                <span className="font-black text-red-600 font-bold">KES {(selectedLoan.total_payable-selectedLoan.amount_repaid)?.toLocaleString()}</span>
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
                  <input placeholder="Ref Code" value={payForm.mpesa_code}
                    onChange={e => setPayForm({...payForm,mpesa_code:e.target.value})} className={inp} />
                </div>
              )}
            </div>
            <div className="flex gap-3">
              <button onClick={makePayment} disabled={loading}
                className="flex-1 bg-emerald-600 text-white font-black py-3 rounded-lg hover:bg-emerald-700 disabled:opacity-50">
                {loading ? "Processing..." : "Confirm Payment"}
              </button>
            </div>
          </div>
        </div>
      )}

      {showRepaymentAccount && selectedLoan && (
        <RepaymentAccount loan={selectedLoan} onClose={() => setShowRepaymentAccount(false)} />
      )}
    </div>
  );
}