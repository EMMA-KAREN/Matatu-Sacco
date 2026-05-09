import { useState } from "react";


export default function Activate() {
  const [form, setForm] = useState({
    membership_no: "",
    national_id: "",
    password: ""
  });

  const handleActivate = async (e) => {
    e.preventDefault();

    try {
      await api.post("/activate", form);
      alert("Account activated! You can now login");
    } catch (err) {
      alert(err.response?.data?.error);
    }
  };

  return (
    <div className="h-screen flex items-center justify-center bg-gray-100">
      <form onSubmit={handleActivate} className="bg-white p-6 w-96 shadow rounded">
        <h2 className="text-xl font-bold mb-4">Activate Account</h2>

        <input
          placeholder="Membership No"
          className="w-full border p-2 mb-2"
          onChange={(e) => setForm({ ...form, membership_no: e.target.value })}
        />

        <input
          placeholder="National ID"
          className="w-full border p-2 mb-2"
          onChange={(e) => setForm({ ...form, national_id: e.target.value })}
        />

        <input
          type="password"
          placeholder="New Password"
          className="w-full border p-2 mb-3"
          onChange={(e) => setForm({ ...form, password: e.target.value })}
        />

        <button className="w-full bg-blue-600 text-white p-2">
          Activate
        </button>
      </form>
    </div>
  );
}
