import OwnerDashboard from "../components/OwnerDashboard";
import HRDashboard from "../pages/HRDashboard";
import StageOperator from "../pages/StageOperator";
import { useAuth } from "../context/AuthContext";
import { Navigate } from "react-router-dom";

export default function DashboardRouter() {
  const { user } = useAuth();

  if (!user) return <Navigate to="/login" />;

  switch (user.role) {
    case "owner":
      return <OwnerDashboard user={user} />;  // 👈 pass user prop
    case "hr":
      return <HRDashboard />;
    case "stage_operator":
      return <StageOperator />;
    default:
      return <div className="p-6">No dashboard assigned for role: {user.role}</div>;
  }
}