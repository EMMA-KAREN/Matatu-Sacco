import { useState } from "react";
import API from "../api";

const hdr = () => ({ Authorization: `Bearer ${localStorage.getItem("token")}` });
const jsonHdr = () => ({ ...hdr(), "Content-Type": "application/json" });
const inp = "w-full border border-gray-300 rounded-lg p-2.5 text-xs bg-white text-gray-900 font-bold outline-none focus:border-amber-500";

export default function LoanRequirements({ loan, userRole = "member", onDone, notify }) {
  // Document Files
  const [loanFormFile, setLoanFormFile] = useState(null);
  const [insuranceFile, setInsuranceFile] = useState(null);
  const [bankChargesFile, setBankChargesFile] = useState(null);

  // Insurance Payment Inputs
  const [insuranceAmount, setInsuranceAmount] = useState(loan.insurance_amount || "");
  const [insuranceRef, setInsuranceRef] = useState(loan.insurance_ref || "");

  // Bank Charges Payment Inputs
  const [bankChargesAmount, setBankChargesAmount] = useState(loan.bank_charges_amount || "");
  const [bankChargesRef, setBankChargesRef] = useState(loan.bank_charges_ref || "");
  const [bankChargesMethod, setBankChargesMethod] = useState(loan.bank_charges_method || "mpesa");

  // Admin Verification & Cheque Input
  const [chequeNo, setChequeNo] = useState(loan.cheque_no || "");
  const [chequeDate, setChequeDate] = useState(new Date().toISOString().split("T")[0]);
  const [busy, setBusy] = useState(false);

  const isStaff = ["hr", "admin", "director"].includes(userRole);
  const isAdmin = ["admin", "director"].includes(userRole);
  const st = loan.requirements_status || "none";

  // Flexible Visibility Guard: visible when requirements are pending/submitted/verified,
  // or whenever staff (HR/Admin) is viewing a pre-approved or requirements loan
  const shouldShow =
    loan.status === "requirements_pending" ||
    st === "submitted" ||
    st === "verified" ||
    st === "pending" ||
    st === "rejected" ||
    (isStaff && ["hr_approved", "approved", "requirements_pending"].includes(loan.status));

  if (!shouldShow) return null;

  // Submit documents and amounts (Accessible by Member OR HR/Admin)
  const handleSubmitRequirements = async (e) => {
    e.preventDefault();
    if (!loanFormFile && !loan.loan_form_file) {
      return notify?.("Signed physical Loan Form upload is required", "error");
    }
    if (!insuranceAmount || parseFloat(insuranceAmount) <= 0) {
      return notify?.("Please enter the amount paid for Insurance", "error");
    }
    if (!insuranceRef.trim()) {
      return notify?.("Insurance payment reference code is required", "error");
    }
    if (!bankChargesAmount || parseFloat(bankChargesAmount) <= 0) {
      return notify?.("Please enter the amount paid for Bank Charges recovery", "error");
    }
    if (!bankChargesRef.trim()) {
      return notify?.("Bank charges payment reference code is required", "error");
    }

    setBusy(true);
    const fd = new FormData();
    if (loanFormFile) fd.append("loan_form", loanFormFile);
    if (insuranceFile) fd.append("insurance", insuranceFile);
    if (bankChargesFile) fd.append("bank_charges_file", bankChargesFile);

    fd.append("insurance_amount", insuranceAmount);
    fd.append("insurance_ref", insuranceRef.trim().toUpperCase());
    fd.append("bank_charges_amount", bankChargesAmount);
    fd.append("bank_charges_ref", bankChargesRef.trim().toUpperCase());
    fd.append("bank_charges_method", bankChargesMethod);

    const r = await fetch(`${API}/loan-applications/${loan.id}/submit-requirements`, {
      method: "POST",
      headers: hdr(),
      body: fd,
    });
    setBusy(false);

    if (r.ok) {
      notify?.("Loan Form and payment proofs submitted successfully ✓");
      onDone?.();
    } else {
      const d = await r.json().catch(() => ({}));
      notify?.(d.error || "Submission failed", "error");
    }
  };

  // Admin verifies and issues cheque
  const handleVerifyAndIssueCheque = async () => {
    if (!chequeNo.trim()) {
      return notify?.("Cheque Number is required to issue disbursement cheque", "error");
    }

    setBusy(true);
    const r = await fetch(`${API}/loan-applications/${loan.id}/verify-requirements`, {
      method: "PUT",
      headers: jsonHdr(),
      body: JSON.stringify({
        cheque_no: chequeNo.trim().toUpperCase(),
        cheque_date: chequeDate,
      }),
    });
    setBusy(false);

    if (r.ok) {
      notify?.(`Verified! Cheque #${chequeNo} issued and loan marked as disbursed ✓`);
      onDone?.();
    } else {
      const d = await r.json().catch(() => ({}));
      notify?.(d.error || "Verification failed", "error");
    }
  };

  const handleReject = async () => {
    const notes = prompt("Enter reason for rejecting documents or payment details:");
    if (!notes) return;

    setBusy(true);
    const r = await fetch(`${API}/loan-applications/${loan.id}/reject-requirements`, {
      method: "PUT",
      headers: jsonHdr(),
      body: JSON.stringify({ notes }),
    });
    setBusy(false);

    if (r.ok) {
      notify?.("Requirements returned for correction");
      onDone?.();
    } else {
      notify?.("Action failed", "error");
    }
  };

  const DocLink = ({ url, label }) =>
    url ? (
      <a href={url} target="_blank" rel="noreferrer" className="text-blue-600 underline text-xs font-bold mr-4">
        {label} ↗
      </a>
    ) : null;

  return (
    <div className="bg-amber-50 border-2 border-amber-300 rounded-2xl p-5 mb-4 space-y-4">
      {/* Header */}
      <div className="flex justify-between items-start border-b border-amber-200 pb-3">
        <div>
          <h4 className="font-black text-amber-950 text-sm flex items-center gap-1.5">
            📄 Pre-Cheque Requirements & Payment Clearance
          </h4>
          <p className="text-xs text-amber-900 font-semibold mt-0.5">
            Upload the signed Loan Form and record the exact amounts and proof of payment for Insurance & Bank Charges.
          </p>
        </div>
        <span
          className={`text-[11px] px-3 py-1 rounded-full font-black border ${
            st === "verified"
              ? "bg-emerald-100 text-emerald-800 border-emerald-300"
              : st === "submitted"
              ? "bg-blue-100 text-blue-800 border-blue-300"
              : st === "rejected"
              ? "bg-red-100 text-red-800 border-red-300"
              : "bg-amber-100 text-amber-800 border-amber-300"
          }`}
        >
          {st === "verified"
            ? "✅ Cheque Ready / Disbursed"
            : st === "submitted"
            ? "⏳ Awaiting Admin Cheque Issuance"
            : st === "rejected"
            ? "❌ Needs Resubmission"
            : "⚠️ Uploads & Payments Required"}
        </span>
      </div>

      {/* Cheque Ready Banner (Once Verified) */}
      {st === "verified" && loan.cheque_no && (
        <div className="bg-emerald-50 border border-emerald-300 rounded-xl p-4 flex justify-between items-center">
          <div>
            <p className="text-xs text-emerald-700 font-bold uppercase tracking-wider">Disbursement Cheque Ready</p>
            <p className="text-xl font-black text-emerald-950 mt-0.5">Cheque #{loan.cheque_no}</p>
            <p className="text-xs text-emerald-600 font-semibold mt-0.5">
              Issue Date: {loan.cheque_date || "Today"} · Cheque prepared and ready for collection at the office.
            </p>
          </div>
          <span className="text-3xl">🎟️</span>
        </div>
      )}

      {/* ── REQUIREMENTS FORM (Borrower OR HR/Admin can submit) ── */}
      {(st === "pending" || st === "rejected" || (isStaff && st !== "verified")) && (
        <form onSubmit={handleSubmitRequirements} className="bg-white border border-amber-200 rounded-xl p-4 space-y-4">
          <div className="flex justify-between items-center border-b pb-2">
            <h5 className="font-bold text-xs uppercase tracking-wider text-gray-800">
              {isStaff ? "💼 HR / Admin: Record Documents & Payment Proof" : "📤 Member: Upload Documents & Payment Details"}
            </h5>
            {isStaff && (
              <span className="bg-purple-100 text-purple-800 text-[10px] font-black px-2 py-0.5 rounded">
                HR Submission Mode
              </span>
            )}
          </div>

          {st === "rejected" && (
            <div className="bg-red-50 border border-red-200 text-red-700 p-2.5 rounded-lg text-xs font-bold">
              ❌ Reason for return: {loan.requirements_notes}
            </div>
          )}

          {/* 1. Signed Physical Loan Form */}
          <div className="bg-gray-50 border border-gray-200 rounded-xl p-3 space-y-1.5">
            <label className="text-xs font-bold text-gray-800 block">
              1. Signed Physical Loan Form (PDF or Photo) *
            </label>
            <input
              type="file"
              accept=".pdf,image/*"
              onChange={(e) => setLoanFormFile(e.target.files[0])}
              className="text-xs block file:mr-2 file:bg-gray-800 file:text-white file:border-0 file:rounded file:px-2.5 file:py-1 file:font-bold"
            />
            <DocLink url={loan.loan_form_file} label="View currently submitted loan form" />
          </div>

          {/* 2. Insurance Fee Section */}
          <div className="bg-gray-50 border border-gray-200 rounded-xl p-3 space-y-2">
            <label className="text-xs font-bold text-gray-800 block">
              2. Insurance Payment Details & Proof *
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <div>
                <label className="text-[11px] font-bold text-gray-600 block mb-1">Amount Paid (KES) *</label>
                <input
                  type="number"
                  placeholder="e.g. 1000"
                  value={insuranceAmount}
                  onChange={(e) => setInsuranceAmount(e.target.value)}
                  className={inp}
                />
              </div>
              <div>
                <label className="text-[11px] font-bold text-gray-600 block mb-1">Payment Ref Code (M-Pesa / Bank) *</label>
                <input
                  type="text"
                  placeholder="e.g. QHA8921XYZ"
                  value={insuranceRef}
                  onChange={(e) => setInsuranceRef(e.target.value)}
                  className={inp}
                />
              </div>
            </div>
            <div>
              <label className="text-[11px] font-bold text-gray-600 block mb-1">Upload Insurance Payment Proof (Receipt / Slip)</label>
              <input
                type="file"
                accept=".pdf,image/*"
                onChange={(e) => setInsuranceFile(e.target.files[0])}
                className="text-xs block file:mr-2 file:bg-gray-700 file:text-white file:border-0 file:rounded file:px-2.5 file:py-1 file:font-bold"
              />
              <DocLink url={loan.insurance_file} label="View current insurance proof" />
            </div>
          </div>

          {/* 3. Bank Charges Recovery Section */}
          <div className="bg-gray-50 border border-gray-200 rounded-xl p-3 space-y-2">
            <label className="text-xs font-bold text-gray-800 block">
              3. Bank Charges Recovery Details & Proof *
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <div>
                <label className="text-[11px] font-bold text-gray-600 block mb-1">Amount Paid (KES) *</label>
                <input
                  type="number"
                  placeholder="e.g. 500"
                  value={bankChargesAmount}
                  onChange={(e) => setBankChargesAmount(e.target.value)}
                  className={inp}
                />
              </div>
              <div>
                <label className="text-[11px] font-bold text-gray-600 block mb-1">Payment Method *</label>
                <select value={bankChargesMethod} onChange={(e) => setBankChargesMethod(e.target.value)} className={inp}>
                  <option value="mpesa">M-Pesa</option>
                  <option value="cash">Direct Cash</option>
                  <option value="bank">Bank Deposit</option>
                </select>
              </div>
              <div>
                <label className="text-[11px] font-bold text-gray-600 block mb-1">Bank Charges Ref Code *</label>
                <input
                  type="text"
                  placeholder="e.g. QHB3910ABC"
                  value={bankChargesRef}
                  onChange={(e) => setBankChargesRef(e.target.value)}
                  className={inp}
                />
              </div>
            </div>
            <div>
              <label className="text-[11px] font-bold text-gray-600 block mb-1">Upload Bank Charges Payment Proof (Receipt / Slip)</label>
              <input
                type="file"
                accept=".pdf,image/*"
                onChange={(e) => setBankChargesFile(e.target.files[0])}
                className="text-xs block file:mr-2 file:bg-gray-700 file:text-white file:border-0 file:rounded file:px-2.5 file:py-1 file:font-bold"
              />
              <DocLink url={loan.bank_charges_file} label="View current bank charges proof" />
            </div>
          </div>

          <button
            type="submit"
            disabled={busy}
            className="w-full bg-amber-600 hover:bg-amber-700 text-white font-black py-2.5 rounded-lg text-xs shadow disabled:opacity-50"
          >
            {busy ? "Saving and Submitting..." : "📨 Submit Requirements & Payment Proofs"}
          </button>
        </form>
      )}

      {/* ── ADMIN CHEQUE ISSUANCE & VERIFICATION DESK ── */}
      {isAdmin && st === "submitted" && (
        <div className="bg-white border border-blue-200 rounded-xl p-4 space-y-3">
          <h5 className="font-black text-gray-800 text-xs uppercase tracking-wider">
            Review Submitted Member Requirements
          </h5>

          <div className="space-y-1.5 text-xs text-gray-700 bg-gray-50 p-3 rounded-lg border border-gray-200">
            <div className="flex justify-between py-1 border-b border-gray-200">
              <span className="font-bold">Signed Loan Form:</span>
              <DocLink url={loan.loan_form_file} label="Open Uploaded Form" />
            </div>
            <div className="flex justify-between py-1 border-b border-gray-200">
              <span className="font-bold">Insurance Paid:</span>
              <span className="font-mono font-bold text-emerald-700">
                KES {loan.insurance_amount?.toLocaleString()} (Ref: {loan.insurance_ref || "None"})
              </span>
            </div>
            {loan.insurance_file && (
              <div className="flex justify-between py-1 border-b border-gray-200">
                <span className="font-bold">Insurance Payment Proof:</span>
                <DocLink url={loan.insurance_file} label="Open Insurance Slip" />
              </div>
            )}
            <div className="flex justify-between py-1 border-b border-gray-200">
              <span className="font-bold">Bank Charges Paid:</span>
              <span className="font-mono font-bold text-emerald-700">
                KES {loan.bank_charges_amount?.toLocaleString()} ({loan.bank_charges_method?.toUpperCase()} Ref: {loan.bank_charges_ref || "None"})
              </span>
            </div>
            {loan.bank_charges_file && (
              <div className="flex justify-between py-1">
                <span className="font-bold">Bank Charges Proof:</span>
                <DocLink url={loan.bank_charges_file} label="Open Bank Slip" />
              </div>
            )}
          </div>

          {/* Cheque Issuance Form */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
            <div>
              <label className="text-xs font-bold text-gray-700 block mb-1">Enter Cheque Number *</label>
              <input
                placeholder="e.g. CHQ-89012"
                value={chequeNo}
                onChange={(e) => setChequeNo(e.target.value)}
                className={inp}
              />
            </div>
            <div>
              <label className="text-xs font-bold text-gray-700 block mb-1">Cheque Issue Date</label>
              <input
                type="date"
                value={chequeDate}
                onChange={(e) => setChequeDate(e.target.value)}
                className={inp}
              />
            </div>
          </div>

          <div className="flex gap-2 pt-1">
            <button
              onClick={handleVerifyAndIssueCheque}
              disabled={busy}
              className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white font-black py-2.5 rounded-lg text-xs shadow disabled:opacity-50"
            >
              {busy ? "Processing..." : "✅ Confirm Payments, Issue Cheque & Disburse"}
            </button>
            <button
              onClick={handleReject}
              disabled={busy}
              className="bg-red-50 hover:bg-red-100 border border-red-200 text-red-700 font-bold px-4 py-2.5 rounded-lg text-xs"
            >
              Reject / Return
            </button>
          </div>
        </div>
      )}

      {!isAdmin && st === "submitted" && (
        <div className="bg-blue-50 border border-blue-200 text-blue-900 rounded-xl p-3 text-xs font-bold text-center">
          ⏳ Requirements and payment proofs have been recorded. Awaiting Admin to issue the cheque.
        </div>
      )}
    </div>
  );
}