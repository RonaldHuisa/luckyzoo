import React from "react";
import { BrowserRouter, Navigate, Route, Routes, useLocation } from "react-router-dom";
import AppShell from "./components/AppShell";
import Login from "./pages/Login";
import Register from "./pages/Register";
import Home from "./pages/Home";
import Roulette from "./pages/Roulette";
import Levels from "./pages/Levels";
import InviteFriends from "./pages/InviteFriends";
import Recharge from "./pages/Recharge";
import Withdraw from "./pages/Withdraw";
import Profile from "./pages/Profile";
import Support from "./pages/Support";
import AdminSupport from "./pages/AdminSupport";
import AdminPanel from "./pages/AdminPanel";
import GlobalLoading from "./components/GlobalLoading";
import "./App.css";

function isAuthenticated() {
  return Boolean(localStorage.getItem("token"));
}

function Protected({ children }) {
  const location = useLocation();
  if (!isAuthenticated()) return <Navigate to="/login" replace state={{ from: location }} />;
  return children;
}

function PublicOnly({ children }) {
  if (isAuthenticated()) return <Navigate to="/home" replace />;
  return children;
}

function ProtectedRoutes() {
  return (
    <Protected>
      <AppShell>
        <Routes>
          <Route path="/home" element={<Home />} />
          <Route path="/roulette" element={<Roulette />} />
          <Route path="/slots" element={<Navigate to="/roulette" replace />} />
          <Route path="/levels" element={<Levels />} />
          <Route path="/plans" element={<Navigate to="/levels" replace />} />
          <Route path="/vip" element={<Navigate to="/levels" replace />} />
          <Route path="/invite" element={<InviteFriends />} />
          <Route path="/team" element={<Navigate to="/invite" replace />} />
          <Route path="/recharge" element={<Recharge />} />
          <Route path="/withdraw" element={<Withdraw />} />
          <Route path="/profile" element={<Profile />} />
          <Route path="/support" element={<Support />} />
          <Route path="/admin" element={<AdminPanel />} />
          <Route path="/admin/support" element={<AdminSupport />} />
          <Route path="*" element={<Navigate to="/home" replace />} />
        </Routes>
      </AppShell>
    </Protected>
  );
}

export default function App() {
  return (
    <>
      <GlobalLoading />
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Navigate to={isAuthenticated() ? "/home" : "/register"} replace />} />
          <Route path="/login" element={<PublicOnly><Login /></PublicOnly>} />
          <Route path="/register" element={<PublicOnly><Register /></PublicOnly>} />
          <Route path="/*" element={<ProtectedRoutes />} />
        </Routes>
      </BrowserRouter>
    </>
  );
}
