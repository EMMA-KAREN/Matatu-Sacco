import { useEffect, useState, useCallback } from "react";
import { useAuth } from "../context/AuthContext";
import MonitorWorkers from "../components/Monitorworkers"
import Routes from "./Routes";
import Matatu from "./Matatus";
import API from "../api";

// ─── helpers ────────────────────────────────────────────────
const tok = () => localStorage.getItem("token");
const hdr = () => ({ Authorization: `Bearer ${tok()}`, "Content-Type": "application/json" });
const authGet = (url) => fetch(`${API}${url}`, { headers: hdr() }).then(r => r.ok ? r.json() : []);
const authPost = (url, body) => fetch(`${API}${url}`, { method: "POST", headers: hdr(), body: JSON.stringify(body) });
const authPut = (url, body) => fetch(`${API}${url}`, { method: "PUT", headers: hdr(), body: body ? JSON.stringify(body) : undefined });

const LOAN_STATUS_COLORS = {
  pending: "bg-yellow-100 text-yellow-800",
  guarantors_pending: "bg-blue-100 text-blue-800",
  approved: "bg-green-100 text-green-700",
  rejected: "bg-red-100 text-red-700",
  disbursed: "bg-purple-100 text-purple-800",
  repaying: "bg-cyan-100 text-cyan-800",
  cleared: "bg-green-200 text-green-900",
  defaulted: "bg-red-200 text-red-900",
  info_required: "bg-orange-100 text-orange-800",
};

const TABS = [
  { key: "members",   label: "👥 Members" },
  { key: "matatus",   label: "🚐 Matatus" },
  { key: "routes",    label: "🗺️ Routes" },
  { key: "loans",     label: "💼 Loans" },
  { key: "receipts",  label: "🎫 Receipts" },
  { key: "workers",   label: "👷 Monitor Workers" },
  { key: "audit",     label: "📋 Audit Log" },
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

  // ── loans ──
  const [loans, setLoans] = useState([]);
  const [selectedLoan, setSelectedLoan] = useState(null);
  const [loanNotes, setLoanNotes] = useState("");
  const [loanSearch, setLoanSearch] = useState("");
  const [loanFilter, setLoanFilter] = useState("all");
  const [reminderMsg, setReminderMsg] = useState("");

  // ── receipts by route ──
  const [receiptDate, setReceiptDate] = useState(new Date().toISOString().split("T")[0]);
  const [receiptData, setReceiptData] = useState(null);
  const [receiptLoading, setReceiptLoading] = useState(false);
  const [selectedRoute, setSelectedRoute] = useState(null);
  const [allRoutes, setAllRoutes] = useState([]);
  const [routeFilter, setRouteFilter] = useState("");

  // ── audit ──
  const [auditLogs, setAuditLogs] = useState([]);
  const [auditCategory, setAuditCategory] = useState("all");
  const [auditSearch, setAuditSearch] = useState("");

  // ── fetch ──
  const fetchMembers = useCallback(async () => {
    const [active, pend] = await Promise.all([
      fetch(`${API}/hr/members`, { cache: "no-store" }).then(r => r.json()),
      fetch(`${API}/hr/pending-members`).then(r => r.json()),
    ]);
    setMembers(active);
    setPending(pend);
    setStats({
      total: active.length + pend.length,
      pending: pend.length,
      owners: active.filter(m => m.role === "owner").length,
      drivers: active.filter(m => m.role === "driver").length,
    });
  }, []);

  const fetchLoans = useCallback(async () => {
    const data = await authGet("/loan-applications/all");
    setLoans(data);
  }, []);

  const fetchAuditLogs = useCallback(async () => {
    const cat = auditCategory !== "all" ? `?category=${auditCategory}` : "";
    const data = await authGet(`/audit/permanent${cat}`);
    setAuditLogs(data);
  }, [auditCategory]);

  const fetchRoutes = useCallback(async () => {
    const data = await fetch(`${API}/routes`).then(r => r.json());
    setAllRoutes(data);
  }, []);

  useEffect(() => { fetchMembers(); fetchRoutes(); }, [fetchMembers, fetchRoutes]);
  useEffect(() => { if (tab === "loans") fetchLoans(); }, [tab, fetchLoans]);
  useEffect(() => { if (tab === "audit") fetchAuditLogs(); }, [tab, fetchAuditLogs, auditCategory]);

  // ── audit log helper ──
  const logAudit = async (action, category, member_id, membership_no, details) => {
    await authPost("/audit/permanent", { action, category, member_id, membership_no, details });
    if (tab === "audit") fetchAuditLogs();
  };

  // ── members actions ──
  const createMember = async () => {
    if (!createForm.membership_no.trim()) return showToast("Membership No required", "error");
    const res = await fetch(`${API}/hr/create-member`, { method: "POST", headers: hdr(), body: JSON.stringify(createForm) });
    const data = await res.json();
    if (!res.ok) return showToast(data.error || "Failed", "error");
    showToast("Member created ✓");
    await logAudit("MEMBER_CREATED", "member", null, createForm.membership_no, `Created by HR: ${user?.name}`);
    setCreateForm({ membership_no: "", name: "", national_id: "", phone: "", password: "", role: "member" });
    fetchMembers();
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
  const approveLoan = async (id) => {
    const res = await authPut(`/loan-applications/${id}/approve`, { notes: loanNotes });
    if (!res.ok) return showToast("Approval failed", "error");
    showToast("Loan approved ✓");
    await logAudit("LOAN_APPROVED", "loan", selectedLoan.member_id, selectedLoan.membership_no, `Loan #${id} approved by HR: ${user?.name}. Notes: ${loanNotes}`);
    setSelectedLoan(null); setLoanNotes("");
    fetchLoans();
  };

  const rejectLoan = async (id) => {
    if (!loanNotes) return showToast("Add rejection reason", "error");
    const res = await authPut(`/loan-applications/${id}/reject`, { notes: loanNotes });
    if (!res.ok) return showToast("Failed", "error");
    showToast("Loan rejected");
    await logAudit("LOAN_REJECTED", "loan", selectedLoan.member_id, selectedLoan.membership_no, `Loan #${id} rejected. Reason: ${loanNotes}`);
    setSelectedLoan(null); setLoanNotes("");
    fetchLoans();
  };

  const requestMoreInfo = async (id) => {
    if (!loanNotes) return showToast("Specify what info is needed", "error");
    const res = await authPut(`/loan-applications/${id}/request-info`, { notes: loanNotes });
    if (!res.ok) return showToast("Failed", "error");
    showToast("Info requested ✓");
    await logAudit("LOAN_INFO_REQUESTED", "loan", selectedLoan.member_id, selectedLoan.membership_no, `More info requested: ${loanNotes}`);
    setSelectedLoan(null); setLoanNotes("");
    fetchLoans();
  };

  const sendLoanReminder = async (id) => {
    const res = await authPost(`/loans/send-reminder/${id}`, { message: reminderMsg || undefined });
    if (!res.ok) return showToast("Reminder failed", "error");
    showToast("Reminder sent ✓");
    await logAudit("LOAN_REMINDER_SENT", "loan", selectedLoan?.member_id, selectedLoan?.membership_no, `Reminder sent for Loan #${id}`);
    setReminderMsg("");
  };

  // ── receipts by route ──
  const fetchReceiptsByRoute = async () => {
    setReceiptLoading(true);
    setSelectedRoute(null);
    let url = `/receipts/by-route?date=${receiptDate}`;
    if (routeFilter) url += `&route_id=${routeFilter}`;
    const data = await authGet(url);
    setReceiptData(data);
    setReceiptLoading(false);
  };

  // ── derived ──
  const filtered = members.filter(m =>
    (m.name || "").toLowerCase().includes(search.toLowerCase()) ||
    (m.membership_no || "").toLowerCase().includes(search.toLowerCase())
  );
  const paginated = filtered.slice((page - 1) * PER_PAGE, page * PER_PAGE);
  const totalPages = Math.ceil(filtered.length / PER_PAGE);

  const filteredLoans = loans.filter(l => {
    const ms = l.member_name?.toLowerCase().includes(loanSearch.toLowerCase()) || l.membership_no?.toLowerCase().includes(loanSearch.toLowerCase());
    const mf = loanFilter === "all" || l.status === loanFilter;
    return ms && mf;
  });

  const filteredAudit = auditLogs.filter(a =>
    a.action?.toLowerCase().includes(auditSearch.toLowerCase()) ||
    a.membership_no?.toLowerCase().includes(auditSearch.toLowerCase()) ||
    a.performed_by_name?.toLowerCase().includes(auditSearch.toLowerCase())
  );

  return (
    <div className="flex min-h-screen" style={{ fontFamily: "'Trebuchet MS', sans-serif", background: "#0f172a" }}>
      {toast && <Toast {...toast} onClose={() => setToast(null)} />}

      {/* SIDEBAR */}
      <div className="w-60 bg-slate-900 border-r border-slate-700 flex flex-col p-5 flex-shrink-0">
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-lg bg-emerald-600 flex items-center justify-center text-white font-black text-sm">HR</div>
            <div>
              <p className="font-black text-white text-sm">{user?.name?.split(" ")[0]}</p>
              <p className="text-xs text-slate-400 uppercase tracking-widest">HR Officer</p>
            </div>
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
          <p className="text-xs text-slate-600 mt-2 italic">HR cannot delete records</p>
        </div>
      </div>

      {/* CONTENT */}
      <div className="flex-1 bg-slate-50 overflow-y-auto">

        {/* ════════════════ MEMBERS ════════════════ */}
        {tab === "members" && (
          <div className="p-8">
            <h2 className="text-2xl font-black text-slate-800 mb-2">👥 Member Management</h2>
            <p className="text-sm text-slate-400 mb-6">HR can create, edit, approve and reject members. Deletion is admin-only.</p>

            {/* stats */}
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
              {/* members list */}
              <div className="lg:col-span-2">
                <input placeholder="Search..." value={search} onChange={e => { setSearch(e.target.value); setPage(1); }}
                  className="border border-slate-300 rounded-lg p-2.5 text-sm focus:border-blue-500 outline-none w-full mb-4" />
                <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-800 text-white">
                      <tr>
                        <th className="p-3 text-left">Member</th>
                        <th className="p-3 text-left">Role</th>
                        <th className="p-3 text-left">Phone</th>
                        <th className="p-3 text-left">Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {paginated.map(m => (
                        <tr key={m.id} className="border-b border-slate-100 hover:bg-slate-50">
                          <td className="p-3">
                            <p className="font-bold">{m.name}</p>
                            <p className="text-xs text-slate-400">{m.membership_no}</p>
                          </td>
                          <td className="p-3"><span className="capitalize text-xs bg-slate-100 px-2 py-0.5 rounded font-bold">{m.role}</span></td>
                          <td className="p-3 text-xs text-slate-500">{m.phone}</td>
                          <td className="p-3">
                            <button onClick={() => { setSelectedMember(m); setEditForm({ name: m.name, membership_no: m.membership_no, national_id: m.national_id, phone: m.phone, role: m.role }); }}
                              className="bg-blue-100 text-blue-700 text-xs px-2 py-1 rounded font-bold hover:bg-blue-200">Edit</button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <div className="p-3 flex justify-between items-center bg-slate-50 border-t text-xs">
                    <span className="text-slate-400">{filtered.length} members</span>
                    <div className="flex gap-2">
                      <button disabled={page === 1} onClick={() => setPage(p => p - 1)} className="px-3 py-1 bg-slate-200 rounded disabled:opacity-40">Prev</button>
                      <span className="text-slate-400">Page {page}/{totalPages || 1}</span>
                      <button disabled={page >= totalPages} onClick={() => setPage(p => p + 1)} className="px-3 py-1 bg-slate-200 rounded disabled:opacity-40">Next</button>
                    </div>
                  </div>
                </div>

                {/* pending */}
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

              {/* right panel */}
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
                          {["member", "owner", "driver", "conductor", "stage_operator", "hr", "director"].map(r => (
                            <option key={r} value={r}>{r.replace("_", " ")}</option>
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
                      {["member", "owner", "driver", "conductor", "stage_operator", "hr"].map(r => (
                        <option key={r} value={r}>{r.replace("_", " ")}</option>
                      ))}
                    </select>
                    <button onClick={createMember} className="w-full bg-emerald-600 text-white font-black py-2 rounded-lg text-sm hover:bg-emerald-700">Create Member</button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ════════════════ MATATUS ════════════════ */}
        {tab === "matatus" && <Matatu />}

        {/* ════════════════ ROUTES ════════════════ */}
        {tab === "routes" && <Routes />}

        {/* ════════════════ LOANS ════════════════ */}
        {tab === "loans" && (
          <div className="p-8">
            <h2 className="text-2xl font-black text-slate-800 mb-2">💼 Loan Management</h2>
            <p className="text-sm text-slate-400 mb-6">HR can approve, reject, request info, and send reminders. Only admin can delete loan types.</p>

            {/* filter */}
            <div className="flex gap-3 mb-4 flex-wrap">
              <input placeholder="Search member..." value={loanSearch} onChange={e => setLoanSearch(e.target.value)}
                className="flex-1 border border-slate-300 rounded-lg p-2.5 text-sm outline-none focus:border-blue-500" />
              <select value={loanFilter} onChange={e => setLoanFilter(e.target.value)}
                className="border border-slate-300 rounded-lg p-2.5 text-sm outline-none focus:border-blue-500">
                <option value="all">All Status</option>
                {["pending", "guarantors_pending", "approved", "rejected", "disbursed", "repaying", "cleared", "defaulted", "info_required"].map(s => (
                  <option key={s} value={s}>{s.replace("_", " ")}</option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* loan list */}
              <div className="lg:col-span-2 space-y-3">
                {filteredLoans.length === 0 ? (
                  <div className="bg-white border border-slate-200 rounded-xl p-8 text-center text-slate-400">No loans found</div>
                ) : filteredLoans.map(loan => (
                  <div key={loan.id} onClick={() => { setSelectedLoan(loan); setLoanNotes(""); setReminderMsg(""); }}
                    className={`bg-white border rounded-xl p-4 cursor-pointer hover:shadow-md transition-all ${selectedLoan?.id === loan.id ? "border-blue-400" : "border-slate-200"}`}>
                    <div className="flex justify-between items-start mb-2">
                      <div>
                        <p className="font-black text-slate-800">{loan.member_name}</p>
                        <p className="text-xs text-slate-400">{loan.membership_no}</p>
                      </div>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-bold ${LOAN_STATUS_COLORS[loan.status]}`}>{loan.status?.replace("_", " ")}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="font-black text-slate-800">KES {loan.amount?.toLocaleString()}</span>
                      <span className="text-slate-400">{loan.loan_type}</span>
                    </div>
                    <p className="text-xs text-slate-400 mt-1">{loan.purpose}</p>
                    {loan.penalty > 0 && <p className="text-xs text-red-600 mt-1 font-bold">⚠️ Penalty: KES {loan.penalty?.toLocaleString()}</p>}
                  </div>
                ))}
              </div>

              {/* loan detail */}
              {selectedLoan && (
                <div className="bg-white rounded-xl border border-slate-200 p-5">
                  <div className="flex justify-between items-center mb-3">
                    <h3 className="font-black text-slate-700 text-sm">Loan #{selectedLoan.id}</h3>
                    <button onClick={() => setSelectedLoan(null)} className="text-slate-400 hover:text-slate-700">✕</button>
                  </div>

                  <div className="space-y-1 text-sm mb-4">
                    {[
                      ["Member", selectedLoan.member_name],
                      ["Amount", `KES ${selectedLoan.amount?.toLocaleString()}`],
                      ["Interest", `${selectedLoan.interest_rate}%`],
                      ["Total Payable", `KES ${selectedLoan.total_payable?.toLocaleString()}`],
                      ["Repaid", `KES ${selectedLoan.amount_repaid?.toLocaleString()}`],
                      ["Balance", `KES ${selectedLoan.balance?.toLocaleString()}`],
                      ["Monthly", `KES ${selectedLoan.monthly_installment?.toLocaleString()}`],
                    ].map(([l, v]) => (
                      <div key={l} className="flex justify-between">
                        <span className="text-slate-400">{l}</span>
                        <span className="font-bold text-xs">{v}</span>
                      </div>
                    ))}
                  </div>

                  {selectedLoan.supporting_doc && (
                    <a href={selectedLoan.supporting_doc} target="_blank" rel="noreferrer"
                      className="block text-xs bg-blue-50 text-blue-700 border border-blue-200 text-center py-2 rounded-lg mb-3 hover:bg-blue-100">📎 View Document</a>
                  )}

                  <div className="mb-3">
                    <label className="text-xs text-slate-400 uppercase tracking-widest mb-1 block">Notes / Reason</label>
                    <textarea value={loanNotes} onChange={e => setLoanNotes(e.target.value)} rows={2} placeholder="Notes for member..."
                      className="w-full border border-slate-300 rounded-lg p-2 text-sm outline-none focus:border-blue-500 resize-none" />
                  </div>

                  <div className="space-y-2">
                    {selectedLoan.status === "pending" && (
                      <>
                        <button onClick={() => approveLoan(selectedLoan.id)} className="w-full bg-emerald-500 text-white font-black py-2 rounded-lg text-sm hover:bg-emerald-600">✅ Approve</button>
                        <button onClick={() => rejectLoan(selectedLoan.id)} className="w-full bg-red-500 text-white font-black py-2 rounded-lg text-sm hover:bg-red-600">❌ Reject</button>
                        <button onClick={() => requestMoreInfo(selectedLoan.id)} className="w-full bg-amber-400 text-white font-black py-2 rounded-lg text-sm hover:bg-amber-500">ℹ️ Request Info</button>
                      </>
                    )}
                    {["approved", "disbursed", "repaying", "defaulted"].includes(selectedLoan.status) && (
                      <div className="border-t border-slate-100 pt-3">
                        <label className="text-xs text-slate-400 uppercase tracking-widest mb-1 block">📱 Send SMS Reminder</label>
                        <textarea value={reminderMsg} onChange={e => setReminderMsg(e.target.value)} rows={2} placeholder="Custom reminder message (or leave blank for default)..."
                          className="w-full border border-slate-300 rounded-lg p-2 text-sm outline-none focus:border-blue-500 resize-none mb-2" />
                        <button onClick={() => sendLoanReminder(selectedLoan.id)}
                          className="w-full bg-blue-600 text-white font-black py-2 rounded-lg text-sm hover:bg-blue-700">📤 Send Reminder</button>
                      </div>
                    )}
                  </div>

                  {/* guarantors */}
                  {selectedLoan.guarantors?.length > 0 && (
                    <div className="border-t border-slate-100 mt-3 pt-3">
                      <p className="text-xs text-slate-400 uppercase tracking-widest mb-2">Guarantors</p>
                      {selectedLoan.guarantors.map(g => (
                        <div key={g.id} className="flex justify-between text-xs py-1">
                          <span>Member #{g.guarantor_id}</span>
                          <span className={`font-bold ${g.status === "accepted" ? "text-emerald-600" : g.status === "rejected" ? "text-red-600" : "text-amber-600"}`}>{g.status}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ════════════════ RECEIPTS BY ROUTE ════════════════ */}
        {tab === "receipts" && (
          <div className="p-8">
            <h2 className="text-2xl font-black text-slate-800 mb-2">🎫 Receipts by Route</h2>
            <p className="text-sm text-slate-400 mb-6">View tickets per route per day, with operator breakdown.</p>

            {/* filter bar */}
            <div className="flex gap-3 mb-6 flex-wrap">
              <div>
                <label className="text-xs text-slate-400 uppercase tracking-widest mb-1 block">Date</label>
                <input type="date" value={receiptDate} onChange={e => setReceiptDate(e.target.value)}
                  className="border border-slate-300 rounded-lg p-2.5 text-sm outline-none focus:border-blue-500" />
              </div>
              <div>
                <label className="text-xs text-slate-400 uppercase tracking-widest mb-1 block">Route (optional)</label>
                <select value={routeFilter} onChange={e => setRouteFilter(e.target.value)}
                  className="border border-slate-300 rounded-lg p-2.5 text-sm outline-none focus:border-blue-500 min-w-[200px]">
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

            {/* summary */}
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

                {/* route cards */}
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
                            <p className="text-xs text-slate-400">{route.count} ticket{route.count !== 1 ? "s" : ""}</p>
                          </div>
                        </div>
                        {/* operators mini breakdown */}
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
                  /* ticket detail for selected route */
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

                      {/* operator summary */}
                      <div className="p-4 bg-slate-50 border-b border-slate-200">
                        <p className="text-xs font-black text-slate-700 uppercase tracking-widest mb-2">Operator Breakdown</p>
                        <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                          {(selectedRoute.operators || []).map((op, j) => (
                            <div key={j} className="bg-white border border-slate-200 rounded-lg p-3">
                              <p className="font-black text-sm">{op.name}</p>
                              <p className="text-xs text-slate-500">{op.count} tickets</p>
                              <p className="text-emerald-700 font-bold text-sm">KES {op.total?.toLocaleString()}</p>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* tickets table */}
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
                        <tfoot className="bg-emerald-50 border-t-2 border-emerald-200">
                          <tr>
                            <td colSpan={2} className="p-3 font-black text-slate-700">TOTAL</td>
                            <td className="p-3 font-black text-emerald-700">KES {selectedRoute.total?.toLocaleString()}</td>
                            <td colSpan={3} className="p-3 text-xs text-slate-500">{selectedRoute.count} tickets</td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                  </div>
                )}
              </>
            )}

            {!receiptData && !receiptLoading && (
              <div className="bg-white border border-slate-200 rounded-xl p-12 text-center text-slate-400">
                <p className="text-4xl mb-3">🎫</p>
                <p>Select a date and click View to see receipts by route</p>
              </div>
            )}
          </div>
        )}

        {/* ════════════════ MONITOR WORKERS ════════════════ */}
        {tab === "workers" && <MonitorWorkers userRole="hr" />}

        {/* ════════════════ AUDIT LOG (PERMANENT) ════════════════ */}
        {tab === "audit" && (
          <div className="p-8">
            <h2 className="text-2xl font-black text-slate-800 mb-1">📋 Permanent Audit Log</h2>
            <p className="text-sm text-slate-400 mb-6">Immutable record of all HR and admin actions. Cannot be deleted.</p>

            <div className="flex gap-3 mb-5 flex-wrap">
              <input placeholder="Search action, member, or HR name..." value={auditSearch} onChange={e => setAuditSearch(e.target.value)}
                className="flex-1 border border-slate-300 rounded-lg p-2.5 text-sm outline-none focus:border-blue-500" />
              <select value={auditCategory} onChange={e => setAuditCategory(e.target.value)}
                className="border border-slate-300 rounded-lg p-2.5 text-sm outline-none focus:border-blue-500">
                <option value="all">All Categories</option>
                {["member", "loan", "matatu", "route", "worker", "receipt"].map(c => (
                  <option key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</option>
                ))}
              </select>
            </div>

            <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
              <div className="bg-slate-50 px-5 py-3 border-b border-slate-200 flex justify-between items-center">
                <h3 className="font-black text-slate-700 text-sm">Total: {filteredAudit.length} entries</h3>
                <span className="text-xs text-slate-400">🔒 Read-only — permanent record</span>
              </div>
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
                  {filteredAudit.length === 0 ? (
                    <tr><td colSpan={6} className="p-8 text-center text-slate-400">No audit records found</td></tr>
                  ) : filteredAudit.map(a => (
                    <tr key={a.id} className="border-b border-slate-100 hover:bg-slate-50">
                      <td className="p-3"><span className="font-bold text-blue-700 text-xs">{a.action}</span></td>
                      <td className="p-3"><span className="capitalize text-xs bg-slate-100 px-2 py-0.5 rounded font-bold text-slate-600">{a.category}</span></td>
                      <td className="p-3 text-xs text-slate-500">{a.membership_no || "—"}</td>
                      <td className="p-3">
                        <p className="font-bold text-emerald-700 text-xs">{a.performed_by_name}</p>
                        <p className="text-xs text-slate-400 capitalize">{a.performed_by_role}</p>
                      </td>
                      <td className="p-3 text-xs text-slate-400 max-w-xs truncate">{a.details || "—"}</td>
                      <td className="p-3 text-xs text-slate-400">{new Date(a.created_at).toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}