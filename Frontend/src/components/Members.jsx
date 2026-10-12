import { useState } from "react";

export default function Members() {
  const [form, setForm] = useState({
    membership_no: "",
    name: "",
    national_id: "",
    phone: "",
    age: "",
    role: "member",
    share_capital: "",
    entrance_fee: ""
  });

  const handleChange = (e) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    const res = await fetch("https://saccoflow360.top/members", {
    
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        ...form,
        age: Number(form.age),
        share_capital: Number(form.share_capital),
        entrance_fee: Number(form.entrance_fee)
      })
    });

    const data = await res.json();

    if (res.ok) {
      alert("✅ Member Registered");
    } else {
      alert(data.error);
    }
  };

  return (
    <div className="p-6">
      <h2 className="text-2xl font-bold mb-4">Register Member</h2>

      <form onSubmit={handleSubmit} className="grid grid-cols-2 gap-4">

        <input name="membership_no" placeholder="Membership No" onChange={handleChange} className="border p-2" required />
        <input name="name" placeholder="Full Name" onChange={handleChange} className="border p-2" required />
        <input name="national_id" placeholder="National ID" onChange={handleChange} className="border p-2" required />
        <input name="phone" placeholder="Phone" onChange={handleChange} className="border p-2" />

        <input name="age" type="number" placeholder="Age" onChange={handleChange} className="border p-2" required />

        <select name="role" onChange={handleChange} className="border p-2">
          <option>owner</option>
          <option>driver</option>
          <option>conductor</option>
          <option>stage_operator</option>
          <option>hr</option>
          <option>director</option>
          <option>member</option>
        </select>

        <input name="share_capital" type="number" placeholder="Share Capital" onChange={handleChange} className="border p-2" />
        <input name="entrance_fee" type="number" placeholder="Entrance Fee" onChange={handleChange} className="border p-2" />

        <button className="col-span-2 bg-green-600 text-white p-2">
          Register
        </button>
      </form>
    </div>
  );
}