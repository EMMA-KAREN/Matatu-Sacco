import Sidebar from "../components/Sidebar";
import { Outlet } from "react-router-dom";

function MainLayout() {
  return (
    <div style={{ display: "flex" }}>

      <Sidebar />

      <div style={{ marginLeft: "20px", width: "100%" }}>
        <Outlet />
      </div>

    </div>
  );
}

export default MainLayout;
