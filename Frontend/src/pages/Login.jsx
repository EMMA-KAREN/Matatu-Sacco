import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import API from "../api";
import { useAuth } from "../context/AuthContext";

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();

  const [membershipNo, setMembershipNo] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e) => {
    e.preventDefault();

    try {
      setLoading(true);

      const res = await fetch(`${API}/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          membership_no: membershipNo,
          password
        })
      });

      const data = await res.json();

      if (res.ok) {
        login(data.member, data.token);

        // 👇 Navigate based on role
        const role = data.member.role;

        if (role === "hr") {
          navigate("/hr");
        } else if (role === "stage_operator") {
          navigate("/stage-operator");
        } else if (role === "director") {
          navigate("/director");
        } else if (role === "owner") {
          navigate("/owner");
        } else if (role === "driver") {
          navigate("/driver");
        } else if (role === "conductor") {
          navigate("/conductor");
        }else {
          navigate("/dashboard");
        }

      } else {
        alert(data.error || "Login failed");
      }
    } catch (err) {
      console.error(err);
      alert("Server error during login");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100">
      <form
        onSubmit={handleLogin}
        className="bg-white shadow-lg rounded-xl p-8 w-full max-w-md space-y-4"
      >
        <h2 className="text-2xl font-bold text-center text-green-700">
          SACCO Login
        </h2>

        <input
          type="text"
          placeholder="Membership Number"
          value={membershipNo}
          onChange={(e) => setMembershipNo(e.target.value)}
          className="w-full border p-3 rounded"
          required
        />

        <input
          type="password"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full border p-3 rounded"
          required
        />

        <button
          type="submit"
          disabled={loading}
          className="w-full bg-green-600 text-white p-3 rounded hover:bg-green-700"
        >
          {loading ? "Logging in..." : "Login"}
        </button>

        <p className="text-center text-sm">
          Don't have an account?{" "}
          <Link to="/signup" className="text-green-600 font-semibold">
            Sign Up
          </Link>
        </p>
      </form>
    </div>
  );
}