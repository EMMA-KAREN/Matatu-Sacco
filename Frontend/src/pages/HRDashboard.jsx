import { useEffect, useState, useCallback } from "react";
import { useAuth } from "../context/AuthContext";
import MonitorWorkers from "../components/Monitorworkers";
import Routes from "./Routes";
import Matatu from "./Matatus";
import API from "../api";
import MemberStatement from "../components/MemberStatement";
import HRStageAuditsAndReports from "../components/HRStageAuditsAndReports";
import Savings from "../components/Savings";

const tok = () => localStorage.getItem("token");
const hdr = () => ({ Authorization: `Bearer ${tok()}`, "Content-Type": "application/json" });
const authGet = (url) => fetch(`${API}${url}`, { headers: hdr() }).then(r => r.ok ? r.json() : []);
const authPost = (url, body) => fetch(`${API}${url}`, { method: "POST", headers: hdr(), body: JSON.stringify(body) });
const authPut = (url, body) => fetch(`${API}${url}`, { method: "PUT", headers: hdr(), body: body ? JSON.stringify(body) : undefined });

const LOAN_STATUS_COLORS = {
  pending: "bg-yellow-100 text-yellow-800",
  guarantors_pending: "bg-blue-100 text-blue-800",
  hr_approved: "bg-indigo-100 text-indigo-800",
  approved: "bg-green-100 text-green-700",
  rejected: "bg-red-100 text-red-700",
  disbursed: "bg-purple-100 text-purple-800",
  repaying: "bg-cyan-100 text-cyan-800",
  cleared: "bg-green-200 text-green-900",
  defaulted: "bg-red-200 text-red-900",
  info_required: "bg-orange-100 text-orange-800",
  deactivated: "bg-slate-200 text-slate-700",
};

const TABS = [
  { key: "members", label: "👥 Members" },
  { key: "matatus", label: "🚐 Matatus" },
  { key: "routes", label: "🗺️ Routes" },
  { key: "loans", label: "💼 Loans" },
  { key: "receipts", label: "🎫 Receipts" },
  { key: "workers", label: "👷 Monitor Workers" },
  { key: "settings", label: "⚙️ Receipt Settings" },
  { key: "audit", label: "📋 Audit Log" },
  { key: "stageAudits", label: "🛡️ Stage Audits" },
  { key: "savings", label: "🏦 Savings Desk" },
];

function Toast({ msg, type, onClose }) {
  useEffect(() => { const t = setTimeout(onClose, 3500); return () => clearTimeout(t); }, [onClose]);
  return (
    <div className={`fixed top-5 right-5 z-[200] px-5 py-3 rounded-xl shadow-2xl text-sm font-bold
      ${type === "error" ? "bg-red-500 text-white" : "bg-emerald-500 text-white"}`}>
      {msg}
    </div>
  );
}

export default function HRDashboard() {
  const { user } = useAuth();
  const [tab, setTab] = useState("members");
  const [toast, setToast] = useState(null);
  const showToast = (msg, type = "success") => setToast({ msg, type });

  // ════════════════════════════════════════════════════════
  // 1. ALL STATE
  // ════════════════════════════════════════════════════════

  // ── members ──
  const [members, setMembers] = useState([]);
  const [pending, setPending] = useState([]);
  const [stats, setStats] = useState({});
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [selectedMember, setSelectedMember] = useState(null);
  const [editForm, setEditForm] = useState({});
  const [createForm, setCreateForm] = useState({ membership_no: "", name: "", national_id: "", phone: "", password: "", role: "member" });
  const PER_PAGE = 20;
  const [viewMemberStatement, setViewMemberStatement] = useState(null);

  // ── loans & repayment account ──
  const [loans, setLoans] = useState([]);
  const [selectedLoan, setSelectedLoan] = useState(null);
  const [loanRepaymentAcc, setLoanRepaymentAcc] = useState(null);
  const [loanNotes, setLoanNotes] = useState("");
  const [loanSearch, setLoanSearch] = useState("");
  const [loanFilter, setLoanFilter] = useState("all");
  const [reminderMsg, setReminderMsg] = useState("");

  // ── HR Loan Edit Modal State ──
  const [showEditLoanModal, setShowEditLoanModal] = useState(false);
  const [editLoanForm, setEditLoanForm] = useState({
    amount: "",
    interest_rate: "",
    repayment_months: "",
    purpose: "",
    notes: ""
  });

  // ── notifications ──
  const [notifications, setNotifications] = useState([]);
  const [showNotificationsModal, setShowNotificationsModal] = useState(false);
  const unreadNotificationsCount = notifications.filter(n => !n.is_read).length;

  // ── existing loan state ──
  const [loanTypesForHR, setLoanTypesForHR] = useState([]);
  const [hasExistingLoan, setHasExistingLoan] = useState(false);
  const [existingLoan, setExistingLoan] = useState({
    loan_type_id: "",
    amount: "",
    interest_rate: "",
    repayment_months: "",
    amount_repaid: "0",
    status: "repaying",
    received_date: new Date().toISOString().split("T")[0],
    start_date: new Date().toISOString().split("T")[0],
    purpose: "Existing loan onboarded by HR",
  });

  // ── receipts by route ──
  const [receiptDate, setReceiptDate] = useState(new Date().toISOString().split("T")[0]);
  const [receiptData, setReceiptData] = useState(null);
  const [receiptLoading, setReceiptLoading] = useState(false);
  const [selectedRoute, setSelectedRoute] = useState(null);
  const [allRoutes, setAllRoutes] = useState([]);
  const [routeFilter, setRouteFilter] = useState("");

  // ── receipt metadata settings ──
  const [saccoSettings, setSaccoSettings] = useState({ sacco_name: "", location: "", po_box: "", phone_number: "" });
  const [updatingSacco, setUpdatingSacco] = useState(false);

  // ── audit ──
  const [auditLogs, setAuditLogs] = useState([]);
  const [auditCategory, setAuditCategory] = useState("all");
  const [auditSearch, setAuditSearch] = useState("");

  // ════════════════════════════════════════════════════════
  // 2. FETCH HELPERS (must be declared BEFORE the useEffects)
  // ════════════════════════════════════════════════════════

  const fetchNotifications = useCallback(async () => {
    try {
      const data = await authGet("/notifications/my");
      if (Array.isArray(data)) setNotifications(data);
    } catch (e) {}
  }, []);

  const fetchMembers = useCallback(async () => {
    const [active, pend] = await Promise.all([
      fetch(`${API}/hr/members`, { cache: "no-store" }).then(r => r.json()),
      fetch(`${API}/hr/pending-members`).then(r => r.json()),
    ]);
    setMembers(active || []);
    setPending(pend || []);
    setStats({
      total: (active?.length || 0) + (pend?.length || 0),
      pending: pend?.length || 0,
      owners: active?.filter(m => m.role === "owner").length || 0,
      drivers: active?.filter(m => m.role === "driver").length || 0,
    });
  }, []);

  const fetchLoans = useCallback(async () => {
    const data = await authGet("/loan-applications/all");
    setLoans(data || []);
  }, []);

  const fetchLoanRepaymentAcc = async (loanId) => {
    const data = await authGet(`/repayment-account/${loanId}`);
    setLoanRepaymentAcc(data);
  };

  const fetchAuditLogs = useCallback(async () => {
    const cat = auditCategory !== "all" ? `?category=${auditCategory}` : "";
    const data = await authGet(`/audit/permanent${cat}`);
    setAuditLogs(data || []);
  }, [auditCategory]);

  const fetchRoutes = useCallback(async () => {
    const data = await fetch(`${API}/routes`).then(r => r.json());
    setAllRoutes(data || []);
  }, []);

  const fetchLoanTypesForHR = useCallback(async () => {
    const data = await fetch(`${API}/loan-types`).then(r => r.json());
    setLoanTypesForHR(data || []);
  }, []);

  const fetchSaccoSettings = useCallback(async () => {
    const data = await authGet("/settings/sacco");
    if (data && !Array.isArray(data)) {
      setSaccoSettings(data);
    }
  }, []);

  // ════════════════════════════════════════════════════════
  // 3. useEffect HOOKS (after everything they reference)
  // ════════════════════════════════════════════════════════

  useEffect(() => {
    fetchMembers();
    fetchRoutes();
    fetchLoanTypesForHR();
    fetchNotifications();

    const timer = setInterval(() => {
      fetchNotifications();
    }, 25000);
    return () => clearInterval(timer);
  }, [fetchMembers, fetchRoutes, fetchLoanTypesForHR, fetchNotifications]);

  useEffect(() => { if (tab === "loans") fetchLoans(); }, [tab, fetchLoans]);
  useEffect(() => { if (tab === "audit") fetchAuditLogs(); }, [tab, fetchAuditLogs]);
  useEffect(() => { if (tab === "settings") fetchSaccoSettings(); }, [tab, fetchSaccoSettings]);

  // ════════════════════════════════════════════════════════
  // 4. HELPERS & ACTION HANDLERS
  // ════════════════════════════════════════════════════════

  const getLoanMemberId = (loan) => {
    if (!loan) return null;
    if (loan.member_id) return loan.member_id;
    if (loan.user_id) return loan.user_id;
    const found = members.find(m => m.membership_no?.toUpperCase() === loan.membership_no?.toUpperCase());
    return found ? found.id : null;
  };

  const markNotificationRead = async (id) => {
    await authPut(`/notifications/${id}/read`);
    fetchNotifications();
  };

  const markAllNotificationsRead = async () => {
    await authPut("/notifications/read-all");
    fetchNotifications();
    showToast("All notifications marked as read ✓");
  };

  const logAudit = async (action, category, member_id, membership_no, details) => {
    await authPost("/audit/permanent", { action, category, member_id, membership_no, details });
    if (tab === "audit") fetchAuditLogs();
  };

  const saveSaccoSettings = async () => {
    setUpdatingSacco(true);
    const res = await authPut("/settings/sacco", saccoSettings);
    setUpdatingSacco(false);
    if (!res.ok) return showToast("Failed to update settings", "error");
    showToast("Receipt settings updated ✓");
    await logAudit("SETTINGS_UPDATED", "general", null, "", `Updated SACCO details: ${saccoSettings.sacco_name}`);
  };

  const createMember = async () => {
    if (!createForm.membership_no.trim()) return showToast("Membership No required", "error");
    if (hasExistingLoan && (!existingLoan.loan_type_id || !existingLoan.amount)) {
      return showToast("Loan type and amount are required for the existing loan", "error");
    }

    const res = await fetch(`${API}/hr/create-member`, {
      method: "POST",
      headers: hdr(),
      body: JSON.stringify(createForm)
    });
    const data = await res.json();
    if (!res.ok) return showToast(data.error || "Member creation failed", "error");

    let newMemberId = data.id ?? data.member?.id ?? data.user?.id;
    if (!newMemberId) {
      const membersRes = await fetch(`${API}/hr/members`);
      if (membersRes.ok) {
        const activeMembers = await membersRes.json();
        const found = activeMembers.find(m => m.membership_no?.toUpperCase() === createForm.membership_no.trim().toUpperCase());
        if (found) newMemberId = found.id;
      }
    }

    showToast("Member created ✓");
    await logAudit("MEMBER_CREATED", "member", newMemberId, createForm.membership_no, `Created by HR: ${user?.name}`);

    if (hasExistingLoan && newMemberId) {
      const loanPayload = {
        member_id: newMemberId,
        membership_no: createForm.membership_no,
        loan_type_id: parseInt(existingLoan.loan_type_id),
        amount: parseFloat(existingLoan.amount),
        interest_rate: parseFloat(existingLoan.interest_rate || 0),
        repayment_months: parseInt(existingLoan.repayment_months || 0),
        amount_repaid: parseFloat(existingLoan.amount_repaid || 0),
        status: existingLoan.status || "repaying",
        received_date: existingLoan.received_date,
        start_date: existingLoan.start_date,
        purpose: existingLoan.purpose || "Existing loan onboarded by HR",
      };
      const loanRes = await authPost("/hr/existing-loan", loanPayload);
      if (loanRes.ok) {
        showToast("Existing loan recorded ✓");
        await logAudit("LOAN_ONBOARDED", "loan", newMemberId, createForm.membership_no, `Existing loan added by HR: ${user?.name}`);
      }
    }

    setCreateForm({ membership_no: "", name: "", national_id: "", phone: "", password: "", role: "member" });
    setHasExistingLoan(false);
    fetchMembers();
    fetchLoans();
  };

  const updateMember = async () => {
    const res = await authPut(`/hr/member/update/${selectedMember.id}`, editForm);
    if (!res.ok) return showToast("Update failed", "error");
    showToast("Member updated ✓");
    await logAudit("MEMBER_UPDATED", "member", selectedMember.id, selectedMember.membership_no, `Updated by HR: ${user?.name}`);
    setSelectedMember(null);
    fetchMembers();
  };

  const approveMember = async (id, membership_no) => {
    await authPut(`/hr/approve/${id}`);
    showToast("Member approved ✓");
    await logAudit("MEMBER_APPROVED", "member", id, membership_no, `Approved by HR: ${user?.name}`);
    fetchMembers();
  };

  const rejectMember = async (id, membership_no) => {
    if (!window.confirm("Reject this pending member?")) return;
    await fetch(`${API}/hr/reject/${id}`, { method: "DELETE", headers: hdr() });
    showToast("Member rejected");
    await logAudit("MEMBER_REJECTED", "member", id, membership_no, `Rejected by HR: ${user?.name}`);
    fetchMembers();
  };

  // ── loan actions ──
  const handleSelectLoan = (loan) => {
    setSelectedLoan(loan);
    setLoanNotes("");
    setReminderMsg("");
    fetchLoanRepaymentAcc(loan.id);
  };

  // HR recommends loan -> Moves to hr_approved status awaiting Admin final approval
  const hrRecommendLoan = async (id) => {
    const res = await authPut(`/loan-applications/${id}/hr-recommend`, { notes: loanNotes });
    if (!res.ok) return showToast("Action failed", "error");
    showToast("Loan approved by HR. Sent for Admin final approval ✓");
    await logAudit("LOAN_HR_APPROVED", "loan", getLoanMemberId(selectedLoan), selectedLoan?.membership_no, `Loan #${id} approved by HR: ${user?.name}. Awaiting Admin final authorization.`);
    setSelectedLoan(null); setLoanNotes("");
    fetchLoans();
  };

  const rejectLoan = async (id) => {
    if (!loanNotes) return showToast("Add rejection reason", "error");
    const res = await authPut(`/loan-applications/${id}/reject`, { notes: loanNotes });
    if (!res.ok) return showToast("Failed", "error");
    showToast("Loan rejected");
    await logAudit("LOAN_REJECTED", "loan", getLoanMemberId(selectedLoan), selectedLoan?.membership_no, `Loan #${id} rejected. Reason: ${loanNotes}`);
    setSelectedLoan(null); setLoanNotes("");
    fetchLoans();
  };

  const requestMoreInfo = async (id) => {
    if (!loanNotes) return showToast("Specify what info/document is needed", "error");
    const res = await authPut(`/loan-applications/${id}/request-info`, { notes: loanNotes });
    if (!res.ok) return showToast("Failed", "error");
    showToast("Info requested ✓ — member can respond directly with upload");
    await logAudit("LOAN_INFO_REQUESTED", "loan", getLoanMemberId(selectedLoan), selectedLoan?.membership_no, `More info requested: ${loanNotes}`);
    setSelectedLoan(null); setLoanNotes("");
    fetchLoans();
  };

  const deactivateLoan = async (id) => {
    const reason = prompt("Enter the reason for deactivating this loan (declare void / mistake):");
    if (!reason) return;
    const res = await authPut(`/loan-applications/${id}/deactivate`, { reason });
    if (!res.ok) return showToast("Deactivation failed", "error");
    showToast("Loan deactivated and archived ✓");
    setSelectedLoan(null);
    fetchLoans();
  };

  const sendLoanReminder = async (id) => {
    const res = await authPost(`/loans/send-reminder/${id}`, { message: reminderMsg || undefined });
    if (!res.ok) return showToast("Reminder failed", "error");
    showToast("Reminder sent ✓");
    await logAudit("LOAN_REMINDER_SENT", "loan", getLoanMemberId(selectedLoan), selectedLoan?.membership_no, `Reminder sent for Loan #${id}`);
    setReminderMsg("");
  };

  const approveRepaymentPayment = async (txnId) => {
    const res = await authPut(`/hr/repayment-transactions/${txnId}/approve`);
    if (!res.ok) return showToast("Approval failed", "error");
    showToast("Payment approved & balance updated ✓");
    fetchLoanRepaymentAcc(selectedLoan.id);
    fetchLoans();
  };

  const rejectRepaymentPayment = async (txnId) => {
    const res = await authPut(`/hr/repayment-transactions/${txnId}/reject`);
    if (!res.ok) return showToast("Failed to reject", "error");
    showToast("Payment rejected");
    fetchLoanRepaymentAcc(selectedLoan.id);
  };

  // HR Submits Loan Edit Proposal
  const handleProposeLoanEdit = async () => {
    if (!editLoanForm.amount || !editLoanForm.interest_rate || !editLoanForm.repayment_months) {
      return showToast("Amount, interest rate, and duration are required", "error");
    }

    const payload = {
      amount: parseFloat(editLoanForm.amount),
      interest_rate: parseFloat(editLoanForm.interest_rate),
      repayment_months: parseInt(editLoanForm.repayment_months),
      purpose: editLoanForm.purpose,
      notes: editLoanForm.notes
    };

    const res = await authPut(`/loan-applications/${selectedLoan.id}/edit`, payload);
    const data = await res.json();
    if (!res.ok) return showToast(data.error || "Failed to submit proposed edits", "error");

    showToast("Loan modifications submitted! Awaiting Admin approval ✓");
    setShowEditLoanModal(false);
    fetchLoans();

    // Update locally selected loan view
    setSelectedLoan({
      ...selectedLoan,
      pending_edit: data.pending_edit
    });
  };

  const fetchReceiptsByRoute = async () => {
    setReceiptLoading(true);
    setSelectedRoute(null);
    let url = `/receipts/by-route?date=${receiptDate}`;
    if (routeFilter) url += `&route_id=${routeFilter}`;
    const data = await authGet(url);
    setReceiptData(data);
    setReceiptLoading(false);
  };

  // ════════════════════════════════════════════════════════
  // 5. DERIVED DATA
  // ════════════════════════════════════════════════════════

  const filteredMembers = members.filter(m =>
    (m.name || "").toLowerCase().includes(search.toLowerCase()) ||
    (m.membership_no || "").toLowerCase().includes(search.toLowerCase())
  );
  const paginatedMembers = filteredMembers.slice((page - 1) * PER_PAGE, page * PER_PAGE);
  const totalPages = Math.ceil(filteredMembers.length / PER_PAGE);

  const filteredLoans = loans.filter(l => {
    if (loanFilter !== "deactivated" && l.is_active === false) return false;
    const searchLower = loanSearch.toLowerCase();
    const matchesSearch =
      (l.member_name || "").toLowerCase().includes(searchLower) ||
      (l.membership_no || "").toLowerCase().includes(searchLower) ||
      (l.purpose || "").toLowerCase().includes(searchLower);
    const matchesFilter = loanFilter === "all" ? l.is_active !== false : l.status === loanFilter;
    return matchesSearch && matchesFilter;
  });

  const filteredAudit = auditLogs.filter(a =>
    a.action?.toLowerCase().includes(auditSearch.toLowerCase()) ||
    a.membership_no?.toLowerCase().includes(auditSearch.toLowerCase()) ||
    a.performed_by_name?.toLowerCase().includes(auditSearch.toLowerCase())
  );

  // ════════════════════════════════════════════════════════
  // 6. RENDER
  // ════════════════════════════════════════════════════════

  return (
    <div className="flex min-h-screen" style={{ fontFamily: "'Trebuchet MS', sans-serif", background: "#0f172a" }}>
      {toast && <Toast {...toast} onClose={() => setToast(null)} />}

      {viewMemberStatement && (
        <MemberStatement memberId={viewMemberStatement} onClose={() => setViewMemberStatement(null)} />
      )}

      {/* ── NOTIFICATIONS POPUP MODAL ── */}
      {showNotificationsModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg p-6 max-h-[80vh] flex flex-col">
            <div className="flex justify-between items-center border-b pb-3 mb-3">
              <div>
                <h3 className="font-black text-slate-800 text-lg flex items-center gap-2">
                  🔔 HR Notifications
                  {unreadNotificationsCount > 0 && (
                    <span className="bg-red-500 text-white text-[10px] px-2 py-0.5 rounded-full font-bold">
                      {unreadNotificationsCount} New
                    </span>
                  )}
                </h3>
                <p className="text-xs text-slate-500">Alerts on loan approvals, edits, and decisions</p>
              </div>
              <div className="flex items-center gap-2">
                {unreadNotificationsCount > 0 && (
                  <button
                    onClick={markAllNotificationsRead}
                    className="text-xs bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold px-2.5 py-1 rounded-lg"
                  >
                    Mark All Read
                  </button>
                )}
                <button
                  onClick={() => setShowNotificationsModal(false)}
                  className="text-slate-400 hover:text-slate-700 text-lg font-bold"
                >
                  ✕
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto space-y-2 pr-1">
              {notifications.length === 0 ? (
                <div className="text-center py-10 text-slate-400 font-bold text-sm">
                  📭 No notifications available.
                </div>
              ) : (
                notifications.map((n) => (
                  <div
                    key={n.id}
                    onClick={() => {
                      if (!n.is_read) markNotificationRead(n.id);
                      if (n.type === "loan") {
                        setShowNotificationsModal(false);
                        setTab("loans");
                      }
                    }}
                    className={`p-3 rounded-xl border text-xs cursor-pointer transition-all ${
                      n.is_read
                        ? "bg-slate-50 border-slate-200 text-slate-600"
                        : "bg-emerald-50/80 border-emerald-200 text-slate-800 font-semibold shadow-sm"
                    }`}
                  >
                    <div className="flex justify-between items-start mb-1">
                      <p className="font-black text-slate-800">{n.title}</p>
                      <span className="text-[10px] text-slate-400">
                        {n.created_at ? new Date(n.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ""}
                      </span>
                    </div>
                    <p className="text-slate-600 leading-relaxed">{n.message}</p>
                    <div className="mt-2 flex justify-between items-center text-[10px] text-slate-400">
                      <span>From: {n.sender_name || "Admin"}</span>
                      {n.type === "loan" && (
                        <span className="text-emerald-700 font-black hover:underline">
                          View Loans →
                        </span>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* SIDEBAR */}
      <div className="hidden md:flex md:w-60 bg-slate-900 border-r border-slate-700 flex-col p-5 flex-shrink-0">
        <div className="mb-8">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-emerald-600 flex items-center justify-center text-white font-black text-sm">HR</div>
              <div>
                <p className="font-black text-white text-sm">{user?.name?.split(" ")[0]}</p>
                <p className="text-xs text-slate-400 uppercase tracking-widest">Manager</p>
              </div>
            </div>

            {/* 🔔 Notification Bell Button */}
            <button
              onClick={() => setShowNotificationsModal(true)}
              className="relative p-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg transition"
              title="Notifications"
            >
              🔔
              {unreadNotificationsCount > 0 && (
                <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[9px] font-black w-4 h-4 rounded-full flex items-center justify-center animate-pulse">
                  {unreadNotificationsCount}
                </span>
              )}
            </button>
          </div>
          <div className="h-px bg-slate-700" />
        </div>

        <nav className="space-y-0.5 flex-1">
          {TABS.map(t => (
            <button key={t.key} onClick={() => setTab(t.key)}
              className={`w-full text-left px-3 py-2.5 rounded-lg text-sm transition-all ${tab === t.key ? "bg-emerald-600 text-white font-bold" : "text-slate-400 hover:bg-slate-800 hover:text-white"}`}>
              {t.label}
            </button>
          ))}
        </nav>
        <div className="mt-4 pt-4 border-t border-slate-700 space-y-1 text-xs text-slate-500">
          <p>Members: <span className="text-slate-300 font-bold">{stats.total || 0}</span></p>
          <p>Pending: <span className="text-amber-400 font-bold">{stats.pending || 0}</span></p>
          <p className="text-xs text-slate-600 mt-2 italic">Deactivations are permanently audited</p>
        </div>
      </div>

      {/* MAIN CONTENT AREA */}
      <div className="flex-1 bg-slate-50 overflow-y-auto">

        {/* ══ MEMBERS ══ */}
        {tab === "members" && (
          <div className="p-8">
            <h2 className="text-2xl font-black text-slate-800 mb-2">👥 Member Management</h2>
            <p className="text-sm text-slate-400 mb-6">Create, edit, approve, and manage SACCO members.</p>

            <div className="grid grid-cols-4 gap-4 mb-6">
              {[
                { label: "Total Members", value: stats.total || 0, color: "bg-blue-50 border-blue-200 text-blue-700" },
                { label: "Pending", value: stats.pending || 0, color: "bg-amber-50 border-amber-200 text-amber-700" },
                { label: "Owners", value: stats.owners || 0, color: "bg-purple-50 border-purple-200 text-purple-700" },
                { label: "Drivers", value: stats.drivers || 0, color: "bg-emerald-50 border-emerald-200 text-emerald-700" },
              ].map((s, i) => (
                <div key={i} className={`border rounded-xl p-4 ${s.color}`}>
                  <p className="text-2xl font-black">{s.value}</p>
                  <p className="text-xs opacity-70">{s.label}</p>
                </div>
              ))}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="lg:col-span-2">
                <input placeholder="Search members..." value={search} onChange={e => { setSearch(e.target.value); setPage(1); }}
                  className="border border-slate-300 rounded-lg p-2.5 text-sm focus:border-blue-500 outline-none w-full mb-4 bg-white" />
                <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-800 text-white">
                      <tr>
                        <th className="p-3 text-left">Member</th>
                        <th className="p-3 text-left">Role</th>
                        <th className="p-3 text-left">Phone</th>
                        <th className="p-3 text-left">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {paginatedMembers.map(m => (
                        <tr key={m.id} className="border-b border-slate-100 hover:bg-slate-50">
                          <td className="p-3">
                            <p className="font-bold">{m.name}</p>
                            <p className="text-xs text-slate-400">{m.membership_no}</p>
                          </td>
                          <td className="p-3"><span className="capitalize text-xs bg-slate-100 px-2 py-0.5 rounded font-bold">{m.role}</span></td>
                          <td className="p-3 text-xs text-slate-500">{m.phone}</td>
                          <td className="p-3 flex gap-2">
                            <button onClick={() => { setSelectedMember(m); setEditForm({ name: m.name, membership_no: m.membership_no, national_id: m.national_id, phone: m.phone, role: m.role }); }}
                              className="bg-blue-100 text-blue-700 text-xs px-2 py-1 rounded font-bold hover:bg-blue-200">Edit</button>
                            <button onClick={() => setViewMemberStatement(m.id)}
                              className="bg-purple-100 text-purple-700 text-xs px-2.5 py-1 rounded-lg font-bold hover:bg-purple-200">
                              💳 Statement
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <div className="p-3 flex justify-between items-center bg-slate-50 border-t text-xs">
                    <span className="text-slate-400">{filteredMembers.length} members</span>
                    <div className="flex gap-2">
                      <button disabled={page === 1} onClick={() => setPage(p => p - 1)} className="px-3 py-1 bg-slate-200 rounded disabled:opacity-40">Prev</button>
                      <span className="text-slate-400">Page {page}/{totalPages || 1}</span>
                      <button disabled={page >= totalPages} onClick={() => setPage(p => p + 1)} className="px-3 py-1 bg-slate-200 rounded disabled:opacity-40">Next</button>
                    </div>
                  </div>
                </div>

                {pending.length > 0 && (
                  <div className="mt-6 bg-white rounded-xl border border-amber-200 overflow-hidden">
                    <div className="bg-amber-50 px-4 py-3 border-b border-amber-200">
                      <h3 className="font-black text-amber-800 text-sm">⏳ Pending Approvals ({pending.length})</h3>
                    </div>
                    {pending.map(m => (
                      <div key={m.id} className="flex justify-between items-center p-3 border-b border-slate-100">
                        <div>
                          <p className="font-bold text-sm">{m.name}</p>
                          <p className="text-xs text-slate-400">{m.membership_no} · <span className="capitalize">{m.role}</span> · {m.phone}</p>
                        </div>
                        <div className="flex gap-2">
                          <button onClick={() => approveMember(m.id, m.membership_no)} className="bg-emerald-500 text-white text-xs px-3 py-1 rounded font-bold">Approve</button>
                          <button onClick={() => rejectMember(m.id, m.membership_no)} className="bg-orange-400 text-white text-xs px-3 py-1 rounded font-bold">Reject</button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Right Panel: Edit / Register Member */}
              <div className="space-y-4">
                {selectedMember && (
                  <div className="bg-white rounded-xl border border-slate-200 p-5">
                    <div className="flex justify-between items-center mb-3">
                      <h3 className="font-black text-slate-700 text-sm">Edit Member</h3>
                      <button onClick={() => setSelectedMember(null)} className="text-slate-400 hover:text-slate-700">✕</button>
                    </div>
                    <div className="space-y-2">
                      {[["name", "Full Name"], ["membership_no", "Membership No"], ["national_id", "National ID"], ["phone", "Phone"]].map(([f, l]) => (
                        <div key={f}>
                          <label className="text-xs text-slate-400 uppercase tracking-widest mb-0.5 block">{l}</label>
                          <input value={editForm[f] || ""} onChange={e => setEditForm({ ...editForm, [f]: e.target.value })}
                            className="w-full border border-slate-300 rounded-lg p-2 text-sm outline-none focus:border-blue-500" />
                        </div>
                      ))}
                      <div>
                        <label className="text-xs text-slate-400 uppercase tracking-widest mb-0.5 block">Role</label>
                        <select value={editForm.role} onChange={e => setEditForm({ ...editForm, role: e.target.value })}
                          className="w-full border border-slate-300 rounded-lg p-2 text-sm outline-none focus:border-blue-500">
                          {["member", "owner", "driver", "conductor", "stage_operator", "sub_stage_operator", "hr", "director"].map(r => (
                            <option key={r} value={r}>{r.replace(/_/g, " ")}</option>
                          ))}
                        </select>
                      </div>
                      <button onClick={updateMember} className="w-full bg-blue-600 text-white font-black py-2 rounded-lg text-sm hover:bg-blue-700">Save Changes</button>
                    </div>
                  </div>
                )}

                <div className="bg-white rounded-xl border border-slate-200 p-5">
                  <h3 className="font-black text-slate-700 text-sm mb-3">+ Register New Member</h3>
                  <div className="space-y-2">
                    {[["membership_no", "Membership No"], ["name", "Full Name"], ["national_id", "National ID"], ["phone", "Phone"]].map(([f, l]) => (
                      <input key={f} placeholder={l} value={createForm[f]}
                        onChange={e => setCreateForm({ ...createForm, [f]: e.target.value })}
                        className="w-full border border-slate-300 rounded-lg p-2 text-sm outline-none focus:border-blue-500" />
                    ))}
                    <input type="password" placeholder="Password" value={createForm.password}
                      onChange={e => setCreateForm({ ...createForm, password: e.target.value })}
                      className="w-full border border-slate-300 rounded-lg p-2 text-sm outline-none focus:border-blue-500" />
                    <select value={createForm.role} onChange={e => setCreateForm({ ...createForm, role: e.target.value })}
                      className="w-full border border-slate-300 rounded-lg p-2 text-sm outline-none focus:border-blue-500">
                      {["member", "owner", "driver", "conductor", "stage_operator", "sub_stage_operator", "hr"].map(r => (
                        <option key={r} value={r}>{r.replace(/_/g, " ")}</option>
                      ))}
                    </select>

                    <div className="border-t border-slate-100 pt-3 mt-3">
                      <label className="flex items-center gap-2 cursor-pointer mb-2">
                        <input type="checkbox" checked={hasExistingLoan} onChange={e => setHasExistingLoan(e.target.checked)}
                          className="w-4 h-4 accent-emerald-600" />
                        <span className="text-xs font-bold text-slate-600">This member already has an existing loan</span>
                      </label>

                      {hasExistingLoan && (
                        <div className="space-y-2 bg-slate-50 rounded-lg p-3 border border-slate-200 mt-2">
                          <label className="text-xs font-bold text-slate-700 block">Select Loan Type</label>
                          <select value={existingLoan.loan_type_id}
                            onChange={e => {
                              const lt = loanTypesForHR.find(t => t.id === parseInt(e.target.value));
                              setExistingLoan({ ...existingLoan, loan_type_id: e.target.value, interest_rate: lt?.interest_rate || "" });
                            }}
                            className="w-full border border-slate-300 rounded-lg p-2 text-sm outline-none focus:border-blue-500">
                            <option value="">Select loan type...</option>
                            {loanTypesForHR.map(lt => <option key={lt.id} value={lt.id}>{lt.name}</option>)}
                          </select>

                          <div className="grid grid-cols-2 gap-2">
                            <div>
                              <label className="text-[10px] text-slate-500 uppercase font-bold block mb-0.5">Loan Amount (KES)</label>
                              <input type="number" placeholder="Amount (KES)" value={existingLoan.amount}
                                onChange={e => setExistingLoan({ ...existingLoan, amount: e.target.value })}
                                className="w-full border border-slate-300 rounded-lg p-2 text-sm outline-none focus:border-blue-500" />
                            </div>
                            <div>
                              <label className="text-[10px] text-slate-500 uppercase font-bold block mb-0.5">Interest Rate %</label>
                              <input type="number" placeholder="Interest rate %" value={existingLoan.interest_rate}
                                onChange={e => setExistingLoan({ ...existingLoan, interest_rate: e.target.value })}
                                className="w-full border border-slate-300 rounded-lg p-2 text-sm outline-none focus:border-blue-500" />
                            </div>
                            <div>
                              <label className="text-[10px] text-slate-500 uppercase font-bold block mb-0.5">Repayment Months</label>
                              <input type="number" placeholder="Repayment months" value={existingLoan.repayment_months}
                                onChange={e => setExistingLoan({ ...existingLoan, repayment_months: e.target.value })}
                                className="w-full border border-slate-300 rounded-lg p-2 text-sm outline-none focus:border-blue-500" />
                            </div>
                            <div>
                              <label className="text-[10px] text-slate-500 uppercase font-bold block mb-0.5">Already Repaid (KES)</label>
                              <input type="number" placeholder="Already repaid (KES)" value={existingLoan.amount_repaid}
                                onChange={e => setExistingLoan({ ...existingLoan, amount_repaid: e.target.value })}
                                className="w-full border border-slate-300 rounded-lg p-2 text-sm outline-none focus:border-blue-500" />
                            </div>
                          </div>

                          <div className="grid grid-cols-2 gap-2 border-t border-slate-200 pt-2">
                            <div>
                              <label className="text-[10px] text-slate-600 uppercase font-bold block mb-0.5">📅 Date Loan Received</label>
                              <input type="date" value={existingLoan.received_date}
                                onChange={e => setExistingLoan({ ...existingLoan, received_date: e.target.value })}
                                className="w-full border border-slate-300 rounded-lg p-2 text-sm outline-none focus:border-blue-500 bg-white" />
                            </div>
                            <div>
                              <label className="text-[10px] text-slate-600 uppercase font-bold block mb-0.5">📅 Repayment Start Date</label>
                              <input type="date" value={existingLoan.start_date}
                                onChange={e => setExistingLoan({ ...existingLoan, start_date: e.target.value })}
                                className="w-full border border-slate-300 rounded-lg p-2 text-sm outline-none focus:border-blue-500 bg-white" />
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                    <button onClick={createMember} className="w-full bg-emerald-600 text-white font-black py-2 rounded-lg text-sm hover:bg-emerald-700">Create Member</button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ══ MATATUS ══ */}
        {tab === "matatus" && <Matatu />}

        {/* ══ ROUTES ══ */}
        {tab === "routes" && <Routes />}

        {/* ══ LOANS ══ */}
        {tab === "loans" && (
          <div className="p-8">
            <h2 className="text-2xl font-black text-slate-800 mb-2">💼 Loan Evaluation & Approvals</h2>
            <p className="text-sm text-slate-500 mb-6">HR verifies loan requests and sends them to Admin for final authorization. Deactivation soft-deletes voided records.</p>

            {/* Filter Bar */}
            <div className="flex gap-3 mb-4 flex-wrap">
              <input placeholder="Search member, membership no..." value={loanSearch} onChange={e => setLoanSearch(e.target.value)}
                className="flex-1 border border-slate-300 rounded-lg p-2.5 text-sm outline-none focus:border-blue-500 bg-white" />
              <select value={loanFilter} onChange={e => setLoanFilter(e.target.value)}
                className="border border-slate-300 rounded-lg p-2.5 text-sm outline-none focus:border-blue-500 bg-white font-bold">
                <option value="all">Active Applications</option>
                {["pending", "guarantors_pending", "hr_approved", "approved", "rejected", "disbursed", "repaying", "cleared", "defaulted", "info_required", "deactivated"].map(s => (
                  <option key={s} value={s}>{s.replace("_", " ")}</option>
                ))}
              </select>
            </div>

            {/* 3-COLUMN GRID */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

              {/* LEFT COLUMN: LOANS LIST */}
              <div className="lg:col-span-1 space-y-3">
                {filteredLoans.length === 0 ? (
                  <div className="bg-white border border-slate-200 rounded-xl p-8 text-center text-slate-400 font-bold">No loans found</div>
                ) : filteredLoans.map(loan => (
                  <div key={loan.id} onClick={() => handleSelectLoan(loan)}
                    className={`bg-white border rounded-xl p-4 cursor-pointer hover:shadow-md transition-all ${selectedLoan?.id === loan.id ? "border-emerald-500 ring-2 ring-emerald-200" : "border-slate-200"}`}>
                    <div className="flex justify-between items-start mb-2">
                      <div>
                        <p className="font-black text-slate-800">{loan.member_name}</p>
                        <p className="text-xs text-slate-400">{loan.membership_no}</p>
                      </div>
                      <div className="flex flex-col items-end gap-1">
                        <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${LOAN_STATUS_COLORS[loan.status] || "bg-slate-100"}`}>
                          {loan.status === "hr_approved" ? "⏳ Awaiting Admin Approval" : loan.status?.replace("_", " ")}
                        </span>
                        {loan.pending_edit && (
                          <span className="text-[10px] px-2 py-0.5 rounded-full font-black bg-amber-100 text-amber-800 animate-pulse border border-amber-300">
                            ⚠️ Edit Pending Admin
                          </span>
                        )}
                        {loan.purpose?.toLowerCase().includes("existing") && (
                          <span className="text-[10px] px-2 py-0.5 rounded-full font-bold bg-slate-200 text-slate-600">📋 Onboarded</span>
                        )}
                      </div>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="font-black text-slate-800">KES {loan.amount?.toLocaleString()}</span>
                      <span className="text-slate-400 text-xs">{loan.loan_type}</span>
                    </div>
                    <p className="text-xs text-slate-400 mt-1 truncate">{loan.purpose}</p>
                    {loan.penalty > 0 && <p className="text-xs text-red-600 mt-1 font-bold">⚠️ Penalty: KES {loan.penalty?.toLocaleString()}</p>}
                  </div>
                ))}
              </div>

              {/* RIGHT COLUMN: LOAN DETAILS */}
              <div className="lg:col-span-2">
                {selectedLoan ? (
                  <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm space-y-6">
                    {/* Header Controls */}
                    <div className="flex justify-between items-center border-b pb-3">
                      <div>
                        <h3 className="font-black text-slate-800 text-lg">Loan #{selectedLoan.id} — {selectedLoan.member_name}</h3>
                        <p className="text-xs text-slate-400">{selectedLoan.membership_no}</p>
                      </div>
                      <div className="flex gap-2 items-center">
                        <button
                          onClick={() => {
                            setEditLoanForm({
                              amount: selectedLoan.amount || "",
                              interest_rate: selectedLoan.interest_rate || "",
                              repayment_months: selectedLoan.repayment_months || "",
                              purpose: selectedLoan.purpose || "",
                              notes: ""
                            });
                            setShowEditLoanModal(true);
                          }}
                          className="bg-amber-100 hover:bg-amber-200 text-amber-900 text-xs px-3 py-1.5 rounded-lg font-bold transition flex items-center gap-1 shadow-sm"
                        >
                          ✏️ Propose Loan Edit
                        </button>
                        <button onClick={() => {
                          const memberId = getLoanMemberId(selectedLoan);
                          if (memberId) setViewMemberStatement(memberId);
                          else showToast("Could not locate Member ID for this loan", "error");
                        }}
                          className="bg-purple-100 text-purple-700 text-xs px-3 py-1.5 rounded-lg font-bold hover:bg-purple-200">
                          💳 Member Statement
                        </button>
                        <button onClick={() => setSelectedLoan(null)} className="text-slate-400 hover:text-slate-700 font-bold ml-2">✕</button>
                      </div>
                    </div>

                    {/* Pending Edit Notice Box */}
                    {selectedLoan.pending_edit && (
                      <div className="bg-amber-50 border-2 border-amber-300 rounded-xl p-4 text-xs shadow-sm space-y-2">
                        <div className="flex justify-between items-center">
                          <p className="font-black text-amber-900 uppercase tracking-wider flex items-center gap-1.5">
                            ⏳ Proposed Changes Pending Admin Approval
                          </p>
                          <span className="text-[10px] text-amber-700 font-bold">
                            By {selectedLoan.pending_edit.proposed_by_name} ({selectedLoan.pending_edit.proposed_at?.split("T")[0]})
                          </span>
                        </div>
                        <p className="text-slate-600 text-xs leading-relaxed">
                          Your submitted adjustments are in queue. The current loan values will remain active until the Administrator authorizes them.
                        </p>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 bg-white/90 p-2.5 rounded-lg border border-amber-200">
                          <div>
                            <span className="text-[10px] text-slate-400 block font-bold">Principal</span>
                            <span className="text-slate-400 line-through">KES {selectedLoan.pending_edit.old_amount?.toLocaleString()}</span>
                            <span className="text-emerald-700 font-black block">→ KES {selectedLoan.pending_edit.amount?.toLocaleString()}</span>
                          </div>
                          <div>
                            <span className="text-[10px] text-slate-400 block font-bold">Interest Rate</span>
                            <span className="text-slate-400 line-through">{selectedLoan.pending_edit.old_interest_rate}%</span>
                            <span className="text-emerald-700 font-black block">→ {selectedLoan.pending_edit.interest_rate}%</span>
                          </div>
                          <div>
                            <span className="text-[10px] text-slate-400 block font-bold">Months</span>
                            <span className="text-slate-400 line-through">{selectedLoan.pending_edit.old_repayment_months} mos</span>
                            <span className="text-emerald-700 font-black block">→ {selectedLoan.pending_edit.repayment_months} mos</span>
                          </div>
                          <div>
                            <span className="text-[10px] text-slate-400 block font-bold">Total Payable</span>
                            <span className="text-slate-400 line-through">KES {selectedLoan.pending_edit.old_total_payable?.toLocaleString()}</span>
                            <span className="text-emerald-700 font-black block">→ KES {selectedLoan.pending_edit.total_payable?.toLocaleString()}</span>
                          </div>
                        </div>
                        {selectedLoan.pending_edit.notes && (
                          <p className="text-[11px] text-slate-600 italic">
                            HR Reason/Notes: "{selectedLoan.pending_edit.notes}"
                          </p>
                        )}
                      </div>
                    )}

                    {/* Financial KPI Summary */}
                    <div className="grid grid-cols-3 gap-3 bg-slate-50 p-4 rounded-xl border text-sm">
                      <div>
                        <span className="text-slate-400 text-xs block font-bold">Total Payable</span>
                        <span className="font-black text-slate-800">KES {selectedLoan.total_payable?.toLocaleString()}</span>
                      </div>
                      <div>
                        <span className="text-slate-400 text-xs block font-bold">Repaid</span>
                        <span className="font-black text-emerald-600">KES {selectedLoan.amount_repaid?.toLocaleString()}</span>
                      </div>
                      <div>
                        <span className="text-slate-400 text-xs block font-bold">Balance</span>
                        <span className="font-black text-red-600">KES {selectedLoan.balance?.toLocaleString()}</span>
                      </div>
                    </div>

                    {/* Additional Loan Details */}
                    <div className="space-y-1 text-sm border-t border-b border-slate-100 py-3">
                      {[
                        ["Loan Type", selectedLoan.loan_type],
                        ["Interest Rate", `${selectedLoan.interest_rate}%`],
                        ["Monthly Installment", `KES ${selectedLoan.monthly_installment?.toLocaleString()}`],
                        ["Status", selectedLoan.status?.replace("_", " ").toUpperCase()],
                        ["Purpose", selectedLoan.purpose || "—"],
                      ].map(([l, v]) => (
                        <div key={l} className="flex justify-between">
                          <span className="text-slate-400 text-xs">{l}</span>
                          <span className="font-bold text-xs">{v}</span>
                        </div>
                      ))}
                    </div>

                    {/* Borrower Info Request Response Preview */}
                    {selectedLoan.borrower_response && (
                      <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                        <p className="text-xs font-bold text-blue-900 mb-1">📩 Borrower's Response to Info Request:</p>
                        <p className="text-xs text-blue-800">{selectedLoan.borrower_response}</p>
                        {selectedLoan.borrower_doc && (
                          <a href={selectedLoan.borrower_doc} target="_blank" rel="noreferrer"
                            className="inline-block mt-2 text-xs text-blue-600 underline font-bold">
                            📎 View Attached Verification File →
                          </a>
                        )}
                      </div>
                    )}

                    {/* Action Controls & Two-Tier Approvals */}
                    <div className="space-y-3">
                      <label className="text-xs text-slate-400 uppercase tracking-widest block font-bold">HR Notes / Reasons</label>
                      <textarea value={loanNotes} onChange={e => setLoanNotes(e.target.value)} rows={2} placeholder="Add notes for the approval or clarification..."
                        className="w-full border border-slate-300 rounded-lg p-2 text-sm outline-none focus:border-blue-500 resize-none bg-white" />

                      {/* Pending Step: HR Approves and forwards to Admin */}
                      {selectedLoan.status === "pending" && (
                        <div className="grid grid-cols-3 gap-2 pt-1">
                          <button onClick={() => hrRecommendLoan(selectedLoan.id)}
                            className="bg-blue-600 text-white font-black py-2.5 rounded-lg text-xs hover:bg-blue-700 shadow">
                            📋 Approve & Forward to Admin
                          </button>
                          <button onClick={() => rejectLoan(selectedLoan.id)}
                            className="bg-red-500 text-white font-black py-2.5 rounded-lg text-xs hover:bg-red-600">
                            ❌ Reject
                          </button>
                          <button onClick={() => requestMoreInfo(selectedLoan.id)}
                            className="bg-amber-400 text-white font-black py-2.5 rounded-lg text-xs hover:bg-amber-500">
                            ℹ️ Request Info
                          </button>
                        </div>
                      )}

                      {selectedLoan.status === "hr_approved" && (
                        <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-3 text-xs text-indigo-800 font-bold">
                          ⏳ Loan approved by HR. Currently awaiting final Admin authorization and disbursement.
                        </div>
                      )}

                      {/* Deactivation for Invalid / Erroneous Loans */}
                      {selectedLoan.status !== "deactivated" && (
                        <div className="pt-2">
                          <button onClick={() => deactivateLoan(selectedLoan.id)}
                            className="w-full bg-slate-200 text-slate-700 font-bold py-2 rounded-lg text-xs hover:bg-slate-300">
                            🚫 Deactivate Loan (Declare Void)
                          </button>
                        </div>
                      )}

                      {["approved", "disbursed", "repaying", "defaulted"].includes(selectedLoan.status) && (
                        <div className="border-t border-slate-100 pt-3">
                          <label className="text-xs text-slate-400 uppercase tracking-widest mb-1 block font-bold">📱 Send SMS Reminder</label>
                          <textarea value={reminderMsg} onChange={e => setReminderMsg(e.target.value)} rows={2} placeholder="Custom reminder message (or leave blank for default)..."
                            className="w-full border border-slate-300 rounded-lg p-2 text-sm outline-none focus:border-blue-500 resize-none mb-2 bg-white" />
                          <button onClick={() => sendLoanReminder(selectedLoan.id)}
                            className="w-full bg-blue-600 text-white font-black py-2.5 rounded-lg text-xs hover:bg-blue-700">📤 Send Reminder</button>
                        </div>
                      )}
                    </div>

                    {/* REPAYMENT ACCOUNT PAYMENT HISTORY & HR APPROVALS */}
                    <div className="border-t pt-4">
                      <div className="flex justify-between items-center mb-3">
                        <h4 className="font-black text-slate-800 text-sm">💳 Repayment Account Payments & Top-Ups</h4>
                        <span className="bg-emerald-100 text-emerald-800 font-bold text-xs px-2.5 py-1 rounded-full">
                          Confirmed Balance: KES {loanRepaymentAcc?.balance?.toLocaleString() || 0}
                        </span>
                      </div>

                      {loanRepaymentAcc?.transactions?.length === 0 ? (
                        <p className="text-xs text-slate-400 py-4 text-center bg-slate-50 rounded-lg font-bold">No payment history recorded for this loan.</p>
                      ) : (
                        <div className="space-y-2">
                          {loanRepaymentAcc?.transactions?.map(t => (
                            <div key={t.id} className="flex justify-between items-center p-3 bg-slate-50 rounded-xl border border-slate-200 text-xs">
                              <div>
                                <div className="flex items-center gap-2 mb-1">
                                  <span className="font-bold uppercase text-slate-700">{t.payment_method || "CASH"}</span>
                                  {t.mpesa_code && <span className="text-blue-600 font-bold">Ref: {t.mpesa_code}</span>}
                                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-black ${
                                    t.status === "approved" ? "bg-green-100 text-green-700" :
                                    t.status === "rejected" ? "bg-red-100 text-red-700" :
                                    "bg-amber-100 text-amber-800"
                                  }`}>
                                    {t.status === "approved" ? "✅ Confirmed" : t.status === "rejected" ? "❌ Rejected" : "⏳ Pending Approval"}
                                  </span>
                                </div>
                                <p className="text-slate-400">{t.date} · {t.description}</p>
                              </div>

                              <div className="flex items-center gap-3">
                                <span className="font-black text-sm text-emerald-700">+KES {t.amount?.toLocaleString()}</span>
                                {t.status === "pending" && (
                                  <div className="flex gap-1">
                                    <button onClick={() => approveRepaymentPayment(t.id)} className="bg-emerald-600 text-white px-2.5 py-1 rounded font-bold hover:bg-emerald-700">Approve</button>
                                    <button onClick={() => rejectRepaymentPayment(t.id)} className="bg-red-500 text-white px-2.5 py-1 rounded font-bold hover:bg-red-600">Reject</button>
                                  </div>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="bg-white border border-slate-200 rounded-xl p-12 text-center text-slate-400 font-bold">
                    Select a loan on the left to review details & forward for Admin authorization
                  </div>
                )}
              </div>

            </div>
          </div>
        )}

        {/* ══ HR LOAN EDIT PROPOSAL MODAL ══ */}
        {showEditLoanModal && selectedLoan && (
          <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg p-6 overflow-hidden flex flex-col">
              <div className="flex justify-between items-center border-b pb-3 mb-4">
                <div>
                  <h3 className="font-black text-slate-800 text-lg">✏️ Propose Loan Adjustments</h3>
                  <p className="text-xs text-slate-500">
                    For Loan #{selectedLoan.id} — <span className="font-bold text-slate-800">{selectedLoan.member_name}</span>
                  </p>
                </div>
                <button onClick={() => setShowEditLoanModal(false)} className="text-slate-400 hover:text-slate-700 font-bold text-lg">✕</button>
              </div>

              <div className="bg-blue-50 border border-blue-200 text-blue-900 rounded-lg p-3 text-xs leading-relaxed mb-4 font-semibold">
                ℹ️ <strong>Workflow Notice:</strong> Modifications submitted by HR do not take immediate effect. They are staged for Administrator review and will only update the active loan ledger upon Admin approval.
              </div>

              <div className="space-y-3 text-xs">
                <div>
                  <label className="text-[11px] text-slate-600 uppercase font-bold block mb-1">Loan Principal Amount (KES)</label>
                  <input
                    type="number"
                    value={editLoanForm.amount}
                    onChange={e => setEditLoanForm({ ...editLoanForm, amount: e.target.value })}
                    className="w-full border border-slate-300 rounded-lg p-2.5 text-sm outline-none focus:border-blue-500 font-bold bg-white"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[11px] text-slate-600 uppercase font-bold block mb-1">Interest Rate % p.a.</label>
                    <input
                      type="number"
                      step="0.1"
                      value={editLoanForm.interest_rate}
                      onChange={e => setEditLoanForm({ ...editLoanForm, interest_rate: e.target.value })}
                      className="w-full border border-slate-300 rounded-lg p-2.5 text-sm outline-none focus:border-blue-500 font-bold bg-white"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] text-slate-600 uppercase font-bold block mb-1">Repayment Months</label>
                    <input
                      type="number"
                      value={editLoanForm.repayment_months}
                      onChange={e => setEditLoanForm({ ...editLoanForm, repayment_months: e.target.value })}
                      className="w-full border border-slate-300 rounded-lg p-2.5 text-sm outline-none focus:border-blue-500 font-bold bg-white"
                    />
                  </div>
                </div>

                {/* Live Preview Box */}
                {Boolean(editLoanForm.amount && editLoanForm.repayment_months) && (
                  <div className="bg-slate-50 border rounded-lg p-3 grid grid-cols-2 gap-2 text-xs">
                    <div>
                      <span className="text-slate-400 block font-bold text-[10px]">Estimated Total Payable</span>
                      <span className="font-black text-slate-800 text-sm">
                        KES {(
                          parseFloat(editLoanForm.amount || 0) +
                          (parseFloat(editLoanForm.amount || 0) * parseFloat(editLoanForm.interest_rate || 0) / 100) *
                          (parseInt(editLoanForm.repayment_months || 1) / 12)
                        ).toLocaleString(undefined, { maximumFractionDigits: 0 })}
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-400 block font-bold text-[10px]">Monthly Installment</span>
                      <span className="font-black text-emerald-700 text-sm">
                        KES {(
                          (parseFloat(editLoanForm.amount || 0) +
                          (parseFloat(editLoanForm.amount || 0) * parseFloat(editLoanForm.interest_rate || 0) / 100) *
                          (parseInt(editLoanForm.repayment_months || 1) / 12)) /
                          parseInt(editLoanForm.repayment_months || 1)
                        ).toLocaleString(undefined, { maximumFractionDigits: 0 })}
                      </span>
                    </div>
                  </div>
                )}

                <div>
                  <label className="text-[11px] text-slate-600 uppercase font-bold block mb-1">Reason / Purpose</label>
                  <input
                    value={editLoanForm.purpose}
                    onChange={e => setEditLoanForm({ ...editLoanForm, purpose: e.target.value })}
                    className="w-full border border-slate-300 rounded-lg p-2.5 text-sm outline-none focus:border-blue-500 bg-white"
                  />
                </div>

                <div>
                  <label className="text-[11px] text-slate-600 uppercase font-bold block mb-1">HR Note to Administrator</label>
                  <textarea
                    rows={2}
                    placeholder="Provide justification for why this loan is being modified..."
                    value={editLoanForm.notes}
                    onChange={e => setEditLoanForm({ ...editLoanForm, notes: e.target.value })}
                    className="w-full border border-slate-300 rounded-lg p-2 text-sm outline-none focus:border-blue-500 resize-none bg-white"
                  />
                </div>
              </div>

              <div className="flex gap-2 justify-end border-t pt-4 mt-5">
                <button
                  type="button"
                  onClick={() => setShowEditLoanModal(false)}
                  className="bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold px-4 py-2 rounded-lg text-xs"
                >
                  Cancel
                </button>
                <button
                  onClick={handleProposeLoanEdit}
                  className="bg-blue-600 hover:bg-blue-700 text-white font-black px-5 py-2 rounded-lg text-xs shadow"
                >
                  Submit for Admin Approval
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ══ RECEIPTS BY ROUTE TAB ══ */}
        {tab === "receipts" && (
          <div className="p-8">
            <h2 className="text-2xl font-black text-slate-800 mb-2">🎫 Receipts by Route</h2>
            <p className="text-sm text-slate-400 mb-6">View tickets per route per day, with operator breakdown.</p>

            <div className="flex gap-3 mb-6 flex-wrap">
              <div>
                <label className="text-xs text-slate-400 uppercase tracking-widest mb-1 block">Date</label>
                <input type="date" value={receiptDate} onChange={e => setReceiptDate(e.target.value)}
                  className="border border-slate-300 rounded-lg p-2.5 text-sm outline-none focus:border-blue-500 bg-white" />
              </div>
              <div>
                <label className="text-xs text-slate-400 uppercase tracking-widest mb-1 block">Route (optional)</label>
                <select value={routeFilter} onChange={e => setRouteFilter(e.target.value)}
                  className="border border-slate-300 rounded-lg p-2.5 text-sm outline-none focus:border-blue-500 min-w-[200px] bg-white font-bold">
                  <option value="">All Routes</option>
                  {allRoutes.map(r => <option key={r.id} value={r.id}>{r.from_stage} → {r.to_stage}</option>)}
                </select>
              </div>
              <div className="flex items-end">
                <button onClick={fetchReceiptsByRoute} className="bg-blue-600 text-white font-black px-5 py-2.5 rounded-lg text-sm hover:bg-blue-700">
                  {receiptLoading ? "Loading..." : "View"}
                </button>
              </div>
            </div>

            {receiptData && (
              <>
                <div className="grid grid-cols-3 gap-4 mb-6">
                  {[
                    { label: "Total Tickets", value: receiptData.total_tickets || 0, color: "bg-blue-50 border-blue-200 text-blue-700" },
                    { label: "Total Collected", value: `KES ${(receiptData.grand_total || 0).toLocaleString()}`, color: "bg-emerald-50 border-emerald-200 text-emerald-700" },
                    { label: "Active Routes", value: receiptData.routes?.length || 0, color: "bg-purple-50 border-purple-200 text-purple-700" },
                  ].map((s, i) => (
                    <div key={i} className={`border rounded-xl p-4 ${s.color}`}>
                      <p className="text-2xl font-black">{s.value}</p>
                      <p className="text-xs opacity-70">{s.label}</p>
                    </div>
                  ))}
                </div>

                {!selectedRoute ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {(receiptData.routes || []).length === 0 ? (
                      <div className="col-span-2 bg-white border border-slate-200 rounded-xl p-8 text-center text-slate-400">
                        No receipts for {receiptDate}
                      </div>
                    ) : (receiptData.routes || []).map((route, i) => (
                      <div key={i} onClick={() => setSelectedRoute(route)}
                        className="bg-white border border-slate-200 rounded-xl p-5 cursor-pointer hover:shadow-lg hover:border-blue-300 transition-all">
                        <div className="flex justify-between items-start mb-3">
                          <div>
                            <p className="font-black text-slate-800 text-lg">{route.from_stage}</p>
                            <p className="text-slate-400 text-sm">→ {route.to_stage}</p>
                          </div>
                          <div className="text-right">
                            <p className="text-2xl font-black text-emerald-700">KES {route.total?.toLocaleString()}</p>
                            <p className="text-xs text-slate-400">{route.count} tickets</p>
                          </div>
                        </div>
                        <div className="border-t border-slate-100 pt-3">
                          <p className="text-xs text-slate-400 mb-2">Operators:</p>
                          <div className="flex flex-wrap gap-2">
                            {(route.operators || []).map((op, j) => (
                              <span key={j} className="text-xs bg-blue-50 border border-blue-200 text-blue-700 px-2 py-0.5 rounded font-bold">
                                {op.name} · {op.count} tickets · KES {op.total?.toLocaleString()}
                              </span>
                            ))}
                          </div>
                        </div>
                        <p className="text-xs text-blue-600 font-bold mt-3">Click to view all tickets →</p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div>
                    <button onClick={() => setSelectedRoute(null)}
                      className="flex items-center gap-2 text-blue-600 font-bold text-sm mb-4 hover:underline">
                      ← Back to routes
                    </button>
                    <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                      <div className="bg-slate-800 text-white px-5 py-4 flex justify-between items-center">
                        <div>
                          <h3 className="font-black text-lg">{selectedRoute.from_stage} → {selectedRoute.to_stage}</h3>
                          <p className="text-slate-400 text-sm">{receiptDate}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-xl font-black text-emerald-400">KES {selectedRoute.total?.toLocaleString()}</p>
                          <p className="text-slate-400 text-sm">{selectedRoute.count} tickets</p>
                        </div>
                      </div>

                      <table className="w-full text-sm">
                        <thead className="bg-slate-100 text-slate-600">
                          <tr>
                            <th className="p-3 text-left">Ticket</th>
                            <th className="p-3 text-left">Plate</th>
                            <th className="p-3 text-left">Amount</th>
                            <th className="p-3 text-left">Payment</th>
                            <th className="p-3 text-left">Time</th>
                            <th className="p-3 text-left">Operator</th>
                          </tr>
                        </thead>
                        <tbody>
                          {(selectedRoute.receipts || []).map(r => (
                            <tr key={r.id} className="border-b border-slate-100 hover:bg-slate-50">
                              <td className="p-3 font-bold text-blue-700">{r.ticket_number}</td>
                              <td className="p-3 font-bold">{r.plate}</td>
                              <td className="p-3 font-black text-emerald-700">KES {r.shimo_fee?.toLocaleString()}</td>
                              <td className="p-3 text-xs"><span className="bg-slate-100 px-2 py-0.5 rounded font-bold">{r.mode_of_payment}</span></td>
                              <td className="p-3 text-xs text-slate-400">{r.time_issued}</td>
                              <td className="p-3 text-xs text-slate-500">{r.operator_membership_no}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* ════════════════ MONITOR WORKERS TAB ════════════════ */}
        {tab === "workers" && <MonitorWorkers userRole="hr" />}

        {/* ════════════════ RECEIPT SETTINGS TAB ════════════════ */}
        {tab === "settings" && (
          <div className="p-8">
            <h2 className="text-2xl font-black text-slate-800 mb-2">⚙️ Receipt Settings</h2>
            <p className="text-sm text-slate-400 mb-6">Configure the SACCO information printed on all receipts generated by stage operators.</p>
            <div className="bg-white rounded-xl border border-slate-200 p-6 max-w-xl">
              <div className="space-y-4">
                <div>
                  <label className="text-xs text-slate-500 font-bold uppercase tracking-widest block mb-1">SACCO / Company Name</label>
                  <input value={saccoSettings.sacco_name || ""} onChange={e => setSaccoSettings({ ...saccoSettings, sacco_name: e.target.value })} className="w-full border border-slate-300 rounded-lg p-2.5 text-sm outline-none focus:border-blue-500 bg-white text-slate-900 placeholder-slate-400" placeholder="e.g. 2KM SACCO" />
                </div>
                <div>
                  <label className="text-xs text-slate-500 font-bold uppercase tracking-widest block mb-1">Location / Office Address</label>
                  <input value={saccoSettings.location || ""} onChange={e => setSaccoSettings({ ...saccoSettings, location: e.target.value })} className="w-full border border-slate-300 rounded-lg p-2.5 text-sm outline-none focus:border-blue-500 bg-white text-slate-900 placeholder-slate-400" placeholder="e.g. Mombasa Central Office" />
                </div>
                <div>
                  <label className="text-xs text-slate-500 font-bold uppercase tracking-widest block mb-1">P.O. Box</label>
                  <input value={saccoSettings.po_box || ""} onChange={e => setSaccoSettings({ ...saccoSettings, po_box: e.target.value })} className="w-full border border-slate-300 rounded-lg p-2.5 text-sm outline-none focus:border-blue-500 bg-white text-slate-900 placeholder-slate-400" placeholder="e.g. PO Box 12345 - 80100" />
                </div>
                <div>
                  <label className="text-xs text-slate-500 font-bold uppercase tracking-widest block mb-1">Telephone / Hotline Number</label>
                  <input value={saccoSettings.phone_number || ""} onChange={e => setSaccoSettings({ ...saccoSettings, phone_number: e.target.value })} className="w-full border border-slate-300 rounded-lg p-2.5 text-sm outline-none focus:border-blue-500 bg-white text-slate-900 placeholder-slate-400" placeholder="e.g. +254 712 345 678" />
                </div>
                <button onClick={saveSaccoSettings} disabled={updatingSacco} className="w-full bg-blue-600 text-white py-2.5 rounded-lg text-sm hover:bg-blue-700 disabled:opacity-50 font-bold">
                  {updatingSacco ? "Saving..." : "Save Receipt Settings"}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ══ AUDIT LOG ══ */}
        {tab === "audit" && (
          <div className="p-8">
            <h2 className="text-2xl text-slate-800 mb-1 font-bold">📋 Permanent Audit Log</h2>
            <p className="text-sm text-slate-400 mb-6">Immutable record of all HR and admin actions. Cannot be deleted.</p>

            <div className="flex gap-3 mb-5 flex-wrap">
              <input placeholder="Search action, member, or HR name..." value={auditSearch} onChange={e => setAuditSearch(e.target.value)}
                className="flex-1 border border-slate-300 rounded-lg p-2.5 text-sm outline-none focus:border-blue-500 bg-white" />
              <select value={auditCategory} onChange={e => setAuditCategory(e.target.value)}
                className="border border-slate-300 rounded-lg p-2.5 text-sm outline-none focus:border-blue-500 bg-white font-bold">
                <option value="all">All Categories</option>
                {["member", "loan", "matatu", "route", "worker", "receipt"].map(c => (
                  <option key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</option>
                ))}
              </select>
            </div>

            <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-slate-800 text-white">
                  <tr>
                    <th className="p-3 text-left">Action</th>
                    <th className="p-3 text-left">Category</th>
                    <th className="p-3 text-left">Member</th>
                    <th className="p-3 text-left">Performed By</th>
                    <th className="p-3 text-left">Details</th>
                    <th className="p-3 text-left">Timestamp</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredAudit.map(a => (
                    <tr key={a.id} className="border-b border-slate-100 hover:bg-slate-50">
                      <td className="p-3"><span className="font-bold text-blue-700 text-xs">{a.action}</span></td>
                      <td className="p-3"><span className="capitalize text-xs bg-slate-100 px-2 py-0.5 rounded font-bold text-slate-600">{a.category}</span></td>
                      <td className="p-3 text-xs text-slate-500">{a.membership_no || "—"}</td>
                      <td className="p-3 font-bold text-emerald-700 text-xs">{a.performed_by_name}</td>
                      <td className="p-3 text-xs text-slate-400 max-w-xs truncate">{a.details || "—"}</td>
                      <td className="p-3 text-xs text-slate-400">{new Date(a.created_at).toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ══ UNIFIED SAVINGS ══ */}
        {tab === "savings" && (
          <div className="p-8">
            <Savings />
          </div>
        )}

        {/* ══ STAGE AUDITS ══ */}
        {tab === "stageAudits" && (
          <div className="p-8">
            <HRStageAuditsAndReports user={user} />
          </div>
        )}
      </div>
    </div>
  );
}