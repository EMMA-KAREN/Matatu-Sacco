
import { useEffect, useState, useCallback } from "react";
import { useAuth } from "../context/AuthContext";
import API from "../api";
import Matatu from "../pages/Matatus";

const tok = () => localStorage.getItem("token");
const hdr = (json = true) => ({
  Authorization: `Bearer ${tok()}`,
  ...(json ? { "Content-Type": "application/json" } : {})
});
const authGet  = (url) => fetch(`${API}${url}`, { headers: hdr() }).then(r => r.ok ? r.json() : []);
const authPost = (url, body) => fetch(`${API}${url}`, { method: "POST", headers: hdr(), body: JSON.stringify(body) });
const authPut  = (url, body) => fetch(`${API}${url}`, { method: "PUT",  headers: hdr(), body: body ? JSON.stringify(body) : undefined });
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
  { key: "receipts", label: "🎫 Receipts by Route" },
  { key: "workers",  label: "👷 Monitor Workers" },
  { key: "salary",   label: "💵 Salary & Pay" },
  { key: "audit",    label: "📋 Audit Log" },
];

// Shared input styles — always visible text
const inp  = "w-full border border-slate-300 rounded-lg p-2 text-sm outline-none focus:border-blue-500 bg-white text-slate-900 placeholder-slate-400";
const inp3 = "w-full border border-slate-300 rounded-lg p-2.5 text-sm outline-none focus:border-blue-500 bg-white text-slate-900 placeholder-slate-400";

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
  const { user } = useAuth();
  const [tab, setTab] = useState("overview");
  const [toast, setToast] = useState(null);
  const showToast = (msg, type = "success") => setToast({ msg, type });

  // stats
  const [stats, setStats] = useState({});

  // members
  const [members, setMembers]   = useState([]);
  const [pending, setPending]   = useState([]);
  const [memberSearch, setMemberSearch] = useState("");
  const [memberPage, setMemberPage]     = useState(1);
  const [selectedMember, setSelectedMember] = useState(null);
  const [editForm, setEditForm]   = useState({});
  const [createForm, setCreateForm] = useState({ membership_no:"", name:"", national_id:"", phone:"", password:"", role:"member" });
  const PER_PAGE = 20;

  // matatus
  const [matatus, setMatatus]             = useState([]);
  const [routes, setRoutes]               = useState([]);
  const [selectedMatatu, setSelectedMatatu] = useState(null);
  const [matatuSearch, setMatatuSearch]   = useState("");
  const [assignRouteId, setAssignRouteId] = useState("");

  // routes
  const [routeForm, setRouteForm]         = useState({ from_stage:"", to_stage:"", shimo_fee:"" });
  const [editingRouteId, setEditingRouteId] = useState(null);
  const [editRouteForm, setEditRouteForm] = useState({});
  const [routeSearch, setRouteSearch]     = useState("");

  // loans
  const [loans, setLoans]                 = useState([]);
  const [loanTypes, setLoanTypes]         = useState([]);
  const [selectedLoan, setSelectedLoan]   = useState(null);
  const [loanNotes, setLoanNotes]         = useState("");
  const [loanSearch, setLoanSearch]       = useState("");
  const [loanFilter, setLoanFilter]       = useState("all");
  const [penaltyAmt, setPenaltyAmt]       = useState("");
  const [penaltyReason, setPenaltyReason] = useState("");
  const [ltForm, setLtForm] = useState({ name:"", interest_rate:"", max_amount:"", min_amount:"", max_months:"", min_months:"", description:"" });

  // loan type settings (T&C + penalty policy)
  const [editingLtId, setEditingLtId]     = useState(null);
  const [ltEditForm, setLtEditForm]       = useState({});
  const [ltTermsFile, setLtTermsFile]     = useState(null);
  const [savingLt, setSavingLt]           = useState(false);

  // disbursement proof
  const [showDisburseModal, setShowDisburseModal] = useState(false);
  const [disburseProofFile, setDisburseProofFile] = useState(null);
  const [disburseNote, setDisburseNote]           = useState("");
  const [disburseLoading, setDisburseLoading]     = useState(false);

  // savings
  const [savings, setSavings]             = useState([]);
  const [savingsSearch, setSavingsSearch] = useState("");

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

  // ── fetchers ──────────────────────────────────────────────────────────────
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
  const fetchSavings   = useCallback(() => authGet("/admin/savings").then(d=>setSavings(d||[])), []);
  const fetchAudit     = useCallback(() => {
    const q = auditCategory!=="all" ? `?category=${auditCategory}` : "";
    return authGet(`/audit/permanent${q}`).then(d=>setAuditLogs(d||[]));
  }, [auditCategory]);
  const fetchWorkers       = useCallback(() => authGet("/hr/members").then(d=>setWorkers(d||[])), []);
  const fetchAllWarnings   = useCallback(() => authGet("/workers/warnings/all").then(d=>setAllWarnings(d||[])), []);
  const fetchSalaryConfigs = useCallback(() => authGet("/salary/config").then(d=>setSalaryConfigs(d||[])), []);
  const fetchSalaryPayments = useCallback(() => authGet("/salary/payments").then(d=>setSalaryPayments(d||[])), []);

  useEffect(() => { fetchStats(); fetchMembers(); fetchMatatus(); fetchRoutes(); }, []);
  useEffect(() => {
    if (tab==="loans")   { fetchLoans(); fetchLoanTypes(); }
    if (tab==="savings") fetchSavings();
    if (tab==="audit")   fetchAudit();
    if (tab==="workers") { fetchWorkers(); fetchAllWarnings(); }
    if (tab==="salary")  { fetchSalaryConfigs(); fetchSalaryPayments(); }
  }, [tab]);
  useEffect(() => { if (tab==="audit") fetchAudit(); }, [auditCategory]);

  const logAudit = async (action, category, member_id, membership_no, details) => {
    try {
      await authPost("/audit/permanent", { action, category, member_id, membership_no, details });
      if (tab==="audit") fetchAudit();
    } catch(e) {}
  };

  // ── MEMBERS ───────────────────────────────────────────────────────────────
  const createMember = async () => {
    if (!createForm.membership_no.trim()) return showToast("Membership No required","error");
    const res = await fetch(`${API}/hr/create-member`,{method:"POST",headers:hdr(),body:JSON.stringify(createForm)});
    const d = await res.json();
    if (!res.ok) return showToast(d.error||"Failed","error");
    showToast("Member created ✓");
    await logAudit("MEMBER_CREATED","member",null,createForm.membership_no,`Created by Admin: ${user?.name}`);
    setCreateForm({membership_no:"",name:"",national_id:"",phone:"",password:"",role:"member"});
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
    await authPut(`/hr/approve/${id}`);
    const m = pending.find(x=>x.id===id);
    showToast("Member approved ✓");
    await logAudit("MEMBER_APPROVED","member",id,m?.membership_no,"Approved by Admin");
    fetchMembers(); fetchStats();
  };
  const rejectMember = async (id) => {
    if (!window.confirm("Reject and delete this pending member?")) return;
    await authDel(`/hr/reject/${id}`);
    showToast("Member rejected"); fetchMembers();
  };

  // ── MATATUS ───────────────────────────────────────────────────────────────
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

  // ── ROUTES ────────────────────────────────────────────────────────────────
  const createRoute = async () => {
    if (!routeForm.from_stage||!routeForm.to_stage||!routeForm.shimo_fee) return showToast("All fields required","error");
    const res = await authPost("/routes",{...routeForm,shimo_fee:parseFloat(routeForm.shimo_fee)});
    const d = await res.json();
    if (!res.ok) return showToast(d.error||"Failed","error");
    showToast("Route created ✓");
    setRouteForm({from_stage:"",to_stage:"",shimo_fee:""}); fetchRoutes();
  };
  const saveEditRoute = async (id) => {
    const res = await authPut(`/routes/${id}`,{...editRouteForm,shimo_fee:parseFloat(editRouteForm.shimo_fee)});
    if (!res.ok) return showToast("Update failed","error");
    showToast("Route updated ✓"); setEditingRouteId(null); fetchRoutes();
  };
  const deactivateRoute = async (id) => {
    if (!window.confirm("Deactivate this route?")) return;
    await authDel(`/routes/${id}`); showToast("Route deactivated"); fetchRoutes();
  };

  // ── LOANS ─────────────────────────────────────────────────────────────────
  const approveLoan = async (id) => {
    const res = await authPut(`/loan-applications/${id}/approve`,{notes:loanNotes});
    if (!res.ok) return showToast("Approval failed","error");
    showToast("Loan approved ✓");
    await logAudit("LOAN_APPROVED","loan",selectedLoan?.member_id,selectedLoan?.membership_no,`Loan #${id} approved`);
    setSelectedLoan(null); setLoanNotes(""); fetchLoans(); fetchStats();
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
    // Re-select updated loan
    const updated = await authGet("/loan-applications/all");
    const loan = updated.find(l=>l.id===id);
    if (loan) setSelectedLoan(loan);
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
  const createLoanType = async () => {
    const res = await authPost("/loan-types",{
      ...ltForm,
      interest_rate:parseFloat(ltForm.interest_rate),
      max_amount:parseFloat(ltForm.max_amount),
      min_amount:parseFloat(ltForm.min_amount),
      max_months:parseInt(ltForm.max_months),
      min_months:parseInt(ltForm.min_months),
    });
    if (!res.ok) return showToast("Failed","error");
    showToast("Loan type created ✓");
    setLtForm({name:"",interest_rate:"",max_amount:"",min_amount:"",max_months:"",min_months:"",description:""});
    fetchLoanTypes();
  };

  // Delete loan type — only if no active loans use it
  const deleteLoanType = async (id, name) => {
    if (!window.confirm(`Delete loan type "${name}"?\nOnly works if no active loans use this type.`)) return;
    const res = await authDel(`/loan-types/${id}`);
    const d = await res.json();
    if (!res.ok) return showToast(d.error||"Cannot delete — active loans exist for this type","error");
    showToast("Loan type deleted ✓"); fetchLoanTypes();
  };

  // Upload T&C for a loan type
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

  // Save penalty policy for a loan type
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

  // Upload disbursement proof
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
    // Refresh selected loan
    const all = await authGet("/loan-applications/all");
    const updated = all.find(l=>l.id===selectedLoan.id);
    if (updated) setSelectedLoan(updated);
    fetchLoans();
  };

  // ── RECEIPTS ──────────────────────────────────────────────────────────────
  const fetchReceiptsByRoute = async () => {
    setReceiptLoading(true); setSelectedRoute(null);
    let url = `/receipts/by-route?date=${receiptDate}`;
    if (routeFilter) url += `&route_id=${routeFilter}`;
    const data = await authGet(url);
    setReceiptData(data); setReceiptLoading(false);
  };

  // ── WORKERS ───────────────────────────────────────────────────────────────
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

  // ── SALARY ────────────────────────────────────────────────────────────────
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
    showToast("Salary paid ✓");
    await logAudit("SALARY_PAID","worker",payForm.member_id,"",`KES ${payForm.amount} for ${payForm.period}`);
    setPayForm({member_id:"",amount:"",payment_type:"salary",period:"",payment_method:"cash",mpesa_code:"",notes:""});
    setSelectedSalaryMember(null); setSalaryMemberSearch("");
    fetchSalaryPayments(); fetchSalaryConfigs();
  };
  const loadMemberSalaryHistory = async (member) => {
    setSelectedSalaryMember(member);
    const data = await authGet(`/salary/payments?member_id=${member.id}`);
    setSalaryMemberPayments(data||[]);
  };

  // ── DERIVED ───────────────────────────────────────────────────────────────
  const filteredMembers = members.filter(m =>
    (m.name||"").toLowerCase().includes(memberSearch.toLowerCase()) ||
    (m.membership_no||"").toLowerCase().includes(memberSearch.toLowerCase())
  );
  const paginatedMembers  = filteredMembers.slice((memberPage-1)*PER_PAGE, memberPage*PER_PAGE);
  const totalMemberPages  = Math.ceil(filteredMembers.length/PER_PAGE)||1;
  const filteredMatatus   = matatus.filter(m => m.plate?.toLowerCase().includes(matatuSearch.toLowerCase())||m.owner_member_no?.toLowerCase().includes(matatuSearch.toLowerCase()));
  const filteredRoutes    = routes.filter(r => r.from_stage?.toLowerCase().includes(routeSearch.toLowerCase())||r.to_stage?.toLowerCase().includes(routeSearch.toLowerCase()));
  const filteredLoans     = loans.filter(l => {
    const ms = l.member_name?.toLowerCase().includes(loanSearch.toLowerCase())||l.membership_no?.toLowerCase().includes(loanSearch.toLowerCase());
    const mf = loanFilter==="all"||l.status===loanFilter;
    return ms&&mf;
  });
  const filteredSavings   = savings.filter(s => s.member_name?.toLowerCase().includes(savingsSearch.toLowerCase())||s.membership_no?.toLowerCase().includes(savingsSearch.toLowerCase()));
  const filteredWorkers   = workers.filter(w => (workerFilter==="all"||w.role===workerFilter)&&(w.name?.toLowerCase().includes(workerSearch.toLowerCase())||w.membership_no?.toLowerCase().includes(workerSearch.toLowerCase())));
  const filteredSalaryConfigs = salaryConfigs.filter(c => c.member_name?.toLowerCase().includes(salarySearch.toLowerCase())||c.membership_no?.toLowerCase().includes(salarySearch.toLowerCase()));
  const filteredAudit     = auditLogs.filter(a => a.action?.toLowerCase().includes(auditSearch.toLowerCase())||(a.membership_no||"").toLowerCase().includes(auditSearch.toLowerCase())||(a.performed_by_name||"").toLowerCase().includes(auditSearch.toLowerCase()));
  const salaryMemberMatches = members.filter(m => m.name?.toLowerCase().includes(salaryMemberSearch.toLowerCase())||m.membership_no?.toLowerCase().includes(salaryMemberSearch.toLowerCase())).slice(0,8);
  const deletableLoanStatuses = ["pending","guarantors_pending","rejected","guarantor_rejected","info_required"];

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div className="flex min-h-screen" style={{fontFamily:"'Trebuchet MS',sans-serif",background:"#0f172a"}}>
      {toast && <Toast {...toast} onClose={()=>setToast(null)} />}

      {/* SIDEBAR */}
      <div className="w-60 bg-slate-900 border-r border-slate-700 flex flex-col p-5 flex-shrink-0">
        <div className="mb-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-lg bg-blue-600 flex items-center justify-center text-white font-black text-sm">AD</div>
            <div>
              <p className="font-black text-white text-sm">{user?.name?.split(" ")[0]}</p>
              <p className="text-xs text-slate-400 uppercase tracking-widest">Admin</p>
            </div>
          </div>
          <div className="h-px bg-slate-700" />
        </div>
        <nav className="space-y-0.5 flex-1">
          {TABS.map(t => (
            <button key={t.key} onClick={()=>setTab(t.key)}
              className={`w-full text-left px-3 py-2.5 rounded-lg text-sm transition-all
                ${tab===t.key?"bg-blue-600 text-white font-bold":"text-slate-400 hover:bg-slate-800 hover:text-white"}`}>
              {t.label}
            </button>
          ))}
        </nav>
        <div className="mt-4 pt-4 border-t border-slate-700 space-y-1 text-xs text-slate-500">
          <p>Members: <span className="text-slate-300 font-bold">{stats.total_members||0}</span></p>
          <p>Matatus: <span className="text-slate-300 font-bold">{stats.total_matatus||0}</span></p>
          <p>Active Loans: <span className="text-slate-300 font-bold">{stats.active_loans||0}</span></p>
        </div>
      </div>

      {/* CONTENT */}
      <div className="flex-1 bg-slate-50 overflow-y-auto">

        {/* ══ OVERVIEW ══ */}
        {tab==="overview" && (
          <div className="p-8">
            <h1 className="text-3xl font-black text-slate-800 mb-1">System Overview</h1>
            <p className="text-slate-400 text-sm mb-8">{new Date().toLocaleDateString("en-KE",{weekday:"long",year:"numeric",month:"long",day:"numeric"})}</p>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
              {[
                {label:"Total Members",value:stats.total_members||0,       icon:"👥",color:"bg-blue-600",    sub:`${pending.length} pending`},
                {label:"Matatus",      value:stats.total_matatus||0,       icon:"🚐",color:"bg-slate-700",   sub:`${stats.total_routes||0} routes`},
                {label:"Active Loans", value:stats.active_loans||0,        icon:"💼",color:"bg-amber-600",   sub:`${stats.pending_loans||0} pending`},
                {label:"Total Savings",value:`KES ${(stats.total_savings||0).toLocaleString()}`,icon:"🏦",color:"bg-emerald-600",sub:"all members"},
              ].map((s,i) => (
                <div key={i} className={`${s.color} rounded-xl p-5 text-white`}>
                  <span className="text-3xl">{s.icon}</span>
                  <p className="text-3xl font-black mt-2">{s.value}</p>
                  <p className="text-sm opacity-80 mt-1">{s.label}</p>
                  <p className="text-xs opacity-60 mt-0.5">{s.sub}</p>
                </div>
              ))}
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="bg-white rounded-xl border border-slate-200 p-5">
                <h3 className="font-black text-slate-700 mb-3">⏳ Pending Approvals ({pending.length})</h3>
                {pending.length===0 ? <p className="text-slate-400 text-sm">No pending approvals</p> : (
                  <div className="space-y-2 max-h-48 overflow-y-auto">
                    {pending.map(m => (
                      <div key={m.id} className="flex justify-between items-center p-3 bg-slate-50 rounded-lg">
                        <div><p className="font-bold text-sm">{m.name}</p><p className="text-xs text-slate-400">{m.membership_no} · <span className="capitalize">{m.role}</span></p></div>
                        <div className="flex gap-1">
                          <button onClick={()=>approveMember(m.id)} className="bg-emerald-500 text-white text-xs px-2 py-1 rounded font-bold">✓</button>
                          <button onClick={()=>rejectMember(m.id)}  className="bg-red-500 text-white text-xs px-2 py-1 rounded font-bold">✕</button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <div className="bg-white rounded-xl border border-slate-200 p-5">
                <h3 className="font-black text-slate-700 mb-3">💼 Pending Loans</h3>
                {loans.filter(l=>l.status==="pending").length===0 ? <p className="text-slate-400 text-sm">No pending loans</p> : (
                  <div className="space-y-2 max-h-48 overflow-y-auto">
                    {loans.filter(l=>l.status==="pending").slice(0,5).map(l => (
                      <div key={l.id} onClick={()=>{setSelectedLoan(l);setTab("loans");}}
                        className="flex justify-between items-center p-3 bg-slate-50 rounded-lg cursor-pointer hover:bg-blue-50">
                        <div><p className="font-bold text-sm">{l.member_name}</p><p className="text-xs text-slate-400">KES {l.amount?.toLocaleString()} · {l.loan_type}</p></div>
                        <span className={`text-xs font-bold ${RISK_COLORS[l.risk_score]}`}>{l.risk_score} risk</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <div className="bg-white rounded-xl border border-slate-200 p-5">
                <h3 className="font-black text-slate-700 mb-3">⚠️ Warnings ({allWarnings.filter(w=>!w.is_acknowledged).length} pending)</h3>
                {allWarnings.slice(0,5).map(w => (
                  <div key={w.id} className={`flex justify-between items-center p-2 rounded-lg mb-1 ${w.severity==="critical"?"bg-red-50":w.severity==="major"?"bg-orange-50":"bg-yellow-50"}`}>
                    <div><p className="font-bold text-sm text-slate-800">{w.member_name}</p><p className="text-xs text-slate-500 truncate max-w-xs">{w.reason}</p></div>
                    <span className={`text-xs font-bold px-2 py-0.5 rounded-full capitalize ${w.severity==="critical"?"bg-red-100 text-red-700":w.severity==="major"?"bg-orange-100 text-orange-700":"bg-yellow-100 text-yellow-700"}`}>{w.severity}</span>
                  </div>
                ))}
              </div>
              <div className="bg-white rounded-xl border border-slate-200 p-5">
                <h3 className="font-black text-slate-700 mb-3">🎫 Ticket Stats</h3>
                <p className="text-3xl font-black text-blue-600">{stats.total_receipts||0}</p>
                <p className="text-slate-400 text-sm mt-1">Total tickets issued</p>
                <button onClick={()=>setTab("receipts")} className="mt-3 text-xs text-blue-600 font-bold hover:underline">View by Route →</button>
              </div>
            </div>
          </div>
        )}

        {/* ══ MEMBERS ══ */}
        {tab==="members" && (
          <div className="p-8">
            <h2 className="text-2xl font-black text-slate-800 mb-6">👥 Member Management</h2>
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="lg:col-span-2">
                <input placeholder="Search members..." value={memberSearch} onChange={e=>{setMemberSearch(e.target.value);setMemberPage(1);}} className={`${inp3} mb-4`} />
                <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-800 text-white"><tr>{["Member","Role","Phone","Actions"].map(h=><th key={h} className="p-3 text-left">{h}</th>)}</tr></thead>
                    <tbody>
                      {paginatedMembers.map(m => (
                        <tr key={m.id} className="border-b border-slate-100 hover:bg-slate-50">
                          <td className="p-3"><p className="font-bold">{m.name}</p><p className="text-xs text-slate-400">{m.membership_no}</p></td>
                          <td className="p-3"><span className="capitalize text-xs bg-slate-100 px-2 py-0.5 rounded font-bold">{m.role}</span></td>
                          <td className="p-3 text-xs text-slate-500">{m.phone}</td>
                          <td className="p-3"><div className="flex gap-1">
                            <button onClick={()=>{setSelectedMember(m);setEditForm({name:m.name,membership_no:m.membership_no,national_id:m.national_id,phone:m.phone,role:m.role});}} className="bg-blue-100 text-blue-700 text-xs px-2 py-1 rounded font-bold hover:bg-blue-200">Edit</button>
                            <button onClick={()=>deleteMember(m.id,m.membership_no)} className="bg-red-100 text-red-600 text-xs px-2 py-1 rounded font-bold hover:bg-red-200">Delete</button>
                          </div></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <div className="p-3 flex justify-between items-center bg-slate-50 border-t text-xs">
                    <span className="text-slate-400">{filteredMembers.length} members</span>
                    <div className="flex gap-2">
                      <button disabled={memberPage===1} onClick={()=>setMemberPage(p=>p-1)} className="px-3 py-1 bg-slate-200 rounded disabled:opacity-40">Prev</button>
                      <span className="text-slate-400">Page {memberPage}/{totalMemberPages}</span>
                      <button disabled={memberPage>=totalMemberPages} onClick={()=>setMemberPage(p=>p+1)} className="px-3 py-1 bg-slate-200 rounded disabled:opacity-40">Next</button>
                    </div>
                  </div>
                </div>
                {pending.length>0 && (
                  <div className="mt-6 bg-white rounded-xl border border-amber-200 overflow-hidden">
                    <div className="bg-amber-50 px-4 py-3 border-b border-amber-200"><h3 className="font-black text-amber-800 text-sm">⏳ Pending ({pending.length})</h3></div>
                    {pending.map(m => (
                      <div key={m.id} className="flex justify-between items-center p-3 border-b border-slate-100">
                        <div><p className="font-bold text-sm">{m.name}</p><p className="text-xs text-slate-400">{m.membership_no} · {m.role} · {m.phone}</p></div>
                        <div className="flex gap-2">
                          <button onClick={()=>approveMember(m.id)} className="bg-emerald-500 text-white text-xs px-3 py-1 rounded font-bold">Approve</button>
                          <button onClick={()=>rejectMember(m.id)}  className="bg-red-500 text-white text-xs px-3 py-1 rounded font-bold">Reject</button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <div className="space-y-4">
                {selectedMember && (
                  <div className="bg-white rounded-xl border border-slate-200 p-5">
                    <div className="flex justify-between items-center mb-3"><h3 className="font-black text-slate-700 text-sm">Edit Member</h3><button onClick={()=>setSelectedMember(null)} className="text-slate-400 hover:text-slate-700">✕</button></div>
                    <div className="space-y-2">
                      {[["name","Full Name"],["membership_no","Membership No"],["national_id","National ID"],["phone","Phone"]].map(([f,l]) => (
                        <div key={f}><label className="text-xs text-slate-400 uppercase tracking-widest mb-0.5 block">{l}</label><input value={editForm[f]||""} onChange={e=>setEditForm({...editForm,[f]:e.target.value})} className={inp} /></div>
                      ))}
                      <select value={editForm.role} onChange={e=>setEditForm({...editForm,role:e.target.value})} className={inp}>
                        {["member","owner","driver","conductor","stage_operator","hr","director"].map(r=><option key={r} value={r}>{r.replace("_"," ")}</option>)}
                      </select>
                      <button onClick={updateMember} className="w-full bg-blue-600 text-white font-black py-2 rounded-lg text-sm hover:bg-blue-700">Save Changes</button>
                    </div>
                  </div>
                )}
                <div className="bg-white rounded-xl border border-slate-200 p-5">
                  <h3 className="font-black text-slate-700 text-sm mb-3">+ Register New Member</h3>
                  <div className="space-y-2">
                    {[["membership_no","Membership No"],["name","Full Name"],["national_id","National ID"],["phone","Phone"]].map(([f,l]) => (
                      <input key={f} placeholder={l} value={createForm[f]} onChange={e=>setCreateForm({...createForm,[f]:e.target.value})} className={inp} />
                    ))}
                    <input type="password" placeholder="Password" value={createForm.password} onChange={e=>setCreateForm({...createForm,password:e.target.value})} className={inp} />
                    <select value={createForm.role} onChange={e=>setCreateForm({...createForm,role:e.target.value})} className={inp}>
                      {["member","owner","driver","conductor","stage_operator","hr","director"].map(r=><option key={r} value={r}>{r.replace("_"," ")}</option>)}
                    </select>
                    <button onClick={createMember} className="w-full bg-emerald-600 text-white font-black py-2 rounded-lg text-sm hover:bg-emerald-700">Create Member</button>
                  </div>
                </div>
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
                        {routes.map(r=><option key={r.id} value={r.id}>{r.from_stage} → {r.to_stage} (KES {r.shimo_fee})</option>)}
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
            <h2 className="text-2xl font-black text-slate-800 mb-6">🗺️ Route Management</h2>
            <div className="bg-white border border-slate-200 rounded-xl p-5 mb-6">
              <h3 className="font-black text-slate-700 mb-3 text-sm">Add New Route</h3>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                {[["from_stage","From Stage","e.g. Shimo la Tewa"],["to_stage","To Stage","e.g. Mombasa Town"]].map(([f,l,ph])=>(
                  <div key={f}><label className="text-xs text-slate-400 uppercase tracking-widest mb-1 block">{l}</label><input placeholder={ph} value={routeForm[f]} onChange={e=>setRouteForm({...routeForm,[f]:e.target.value})} className={inp3} /></div>
                ))}
                <div><label className="text-xs text-slate-400 uppercase tracking-widest mb-1 block">Shimo Fee (KES)</label><input type="number" placeholder="e.g. 50" value={routeForm.shimo_fee} onChange={e=>setRouteForm({...routeForm,shimo_fee:e.target.value})} className={inp3} /></div>
                <div className="flex items-end"><button onClick={createRoute} className="w-full bg-blue-600 text-white font-black py-2.5 rounded-lg text-sm hover:bg-blue-700">+ Add Route</button></div>
              </div>
            </div>
            <input placeholder="Search routes..." value={routeSearch} onChange={e=>setRouteSearch(e.target.value)} className={`${inp3} mb-4`} />
            <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-slate-800 text-white"><tr>{["#","From","To","Fee","Actions"].map(h=><th key={h} className="p-3 text-left">{h}</th>)}</tr></thead>
                <tbody>
                  {filteredRoutes.map(route=>(
                    <tr key={route.id} className="border-b border-slate-100 hover:bg-slate-50">
                      {editingRouteId===route.id ? (<>
                        <td className="p-3 text-slate-400">#{route.id}</td>
                        <td className="p-3"><input value={editRouteForm.from_stage} onChange={e=>setEditRouteForm({...editRouteForm,from_stage:e.target.value})} className="border p-1 rounded w-full text-sm text-slate-900 bg-white" /></td>
                        <td className="p-3"><input value={editRouteForm.to_stage}   onChange={e=>setEditRouteForm({...editRouteForm,to_stage:e.target.value})}   className="border p-1 rounded w-full text-sm text-slate-900 bg-white" /></td>
                        <td className="p-3"><input type="number" value={editRouteForm.shimo_fee} onChange={e=>setEditRouteForm({...editRouteForm,shimo_fee:e.target.value})} className="border p-1 rounded w-full text-sm text-slate-900 bg-white" /></td>
                        <td className="p-3 flex gap-1"><button onClick={()=>saveEditRoute(route.id)} className="bg-emerald-500 text-white text-xs px-2 py-1 rounded font-bold">Save</button><button onClick={()=>setEditingRouteId(null)} className="bg-slate-400 text-white text-xs px-2 py-1 rounded font-bold">Cancel</button></td>
                      </>) : (<>
                        <td className="p-3 text-slate-400">#{route.id}</td>
                        <td className="p-3 font-bold">{route.from_stage}</td>
                        <td className="p-3 font-bold">{route.to_stage}</td>
                        <td className="p-3 text-emerald-700 font-bold">KES {route.shimo_fee}</td>
                        <td className="p-3 flex gap-1"><button onClick={()=>{setEditingRouteId(route.id);setEditRouteForm({from_stage:route.from_stage,to_stage:route.to_stage,shimo_fee:route.shimo_fee});}} className="bg-amber-400 text-white text-xs px-2 py-1 rounded font-bold">Edit</button><button onClick={()=>deactivateRoute(route.id)} className="bg-red-500 text-white text-xs px-2 py-1 rounded font-bold">Deactivate</button></td>
                      </>)}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ══ LOANS ══ */}
        {tab==="loans" && (
          <div className="p-8">
            <h2 className="text-2xl font-black text-slate-800 mb-2">💼 Loan Management</h2>
            <p className="text-sm text-slate-400 mb-6">Approve · Reject (reason saved for borrower) · Request info (borrower can respond) · Upload disbursement proof · Delete pending/rejected loans</p>

            {/* ── LOAN TYPES ── */}
            <div className="bg-white border border-slate-200 rounded-xl p-5 mb-6">
              <h3 className="font-black text-slate-700 mb-3 text-sm">Loan Types Configuration</h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
                {loanTypes.map(lt => (
                  <div key={lt.id} className="bg-slate-50 border border-slate-200 rounded-lg p-3">
                    <div className="flex justify-between items-start mb-2">
                      <p className="font-black text-sm text-slate-800">{lt.name}</p>
                      <button onClick={()=>deleteLoanType(lt.id,lt.name)} className="text-red-500 hover:text-red-700 text-xs font-bold">🗑️</button>
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

                    {/* Expanded settings panel */}
                    {editingLtId===lt.id && (
                      <div className="mt-3 space-y-3 border-t border-slate-200 pt-3">
                        {/* T&C upload */}
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

                        {/* Penalty policy */}
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

              <details>
                <summary className="text-xs text-blue-600 font-bold cursor-pointer hover:underline">+ Add New Loan Type</summary>
                <div className="mt-3 grid grid-cols-2 md:grid-cols-4 gap-3">
                  {[["name","Name","text"],["interest_rate","Rate %","number"],["min_amount","Min Amt","number"],["max_amount","Max Amt","number"],["min_months","Min Mo","number"],["max_months","Max Mo","number"]].map(([f,l,t])=>(
                    <div key={f}><label className="text-xs text-slate-500 mb-0.5 block">{l}</label><input placeholder={l} value={ltForm[f]} type={t} onChange={e=>setLtForm({...ltForm,[f]:e.target.value})} className={inp} /></div>
                  ))}
                  <div className="md:col-span-2"><label className="text-xs text-slate-500 mb-0.5 block">Description</label><input placeholder="Description" value={ltForm.description} onChange={e=>setLtForm({...ltForm,description:e.target.value})} className={inp} /></div>
                  <div className="flex items-end"><button onClick={createLoanType} className="w-full bg-blue-600 text-white font-black py-2 rounded-lg text-sm">Create</button></div>
                </div>
              </details>
            </div>

            {/* ── FILTER ── */}
            <div className="flex gap-3 mb-4 flex-wrap">
              <input placeholder="Search member..." value={loanSearch} onChange={e=>setLoanSearch(e.target.value)} className={`flex-1 ${inp3}`} />
              <select value={loanFilter} onChange={e=>setLoanFilter(e.target.value)} className={inp3} style={{width:"auto"}}>
                <option value="all">All Status</option>
                {["pending","guarantors_pending","approved","rejected","disbursed","repaying","cleared","defaulted","info_required","guarantor_rejected"].map(s=><option key={s} value={s}>{s.replace(/_/g," ")}</option>)}
              </select>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Loan list */}
              <div className="lg:col-span-2 space-y-3">
                {filteredLoans.length===0 ? (
                  <div className="bg-white border border-slate-200 rounded-xl p-8 text-center text-slate-400">No loans found</div>
                ) : filteredLoans.map(loan => (
                  <div key={loan.id} onClick={()=>{setSelectedLoan(loan);setLoanNotes("");}}
                    className={`bg-white border rounded-xl p-4 cursor-pointer hover:shadow-md transition-all ${selectedLoan?.id===loan.id?"border-blue-400":"border-slate-200"}`}>
                    <div className="flex justify-between items-start mb-2">
                      <div><p className="font-black text-slate-800">{loan.member_name}</p><p className="text-xs text-slate-400">{loan.membership_no}</p></div>
                      <div className="flex items-center gap-2">
                        <span className={`text-xs px-2 py-0.5 rounded-full font-bold ${LOAN_STATUS_COLORS[loan.status]}`}>{loan.status?.replace(/_/g," ")}</span>
                        {deletableLoanStatuses.includes(loan.status) && (
                          <button onClick={e=>{e.stopPropagation();deleteLoan(loan);}} className="bg-red-100 text-red-600 text-xs px-2 py-0.5 rounded font-bold hover:bg-red-200">🗑️</button>
                        )}
                      </div>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="font-black text-slate-800">KES {loan.amount?.toLocaleString()}</span>
                      <span className="text-slate-400">{loan.loan_type}</span>
                      <span className={`font-bold text-xs ${RISK_COLORS[loan.risk_score]}`}>{loan.risk_score} risk</span>
                    </div>
                    {loan.status==="rejected" && loan.admin_notes && <p className="text-xs text-red-600 mt-1 font-bold">Rejection reason: {loan.admin_notes}</p>}
                    {loan.status==="info_required" && loan.admin_notes && <p className="text-xs text-orange-600 mt-1">ℹ️ Info requested: {loan.admin_notes}</p>}
                    {loan.disburse_proof && <p className="text-xs text-purple-600 mt-1 font-bold">📎 Disbursement proof on file</p>}
                    {loan.penalty>0 && <p className="text-xs text-red-600 mt-1 font-bold">⚠️ Penalty: KES {loan.penalty?.toLocaleString()}</p>}
                  </div>
                ))}
              </div>

              {/* Loan detail panel */}
              {selectedLoan && (
                <div className="bg-white rounded-xl border border-slate-200 p-5 h-fit">
                  <div className="flex justify-between items-center mb-3">
                    <h3 className="font-black text-slate-700 text-sm">Loan #{selectedLoan.id}</h3>
                    <button onClick={()=>setSelectedLoan(null)} className="text-slate-400 hover:text-slate-700">✕</button>
                  </div>

                  {/* Rejection reason — prominent red banner */}
                  {selectedLoan.status==="rejected" && selectedLoan.admin_notes && (
                    <div className="bg-red-50 border border-red-300 rounded-lg p-3 mb-3">
                      <p className="text-xs text-red-700 font-black mb-0.5">❌ Rejected — Reason (visible to borrower):</p>
                      <p className="text-xs text-red-600">{selectedLoan.admin_notes}</p>
                    </div>
                  )}
                  {/* Info required — orange banner */}
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
                  </div>

                  {/* Disbursement proof section */}
                  {selectedLoan.disburse_proof ? (
                    <div className="bg-green-50 border border-green-200 rounded-lg p-3 mb-3">
                      <p className="text-xs text-green-700 font-black mb-1">✅ Disbursement proof uploaded</p>
                      {selectedLoan.disburse_note && <p className="text-xs text-green-600 mb-2">{selectedLoan.disburse_note}</p>}
                      <div className="flex gap-2 flex-wrap">
                        <a href={selectedLoan.disburse_proof} target="_blank" rel="noreferrer" className="text-xs bg-green-600 text-white px-3 py-1 rounded font-bold hover:bg-green-700">📎 View Proof</a>
                        <button onClick={()=>setShowDisburseModal(true)} className="text-xs bg-white border border-green-300 text-green-700 px-3 py-1 rounded font-bold hover:bg-green-50">Update</button>
                      </div>
                    </div>
                  ) : null}

                  {selectedLoan.supporting_doc && (
                    <a href={selectedLoan.supporting_doc} target="_blank" rel="noreferrer" className="block text-xs bg-blue-50 text-blue-700 border border-blue-200 text-center py-2 rounded-lg mb-3 hover:bg-blue-100">📎 View Supporting Doc</a>
                  )}

                  <div className="mb-3">
                    <label className="text-xs text-slate-600 uppercase tracking-widest mb-1 block font-bold">
                      {selectedLoan.status==="pending"?"Notes / Rejection Reason (shown to borrower)":
                       selectedLoan.status==="info_required"?"What info is needed (shown to borrower)":"Admin Notes"}
                    </label>
                    <textarea value={loanNotes} onChange={e=>setLoanNotes(e.target.value)} rows={2} placeholder="Notes..."
                      className="w-full border border-slate-300 rounded-lg p-2 text-sm text-slate-900 bg-white outline-none resize-none" />
                  </div>

                  <div className="space-y-2">
                    {selectedLoan.status==="pending" && (<>
                      <button onClick={()=>approveLoan(selectedLoan.id)} className="w-full bg-emerald-500 text-white font-black py-2 rounded-lg text-sm">✅ Approve</button>
                      <button onClick={()=>rejectLoan(selectedLoan.id)}  className="w-full bg-red-500 text-white font-black py-2 rounded-lg text-sm">❌ Reject (notes = reason)</button>
                      <button onClick={()=>requestMoreInfo(selectedLoan.id)} className="w-full bg-amber-400 text-white font-black py-2 rounded-lg text-sm">ℹ️ Request Info (notes = question)</button>
                    </>)}

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

                    {["repaying","disbursed"].includes(selectedLoan.status) && (
                      <div className="border-t border-slate-100 pt-3 space-y-2">
                        <label className="text-xs text-slate-500 uppercase tracking-widest block">Add Manual Penalty</label>
                        <input type="number" placeholder="Amount (KES)" value={penaltyAmt} onChange={e=>setPenaltyAmt(e.target.value)} className={inp} />
                        <input placeholder="Reason" value={penaltyReason} onChange={e=>setPenaltyReason(e.target.value)} className={inp} />
                        <button onClick={()=>addPenalty(selectedLoan.id)} className="w-full bg-red-500 text-white font-bold py-2 rounded-lg text-sm">⚠️ Add Penalty</button>
                      </div>
                    )}

                    {deletableLoanStatuses.includes(selectedLoan.status) && (
                      <div className="border-t border-slate-100 pt-3">
                        <button onClick={()=>deleteLoan(selectedLoan)} className="w-full bg-red-600 text-white font-black py-2 rounded-lg text-sm hover:bg-red-700">🗑️ Delete This Loan</button>
                        <p className="text-xs text-slate-400 mt-1 text-center">Only for pending/rejected/guarantor-pending</p>
                      </div>
                    )}
                  </div>

                  {selectedLoan.guarantors?.length>0 && (
                    <div className="border-t border-slate-100 mt-3 pt-3">
                      <p className="text-xs text-slate-400 uppercase tracking-widest mb-2">Guarantors</p>
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

        {/* ══ SAVINGS ══ */}
        {tab==="savings" && (
          <div className="p-8">
            <h2 className="text-2xl font-black text-slate-800 mb-6">🏦 All Member Savings</h2>
            <div className="grid grid-cols-3 gap-4 mb-6">
              {[
                {label:"Total Deposits",    value:`KES ${savings.filter(s=>s.transaction_type==="deposit").reduce((a,s)=>a+s.amount,0).toLocaleString()}`,    color:"bg-emerald-50 border-emerald-200 text-emerald-700"},
                {label:"Total Withdrawals", value:`KES ${savings.filter(s=>s.transaction_type==="withdrawal").reduce((a,s)=>a+s.amount,0).toLocaleString()}`, color:"bg-red-50 border-red-200 text-red-700"},
                {label:"Transactions",      value:savings.length,                                                                                              color:"bg-blue-50 border-blue-200 text-blue-700"},
              ].map((s,i)=><div key={i} className={`border rounded-xl p-4 ${s.color}`}><p className="text-xs uppercase tracking-widest mb-1 opacity-70">{s.label}</p><p className="text-2xl font-black">{s.value}</p></div>)}
            </div>
            <input placeholder="Search by member..." value={savingsSearch} onChange={e=>setSavingsSearch(e.target.value)} className={`${inp3} mb-4`} />
            <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-slate-800 text-white"><tr>{["Member","Type","Amount","Description","Date","Matatu"].map(h=><th key={h} className="p-3 text-left">{h}</th>)}</tr></thead>
                <tbody>
                  {filteredSavings.length===0 ? <tr><td colSpan={6} className="p-6 text-center text-slate-400">No savings records</td></tr>
                  : filteredSavings.map(s=>(
                    <tr key={s.id} className="border-b border-slate-100 hover:bg-slate-50">
                      <td className="p-3"><p className="font-bold text-sm">{s.member_name}</p><p className="text-xs text-slate-400">{s.membership_no}</p></td>
                      <td className="p-3"><span className={`text-xs font-bold px-2 py-0.5 rounded-full ${s.transaction_type==="deposit"?"bg-emerald-100 text-emerald-700":"bg-red-100 text-red-700"}`}>{s.transaction_type}</span></td>
                      <td className="p-3 font-black text-slate-800">KES {s.amount?.toLocaleString()}</td>
                      <td className="p-3 text-slate-500 text-xs">{s.description||"—"}</td>
                      <td className="p-3 text-slate-400 text-xs">{s.date}</td>
                      <td className="p-3 text-slate-400 text-xs">{s.matatu_id?`#${s.matatu_id}`:"Personal"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ══ RECEIPTS BY ROUTE ══ */}
        {tab==="receipts" && (
          <div className="p-8">
            <h2 className="text-2xl font-black text-slate-800 mb-2">🎫 Receipts by Route</h2>
            <p className="text-sm text-slate-400 mb-6">View tickets per route per day with operator breakdown.</p>
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
                    {(receiptData.routes||[]).length===0 ? <div className="col-span-2 bg-white border border-slate-200 rounded-xl p-8 text-center text-slate-400">No receipts for {receiptDate}</div>
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
                        <thead className="bg-slate-100 text-slate-600"><tr>{["Ticket","Plate","Amount","Payment","Time","Operator"].map(h=><th key={h} className="p-3 text-left">{h}</th>)}</tr></thead>
                        <tbody>
                          {(selectedRoute.receipts||[]).map(r=>(
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
                        <tfoot className="bg-emerald-50 border-t-2 border-emerald-200">
                          <tr><td colSpan={2} className="p-3 font-black text-slate-700">TOTAL</td><td className="p-3 font-black text-emerald-700">KES {selectedRoute.total?.toLocaleString()}</td><td colSpan={3} className="p-3 text-xs text-slate-500">{selectedRoute.count} tickets</td></tr>
                        </tfoot>
                      </table>
                    </div>
                  </div>
                )}
              </>
            )}
            {!receiptData && !receiptLoading && <div className="bg-white border border-slate-200 rounded-xl p-12 text-center text-slate-400"><p className="text-4xl mb-3">🎫</p><p>Select a date and click View</p></div>}
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
                  <thead className="bg-slate-800 text-white"><tr>{["Worker","Role","Severity","Reason","Issued By","Date","Status"].map(h=><th key={h} className="p-3 text-left">{h}</th>)}</tr></thead>
                  <tbody>
                    {allWarnings.length===0 ? <tr><td colSpan={7} className="p-6 text-center text-slate-400">No warnings issued yet</td></tr>
                    : allWarnings.map(w=>(
                      <tr key={w.id} className="border-b border-slate-100 hover:bg-slate-50">
                        <td className="p-3"><p className="font-bold text-sm">{w.member_name}</p><p className="text-xs text-slate-400">{w.membership_no}</p></td>
                        <td className="p-3 text-xs capitalize text-slate-500">{w.role?.replace("_"," ")}</td>
                        <td className="p-3"><span className={`text-xs font-bold px-2 py-0.5 rounded-full capitalize ${w.severity==="critical"?"bg-red-100 text-red-700":w.severity==="major"?"bg-orange-100 text-orange-700":"bg-yellow-100 text-yellow-700"}`}>{w.severity}</span></td>
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
          <div className="p-8">
            <h2 className="text-2xl font-black text-slate-800 mb-2">💵 Salary & Pay Management</h2>
            <p className="text-sm text-slate-400 mb-6">Configure salaries, process payments, view history.</p>
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
                  <thead className="bg-slate-800 text-white"><tr>{["Member","Role","Base Salary","Frequency","Last Paid","Last Amount"].map(h=><th key={h} className="p-3 text-left">{h}</th>)}</tr></thead>
                  <tbody>
                    {filteredSalaryConfigs.length===0 ? <tr><td colSpan={6} className="p-6 text-center text-slate-400">No salary configs yet</td></tr>
                    : filteredSalaryConfigs.map(c=>(
                      <tr key={c.id} className="border-b border-slate-100 hover:bg-slate-50 cursor-pointer" onClick={()=>{setSelectedSalaryMember({id:c.member_id,name:c.member_name,membership_no:c.membership_no,role:c.role});setSalaryMemberSearch(`${c.member_name} (${c.membership_no})`);setConfigForm({member_id:c.member_id,base_salary:c.base_salary,payment_frequency:c.payment_frequency,role_label:c.role_label||""});setPayForm({...payForm,member_id:c.member_id});loadMemberSalaryHistory({id:c.member_id});}}>
                        <td className="p-3"><p className="font-bold">{c.member_name}</p><p className="text-xs text-slate-400">{c.membership_no}</p></td>
                        <td className="p-3 text-xs capitalize"><span className="bg-slate-100 px-2 py-0.5 rounded font-bold">{c.role_label||c.role?.replace("_"," ")}</span></td>
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
                    <thead className="bg-slate-800 text-white"><tr>{["Type","Period","Amount","Method","M-Pesa Code","Notes","Date"].map(h=><th key={h} className="p-3 text-left">{h}</th>)}</tr></thead>
                    <tbody>
                      {salaryMemberPayments.map(p=>(
                        <tr key={p.id} className="border-b border-slate-100 hover:bg-slate-50">
                          <td className="p-3 text-xs capitalize"><span className="bg-blue-100 text-blue-700 px-2 py-0.5 rounded font-bold">{p.payment_type}</span></td>
                          <td className="p-3 font-bold text-sm">{p.period}</td>
                          <td className="p-3 font-black text-emerald-700">KES {p.amount?.toLocaleString()}</td>
                          <td className="p-3 text-xs capitalize text-slate-500">{p.payment_method}</td>
                          <td className="p-3 text-xs text-slate-400">{p.mpesa_code||"—"}</td>
                          <td className="p-3 text-xs text-slate-400 max-w-xs truncate">{p.notes||"—"}</td>
                          <td className="p-3 text-xs text-slate-400">{new Date(p.created_at).toLocaleDateString()}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot className="bg-emerald-50 border-t-2 border-emerald-200">
                      <tr><td colSpan={2} className="p-3 font-black text-slate-700">TOTAL PAID</td><td className="p-3 font-black text-emerald-700">KES {salaryMemberPayments.reduce((s,p)=>s+p.amount,0).toLocaleString()}</td><td colSpan={4} className="p-3 text-xs text-slate-500">{salaryMemberPayments.length} payments</td></tr>
                    </tfoot>
                  </table>
                </div>
              </div>
            )}
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
                {["member","loan","matatu","route","worker","receipt","general"].map(c=><option key={c} value={c}>{c.charAt(0).toUpperCase()+c.slice(1)}</option>)}
              </select>
            </div>
            <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
              <div className="bg-slate-50 px-5 py-3 border-b border-slate-200 flex justify-between items-center">
                <h3 className="font-black text-slate-700 text-sm">Total: {filteredAudit.length} entries</h3>
                <span className="text-xs text-slate-400">🔒 Read-only · permanent record</span>
              </div>
              <table className="w-full text-sm">
                <thead className="bg-slate-800 text-white"><tr>{["Action","Category","Member","Performed By","Details","Timestamp"].map(h=><th key={h} className="p-3 text-left">{h}</th>)}</tr></thead>
                <tbody>
                  {filteredAudit.length===0 ? <tr><td colSpan={6} className="p-8 text-center text-slate-400">No audit records found</td></tr>
                  : filteredAudit.map(a=>(
                    <tr key={a.id} className="border-b border-slate-100 hover:bg-slate-50">
                      <td className="p-3"><span className="font-bold text-blue-700 text-xs">{a.action}</span></td>
                      <td className="p-3"><span className="capitalize text-xs bg-slate-100 px-2 py-0.5 rounded font-bold text-slate-600">{a.category}</span></td>
                      <td className="p-3 text-xs text-slate-500">{a.membership_no||"—"}</td>
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
              <button onClick={()=>setShowDisburseModal(false)} className="text-slate-400 hover:text-slate-700 text-xl">✕</button>
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
                <textarea rows={2} placeholder="e.g. Disbursed via M-Pesa to 0712345678 on 01/05/2026..."
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
    </div>
  );
}