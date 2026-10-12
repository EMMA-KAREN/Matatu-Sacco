import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider, useAuth } from "./context/AuthContext";
import DriverDashboard from "./pages/DriverDashboard";
import Matatus from "./pages/Matatus";
// import Trips from "./pages/Trips";
// import Expenses from "./pages/Expenses";
// import Loans from "./pages/Loans";
import Login from "./pages/Login";
import Signup from "./pages/Signup";
import DashboardRouter from "./pages/DashboardRouter";
import Activate from "./pages/Activate";
import HRDashboard from "../src/pages/HRDashboard"
import MainLayout from "./layout/MainLayout";
import Members from "./components/Members";
import StageOperator from "./pages/StageOperator";
import OwnerDashboard from "./components/OwnerDashboard";
import AdminDashboard from "./context/AdminDashboard";
import SubStageOperator from "./pages/SubStageOperator";

function OwnerDashboardWrapper() {
  const { user } = useAuth();
  if (!user) return <div className="p-6">Loading...</div>;
  return <OwnerDashboard user={user} />;
}
function App() {

   const user = JSON.parse(localStorage.getItem("user"));
  return (
   <AuthProvider>
     <BrowserRouter>
      <Routes>
            <Route path="/dashboard" element={<DashboardRouter user={user} />} />
        <Route path="/matatus" element={<Matatus/>} />
        <Route path="/members" element={<Members />} />
        <Route path="/owner" element={<OwnerDashboard />} />
        <Route path="/login" element={<Login />} />
        <Route path="/signup" element={<Signup />} />
        <Route path="/activate" element={<Activate />} />
        <Route path="/hr" element={<HRDashboard />} />
        <Route path="/" element={<MainLayout/>} />
        <Route path="/stage-operator" element={<StageOperator />} />
        <Route path="/sub-stage-operator" element={<SubStageOperator />} /> 
        <Route path="/driver" element={<DriverDashboard />} />
        <Route path="/conductor" element={<DriverDashboard />} />   
         <Route path="/AdminDashboard" element={<AdminDashboard />} />   

      </Routes>
    </BrowserRouter>
  </AuthProvider>
  );
}

export default App;