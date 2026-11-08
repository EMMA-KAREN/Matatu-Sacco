import { BrowserRouter, Routes, Route, Navigate, Outlet } from "react-router-dom";
import { AuthProvider, useAuth } from "./context/AuthContext";

import MainLayout from "./layout/MainLayout";
import DashboardRouter from "./pages/DashboardRouter";
import Login from "./pages/Login";
import Signup from "./pages/Signup";
import Activate from "./pages/Activate";
import Matatus from "./pages/Matatus";
import Members from "./components/Members";
import HRDashboard from "./pages/HRDashboard";
import StageOperator from "./pages/StageOperator";
import SubStageOperator from "./pages/SubStageOperator";
import DriverDashboard from "./pages/DriverDashboard";
import OwnerDashboard from "./components/OwnerDashboard";
import AdminDashboard from "./context/AdminDashboard";

function OwnerDashboardWrapper() {
  const { user } = useAuth();
  if (!user) return <div className="p-6">Loading...</div>;
  return <OwnerDashboard user={user} />;
}

function RequireAuth() {
  const { user } = useAuth();
  return user ? <Outlet /> : <Navigate to="/login" replace />;
}

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
       <Routes>
  {/* Public, no sidebar */}
  <Route path="/login" element={<Login />} />
  <Route path="/signup" element={<Signup />} />
  <Route path="/activate" element={<Activate />} />

  {/* Public home (shows SaccoHome inside the layout) */}
  <Route path="/" element={<MainLayout />} />

  <Route element={<RequireAuth />}>
    {/* Self-contained dashboards: they have their own sidebar, so NO MainLayout */}
    <Route path="/dashboard" element={<DashboardRouter />} />
    <Route path="/hr" element={<HRDashboard />} />
    <Route path="/owner" element={<OwnerDashboardWrapper />} />
    <Route path="/admin" element={<AdminDashboard />} />
    <Route path="/stage-operator" element={<StageOperator />} />
    <Route path="/sub-stage-operator" element={<SubStageOperator />} />
    <Route path="/driver" element={<DriverDashboard />} />
    <Route path="/conductor" element={<DriverDashboard />} />

    {/* Plain pages that rely on the shared sidebar */}
    <Route element={<MainLayout />}>
      <Route path="/matatus" element={<Matatus />} />
      <Route path="/members" element={<Members />} />
    </Route>
  </Route>

  <Route path="*" element={<Navigate to="/" replace />} />
</Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;