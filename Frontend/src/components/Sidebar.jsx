import { Link } from "react-router-dom";

export default function Sidebar({ children }) {
  return (
    <div className="flex h-screen">

      {/* SIDEBAR */}
      <div className="w-64 bg-gray-900 text-white p-4 space-y-4">
        <h2 className="text-xl font-bold mb-6">Sacco System</h2>

        <Link to="/AdminDashboard" className="block hover:bg-gray-700 p-2 rounded">
          AdminDashboard
        </Link>

        <Link to="/matatus" className="block hover:bg-gray-700 p-2 rounded">
          Matatus
        </Link>

        <Link to="/hr" className="block hover:bg-gray-700 p-2 rounded">
          HR Dashboard
        </Link>

        <Link to="/login" className="block hover:bg-gray-700 p-2 rounded">
          Login
        </Link>

        <Link to="/signup" className="block hover:bg-gray-700 p-2 rounded">
          Signup
        </Link>
      </div>

      {/* MAIN CONTENT */}
      <div className="flex-1 overflow-y-auto bg-gray-100 p-6">
        {children}
      </div>

    </div>
  );
}
