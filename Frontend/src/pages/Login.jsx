import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import API from "../api";
import { useAuth } from "../context/AuthContext";

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();

  const [membershipNo, setMembershipNo] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  // Forgot password modal state
  const [showForgotModal, setShowForgotModal] = useState(false);
  const [forgotForm, setForgotForm] = useState({
    membership_no: "",
    national_id: "",
    new_password: ""
  });
  const [showForgotPwd, setShowForgotPwd] = useState(false);
  const [resetLoading, setResetLoading] = useState(false);
  const [modalMsg, setModalMsg] = useState({ text: "", isError: false });

  const handleLogin = async (e) => {
    e.preventDefault();
    try {
      setLoading(true);
      const res = await fetch(`${API}/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          membership_no: membershipNo.trim().toUpperCase(),
          password
        })
      });

      const data = await res.json();
      if (res.ok) {
        login(data.member, data.token);

        const role = data.member.role;
        if (role === "hr") navigate("/hr");
        else if (role === "stage_operator") navigate("/stage-operator");
        else if (role === "sub_stage_operator") navigate("/sub-stage-operator");
        else if (role === "admin") navigate("/admindashboard");
        else if (role === "owner") navigate("/owner");
        else if (role === "driver") navigate("/driver");
        else if (role === "conductor") navigate("/conductor");
        else if (role === "member") navigate("/member");
        else navigate("/dashboard");
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

  const handleResetPassword = async (e) => {
    e.preventDefault();
    setModalMsg({ text: "", isError: false });
    try {
      setResetLoading(true);
      const res = await fetch(`${API}/reset-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(forgotForm)
      });
      const data = await res.json();
      if (res.ok) {
        setModalMsg({ text: data.message, isError: false });
        setTimeout(() => {
          setShowForgotModal(false);
          setForgotForm({ membership_no: "", national_id: "", new_password: "" });
          setModalMsg({ text: "", isError: false });
        }, 2500);
      } else {
        setModalMsg({ text: data.error || "Failed to reset password", isError: true });
      }
    } catch (err) {
      setModalMsg({ text: "Server connection error", isError: true });
    } finally {
      setResetLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100 p-4">
      <form
        onSubmit={handleLogin}
        className="bg-white shadow-xl rounded-2xl p-8 w-full max-w-md space-y-4"
      >
        <h2 className="text-2xl font-black text-center text-green-700">
          SACCO Login
        </h2>

        <div>
          <label className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-1 block">
            Membership Number
          </label>
          <input
            type="text"
            placeholder="e.g. SACCO001"
            value={membershipNo}
            onChange={(e) => setMembershipNo(e.target.value)}
            className="w-full border p-3 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 uppercase"
            required
          />
        </div>

        <div>
          <div className="flex justify-between items-center mb-1">
            <label className="text-xs font-bold text-gray-500 uppercase tracking-wider">
              Password
            </label>
            <button
              type="button"
              onClick={() => setShowForgotModal(true)}
              className="text-xs text-green-600 hover:underline font-bold"
            >
              Forgot Password?
            </button>
          </div>
          <div className="relative">
            <input
              type={showPassword ? "text" : "password"}
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full border p-3 pr-12 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
              required
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-800 text-sm font-semibold"
              title={showPassword ? "Hide password" : "Show password"}
            >
              {showPassword ? "🙈 Hide" : "👁️ View"}
            </button>
          </div>
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full bg-green-600 text-white font-bold p-3 rounded-lg hover:bg-green-700 transition"
        >
          {loading ? "Logging in..." : "Login"}
        </button>

        <p className="text-center text-sm text-gray-600">
          Don't have an account?{" "}
          <Link to="/signup" className="text-green-600 font-bold hover:underline">
            Sign Up
          </Link>
        </p>
      </form>

      {/* Forgot Password Modal */}
      {showForgotModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 space-y-4">
            <div className="flex justify-between items-center border-b pb-3">
              <h3 className="text-lg font-bold text-gray-800">🔑 Reset Your Password</h3>
              <button
                onClick={() => setShowForgotModal(false)}
                className="text-gray-400 hover:text-gray-700 font-bold text-xl"
              >
                ✕
              </button>
            </div>

            {modalMsg.text && (
              <div
                className={`p-3 rounded-lg text-xs font-bold ${
                  modalMsg.isError ? "bg-red-100 text-red-700" : "bg-green-100 text-green-700"
                }`}
              >
                {modalMsg.text}
              </div>
            )}

            <form onSubmit={handleResetPassword} className="space-y-3">
              <div>
                <label className="text-xs font-bold text-gray-600 uppercase block mb-1">
                  Membership Number
                </label>
                <input
                  type="text"
                  placeholder="e.g. SACCO001"
                  value={forgotForm.membership_no}
                  onChange={(e) =>
                    setForgotForm({ ...forgotForm, membership_no: e.target.value.toUpperCase() })
                  }
                  className="w-full border p-2.5 rounded-lg text-sm uppercase focus:ring-2 focus:ring-green-500 outline-none"
                  required
                />
              </div>

              <div>
                <label className="text-xs font-bold text-gray-600 uppercase block mb-1">
                  National ID
                </label>
                <input
                  type="text"
                  placeholder="e.g. 12345678"
                  value={forgotForm.national_id}
                  onChange={(e) =>
                    setForgotForm({ ...forgotForm, national_id: e.target.value })
                  }
                  className="w-full border p-2.5 rounded-lg text-sm focus:ring-2 focus:ring-green-500 outline-none"
                  required
                />
              </div>

              <div>
                <label className="text-xs font-bold text-gray-600 uppercase block mb-1">
                  New Password
                </label>
                <div className="relative">
                  <input
                    type={showForgotPwd ? "text" : "password"}
                    placeholder="Enter new password"
                    value={forgotForm.new_password}
                    onChange={(e) =>
                      setForgotForm({ ...forgotForm, new_password: e.target.value })
                    }
                    className="w-full border p-2.5 pr-16 rounded-lg text-sm focus:ring-2 focus:ring-green-500 outline-none"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowForgotPwd(!showForgotPwd)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs font-bold text-gray-600 hover:text-black"
                  >
                    {showForgotPwd ? "🙈 Hide" : "👁️ View"}
                  </button>
                </div>
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowForgotModal(false)}
                  className="flex-1 bg-gray-200 text-gray-700 font-bold p-2.5 rounded-lg text-sm hover:bg-gray-300"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={resetLoading}
                  className="flex-1 bg-green-600 text-white font-bold p-2.5 rounded-lg text-sm hover:bg-green-700 disabled:opacity-50"
                >
                  {resetLoading ? "Updating..." : "Update Password"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}