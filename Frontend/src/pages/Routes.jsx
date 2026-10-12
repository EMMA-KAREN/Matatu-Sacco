import { useState, useEffect } from "react";
import API from "../api";

export default function Routes() {
  const [routes, setRoutes] = useState([]);
  const [form, setForm] = useState({ 
    from_stage: "", 
    to_stage: "", 
    stage_type: "main", // "main" or "sub_branch"
    shimo_fee: "", 
    subsequent_fee: "100" 
  });
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState({});
  const [search, setSearch] = useState("");
  const [toast, setToast] = useState(null);

  const showToast = (msg, type = "success") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  };

  const fetchRoutes = async () => {
    const res = await fetch(`${API}/routes`);
    const data = await res.json();
    setRoutes(Array.isArray(data) ? data : []);
  };

  useEffect(() => {
    fetchRoutes();
  }, []);

  const createRoute = async () => {
    if (!form.from_stage || !form.to_stage || !form.shimo_fee) {
      return showToast("All route fields are required", "error");
    }

    const token = localStorage.getItem("token");

    const payload = {
      from_stage: form.from_stage.trim(),
      to_stage: form.to_stage.trim(),
      stage_type: form.stage_type,
      shimo_fee: parseFloat(form.shimo_fee),
      subsequent_fee: form.stage_type === "sub_branch" ? parseFloat(form.shimo_fee) : parseFloat(form.subsequent_fee || 100)
    };

    const res = await fetch(`${API}/routes`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify(payload)
    });

    const data = await res.json();
    if (!res.ok) return showToast(data.error || "Failed to create route", "error");

    showToast(`Route created successfully for ${form.stage_type === "sub_branch" ? "Sub-Branch Stage" : "Main Stage"}`);
    setForm({ from_stage: "", to_stage: "", stage_type: "main", shimo_fee: "", subsequent_fee: "100" });
    fetchRoutes();
  };

  const saveEdit = async (id) => {
    const token = localStorage.getItem("token");

    const res = await fetch(`${API}/routes/${id}`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({
        from_stage: editForm.from_stage,
        to_stage: editForm.to_stage,
        stage_type: editForm.stage_type || "main",
        shimo_fee: parseFloat(editForm.shimo_fee),
        subsequent_fee: parseFloat(editForm.subsequent_fee || editForm.shimo_fee)
      })
    });

    if (!res.ok) return showToast("Update failed", "error");

    showToast("Route updated ✓");
    setEditingId(null);
    fetchRoutes();
  };

  const deactivateRoute = async (id) => {
    if (!window.confirm("Deactivate this route?")) return;
    const token = localStorage.getItem("token");

    const res = await fetch(`${API}/routes/${id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` }
    });

    if (!res.ok) return showToast("Failed to deactivate", "error");
    showToast("Route deactivated");
    fetchRoutes();
  };

  const filtered = routes.filter(r =>
    r.from_stage?.toLowerCase().includes(search.toLowerCase()) ||
    r.to_stage?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="p-6 bg-gray-50 min-h-screen">
      {toast && (
        <div className={`fixed top-4 right-4 z-50 px-4 py-2 rounded shadow text-white text-sm font-bold ${
          toast.type === "error" ? "bg-red-600" : "bg-green-600"
        }`}>
          {toast.msg}
        </div>
      )}

      <h2 className="text-2xl font-black mb-6 text-gray-800">🗺️ Route & Shimo Fee Configuration</h2>

      {/* ══ ADD ROUTE FORM ══ */}
      <div className="bg-white border border-gray-200 rounded-xl p-5 mb-6 shadow-sm">
        <h3 className="font-bold text-gray-700 mb-3 text-sm">Add New Route</h3>

        <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
          <div>
            <label className="text-xs font-bold text-gray-600 mb-1 block">Stage Category</label>
            <select
              value={form.stage_type}
              onChange={(e) => setForm({ ...form, stage_type: e.target.value })}
              className="border border-gray-300 p-2.5 w-full rounded-lg text-sm bg-white text-gray-800 font-bold"
            >
              <option value="main">Main Stage (1st + 2nd Trip Rates)</option>
              <option value="sub_branch">Sub-Branch (Single Fixed Fee)</option>
            </select>
          </div>

          <div>
            <label className="text-xs font-bold text-gray-600 mb-1 block">From Stage</label>
            <input
              placeholder="e.g. Shimo la Tewa"
              value={form.from_stage}
              onChange={(e) => setForm({ ...form, from_stage: e.target.value })}
              className="border border-gray-300 p-2.5 w-full rounded-lg text-sm bg-white text-gray-800"
            />
          </div>

          <div>
            <label className="text-xs font-bold text-gray-600 mb-1 block">To Stage</label>
            <input
              placeholder="e.g. Mombasa Town"
              value={form.to_stage}
              onChange={(e) => setForm({ ...form, to_stage: e.target.value })}
              className="border border-gray-300 p-2.5 w-full rounded-lg text-sm bg-white text-gray-800"
            />
          </div>

          <div>
            <label className="text-xs font-bold text-gray-600 mb-1 block">
              {form.stage_type === "sub_branch" ? "Sub-Stage Fee (KES)" : "1st Trip Fee (KES)"}
            </label>
            <input
              type="number"
              placeholder="e.g. 100 or 200"
              value={form.shimo_fee}
              onChange={(e) => setForm({ ...form, shimo_fee: e.target.value })}
              className="border border-gray-300 p-2.5 w-full rounded-lg text-sm font-bold text-blue-700 bg-white"
            />
          </div>

          {form.stage_type === "main" && (
            <div>
              <label className="text-xs font-bold text-gray-600 mb-1 block">2nd+ Trip Fee (KES)</label>
              <input
                type="number"
                placeholder="e.g. 100"
                value={form.subsequent_fee}
                onChange={(e) => setForm({ ...form, subsequent_fee: e.target.value })}
                className="border border-gray-300 p-2.5 w-full rounded-lg text-sm font-bold text-purple-700 bg-white"
              />
            </div>
          )}
        </div>

        <button
          onClick={createRoute}
          className="mt-4 bg-blue-600 text-white font-bold px-5 py-2.5 rounded-lg hover:bg-blue-700 text-sm shadow"
        >
          + Add Route
        </button>
      </div>

      {/* ══ SEARCH ══ */}
      <input
        placeholder="Search by stage name..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="border border-gray-300 p-2.5 mb-4 w-full rounded-lg text-sm bg-white text-gray-800"
      />

      {/* ══ ROUTES TABLE ══ */}
      <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-800 text-white">
            <tr>
              <th className="p-3 text-left">Route ID</th>
              <th className="p-3 text-left">Stage Type</th>
              <th className="p-3 text-left">From Stage</th>
              <th className="p-3 text-left">To Stage</th>
              <th className="p-3 text-left">1st Trip / Sub Fee</th>
              <th className="p-3 text-left">2nd+ Trip Fee</th>
              <th className="p-3 text-left">Actions</th>
            </tr>
          </thead>

          <tbody>
            {filtered.length === 0 ? (
              <tr><td colSpan={7} className="p-4 text-center text-gray-500">No routes found</td></tr>
            ) : (
              filtered.map((route) => (
                <tr key={route.id} className="border-b hover:bg-gray-50">
                  {editingId === route.id ? (
                    <>
                      <td className="p-3 text-gray-400 font-mono">#{route.id}</td>
                      <td className="p-3">
                        <select
                          value={editForm.stage_type || "main"}
                          onChange={(e) => setEditForm({ ...editForm, stage_type: e.target.value })}
                          className="border p-1.5 rounded text-xs bg-white text-gray-800 font-bold"
                        >
                          <option value="main">Main Stage</option>
                          <option value="sub_branch">Sub-Branch</option>
                        </select>
                      </td>
                      <td className="p-3">
                        <input
                          value={editForm.from_stage}
                          onChange={(e) => setEditForm({ ...editForm, from_stage: e.target.value })}
                          className="border p-1.5 w-full rounded text-sm bg-white text-gray-800"
                        />
                      </td>
                      <td className="p-3">
                        <input
                          value={editForm.to_stage}
                          onChange={(e) => setEditForm({ ...editForm, to_stage: e.target.value })}
                          className="border p-1.5 w-full rounded text-sm bg-white text-gray-800"
                        />
                      </td>
                      <td className="p-3">
                        <input
                          type="number"
                          value={editForm.shimo_fee}
                          onChange={(e) => setEditForm({ ...editForm, shimo_fee: e.target.value })}
                          className="border p-1.5 w-full rounded text-sm font-bold text-blue-700 bg-white"
                        />
                      </td>
                      <td className="p-3">
                        <input
                          type="number"
                          value={editForm.subsequent_fee}
                          onChange={(e) => setEditForm({ ...editForm, subsequent_fee: e.target.value })}
                          className="border p-1.5 w-full rounded text-sm font-bold text-purple-700 bg-white"
                        />
                      </td>
                      <td className="p-3 flex gap-2">
                        <button onClick={() => saveEdit(route.id)} className="bg-green-600 text-white px-3 py-1 rounded text-xs font-bold">Save</button>
                        <button onClick={() => setEditingId(null)} className="bg-gray-500 text-white px-3 py-1 rounded text-xs font-bold">Cancel</button>
                      </td>
                    </>
                  ) : (
                    <>
                      <td className="p-3 text-gray-500 font-mono">#{route.id}</td>
                      <td className="p-3">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${route.stage_type === "sub_branch" ? "bg-purple-100 text-purple-800" : "bg-blue-100 text-blue-800"}`}>
                          {route.stage_type === "sub_branch" ? "Sub-Branch" : "Main Stage"}
                        </span>
                      </td>
                      <td className="p-3 font-semibold text-gray-900">{route.from_stage}</td>
                      <td className="p-3 font-semibold text-gray-900">{route.to_stage}</td>
                      <td className="p-3 text-blue-700 font-bold">KES {route.shimo_fee}</td>
                      <td className="p-3 text-purple-700 font-bold">
                        {route.stage_type === "sub_branch" ? "— (Fixed)" : `KES ${route.subsequent_fee || 100}`}
                      </td>
                      <td className="p-3 flex gap-2">
                        <button
                          onClick={() => {
                            setEditingId(route.id);
                            setEditForm({
                              from_stage: route.from_stage,
                              to_stage: route.to_stage,
                              stage_type: route.stage_type || "main",
                              shimo_fee: route.shimo_fee,
                              subsequent_fee: route.subsequent_fee || 100
                            });
                          }}
                          className="bg-yellow-500 hover:bg-yellow-600 text-white px-2.5 py-1 rounded text-xs font-bold"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => deactivateRoute(route.id)}
                          className="bg-red-600 hover:bg-red-700 text-white px-2.5 py-1 rounded text-xs font-bold"
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

        <div className="p-3 bg-gray-50 border-t text-xs text-gray-600 font-medium">
          Total active routes: <span className="font-bold text-gray-800">{filtered.length}</span>
        </div>
      </div>
    </div>
  );
}