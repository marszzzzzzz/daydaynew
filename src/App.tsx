import { Routes, Route } from "react-router";
import { Toaster } from "@/components/ui/sonner";
import Home from "./pages/Home";
import Login from "./pages/Login";
import DashboardRedirect from "./pages/DashboardRedirect";
import TenantDashboard from "./pages/TenantDashboard";
import StaffDashboard from "./pages/StaffDashboard";
import AdminDashboard from "./pages/admin/AdminDashboard";
import NotFound from "./pages/NotFound";

export default function App() {
  return (
    <>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/login" element={<Login />} />
        <Route path="/dashboard" element={<DashboardRedirect />} />
        <Route path="/tenant" element={<TenantDashboard />} />
        <Route path="/staff" element={<StaffDashboard />} />
        <Route path="/admin" element={<AdminDashboard />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
      <Toaster position="top-center" />
    </>
  );
}
