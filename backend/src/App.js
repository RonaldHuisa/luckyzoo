import React from "react";
import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";

import Login from "./pages/Login";
import Register from "./pages/Register";
import Home from "./pages/Home";
import Promotion from "./pages/Promotion";
import Vip from "./pages/Vip";
import InviteFriends from "./pages/InviteFriends";
import Profile from "./pages/Profile";
import AppShell from "./components/AppShell";
import Recharge from "./pages/Recharge";
import Withdraw from "./pages/Withdraw";
import Transactions from "./pages/Transactions";
import AdminWithdrawals from "./pages/AdminWithdrawals";
import AdminStatus from "./pages/AdminStatus";
import AdminDeposits from "./pages/AdminDeposits";
import MembersList from "./pages/MembersList";
import Tasks from "./pages/Tasks";

import { LanguageProvider } from "./i18n/I18nContext";
import DomTranslator from "./i18n/DomTranslator";

import "./App.css";

function isAuthenticated() {
  return !!localStorage.getItem("token");
}

function ProtectedLayout() {
  const location = useLocation();

  if (!isAuthenticated()) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  return (
    <AppShell>
      <Routes>
        <Route path="/home" element={<Home />} />
        <Route path="/promotion" element={<Promotion />} />
        <Route path="/vip" element={<Vip />} />
        <Route path="/invite" element={<InviteFriends />} />
        <Route path="/profile" element={<Profile />} />
        <Route path="/recharge" element={<Recharge />} />
        <Route path="/withdraw" element={<Withdraw />} />
        <Route path="/transactions" element={<Transactions />} />
        <Route path="/admin/withdrawals" element={<AdminWithdrawals />} />
        <Route path="/admin/status" element={<AdminStatus />} />
        <Route path="/admin/deposits" element={<AdminDeposits />} />
        <Route path="/members/:level" element={<MembersList />} />
        <Route path="/tasks" element={<Tasks />} />
        
        <Route path="*" element={<Navigate to="/home" replace />} />
      </Routes>
    </AppShell>
  );
}

function PublicOnly({ children }) {
  if (isAuthenticated()) {
    return <Navigate to="/home" replace />;
  }

  return children;
}

function AppRoutes() {
  return (
    <Routes>
      {/* Primera entrada a la plataforma */}
      <Route path="/" element={<Navigate to="/register" replace />} />

      {/* Rutas públicas */}
      <Route
        path="/login"
        element={
          <PublicOnly>
            <Login />
          </PublicOnly>
        }
      />

      <Route
        path="/register"
        element={
          <PublicOnly>
            <Register />
          </PublicOnly>
        }
      />

      {/* Rutas protegidas */}
      <Route path="/*" element={<ProtectedLayout />} />
    </Routes>
  );
}

export default function App() {
  return (
    <LanguageProvider>
      <BrowserRouter>
        <DomTranslator />
        <AppRoutes />
      </BrowserRouter>
    </LanguageProvider>
  );
}
