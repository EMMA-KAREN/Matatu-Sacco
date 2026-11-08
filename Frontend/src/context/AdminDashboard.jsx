import { useEffect, useState, useCallback } from "react";
import { useAuth } from "../context/AuthContext";
import API from "../api";
import Matatu from "../pages/Matatus";
import Savings from "../components/Savings";
import LoanRequirements from "../components/LoanRequirements"; // <-- ADD THIS
import LoanSecurity from "../components/LoanSecurity";

const tok = () => localStorage.getItem("token");
const hdr = (json = true) => ({
  Authorization: `Bearer ${tok()}`,
  ...(json ? { "Content-Type": "application/json" } : {})
});
const authGet  = (url) => fetch(`${API}${url}`, { headers: hdr() }).then(r => r.ok ? r.json() : []);
const authPost = (url, body) => fetch(`${API}${url}`, { method: "POST", headers: hdr(), body: JSON.stringify(body) });
const authPut = (url, body = {}) => fetch(`${API}${url}`, { 
  method: "PUT", 
  headers: hdr(), 
  body: JSON.stringify(body) 
});
const authDel  = (url) => fetch(`${API}${url}`, { method: "DELETE", headers: hdr() });

const LOAN_STATUS_COLORS = {
  pending:            "bg-yellow-100 text-yellow-800",
  guarantors_pending: "bg-blue-100 text-blue-800",
  approved:           "bg-green-100 text-green-700",
  rejected:           "bg-red-100 text-red-700",
  disbursed:          "bg-purple-100 text-purple-800",
  repaying:           "bg-cyan-100 text-cyan-800",
  cleared:            "bg-green-200 text-green-900",
  defaulted:          "bg-red-200 text-red-900",
  info_required:      "bg-orange-100 text-orange-800",
  guarantor_rejected: "bg-red-100 text-red-700",
  hr_approved:        "bg-emerald-100 text-emerald-800 font-bold",
  requirements_pending: "bg-amber-100 text-amber-900 border border-amber-300 font-bold", 
  deactivated:        "bg-slate-200 text-slate-700"
};
const RISK_COLORS = { High: "text-red-600", Medium: "text-yellow-600", Low: "text-green-600" };

const TABS = [
  { key: "overview", label: "📊 Overview" },
  { key: "members",  label: "👥 Members" },
  { key: "matatus-register", label: "➕ Register Matatu" },
  { key: "matatus",  label: "🚐 Matatus" },
  { key: "routes",   label: "🗺️ Routes" },
  { key: "loans",    label: "💼 Loans" },
  { key: "savings",  label: "🏦 Savings" },
  { key: "stage-review",     label: "🛡️ Stage Reviews & Splits" },
  { key: "payments", label: "💳 Sacco Payments" },
  { key: "receipts", label: "🎫 Receipts by Route" },
  { key: "workers",  label: "👷 Monitor Workers" },
  { key: "salary",   label: "💵 Salary & Pay" },
  { key: "settings", label: "⚙️ Receipt Settings" },
  { key: "ledger",   label: "📈 Chart of Accounts" }, 
  { key: "audit",    label: "📋 Audit Log" },
];

const inp  = "w-full border border-slate-300 rounded-lg p-2 text-sm outline-none focus:border-blue-500 bg-white text-slate-900 placeholder-slate-400";
const inp3 = "w-full border border-slate-300 rounded-lg p-2.5 text-sm outline-none focus:border-blue-500 bg-white text-slate-900 placeholder-slate-400";

// Helper to safely parse pending_edit whether it is JSON string, double-stringified, or Object
const parsePendingEdit = (pendingEdit) => {
  if (!pendingEdit) return null;
  let parsed = pendingEdit;
  
  // Unwrap if double-stringified
  while (typeof parsed === "string") {
    try {
      const next = JSON.parse(parsed);
      if (next === parsed) break;
      parsed = next;
    } catch {
      break;
    }
  }
  
  if (parsed && typeof parsed === "object") {
    return parsed;
  }
  // Fallback so buttons never disappear
  return { amount: 0, notes: String(pendingEdit) };
};

function Toast({ msg, type, onClose }) {
  useEffect(() => { const t = setTimeout(onClose, 3500); return () => clearTimeout(t); }, [onClose]);
  return (
    <div className={`fixed top-5 right-5 z-[200] px-5 py-3 rounded-xl shadow-2xl text-sm font-bold
      ${type === "error" ? "bg-red-500 text-white" : "bg-emerald-500 text-white"}`}>
      {msg}
    </div>
  );
}

export default function AdminDashboard() {
  const { user, logout } = useAuth();
  const [tab, setTab] = useState("overview");
  const [toast, setToast] = useState(null);
  const showToast = (msg, type = "success") => setToast({ msg, type });
 
   // ── NOTIFICATIONS STATE ──
  const [notifications, setNotifications] = useState([]);
  const [showNotificationsModal, setShowNotificationsModal] = useState(false);

  // stats
  const [stats, setStats] = useState({});
  
  // Admin password reset modal state
  const [adminResetMember, setAdminResetMember] = useState(null);
  const [adminNewPassword, setAdminNewPassword] = useState("");
  const [showAdminResetPwd, setShowAdminResetPwd] = useState(false);
  
  // members
  const [members, setMembers]   = useState([]);
  const [pending, setPending]   = useState([]);
  const [memberSearch, setMemberSearch] = useState("");
  const [memberPage, setMemberPage]     = useState(1);
  const [selectedMember, setSelectedMember] = useState(null);
  const [editForm, setEditForm]   = useState({});
  const [createForm, setCreateForm] = useState({ membership_no:"", name:"", national_id:"", phone:"", password:"", role:"member" });
  const [showCreateMemberModal, setShowCreateMemberModal] = useState(false);
  const [showCreateMemberPwd, setShowCreateMemberPwd] = useState(false);
  const PER_PAGE = 20;

  // matatus
  const [matatus, setMatatus]             = useState([]);
  const [routes, setRoutes]               = useState([]);
  const [selectedMatatu, setSelectedMatatu] = useState(null);
  const [matatuSearch, setMatatuSearch]   = useState("");
  const [assignRouteId, setAssignRouteId] = useState("");

  // routes
  const [routeForm, setRouteForm]         = useState({ from_stage:"", to_stage:"", shimo_fee:"", subsequent_fee:"100" });
  const [editingRouteId, setEditingRouteId] = useState(null);
  const [editRouteForm, setEditRouteForm] = useState({});
  const [routeSearch, setRouteSearch]     = useState("");

  // report parameters
  const [reportMonth, setReportMonth] = useState(new Date().toISOString().slice(0, 7));
  const [loanReportPeriod, setLoanReportPeriod] = useState(new Date().toISOString().slice(0, 7));
  const [loanReportType, setLoanReportType] = useState("monthly");

  // loans
  const [loans, setLoans]                 = useState([]);
  const [loanTypes, setLoanTypes]         = useState([]);
  const [selectedLoan, setSelectedLoan]   = useState(null);
  const [loanNotes, setLoanNotes]         = useState("");
  const [loanSearch, setLoanSearch]       = useState("");
  const [loanFilter, setLoanFilter]       = useState("all");
  const [penaltyAmt, setPenaltyAmt]       = useState("");
  const [penaltyReason, setPenaltyReason] = useState("");

  // Admin Direct Loan Edit Modal state
  const [showAdminEditLoanModal, setShowAdminEditLoanModal] = useState(false);
  const [adminEditLoanForm, setAdminEditLoanForm] = useState({
    amount: "",
    interest_rate: "",
    repayment_months: "",
    purpose: ""
  });

  const [ltForm, setLtForm] = useState({ 
    name: "", 
    interest_rate: "", 
    max_amount: "", 
    min_amount: "", 
    max_months: "", 
    min_months: "", 
    description: "",
    repayment_frequency: "monthly",
    repayment_start_rule: "next_period",
    penalty_type: "percentage",
    penalty_amount: 5,
    grace_period_days: 3
  });
  const [editingLtIdForForm, setEditingLtIdForForm] = useState(null);

  // loan type settings
  const [editingLtId, setEditingLtId]     = useState(null);
  const [ltEditForm, setLtEditForm]       = useState({});
  const [ltTermsFile, setLtTermsFile]     = useState(null);
  const [savingLt, setSavingLt]           = useState(false);

  const [showCreateLtForm, setShowCreateLtForm] = useState(false);
  const [deactivationReport, setDeactivationReport] = useState(null);
  const [deactivatedLoanTypes, setDeactivatedLoanTypes] = useState([]);
  const [showDeactivatedModal, setShowDeactivatedModal] = useState(false);

  // disbursement proof
  const [showDisburseModal, setShowDisburseModal] = useState(false);
  const [disburseProofFile, setDisburseProofFile] = useState(null);
  const [disburseNote, setDisburseNote]           = useState("");
  const [disburseLoading, setDisburseLoading]     = useState(false);

  // savings (legacy list, kept for compatibility)
  const [savings, setSavings]             = useState([]);
  const [savingsSearch, setSavingsSearch] = useState("");

  // stage reviews & splits
  const [stageStats, setStageStats]       = useState({ mainTotal: 0, subTotal: 0, savingsTotal: 0, policeTotal: 0 });
  const [stageRecords, setStageRecords]   = useState([]);

  // receipts by route
  const [receiptDate, setReceiptDate]     = useState(new Date().toISOString().split("T")[0]);
  const [receiptData, setReceiptData]     = useState(null);
  const [receiptLoading, setReceiptLoading] = useState(false);
  const [selectedRoute, setSelectedRoute] = useState(null);
  const [routeFilter, setRouteFilter]     = useState("");

  // workers
  const [workers, setWorkers]             = useState([]);
  const [workerSearch, setWorkerSearch]   = useState("");
  const [workerFilter, setWorkerFilter]   = useState("all");
  const [selectedWorker, setSelectedWorker] = useState(null);
  const [workerSummary, setWorkerSummary] = useState(null);
  const [warnings, setWarnings]           = useState([]);
  const [warnForm, setWarnForm]           = useState({ severity:"minor", reason:"" });
  const [allWarnings, setAllWarnings]     = useState([]);

  // receipt settings
  const [saccoSettings, setSaccoSettings] = useState({ sacco_name: "", location: "", po_box: "", phone_number: "" });
  const [updatingSacco, setUpdatingSacco] = useState(false);

  // General Ledger
  const [ledgerData, setLedgerData] = useState({ entries: [], balances: {} });
  const [ledgerFilters, setLedgerForm] = useState({ start_date: "", end_date: "", account_code: "", transaction_type: "" });
  const [ledgerLoading, setLedgerLoading] = useState(false);
  const [ledgerRebuilding, setLedgerRebuilding] = useState(false);

  // SACCO Payments
  const [adminSaccoPayments, setAdminSaccoPayments] = useState([]);
  const [paymentsLoading, setPaymentsLoading] = useState(false);

  const handleAdminSetPassword = async () => {
    if (!adminNewPassword.trim()) {
      return showToast("New password cannot be empty", "error");
    }
    const res = await authPut(`/admin/member/${adminResetMember.id}/reset-password`, {
      new_password: adminNewPassword.trim()
    });
    if (res.ok) {
      showToast(`Password updated for ${adminResetMember.name}! ✓`);
      setAdminResetMember(null);
      setAdminNewPassword("");
      setShowAdminResetPwd(false);
    } else {
      const d = await res.json();
      showToast(d.error || "Failed to update password", "error");
    }
  };

  const fetchLedger = useCallback(async () => {
    setLedgerLoading(true);
    let url = `/admin/ledger?`;
    const params = new URLSearchParams();
    if (ledgerFilters.start_date) params.append("start_date", ledgerFilters.start_date);
    if (ledgerFilters.end_date) params.append("end_date", ledgerFilters.end_date);
    if (ledgerFilters.account_code) params.append("account_code", ledgerFilters.account_code);
    if (ledgerFilters.transaction_type) params.append("transaction_type", ledgerFilters.transaction_type);
    
    const d = await authGet(url + params.toString());
    if (d && d.entries) {
      setLedgerData(d);
    }
    setLedgerLoading(false);
  }, [ledgerFilters]);

  const fetchAdminSaccoPayments = useCallback(async () => {
    setPaymentsLoading(true);
    const d = await authGet("/sacco-payments/all");
    if (Array.isArray(d)) setAdminSaccoPayments(d);
    setPaymentsLoading(false);
  }, []);

  const handleRebuildLedger = async () => {
    if (!window.confirm("Are you sure you want to recompile and rebuild the general ledger? This scans active loans, repayments, and historical penalties to recreate accurate double-entry accounts.")) return;
    setLedgerRebuilding(true);
    const res = await authPost("/admin/ledger/rebuild", {});
    setLedgerRebuilding(false);
    if (res.ok) {
      showToast("Historical ledger recompiled and synchronized! ✓");
      fetchLedger();
    } else {
      showToast("Failed to compile ledger", "error");
    }
  };

const markNotificationRead = async (id) => {
  try {
    await authPut(`/notifications/${id}/read`, {});
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, is_read: true } : n))
    );
  } catch (err) {
    console.error("Failed to mark notification as read:", err);
  }
};

const markAllNotificationsRead = async () => {
  try {
    await authPut("/notifications/read-all", {});
    setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
    showToast("All notifications marked as read ✓");
  } catch (err) {
    console.error("Failed to mark all as read:", err);
  }
};

const handleLogout = async (e) => {
  if (e) e.preventDefault();
  try {
    if (typeof logout === "function") {
      await logout();
    }
  } catch (err) {
    console.error("Backend logout error:", err);
  } finally {
    // Guaranteed client-side cleanup
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    sessionStorage.clear();
    window.location.href = "/login"; // Hard navigation resets all in-memory states
  }
};
  const exportLedgerReport = (format) => {
    if (ledgerData.entries.length === 0) {
      return showToast("No ledger entries found to export", "error");
    }

    const b = ledgerData.balances || {};
    const formattedDate = new Date().toLocaleDateString();

    if (format === "csv") {
      let csv = "\uFEFF";
      csv += "General Ledger Report,Compiled on: " + formattedDate + "\n";
      csv += "Account Balance Summary:\n";
      csv += "1200 - Sacco Cash/Bank Account Balance,KES " + (b["1200"] || 0) + "\n";
      csv += "1300 - Loans Receivable Control Balance,KES " + (b["1300"] || 0) + "\n";
      csv += "1350 - Penalties Receivable Balance,KES " + (b["1350"] || 0) + "\n";
      csv += "4100 - Interest Revenue Total,KES " + (b["4100"] || 0) + "\n";
      csv += "4200 - Penalty Revenue Total,KES " + (b["4200"] || 0) + "\n\n";

      csv += "Date,Transaction Type,Borrower Name,Membership No,Debit Account,Credit Account,Amount (KES),Description\n";
      ledgerData.entries.forEach(e => {
        csv += `${e.date},${e.transaction_type},"${e.member_name?.replace(/"/g, '""')}",${e.membership_no},"${e.debit_account}","${e.credit_account}",${e.amount},"${(e.description || "").replace(/"/g, '""')}"\n`;
      });

      const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.setAttribute("download", `SACCO_General_Ledger_Report.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      showToast("Ledger report downloaded ✓");
    } else if (format === "print") {
      const printWindow = window.open("", "_blank");
      printWindow.document.write(`
        <html>
        <head>
          <title>SACCO general ledger & Chart of Accounts - Print Report</title>
          <style>
            body { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; color: #333; margin: 40px; }
            .header { text-align: center; border-bottom: 2px solid #0f172a; padding-bottom: 15px; margin-bottom: 20px; }
            .header h1 { margin: 0; font-size: 22px; color: #0f172a; }
            .header p { margin: 5px 0 0 0; font-size: 13px; color: #64748b; }
            .summary-table { width: 100%; border-collapse: collapse; margin-bottom: 25px; }
            .summary-table th, .summary-table td { border: 1px solid #cbd5e1; padding: 10px; font-size: 12px; }
            .summary-table th { background-color: #f1f5f9; text-align: left; font-weight: bold; }
            .main-table { width: 100%; border-collapse: collapse; margin-top: 15px; }
            .main-table th, .main-table td { border-bottom: 1px solid #e2e8f0; padding: 8px 10px; text-align: left; font-size: 11px; }
            .main-table th { background-color: #0f172a; color: white; font-weight: bold; text-transform: uppercase; }
            .text-right { text-align: right; }
          </style>
        </head>
        <body>
          <div class="header">
            <h1>2KM SACCO</h1>
            <p>Double-Entry General Ledger Statement & Chart of Accounts</p>
            <p style="font-size: 11px; color: #94a3b8; margin-top: 3px;">Generated on: ${formattedDate}</p>
          </div>
          <h3 style="font-size: 14px; margin-bottom: 10px;">Chart of Accounts Summary Balance</h3>
          <table class="summary-table">
            <thead>
              <tr>
                <th>Account Code</th>
                <th>Account Name</th>
                <th>Account Category</th>
                <th class="text-right">Ledger Balance</th>
              </tr>
            </thead>
            <tbody>
              <tr><td>1200</td><td>Sacco Cash/Bank Account</td><td>Asset</td><td class="text-right"><b>KES ${(b["1200"] || 0).toLocaleString()}.00</b></td></tr>
              <tr><td>1300</td><td>Loans Receivable Control</td><td>Asset</td><td class="text-right"><b>KES ${(b["1300"] || 0).toLocaleString()}.00</b></td></tr>
              <tr><td>1350</td><td>Penalties Receivable</td><td>Asset</td><td class="text-right"><b>KES ${(b["1350"] || 0).toLocaleString()}.00</b></td></tr>
              <tr><td>4100</td><td>Interest Revenue</td><td>Revenue</td><td class="text-right"><b>KES ${(b["4100"] || 0).toLocaleString()}.00</b></td></tr>
              <tr><td>4200</td><td>Penalty Revenue</td><td>Revenue</td><td class="text-right"><b>KES ${(b["4200"] || 0).toLocaleString()}.00</b></td></tr>
            </tbody>
          </table>
          <h3 style="font-size: 14px; margin-bottom: 10px;">Journal Lines (${ledgerData.entries.length} transactions)</h3>
          <table class="main-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Flow Type</th>
                <th>Borrower</th>
                <th>Debit Account</th>
                <th>Credit Account</th>
                <th class="text-right">Amount (KES)</th>
                <th>Description</th>
              </tr>
            </thead>
            <tbody>
              ${ledgerData.entries.map(e => `
                <tr>
                  <td>${e.date}</td>
                  <td style="text-transform: capitalize;">${e.transaction_type.replace(/_/g, " ")}</td>
                  <td><b>${e.member_name}</b> (${e.membership_no})</td>
                  <td>${e.debit_account}</td>
                  <td>${e.credit_account}</td>
                  <td class="text-right"><b>KES ${e.amount.toLocaleString()}.00</b></td>
                  <td>${e.description}</td>
                </tr>
              `).join("")}
            </tbody>
          </table>
          <script>
            window.onload = function() {
              window.print();
              setTimeout(function() { window.close(); }, 500);
            };
          </script>
        </body>
        </html>
      `);
      printWindow.document.close();
      showToast("Print report generated ✓");
    }
  };

  const handleApproveSaccoPayment = async (id) => {
    if (!window.confirm("Approve this Sacco payment?")) return;
    const res = await authPut(`/sacco-payments/${id}/approve`);
    if (res.ok) {
      showToast("Sacco payment approved successfully ✓");
      fetchAdminSaccoPayments();
    } else {
      showToast("Approval failed", "error");
    }
  };

  const handleRejectSaccoPayment = async (id) => {
    if (!window.confirm("Reject this Sacco payment?")) return;
    const res = await authPut(`/sacco-payments/${id}/reject`);
    if (res.ok) {
      showToast("Sacco payment rejected");
      fetchAdminSaccoPayments();
    } else {
      showToast("Rejection failed", "error");
    }
  };

  // salary
  const [salaryConfigs, setSalaryConfigs]         = useState([]);
  const [salaryPayments, setSalaryPayments]       = useState([]);
  const [salarySearch, setSalarySearch]           = useState("");
  const [salaryMemberSearch, setSalaryMemberSearch] = useState("");
  const [salaryMemberDrop, setSalaryMemberDrop]   = useState(false);
  const [configForm, setConfigForm] = useState({ member_id:"", base_salary:"", payment_frequency:"monthly", role_label:"" });
  const [payForm, setPayForm]       = useState({ member_id:"", amount:"", payment_type:"salary", period:"", payment_method:"cash", mpesa_code:"", notes:"" });
  const [selectedSalaryMember, setSelectedSalaryMember] = useState(null);
  const [salaryMemberPayments, setSalaryMemberPayments] = useState([]);

  // audit
  const [auditLogs, setAuditLogs]         = useState([]);
  const [auditCategory, setAuditCategory] = useState("all");
  const [auditSearch, setAuditSearch]     = useState("");

  // fetchers
  const fetchStats     = useCallback(() => authGet("/admin/stats").then(d => setStats(d||{})), []);
  const fetchMembers   = useCallback(async () => {
    const [a,p] = await Promise.all([
      fetch(`${API}/hr/members`,{cache:"no-store"}).then(r=>r.json()),
      fetch(`${API}/hr/pending-members`).then(r=>r.json()),
    ]);
    setMembers(a||[]); setPending(p||[]);
  }, []);
  const fetchMatatus   = useCallback(() => authGet("/matatus").then(d=>setMatatus(d||[])), []);
  const fetchRoutes    = useCallback(() => fetch(`${API}/routes`).then(r=>r.json()).then(d=>setRoutes(d||[])), []);
  const fetchLoans     = useCallback(() => authGet("/loan-applications/all").then(d=>setLoans(d||[])), []);
  const fetchLoanTypes = useCallback(() => fetch(`${API}/loan-types`).then(r=>r.json()).then(d=>setLoanTypes(d||[])), []);
  const fetchSavings   = useCallback(() => authGet("/admin/savings").then(d=>setSavings(Array.isArray(d) ? d : [])), []);
  const fetchAudit     = useCallback(() => {
    const q = auditCategory!=="all" ? `?category=${auditCategory}` : "";
    return authGet(`/audit/permanent${q}`).then(d=>setAuditLogs(d||[]));
  }, [auditCategory]);
  const fetchWorkers       = useCallback(() => authGet("/hr/members").then(d=>setWorkers(d||[])), []);
  const fetchAllWarnings   = useCallback(() => authGet("/workers/warnings/all").then(d=>setAllWarnings(d||[])), []);
  const fetchSalaryConfigs = useCallback(() => authGet("/salary/config").then(d=>setSalaryConfigs(d||[])), []);
  const fetchSalaryPayments = useCallback(() => authGet("/salary/payments").then(d=>setSalaryPayments(d||[])), []);
  const fetchSaccoSettings  = useCallback(() => {
    return authGet("/settings/sacco").then(d => {
      if (d && !Array.isArray(d)) {
        setSaccoSettings(d);
      }
    });
  }, []);

const fetchStageAuditData = useCallback(async () => {
    try {
      const res = await authGet("/stage/transactions/review");
      if (res && res.stats) {
        setStageStats(res.stats);
        setStageRecords(res.records || []);
      }
    } catch(e) {}
  }, []);

const fetchNotifications = useCallback(async () => {
    try {
      const res = await fetch(`${API}/notifications`, { headers: hdr() });
      
      if (!res.ok) {
        console.warn("Backend /notifications route failed or does not exist.");
        return;
      }
      
      const data = await res.json();
      if (Array.isArray(data)) setNotifications(data);
    } catch (e) {
      console.error("Failed to fetch notifications:", e);
    }
  }, []);

  useEffect(() => { 
    fetchStats(); 
    fetchMembers(); 
    fetchMatatus(); 
    fetchRoutes(); 
    fetchNotifications(); 
    fetchLoans();

    const interval = setInterval(fetchNotifications, 30000); 
    return () => clearInterval(interval);
  }, [fetchStats, fetchMembers, fetchMatatus, fetchRoutes, fetchNotifications, fetchLoans]);

  useEffect(() => {
    // Refresh headline stats (approved-only savings totals) whenever Overview or Savings is opened
    if (tab==="overview" || tab==="savings") fetchStats();
    if (tab==="loans")        { fetchLoans(); fetchLoanTypes(); }
    if (tab==="savings")      fetchSavings();
    if (tab==="audit")        fetchAudit();
    if (tab==="workers")      { fetchWorkers(); fetchAllWarnings(); }
    if (tab==="salary")       { fetchSalaryConfigs(); fetchSalaryPayments(); }
    if (tab==="settings")     fetchSaccoSettings();
    if (tab==="stage-review") fetchStageAuditData();
    if (tab==="ledger")       fetchLedger();
    if (tab==="payments")     fetchAdminSaccoPayments();
  }, [tab, fetchStats, fetchLoans, fetchLoanTypes, fetchSavings, fetchAudit, fetchWorkers, fetchAllWarnings, fetchSalaryConfigs, fetchSalaryPayments, fetchSaccoSettings, fetchStageAuditData, fetchLedger, fetchAdminSaccoPayments]);
  useEffect(() => { if (tab==="audit") fetchAudit(); }, [auditCategory, fetchAudit]);
 const unreadNotificationsCount = notifications.filter(n => !n.is_read).length;
  const loansWithPendingEdits = loans.filter(l => Boolean(l.pending_edit));

  const logAudit = async (action, category, member_id, membership_no, details) => {
    try {
      await authPost("/audit/permanent", { action, category, member_id, membership_no, details });
      if (tab==="audit") fetchAudit();
    } catch(e) {}
  };

  const fetchDeactivatedLoanTypes = async () => {
    const res = await fetch(`${API}/loan-types/deactivated`, { headers: hdr() });
    if (res.ok) {
      setDeactivatedLoanTypes(await res.json());
    }
  };

  const reactivateLoanType = async (id, name) => {
    if (!window.confirm(`Are you sure you want to reactivate "${name}"?`)) return;
    const res = await fetch(`${API}/loan-types/${id}/reactivate`, {
      method: "PUT",
      headers: hdr()
    });
    const d = await res.json();
    if (res.ok) {
      showToast(`Loan type "${name}" reactivated! ✓`);
      fetchLoanTypes();
      fetchDeactivatedLoanTypes();
    } else {
      showToast(d.error || "Failed to reactivate", "error");
    }
  };

  const saveSaccoSettings = async () => {
    setUpdatingSacco(true);
    const res = await authPut("/settings/sacco", saccoSettings);
    setUpdatingSacco(false);
    if (!res.ok) return showToast("Failed to update settings", "error");
    showToast("Receipt settings updated ✓");
    await logAudit("SETTINGS_UPDATED", "general", null, "", `Updated SACCO details: ${saccoSettings.sacco_name}`);
  };

  // ── MEMBERS ──
  const createMember = async () => {
    if (!createForm.membership_no.trim()) return showToast("Membership No required","error");
    const res = await fetch(`${API}/hr/create-member`,{method:"POST",headers:hdr(),body:JSON.stringify(createForm)});
    const d = await res.json();
    if (!res.ok) return showToast(d.error||"Failed","error");
    showToast("Member created successfully ✓");
    await logAudit("MEMBER_CREATED","member",null,createForm.membership_no,`Created by Admin: ${user?.name}`);
    setCreateForm({membership_no:"",name:"",national_id:"",phone:"",password:"",role:"member"});
    setShowCreateMemberModal(false);
    fetchMembers(); fetchStats();
  };

  const updateMember = async () => {
    const res = await authPut(`/hr/member/update/${selectedMember.id}`,editForm);
    if (!res.ok) return showToast("Update failed","error");
    showToast("Member updated ✓");
    await logAudit("MEMBER_UPDATED","member",selectedMember.id,selectedMember.membership_no,`Updated`);
    setSelectedMember(null); fetchMembers();
  };

  const deleteMember = async (id,mn) => {
    if (!window.confirm(`Delete member ${mn}?`)) return;
    const res = await authDel(`/hr/reject/${id}`);
    if (!res.ok) return showToast("Delete failed","error");
    showToast("Member deleted ✓");
    await logAudit("MEMBER_DELETED","member",id,mn,"Deleted by Admin");
    if (selectedMember?.id===id) setSelectedMember(null);
    fetchMembers(); fetchStats();
  };
 const approveMember = async (id) => {
    try {
      const res = await authPut(`/hr/approve/${id}`, {});
      if (res.ok) {
        const m = pending.find(x => x.id === id);
        showToast(`Member ${m?.name || ""} approved successfully! ✓`);
        // Remove from pending list immediately on screen
        setPending(prev => prev.filter(x => x.id !== id));
        if (m) setMembers(prev => [...prev, { ...m, is_active: true }]);
        await logAudit("MEMBER_APPROVED", "member", id, m?.membership_no, "Approved by Admin");
        fetchMembers();
        fetchStats();
      } else {
        const d = await res.json().catch(() => ({}));
        showToast(d.error || "Approval failed on backend", "error");
      }
    } catch (err) {
      showToast("Network error approving member", "error");
    }
  };

  // ── Reject Member with Immediate Optimistic UI Removal ──
  const rejectMember = async (id) => {
    if (!window.confirm("Reject and delete this pending member registration?")) return;
    try {
      const res = await authDel(`/hr/reject/${id}`);
      if (res.ok) {
        showToast("Member rejected and removed ✓");
        // Remove from pending list immediately on screen
        setPending(prev => prev.filter(x => x.id !== id));
        fetchMembers();
        fetchStats();
      } else {
        const d = await res.json().catch(() => ({}));
        showToast(d.error || "Rejection failed on backend", "error");
      }
    } catch (err) {
      showToast("Network error rejecting member", "error");
    }
  };


  // ── MATATUS ──
  const deleteMatatu = async (id) => {
    if (!window.confirm("Delete this matatu?")) return;
    const res = await authDel(`/matatus/${id}`);
    if (!res.ok) return showToast("Delete failed","error");
    showToast("Matatu deleted ✓");
    if (selectedMatatu?.id===id) setSelectedMatatu(null);
    fetchMatatus(); fetchStats();
  };

  const assignRoute = async (matatuId) => {
    if (!assignRouteId) return showToast("Select a route","error");
    const res = await authPut(`/matatus/${matatuId}/assign-route`,{route_id:parseInt(assignRouteId)});
    if (!res.ok) return showToast("Assignment failed","error");
    showToast("Route assigned ✓"); setAssignRouteId(""); fetchMatatus();
  };

  // ── ROUTES ──
  const createRoute = async () => {
    if (!routeForm.from_stage || !routeForm.to_stage || !routeForm.shimo_fee) {
      return showToast("All fields required: From, To, 1st Trip Fee", "error");
    }
    const res = await authPost("/routes", {
      from_stage: routeForm.from_stage.trim(),
      to_stage: routeForm.to_stage.trim(),
      shimo_fee: parseFloat(routeForm.shimo_fee),
      subsequent_fee: parseFloat(routeForm.subsequent_fee || 100)
    });
    const d = await res.json();
    if (!res.ok) return showToast(d.error || "Failed to create route", "error");
    showToast("Route created successfully ✓");
    setRouteForm({ from_stage: "", to_stage: "", shimo_fee: "", subsequent_fee: "100" });
    fetchRoutes();
  };

  const saveEditRoute = async (id) => {
    const res = await authPut(`/routes/${id}`, {
      from_stage: editRouteForm.from_stage,
      to_stage: editRouteForm.to_stage,
      shimo_fee: parseFloat(editRouteForm.shimo_fee),
      subsequent_fee: parseFloat(editRouteForm.subsequent_fee || 100)
    });
    if (!res.ok) return showToast("Update failed", "error");
    showToast("Route updated successfully ✓");
    setEditingRouteId(null);
    fetchRoutes();
  };

  const deactivateRoute = async (id) => {
    if (!window.confirm("Deactivate this route?")) return;
    await authDel(`/routes/${id}`); 
    showToast("Route deactivated"); 
    fetchRoutes();
  };

  // ── LOANS ──
  const approveLoan = async (id) => {
    const res = await authPut(`/loan-applications/${id}/approve`, { notes: loanNotes });
    if (!res.ok) return showToast("Approval failed", "error");
    showToast("Loan approved ✓");
    await logAudit("LOAN_APPROVED", "loan", selectedLoan?.member_id, selectedLoan?.membership_no, `Loan #${id} approved by Admin`);
    setSelectedLoan(null); setLoanNotes(""); fetchLoans();
  };

  const approvePenaltyClearance = async (id) => {
    const res = await fetch(`${API}/loan-applications/${id}/approve-penalty`, {
      method: "PUT",
      headers: hdr()
    });
    if (res.ok) {
      showToast("Penalty payment approved successfully ✓");
      setSelectedLoan(null);
      fetchLoans();
    } else {
      const d = await res.json();
      showToast(d.error || "Failed to approve penalty", "error");
    }
  };

  const rejectPenaltyClearance = async (id) => {
    const res = await fetch(`${API}/loan-applications/${id}/reject-penalty`, {
      method: "PUT",
      headers: hdr()
    });
    if (res.ok) {
      showToast("Penalty payment rejected successfully ✓");
      setSelectedLoan(null);
      fetchLoans();
    } else {
      const d = await res.json();
      showToast(d.error || "Failed to reject penalty", "error");
    }
  };

  const adminFinalApprove = async (id) => {
    const res = await authPut(`/loan-applications/${id}/admin-final-approve`);
    if (!res.ok) return showToast("Admin authorization failed", "error");
    showToast("Final authorization complete. Loan disbursed and schedule active! 💸");
    await logAudit("LOAN_ADMIN_AUTHORIZED", "loan", selectedLoan?.member_id, selectedLoan?.membership_no, `Loan #${id} final approval and disbursement authorized by Admin`);
    setSelectedLoan(null);
    fetchLoans();
  };

  const rejectLoan = async (id) => {
    if (!loanNotes) return showToast("Rejection reason is required — borrower will see this","error");
    const res = await authPut(`/loan-applications/${id}/reject`,{notes:loanNotes});
    if (!res.ok) return showToast("Failed","error");
    showToast("Loan rejected — reason saved for borrower");
    await logAudit("LOAN_REJECTED","loan",selectedLoan?.member_id,selectedLoan?.membership_no,`Rejected. Reason: ${loanNotes}`);
    setSelectedLoan(null); setLoanNotes(""); fetchLoans();
  };

  const requestMoreInfo = async (id) => {
    if (!loanNotes) return showToast("Specify what info is needed — borrower will see this","error");
    const res = await authPut(`/loan-applications/${id}/request-info`,{notes:loanNotes});
    if (!res.ok) return showToast("Failed","error");
    showToast("Info requested — borrower can now respond ✓");
    setSelectedLoan(null); setLoanNotes(""); fetchLoans();
  };

  const disburseLoan = async (id) => {
    if (!window.confirm("Mark this loan as disbursed?")) return;
    const res = await authPut(`/loan-applications/${id}/disburse`);
    if (!res.ok) return showToast("Failed","error");
    showToast("Loan disbursed ✓ — upload proof so borrower can verify");
    await logAudit("LOAN_DISBURSED","loan",selectedLoan?.member_id,selectedLoan?.membership_no,`Loan #${id} disbursed`);
    fetchLoans();
    const updated = await authGet("/loan-applications/all");
    const loan = updated.find(l=>l.id===id);
    if (loan) setSelectedLoan(loan);
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

  const addPenalty = async (id) => {
    if (!penaltyAmt) return showToast("Enter penalty amount","error");
    const res = await authPut(`/loan-applications/${id}/penalty`,{amount:parseFloat(penaltyAmt),reason:penaltyReason});
    if (!res.ok) return showToast("Failed","error");
    showToast(`Penalty KES ${penaltyAmt} added ✓`);
    setPenaltyAmt(""); setPenaltyReason(""); fetchLoans();
  };

  const deleteLoan = async (loan) => {
    const safe = ["pending","guarantors_pending","rejected","guarantor_rejected","info_required"];
    if (!safe.includes(loan.status)) return showToast("Cannot delete — loan is active/disbursed/repaying","error");
    if (!window.confirm(`Delete Loan #${loan.id} (${loan.status})? This cannot be undone.`)) return;
    const res = await authDel(`/loan-applications/${loan.id}/delete`);
    if (!res.ok) return showToast("Delete failed — ensure backend route exists","error");
    showToast("Loan deleted ✓");
    await logAudit("LOAN_DELETED","loan",loan.member_id,loan.membership_no,`Loan #${loan.id} deleted by Admin`);
    setSelectedLoan(null); fetchLoans();
  };

  // ── Admin Direct Loan Editing ──
  const handleAdminDirectEdit = async () => {
    if (!adminEditLoanForm.amount || !adminEditLoanForm.interest_rate || !adminEditLoanForm.repayment_months) {
      return showToast("Amount, interest rate, and duration are required", "error");
    }

    const payload = {
      amount: parseFloat(adminEditLoanForm.amount),
      interest_rate: parseFloat(adminEditLoanForm.interest_rate),
      repayment_months: parseInt(adminEditLoanForm.repayment_months),
      purpose: adminEditLoanForm.purpose
    };

    const res = await authPut(`/loan-applications/${selectedLoan.id}/edit`, payload);
    const data = await res.json();
    if (!res.ok) return showToast(data.error || "Failed to update loan", "error");

    showToast("Loan terms modified directly. HR team notified ✓");
    setShowAdminEditLoanModal(false);
    fetchLoans();

    // Update selected loan view immediately
    if (data.loan) {
      setSelectedLoan({
        ...selectedLoan,
        ...data.loan,
        pending_edit: null
      });
    }
  };

  // ── Admin Approves HR's Proposed Loan Edit ──
  const handleApproveProposedEdit = async (loanId) => {
    if (!window.confirm("Authorize and apply these HR proposed loan changes?")) return;
    const res = await authPut(`/loan-applications/${loanId}/approve-edit`);
    const data = await res.json();
    if (res.ok) {
      showToast("Proposed loan edits authorized and live on the ledger ✓");
      fetchLoans();
      const updatedList = await authGet("/loan-applications/all");
      const found = updatedList.find(l => l.id === loanId);
      if (found) setSelectedLoan(found);
    } else {
      showToast(data.error || "Failed to approve edit", "error");
    }
  };

  // ── Admin Rejects HR's Proposed Loan Edit ──
  const handleRejectProposedEdit = async (loanId) => {
    if (!window.confirm("Decline the proposed loan changes from HR? Original terms will remain active.")) return;
    const res = await authPut(`/loan-applications/${loanId}/reject-edit`);
    const data = await res.json();
    if (res.ok) {
      showToast("Proposed loan edits rejected. Original terms preserved.");
      fetchLoans();
      const updatedList = await authGet("/loan-applications/all");
      const found = updatedList.find(l => l.id === loanId);
      if (found) setSelectedLoan(found);
    } else {
      showToast(data.error || "Failed to reject edit", "error");
    }
  };

  const createLoanType = async () => {
    const res = await authPost("/loan-types",{
      ...ltForm,
      interest_rate:parseFloat(ltForm.interest_rate),
      max_amount:parseFloat(ltForm.max_amount),
      min_amount:parseFloat(ltForm.min_amount),
      max_months:parseInt(ltForm.max_months),
      min_months:parseInt(ltForm.min_months),
      penalty_amount:parseFloat(ltForm.penalty_amount || 5),
      grace_period_days:parseInt(ltForm.grace_period_days || 3)
    });
    if (!res.ok) return showToast("Failed","error");
    showToast("Loan type created ✓");
    setLtForm({
      name: "", interest_rate: "", max_amount: "", min_amount: "", max_months: "", min_months: "", description: "",
      repayment_frequency: "monthly", repayment_start_rule: "next_period", penalty_type: "percentage", penalty_amount: 5, grace_period_days: 3
    });
    setShowCreateLtForm(false);
    fetchLoanTypes();
  };

  const updateLoanTypeDetails = async () => {
    if (!ltForm.name || ltForm.interest_rate === "" || !ltForm.min_amount || !ltForm.max_amount) {
      return showToast("Please fill all required parameters", "error");
    }
    const payload = {
      name: ltForm.name,
      interest_rate: parseFloat(ltForm.interest_rate),
      min_amount: parseFloat(ltForm.min_amount),
      max_amount: parseFloat(ltForm.max_amount),
      min_months: parseInt(ltForm.min_months || 1),
      max_months: parseInt(ltForm.max_months || 12),
      description: ltForm.description || "",
      repayment_frequency: ltForm.repayment_frequency || "monthly",
      repayment_start_rule: ltForm.repayment_start_rule || "next_period",
      penalty_type: ltForm.penalty_type || "percentage",
      penalty_amount: parseFloat(ltForm.penalty_amount || 5),
      grace_period_days: parseInt(ltForm.grace_period_days || 3)
    };

    const res = await authPut(`/loan-types/${editingLtIdForForm}`, payload);
    if (!res.ok) return showToast("Failed to update specifications", "error");
    showToast("Specifications updated successfully! Borrowers notified ✓");
    setEditingLtIdForForm(null);
    setShowCreateLtForm(false);
    setLtForm({
      name: "", interest_rate: "", max_amount: "", min_amount: "", max_months: "", min_months: "", description: "",
      repayment_frequency: "monthly", repayment_start_rule: "next_period", penalty_type: "percentage", penalty_amount: 5, grace_period_days: 3
    });
    fetchLoanTypes();
  };

  const deleteLoanType = async (id, name) => {
    if (!window.confirm(`Delete loan type "${name}"?\nOnly works if no active loans use this type.`)) return;
    const res = await authDel(`/loan-types/${id}`);
    const d = await res.json();
    if (!res.ok) return showToast(d.error||"Cannot delete — active loans exist for this type","error");
    showToast("Loan type deleted ✓"); fetchLoanTypes();
  };

  const uploadLtTerms = async (ltId) => {
    if (!ltTermsFile) return showToast("Select a file first","error");
    setSavingLt(true);
    const fd = new FormData();
    fd.append("terms_file", ltTermsFile);
    const res = await fetch(`${API}/loan-types/${ltId}/terms`,{method:"PUT",headers:{Authorization:`Bearer ${tok()}`},body:fd});
    setSavingLt(false);
    if (!res.ok) return showToast("Upload failed","error");
    showToast("Terms & Conditions uploaded ✓");
    setLtTermsFile(null); setEditingLtId(null); fetchLoanTypes();
  };

  const saveLtPenaltyPolicy = async (ltId) => {
    setSavingLt(true);
    const res = await authPost(`/loan-types/${ltId}/penalty-policy`,{
      penalty_rate:       parseFloat(ltEditForm.penalty_rate ?? 5),
      grace_period_days:  parseInt(ltEditForm.grace_period_days ?? 3),
      penalty_description: ltEditForm.penalty_description || ""
    });
    setSavingLt(false);
    if (!res.ok) return showToast("Failed","error");
    showToast("Penalty policy saved ✓");
    setEditingLtId(null); setLtEditForm({}); fetchLoanTypes();
  };

  const uploadDisburseProof = async () => {
    if (!disburseProofFile) return showToast("Select a proof file","error");
    setDisburseLoading(true);
    const fd = new FormData();
    fd.append("proof", disburseProofFile);
    fd.append("note", disburseNote);
    const res = await fetch(`${API}/loan-applications/${selectedLoan.id}/disburse-proof`,{
      method:"POST", headers:{Authorization:`Bearer ${tok()}`}, body:fd
    });
    setDisburseLoading(false);
    if (!res.ok) return showToast("Upload failed","error");
    showToast("Disbursement proof uploaded — borrower, HR and admin can now view it ✓");
    await logAudit("DISBURSE_PROOF_UPLOADED","loan",selectedLoan?.member_id,selectedLoan?.membership_no,`Proof uploaded for Loan #${selectedLoan.id}`);
    setShowDisburseModal(false); setDisburseProofFile(null); setDisburseNote("");
    const all = await authGet("/loan-applications/all");
    const updated = all.find(l=>l.id===selectedLoan.id);
    if (updated) setSelectedLoan(updated);
    fetchLoans();
  };

  // ── salary actions ──
  const handleApproveSalary = async (id) => {
    const res = await authPut(`/salary/payments/${id}/approve`);
    if (!res.ok) return showToast("Failed to authorize salary", "error");
    showToast("Salary payment approved successfully ✓");
    fetchSalaryPayments();
  };

  const handleRejectSalary = async (id) => {
    const res = await authPut(`/salary/payments/${id}/reject`);
    if (!res.ok) return showToast("Failed to reject request", "error");
    showToast("Salary payment request rejected");
    fetchSalaryPayments();
  };

  const downloadSalaryReport = (month) => {
    const monthlyDisbursed = salaryPayments.filter(p => p.created_at?.startsWith(month) && p.status === "approved");
    if (monthlyDisbursed.length === 0) {
      return showToast(`No approved salary transfers found for period: ${month}`, "error");
    }

    let csv = "Transfer ID,Worker,Membership No,Disbursement Amount,Period,Frequency/Type,Method,Code/Ref,Notes,Disbursed Date\n";
    monthlyDisbursed.forEach(p => {
      csv += `${p.id},"${p.member_name?.replace(/"/g, '""')}",${p.membership_no},${p.amount},${p.period},${p.payment_type},${p.payment_method},${p.mpesa_code || "N/A"},"${(p.notes || "").replace(/"/g, '""')}",${p.created_at?.split("T")[0]}\n`;
    });

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.setAttribute("download", `SACCO_Payroll_Disbursements_${month}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showToast(`Monthly payroll audit exported successfully ✓`);
  };

  // ── RECEIPTS ──
  const fetchReceiptsByRoute = async () => {
    setReceiptLoading(true); setSelectedRoute(null);
    let url = `/receipts/by-route?date=${receiptDate}`;
    if (routeFilter) url += `&route_id=${routeFilter}`;
    const data = await authGet(url);
    setReceiptData(data); setReceiptLoading(false);
  };

  // ── WORKERS ──
  const loadWorkerSummary = async (member) => {
    setSelectedWorker(member);
    const [summary,warns] = await Promise.all([
      authGet(`/workers/summary/${member.id}`),
      authGet(`/workers/warnings/${member.id}/member`),
    ]);
    setWorkerSummary(summary); setWarnings(warns||[]);
  };

  const issueWarning = async () => {
    if (!warnForm.reason.trim()) return showToast("Enter a reason","error");
    const res = await authPost("/workers/warnings",{member_id:selectedWorker.id,...warnForm});
    if (!res.ok) return showToast("Failed","error");
    showToast("Warning issued ✓"); setWarnForm({severity:"minor",reason:""});
    loadWorkerSummary(selectedWorker); fetchAllWarnings();
  };

  const acknowledgeWarning = async (id) => {
    await authPut(`/workers/warnings/${id}/acknowledge`);
    showToast("Acknowledged ✓"); loadWorkerSummary(selectedWorker); fetchAllWarnings();
  };

  // ── SALARY ──
  const saveConfigForMember = async () => {
    if (!configForm.member_id||!configForm.base_salary) return showToast("Member and salary required","error");
    const res = await authPost("/salary/config",{...configForm,base_salary:parseFloat(configForm.base_salary)});
    if (!res.ok) return showToast("Failed","error");
    showToast("Salary config saved ✓");
    setConfigForm({member_id:"",base_salary:"",payment_frequency:"monthly",role_label:""});
    setSalaryMemberSearch(""); setSelectedSalaryMember(null); fetchSalaryConfigs();
  };

  const paySalary = async () => {
    if (!payForm.member_id||!payForm.amount||!payForm.period) return showToast("Member, amount and period required","error");
    const res = await authPost("/salary/pay",{...payForm,amount:parseFloat(payForm.amount)});
    if (!res.ok) return showToast("Payment failed","error");
    const d = await res.json();
    if (d.status === "pending_approval") {
      showToast("Salary initiated ✓. Awaiting administrator final approval.");
    } else {
      showToast(`KES ${Number(payForm.amount).toLocaleString()} salary paid successfully ✓`);
    }
    setPayForm({member_id:"",amount:"",payment_type:"salary",period:"",payment_method:"cash",mpesa_code:"",notes:""});
    setSelectedSalaryMember(null); setSalaryMemberSearch("");
    fetchSalaryPayments(); fetchSalaryConfigs();
  };

  const loadMemberSalaryHistory = async (member) => {
    setSelectedSalaryMember(member);
    const data = await authGet(`/salary/payments?member_id=${member.id}`);
    setSalaryMemberPayments(data||[]);
  };

  
  // ── DERIVED & FALLBACK STATS ──
  const totalMembersCount = stats.total_members ?? members.length;
  const totalMatatusCount = stats.total_matatus ?? matatus.length;
  const totalRoutesCount  = stats.total_routes ?? routes.length;
  const activeLoansCount  = stats.active_loans ?? loans.filter(l => ["approved", "disbursed", "repaying"].includes(l.status)).length;
  const pendingLoansCount = stats.pending_loans ?? loans.filter(l => l.status === "pending").length;
  
  // Savings figures come from the backend and only count fully approved transactions.
  // Personal savings and matatu-account savings are kept separate.
  const personalSavingsTotal = Number(stats.total_savings || 0);
  const matatuSavingsTotal   = Number(stats.matatu_savings || 0);
  const pendingSavingsCount  = Number(stats.pending_savings || 0);

  const filteredMembers = members.filter(m =>
    (m.name||"").toLowerCase().includes(memberSearch.toLowerCase()) ||
    (m.membership_no||"").toLowerCase().includes(memberSearch.toLowerCase())
  );
  const paginatedMembers  = filteredMembers.slice((memberPage-1)*PER_PAGE, memberPage*PER_PAGE);
  const totalMemberPages  = Math.ceil(filteredMembers.length/PER_PAGE)||1;
  const filteredMatatus   = matatus.filter(m => m.plate?.toLowerCase().includes(matatuSearch.toLowerCase())||m.owner_member_no?.toLowerCase().includes(matatuSearch.toLowerCase()));
  const filteredRoutes    = routes.filter(r => r.from_stage?.toLowerCase().includes(routeSearch.toLowerCase())||r.to_stage?.toLowerCase().includes(routeSearch.toLowerCase()));
  
  const filteredLoans = loans.filter(l => {
    const ms = l.member_name?.toLowerCase().includes(loanSearch.toLowerCase()) || 
               l.membership_no?.toLowerCase().includes(loanSearch.toLowerCase());
    
    let mf = false;
    if (loanFilter === "all") {
      mf = true;
    } else if (loanFilter === "edit_pending") {
      mf = Boolean(l.pending_edit);
    } else if (loanFilter === "commitment_agreed") {
      mf = l.rate_commitment_status === "agreed";
    } else if (loanFilter === "commitment_disagreed") {
      mf = l.rate_commitment_status === "disagreed";
    } else if (loanFilter === "commitment_pending") {
      mf = l.rate_change_pending === true || l.rate_commitment_status === "pending_borrower";
    } else {
      mf = l.status === loanFilter;
    }
    
    return ms && mf;
  });

  const filteredSavings   = savings.filter(s => s.member_name?.toLowerCase().includes(savingsSearch.toLowerCase())||s.membership_no?.toLowerCase().includes(savingsSearch.toLowerCase()));
  const filteredWorkers   = workers.filter(w => (workerFilter==="all"||w.role===workerFilter)&&(w.name?.toLowerCase().includes(workerSearch.toLowerCase())||w.membership_no?.toLowerCase().includes(workerSearch.toLowerCase())));
  const filteredSalaryConfigs = salaryConfigs.filter(c => c.member_name?.toLowerCase().includes(salarySearch.toLowerCase())||c.membership_no?.toLowerCase().includes(salarySearch.toLowerCase()));
  const filteredAudit     = auditLogs.filter(a => a.action?.toLowerCase().includes(auditSearch.toLowerCase())||(a.membership_no||"").toLowerCase().includes(auditSearch.toLowerCase())||(a.performed_by_name||"").toLowerCase().includes(auditSearch.toLowerCase()));
  const salaryMemberMatches = members.filter(m => m.name?.toLowerCase().includes(salaryMemberSearch.toLowerCase())||m.membership_no?.toLowerCase().includes(salaryMemberSearch.toLowerCase())).slice(0,8);
  const deletableLoanStatuses = ["pending","guarantors_pending","rejected","guarantor_rejected","info_required"];

  const approvedPayments = salaryPayments.filter(p => p.status === "approved");
  const pendingPayments = salaryPayments.filter(p => p.status === "pending_approval");

  const totalSalaryThisMonth = approvedPayments
    .filter(p => p.created_at?.startsWith(new Date().toISOString().slice(0, 7)))
    .reduce((s, p) => s + p.amount, 0);
return (
    <div className="flex min-h-screen" style={{fontFamily:"'Trebuchet MS',sans-serif",background:"#0f172a"}}>
      {toast && <Toast {...toast} onClose={()=>setToast(null)} />}

      {/* ── NOTIFICATIONS POPUP MODAL ── */}
      {showNotificationsModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg p-6 max-h-[80vh] flex flex-col">
            <div className="flex justify-between items-center border-b pb-3 mb-3">
              <div>
                <h3 className="font-black text-slate-800 text-lg flex items-center gap-2">
                  🔔 Admin Notifications
                  {unreadNotificationsCount > 0 && (
                    <span className="bg-red-500 text-white text-[10px] px-2 py-0.5 rounded-full font-bold">
                      {unreadNotificationsCount} New
                    </span>
                  )}
                </h3>
                <p className="text-xs text-slate-500">Alerts from HR, Loan requests, and System actions</p>
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
             {notifications.map((n) => (
                <div
                  key={n.id}
                  onClick={async () => {
                    // 1. Mark as read
                    if (!n.is_read) markNotificationRead(n.id);
                    setShowNotificationsModal(false);

                    // 2. Extract Loan #ID from the notification message
                    const match = n.message && n.message.match(/Loan #(\d+)/i);
                    const loanId = match ? parseInt(match[1]) : null;

                    // 3. Switch to Loans tab
                    setTab("loans");

                    // 4. Find the specific loan and open its review desk immediately
                    if (loanId) {
                      let targetLoan = loans.find((l) => l.id === loanId);
                      if (!targetLoan) {
                        const freshLoans = await authGet("/loan-applications/all");
                        if (Array.isArray(freshLoans)) {
                          setLoans(freshLoans);
                          targetLoan = freshLoans.find((l) => l.id === loanId);
                        }
                      }
                      if (targetLoan) {
                        setSelectedLoan(targetLoan);
                        setLoanFilter("all");
                      }
                    } else {
                      setLoanFilter("edit_pending");
                    }
                  }}
                  className={`p-3 rounded-xl border text-xs cursor-pointer transition-all ${
                    n.is_read
                      ? "bg-slate-50 border-slate-200 text-slate-600"
                      : "bg-blue-50/80 border-blue-200 text-slate-800 font-semibold shadow-sm"
                  }`}
                >
                  <div className="flex justify-between items-start mb-1">
                    <p className="font-black text-slate-800">{n.title}</p>
                    <span className="text-[10px] text-slate-400">
                      {n.created_at
                        ? new Date(n.created_at).toLocaleTimeString([], {
                            hour: "2-digit",
                            minute: "2-digit"
                          })
                        : ""}
                    </span>
                  </div>
                  <p className="text-slate-600 leading-relaxed">{n.message}</p>
                  <div className="mt-2 flex justify-between items-center text-[10px] text-slate-400">
                    <span>From: {n.sender_name || "System"}</span>
                    {n.type === "loan" && (
                      <span className="text-blue-600 font-black hover:underline">
                        Review & Authorize Loan →
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* SIDEBAR */}
      <div className="w-60 bg-slate-900 border-r border-slate-700 flex flex-col p-5 flex-shrink-0">
        <div className="mb-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-lg bg-blue-600 flex items-center justify-center text-white font-black text-sm">AD</div>
            <div className="flex-1">
              <p className="font-black text-white text-sm">{user?.name?.split(" ")[0]}</p>
              <p className="text-xs text-slate-400 uppercase tracking-widest">Admin</p>
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
              className={`w-full text-left px-3 py-2.5 rounded-lg text-sm transition-all flex justify-between items-center
                ${tab === t.key ? "bg-blue-600 text-white font-bold" : "text-slate-400 hover:bg-slate-800 hover:text-white"}`}>
              <span>{t.label}</span>
              {t.key === "loans" && loansWithPendingEdits.length > 0 && (
                <span className="bg-amber-400 text-slate-900 text-[10px] font-black px-1.5 py-0.5 rounded-full">
                  {loansWithPendingEdits.length}
                </span>
              )}
              {t.key === "savings" && pendingSavingsCount > 0 && (
                <span className="bg-amber-400 text-slate-900 text-[10px] font-black px-1.5 py-0.5 rounded-full">
                  {pendingSavingsCount}
                </span>
              )}
            </button>
          ))}
        </nav>
        
        <div className="mt-4 pt-4 border-t border-slate-700 space-y-1 text-xs text-slate-500">
          <p>Members: <span className="text-slate-300 font-bold">{totalMembersCount}</span></p>
          <p>Active Loans: <span className="text-slate-300 font-bold">{activeLoansCount}</span></p>
          {loansWithPendingEdits.length > 0 && (
            <p className="text-amber-400 font-bold">⚠️ {loansWithPendingEdits.length} Loan Edit(s) Pending</p>
          )}
          {pendingSavingsCount > 0 && (
            <p className="text-amber-400 font-bold">⏳ {pendingSavingsCount} Saving(s) Awaiting Approval</p>
          )}
        </div>

   <button 
          onClick={handleLogout} 
          className="w-full mt-3 px-3 py-2 rounded-lg text-sm bg-red-600 hover:bg-red-700 text-white font-bold transition-all text-center block"
        >
          🚪 Logout
        </button>
      </div>

      {/* CONTENT */}
      <div className="flex-1 bg-slate-50 overflow-y-auto">

        {/* ══ OVERVIEW ══ */}
        {tab === "overview" && (
          <div className="p-8">
            <h1 className="text-3xl font-black text-slate-800 mb-1">System Overview</h1>
            <p className="text-slate-400 text-sm mb-6">{new Date().toLocaleDateString("en-KE", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}</p>

{/* ⚠️ PROMINENT BANNER FOR HR PROPOSED EDITS */}
{loansWithPendingEdits.length > 0 && (
  <div className="mb-6 bg-amber-50 border-2 border-amber-300 rounded-2xl p-4 flex justify-between items-center shadow-sm">
    <div className="flex items-center gap-3">
      <span className="text-2xl animate-bounce">⚠️</span>
      <div>
        <h3 className="font-black text-amber-900 text-sm">
          {loansWithPendingEdits.length} Loan Adjustment(s) Proposed by HR Awaiting Authorization
        </h3>
        <p className="text-xs text-amber-700">
          HR staff has submitted loan modifications. Review and authorize the terms to apply them to the ledger.
        </p>
      </div>
    </div>
 <button
  onClick={() => {
    setTab("loans");
    setLoanFilter("edit_pending");
    setLoanSearch("");
    // AUTO-SELECT: Opens the side panel immediately on tab switch
    if (loansWithPendingEdits.length > 0) {
      setSelectedLoan(loansWithPendingEdits[0]);
    }
  }}
  className="bg-amber-500 hover:bg-amber-600 text-white font-black px-4 py-2 rounded-xl text-xs shadow transition"
>
  Review Edits Now →
</button>
  </div>
)}
            
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
              {[
                { label: "Total Members", value: totalMembersCount, icon: "👥", color: "bg-blue-600", sub: `${pending.length} pending` },
                { label: "Matatus", value: totalMatatusCount, icon: "🚐", color: "bg-slate-700", sub: `${totalRoutesCount} routes` },
                { label: "Active Loans", value: activeLoansCount, icon: "💼", color: "bg-amber-600", sub: `${pendingLoansCount} pending` },
                { label: "Personal Savings", value: `KES ${personalSavingsTotal.toLocaleString()}`, icon: "🏦", color: "bg-emerald-600", sub: `Matatu accounts: KES ${matatuSavingsTotal.toLocaleString()}` },
              ].map((s, i) => (
                <div key={i} className={`${s.color} rounded-xl p-5 text-white shadow-sm`}>
                  <span className="text-3xl">{s.icon}</span>
                  <p className="text-3xl font-black mt-2">{s.value}</p>
                  <p className="text-sm opacity-80 mt-1">{s.label}</p>
                  <p className="text-xs opacity-60 mt-0.5">{s.sub}</p>
                </div>
              ))}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
         {/* HR LOAN EDITS PENDING CARD */}
<div className="bg-white rounded-xl border border-amber-200 p-5 shadow-sm">
  <div className="flex justify-between items-center mb-3">
    <h3 className="font-black text-slate-800 text-sm">
      ✏️ HR Loan Edit Proposals ({loansWithPendingEdits.length})
    </h3>
    {loansWithPendingEdits.length > 0 && (
      <button 
        onClick={() => { 
          setTab("loans"); 
          setLoanFilter("edit_pending");
          setLoanSearch(""); 
        }}
        className="text-xs text-blue-600 font-bold hover:underline"
      >
        View All
      </button>
    )}
  </div>
  {loansWithPendingEdits.length === 0 ? (
    <p className="text-slate-400 text-sm">No proposed loan edits awaiting review</p>
  ) : (
    <div className="space-y-2 max-h-48 overflow-y-auto">
      {loansWithPendingEdits.map((l) => {
        const p = parsePendingEdit(l.pending_edit);
        return (
          <div 
            key={l.id} 
            onClick={() => { 
              setSelectedLoan(l); 
              setTab("loans");
              setLoanFilter("all"); // Ensure loan is visible in main list
              setLoanSearch("");
            }}
            className="flex justify-between items-center p-3 bg-amber-50/60 border border-amber-200 rounded-lg cursor-pointer hover:bg-amber-100 transition"
          >
            <div>
              <p className="font-bold text-sm text-slate-900">{l.member_name} ({l.membership_no})</p>
              <p className="text-xs text-slate-500">
                Proposed by: <span className="font-bold">{p?.proposed_by_name || "HR"}</span> · KES {p?.amount?.toLocaleString()}
              </p>
            </div>
            <span className="bg-amber-200 text-amber-900 text-[10px] font-black px-2 py-0.5 rounded-full">
              Review →
            </span>
          </div>
        );
      })}
    </div>
  )}
</div>

              {/* Pending New Loans */}
              <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
                <h3 className="font-black text-slate-700 mb-3">💼 Pending New Applications ({loans.filter(l => l.status === "pending").length})</h3>
                {loans.filter(l => l.status === "pending").length === 0 ? <p className="text-slate-400 text-sm">No pending loans</p> : (
                  <div className="space-y-2 max-h-48 overflow-y-auto">
                    {loans.filter(l => l.status === "pending").slice(0, 5).map(l => (
                      <div key={l.id} onClick={() => { setSelectedLoan(l); setTab("loans"); }}
                        className="flex justify-between items-center p-3 bg-slate-50 rounded-lg cursor-pointer hover:bg-blue-50 transition">
                        <div><p className="font-bold text-sm">{l.member_name}</p><p className="text-xs text-slate-400">KES {l.amount?.toLocaleString()} · {l.loan_type || l.type}</p></div>
                        <span className={`text-xs font-bold ${RISK_COLORS[l.risk_score]}`}>{l.risk_score} risk</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Member Approvals */}
              <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
                <h3 className="font-black text-slate-700 mb-3">⏳ Pending Member Approvals ({pending.length})</h3>
                {pending.length === 0 ? <p className="text-slate-400 text-sm">No pending member registrations</p> : (
                  <div className="space-y-2 max-h-48 overflow-y-auto">
                    {pending.map(m => (
                      <div key={m.id} className="flex justify-between items-center p-3 bg-slate-50 rounded-lg">
                        <div><p className="font-bold text-sm">{m.name}</p><p className="text-xs text-slate-400">{m.membership_no} · <span className="capitalize">{m.role}</span></p></div>
                        <div className="flex gap-1">
                          <button onClick={() => approveMember(m.id)} className="bg-emerald-500 text-white text-xs px-2 py-1 rounded font-bold">✓</button>
                          <button onClick={() => rejectMember(m.id)}  className="bg-red-500 text-white text-xs px-2 py-1 rounded font-bold">✕</button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Ticket Stats */}
              <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
                <h3 className="font-black text-slate-700 mb-3">🎫 Ticket Stats</h3>
                <p className="text-3xl font-black text-blue-600">{stats.total_receipts || 0}</p>
                <p className="text-slate-400 text-sm mt-1">Total tickets issued</p>
                <button onClick={() => setTab("receipts")} className="mt-3 text-xs text-blue-600 font-bold hover:underline">View by Route →</button>
              </div>
            </div>
          </div>
        )}


           
        
        {/* ══ MEMBERS ══ */}
        {tab === "members" && (
          <div className="p-8">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
              <div>
                <h2 className="text-2xl font-black text-slate-800">👥 Member Management</h2>
                <p className="text-xs text-slate-400 mt-1">Manage official members, adjust profiles, and handle account credentials.</p>
              </div>
              <button
                onClick={() => {
                  setCreateForm({ membership_no: "", name: "", national_id: "", phone: "", password: "", role: "member" });
                  setShowCreateMemberModal(true);
                }}
                className="bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold px-4 py-2.5 rounded-xl text-xs flex items-center gap-2 shadow-sm transition-all self-start md:self-auto"
              >
                <span>➕</span> Register New Member
              </button>
            </div>

            <div className="space-y-6">
              <div>
                <input
                  placeholder="Search members by name or membership number..."
                  value={memberSearch}
                  onChange={(e) => {
                    setMemberSearch(e.target.value);
                    setMemberPage(1);
                  }}
                  className={`${inp3} mb-4 shadow-sm`}
                />

                <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-800 text-white">
                      <tr>
                        {["Member Details", "Assigned Role", "Contact Phone", "Admin Actions"].map((h) => (
                          <th key={h} className="p-3 text-left">
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {paginatedMembers.length === 0 ? (
                        <tr>
                          <td colSpan={4} className="p-8 text-center text-slate-400 font-bold">
                            No registered members found.
                          </td>
                        </tr>
                      ) : (
                        paginatedMembers.map((m) => (
                          <tr key={m.id} className="border-b border-slate-100 hover:bg-slate-50 transition-colors">
                            <td className="p-3">
                              <p className="font-bold text-slate-900">{m.name}</p>
                              <p className="text-xs text-slate-400 font-mono">{m.membership_no}</p>
                            </td>
                            <td className="p-3">
                              <span className="capitalize text-xs bg-slate-100 px-2.5 py-1 rounded font-bold text-slate-700">
                                {m.role?.replace(/_/g, " ")}
                              </span>
                            </td>
                            <td className="p-3 text-xs text-slate-600 font-mono">{m.phone || "—"}</td>
                            <td className="p-3">
                              <div className="flex gap-1.5 flex-wrap">
                                <button
                                  onClick={() => {
                                    setSelectedMember(m);
                                    setEditForm({
                                      name: m.name || "",
                                      membership_no: m.membership_no || "",
                                      national_id: m.national_id || "",
                                      phone: m.phone || "",
                                      role: m.role || "member"
                                    });
                                  }}
                                  className="bg-blue-100 text-blue-700 hover:bg-blue-200 text-xs px-2.5 py-1 rounded font-bold transition"
                                >
                                  ✏️ Edit
                                </button>
                                <button
                                  onClick={() => {
                                    setAdminResetMember(m);
                                    setAdminNewPassword("");
                                    setShowAdminResetPwd(false);
                                  }}
                                  className="bg-amber-100 text-amber-800 hover:bg-amber-200 text-xs px-2.5 py-1 rounded font-bold transition"
                                  title="Set / Reset Member Password"
                                >
                                  🔑 Password
                                </button>
                                <button
                                  onClick={() => deleteMember(m.id, m.membership_no)}
                                  className="bg-red-100 text-red-600 hover:bg-red-200 text-xs px-2.5 py-1 rounded font-bold transition"
                                >
                                  🗑️ Delete
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>

                  {/* Pagination Footer */}
                  <div className="p-3 flex justify-between items-center bg-slate-50 border-t text-xs">
                    <span className="text-slate-500 font-medium">{filteredMembers.length} members registered</span>
                    <div className="flex items-center gap-2">
                      <button
                        disabled={memberPage === 1}
                        onClick={() => setMemberPage((p) => p - 1)}
                        className="px-3 py-1 bg-slate-200 rounded font-semibold text-slate-700 disabled:opacity-40"
                      >
                        Prev
                      </button>
                      <span className="text-slate-500">
                        Page {memberPage} of {totalMemberPages}
                      </span>
                      <button
                        disabled={memberPage >= totalMemberPages}
                        onClick={() => setMemberPage((p) => p + 1)}
                        className="px-3 py-1 bg-slate-200 rounded font-semibold text-slate-700 disabled:opacity-40"
                      >
                        Next
                      </button>
                    </div>
                  </div>
                </div>

                {/* Pending Members Card */}
                {pending.length > 0 && (
                  <div className="mt-6 bg-white rounded-xl border border-amber-200 overflow-hidden shadow-sm">
                    <div className="bg-amber-50 px-4 py-3 border-b border-amber-200">
                      <h3 className="font-black text-amber-800 text-sm">⏳ Pending Member Approvals ({pending.length})</h3>
                    </div>
                    {pending.map((m) => (
                      <div key={m.id} className="flex justify-between items-center p-3 border-b border-slate-100">
                        <div>
                          <p className="font-bold text-sm text-slate-900">{m.name}</p>
                          <p className="text-xs text-slate-400">
                            {m.membership_no} · {m.role?.replace(/_/g, " ")} · {m.phone}
                          </p>
                        </div>
                        <div className="flex gap-2">
                          <button
                            onClick={() => approveMember(m.id)}
                            className="bg-emerald-500 hover:bg-emerald-600 text-white text-xs px-3 py-1 rounded font-bold transition"
                          >
                            Approve
                          </button>
                          <button
                            onClick={() => rejectMember(m.id)}
                            className="bg-red-500 hover:bg-red-600 text-white text-xs px-3 py-1 rounded font-bold transition"
                          >
                            Reject
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ══ MODAL: REGISTER NEW MEMBER ══ */}
        {showCreateMemberModal && (
          <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg p-6 overflow-hidden flex flex-col">
              <div className="flex justify-between items-center border-b border-slate-200 pb-3 mb-4">
                <div>
                  <h3 className="font-black text-slate-900 text-lg">➕ Register New Member</h3>
                  <p className="text-xs text-slate-500">Create a new SACCO membership record and credentials.</p>
                </div>
                <button
                  onClick={() => setShowCreateMemberModal(false)}
                  className="text-slate-400 hover:text-slate-700 text-xl font-bold"
                >
                  ✕
                </button>
              </div>

              <div className="space-y-3">
                {[
                  ["membership_no", "Membership No (e.g. 2KM-001)"],
                  ["name", "Full Name"],
                  ["national_id", "National ID No"],
                  ["phone", "Phone Number (e.g. 07XXXXXXXX)"]
                ].map(([f, l]) => (
                  <div key={f}>
                    <label className="text-xs text-slate-600 uppercase tracking-widest mb-1 block font-bold">
                      {l}
                    </label>
                    <input
                      placeholder={l}
                      value={createForm[f]}
                      onChange={(e) => setCreateForm({ ...createForm, [f]: e.target.value })}
                      className={inp}
                    />
                  </div>
                ))}

                <div>
                  <label className="text-xs text-slate-600 uppercase tracking-widest mb-1 block font-bold">
                    Initial Password
                  </label>
                  <div className="relative">
                    <input
                      type={showCreateMemberPwd ? "text" : "password"}
                      placeholder="Enter initial password"
                      value={createForm.password}
                      onChange={(e) => setCreateForm({ ...createForm, password: e.target.value })}
                      className={`${inp} pr-16`}
                    />
                    <button
                      type="button"
                      onClick={() => setShowCreateMemberPwd(!showCreateMemberPwd)}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-500 hover:text-slate-800"
                    >
                      {showCreateMemberPwd ? "🙈 Hide" : "👁️ View"}
                    </button>
                  </div>
                </div>

                <div>
                  <label className="text-xs text-slate-600 uppercase tracking-widest mb-1 block font-bold">
                    System Role
                  </label>
                  <select
                    value={createForm.role}
                    onChange={(e) => setCreateForm({ ...createForm, role: e.target.value })}
                    className={inp}
                  >
                    {["member", "owner", "driver", "conductor", "stage_operator", "sub_stage_operator", "hr", "director"].map(
                      (r) => (
                        <option key={r} value={r}>
                          {r.replace(/_/g, " ")}
                        </option>
                      )
                    )}
                  </select>
                </div>
              </div>

              <div className="flex gap-2 justify-end border-t border-slate-200 pt-4 mt-5">
                <button
                  type="button"
                  onClick={() => setShowCreateMemberModal(false)}
                  className="bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold px-4 py-2 rounded-lg text-xs transition"
                >
                  Cancel
                </button>
                <button
                  onClick={createMember}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white font-black px-5 py-2 rounded-lg text-xs transition shadow"
                >
                  Create Member
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ══ MODAL: EDIT MEMBER ══ */}
        {selectedMember && (
          <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg p-6 overflow-hidden flex flex-col">
              <div className="flex justify-between items-center border-b border-slate-200 pb-3 mb-4">
                <div>
                  <h3 className="font-black text-slate-900 text-lg">✏️ Edit Member Profile</h3>
                  <p className="text-xs text-slate-500">Updating details for {selectedMember.name}</p>
                </div>
                <button
                  onClick={() => setSelectedMember(null)}
                  className="text-slate-400 hover:text-slate-700 text-xl font-bold"
                >
                  ✕
                </button>
              </div>

              <div className="space-y-3">
                {[
                  ["name", "Full Name"],
                  ["membership_no", "Membership No"],
                  ["national_id", "National ID"],
                  ["phone", "Phone"]
                ].map(([f, l]) => (
                  <div key={f}>
                    <label className="text-xs text-slate-600 uppercase tracking-widest mb-1 block font-bold">
                      {l}
                    </label>
                    <input
                      value={editForm[f] || ""}
                      onChange={(e) => setEditForm({ ...editForm, [f]: e.target.value })}
                      className={inp}
                    />
                  </div>
                ))}
                <div>
                  <label className="text-xs text-slate-600 uppercase tracking-widest mb-1 block font-bold">
                    Assigned Role
                  </label>
                  <select
                    value={editForm.role}
                    onChange={(e) => setEditForm({ ...editForm, role: e.target.value })}
                    className={inp}
                  >
                    {["member", "owner", "driver", "conductor", "stage_operator", "sub_stage_operator", "hr", "director"].map(
                      (r) => (
                        <option key={r} value={r}>
                          {r.replace(/_/g, " ")}
                        </option>
                      )
                    )}
                  </select>
                </div>
              </div>

              <div className="flex gap-2 justify-end border-t border-slate-200 pt-4 mt-5">
                <button
                  type="button"
                  onClick={() => setSelectedMember(null)}
                  className="bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold px-4 py-2 rounded-lg text-xs transition"
                >
                  Cancel
                </button>
                <button
                  onClick={updateMember}
                  className="bg-blue-600 hover:bg-blue-700 text-white font-black px-5 py-2 rounded-lg text-xs transition shadow"
                >
                  Save Changes
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ══ MODAL: ADMIN PASSWORD RESET ══ */}
        {adminResetMember && (
          <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
              <div className="flex justify-between items-center border-b border-slate-200 pb-3 mb-4">
                <div>
                  <h3 className="font-black text-slate-900 text-lg">🔑 Reset Member Password</h3>
                  <p className="text-xs text-slate-500">
                    For: <span className="font-bold text-slate-800">{adminResetMember.name}</span> ({adminResetMember.membership_no})
                  </p>
                </div>
                <button
                  onClick={() => {
                    setAdminResetMember(null);
                    setAdminNewPassword("");
                    setShowAdminResetPwd(false);
                  }}
                  className="text-slate-400 hover:text-slate-700 text-xl font-bold"
                >
                  ✕
                </button>
              </div>

              <div className="space-y-3">
                <div className="bg-amber-50 border border-amber-200 p-3 rounded-lg text-xs text-amber-800 font-semibold leading-relaxed">
                  ⚠️ Overriding password will grant immediate login access to this member with the new password specified below.
                </div>

                <div>
                  <label className="text-xs text-slate-700 uppercase tracking-widest mb-1.5 block font-bold">
                    New Password
                  </label>
                  <div className="relative">
                    <input
                      type={showAdminResetPwd ? "text" : "password"}
                      placeholder="Enter new password..."
                      value={adminNewPassword}
                      onChange={(e) => setAdminNewPassword(e.target.value)}
                      className={`${inp} pr-16`}
                    />
                    <button
                      type="button"
                      onClick={() => setShowAdminResetPwd(!showAdminResetPwd)}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-500 hover:text-slate-800"
                    >
                      {showAdminResetPwd ? "🙈 Hide" : "👁️ View"}
                    </button>
                  </div>
                </div>
              </div>

              <div className="flex gap-2 justify-end border-t border-slate-200 pt-4 mt-5">
                <button
                  type="button"
                  onClick={() => {
                    setAdminResetMember(null);
                    setAdminNewPassword("");
                    setShowAdminResetPwd(false);
                  }}
                  className="bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold px-4 py-2 rounded-lg text-xs transition"
                >
                  Cancel
                </button>
                <button
                  onClick={handleAdminSetPassword}
                  className="bg-amber-600 hover:bg-amber-700 text-white font-black px-5 py-2 rounded-lg text-xs transition shadow"
                >
                  Update Password
                </button>
              </div>
            </div>
          </div>
        )}
        
        {tab==="matatus-register" && <Matatu /> }

        {/* ══ MATATUS ══ */}
        {tab==="matatus" && (
          <div className="p-8">
            <h2 className="text-2xl font-black text-slate-800 mb-6">🚐 Matatu Management</h2>
            <input placeholder="Search by plate or owner..." value={matatuSearch} onChange={e=>setMatatuSearch(e.target.value)} className={`${inp3} mb-4`} />
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="lg:col-span-2 space-y-3">
                {filteredMatatus.map(m => {
                  const route = routes.find(r=>r.id===m.route_id);
                  return (
                    <div key={m.id} onClick={()=>setSelectedMatatu(m)} className={`bg-white border rounded-xl p-4 cursor-pointer hover:shadow-md transition-all ${selectedMatatu?.id===m.id?"border-blue-400":"border-slate-200"}`}>
                      <div className="flex justify-between items-start">
                        <div><p className="font-black text-slate-800 text-lg">🚐 {m.plate}</p><p className="text-sm text-slate-500">Owner: {m.owner_member_no}</p>{route&&<p className="text-xs text-blue-600 font-bold mt-1">Route: {route.from_stage} → {route.to_stage}</p>}</div>
                        <button onClick={e=>{e.stopPropagation();deleteMatatu(m.id);}} className="bg-red-100 text-red-600 text-xs px-3 py-1 rounded font-bold hover:bg-red-200">Delete</button>
                      </div>
                      <div className="mt-2 flex gap-1 flex-wrap">
                        {m.documents?.map(d=>{const exp=d.expiry?new Date(d.expiry):null;const st=!exp?"missing":exp<new Date()?"expired":"valid";return<span key={d.id} className={`text-xs px-2 py-0.5 rounded-full font-bold ${st==="expired"?"bg-red-100 text-red-600":st==="missing"?"bg-gray-100 text-gray-500":"bg-green-100 text-green-700"}`}>{d.type}</span>;})}
                      </div>
                    </div>
                  );
                })}
              </div>
              {selectedMatatu && (
                <div className="space-y-4">
                  <div className="bg-white rounded-xl border border-slate-200 p-5">
                    <h3 className="font-black text-slate-700 mb-3">{selectedMatatu.plate}</h3>
                    <p className="text-sm text-slate-500 mb-3">Owner: <span className="font-bold">{selectedMatatu.owner_member_no}</span></p>
                    <div className="border-t border-slate-100 pt-3">
                      <label className="text-xs text-slate-400 uppercase tracking-widest mb-1 block">Assign / Change Route</label>
                      <select value={assignRouteId} onChange={e=>setAssignRouteId(e.target.value)} className={`${inp} mb-2`}>
                        <option value="">Select Route</option>
                        {routes.map(r=><option key={r.id} value={r.id}>{r.from_stage} → {r.to_stage} (1st: KES {r.shimo_fee} | 2nd+: KES {r.subsequent_fee || 100})</option>)}
                      </select>
                      <button onClick={()=>assignRoute(selectedMatatu.id)} className="w-full bg-blue-600 text-white font-black py-2 rounded-lg text-sm hover:bg-blue-700">Assign Route</button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ══ ROUTES ══ */}
        {tab==="routes" && (
          <div className="p-8">
            <h2 className="text-2xl font-black text-slate-800 mb-6">🗺️ Route & Shimo Fee Management</h2>
            
            <div className="bg-white border border-slate-200 rounded-xl p-5 mb-6 shadow-sm">
              <h3 className="font-black text-slate-700 mb-3 text-sm">Add New Route</h3>
              <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
                <div>
                  <label className="text-xs font-bold text-slate-600 uppercase tracking-wider mb-1 block">From Stage</label>
                  <input placeholder="e.g. Shimo la Tewa" value={routeForm.from_stage} onChange={e=>setRouteForm({...routeForm,from_stage:e.target.value})} className={inp3} />
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-600 uppercase tracking-wider mb-1 block">To Stage</label>
                  <input placeholder="e.g. Mombasa Town" value={routeForm.to_stage} onChange={e=>setRouteForm({...routeForm,to_stage:e.target.value})} className={inp3} />
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-600 uppercase tracking-wider mb-1 block">1st Trip Fee (KES)</label>
                  <input type="number" placeholder="e.g. 200 or 300" value={routeForm.shimo_fee} onChange={e=>setRouteForm({...routeForm,shimo_fee:e.target.value})} className={`${inp3} font-bold text-blue-700`} />
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-600 uppercase tracking-wider mb-1 block">2nd+ Trip Fee (KES)</label>
                  <input type="number" placeholder="e.g. 100" value={routeForm.subsequent_fee} onChange={e=>setRouteForm({...routeForm,subsequent_fee:e.target.value})} className={`${inp3} font-bold text-purple-700`} />
                </div>
                <div className="flex items-end">
                  <button onClick={createRoute} className="w-full bg-blue-600 text-white font-black py-2.5 rounded-lg text-sm hover:bg-blue-700 shadow">
                    + Add Route
                  </button>
                </div>
              </div>
            </div>

            <input placeholder="Search routes by stage..." value={routeSearch} onChange={e=>setRouteSearch(e.target.value)} className={`${inp3} mb-4`} />
            
            <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
              <table className="w-full text-sm">
                <thead className="bg-slate-800 text-white">
                  <tr>
                    <th className="p-3 text-left">Route ID</th>
                    <th className="p-3 text-left">From Stage</th>
                    <th className="p-3 text-left">To Stage</th>
                    <th className="p-3 text-left">1st Trip Fee (KES)</th>
                    <th className="p-3 text-left">2nd+ Trip Fee (KES)</th>
                    <th className="p-3 text-left">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredRoutes.length === 0 ? (
                    <tr><td colSpan={6} className="p-6 text-center text-slate-400 font-bold">No routes found</td></tr>
                  ) : (
                    filteredRoutes.map(route => (
                      <tr key={route.id} className="border-b border-slate-100 hover:bg-slate-50">
                        {editingRouteId === route.id ? (
                          <>
                            <td className="p-3 text-slate-400 font-mono">#{route.id}</td>
                            <td className="p-3">
                              <input value={editRouteForm.from_stage} onChange={e=>setEditRouteForm({...editRouteForm,from_stage:e.target.value})} className="border border-slate-300 p-1.5 rounded w-full text-sm text-slate-900 bg-white" />
                            </td>
                            <td className="p-3">
                              <input value={editRouteForm.to_stage} onChange={e=>setEditRouteForm({...editRouteForm,to_stage:e.target.value})} className="border border-slate-300 p-1.5 rounded w-full text-sm text-slate-900 bg-white" />
                            </td>
                            <td className="p-3">
                              <input type="number" value={editRouteForm.shimo_fee} onChange={e=>setEditRouteForm({...editRouteForm,shimo_fee:e.target.value})} className="border border-slate-300 p-1.5 rounded w-full text-sm font-bold text-blue-700 bg-white" />
                            </td>
                            <td className="p-3">
                              <input type="number" value={editRouteForm.subsequent_fee} onChange={e=>setEditRouteForm({...editRouteForm,subsequent_fee:e.target.value})} className="border border-slate-300 p-1.5 rounded w-full text-sm font-bold text-purple-700 bg-white" />
                            </td>
                            <td className="p-3 flex gap-1">
                              <button onClick={()=>saveEditRoute(route.id)} className="bg-emerald-600 text-white text-xs px-3 py-1 rounded font-bold hover:bg-emerald-700">Save</button>
                              <button onClick={()=>setEditingRouteId(null)} className="bg-slate-400 text-white text-xs px-3 py-1 rounded font-bold hover:bg-slate-500">Cancel</button>
                            </td>
                          </>
                        ) : (
                          <>
                            <td className="p-3 text-slate-500 font-mono">#{route.id}</td>
                            <td className="p-3 font-bold text-slate-900">{route.from_stage}</td>
                            <td className="p-3 font-bold text-slate-900">{route.to_stage}</td>
                            <td className="p-3 text-blue-700 font-bold">KES {route.shimo_fee}</td>
                            <td className="p-3 text-purple-700 font-bold">KES {route.subsequent_fee || 100}</td>
                            <td className="p-3 flex gap-1">
                              <button 
                                onClick={() => {
                                  setEditingRouteId(route.id);
                                  setEditRouteForm({
                                    from_stage: route.from_stage,
                                    to_stage: route.to_stage,
                                    shimo_fee: route.shimo_fee,
                                    subsequent_fee: route.subsequent_fee || 100
                                  });
                                }} 
                                className="bg-amber-400 hover:bg-amber-500 text-white text-xs px-2.5 py-1 rounded font-bold"
                              >
                                Edit
                              </button>
                              <button 
                                onClick={()=>deactivateRoute(route.id)} 
                                className="bg-red-500 hover:bg-red-600 text-white text-xs px-2.5 py-1 rounded font-bold"
                              >
                                Deactivate
                              </button>
                            </td>
                          </>
                        )}
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
              <div className="p-3 bg-slate-50 border-t text-xs text-slate-600 font-medium">
                Total active routes: <span className="font-bold text-slate-800">{filteredRoutes.length}</span>
              </div>
            </div>
          </div>
        )}
        
        {/* ══ SACCO PAYMENTS ══ */}
        {tab === "payments" && (
          <div className="p-8 space-y-6">
            <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
              <h2 className="text-2xl font-black text-slate-800">💳 Sacco Contributions & Payments Verification Desk</h2>
              <p className="text-sm text-slate-400">Review registration fees, share capitals, and licensing payments submitted by Sacco fleet owners.</p>
            </div>

            <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
              <div className="bg-slate-800 text-white px-5 py-3.5 flex justify-between items-center">
                <h3 className="font-bold text-sm">Owner Payments List ({adminSaccoPayments.length})</h3>
                <span className="text-xs text-slate-400">Awaiting Sacco verification</span>
              </div>
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-100 text-slate-600 border-b">
                  <tr>
                    <th className="p-3 font-bold">Owner Name</th>
                    <th className="p-3 font-bold">Payment Type</th>
                    <th className="p-3 font-bold">Amount (KES)</th>
                    <th className="p-3 font-bold">Date</th>
                    <th className="p-3 font-bold">Proof Document</th>
                    <th className="p-3 font-bold">Verification Status</th>
                    <th className="p-3 text-right font-bold">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {adminSaccoPayments.length === 0 ? (
                    <tr><td colSpan="7" className="p-8 text-center text-slate-400 font-bold">No payments logged in database.</td></tr>
                  ) : (
                    adminSaccoPayments.map((p) => (
                      <tr key={p.id} className="hover:bg-slate-50 transition-colors">
                        <td className="p-3">
                          <p className="font-bold text-slate-900">{p.member_name}</p>
                          <p className="text-[10px] text-slate-400">{p.membership_no}</p>
                        </td>
                        <td className="p-3 font-bold text-slate-700">{p.payment_type}</td>
                        <td className="p-3 font-black text-slate-800 text-sm">KES {p.amount?.toLocaleString()}</td>
                        <td className="p-3 text-slate-500">{p.date}</td>
                        <td className="p-3">
                          {p.proof_file ? (
                            <a href={p.proof_file} target="_blank" rel="noreferrer" className="text-blue-600 underline font-bold">
                              📎 View Document
                            </a>
                          ) : <span className="text-slate-400">No Slip</span>}
                        </td>
                        <td className="p-3">
                          <span className={`text-[10px] px-2.5 py-0.5 rounded-full font-black uppercase ${
                            p.status === "approved" ? "bg-green-100 text-green-700" :
                            p.status === "rejected" ? "bg-red-100 text-red-700" :
                            "bg-yellow-100 text-yellow-800 animate-pulse"
                          }`}>
                            {p.status || "approved"}
                          </span>
                        </td>
                        <td className="p-3 text-right space-x-1 whitespace-nowrap">
                          {p.status === "pending" && (
                            <>
                              <button onClick={() => handleApproveSaccoPayment(p.id)} className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-3 py-1.5 rounded-lg text-xs">
                                Approve
                              </button>
                              <button onClick={() => handleRejectSaccoPayment(p.id)} className="bg-red-500 hover:bg-red-600 text-white font-bold px-3 py-1.5 rounded-lg text-xs">
                                Reject
                              </button>
                            </>
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

        {/* ══ LOANS ══ */}
        {tab==="loans" && (
          <div className="p-8">
            <h2 className="text-2xl font-black text-slate-800 mb-2">💼 Loan Management</h2>
            <p className="text-sm text-slate-400 mb-6">Approve, reject, or authorize loans, upload disbursement proof, or declare void records deactivated.</p>
             
            {/* DEACTIVATION IMPACT REPORT MODAL */}
            {deactivationReport && (
              <div className="fixed inset-0 bg-black bg-opacity-65 flex items-center justify-center z-50 p-4">
                <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl p-6 overflow-hidden flex flex-col max-h-[85vh]">
                  <div className="flex justify-between items-center border-b border-gray-200 pb-3 mb-4">
                    <div>
                      <h3 className="font-black text-slate-900 text-lg flex items-center gap-1.5">
                        📋 Deactivation Impact Report
                      </h3>
                      <p className="text-xs text-slate-500">
                        Assigned members for deactivated type: <span className="font-extrabold text-slate-800">{deactivationReport.name}</span>
                      </p>
                    </div>
                    <button
                      onClick={() => setDeactivationReport(null)}
                      className="text-slate-400 hover:text-slate-700 text-xl font-bold"
                    >
                      ✕
                    </button>
                  </div>

                  <div className="flex-1 overflow-y-auto pr-1">
                    {deactivationReport.affected_loans?.length === 0 ? (
                      <div className="text-center py-8 text-slate-400 font-bold">
                        <p className="text-3xl mb-1">ℹ️</p>
                        <p className="text-sm font-semibold">No members were ever assigned to this loan type.</p>
                      </div>
                    ) : (
                      <div className="space-y-4">
                        <div className="bg-amber-50 border border-amber-200 text-amber-900 rounded-lg p-3 text-xs leading-relaxed font-semibold">
                          ⚠️ <span className="font-bold">Deactivation Complete:</span> This loan type has been successfully hidden from future borrowers. Below is the historical audit report of all members currently or previously holding loans of this type.
                        </div>

                        <table className="w-full text-xs text-left border-collapse">
                          <thead>
                            <tr className="border-b border-gray-200 bg-slate-100 text-slate-700">
                              <th className="p-2.5 font-bold uppercase">Member</th>
                              <th className="p-2.5 font-bold uppercase">Loan ID</th>
                              <th className="p-2.5 font-bold uppercase">Principal</th>
                              <th className="p-2.5 font-bold uppercase">Outstanding Bal</th>
                              <th className="p-2.5 font-bold uppercase">Status</th>
                              <th className="p-2.5 font-bold uppercase">Assigned Date</th>
                            </tr>
                          </thead>
                          <tbody>
                            {deactivationReport.affected_loans.map((loan, idx) => (
                              <tr key={idx} className="border-b border-slate-100 hover:bg-slate-50 transition-colors">
                                <td className="p-2.5">
                                  <p className="font-bold text-slate-900">{loan.member_name}</p>
                                  <p className="text-[10px] text-slate-400">{loan.membership_no}</p>
                                </td>
                                <td className="p-2.5 font-mono text-slate-600">#{loan.loan_id}</td>
                                <td className="p-2.5 font-bold text-slate-800">KES {loan.amount?.toLocaleString()}</td>
                                <td className="p-2.5 font-black text-red-600">KES {loan.balance?.toLocaleString()}</td>
                                <td className="p-2.5">
                                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                                    loan.status === 'cleared' ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700'
                                  }`}>
                                    {loan.status}
                                  </span>
                                </td>
                                <td className="p-2.5 text-slate-500">{loan.created_at?.split(" ")[0]}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>

                  <div className="flex gap-3 justify-end border-t border-gray-200 pt-4 mt-4">
                    <button
                      onClick={() => window.print()}
                      className="bg-slate-900 hover:bg-slate-800 text-white text-xs font-extrabold px-4 py-2.5 rounded-lg flex items-center gap-1.5 transition-colors shadow-sm"
                    >
                      🖨️ Print Report
                    </button>
                    <button
                      onClick={() => setDeactivationReport(null)}
                      className="bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-extrabold px-4 py-2.5 rounded-lg transition-colors"
                    >
                      Close
                    </button>
                  </div>
                </div>
              </div>
            )}

            <div className="bg-white border border-slate-200 rounded-xl p-5 mb-6">
              <div className="flex justify-between items-center mb-3">
                <h3 className="font-black text-slate-700 text-sm">Loan Types Configuration</h3>
                <button
                  onClick={() => {
                    fetchDeactivatedLoanTypes();
                    setShowDeactivatedModal(true);
                  }}
                  className="text-xs bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold px-3 py-1.5 rounded-lg border border-slate-300"
                >
                  📋 View Inactive Loan Types
                </button>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
                {loanTypes.map(lt => (
                  <div key={lt.id} className="bg-slate-50 border border-slate-200 rounded-lg p-3">
                    <div className="flex justify-between items-start mb-2">
                      <p className="font-black text-sm text-slate-800">{lt.name}</p>
                      <div className="flex gap-2 items-center">
                        <button onClick={() => {
                          setEditingLtIdForForm(lt.id);
                          setLtForm({
                            name: lt.name || "",
                            interest_rate: lt.interest_rate || "",
                            max_amount: lt.max_amount || "",
                            min_amount: lt.min_amount || "",
                            max_months: lt.max_months || "",
                            min_months: lt.min_months || "",
                            description: lt.description || "",
                            repayment_frequency: lt.repayment_frequency || "monthly",
                            repayment_start_rule: lt.repayment_start_rule || "next_period",
                            penalty_type: lt.penalty_type || "percentage",
                            penalty_amount: lt.penalty_amount || 5,
                            grace_period_days: lt.grace_period_days || 3
                          });
                          setShowCreateLtForm(false);
                        }} className="text-blue-500 hover:text-blue-700 text-xs font-bold">✏️ Edit</button>
                        
                        <button 
                          onClick={async () => {
                            if (!window.confirm(`Are you sure you want to deactivate "${lt.name}"? This hides it from future borrowers and generates an administrative report of all historical and current assigned members.`)) return;
                            const res = await fetch(`${API}/loan-types/${lt.id}/deactivate`, {
                              method: "PUT",
                              headers: hdr()
                            });
                            const d = await res.json();
                            if (res.ok) {
                              showToast(`Loan type deactivated and impact report compiled! ✓`);
                              setDeactivationReport({
                                name: lt.name,
                                affected_loans: d.affected_loans
                              });
                              fetchLoanTypes();
                            } else {
                              showToast(d.error || "Failed to deactivate", "error");
                            }
                          }}
                          className="text-amber-500 hover:text-amber-700 text-xs font-bold"
                          title="Deactivate and Generate Report"
                        >
                          🚫 Deactivate
                        </button>
                        
                        <button onClick={()=>deleteLoanType(lt.id,lt.name)} className="text-red-500 hover:text-red-700 text-xs font-bold">🗑️</button>
                      </div>
                    </div>
                    <p className="text-xs text-slate-500">{lt.interest_rate}% p.a.</p>
                    <p className="text-xs text-slate-400">KES {lt.min_amount?.toLocaleString()}–{lt.max_amount?.toLocaleString()}</p>
                    <p className="text-xs text-slate-400">{lt.min_months}–{lt.max_months} months</p>
                    {lt.penalty_rate != null && <p className="text-xs text-red-500 mt-1 font-semibold">Penalty: {lt.penalty_rate}% · Grace: {lt.grace_period_days??0}d</p>}
                    <div className="flex gap-1 flex-wrap mt-2">
                      {lt.terms_file && (
                        <a href={lt.terms_file} target="_blank" rel="noreferrer" className="text-xs bg-blue-50 border border-blue-200 text-blue-600 px-2 py-0.5 rounded font-bold hover:bg-blue-100">📄 View T&C</a>
                      )}
                      <button onClick={()=>setEditingLtId(editingLtId===lt.id?null:lt.id)} className="text-xs bg-amber-50 border border-amber-200 text-amber-700 px-2 py-0.5 rounded font-bold hover:bg-amber-100">⚙️ Settings</button>
                    </div>

                    {editingLtId===lt.id && (
                      <div className="mt-3 space-y-3 border-t border-slate-200 pt-3 font-bold">
                        <div>
                          <label className="text-xs text-slate-700 font-bold uppercase tracking-widest mb-1 block">Upload Terms & Conditions (PDF / Image)</label>
                          <p className="text-xs text-slate-400 mb-1.5">Borrowers must read and accept this before applying. You can update it anytime.</p>
                          <input type="file" accept=".pdf,image/*" onChange={e=>setLtTermsFile(e.target.files[0])}
                            className="w-full text-xs bg-white border border-slate-300 rounded p-1.5 text-slate-700 file:mr-2 file:bg-blue-600 file:text-white file:border-0 file:rounded file:px-2 file:py-1 file:text-xs file:font-bold" />
                          <button onClick={()=>uploadLtTerms(lt.id)} disabled={savingLt}
                            className="w-full mt-1.5 bg-blue-600 text-white font-bold py-1.5 rounded text-xs hover:bg-blue-700 disabled:opacity-50">
                            {savingLt?"Uploading...":"📤 Upload T&C"}
                          </button>
                          {lt.terms_file && <p className="text-xs text-green-600 mt-1 font-bold">✓ T&C on file — borrowers see this during application</p>}
                        </div>

                        <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                          <p className="text-xs font-black text-red-700 mb-2">⚠️ Penalty Policy (shown to borrower in T&C and calculations)</p>
                          <div className="grid grid-cols-2 gap-2 mb-2">
                            <div>
                              <label className="text-xs text-slate-700 mb-0.5 block font-semibold">Late Payment Rate (%)</label>
                              <input type="number" step="0.5" defaultValue={lt.penalty_rate??5}
                                onChange={e=>setLtEditForm(f=>({...f,penalty_rate:e.target.value}))}
                                className="w-full border border-slate-300 rounded p-1.5 text-xs text-slate-900 bg-white outline-none" />
                            </div>
                            <div>
                              <label className="text-xs text-slate-700 mb-0.5 block font-semibold">Grace Period (days)</label>
                              <input type="number" defaultValue={lt.grace_period_days??3}
                                onChange={e=>setLtEditForm(f=>({...f,grace_period_days:e.target.value}))}
                                className="w-full border border-slate-300 rounded p-1.5 text-xs text-slate-900 bg-white outline-none" />
                            </div>
                          </div>
                          <label className="text-xs text-slate-700 mb-0.5 block font-semibold">Penalty Description</label>
                          <textarea rows={2} placeholder="e.g. 5% penalty applied after 3 days grace period..."
                            defaultValue={lt.penalty_description||""}
                            onChange={e=>setLtEditForm(f=>({...f,penalty_description:e.target.value}))}
                            className="w-full border border-slate-300 rounded p-1.5 text-xs text-slate-900 bg-white outline-none resize-none mb-2" />
                          <button onClick={()=>saveLtPenaltyPolicy(lt.id)} disabled={savingLt}
                            className="w-full bg-red-600 text-white font-bold py-1.5 rounded text-xs hover:bg-red-700 disabled:opacity-50">
                            {savingLt?"Saving...":"Save Penalty Policy"}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>

              {!showCreateLtForm && !editingLtIdForForm ? (
                <div className="mt-4 border-t border-slate-200 pt-4 flex justify-end">
                  <button
                    onClick={() => {
                      setEditingLtIdForForm(null);
                      setLtForm({
                        name: "", interest_rate: "", max_amount: "", min_amount: "", max_months: "", min_months: "", description: "",
                        repayment_frequency: "monthly", repayment_start_rule: "next_period", penalty_type: "percentage", penalty_amount: 5, grace_period_days: 3
                      });
                      setShowCreateLtForm(true);
                    }}
                    className="bg-slate-900 text-white font-extrabold px-5 py-2.5 rounded-lg text-xs hover:bg-slate-800 flex items-center gap-1.5 transition-colors shadow-sm"
                  >
                    ➕ Configure New Loan Type
                  </button>
                </div>
              ) : (
                <div className="mt-4 border-t border-slate-200 pt-4 space-y-4">
                  <div className="flex justify-between items-center pb-2 border-b border-slate-100">
                    <h4 className="font-black text-slate-700 text-xs uppercase tracking-wide">
                      {editingLtIdForForm ? `✏️ Modify Loan Type: ${ltForm.name}` : "➕ Configure New Loan Type"}
                    </h4>
                    <button
                      onClick={() => {
                        setShowCreateLtForm(false);
                        setEditingLtIdForForm(null);
                      }}
                      className="text-slate-400 hover:text-slate-600 text-xs font-bold"
                    >
                      ✕ Close Form
                    </button>
                  </div>
                  
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    {[
                      ["name", "Name", "text"],
                      ["interest_rate", "Rate % p.a.", "number"],
                      ["min_amount", "Min Amt (KES)", "number"],
                      ["max_amount", "Max Amt (KES)", "number"],
                      ["min_months", "Min Installments", "number"],
                      ["max_months", "Max Installments", "number"]
                    ].map(([f, l, t]) => (
                      <div key={f}>
                        <label className="text-xs text-slate-500 mb-0.5 block font-bold">{l}</label>
                        <input placeholder={l} value={ltForm[f] ?? ""} type={t} onChange={e => setLtForm({ ...ltForm, [f]: e.target.value })} className={inp} />
                      </div>
                    ))}
                    <div>
                      <label className="text-xs text-slate-500 mb-0.5 block font-bold">Repayment Frequency</label>
                      <select value={ltForm.repayment_frequency || "monthly"} onChange={e => setLtForm({ ...ltForm, repayment_frequency: e.target.value })} className={inp}>
                        <option value="daily">Daily</option>
                        <option value="weekly">Weekly</option>
                        <option value="monthly">Monthly</option>
                      </select>
                    </div>
                    <div>
                      <label className="text-xs text-slate-500 mb-0.5 block font-bold">Start Date Policy</label>
                      <select value={ltForm.repayment_start_rule || "next_period"} onChange={e => setLtForm({ ...ltForm, repayment_start_rule: e.target.value })} className={inp}>
                        <option value="same_day">Same Day</option>
                        <option value="next_period">Next Period</option>
                      </select>
                    </div>
                    <div>
                      <label className="text-xs text-slate-500 mb-0.5 block font-bold">Penalty Type</label>
                      <select value={ltForm.penalty_type || "percentage"} onChange={e => setLtForm({ ...ltForm, penalty_type: e.target.value })} className={inp}>
                        <option value="percentage">Percentage</option>
                        <option value="fixed">Fixed cash penalty fee</option>
                      </select>
                    </div>
                    <div>
                      <label className="text-xs text-slate-500 mb-0.5 block font-bold">Penalty Rate/Amount</label>
                      <input placeholder="e.g. 5" value={ltForm.penalty_amount ?? ""} type="number" onChange={e => setLtForm({ ...ltForm, penalty_amount: e.target.value })} className={inp} />
                    </div>
                    <div>
                      <label className="text-xs text-slate-500 mb-0.5 block font-bold">Grace Period (Days)</label>
                      <input placeholder="e.g. 3" value={ltForm.grace_period_days ?? ""} type="number" onChange={e => setLtForm({ ...ltForm, grace_period_days: e.target.value })} className={inp} />
                    </div>
                    <div className="md:col-span-3">
                      <label className="text-xs text-slate-500 mb-0.5 block font-bold">Description</label>
                      <input placeholder="Description" value={ltForm.description ?? ""} onChange={e => setLtForm({ ...ltForm, description: e.target.value })} className={inp} />
                    </div>
                    <div className="md:col-span-4 flex justify-end gap-2 mt-2">
                      {editingLtIdForForm && (
                        <button onClick={() => {
                          setEditingLtIdForForm(null);
                          setLtForm({
                            name: "", interest_rate: "", max_amount: "", min_amount: "", max_months: "", min_months: "", description: "",
                            repayment_frequency: "monthly", repayment_start_rule: "next_period", penalty_type: "percentage", penalty_amount: 5, grace_period_days: 3
                          });
                        }} className="bg-slate-300 text-slate-700 font-bold px-4 py-2 rounded-lg text-sm hover:bg-slate-400">
                          Cancel Edit
                        </button>
                      )}
                      <button onClick={editingLtIdForForm ? updateLoanTypeDetails : createLoanType} className="bg-blue-600 text-white font-black px-6 py-2 rounded-lg text-sm hover:bg-blue-700">
                        {editingLtIdForForm ? "Save Specifications" : "Create Loan Type"}
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div className="flex gap-3 mb-4 flex-wrap">
              <input placeholder="Search member..." value={loanSearch} onChange={e=>setLoanSearch(e.target.value)} className={`flex-1 ${inp3}`} />
              <select value={loanFilter} onChange={e=>setLoanFilter(e.target.value)} className={inp3} style={{width:"auto"}}>
                <option value="all">All Applications</option>
                <option value="edit_pending">
      ⚠️ HR Edit Proposals Pending ({loansWithPendingEdits.length})
    </option>
    <option value="requirements_pending">📄 Requirements / Cheques Pending</option>
                <option value="hr_approved">⏳ Awaiting Final Admin Approval</option>
                <option value="commitment_pending">⏳ Pending Borrower Commitment</option>
                <option value="commitment_agreed">✅ Agreed Commitment</option>
                <option value="commitment_disagreed">❌ Disagreed Commitment</option>
                {["pending","guarantors_pending","approved","rejected","disbursed","repaying","cleared","defaulted","info_required","deactivated"].map(s=><option key={s} value={s}>{s.replace(/_/g," ")}</option>)}
              </select>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="lg:col-span-2 space-y-3">
          {filteredLoans.length === 0 ? (
  <div className="bg-white border border-slate-200 rounded-xl p-8 text-center text-slate-400 font-bold">
    No loans found
  </div>
) : (
  filteredLoans.map((loan) => (
    <div
      key={loan.id}
      onClick={() => {
        setSelectedLoan(loan);
        setLoanNotes("");
      }}
      className={`bg-white border rounded-xl p-4 cursor-pointer hover:shadow-md transition-all ${
        selectedLoan?.id === loan.id ? "border-blue-400" : "border-slate-200"
      }`}
    >
      <div className="flex justify-between items-start mb-2">
        <div>
          <p className="font-black text-slate-800">{loan.member_name}</p>
          <p className="text-xs text-slate-400">{loan.membership_no}</p>
        </div>
        <div className="flex items-center gap-2">
          {loan.pending_edit && (
            <span className="text-xs px-2.5 py-0.5 rounded-full font-black bg-amber-100 text-amber-900 border border-amber-300 animate-pulse">
              ⚠️ Edit Proposed
            </span>
          )}
          <span
            className={`text-xs px-2.5 py-0.5 rounded-full font-bold ${
              LOAN_STATUS_COLORS[loan.status] || "bg-slate-100"
            }`}
          >
            {loan.status === "hr_approved"
              ? "⏳ Awaiting Final Admin Approval"
              : loan.status?.replace(/_/g, " ")}
          </span>

          {deletableLoanStatuses.includes(loan.status) && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                deleteLoan(loan);
              }}
              className="bg-red-100 text-red-600 text-xs px-2 py-0.5 rounded font-bold hover:bg-red-200"
            >
              🗑️
            </button>
          )}
        </div>
      </div>

      <div className="flex justify-between text-sm">
        <span className="font-black text-slate-800">
          KES {loan.amount?.toLocaleString()}
        </span>
        <span className="text-slate-400">{loan.loan_type}</span>
        <span className={`font-bold text-xs ${RISK_COLORS[loan.risk_score]}`}>
          {loan.risk_score} risk
        </span>
      </div>

      {loan.status === "rejected" && loan.admin_notes && (
        <p className="text-xs text-red-600 mt-1 font-bold">
          Rejection reason: {loan.admin_notes}
        </p>
      )}
      {loan.status === "info_required" && loan.admin_notes && (
        <p className="text-xs text-orange-600 mt-1">
          ℹ️ Info requested: {loan.admin_notes}
        </p>
      )}
      {loan.disburse_proof && (
        <p className="text-xs text-purple-600 mt-1 font-bold">
          📎 Disbursement proof on file
        </p>
      )}
      {loan.penalty > 0 && (
        <p className="text-xs text-red-600 mt-1 font-bold">
          ⚠️ Penalty: KES {loan.penalty?.toLocaleString()}
        </p>
      )}

      {/* QUICK ACTION BUTTONS: Right on the card */}
      {loan.pending_edit && (
        <div className="mt-3 pt-2 border-t border-amber-200 flex gap-2">
          <button
            onClick={(e) => {
              e.stopPropagation();
              handleApproveProposedEdit(loan.id);
            }}
            className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold py-1.5 rounded-lg shadow transition"
          >
            ✅ Authorize Edit
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              handleRejectProposedEdit(loan.id);
            }}
            className="flex-1 bg-red-500 hover:bg-red-600 text-white text-xs font-bold py-1.5 rounded-lg shadow transition"
          >
            ❌ Decline Edit
          </button>
        </div>
      )}
    </div>
  ))
)}
              </div>
{selectedLoan && (
  <div className="bg-white rounded-xl border border-slate-200 p-5 h-fit space-y-4 shadow-sm">
    
    {/* ── HEADER ── */}
    <div className="flex justify-between items-center border-b pb-3">
      <div>
        <h3 className="font-black text-slate-800 text-base">Loan #{selectedLoan.id}</h3>
        <p className="text-xs text-slate-500 font-bold">{selectedLoan.member_name} ({selectedLoan.membership_no})</p>
      </div>
      <button onClick={() => setSelectedLoan(null)} className="text-slate-400 hover:text-slate-700 font-bold text-sm">✕</button>
    </div>
     {/* ── MOUNT LOAN REQUIREMENTS DESK FOR ADMIN ── */}
    <LoanRequirements
      loan={selectedLoan}
      userRole="admin"
      onDone={async () => {
        fetchLoans();
        const updatedList = await authGet("/loan-applications/all");
        const found = updatedList.find(l => l.id === selectedLoan.id);
        if (found) setSelectedLoan(found);
      }}
      notify={showToast}
    />
    
     {/* 2. Additional Security (Logbook) - Replaces Old Penalty */}
    <LoanSecurity
      loan={selectedLoan}
      userRole="admin"
      onDone={async () => {
        fetchLoans();
        const updated = await authGet("/loan-applications/all");
        const found = updated.find(l => l.id === selectedLoan.id);
        if (found) setSelectedLoan(found);
      }}
      notify={showToast}
    />

    {/* ── PROMINENT ADMIN "MAKE CHANGES" BANNER ── */}
    <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 flex justify-between items-center">
      <div>
        <p className="font-black text-blue-900 text-xs">Need to adjust principal, rate, or duration?</p>
        <p className="text-[11px] text-blue-700">Override terms before approving.</p>
      </div>
      <button
        onClick={() => {
          setAdminEditLoanForm({
            amount: selectedLoan.amount || "",
            interest_rate: selectedLoan.interest_rate || "",
            repayment_months: selectedLoan.repayment_months || "",
            purpose: selectedLoan.purpose || ""
          });
          setShowAdminEditLoanModal(true);
        }}
        className="bg-blue-600 hover:bg-blue-700 text-white text-xs px-3 py-1.5 rounded-lg font-black shadow transition whitespace-nowrap"
      >
        ✏️ Change Loan Terms
      </button>
    </div>

    {/* ── HR PENDING EDIT REVIEW DESK (Shows when HR has proposed edits) ── */}
    {selectedLoan.pending_edit && (() => {
      const pending = parsePendingEdit(selectedLoan.pending_edit);
      return (
        <div className="bg-amber-50 border-2 border-amber-300 rounded-xl p-4 text-xs shadow-sm space-y-2 mb-3">
          <div className="flex justify-between items-center">
            <p className="font-black text-amber-900 uppercase tracking-wider flex items-center gap-1.5 text-xs">
              ⚠️ HR Proposed Loan Adjustments Awaiting Approval
            </p>
          </div>
          <p className="text-slate-600 text-[11px]">
            HR <strong className="text-slate-800">{pending?.proposed_by_name || "HR"}</strong> submitted modifications on {pending?.proposed_at?.split("T")[0] || "recently"}.
          </p>

          <div className="grid grid-cols-2 gap-2 bg-white/90 p-2.5 rounded-lg border border-amber-200">
            <div>
              <span className="text-[10px] text-slate-400 block font-bold">Principal</span>
              <span className="text-slate-400 line-through">KES {pending?.old_amount?.toLocaleString()}</span>
              <span className="text-emerald-700 font-black block">→ KES {pending?.amount?.toLocaleString()}</span>
            </div>
            <div>
              <span className="text-[10px] text-slate-400 block font-bold">Interest Rate</span>
              <span className="text-slate-400 line-through">{pending?.old_interest_rate}%</span>
              <span className="text-emerald-700 font-black block">→ {pending?.interest_rate}%</span>
            </div>
            <div>
              <span className="text-[10px] text-slate-400 block font-bold">Duration</span>
              <span className="text-slate-400 line-through">{pending?.old_repayment_months} mos</span>
              <span className="text-emerald-700 font-black block">→ {pending?.repayment_months} mos</span>
            </div>
            <div>
              <span className="text-[10px] text-slate-400 block font-bold">Total Payable</span>
              <span className="text-slate-400 line-through">KES {pending?.old_total_payable?.toLocaleString()}</span>
              <span className="text-emerald-700 font-black block">→ KES {pending?.total_payable?.toLocaleString()}</span>
            </div>
          </div>

          {pending?.notes && (
            <p className="text-[11px] text-slate-600 italic">
              HR Justification: "{pending.notes}"
            </p>
          )}

          <div className="flex gap-2 pt-2">
            <button
              onClick={() => handleApproveProposedEdit(selectedLoan.id)}
              className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold py-2 rounded-lg text-xs shadow transition"
            >
              ✅ Authorize & Apply
            </button>
            <button
              onClick={() => handleRejectProposedEdit(selectedLoan.id)}
              className="flex-1 bg-red-500 hover:bg-red-600 text-white font-extrabold py-2 rounded-lg text-xs shadow transition"
            >
              ❌ Decline Changes
            </button>
          </div>
        </div>
      );
    })()}

                  {selectedLoan.status==="rejected" && selectedLoan.admin_notes && (
                    <div className="bg-red-50 border border-red-300 rounded-lg p-3 mb-3">
                      <p className="text-xs text-red-700 font-black mb-0.5">❌ Rejected — Reason (visible to borrower):</p>
                      <p className="text-xs text-red-600">{selectedLoan.admin_notes}</p>
                    </div>
                  )}
                  {selectedLoan.status==="info_required" && selectedLoan.admin_notes && (
                    <div className="bg-orange-50 border border-orange-300 rounded-lg p-3 mb-3">
                      <p className="text-xs text-orange-700 font-black mb-0.5">ℹ️ Info Requested (borrower can respond):</p>
                      <p className="text-xs text-orange-600">{selectedLoan.admin_notes}</p>
                    </div>
                  )}

                  <div className="space-y-1 text-sm mb-4">
                    {[["Member",selectedLoan.member_name],["Amount",`KES ${selectedLoan.amount?.toLocaleString()}`],["Interest",`${selectedLoan.interest_rate}%`],["Total",`KES ${selectedLoan.total_payable?.toLocaleString()}`],["Repaid",`KES ${selectedLoan.amount_repaid?.toLocaleString()}`],["Balance",`KES ${selectedLoan.balance?.toLocaleString()}`],["Risk",selectedLoan.risk_score]].map(([l,v])=>(
                      <div key={l} className="flex justify-between"><span className="text-slate-400">{l}</span><span className="font-bold text-xs text-slate-800">{v}</span></div>
                    ))}
                    
                    {selectedLoan.rate_commitment_status && selectedLoan.rate_commitment_status !== "none" && (
                      <div className="bg-blue-50 border border-blue-200 rounded-xl p-3.5 mb-3 text-xs shadow-sm">
                        <p className="font-black text-blue-800 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                          📢 Revised Terms Commitment Status
                        </p>
                        <div className="flex justify-between items-center mb-1.5">
                          <span className="text-slate-500 font-bold">Borrower Decision:</span>
                          <span className={`px-2 py-0.5 rounded-full font-extrabold text-[10px] uppercase tracking-wide border ${
                            selectedLoan.rate_commitment_status === "agreed" ? "bg-green-100 text-green-800 border-green-200 animate-pulse" :
                            selectedLoan.rate_commitment_status === "disagreed" ? "bg-red-100 text-red-800 border-red-200" :
                            "bg-yellow-100 text-yellow-800 border-yellow-200"
                          }`}>
                            {selectedLoan.rate_commitment_status === "agreed" ? "✅ Agreed / Accepted" :
                             selectedLoan.rate_commitment_status === "disagreed" ? "❌ Declined / Disagreed" :
                             "⏳ Awaiting Action"}
                          </span>
                        </div>
                        {selectedLoan.rate_change_notes && (
                          <div className="bg-white/80 p-2 rounded border border-blue-100 mt-2">
                            <p className="text-[10px] text-blue-800 leading-relaxed font-bold">
                              Revised Terms:
                            </p>
                            <p className="text-[11px] text-slate-700 font-medium italic mt-0.5">
                              "{selectedLoan.rate_change_notes}"
                            </p>
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {selectedLoan.disburse_proof && (
                    <div className="bg-green-50 border border-green-200 rounded-lg p-3 mb-3">
                      <p className="text-xs text-green-700 font-black mb-1">✅ Disbursement proof uploaded</p>
                      {selectedLoan.disburse_note && <p className="text-xs text-green-600 mb-2">{selectedLoan.disburse_note}</p>}
                      <div className="flex gap-2 flex-wrap">
                        <a href={selectedLoan.disburse_proof} target="_blank" rel="noreferrer" className="text-xs bg-green-600 text-white px-3 py-1 rounded font-bold hover:bg-green-700">📎 View Proof</a>
                        <button onClick={()=>setShowDisburseModal(true)} className="text-xs bg-white border border-green-300 text-green-700 px-3 py-1 rounded font-bold hover:bg-green-50">Update</button>
                      </div>
                    </div>
                  )}

                  {selectedLoan.supporting_doc && (
                    <a href={selectedLoan.supporting_doc} target="_blank" rel="noreferrer" className="block text-xs bg-blue-50 text-blue-700 border border-blue-200 text-center py-2 rounded-lg mb-3 hover:bg-blue-100">📎 View Supporting Doc</a>
                  )}

                  <div className="mb-3">
                    <label className="text-xs text-slate-600 uppercase tracking-widest mb-1 block">
                      {selectedLoan.status==="pending"?"Notes / Rejection Reason (shown to borrower)":
                       selectedLoan.status==="info_required"?"What info is needed (shown to borrower)":"Admin Notes"}
                    </label>
                    <textarea value={loanNotes} onChange={e=>setLoanNotes(e.target.value)} rows={2} placeholder="Notes..."
                      className="w-full border border-slate-300 rounded-lg p-2 text-sm text-slate-900 bg-white outline-none resize-none" />
                  </div>

                  {/* ACTION CONTROLS */}
                  <div className="space-y-2 pt-2 border-t border-slate-100">
                      {selectedLoan.pending_edit && (
    <div className="bg-amber-100 border border-amber-300 rounded-xl p-3 my-2 space-y-2">
      <p className="font-black text-amber-900 text-xs">⚠️ HR Modification Pending Authorization</p>
      <div className="flex gap-2">
        <button
          onClick={() => handleApproveProposedEdit(selectedLoan.id)}
          className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold py-2 rounded-lg text-xs shadow"
        >
          ✅ Authorize & Apply
        </button>
        <button
          onClick={() => handleRejectProposedEdit(selectedLoan.id)}
          className="flex-1 bg-red-500 hover:bg-red-600 text-white font-extrabold py-2 rounded-lg text-xs shadow"
        >
          ❌ Decline Changes
        </button>
      </div>
    </div>
  )}
                    {selectedLoan.status === "pending" && (
                      <div className="space-y-2">
                        <button onClick={() => approveLoan(selectedLoan.id)} className="w-full bg-emerald-500 text-white font-black py-2 rounded-lg text-sm hover:bg-emerald-600">✅ Approve</button>
                        <div className="grid grid-cols-2 gap-2">
                          <button onClick={() => rejectLoan(selectedLoan.id)} className="bg-red-500 text-white font-bold py-2 rounded-lg text-xs hover:bg-red-600">Reject</button>
                          <button onClick={() => requestMoreInfo(selectedLoan.id)} className="bg-amber-400 text-white font-bold py-2 rounded-lg text-xs hover:bg-amber-500">Request Info</button>
                        </div>
                      </div>
                    )}

                    {selectedLoan.status === "hr_approved" && (
                      <div className="bg-emerald-50 border border-emerald-300 rounded-xl p-3 my-2">
                        <p className="text-xs font-bold text-emerald-900 mb-2">✓ Verified & Recommended by HR. Ready to disburse.</p>
                        <button onClick={() => adminFinalApprove(selectedLoan.id)}
                          className="w-full bg-emerald-600 text-white font-black py-2.5 rounded-lg text-xs hover:bg-emerald-700 shadow">
                          ✅ Grant Final Admin Authorization & Disburse Funds
                        </button>
                      </div>
                    )}

                    {selectedLoan.status==="approved" && (
                      <div className="space-y-2">
                        <button onClick={()=>disburseLoan(selectedLoan.id)} className="w-full bg-purple-600 text-white font-black py-2 rounded-lg text-sm hover:bg-purple-700">💸 Mark as Disbursed</button>
                        <button onClick={()=>setShowDisburseModal(true)} className="w-full bg-blue-600 text-white font-black py-2 rounded-lg text-sm hover:bg-blue-700">📎 Upload Disbursement Proof</button>
                      </div>
                    )}

                    {selectedLoan.status==="disbursed" && (
                      <button onClick={()=>setShowDisburseModal(true)} className="w-full bg-blue-600 text-white font-black py-2 rounded-lg text-sm hover:bg-blue-700">
                        📎 {selectedLoan.disburse_proof?"Update":"Upload"} Disbursement Proof
                      </button>
                    )}

                    
                    {selectedLoan.status !== "deactivated" && (
                      <button onClick={() => deactivateLoan(selectedLoan.id)}
                        className="w-full bg-slate-200 text-slate-700 font-bold py-2 rounded-lg text-xs hover:bg-slate-300">
                        🚫 Deactivate Loan (Declare Void)
                      </button>
                    )}

                    {deletableLoanStatuses.includes(selectedLoan.status) && (
                      <div className="border-t border-slate-100 pt-2">
                        <button onClick={()=>deleteLoan(selectedLoan)} className="w-full bg-red-600 text-white font-black py-2 rounded-lg text-sm hover:bg-red-700">🗑️ Delete This Loan</button>
                        <p className="text-[11px] text-slate-400 mt-1 text-center">Only for pending/rejected/guarantor-pending</p>
                      </div>
                    )}
                  </div>
                  
                  {selectedLoan.penalty_status === "pending_approval" && (
                    <div className="bg-amber-50 border border-amber-300 rounded-xl p-4 my-3 text-xs shadow-sm">
                      <p className="font-black text-amber-800 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                        ⏳ Pending Penalty Clearance Verification
                      </p>
                      <p className="text-slate-700 font-semibold mb-3 leading-relaxed">
                        The borrower has submitted a penalty payment of <strong className="text-red-700">KES {selectedLoan.penalty_paid?.toLocaleString()}</strong>. Please verify your system's financial logs before taking action.
                      </p>
                      <div className="flex gap-2 font-bold">
                        <button
                          onClick={() => approvePenaltyClearance(selectedLoan.id)}
                          className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold py-2 rounded shadow transition-colors text-xs"
                        >
                          ✅ Approve Clearance
                        </button>
                        <button
                          onClick={() => rejectPenaltyClearance(selectedLoan.id)}
                          className="flex-1 bg-red-500 hover:bg-red-600 text-white font-extrabold py-2 rounded shadow transition-colors text-xs"
                        >
                          ❌ Reject Request
                        </button>
                      </div>
                    </div>
                  )}

                  {selectedLoan.guarantors?.length>0 && (
                    <div className="border-t border-slate-100 mt-3 pt-3">
                      <p className="text-xs text-slate-400 uppercase tracking-widest mb-2 font-bold">Guarantors</p>
                      {selectedLoan.guarantors.map(g=>(
                        <div key={g.id} className="flex justify-between text-xs py-1">
                          <span>Member #{g.guarantor_id}</span>
                          <span className={`font-bold ${g.status==="accepted"?"text-emerald-600":g.status==="rejected"?"text-red-600":"text-amber-600"}`}>{g.status}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ══ INACTIVE LOAN TYPES PORTAL MODAL ══ */}
        {showDeactivatedModal && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl p-6 overflow-hidden flex flex-col max-h-[80vh]">
              <div className="flex justify-between items-center border-b border-gray-200 pb-3 mb-4">
                <div>
                  <h3 className="font-black text-slate-900 text-lg">📋 Inactive / Deactivated Loan Types</h3>
                  <p className="text-xs text-slate-500">Reactivate old configurations to allow new loan applications.</p>
                </div>
                <button 
                  onClick={() => setShowDeactivatedModal(false)} 
                  className="text-slate-400 hover:text-slate-700 text-xl font-bold"
                >
                  ✕
                </button>
              </div>

              <div className="flex-1 overflow-y-auto pr-1 space-y-3">
                {deactivatedLoanTypes.length === 0 ? (
                  <p className="text-center py-8 text-slate-400 font-semibold text-sm">No deactivated loan types found.</p>
                ) : (
                  deactivatedLoanTypes.map(lt => (
                    <div key={lt.id} className="p-4 rounded-xl border border-slate-200 bg-slate-50 flex justify-between items-center">
                      <div>
                        <h4 className="font-bold text-slate-800 text-sm">{lt.name}</h4>
                        <p className="text-xs text-slate-400 mt-0.5">{lt.description || "No description provided."}</p>
                        <p className="text-[11px] text-slate-500 font-semibold mt-1">
                          Rate: {lt.interest_rate}% p.a. · Limits: KES {lt.min_amount?.toLocaleString()} - {lt.max_amount?.toLocaleString()}
                        </p>
                      </div>
                      <button
                        onClick={() => reactivateLoanType(lt.id, lt.name)}
                        className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-3 py-1.5 rounded-lg text-xs"
                      >
                        🔄 Reactivate
                      </button>
                    </div>
                  ))
                )}
              </div>

              <div className="flex justify-end border-t border-gray-200 pt-4 mt-4">
                <button 
                  onClick={() => setShowDeactivatedModal(false)} 
                  className="bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-bold px-4 py-2 rounded-lg"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ══ SAVINGS ══ */}
        {tab==="savings" && (
          <div className="p-8">
            <Savings />
          </div>
        )}

        {/* ══ RECEIPTS BY ROUTE ══ */}
        {tab==="receipts" && (
          <div className="p-8">
            <h2 className="text-2xl font-black text-slate-800 mb-2">🎫 Receipts by Route</h2>
            <p className="text-sm text-slate-400 mb-6">View tickets per route per day, with operator breakdown.</p>
            <div className="flex gap-3 mb-6 flex-wrap">
              <div><label className="text-xs text-slate-400 uppercase tracking-widest mb-1 block">Date</label><input type="date" value={receiptDate} onChange={e=>setReceiptDate(e.target.value)} className={inp3} /></div>
              <div><label className="text-xs text-slate-400 uppercase tracking-widest mb-1 block">Route (optional)</label>
                <select value={routeFilter} onChange={e=>setRouteFilter(e.target.value)} className={`${inp3} min-w-[200px]`}>
                  <option value="">All Routes</option>
                  {routes.map(r=><option key={r.id} value={r.id}>{r.from_stage} → {r.to_stage}</option>)}
                </select>
              </div>
              <div className="flex items-end"><button onClick={fetchReceiptsByRoute} className="bg-blue-600 text-white font-black px-5 py-2.5 rounded-lg text-sm hover:bg-blue-700">{receiptLoading?"Loading...":"View"}</button></div>
            </div>
            {receiptData && (
              <>
                <div className="grid grid-cols-3 gap-4 mb-6">
                  {[{label:"Total Tickets",value:receiptData.total_tickets||0,color:"bg-blue-50 border-blue-200 text-blue-700"},{label:"Total Collected",value:`KES ${(receiptData.grand_total||0).toLocaleString()}`,color:"bg-emerald-50 border-emerald-200 text-emerald-700"},{label:"Active Routes",value:receiptData.routes?.length||0,color:"bg-purple-50 border-purple-200 text-purple-700"}].map((s,i)=><div key={i} className={`border rounded-xl p-4 ${s.color}`}><p className="text-2xl font-black">{s.value}</p><p className="text-xs opacity-70">{s.label}</p></div>)}
                </div>
                {!selectedRoute ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {(receiptData.routes||[]).length===0 ? <div className="col-span-2 bg-white border border-slate-200 rounded-xl p-8 text-center text-slate-400 font-bold">No receipts for {receiptDate}</div>
                    : (receiptData.routes||[]).map((route,i)=>(
                      <div key={i} onClick={()=>setSelectedRoute(route)} className="bg-white border border-slate-200 rounded-xl p-5 cursor-pointer hover:shadow-lg hover:border-blue-300 transition-all">
                        <div className="flex justify-between items-start mb-3">
                          <div><p className="font-black text-slate-800 text-lg">{route.from_stage}</p><p className="text-slate-400 text-sm">→ {route.to_stage}</p></div>
                          <div className="text-right"><p className="text-2xl font-black text-emerald-700">KES {route.total?.toLocaleString()}</p><p className="text-xs text-slate-400">{route.count} tickets</p></div>
                        </div>
                        <div className="border-t border-slate-100 pt-3"><p className="text-xs text-slate-400 mb-2">Operators:</p>
                          <div className="flex flex-wrap gap-2">{(route.operators||[]).map((op,j)=><span key={j} className="text-xs bg-blue-50 border border-blue-200 text-blue-700 px-2 py-0.5 rounded font-bold">{op.name} · {op.count} · KES {op.total?.toLocaleString()}</span>)}</div>
                        </div>
                        <p className="text-xs text-blue-600 font-bold mt-3">Click to view all tickets →</p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div>
                    <button onClick={()=>setSelectedRoute(null)} className="flex items-center gap-2 text-blue-600 font-bold text-sm mb-4 hover:underline">← Back to routes</button>
                    <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                      <div className="bg-slate-800 text-white px-5 py-4 flex justify-between items-center">
                        <div><h3 className="font-black text-lg">{selectedRoute.from_stage} → {selectedRoute.to_stage}</h3><p className="text-slate-400 text-sm">{receiptDate}</p></div>
                        <div className="text-right"><p className="text-xl font-black text-emerald-400">KES {selectedRoute.total?.toLocaleString()}</p><p className="text-slate-400 text-sm">{selectedRoute.count} tickets</p></div>
                      </div>
                      <div className="p-4 bg-slate-50 border-b border-slate-200">
                        <p className="text-xs font-black text-slate-700 uppercase tracking-widest mb-2">Operator Breakdown</p>
                        <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                          {(selectedRoute.operators||[]).map((op,j)=><div key={j} className="bg-white border border-slate-200 rounded-lg p-3"><p className="font-black text-sm">{op.name}</p><p className="text-xs text-slate-500">{op.count} tickets</p><p className="text-emerald-700 font-bold text-sm">KES {op.total?.toLocaleString()}</p></div>)}
                        </div>
                      </div>
                      <table className="w-full text-sm">
                        <thead className="bg-slate-100 text-slate-600"><tr>{["Ticket","Plate","Amount","Payment","Time","Operator"].map(h=><th key={h} className="p-3 text-left font-bold">{h}</th>)}</tr></thead>
                        <tbody>
                          {(selectedRoute.receipts||[]).map(r=>(
                            <tr key={r.id} className="border-b border-slate-100 hover:bg-slate-50">
                              <td className="p-3 font-bold text-blue-700">{r.ticket_number}</td>
                              <td className="p-3 font-bold">{r.plate}</td>
                              <td className="p-3 font-black text-emerald-700">KES {r.shimo_fee?.toLocaleString()}</td>
                              <td className="p-3 text-xs"><span className="bg-slate-100 px-2 py-0.5 rounded font-bold">{r.mode_of_payment}</span></td>
                              <td className="p-3 text-xs text-slate-400">{r.time_issued}</td>
                              <td className="p-3 text-xs text-slate-500 font-mono">{r.operator_membership_no}</td>
                            </tr>
                          ))}
                        </tbody>
                        <tfoot className="bg-emerald-50 border-t-2 border-emerald-200">
                          <tr><td colSpan={2} className="p-3 font-black text-slate-700">TOTAL</td><td className="p-3 font-black text-emerald-700">KES {selectedRoute.total?.toLocaleString()}</td><td colSpan={3} className="p-3 text-xs text-slate-500">{selectedRoute.count} tickets</td></tr>
                        </tfoot>
                      </table>
                    </div>
                  </div>
                )}
              </>
            )}
            {!receiptData && !receiptLoading && <div className="bg-white border border-slate-200 rounded-xl p-12 text-center text-slate-400 font-bold"><p className="text-4xl mb-3">🎫</p><p>Select a date and click View</p></div>}
          </div>
        )}

        {/* ══ STAGE REVIEWS ══ */}
        {tab === "stage-review" && (
          <div className="p-8 space-y-6">
            <div className="flex justify-between items-center">
              <div>
                <h2 className="text-2xl font-black text-slate-800">🛡️ Stage Operations Review & Approval Desk</h2>
                <p className="text-sm text-slate-400">Review Main Stage (200 split) and Sub-Branch (100 welfare) records.</p>
              </div>
              <button onClick={() => fetchStageAuditData()} className="bg-blue-600 text-white text-xs px-4 py-2 rounded-lg font-bold">
                🔄 Refresh Stage Records
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="bg-white border border-slate-200 rounded-xl p-4">
                <p className="text-xs uppercase font-bold text-slate-400">Main Stage Collections (200)</p>
                <p className="text-xl font-black text-blue-700 mt-1">KES {stageStats.mainTotal || 0}</p>
                <p className="text-[11px] text-slate-500">Savings: 50 | Welfare: 50 | Police: 100</p>
              </div>
              <div className="bg-white border border-slate-200 rounded-xl p-4">
                <p className="text-xs uppercase font-bold text-slate-400">Sub-Branch Collections (100)</p>
                <p className="text-xl font-black text-purple-700 mt-1">KES {stageStats.subTotal || 0}</p>
                <p className="text-[11px] text-purple-600">100% Routed to Sub Welfare</p>
              </div>
              <div className="bg-white border border-slate-200 rounded-xl p-4">
                <p className="text-xs uppercase font-bold text-slate-400">Total Owner Savings Credited</p>
                <p className="text-xl font-black text-emerald-700 mt-1">KES {stageStats.savingsTotal || 0}</p>
                <p className="text-[11px] text-slate-500">Auto-credited at KES 50/trip</p>
              </div>
              <div className="bg-white border border-slate-200 rounded-xl p-4">
                <p className="text-xs uppercase font-bold text-slate-400">Police Stage Pool</p>
                <p className="text-xl font-black text-indigo-700 mt-1">KES {stageStats.policeTotal || 0}</p>
                <p className="text-[11px] text-slate-500">Allocated at KES 100/trip</p>
              </div>
            </div>

            <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
              <div className="bg-slate-800 text-white px-5 py-3.5 flex justify-between items-center">
                <h3 className="font-bold text-sm">Live Stage Transactions for Administrative Audit</h3>
                <span className="text-xs text-slate-400">Review & Mark Approved</span>
              </div>
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-100 text-slate-600 border-b">
                  <tr>
                    <th className="p-3 font-bold">Date</th>
                    <th className="p-3 font-bold">Stage Type</th>
                    <th className="p-3 font-bold">Vehicle Plate</th>
                    <th className="p-3 font-bold">Shimo Fee Paid</th>
                    <th className="p-3 font-bold">Split Breakdown</th>
                    <th className="p-3 font-bold">Audit Status</th>
                    <th className="p-3 text-right font-bold">Admin Action</th>
                  </tr>
                </thead>
                <tbody>
                  {stageRecords.length === 0 ? (
                    <tr><td colSpan="7" className="p-6 text-center text-slate-400 font-bold">No stage transactions pending review.</td></tr>
                  ) : (
                    stageRecords.map((rec) => (
                      <tr key={rec.id} className="border-b hover:bg-slate-50">
                        <td className="p-3 text-slate-500">{rec.date_issued}</td>
                        <td className="p-3 font-bold">
                          <span className={`px-2 py-0.5 rounded text-[10px] ${rec.stage_type==="main"?"bg-blue-100 text-blue-800":"bg-purple-100 text-purple-800"}`}>
                            {rec.stage_type === "main" ? "Main Stage" : "Sub-Branch"}
                          </span>
                        </td>
                        <td className="p-3 font-bold text-slate-900">{rec.plate}</td>
                        <td className="p-3 font-black text-slate-800">KES {rec.shimo_fee}</td>
                        <td className="p-3 text-slate-600">
                          {rec.stage_type === "main" ? (
                            <span>Savings: <b>50</b> | Welfare: <b>50</b> | Police: <b>100</b></span>
                          ) : (
                            <span>Welfare Pool: <b>100</b></span>
                          )}
                        </td>
                        <td className="p-3 font-bold">
                          <span className={`px-2 py-0.5 rounded font-bold text-[10px] ${rec.admin_approved ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"}`}>
                            {rec.admin_approved ? "✓ Approved" : "Pending Audit"}
                          </span>
                        </td>
                        <td className="p-3 text-right">
                          {!rec.admin_approved && (
                            <button
                              onClick={async () => {
                                await authPut(`/stage/transactions/${rec.id}/approve`);
                                showToast(`Transaction for ${rec.plate} approved and verified ✓`);
                                fetchStageAuditData();
                              }}
                              className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-3 py-1 rounded text-xs"
                            >
                              Approve
                            </button>
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

        {/* ══ MONITOR WORKERS ══ */}
        {tab==="workers" && (
          <div className="p-8">
            <h2 className="text-2xl font-black text-slate-800 mb-2">👷 Monitor Workers</h2>
            <p className="text-sm text-slate-400 mb-6">View performance, issue warnings, and track activity.</p>
            <div className="flex gap-3 mb-6 flex-wrap">
              <input placeholder="Search worker..." value={workerSearch} onChange={e=>setWorkerSearch(e.target.value)} className={`flex-1 ${inp3}`} />
              <select value={workerFilter} onChange={e=>setWorkerFilter(e.target.value)} className={inp3} style={{width:"auto"}}>
                <option value="all">All Roles</option>
                {["driver","conductor","stage_operator","owner"].map(r=><option key={r} value={r}>{r.replace("_"," ")}</option>)}
              </select>
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="lg:col-span-2 space-y-2">
                {filteredWorkers.map(w=>{
                  const warns = allWarnings.filter(x=>x.member_id===w.id);
                  const unack = warns.filter(x=>!x.is_acknowledged).length;
                  return (
                    <div key={w.id} onClick={()=>loadWorkerSummary(w)} className={`bg-white border rounded-xl p-4 cursor-pointer hover:shadow-md transition-all ${selectedWorker?.id===w.id?"border-blue-400":"border-slate-200"}`}>
                      <div className="flex justify-between items-center">
                        <div>
                          <div className="flex items-center gap-2"><p className="font-black text-slate-800">{w.name}</p>{unack>0&&<span className="bg-red-100 text-red-600 text-xs px-2 py-0.5 rounded-full font-bold">⚠️ {unack}</span>}</div>
                          <p className="text-xs text-slate-400">{w.membership_no} · <span className="capitalize">{w.role.replace("_"," ")}</span></p>
                        </div>
                        <span className="text-xs text-blue-600 font-bold">View →</span>
                      </div>
                    </div>
                  );
                })}
              </div>
              {selectedWorker && (
                <div className="space-y-4">
                  {workerSummary ? (
                    <>
                      <div className="bg-white rounded-xl border border-slate-200 p-5">
                        <h3 className="font-black text-slate-800 text-lg mb-1">{workerSummary.member?.name}</h3>
                        <p className="text-xs text-slate-400 mb-4 capitalize">{workerSummary.member?.role?.replace("_"," ")} · {workerSummary.member?.membership_no}</p>
                        <div className="grid grid-cols-2 gap-3 mb-4">
                          {[["Receipts",workerSummary.stats?.receipts_issued||0,"bg-blue-50 text-blue-700"],["Collected",`KES ${(workerSummary.stats?.total_collected||0).toLocaleString()}`,"bg-emerald-50 text-emerald-700"],["Earnings",workerSummary.stats?.earnings_submitted||0,"bg-amber-50 text-amber-700"],["Warnings",workerSummary.stats?.warnings_total||0,"bg-red-50 text-red-700"]].map(([l,v,c],i)=>(
                            <div key={i} className={`rounded-lg p-3 ${c}`}><p className="text-xl font-black">{v}</p><p className="text-xs opacity-70">{l}</p></div>
                          ))}
                        </div>
                      </div>
                      <div className="bg-white rounded-xl border border-orange-200 p-5">
                        <h4 className="font-black text-slate-700 text-sm mb-3">Issue Warning</h4>
                        <select value={warnForm.severity} onChange={e=>setWarnForm({...warnForm,severity:e.target.value})} className={`${inp} mb-2`}>
                          <option value="minor">Minor</option><option value="major">Major</option><option value="critical">Critical</option>
                        </select>
                        <textarea value={warnForm.reason} onChange={e=>setWarnForm({...warnForm,reason:e.target.value})} rows={2} placeholder="Reason for warning..." className="w-full border border-slate-300 rounded-lg p-2 text-sm text-slate-900 bg-white outline-none resize-none mb-2" />
                        <button onClick={issueWarning} className="w-full bg-orange-500 text-white font-black py-2 rounded-lg text-sm hover:bg-orange-600">⚠️ Issue Warning</button>
                      </div>
                      {warnings.length>0 && (
                        <div className="bg-white rounded-xl border border-slate-200 p-5">
                          <h4 className="font-black text-slate-700 text-sm mb-3">Warning History ({warnings.length})</h4>
                          <div className="space-y-2 max-h-48 overflow-y-auto">
                            {warnings.map(w=>(
                              <div key={w.id} className={`p-3 rounded-lg text-xs ${w.severity==="critical"?"bg-red-50":w.severity==="major"?"bg-orange-50":"bg-yellow-50"}`}>
                                <div className="flex justify-between items-start">
                                  <div><span className={`font-black capitalize ${w.severity==="critical"?"text-red-700":w.severity==="major"?"text-orange-700":"text-yellow-700"}`}>{w.severity}</span><p className="text-slate-600 mt-0.5">{w.reason}</p><p className="text-slate-400 mt-0.5">by {w.issued_by_name} · {new Date(w.created_at).toLocaleDateString()}</p></div>
                                  {!w.is_acknowledged && <button onClick={()=>acknowledgeWarning(w.id)} className="bg-slate-100 text-slate-600 px-2 py-0.5 rounded text-xs hover:bg-slate-200 ml-2 flex-shrink-0">Ack</button>}
                                </div>
                                {w.is_acknowledged && <p className="text-green-600 font-bold mt-1">✓ Acknowledged</p>}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </>
                  ) : <div className="bg-white rounded-xl border border-slate-200 p-8 text-center text-slate-400"><p className="text-2xl mb-2">⏳</p><p>Loading...</p></div>}
                </div>
              )}
            </div>
            <div className="mt-8">
              <h3 className="font-black text-slate-700 mb-3">All Warnings System-Wide ({allWarnings.length})</h3>
              <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-slate-800 text-white"><tr>{["Worker","Role","Severity","Reason","Issued By","Date","Status"].map(h=><th key={h} className="p-3 text-left font-bold">{h}</th>)}</tr></thead>
                  <tbody>
                    {allWarnings.length===0 ? <tr><td colSpan={7} className="p-6 text-center text-slate-400 font-bold">No warnings issued yet</td></tr>
                    : allWarnings.map(w=>(
                      <tr key={w.id} className="border-b border-slate-100 hover:bg-slate-50">
                        <td className="p-3 font-bold"><p className="font-bold text-sm">{w.member_name}</p><p className="text-xs text-slate-400">{w.membership_no}</p></td>
                        <td className="p-3 text-xs capitalize text-slate-500">{w.role?.replace("_"," ")}</td>
                        <td className="p-3"><span className={`text-xs font-bold px-2 py-0.5 rounded-full capitalize ${w.severity==="critical"?"bg-red-100 text-red-700":w.severity==="major"?"bg-orange-100 text-orange-700":"bg-yellow-100 text-yellow-700"} font-bold`}>{w.severity}</span></td>
                        <td className="p-3 text-xs text-slate-500 max-w-xs truncate">{w.reason}</td>
                        <td className="p-3 text-xs text-slate-500">{w.issued_by_name}</td>
                        <td className="p-3 text-xs text-slate-400">{new Date(w.created_at).toLocaleDateString()}</td>
                        <td className="p-3">{w.is_acknowledged?<span className="text-xs text-emerald-600 font-bold">✓ Acked</span>:<span className="text-xs text-red-600 font-bold">Pending</span>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* ══ SALARY ══ */}
        {tab==="salary" && (
          <div className="p-8 space-y-6">
            <div className="flex justify-between items-center bg-white border border-slate-200 rounded-xl p-4 flex-wrap gap-4 shadow-sm">
              <div>
                <h2 className="text-2xl font-black text-slate-800">💰 Salary & Pay Management</h2>
                <p className="text-sm text-slate-400">Disburse worker payrolls, view history, and download monthly statements.</p>
              </div>
              <div className="flex gap-2 items-center">
                <input type="month" value={reportMonth} onChange={e => setReportMonth(e.target.value)}
                  className="border border-slate-300 rounded-lg px-3 py-1.5 text-xs font-bold outline-none bg-white text-slate-700" />
                <button onClick={() => downloadSalaryReport(reportMonth)}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold px-4 py-2 rounded-lg text-xs shadow-sm">
                  📥 Download Report
                </button>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4 mb-6">
              {[
                { label: "Total Paid This Month", value: `KES ${totalSalaryThisMonth.toLocaleString()}`, accent: "bg-emerald-50 border-emerald-200 text-emerald-700" },
                { label: "Total Paid All Time", value: `KES ${approvedPayments.reduce((s, p) => s + p.amount, 0).toLocaleString()}`, accent: "bg-blue-50 border-blue-200 text-blue-700" },
                { label: "Configured Workers", value: salaryConfigs.length, accent: "bg-purple-50 border-purple-200 text-purple-700" },
              ].map((s, i) => (
                <div key={i} className={`flex flex-col items-center justify-center rounded-xl px-4 py-3 border ${s.accent}`}>
                  <span className="text-xl font-black">{s.value}</span>
                  <span className="text-xs opacity-70 mt-0.5 text-center leading-tight font-bold">{s.label}</span>
                </div>
              ))}
            </div>

            {pendingPayments.length > 0 && (
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-5">
                <h3 className="font-black text-amber-800 text-sm mb-3">⏳ Pending Salary Approvals ({pendingPayments.length})</h3>
                <div className="space-y-3">
                  {pendingPayments.map(p => (
                    <div key={p.id} className="flex justify-between items-center bg-white border border-amber-100 rounded-xl p-4 shadow-sm text-xs">
                      <div>
                        <p className="font-extrabold text-slate-800 text-sm">{p.member_name} ({p.membership_no})</p>
                        <p className="text-slate-500 mt-1">
                          Period: <span className="font-bold text-slate-700">{p.period}</span> · 
                          Type: <span className="font-bold text-slate-700 capitalize">{p.payment_type}</span> · 
                          Method: <span className="font-bold text-slate-700 capitalize">{p.payment_method}</span>
                        </p>
                        {p.notes && <p className="text-slate-400 italic mt-0.5">Notes: {p.notes}</p>}
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="font-black text-sm text-emerald-700">KES {p.amount?.toLocaleString()}</span>
                        <div className="flex gap-1.5">
                          <button onClick={() => handleApproveSalary(p.id)}
                            className="bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold px-3 py-1.5 rounded-lg text-xs transition-colors">
                            Approve
                          </button>
                          <button onClick={() => handleRejectSalary(p.id)}
                            className="bg-red-500 hover:bg-red-600 text-white font-extrabold px-3 py-1.5 rounded-lg text-xs transition-colors">
                            Reject
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
              <div className="bg-white border border-slate-200 rounded-xl p-5">
                <h3 className="font-black text-slate-700 mb-4">⚙️ Configure Salary</h3>
                <div className="relative mb-3">
                  <label className="text-xs text-slate-400 uppercase tracking-widest mb-1 block">Search & Select Member</label>
                  <input placeholder="Type name or membership no..." value={salaryMemberSearch}
                    onChange={e=>{setSalaryMemberSearch(e.target.value);setSalaryMemberDrop(true);setConfigForm({...configForm,member_id:""});setSelectedSalaryMember(null);}}
                    onFocus={()=>setSalaryMemberDrop(true)} className={inp3} />
                  {salaryMemberDrop&&salaryMemberSearch&&(
                    <div className="absolute z-50 bg-white border border-slate-200 w-full max-h-40 overflow-y-auto shadow-lg rounded-lg mt-1">
                      {salaryMemberMatches.map(m=>(
                        <div key={m.id} onClick={()=>{setSelectedSalaryMember(m);setSalaryMemberSearch(`${m.name} (${m.membership_no})`);setConfigForm({...configForm,member_id:m.id,role_label:m.role});setPayForm({...payForm,member_id:m.id});setSalaryMemberDrop(false);loadMemberSalaryHistory(m);}} className="p-2.5 hover:bg-blue-50 cursor-pointer border-b border-slate-100">
                          <p className="font-bold text-sm text-slate-800">{m.name}</p><p className="text-xs text-slate-400">{m.membership_no} · <span className="capitalize">{m.role.replace("_"," ")}</span></p>
                        </div>
                      ))}
                      {salaryMemberMatches.length===0&&<p className="p-3 text-slate-400 text-sm">No members found</p>}
                    </div>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-3 mb-3">
                  <div><label className="text-xs text-slate-400 uppercase tracking-widest mb-1 block">Base Salary (KES)</label><input type="number" placeholder="e.g. 25000" value={configForm.base_salary} onChange={e=>setConfigForm({...configForm,base_salary:e.target.value})} className={inp3} /></div>
                  <div><label className="text-xs text-slate-400 uppercase tracking-widest mb-1 block">Frequency</label>
                    <select value={configForm.payment_frequency} onChange={e=>setConfigForm({...configForm,payment_frequency:e.target.value})} className={inp3}>
                      <option value="monthly">Monthly</option><option value="weekly">Weekly</option><option value="daily">Daily</option>
                    </select>
                  </div>
                </div>
                <div className="mb-3"><label className="text-xs text-slate-400 uppercase tracking-widest mb-1 block">Role Label (optional)</label><input placeholder="e.g. Senior Driver" value={configForm.role_label} onChange={e=>setConfigForm({...configForm,role_label:e.target.value})} className={inp3} /></div>
                <button onClick={saveConfigForMember} className="w-full bg-slate-800 text-white font-black py-2.5 rounded-lg text-sm hover:bg-slate-700">💾 Save Salary Config</button>
              </div>
              <div className="bg-white border border-slate-200 rounded-xl p-5">
                <h3 className="font-black text-slate-700 mb-4">💳 Process Payment</h3>
                {selectedSalaryMember&&<div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-3 text-sm"><p className="font-bold text-blue-800">{selectedSalaryMember.name}</p><p className="text-blue-600 text-xs">{selectedSalaryMember.membership_no}</p></div>}
                <div className="grid grid-cols-2 gap-3 mb-3">
                  <div><label className="text-xs text-slate-400 uppercase tracking-widest mb-1 block">Amount (KES)</label><input type="number" placeholder="e.g. 25000" value={payForm.amount} onChange={e=>setPayForm({...payForm,amount:e.target.value})} className={inp3} /></div>
                  <div><label className="text-xs text-slate-400 uppercase tracking-widest mb-1 block">Type</label>
                    <select value={payForm.payment_type} onChange={e=>setPayForm({...payForm,payment_type:e.target.value})} className={inp3}>
                      <option value="salary">Salary</option><option value="bonus">Bonus</option><option value="advance">Advance</option><option value="allowance">Allowance</option>
                    </select>
                  </div>
                  <div><label className="text-xs text-slate-400 uppercase tracking-widest mb-1 block">Period</label><input placeholder="May 2026" value={payForm.period} onChange={e=>setPayForm({...payForm,period:e.target.value})} className={inp3} /></div>
                  <div><label className="text-xs text-slate-400 uppercase tracking-widest mb-1 block">Method</label>
                    <select value={payForm.payment_method} onChange={e=>setPayForm({...payForm,payment_method:e.target.value})} className={inp3}>
                      <option value="cash">Cash</option><option value="mpesa">M-Pesa</option><option value="bank">Bank</option>
                    </select>
                  </div>
                </div>
                {payForm.payment_method==="mpesa"&&<input placeholder="M-Pesa code" value={payForm.mpesa_code} onChange={e=>setPayForm({...payForm,mpesa_code:e.target.value})} className={`${inp3} mb-3`} />}
                <input placeholder="Notes (optional)" value={payForm.notes} onChange={e=>setPayForm({...payForm,notes:e.target.value})} className={`${inp3} mb-3`} />
                <button onClick={paySalary} className="w-full bg-emerald-600 text-white font-black py-2.5 rounded-lg text-sm hover:bg-emerald-700">✅ Process Payment</button>
              </div>
            </div>

            <div className="mb-6">
              <div className="flex justify-between items-center mb-3">
                <h3 className="font-black text-slate-700">Salary Configurations ({salaryConfigs.length})</h3>
                <input placeholder="Search..." value={salarySearch} onChange={e=>setSalarySearch(e.target.value)} className={`${inp3} w-64`} />
              </div>
              <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-slate-800 text-white"><tr>{["Member","Role","Base Salary","Frequency","Last Paid","Last Amount"].map(h=><th key={h} className="p-3 text-left font-bold">{h}</th>)}</tr></thead>
                  <tbody>
                    {filteredSalaryConfigs.length===0 ? <tr><td colSpan={6} className="p-6 text-center text-slate-400 font-bold">No salary configs yet</td></tr>
                    : filteredSalaryConfigs.map(c=>(
                      <tr key={c.id} className="border-b border-slate-100 hover:bg-slate-50 cursor-pointer" onClick={()=>{setSelectedSalaryMember({id:c.member_id,name:c.member_name,membership_no:c.membership_no,role:c.role});setSalaryMemberSearch(`${c.member_name} (${c.membership_no})`);setConfigForm({member_id:c.member_id,base_salary:c.base_salary,payment_frequency:c.payment_frequency,role_label:c.role_label||""});setPayForm({...payForm,member_id:c.member_id});loadMemberSalaryHistory({id:c.member_id});}}>
                        <td className="p-3 font-bold"><p>{c.member_name}</p><p className="text-xs text-slate-400">{c.membership_no}</p></td>
                        <td className="p-3 text-xs capitalize"><span className="bg-slate-100 px-2 py-0.5 rounded font-bold text-slate-700">{c.role_label||c.role?.replace("_"," ")}</span></td>
                        <td className="p-3 font-black text-emerald-700">KES {c.base_salary?.toLocaleString()}</td>
                        <td className="p-3 text-xs text-slate-500 capitalize">{c.payment_frequency}</td>
                        <td className="p-3 text-xs text-slate-400">{c.last_paid?new Date(c.last_paid).toLocaleDateString():"Never"}</td>
                        <td className="p-3 text-xs">{c.last_amount?<span className="font-bold text-emerald-700">KES {c.last_amount?.toLocaleString()} <span className="text-slate-400 font-normal">({c.last_period})</span></span>:"—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {selectedSalaryMember&&salaryMemberPayments.length>0&&(
              <div>
                <h3 className="font-black text-slate-700 mb-3">Payment History — {selectedSalaryMember.name}</h3>
                <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-800 text-white"><tr>{["Type","Period","Amount","Status","Method","M-Pesa Code","Notes","Date"].map(h=><th key={h} className="p-3 text-left font-bold">{h}</th>)}</tr></thead>
                    <tbody>
                      {salaryMemberPayments.map(p=>(
                        <tr key={p.id} className="border-b border-slate-100 hover:bg-slate-50">
                          <td className="p-3 text-xs capitalize"><span className="bg-blue-100 text-blue-700 px-2 py-0.5 rounded font-bold">{p.payment_type}</span></td>
                          <td className="p-3 font-bold text-sm">{p.period}</td>
                          <td className="p-3 font-black text-emerald-700">KES {p.amount?.toLocaleString()}</td>
                          <td className="p-3 text-xs capitalize">
                            <span className={`px-2 py-0.5 rounded-full font-bold ${
                              p.status === "approved" ? "bg-green-100 text-green-700" :
                              p.status === "rejected" ? "bg-red-100 text-red-700" :
                              "bg-amber-100 text-amber-800"
                            }`}>
                              {p.status === "approved" ? "Disbursed" : p.status === "rejected" ? "Rejected" : "Pending Approval"}
                            </span>
                          </td>
                          <td className="p-3 text-xs capitalize text-slate-500">{p.payment_method}</td>
                          <td className="p-3 text-xs text-slate-400 font-mono">{p.mpesa_code||"—"}</td>
                          <td className="p-3 text-xs text-slate-400 max-w-xs truncate">{p.notes||"—"}</td>
                          <td className="p-3 text-xs text-slate-400">{new Date(p.created_at).toLocaleDateString()}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot className="bg-emerald-50 border-t-2 border-emerald-200">
                      <tr><td colSpan={2} className="p-3 font-black text-slate-700">TOTAL PAID</td><td className="p-3 font-black text-emerald-700">KES {salaryMemberPayments.filter(p => p.status === "approved").reduce((s,p)=>s+p.amount,0).toLocaleString()}</td><td colSpan={5} className="p-3 text-xs text-slate-500">{salaryMemberPayments.filter(p => p.status === "approved").length} payments</td></tr>
                    </tfoot>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ══ CHART OF ACCOUNTS (LEDGER) ══ */}
        {tab==="ledger" && (
          <div className="p-8 space-y-6">
            <div className="flex justify-between items-center bg-white border border-slate-200 rounded-xl p-4 flex-wrap gap-4 shadow-sm">
              <div>
                <h2 className="text-2xl font-black text-slate-800">📈 Double-Entry Accounts Ledger & Chart of Accounts</h2>
                <p className="text-sm text-slate-400">Track loan flows, payments, penalty accruals, and interest balances inside proper asset and revenue accounts.</p>
              </div>
              <div className="flex gap-2">
                <button onClick={handleRebuildLedger} disabled={ledgerRebuilding}
                  className="bg-slate-900 text-white font-extrabold px-4 py-2.5 rounded-lg text-xs hover:bg-slate-800 flex items-center gap-1.5 transition-colors shadow-sm disabled:opacity-50">
                  {ledgerRebuilding ? "Compiling..." : "🔄 Recompile General Ledger"}
                </button>
                <button onClick={() => exportLedgerReport("csv")}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold px-4 py-2.5 rounded-lg text-xs shadow-sm transition-all">
                  📥 Export Spreadsheet
                </button>
                <button onClick={() => exportLedgerReport("print")}
                  className="bg-blue-600 hover:bg-blue-700 text-white font-extrabold px-4 py-2.5 rounded-lg text-xs shadow-sm transition-all">
                  🖨️ Print Statement
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
              {[
                { label: "1200 - Cash & Bank Balance (Asset)", value: ledgerData.balances?.["1200"] || 0, color: "bg-blue-50 border-blue-200 text-blue-700" },
                { label: "1300 - Loans Receivable (Asset)", value: ledgerData.balances?.["1300"] || 0, color: "bg-amber-50 border-amber-200 text-amber-700" },
                { label: "1350 - Penalties Receivable (Asset)", value: ledgerData.balances?.["1350"] || 0, color: "bg-red-50 border-red-200 text-red-700" },
                { label: "4100 - Interest Revenue (Revenue)", value: ledgerData.balances?.["4100"] || 0, color: "bg-emerald-50 border-emerald-200 text-emerald-700" },
                { label: "4200 - Penalty Revenue (Revenue)", value: ledgerData.balances?.["4200"] || 0, color: "bg-purple-50 border-purple-200 text-purple-700" }
              ].map((c, i) => (
                <div key={i} className={`border rounded-xl p-4 ${c.color} font-bold`}>
                  <p className="text-[10px] uppercase tracking-widest opacity-80 mb-1 leading-tight">{c.label}</p>
                  <p className="text-xl font-black">KES {c.value.toLocaleString()}</p>
                </div>
              ))}
            </div>

            <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm space-y-4">
              <h3 className="font-black text-slate-700 text-xs uppercase tracking-wider">Filter Ledger Report</h3>
              <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                <div>
                  <label className="text-[10px] text-slate-400 uppercase tracking-widest block mb-1">Start Date</label>
                  <input type="date" value={ledgerFilters.start_date}
                    onChange={e => setLedgerForm({ ...ledgerFilters, start_date: e.target.value })}
                    className={inp3} />
                </div>
                <div>
                  <label className="text-[10px] text-slate-400 uppercase tracking-widest block mb-1">End Date</label>
                  <input type="date" value={ledgerFilters.end_date}
                    onChange={e => setLedgerForm({ ...ledgerFilters, end_date: e.target.value })}
                    className={inp3} />
                </div>
                <div>
                  <label className="text-[10px] text-slate-400 uppercase tracking-widest block mb-1">Isolate Account</label>
                  <select value={ledgerFilters.account_code}
                    onChange={e => setLedgerForm({ ...ledgerFilters, account_code: e.target.value })}
                    className={inp3}>
                    <option value="">All Accounts</option>
                    <option value="1200">1200 - Cash & Bank</option>
                    <option value="1300">1300 - Loans Receivable</option>
                    <option value="1350">1350 - Penalties Receivable</option>
                    <option value="4100">4100 - Interest Revenue</option>
                    <option value="4200">4200 - Penalty Revenue</option>
                  </select>
                </div>
                <div>
                  <label className="text-[10px] text-slate-400 uppercase tracking-widest block mb-1">Flow Type</label>
                  <select value={ledgerFilters.transaction_type}
                    onChange={e => setLedgerForm({ ...ledgerFilters, transaction_type: e.target.value })}
                    className={inp3}>
                    <option value="">All Flows</option>
                    <option value="disbursement">Disbursements</option>
                    <option value="repayment_principal">Principal Repayments</option>
                    <option value="repayment_interest">Interest Repayments</option>
                    <option value="penalty_accrual">Penalty Accruals</option>
                    <option value="penalty_payment">Penalty Payments</option>
                  </select>
                </div>
                <div className="flex items-end gap-2">
                  <button onClick={fetchLedger} disabled={ledgerLoading}
                    className="w-full bg-slate-900 text-white font-black py-2.5 rounded-lg text-sm hover:bg-slate-800 shadow transition-all">
                    {ledgerLoading ? "Filtering..." : "Apply Filters"}
                  </button>
                  <button onClick={() => { setLedgerForm({ start_date: "", end_date: "", account_code: "", transaction_type: "" }); }}
                    className="bg-slate-200 text-slate-700 font-extrabold px-3 py-2.5 rounded-lg hover:bg-slate-300 transition-all text-sm">
                    ✕
                  </button>
                </div>
              </div>
            </div>

            <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
              <table className="w-full text-sm">
                <thead className="bg-slate-800 text-white font-bold">
                  <tr>
                    <th className="p-3 text-left">Date</th>
                    <th className="p-3 text-left">Flow Type</th>
                    <th className="p-3 text-left">Member Reference</th>
                    <th className="p-3 text-left">Debit Account</th>
                    <th className="p-3 text-left">Credit Account</th>
                    <th className="p-3 text-right">Amount (KES)</th>
                    <th className="p-3 text-left">Entry Narration</th>
                  </tr>
                </thead>
                <tbody>
                  {ledgerData.entries?.length === 0 ? (
                    <tr><td colSpan={7} className="p-8 text-center text-slate-400 font-bold">No general ledger entries match your criteria. Click Recompile historical general ledger if you haven't synchronized yet.</td></tr>
                  ) : (
                    ledgerData.entries?.map(e => (
                      <tr key={e.id} className="border-b border-slate-100 hover:bg-slate-50 transition-all">
                        <td className="p-3 text-xs text-slate-500 font-mono">{e.date}</td>
                        <td className="p-3 text-xs">
                          <span className={`px-2 py-0.5 rounded font-black capitalize ${
                            e.transaction_type === "disbursement" ? "bg-amber-100 text-amber-800" :
                            e.transaction_type === "repayment_principal" ? "bg-blue-100 text-blue-800" :
                            e.transaction_type === "repayment_interest" ? "bg-emerald-100 text-emerald-800" :
                            e.transaction_type === "penalty_accrual" ? "bg-red-100 text-red-800 animate-pulse" :
                            "bg-purple-100 text-purple-800"
                          }`}>
                            {e.transaction_type.replace(/_/g, " ")}
                          </span>
                        </td>
                        <td className="p-3"><p className="font-bold text-slate-800">{e.member_name}</p><p className="text-[10px] text-slate-500 font-mono">{e.membership_no} · Loan #{e.loan_id}</p></td>
                        <td className="p-3 text-xs font-semibold text-slate-700">{e.debit_account}</td>
                        <td className="p-3 text-xs font-semibold text-slate-700">{e.credit_account}</td>
                        <td className="p-3 text-right font-black text-slate-800">KES {e.amount.toLocaleString()}</td>
                        <td className="p-3 text-xs text-slate-500">{e.description}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
              <div className="p-3 bg-slate-50 border-t text-xs font-bold text-slate-500">
                Total Match Lines: {ledgerData.entries?.length || 0} journal lines
              </div>
            </div>
          </div>
        )}

        {/* ══ RECEIPT SETTINGS ══ */}
        {tab==="settings" && (
          <div className="p-8">
            <h2 className="text-2xl font-black text-slate-800 mb-2">⚙️ Receipt Settings</h2>
            <p className="text-sm text-slate-400 mb-6">Configure the SACCO information printed on all receipts generated by stage operators.</p>
            <div className="bg-white rounded-xl border border-slate-200 p-6 max-w-xl">
              <div className="space-y-4">
                <div>
                  <label className="text-xs text-slate-500 font-bold uppercase tracking-widest block mb-1">SACCO / Company Name</label>
                  <input value={saccoSettings.sacco_name || ""} onChange={e => setSaccoSettings({...saccoSettings, sacco_name: e.target.value})} className={inp3} placeholder="e.g. 2KM SACCO" />
                </div>
                <div>
                  <label className="text-xs text-slate-500 font-bold uppercase tracking-widest block mb-1">Location / Office Address</label>
                  <input value={saccoSettings.location || ""} onChange={e => setSaccoSettings({...saccoSettings, location: e.target.value})} className={inp3} placeholder="e.g. Mombasa Central Office" />
                </div>
                <div>
                  <label className="text-xs text-slate-500 font-bold uppercase tracking-widest block mb-1">P.O. Box</label>
                  <input value={saccoSettings.po_box || ""} onChange={e => setSaccoSettings({...saccoSettings, po_box: e.target.value})} className={inp3} placeholder="e.g. PO Box 12345 - 80100" />
                </div>
                <div>
                  <label className="text-xs text-slate-500 font-bold uppercase tracking-widest block mb-1">Telephone / Hotline Number</label>
                  <input value={saccoSettings.phone_number || ""} onChange={e => setSaccoSettings({...saccoSettings, phone_number: e.target.value})} className={inp3} placeholder="e.g. +254 712 345 678" />
                </div>
                <button onClick={saveSaccoSettings} disabled={updatingSacco} className="w-full bg-blue-600 text-white font-black py-2.5 rounded-lg text-sm hover:bg-blue-700 disabled:opacity-50">
                  {updatingSacco ? "Saving..." : "Save Receipt Settings"}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ══ AUDIT LOG ══ */}
        {tab==="audit" && (
          <div className="p-8">
            <h2 className="text-2xl font-black text-slate-800 mb-1">📋 Permanent Audit Log</h2>
            <p className="text-sm text-slate-400 mb-6">Immutable record of all admin and HR actions.</p>
            <div className="flex gap-3 mb-5 flex-wrap">
              <input placeholder="Search action, member, or name..." value={auditSearch} onChange={e=>setAuditSearch(e.target.value)} className={`flex-1 ${inp3}`} />
              <select value={auditCategory} onChange={e=>setAuditCategory(e.target.value)} className={inp3} style={{width:"auto"}}>
                <option value="all">All Categories</option>
                {["member","general","loan","matatu","route","worker","receipt"].map(c=><option key={c} value={c}>{c.charAt(0).toUpperCase()+c.slice(1)}</option>)}
              </select>
            </div>
            <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
              <div className="bg-slate-50 px-5 py-3 border-b border-slate-200 flex justify-between items-center">
                <h3 className="font-black text-slate-700 text-sm">Total: {filteredAudit.length} entries</h3>
                <span className="text-xs text-slate-400">🔒 Read-only · permanent record</span>
              </div>
              <table className="w-full text-sm">
                <thead className="bg-slate-800 text-white"><tr>{["Action","Category","Member","Performed By","Details","Timestamp"].map(h=><th key={h} className="p-3 text-left font-bold">{h}</th>)}</tr></thead>
                <tbody>
                  {filteredAudit.length===0 ? <tr><td colSpan={6} className="p-8 text-center text-slate-400 font-bold">No audit records found</td></tr>
                  : filteredAudit.map(a=>(
                    <tr key={a.id} className="border-b border-slate-100 hover:bg-slate-50">
                      <td className="p-3"><span className="font-bold text-blue-700 text-xs">{a.action}</span></td>
                      <td className="p-3"><span className="capitalize text-xs bg-slate-100 px-2 py-0.5 rounded font-bold text-slate-600">{a.category}</span></td>
                      <td className="p-3 text-xs text-slate-500 font-mono">{a.membership_no||"—"}</td>
                      <td className="p-3"><p className="font-bold text-emerald-700 text-xs">{a.performed_by_name}</p><p className="text-xs text-slate-400 capitalize">{a.performed_by_role}</p></td>
                      <td className="p-3 text-xs text-slate-400 max-w-xs truncate">{a.details||"—"}</td>
                      <td className="p-3 text-xs text-slate-400">{new Date(a.created_at).toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* ══ DISBURSEMENT PROOF MODAL ══ */}
      {showDisburseModal && selectedLoan && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md p-6">
            <div className="flex justify-between items-center mb-4">
              <h3 className="font-black text-slate-800">📎 Upload Disbursement Proof</h3>
              <button onClick={()=>setShowDisburseModal(false)} className="text-slate-400 hover:text-slate-700 text-xl font-bold">✕</button>
            </div>
            <div className="bg-purple-50 border border-purple-200 rounded-lg p-3 mb-4">
              <p className="text-sm font-bold text-purple-800">Loan #{selectedLoan.id} — {selectedLoan.member_name}</p>
              <p className="text-xs text-purple-600 mt-1">KES {selectedLoan.amount?.toLocaleString()} disbursement proof</p>
              <p className="text-xs text-purple-600 mt-0.5">This proof will be visible to the borrower, HR, and admin — confirming the loan was received.</p>
            </div>
            <div className="space-y-3 mb-4">
              <div>
                <label className="text-xs text-slate-700 font-bold uppercase tracking-widest mb-1 block">Proof File (M-Pesa screenshot / bank slip / letter)</label>
                <input type="file" accept="image/*,.pdf" onChange={e=>setDisburseProofFile(e.target.files[0])}
                  className="w-full border border-slate-300 rounded-lg p-2.5 text-sm bg-white text-slate-700 file:mr-3 file:bg-purple-600 file:text-white file:border-0 file:rounded file:px-3 file:py-1 file:font-bold file:text-xs" />
              </div>
              <div>
                <label className="text-xs text-slate-700 font-bold uppercase tracking-widest mb-1 block">Note (optional)</label>
                <textarea rows={2} placeholder="e.g. Disbursed via M-Pesa to 07XXXXXXXX on DD/MM/YYYY..."
                  value={disburseNote} onChange={e=>setDisburseNote(e.target.value)}
                  className="w-full border border-slate-300 rounded-lg p-2.5 text-sm text-slate-900 bg-white outline-none resize-none" />
              </div>
            </div>
            <div className="flex gap-3">
              <button onClick={uploadDisburseProof} disabled={disburseLoading}
                className="flex-1 bg-purple-600 text-white font-black py-3 rounded-lg hover:bg-purple-700 disabled:opacity-50">
                {disburseLoading?"Uploading...":"📤 Upload Proof"}
              </button>
              <button onClick={()=>setShowDisburseModal(false)} className="flex-1 bg-slate-100 text-slate-700 font-bold py-3 rounded-lg hover:bg-slate-200">Cancel</button>
            </div>
          </div>
        </div>
      )}
   {/* ══ ADMIN DIRECT EDIT LOAN MODAL ══ */}
      {showAdminEditLoanModal && selectedLoan && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg p-6 overflow-hidden flex flex-col">
            <div className="flex justify-between items-center border-b pb-3 mb-4">
              <div>
                <h3 className="font-black text-slate-800 text-lg">✏️ Direct Loan Modification (Admin)</h3>
                <p className="text-xs text-slate-500">
                  Modifying Loan #{selectedLoan.id} — <span className="font-bold text-slate-800">{selectedLoan.member_name}</span>
                </p>
              </div>
              <button onClick={() => setShowAdminEditLoanModal(false)} className="text-slate-400 hover:text-slate-700 font-bold text-lg">✕</button>
            </div>

            <div className="bg-amber-50 border border-amber-200 text-amber-900 rounded-lg p-3 text-xs leading-relaxed mb-4 font-semibold">
              🔔 <strong>Notice:</strong> As Administrator, your adjustments will reflect <strong>immediately</strong> on the member's active loan ledger. An automated notification alert will be dispatched to the HR team.
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="text-[11px] text-slate-600 uppercase font-bold block mb-1">Principal Amount (KES)</label>
                <input
                  type="number"
                  value={adminEditLoanForm.amount}
                  onChange={e => setAdminEditLoanForm({ ...adminEditLoanForm, amount: e.target.value })}
                  className="w-full border border-slate-300 rounded-lg p-2.5 text-sm outline-none focus:border-blue-500 font-bold bg-white"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[11px] text-slate-600 uppercase font-bold block mb-1">Interest Rate % p.a.</label>
                  <input
                    type="number"
                    step="0.1"
                    value={adminEditLoanForm.interest_rate}
                    onChange={e => setAdminEditLoanForm({ ...adminEditLoanForm, interest_rate: e.target.value })}
                    className="w-full border border-slate-300 rounded-lg p-2.5 text-sm outline-none focus:border-blue-500 font-bold bg-white"
                  />
                </div>
                <div>
                  <label className="text-[11px] text-slate-600 uppercase font-bold block mb-1">Repayment Months</label>
                  <input
                    type="number"
                    value={adminEditLoanForm.repayment_months}
                    onChange={e => setAdminEditLoanForm({ ...adminEditLoanForm, repayment_months: e.target.value })}
                    className="w-full border border-slate-300 rounded-lg p-2.5 text-sm outline-none focus:border-blue-500 font-bold bg-white"
                  />
                </div>
              </div>

              {Boolean(adminEditLoanForm.amount && adminEditLoanForm.repayment_months) && (
                <div className="bg-slate-50 border rounded-lg p-3 grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <span className="text-slate-400 block font-bold text-[10px]">New Total Payable</span>
                    <span className="font-black text-slate-800 text-sm">
                      KES {(
                        parseFloat(adminEditLoanForm.amount || 0) +
                        (parseFloat(adminEditLoanForm.amount || 0) * parseFloat(adminEditLoanForm.interest_rate || 0) / 100) *
                        (parseInt(adminEditLoanForm.repayment_months || 1) / 12)
                      ).toLocaleString(undefined, { maximumFractionDigits: 0 })}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-400 block font-bold text-[10px]">New Monthly Due</span>
                    <span className="font-black text-emerald-700 text-sm">
                      KES {(
                        (parseFloat(adminEditLoanForm.amount || 0) +
                        (parseFloat(adminEditLoanForm.amount || 0) * parseFloat(adminEditLoanForm.interest_rate || 0) / 100) *
                        (parseInt(adminEditLoanForm.repayment_months || 1) / 12)) /
                        parseInt(adminEditLoanForm.repayment_months || 1)
                      ).toLocaleString(undefined, { maximumFractionDigits: 0 })}
                    </span>
                  </div>
                </div>
              )}

              <div>
                <label className="text-[11px] text-slate-600 uppercase font-bold block mb-1">Purpose / Reason</label>
                <input
                  value={adminEditLoanForm.purpose}
                  onChange={e => setAdminEditLoanForm({ ...adminEditLoanForm, purpose: e.target.value })}
                  className="w-full border border-slate-300 rounded-lg p-2.5 text-sm outline-none focus:border-blue-500 bg-white"
                />
              </div>
            </div>

            <div className="flex gap-2 justify-end border-t pt-4 mt-5">
              <button
                type="button"
                onClick={() => setShowAdminEditLoanModal(false)}
                className="bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold px-4 py-2 rounded-lg text-xs"
              >
                Cancel
              </button>
              <button
                onClick={handleAdminDirectEdit}
                className="bg-blue-600 hover:bg-blue-700 text-white font-black px-5 py-2 rounded-lg text-xs shadow"
              >
                Save & Notify HR
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}