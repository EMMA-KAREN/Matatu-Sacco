import { useState } from "react";
import { Link } from "react-router-dom";
import API from "../api";

export default function Signup() {
  const [form, setForm] = useState({
    membership_no: "",
    name: "",
    national_id: "",
    phone: "",
    password: "",
    role: ""
  });

  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleChange = (e) => {
    setForm({
      ...form,
      [e.target.name]: e.target.value
    });
  };

  const handleSignup = async (e) => {
    e.preventDefault();

    if (!form.role) {
      alert("Please select a role before signing up.");
      return;
    }

    try {
      setLoading(true);

      const res = await fetch(`${API}/signup`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form)
      });

      const data = await res.json();

      if (res.ok) {
        alert("Signup successful. Wait for HR approval.");
        setForm({
          membership_no: "",
          name: "",
          national_id: "",
          phone: "",
          password: "",
          role: ""
        });
      } else {
        alert(data.error || "Signup failed");
      }
    } catch (err) {
      console.error(err);
      alert("Server error during signup");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100 p-4">
      <form
        onSubmit={handleSignup}
        className="bg-white shadow-xl rounded-2xl p-8 w-full max-w-md space-y-3.5"
      >
        <h2 className="text-2xl font-bold text-center text-green-700">
          Create SACCO Account
        </h2>

        <input
          name="membership_no"
          placeholder="Membership Number"
          value={form.membership_no}
          onChange={handleChange}
          className="w-full border p-2.5 rounded-lg uppercase"
          required
        />

        <input
          name="name"
          placeholder="Full Name"
          value={form.name}
          onChange={handleChange}
          className="w-full border p-2.5 rounded-lg"
          required
        />

        <input
          name="national_id"
          placeholder="National ID"
          value={form.national_id}
          onChange={handleChange}
          className="w-full border p-2.5 rounded-lg"
          required
        />

        <input
          name="phone"
          placeholder="Phone Number"
          value={form.phone}
          onChange={handleChange}
          className="w-full border p-2.5 rounded-lg"
          required
        />

        {/* Password input with Show/Hide Eye Toggle */}
        <div className="relative">
          <input
            type={showPassword ? "text" : "password"}
            name="password"
            placeholder="Password"
            value={form.password}
            onChange={handleChange}
            className="w-full border p-2.5 pr-14 rounded-lg"
            required
          />
          <button
            type="button"
            onClick={() => setShowPassword(!showPassword)}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs font-bold text-gray-500 hover:text-black"
          >
            {showPassword ? "🙈 Hide" : "👁️ View"}
          </button>
        </div>

        <select
          name="role"
          value={form.role}
          onChange={handleChange}
          className="w-full border p-2.5 rounded-lg bg-white"
          required
        >
          <option value="">-- Select Role --</option>
          <option value="owner">Owner</option>
          <option value="driver">Driver</option>
          <option value="conductor">Conductor</option>
          <option value="stage_operator">Main Stage Operator</option>
          <option value="sub_stage_operator">Sub Stage Operator</option>
          <option value="hr">HR</option>
          <option value="director">Director</option>
          <option value="member">Member</option>
        </select>

        <button
          type="submit"
          disabled={loading || !form.role}
          className={`w-full text-white font-bold p-3 rounded-lg ${
            !form.role
              ? "bg-gray-400 cursor-not-allowed"
              : "bg-green-600 hover:bg-green-700"
          }`}
        >
          {loading ? "Creating Account..." : "Sign Up"}
        </button>

        <p className="text-center text-sm">
          Already have an account?{" "}
          <Link to="/login" className="text-green-600 font-semibold hover:underline">
            Login
          </Link>
        </p>
      </form>
    </div>
  );
}