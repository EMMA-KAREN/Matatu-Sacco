import { useState } from "react";
import API from "../api";

const hdr = () => ({ Authorization: `Bearer ${localStorage.getItem("token")}` });
const jsonHdr = () => ({ ...hdr(), "Content-Type": "application/json" });
const inp = "w-full border border-gray-300 rounded-lg p-2.5 text-xs bg-white text-gray-900 font-bold outline-none focus:border-red-500";

export default function LoanSecurity({ loan, userRole = "member", onDone, notify }) {
  const [file, setFile] = useState(null);
  const [no, setNo] = useState(loan.security_logbook_no || "");
  const [busy, setBusy] = useState(false);

  const canReview = ["hr", "admin", "director"].includes(userRole);
  const st = loan.security_status || "none";

  // If no security requested and current user is member, hide
  if (st === "none" && !canReview) return null;

  // 1. Borrower or Staff uploads the vehicle logbook
  const uploadLogbook = async (e) => {
    if (e) e.preventDefault();
    if (!file && !loan.security_logbook) {
      return notify?.("Please select a logbook document (PDF or Photo)", "error");
    }
    if (!no.trim()) {
      return notify?.("Please enter the Logbook / Plate number", "error");
    }

    setBusy(true);
    const fd = new FormData();
    if (file) fd.append("logbook", file);
    fd.append("logbook_no", no.trim().toUpperCase());

    const r = await fetch(`${API}/loan-applications/${loan.id}/security-logbook`, {
      method: "POST",
      headers: hdr(),
      body: fd,
    });
    setBusy(false);

    if (r.ok) {
      notify?.("Vehicle logbook submitted for security verification ✓");
      onDone?.();
    } else {
      const d = await r.json().catch(() => ({}));
      notify?.(d.error || "Upload failed", "error");
    }
  };

  // 2. HR/Admin triggers request for additional security
  const handleRequestSecurity = async () => {
    const reason = prompt("Enter reason for requesting logbook security:", "Collateral required for loan terms");
    if (reason === null) return;

    setBusy(true);
    const r = await fetch(`${API}/loan-applications/${loan.id}/penalty`, {
      method: "PUT",
      headers: jsonHdr(),
      body: JSON.stringify({ reason }),
    });
    setBusy(false);

    if (r.ok) {
      notify?.("Logbook security marked as required from member ✓");
      onDone?.();
    } else {
      notify?.("Failed to request security", "error");
    }
  };

  // 3. HR/Admin review actions: Approve, Reject, Release, or Put Back on Hold
  const handleReviewAction = async (action) => {
    let body = undefined;
    if (action === "security-reject") {
      const notes = prompt("Reason for rejecting logbook copy:");
      if (notes === null) return;
      body = JSON.stringify({ notes });
    } else if (action === "security-rehold") {
      const reason = prompt("Reason for placing logbook back on hold:", "Further collateral holding required");
      if (reason === null) return;
      body = JSON.stringify({ reason });
    }

    setBusy(true);
    const r = await fetch(`${API}/loan-applications/${loan.id}/${action}`, {
      method: "PUT",
      headers: jsonHdr(),
      body,
    });
    setBusy(false);

    if (r.ok) {
      const msgs = {
        "security-approve": "Logbook accepted and held as loan security ✓",
        "security-release": "Logbook released back to member ✓",
        "security-rehold": "Logbook placed back on hold as active security ✓",
        "security-reject": "Logbook rejected, member notified to resubmit"
      };
      notify?.(msgs[action] || "Action completed ✓");
      onDone?.();
    } else {
      const d = await r.json().catch(() => ({}));
      notify?.(d.error || "Action failed", "error");
    }
  };

  const badgeClass = {
    required: "bg-red-100 text-red-800 border-red-300",
    pending_approval: "bg-amber-100 text-amber-800 border-amber-300",
    held: "bg-emerald-100 text-emerald-800 border-emerald-300",
    released: "bg-slate-200 text-slate-700 border-slate-300",
    none: "bg-slate-100 text-slate-500 border-slate-200",
  }[st] || "bg-slate-100 text-slate-500 border-slate-200";

  const badgeLabel = {
    required: "⚠️ Logbook Required",
    pending_approval: "⏳ Awaiting Verification",
    held: "🔒 Logbook Held as Security",
    released: "🔓 Logbook Released",
    none: "No Security Required",
  }[st] || st;

  return (
    <div className="bg-red-50/70 border-2 border-red-300 rounded-2xl p-5 mb-4 space-y-3">
      {/* Header */}
      <div className="flex justify-between items-start border-b border-red-200 pb-3">
        <div>
          <h4 className="font-black text-red-950 text-sm flex items-center gap-1.5">
            📘 Additional Security – Vehicle Logbook
          </h4>
          <p className="text-xs text-red-900 font-semibold mt-0.5">
            Secondary collateral held by the SACCO for default remediation or loan protection.
          </p>
        </div>
        <span className={`text-[11px] px-3 py-1 rounded-full font-black border ${badgeClass}`}>
          {badgeLabel}
        </span>
      </div>

      {/* Staff View: Option to Request Logbook if status is none */}
      {canReview && st === "none" && (
        <div className="flex justify-between items-center bg-white p-3 rounded-xl border border-red-200">
          <p className="text-xs text-slate-600 font-semibold">
            No vehicle security is held for this loan. You can request a logbook if the borrower defaults.
          </p>
          <button
            onClick={handleRequestSecurity}
            disabled={busy}
            className="bg-red-600 hover:bg-red-700 text-white font-bold text-xs px-3.5 py-1.5 rounded-lg shadow-sm disabled:opacity-50"
          >
            ⚠️ Request Logbook Security
          </button>
        </div>
      )}

      {/* ── CASE 1: LOGBOOK IS CURRENTLY HELD ── */}
      {st === "held" && (
        <div className="bg-emerald-50 border border-emerald-300 rounded-xl p-3.5 flex justify-between items-center text-xs">
          <div>
            <p className="font-bold text-emerald-900">
              🔒 Logbook Held: <span className="font-mono font-black">{loan.security_logbook_no || "On File"}</span>
            </p>
            <p className="text-emerald-700 mt-0.5 font-semibold">
              Held as active collateral against this loan.
            </p>
            {loan.security_logbook && (
              <a href={loan.security_logbook} target="_blank" rel="noreferrer" className="inline-block mt-1 text-blue-600 underline font-bold">
                View Logbook Document ↗
              </a>
            )}
          </div>
          {canReview && (
            <button
              onClick={() => handleReviewAction("security-release")}
              disabled={busy}
              className="bg-slate-800 hover:bg-slate-900 text-white font-bold px-3 py-1.5 rounded-lg text-xs"
            >
              🔓 Release Logbook
            </button>
          )}
        </div>
      )}

      {/* ── CASE 2: LOGBOOK IS RELEASED, CAN BE TAKEN BACK ON HOLD ── */}
      {st === "released" && (
        <div className="bg-slate-100 border border-slate-300 rounded-xl p-3.5 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 text-xs">
          <div>
            <p className="font-bold text-slate-800">
              🔓 Logbook Released: <span className="font-mono font-black">{loan.security_logbook_no || "On File"}</span>
            </p>
            <p className="text-slate-500 mt-0.5 font-medium">
              This logbook was previously released. You can place it back on hold at any time.
            </p>
            {loan.security_logbook && (
              <a href={loan.security_logbook} target="_blank" rel="noreferrer" className="inline-block mt-1 text-blue-600 underline font-bold">
                View Logbook Copy ↗
              </a>
            )}
          </div>
          {canReview && (
            <div className="flex gap-2 flex-wrap">
              <button
                onClick={() => handleReviewAction("security-rehold")}
                disabled={busy}
                className="bg-amber-600 hover:bg-amber-700 text-white font-bold px-3 py-1.5 rounded-lg text-xs shadow-sm"
              >
                🔒 Put Back on Hold
              </button>
              <button
                onClick={handleRequestSecurity}
                disabled={busy}
                className="bg-red-600 hover:bg-red-700 text-white font-bold px-3 py-1.5 rounded-lg text-xs shadow-sm"
              >
                ⚠️ Re-Request New Copy
              </button>
            </div>
          )}
        </div>
      )}

      {/* ── CASE 3: UPLOAD FORM (When required or staff editing) ── */}
      {(st === "required" || (canReview && st !== "held" && st !== "released")) && (
        <div className="bg-white border border-red-200 rounded-xl p-4 space-y-3">
          <p className="text-xs text-red-800 font-semibold leading-relaxed">
            {canReview
              ? "Staff Entry: Record and upload the vehicle logbook handed in by the member."
              : `Repayment remediation required on Loan #${loan.id}. Please upload your vehicle logbook copy.`}
            {loan.security_notes && <b className="block text-red-900 mt-1">Feedback: {loan.security_notes}</b>}
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <div>
              <label className="text-[11px] font-bold text-slate-700 block mb-1">
                Logbook / Plate Registration Number *
              </label>
              <input
                placeholder="e.g. KCA 123X / LB-90812"
                value={no}
                onChange={(e) => setNo(e.target.value)}
                className={inp}
              />
            </div>
            <div>
              <label className="text-[11px] font-bold text-slate-700 block mb-1">
                Logbook Document (PDF / Image) *
              </label>
              <input
                type="file"
                accept="image/*,.pdf"
                onChange={(e) => setFile(e.target.files[0])}
                className="text-xs block file:mr-2 file:bg-red-700 file:text-white file:border-0 file:rounded file:px-2.5 file:py-1 file:font-bold"
              />
            </div>
          </div>

          {loan.security_logbook && (
            <div className="text-xs">
              <span className="text-slate-500 font-bold">Existing file: </span>
              <a href={loan.security_logbook} target="_blank" rel="noreferrer" className="text-blue-600 underline font-bold">
                View submitted copy ({loan.security_logbook_no}) ↗
              </a>
            </div>
          )}

          <div className="flex gap-2 pt-1">
            <button
              onClick={uploadLogbook}
              disabled={busy}
              className="flex-1 bg-red-600 hover:bg-red-700 text-white font-black py-2 rounded-lg text-xs shadow disabled:opacity-50"
            >
              {busy ? "Uploading..." : "📤 Submit Vehicle Logbook"}
            </button>
          </div>
        </div>
      )}

      {/* ── CASE 4: PENDING VERIFICATION ── */}
      {canReview && st === "pending_approval" && (
        <div className="bg-white border border-amber-300 rounded-xl p-4 space-y-3">
          <p className="text-xs font-bold text-amber-900">
            A logbook has been submitted for verification:
          </p>
          <div className="text-xs flex justify-between items-center bg-slate-50 p-2.5 rounded-lg border border-slate-200">
            <span>
              <strong>Number:</strong> {loan.security_logbook_no}
            </span>
            {loan.security_logbook && (
              <a href={loan.security_logbook} target="_blank" rel="noreferrer" className="text-blue-600 font-bold underline">
                Open Logbook Document ↗
              </a>
            )}
          </div>
          <div className="flex gap-2 pt-1">
            <button
              onClick={() => handleReviewAction("security-approve")}
              disabled={busy}
              className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white font-black py-2 rounded-lg text-xs shadow disabled:opacity-50"
            >
              ✅ Accept & Hold as Security
            </button>
            <button
              onClick={() => handleReviewAction("security-reject")}
              disabled={busy}
              className="bg-red-50 hover:bg-red-100 border border-red-200 text-red-700 font-bold px-4 py-2 rounded-lg text-xs"
            >
              Reject / Resubmit
            </button>
          </div>
        </div>
      )}
    </div>
  );
}