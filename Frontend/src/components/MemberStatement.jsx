import { useEffect, useState } from "react";
import API from "../api";


export default function MemberStatement({ memberId, onClose }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [filterCategory, setFilterCategory] = useState("all");
  const [search, setSearch] = useState("");

  const token = localStorage.getItem("token");
  const headers = { Authorization: `Bearer ${token}` };

  useEffect(() => {
    fetchStatement();
  }, [memberId]);

  const fetchStatement = async () => {
    setLoading(true);
    const res = await fetch(`${API}/members/${memberId}/statement`, { headers });
    if (res.ok) {
      setData(await res.json());
    }
    setLoading(false);
  };

  const filteredStatement = (data?.statement || []).filter(item => {
    const matchesCategory = filterCategory === "all" || item.category === filterCategory;
    const matchesSearch =
      (item.type || "").toLowerCase().includes(search.toLowerCase()) ||
      (item.reference || "").toLowerCase().includes(search.toLowerCase()) ||
      (item.method || "").toLowerCase().includes(search.toLowerCase());
    return matchesCategory && matchesSearch;
  });

  return (
    <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden">
        
        {/* HEADER */}
        <div className="p-6 bg-slate-900 text-white flex justify-between items-center">
          <div>
            <h2 className="text-xl font-black">💳 Financial Statement & Payment History</h2>
            <p className="text-xs text-slate-300 mt-1">
              Member: <span className="font-bold text-emerald-400">{data?.member?.name || "Loading..."}</span> ({data?.member?.membership_no})
            </p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white text-2xl font-bold">✕</button>
        </div>

        <div className="p-6 overflow-y-auto space-y-6 flex-1 bg-gray-50">
          {loading ? (
            <div className="text-center py-12 text-gray-500 font-bold">Loading member payment records...</div>
          ) : (
            <>
              {/* SUMMARY STATS */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
                  <p className="text-xs text-gray-500 font-bold uppercase">Total Savings</p>
                  <p className="text-lg font-black text-emerald-600 mt-1">KES {data?.totals?.total_savings?.toLocaleString() || 0}</p>
                </div>
                <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
                  <p className="text-xs text-gray-500 font-bold uppercase">Sacco Contributions</p>
                  <p className="text-lg font-black text-blue-600 mt-1">KES {data?.totals?.sacco_contributions?.toLocaleString() || 0}</p>
                </div>
                <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
                  <p className="text-xs text-gray-500 font-bold uppercase">Loan Repayments</p>
                  <p className="text-lg font-black text-purple-600 mt-1">KES {data?.totals?.loan_repayments?.toLocaleString() || 0}</p>
                </div>
                <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
                  <p className="text-xs text-gray-500 font-bold uppercase">Repayment Top-Ups</p>
                  <p className="text-lg font-black text-amber-600 mt-1">KES {data?.totals?.repayment_account_deposits?.toLocaleString() || 0}</p>
                </div>
              </div>

              {/* FILTERS & SEARCH */}
              <div className="flex gap-3 flex-wrap items-center justify-between">
                <input
                  type="text"
                  placeholder="Search by ref, method, or note..."
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  className="border border-gray-300 rounded-lg p-2.5 text-sm bg-white text-gray-900 font-medium focus:border-blue-500 outline-none flex-1 min-w-[200px]"
                />
                <select
                  value={filterCategory}
                  onChange={e => setFilterCategory(e.target.value)}
                  className="border border-gray-300 rounded-lg p-2.5 text-sm bg-white text-gray-900 font-bold focus:border-blue-500 outline-none"
                >
                  <option value="all">All Categories</option>
                  <option value="Sacco Contribution">Sacco Contributions</option>
                  <option value="Savings">Savings</option>
                  <option value="Loan Repayment">Loan Repayments</option>
                  <option value="Repayment Account">Repayment Account Top-ups</option>
                </select>
              </div>

              {/* STATEMENT TABLE */}
              <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
                <table className="w-full text-sm">
                  <thead className="bg-slate-800 text-white font-bold text-xs uppercase">
                    <tr>
                      <th className="p-3 text-left">Date</th>
                      <th className="p-3 text-left">Category</th>
                      <th className="p-3 text-left">Type / Details</th>
                      <th className="p-3 text-left">Method & Reference</th>
                      <th className="p-3 text-left">Status</th>
                      <th className="p-3 text-right">Amount</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 font-medium text-gray-900">
                    {filteredStatement.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="p-8 text-center text-gray-400">No payment records found</td>
                      </tr>
                    ) : (
                      filteredStatement.map(item => (
                        <tr key={item.id} className="hover:bg-slate-50 transition-colors">
                          <td className="p-3 text-xs text-gray-600 font-bold whitespace-nowrap">{item.date}</td>
                          <td className="p-3">
                            <span className="text-xs bg-slate-100 text-slate-700 px-2.5 py-1 rounded-full font-black border border-slate-200">
                              {item.category}
                            </span>
                          </td>
                          <td className="p-3 font-bold text-gray-800">{item.type}</td>
                          <td className="p-3 text-xs text-gray-600">
                            <span className="font-bold">{item.method}</span>
                            {item.reference && <span className="text-blue-600 font-bold block">Ref: {item.reference}</span>}
                          </td>
                          <td className="p-3">
                            <span className={`text-[11px] font-black px-2.5 py-0.5 rounded-full ${
                              item.status === "approved" ? "bg-green-100 text-green-700 border border-green-200" :
                              item.status === "rejected" ? "bg-red-100 text-red-700 border border-red-200" :
                              "bg-amber-100 text-amber-800 border border-amber-200"
                            }`}>
                              {item.status === "approved" ? "✅ Confirmed" :
                               item.status === "rejected" ? "❌ Rejected" : "⏳ Pending Approval"}
                            </span>
                          </td>
                          <td className={`p-3 text-right font-black text-sm whitespace-nowrap ${
                            item.amount >= 0 ? "text-emerald-600" : "text-red-600"
                          }`}>
                            {item.amount >= 0 ? "+" : ""}KES {Math.abs(item.amount)?.toLocaleString()}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}