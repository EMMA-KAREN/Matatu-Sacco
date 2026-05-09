import { useState, useEffect, useCallback } from "react";
import API from "../api";

// ─── helpers ────────────────────────────────────────────────
const tok = () => localStorage.getItem("token");
const hdr = () => ({ Authorization: `Bearer ${tok()}`, "Content-Type": "application/json" });
const get = (url) => fetch(`${API}${url}`, { headers: hdr() }).then(r => r.ok ? r.json() : []);
const post = (url, body) => fetch(`${API}${url}`, { method: "POST", headers: hdr(), body: JSON.stringify(body) });
const put  = (url, body) => fetch(`${API}${url}`, { method: "PUT",  headers: hdr(), body: JSON.stringify(body) });

const SEVERITY_STYLES = {
  minor: "bg-amber-100 text-amber-800 border-amber-300",
  major: "bg-orange-100 text-orange-800 border-orange-300",
  final: "bg-red-100 text-red-800 border-red-300",
};
const SEVERITY_ICONS = { minor: "⚠️", major: "🔶", final: "🚨" };

const WORKER_ROLES = ["driver", "conductor", "stage_operator", "member", "owner"];

// ─── sub-components ─────────────────────────────────────────
function StatPill({ label, value, accent }) {
  return (
    <div className={`flex flex-col items-center justify-center rounded-xl px-4 py-3 border ${accent}`}>
      <span className="text-xl font-black">{value}</span>
      <span className="text-xs opacity-70 mt-0.5 text-center leading-tight">{label}</span>
    </div>
  );
}

function Toast({ msg, type, onClose }) {
  useEffect(() => { const t = setTimeout(onClose, 3500); return () => clearTimeout(t); }, [onClose]);
  return (
    <div className={`fixed top-5 right-5 z-[200] px-5 py-3 rounded-xl shadow-2xl text-sm font-bold flex items-center gap-3 transition-all
      ${type === "error" ? "bg-red-500 text-white" : "bg-emerald-500 text-white"}`}>
      <span>{type === "error" ? "✕" : "✓"}</span>
      {msg}
    </div>
  );
}

// ─── main component ─────────────────────────────────────────
export default function MonitorWorkers({ userRole = "hr" }) {
  const [tab, setTab] = useState("overview");
  const [toast, setToast] = useState(null);

  // data
  const [members, setMembers] = useState([]);
  const [salaryConfigs, setSalaryConfigs] = useState([]);
  const [allWarnings, setAllWarnings] = useState([]);
  const [salaryPayments, setSalaryPayments] = useState([]);

  // selected worker
  const [selectedWorker, setSelectedWorker] = useState(null);
  const [workerSummary, setWorkerSummary] = useState(null);
  const [workerWarnings, setWorkerWarnings] = useState([]);
  const [workerSalaryHistory, setWorkerSalaryHistory] = useState([]);

  // forms
  const [warningForm, setWarningForm] = useState({ member_id: "", severity: "minor", reason: "" });
  const [salaryForm, setSalaryForm] = useState({ member_id: "", amount: "", payment_type: "monthly", period: "", payment_method: "cash", mpesa_code: "", notes: "" });
  const [salaryConfigForm, setSalaryConfigForm] = useState({ member_id: "", base_salary: "", payment_frequency: "monthly", role_label: "" });
  const [reminderForm, setReminderForm] = useState({ message: "" });

  // search / filter
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [severityFilter, setSeverityFilter] = useState("all");

  const showToast = (msg, type = "success") => setToast({ msg, type });

  // ── fetch ──
  const fetchAll = useCallback(async () => {
    const [m, sc, aw, sp] = await Promise.all([
      get("/hr/members"),
      get("/salary/config"),
      get("/workers/warnings/all"),
      get("/salary/payments"),
    ]);
    setMembers(m);
    setSalaryConfigs(sc);
    setAllWarnings(aw);
    setSalaryPayments(sp);
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const selectWorker = async (member) => {
    setSelectedWorker(member);
    const [summary, warnings, salHist] = await Promise.all([
      get(`/workers/summary/${member.id}`),
      get(`/workers/warnings/${member.id}/member`),
      get(`/salary/payments?member_id=${member.id}`)
    ]);
    setWorkerSummary(summary);
    setWorkerWarnings(warnings);
    setWorkerSalaryHistory(salHist);
    setWarningForm(f => ({ ...f, member_id: member.id }));
    setSalaryForm(f => ({ ...f, member_id: member.id }));
    setSalaryConfigForm(f => ({ ...f, member_id: member.id, role_label: member.role }));
    setTab("worker-detail");
  };

  // ── actions ──
  const issueWarning = async () => {
    if (!warningForm.member_id || !warningForm.reason.trim()) return showToast("Select worker and enter reason", "error");
    const res = await post("/workers/warnings", warningForm);
    if (!res.ok) return showToast("Failed to issue warning", "error");
    showToast("Warning issued ✓");
    setWarningForm(f => ({ ...f, reason: "", severity: "minor" }));
    fetchAll();
    if (selectedWorker) {
      const warnings = await get(`/workers/warnings/${selectedWorker.id}/member`);
      setWorkerWarnings(warnings);
    }
  };

  const acknowledgeWarning = async (id) => {
    await put(`/workers/warnings/${id}/acknowledge`);
    showToast("Warning acknowledged");
    if (selectedWorker) {
      const warnings = await get(`/workers/warnings/${selectedWorker.id}/member`);
      setWorkerWarnings(warnings);
    }
    fetchAll();
  };

  const paySalary = async () => {
    const { member_id, amount, payment_type, period, payment_method, mpesa_code, notes } = salaryForm;
    if (!member_id || !amount || !period) return showToast("Fill member, amount, and period", "error");
    if (payment_method === "mpesa" && !mpesa_code) return showToast("Enter M-Pesa code", "error");
    const res = await post("/salary/pay", { member_id: parseInt(member_id), amount: parseFloat(amount), payment_type, period, payment_method, mpesa_code, notes });
    if (!res.ok) return showToast("Payment failed", "error");
    showToast(`KES ${Number(amount).toLocaleString()} salary paid ✓`);
    setSalaryForm(f => ({ ...f, amount: "", period: "", mpesa_code: "", notes: "" }));
    fetchAll();
    if (selectedWorker) {
      const salHist = await get(`/salary/payments?member_id=${selectedWorker.id}`);
      setWorkerSalaryHistory(salHist);
    }
  };

  const setSalaryConfig = async () => {
    const { member_id, base_salary, payment_frequency, role_label } = salaryConfigForm;
    if (!member_id || !base_salary) return showToast("Fill member and base salary", "error");
    const res = await post("/salary/config", { member_id: parseInt(member_id), base_salary: parseFloat(base_salary), payment_frequency, role_label });
    if (!res.ok) return showToast("Config save failed", "error");
    showToast("Salary config saved ✓");
    fetchAll();
  };

  // ── derived ──
  const filteredMembers = members.filter(m => {
    const matchSearch = m.name?.toLowerCase().includes(search.toLowerCase()) || m.membership_no?.toLowerCase().includes(search.toLowerCase());
    const matchRole = roleFilter === "all" || m.role === roleFilter;
    return matchSearch && matchRole;
  });

  const filteredWarnings = allWarnings.filter(w => {
    const matchSev = severityFilter === "all" || w.severity === severityFilter;
    const matchSearch = w.member_name?.toLowerCase().includes(search.toLowerCase()) || w.membership_no?.toLowerCase().includes(search.toLowerCase());
    return matchSev && (tab === "warnings" ? matchSearch : true);
  });

  const totalSalaryThisMonth = salaryPayments
    .filter(p => p.created_at?.startsWith(new Date().toISOString().slice(0, 7)))
    .reduce((s, p) => s + p.amount, 0);

  const unacknowledgedWarnings = allWarnings.filter(w => !w.is_acknowledged).length;

  // ── period helper ──
  const defaultPeriod = (type) => {
    const d = new Date();
    if (type === "weekly") {
      const wk = Math.ceil(d.getDate() / 7);
      return `${d.getFullYear()}-W${String(d.getMonth() + 1).padStart(2, "0")}${wk}`;
    }
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  };

  // ─── TABS ───────────────────────────────────────────────────
  const TABS = [
    { key: "overview", label: "📊 Overview" },
    { key: "workers", label: "👷 Workers" },
    { key: "salary", label: "💰 Salary" },
    { key: "warnings", label: `⚠️ Warnings${unacknowledgedWarnings > 0 ? ` (${unacknowledgedWarnings})` : ""}` },
  ];

  return (
    <div className="min-h-screen bg-slate-50" style={{ fontFamily: "'Trebuchet MS', sans-serif" }}>
      {toast && <Toast {...toast} onClose={() => setToast(null)} />}

      {/* ── top nav ── */}
      <div className="bg-slate-900 text-white px-6 py-3 flex items-center gap-4 sticky top-0 z-10 shadow-xl">
        <span className="text-sm font-black uppercase tracking-widest text-slate-400 mr-2">Worker Monitor</span>
        <div className="flex gap-1">
          {TABS.map(t => (
            <button key={t.key} onClick={() => setTab(t.key)}
              className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${tab === t.key || (tab === "worker-detail" && t.key === "workers") ? "bg-blue-600 text-white" : "text-slate-400 hover:bg-slate-800 hover:text-white"}`}>
              {t.label}
            </button>
          ))}
          {tab === "worker-detail" && selectedWorker && (
            <button onClick={() => setTab("workers")} className="text-slate-400 hover:text-white ml-2 text-xs">← Back</button>
          )}
        </div>
      </div>

      <div className="p-6">

        {/* ═══════════════════ OVERVIEW ═══════════════════ */}
        {tab === "overview" && (
          <div>
            <h2 className="text-2xl font-black text-slate-800 mb-6">Workforce Overview</h2>

            {/* stat cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
              <StatPill label="Total Workers" value={members.length} accent="bg-blue-50 border-blue-200 text-blue-700" />
              <StatPill label="Salary This Month" value={`KES ${totalSalaryThisMonth.toLocaleString()}`} accent="bg-emerald-50 border-emerald-200 text-emerald-700" />
              <StatPill label="Unacknowledged Warnings" value={unacknowledgedWarnings} accent={`${unacknowledgedWarnings > 0 ? "bg-red-50 border-red-200 text-red-700" : "bg-slate-100 border-slate-200 text-slate-600"}`} />
              <StatPill label="Salary Configs" value={salaryConfigs.length} accent="bg-purple-50 border-purple-200 text-purple-700" />
            </div>

            {/* role breakdown */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
              <div className="bg-white border border-slate-200 rounded-xl p-5">
                <h3 className="font-black text-slate-700 mb-4 text-sm">Workers by Role</h3>
                {WORKER_ROLES.map(role => {
                  const count = members.filter(m => m.role === role).length;
                  const pct = members.length > 0 ? (count / members.length) * 100 : 0;
                  return (
                    <div key={role} className="mb-3">
                      <div className="flex justify-between text-xs mb-1">
                        <span className="capitalize font-medium text-slate-700">{role.replace("_", " ")}</span>
                        <span className="text-slate-400">{count}</span>
                      </div>
                      <div className="w-full bg-slate-100 rounded-full h-2">
                        <div className="h-2 rounded-full bg-blue-500 transition-all" style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* recent warnings */}
              <div className="bg-white border border-slate-200 rounded-xl p-5">
                <h3 className="font-black text-slate-700 mb-4 text-sm">Recent Warnings</h3>
                {filteredWarnings.slice(0, 6).length === 0 ? (
                  <p className="text-slate-400 text-sm">No warnings issued</p>
                ) : (
                  <div className="space-y-2">
                    {filteredWarnings.slice(0, 6).map(w => (
                      <div key={w.id} className={`flex justify-between items-center p-2 rounded-lg border text-xs ${SEVERITY_STYLES[w.severity]}`}>
                        <div>
                          <span className="font-black">{w.member_name}</span>
                          <span className="opacity-60 ml-2">· {w.severity}</span>
                        </div>
                        <span className={`text-xs ${w.is_acknowledged ? "text-emerald-600" : "text-red-600"} font-bold`}>
                          {w.is_acknowledged ? "✓ ACK" : "PENDING"}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* workers needing salary config */}
            <div className="bg-white border border-amber-200 rounded-xl p-5">
              <h3 className="font-black text-amber-700 mb-3 text-sm">
                ⚡ Workers Without Salary Config ({members.filter(m => !salaryConfigs.find(c => c.member_id === m.id)).length})
              </h3>
              <div className="flex flex-wrap gap-2">
                {members.filter(m => !salaryConfigs.find(c => c.member_id === m.id)).map(m => (
                  <button key={m.id} onClick={() => selectWorker(m)}
                    className="bg-amber-50 border border-amber-200 text-amber-800 text-xs px-3 py-1 rounded-full font-bold hover:bg-amber-100">
                    {m.name} ({m.role})
                  </button>
                ))}
                {members.filter(m => !salaryConfigs.find(c => c.member_id === m.id)).length === 0 && (
                  <p className="text-slate-400 text-sm">All workers have salary configs ✓</p>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ═══════════════════ WORKERS LIST ═══════════════════ */}
        {tab === "workers" && (
          <div>
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-2xl font-black text-slate-800">👷 All Workers</h2>
            </div>

            <div className="flex gap-3 mb-4 flex-wrap">
              <input placeholder="Search name or membership no..." value={search} onChange={e => setSearch(e.target.value)}
                className="flex-1 border border-slate-300 rounded-lg p-2.5 text-sm focus:border-blue-500 outline-none" />
              <select value={roleFilter} onChange={e => setRoleFilter(e.target.value)}
                className="border border-slate-300 rounded-lg p-2.5 text-sm focus:border-blue-500 outline-none">
                <option value="all">All Roles</option>
                {WORKER_ROLES.map(r => <option key={r} value={r}>{r.replace("_", " ")}</option>)}
              </select>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredMembers.map(m => {
                const config = salaryConfigs.find(c => c.member_id === m.id);
                const memberWarnings = allWarnings.filter(w => w.member_id === m.id);
                const unackW = memberWarnings.filter(w => !w.is_acknowledged).length;
                return (
                  <div key={m.id} onClick={() => selectWorker(m)}
                    className="bg-white border border-slate-200 rounded-xl p-4 cursor-pointer hover:shadow-lg hover:border-blue-300 transition-all">
                    <div className="flex justify-between items-start mb-3">
                      <div>
                        <p className="font-black text-slate-800">{m.name}</p>
                        <p className="text-xs text-slate-400">{m.membership_no}</p>
                      </div>
                      <span className="capitalize text-xs bg-slate-100 px-2 py-0.5 rounded font-bold text-slate-600">
                        {m.role?.replace("_", " ")}
                      </span>
                    </div>
                    <div className="flex gap-2 flex-wrap">
                      {config ? (
                        <span className="text-xs bg-emerald-50 border border-emerald-200 text-emerald-700 px-2 py-0.5 rounded font-bold">
                          KES {config.base_salary?.toLocaleString()}/{config.payment_frequency === "weekly" ? "wk" : "mo"}
                        </span>
                      ) : (
                        <span className="text-xs bg-amber-50 border border-amber-200 text-amber-600 px-2 py-0.5 rounded font-bold">No salary config</span>
                      )}
                      {unackW > 0 && (
                        <span className="text-xs bg-red-50 border border-red-200 text-red-700 px-2 py-0.5 rounded font-bold">
                          {unackW} warning{unackW > 1 ? "s" : ""}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-slate-400 mt-2">{m.phone}</p>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ═══════════════════ WORKER DETAIL ═══════════════════ */}
        {tab === "worker-detail" && selectedWorker && (
          <div>
            <div className="flex items-center gap-4 mb-6">
              <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-blue-500 to-blue-700 flex items-center justify-center text-white text-xl font-black">
                {selectedWorker.name?.[0]}
              </div>
              <div>
                <h2 className="text-2xl font-black text-slate-800">{selectedWorker.name}</h2>
                <p className="text-slate-400 text-sm capitalize">{selectedWorker.membership_no} · {selectedWorker.role?.replace("_", " ")}</p>
              </div>
            </div>

            {workerSummary && (
              <div className="grid grid-cols-3 md:grid-cols-6 gap-3 mb-6">
                {[
                  { label: "Receipts Issued", value: workerSummary.stats?.receipts_issued || 0, accent: "bg-blue-50 border-blue-200 text-blue-700" },
                  { label: "Total Collected", value: `KES ${(workerSummary.stats?.total_collected || 0).toLocaleString()}`, accent: "bg-emerald-50 border-emerald-200 text-emerald-700" },
                  { label: "Earnings Submitted", value: workerSummary.stats?.earnings_submitted || 0, accent: "bg-cyan-50 border-cyan-200 text-cyan-700" },
                  { label: "Warnings", value: workerSummary.stats?.warnings_total || 0, accent: `${(workerSummary.stats?.warnings_total || 0) > 0 ? "bg-red-50 border-red-200 text-red-700" : "bg-slate-100 border-slate-200 text-slate-600"}` },
                  { label: "Salary Paid", value: `KES ${(workerSummary.stats?.total_salary_paid || 0).toLocaleString()}`, accent: "bg-purple-50 border-purple-200 text-purple-700" },
                  { label: "Active Loans", value: workerSummary.stats?.active_loans || 0, accent: "bg-amber-50 border-amber-200 text-amber-700" },
                ].map((s, i) => <StatPill key={i} {...s} />)}
              </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* LEFT — salary config + pay */}
              <div className="space-y-4">
                {/* salary config */}
                <div className="bg-white border border-slate-200 rounded-xl p-5">
                  <h3 className="font-black text-slate-700 mb-3 text-sm">💼 Salary Configuration</h3>
                  <div className="space-y-2">
                    <div>
                      <label className="text-xs text-slate-400 uppercase tracking-widest mb-0.5 block">Base Salary (KES)</label>
                      <input type="number" value={salaryConfigForm.base_salary}
                        onChange={e => setSalaryConfigForm(f => ({ ...f, base_salary: e.target.value }))}
                        placeholder="e.g. 15000"
                        className="w-full border border-slate-300 rounded-lg p-2 text-sm outline-none focus:border-blue-500" />
                    </div>
                    <div>
                      <label className="text-xs text-slate-400 uppercase tracking-widest mb-0.5 block">Frequency</label>
                      <select value={salaryConfigForm.payment_frequency}
                        onChange={e => setSalaryConfigForm(f => ({ ...f, payment_frequency: e.target.value }))}
                        className="w-full border border-slate-300 rounded-lg p-2 text-sm outline-none focus:border-blue-500">
                        <option value="weekly">Weekly</option>
                        <option value="monthly">Monthly</option>
                      </select>
                    </div>
                    <div>
                      <label className="text-xs text-slate-400 uppercase tracking-widest mb-0.5 block">Role Label</label>
                      <input value={salaryConfigForm.role_label}
                        onChange={e => setSalaryConfigForm(f => ({ ...f, role_label: e.target.value }))}
                        placeholder="e.g. Senior Driver"
                        className="w-full border border-slate-300 rounded-lg p-2 text-sm outline-none focus:border-blue-500" />
                    </div>
                    <button onClick={setSalaryConfig} className="w-full bg-blue-600 text-white font-black py-2 rounded-lg text-sm hover:bg-blue-700">
                      Save Config
                    </button>
                  </div>
                </div>

                {/* pay now */}
                <div className="bg-white border border-slate-200 rounded-xl p-5">
                  <h3 className="font-black text-slate-700 mb-3 text-sm">💸 Pay Salary</h3>
                  <div className="space-y-2">
                    <div>
                      <label className="text-xs text-slate-400 uppercase tracking-widest mb-0.5 block">Amount (KES)</label>
                      <input type="number" value={salaryForm.amount}
                        onChange={e => setSalaryForm(f => ({ ...f, amount: e.target.value }))}
                        placeholder={`Base: KES ${workerSummary?.salary_config?.base_salary?.toLocaleString() || 0}`}
                        className="w-full border border-slate-300 rounded-lg p-2 text-sm outline-none focus:border-blue-500" />
                    </div>
                    <div>
                      <label className="text-xs text-slate-400 uppercase tracking-widest mb-0.5 block">Payment Type</label>
                      <select value={salaryForm.payment_type}
                        onChange={e => { setSalaryForm(f => ({ ...f, payment_type: e.target.value, period: defaultPeriod(e.target.value) })); }}
                        className="w-full border border-slate-300 rounded-lg p-2 text-sm outline-none focus:border-blue-500">
                        <option value="weekly">Weekly</option>
                        <option value="monthly">Monthly</option>
                      </select>
                    </div>
                    <div>
                      <label className="text-xs text-slate-400 uppercase tracking-widest mb-0.5 block">Period</label>
                      <input value={salaryForm.period}
                        onChange={e => setSalaryForm(f => ({ ...f, period: e.target.value }))}
                        placeholder={defaultPeriod(salaryForm.payment_type)}
                        className="w-full border border-slate-300 rounded-lg p-2 text-sm outline-none focus:border-blue-500" />
                    </div>
                    <div>
                      <label className="text-xs text-slate-400 uppercase tracking-widest mb-0.5 block">Payment Method</label>
                      <select value={salaryForm.payment_method}
                        onChange={e => setSalaryForm(f => ({ ...f, payment_method: e.target.value }))}
                        className="w-full border border-slate-300 rounded-lg p-2 text-sm outline-none focus:border-blue-500">
                        <option value="cash">Cash</option>
                        <option value="mpesa">M-Pesa</option>
                        <option value="bank">Bank Transfer</option>
                      </select>
                    </div>
                    {salaryForm.payment_method === "mpesa" && (
                      <div>
                        <label className="text-xs text-slate-400 uppercase tracking-widest mb-0.5 block">M-Pesa Code</label>
                        <input value={salaryForm.mpesa_code}
                          onChange={e => setSalaryForm(f => ({ ...f, mpesa_code: e.target.value }))}
                          placeholder="e.g. QGH4R..."
                          className="w-full border border-slate-300 rounded-lg p-2 text-sm outline-none focus:border-blue-500" />
                      </div>
                    )}
                    <div>
                      <label className="text-xs text-slate-400 uppercase tracking-widest mb-0.5 block">Notes (optional)</label>
                      <input value={salaryForm.notes}
                        onChange={e => setSalaryForm(f => ({ ...f, notes: e.target.value }))}
                        placeholder="Any notes..."
                        className="w-full border border-slate-300 rounded-lg p-2 text-sm outline-none focus:border-blue-500" />
                    </div>
                    <button onClick={paySalary} className="w-full bg-emerald-600 text-white font-black py-2 rounded-lg text-sm hover:bg-emerald-700">
                      ✓ Pay Now
                    </button>
                  </div>
                </div>

                {/* issue warning */}
                <div className="bg-white border border-slate-200 rounded-xl p-5">
                  <h3 className="font-black text-slate-700 mb-3 text-sm">⚠️ Issue Warning</h3>
                  <div className="space-y-2">
                    <div>
                      <label className="text-xs text-slate-400 uppercase tracking-widest mb-0.5 block">Severity</label>
                      <select value={warningForm.severity}
                        onChange={e => setWarningForm(f => ({ ...f, severity: e.target.value }))}
                        className="w-full border border-slate-300 rounded-lg p-2 text-sm outline-none focus:border-blue-500">
                        <option value="minor">⚠️ Minor</option>
                        <option value="major">🔶 Major</option>
                        <option value="final">🚨 Final Warning</option>
                      </select>
                    </div>
                    <div>
                      <label className="text-xs text-slate-400 uppercase tracking-widest mb-0.5 block">Reason</label>
                      <textarea value={warningForm.reason}
                        onChange={e => setWarningForm(f => ({ ...f, reason: e.target.value }))}
                        rows={3} placeholder="Describe the misconduct or issue..."
                        className="w-full border border-slate-300 rounded-lg p-2 text-sm outline-none focus:border-blue-500 resize-none" />
                    </div>
                    <button onClick={issueWarning}
                      className="w-full bg-orange-500 text-white font-black py-2 rounded-lg text-sm hover:bg-orange-600">
                      Issue Warning
                    </button>
                  </div>
                </div>
              </div>

              {/* MIDDLE — warnings history */}
              <div className="space-y-4">
                <div className="bg-white border border-slate-200 rounded-xl p-5">
                  <h3 className="font-black text-slate-700 mb-3 text-sm">Warning History ({workerWarnings.length})</h3>
                  {workerWarnings.length === 0 ? (
                    <p className="text-slate-400 text-sm text-center py-4">No warnings on record ✓</p>
                  ) : (
                    <div className="space-y-3">
                      {workerWarnings.map(w => (
                        <div key={w.id} className={`border rounded-xl p-3 ${SEVERITY_STYLES[w.severity]}`}>
                          <div className="flex justify-between items-start mb-1">
                            <span className="font-black text-xs">{SEVERITY_ICONS[w.severity]} {w.severity.toUpperCase()}</span>
                            {!w.is_acknowledged && (
                              <button onClick={() => acknowledgeWarning(w.id)}
                                className="text-xs bg-white border px-2 py-0.5 rounded font-bold hover:bg-emerald-50 hover:border-emerald-400 hover:text-emerald-700">
                                Mark Acknowledged
                              </button>
                            )}
                            {w.is_acknowledged && <span className="text-xs text-emerald-600 font-bold">✓ Acknowledged</span>}
                          </div>
                          <p className="text-xs mb-1">{w.reason}</p>
                          <p className="text-xs opacity-60">By {w.issued_by_name} · {new Date(w.created_at).toLocaleDateString()}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* RIGHT — salary history */}
              <div className="space-y-4">
                <div className="bg-white border border-slate-200 rounded-xl p-5">
                  <h3 className="font-black text-slate-700 mb-3 text-sm">Salary History</h3>
                  {workerSalaryHistory.length === 0 ? (
                    <p className="text-slate-400 text-sm text-center py-4">No salary payments yet</p>
                  ) : (
                    <div className="space-y-2">
                      {workerSalaryHistory.map(p => (
                        <div key={p.id} className="flex justify-between items-center p-3 bg-slate-50 border border-slate-200 rounded-lg">
                          <div>
                            <p className="font-black text-sm text-emerald-700">KES {p.amount?.toLocaleString()}</p>
                            <p className="text-xs text-slate-400">{p.period} · {p.payment_method}</p>
                            {p.notes && <p className="text-xs text-slate-400 italic">{p.notes}</p>}
                          </div>
                          <div className="text-right">
                            <span className="text-xs bg-emerald-50 border border-emerald-200 text-emerald-700 px-2 py-0.5 rounded font-bold capitalize">{p.payment_type}</span>
                            <p className="text-xs text-slate-400 mt-1">{new Date(p.created_at).toLocaleDateString()}</p>
                          </div>
                        </div>
                      ))}
                      <div className="p-2 bg-emerald-50 border border-emerald-200 rounded-lg text-center">
                        <span className="text-xs font-black text-emerald-700">
                          Total Paid: KES {workerSalaryHistory.reduce((s, p) => s + p.amount, 0).toLocaleString()}
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ═══════════════════ SALARY TAB ═══════════════════ */}
        {tab === "salary" && (
          <div>
            <h2 className="text-2xl font-black text-slate-800 mb-6">💰 Salary Management</h2>

            {/* summary cards */}
            <div className="grid grid-cols-3 gap-4 mb-6">
              {[
                { label: "Total Paid This Month", value: `KES ${totalSalaryThisMonth.toLocaleString()}`, accent: "bg-emerald-50 border-emerald-200 text-emerald-700" },
                { label: "Total Paid All Time", value: `KES ${salaryPayments.reduce((s, p) => s + p.amount, 0).toLocaleString()}`, accent: "bg-blue-50 border-blue-200 text-blue-700" },
                { label: "Configured Workers", value: salaryConfigs.length, accent: "bg-purple-50 border-purple-200 text-purple-700" },
              ].map((s, i) => <StatPill key={i} {...s} />)}
            </div>

            {/* salary configs table */}
            <div className="bg-white border border-slate-200 rounded-xl overflow-hidden mb-6">
              <div className="px-5 py-3 bg-slate-50 border-b border-slate-200">
                <h3 className="font-black text-slate-700 text-sm">Salary Configurations</h3>
              </div>
              <table className="w-full text-sm">
                <thead className="bg-slate-800 text-white">
                  <tr>
                    <th className="p-3 text-left">Worker</th>
                    <th className="p-3 text-left">Role</th>
                    <th className="p-3 text-left">Base Salary</th>
                    <th className="p-3 text-left">Frequency</th>
                    <th className="p-3 text-left">Last Paid</th>
                    <th className="p-3 text-left">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {salaryConfigs.length === 0 ? (
                    <tr><td colSpan={6} className="p-6 text-center text-slate-400">No salary configs yet</td></tr>
                  ) : salaryConfigs.map(c => (
                    <tr key={c.id} className="border-b border-slate-100 hover:bg-slate-50">
                      <td className="p-3">
                        <p className="font-bold">{c.member_name}</p>
                        <p className="text-xs text-slate-400">{c.membership_no}</p>
                      </td>
                      <td className="p-3 capitalize text-slate-500 text-xs">{c.role_label || c.role}</td>
                      <td className="p-3 font-black text-emerald-700">KES {c.base_salary?.toLocaleString()}</td>
                      <td className="p-3">
                        <span className="text-xs bg-blue-50 border border-blue-200 text-blue-700 px-2 py-0.5 rounded font-bold capitalize">{c.payment_frequency}</span>
                      </td>
                      <td className="p-3 text-xs text-slate-400">
                        {c.last_paid ? (
                          <span>{new Date(c.last_paid).toLocaleDateString()} · KES {c.last_amount?.toLocaleString()}</span>
                        ) : <span className="text-amber-600">Never paid</span>}
                      </td>
                      <td className="p-3">
                        <button onClick={() => {
                          const m = members.find(m => m.id === c.member_id);
                          if (m) selectWorker(m);
                        }} className="bg-blue-100 text-blue-700 text-xs px-2 py-1 rounded font-bold hover:bg-blue-200">
                          Pay / View
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* payment history */}
            <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
              <div className="px-5 py-3 bg-slate-50 border-b border-slate-200">
                <h3 className="font-black text-slate-700 text-sm">All Salary Payments</h3>
              </div>
              <table className="w-full text-sm">
                <thead className="bg-slate-800 text-white">
                  <tr>
                    <th className="p-3 text-left">Worker</th>
                    <th className="p-3 text-left">Amount</th>
                    <th className="p-3 text-left">Period</th>
                    <th className="p-3 text-left">Method</th>
                    <th className="p-3 text-left">Date</th>
                  </tr>
                </thead>
                <tbody>
                  {salaryPayments.slice(0, 50).map(p => (
                    <tr key={p.id} className="border-b border-slate-100 hover:bg-slate-50">
                      <td className="p-3">
                        <p className="font-bold">{p.member_name}</p>
                        <p className="text-xs text-slate-400">{p.membership_no}</p>
                      </td>
                      <td className="p-3 font-black text-emerald-700">KES {p.amount?.toLocaleString()}</td>
                      <td className="p-3 text-slate-500 text-xs">{p.period}</td>
                      <td className="p-3">
                        <span className="capitalize text-xs bg-slate-100 px-2 py-0.5 rounded font-bold">{p.payment_method}</span>
                        {p.mpesa_code && <p className="text-xs text-slate-400">{p.mpesa_code}</p>}
                      </td>
                      <td className="p-3 text-xs text-slate-400">{new Date(p.created_at).toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ═══════════════════ WARNINGS TAB ═══════════════════ */}
        {tab === "warnings" && (
          <div>
            <h2 className="text-2xl font-black text-slate-800 mb-6">⚠️ Disciplinary Warnings</h2>

            <div className="flex gap-3 mb-5 flex-wrap">
              <input placeholder="Search worker..." value={search} onChange={e => setSearch(e.target.value)}
                className="flex-1 border border-slate-300 rounded-lg p-2.5 text-sm focus:border-blue-500 outline-none" />
              <select value={severityFilter} onChange={e => setSeverityFilter(e.target.value)}
                className="border border-slate-300 rounded-lg p-2.5 text-sm focus:border-blue-500 outline-none">
                <option value="all">All Severities</option>
                <option value="minor">⚠️ Minor</option>
                <option value="major">🔶 Major</option>
                <option value="final">🚨 Final</option>
              </select>
            </div>

            {/* quick issue form */}
            <div className="bg-white border border-slate-200 rounded-xl p-5 mb-6">
              <h3 className="font-black text-slate-700 mb-3 text-sm">Issue New Warning</h3>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                <div>
                  <label className="text-xs text-slate-400 mb-0.5 block">Worker</label>
                  <select value={warningForm.member_id}
                    onChange={e => setWarningForm(f => ({ ...f, member_id: e.target.value }))}
                    className="w-full border border-slate-300 rounded-lg p-2.5 text-sm outline-none focus:border-blue-500">
                    <option value="">Select Worker</option>
                    {members.map(m => <option key={m.id} value={m.id}>{m.name} ({m.role})</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-slate-400 mb-0.5 block">Severity</label>
                  <select value={warningForm.severity}
                    onChange={e => setWarningForm(f => ({ ...f, severity: e.target.value }))}
                    className="w-full border border-slate-300 rounded-lg p-2.5 text-sm outline-none focus:border-blue-500">
                    <option value="minor">⚠️ Minor</option>
                    <option value="major">🔶 Major</option>
                    <option value="final">🚨 Final Warning</option>
                  </select>
                </div>
                <div className="md:col-span-1">
                  <label className="text-xs text-slate-400 mb-0.5 block">Reason</label>
                  <input value={warningForm.reason}
                    onChange={e => setWarningForm(f => ({ ...f, reason: e.target.value }))}
                    placeholder="Reason for warning..."
                    className="w-full border border-slate-300 rounded-lg p-2.5 text-sm outline-none focus:border-blue-500" />
                </div>
                <div className="flex items-end">
                  <button onClick={issueWarning}
                    className="w-full bg-orange-500 text-white font-black py-2.5 rounded-lg text-sm hover:bg-orange-600">
                    Issue Warning
                  </button>
                </div>
              </div>
            </div>

            {/* warnings list */}
            <div className="space-y-3">
              {filteredWarnings.length === 0 ? (
                <div className="bg-white border border-slate-200 rounded-xl p-8 text-center text-slate-400">No warnings found</div>
              ) : filteredWarnings.map(w => (
                <div key={w.id} className={`bg-white border rounded-xl p-4 ${SEVERITY_STYLES[w.severity]}`}>
                  <div className="flex justify-between items-start">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-black">{SEVERITY_ICONS[w.severity]} {w.severity.toUpperCase()}</span>
                        <span className="text-slate-300">·</span>
                        <span className="font-bold">{w.member_name}</span>
                        <span className="text-xs opacity-60 capitalize">({w.role?.replace("_", " ")})</span>
                      </div>
                      <p className="text-sm">{w.reason}</p>
                      <p className="text-xs opacity-60 mt-1">Issued by {w.issued_by_name} · {new Date(w.created_at).toLocaleString()}</p>
                    </div>
                    <div className="flex flex-col gap-1 items-end ml-4">
                      {w.is_acknowledged ? (
                        <span className="text-xs text-emerald-700 font-bold bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded">✓ Acknowledged</span>
                      ) : (
                        <span className="text-xs text-red-600 font-bold bg-red-50 border border-red-200 px-2 py-0.5 rounded">Pending ACK</span>
                      )}
                      <button onClick={() => { const m = members.find(m => m.id === w.member_id); if (m) selectWorker(m); }}
                        className="text-xs underline opacity-60 hover:opacity-100">View Worker</button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}