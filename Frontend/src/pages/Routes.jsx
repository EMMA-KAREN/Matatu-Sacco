import { useState, useEffect } from "react";
import API from "../api";

export default function Routes() {
  const [routes, setRoutes] = useState([]);
  const [form, setForm] = useState({ from_stage: "", to_stage: "", shimo_fee: "" });
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState({});
  const [search, setSearch] = useState("");
  const [toast, setToast] = useState(null);

  const showToast = (msg, type = "success") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  };

  // ================= FETCH =================
  const fetchRoutes = async () => {
    const res = await fetch(`${API}/routes`);
    const data = await res.json();
    setRoutes(data);
  };

  useEffect(() => {
    fetchRoutes();
  }, []);

  // ================= CREATE =================
  const createRoute = async () => {
    if (!form.from_stage || !form.to_stage || !form.shimo_fee) {
      return showToast("All fields are required", "error");
    }

    const token = localStorage.getItem("token");

    const res = await fetch(`${API}/routes`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({
        from_stage: form.from_stage.trim(),
        to_stage: form.to_stage.trim(),
        shimo_fee: parseFloat(form.shimo_fee)
      })
    });

    const data = await res.json();

    if (!res.ok) return showToast(data.error || "Failed to create route", "error");

    showToast("Route created successfully");
    setForm({ from_stage: "", to_stage: "", shimo_fee: "" });
    fetchRoutes();
  };

  // ================= UPDATE =================
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
        shimo_fee: parseFloat(editForm.shimo_fee)
      })
    });

    if (!res.ok) return showToast("Update failed", "error");

    showToast("Route updated");
    setEditingId(null);
    fetchRoutes();
  };

  // ================= DEACTIVATE =================
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

  // ================= FILTER =================
  const filtered = routes.filter(r =>
    r.from_stage.toLowerCase().includes(search.toLowerCase()) ||
    r.to_stage.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="p-6 bg-gray-50 min-h-screen">

      {/* TOAST */}
      {toast && (
        <div className={`fixed top-4 right-4 z-50 px-4 py-2 rounded shadow text-white text-sm ${
          toast.type === "error" ? "bg-red-600" : "bg-green-600"
        }`}>
          {toast.msg}
        </div>
      )}

      <h2 className="text-2xl font-bold mb-6 text-gray-800">Route Management</h2>

      {/* ================= ADD ROUTE FORM ================= */}
      <div className="bg-white border rounded p-4 mb-6 shadow-sm">
        <h3 className="font-semibold text-gray-700 mb-3">Add New Route</h3>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div>
            <label className="text-sm text-gray-600 mb-1 block">From Stage</label>
            <input
              placeholder="e.g. Shimo la Tewa"
              value={form.from_stage}
              onChange={(e) => setForm({ ...form, from_stage: e.target.value })}
              className="border p-2 w-full rounded"
            />
          </div>

          <div>
            <label className="text-sm text-gray-600 mb-1 block">To Stage</label>
            <input
              placeholder="e.g. Mombasa Town"
              value={form.to_stage}
              onChange={(e) => setForm({ ...form, to_stage: e.target.value })}
              className="border p-2 w-full rounded"
            />
          </div>

          <div>
            <label className="text-sm text-gray-600 mb-1 block">Shimo Fee (KES)</label>
            <input
              type="number"
              placeholder="e.g. 50"
              value={form.shimo_fee}
              onChange={(e) => setForm({ ...form, shimo_fee: e.target.value })}
              className="border p-2 w-full rounded"
            />
          </div>
        </div>

        <button
          onClick={createRoute}
          className="mt-3 bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700"
        >
          + Add Route
        </button>
      </div>

      {/* ================= SEARCH ================= */}
      <input
        placeholder="Search by stage name..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="border p-2 mb-4 w-full rounded"
      />

      {/* ================= ROUTES TABLE ================= */}
      <div className="bg-white border rounded shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-800 text-white">
            <tr>
              <th className="p-3 text-left">Route ID</th>
              <th className="p-3 text-left">From Stage</th>
              <th className="p-3 text-left">To Stage</th>
              <th className="p-3 text-left">Shimo Fee (KES)</th>
              <th className="p-3 text-left">Actions</th>
            </tr>
          </thead>

          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={5} className="p-4 text-center text-gray-500">
                  No routes found
                </td>
              </tr>
            ) : (
              filtered.map((route) => (
                <tr key={route.id} className="border-b hover:bg-gray-50">

                  {editingId === route.id ? (
                    <>
                      <td className="p-3 text-gray-400">#{route.id}</td>

                      <td className="p-3">
                        <input
                          value={editForm.from_stage}
                          onChange={(e) => setEditForm({ ...editForm, from_stage: e.target.value })}
                          className="border p-1 w-full rounded"
                        />
                      </td>

                      <td className="p-3">
                        <input
                          value={editForm.to_stage}
                          onChange={(e) => setEditForm({ ...editForm, to_stage: e.target.value })}
                          className="border p-1 w-full rounded"
                        />
                      </td>

                      <td className="p-3">
                        <input
                          type="number"
                          value={editForm.shimo_fee}
                          onChange={(e) => setEditForm({ ...editForm, shimo_fee: e.target.value })}
                          className="border p-1 w-full rounded"
                        />
                      </td>

                      <td className="p-3 flex gap-2">
                        <button
                          onClick={() => saveEdit(route.id)}
                          className="bg-green-600 text-white px-2 py-1 rounded text-xs"
                        >
                          Save
                        </button>
                        <button
                          onClick={() => setEditingId(null)}
                          className="bg-gray-500 text-white px-2 py-1 rounded text-xs"
                        >
                          Cancel
                        </button>
                      </td>
                    </>
                  ) : (
                    <>
                      <td className="p-3 text-gray-500">#{route.id}</td>
                      <td className="p-3 font-medium">{route.from_stage}</td>
                      <td className="p-3 font-medium">{route.to_stage}</td>
                      <td className="p-3 text-green-700 font-semibold">KES {route.shimo_fee}</td>
                      <td className="p-3 flex gap-2">
                        <button
                          onClick={() => {
                            setEditingId(route.id);
                            setEditForm({
                              from_stage: route.from_stage,
                              to_stage: route.to_stage,
                              shimo_fee: route.shimo_fee
                            });
                          }}
                          className="bg-yellow-500 text-white px-2 py-1 rounded text-xs"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => deactivateRoute(route.id)}
                          className="bg-red-600 text-white px-2 py-1 rounded text-xs"
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

        {/* SUMMARY */}
        <div className="p-3 bg-gray-50 border-t text-sm text-gray-600">
          Total active routes: <span className="font-semibold">{filtered.length}</span>
        </div>
      </div>
    </div>
  );
}