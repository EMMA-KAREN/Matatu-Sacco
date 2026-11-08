import { Navigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

import OwnerDashboard from "../components/OwnerDashboard";
import HRDashboard from "./HRDashboard";
import StageOperator from "./StageOperator";
import AdminDashboard from "../context/AdminDashboard";
import SaccoHome from "../components/SaccoHome";
import MainLayout from "../layout/MainLayout";

export default function DashboardRouter() {
  const { user } = useAuth();

  if (!user) return <Navigate to="/login" replace />;

  switch (user.role) {
    case "owner":
      return <OwnerDashboard user={user} />;
    case "hr":
      return <HRDashboard />;
    case "stage_operator":
      return <StageOperator />;
    case "director":
    case "admin":
      return <AdminDashboard />;
  default:
      return (
        <MainLayout>
          <SaccoHome user={user} />
        </MainLayout>
      );
  }
}