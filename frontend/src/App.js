import React, { useState } from "react";
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
import AdminSecurity from "./pages/AdminSecurity";
import AdminGrowth from "./pages/AdminGrowth";
import MembersList from "./pages/MembersList";
import Tasks from "./pages/Tasks";
import HashRewards from "./pages/HashRewards";
import Reinvest from "./pages/Reinvest";
import About from "./pages/About";
import AdminPromoEvent from "./pages/AdminPromoEvent";

import { FaHeadset, FaTelegramPlane, FaWhatsapp } from "react-icons/fa";

import { LanguageProvider } from "./i18n/I18nContext";
import DomTranslator from "./i18n/DomTranslator";

import "./App.css";

function isAuthenticated() {
  return !!localStorage.getItem("token");
}

const GREENVEST_TELEGRAM_SUPPORT_URL = "https://t.me/GreenVestSoporte";
const GREENVEST_WHATSAPP_CHANNEL_URL = "https://whatsapp.com/channel/0029VbDLIiKF1YlShBn1GR0u";

function FloatingWhatsappSupport() {
  const [isOpen, setIsOpen] = useState(false);

  const openExternal = (url) => {
    window.open(url, "_blank", "noopener,noreferrer");
    setIsOpen(false);
  };

  return (
    <>
      <button
        type="button"
        className="floating-support-button"
        onClick={() => setIsOpen(true)}
        aria-label="Abrir soporte GreenVest"
        title="Soporte GreenVest"
      >
        <FaHeadset />
        <span>Soporte</span>
      </button>

      {isOpen && (
        <div className="floating-support-backdrop" onClick={() => setIsOpen(false)}>
          <div className="floating-support-sheet" onClick={(event) => event.stopPropagation()}>
            <button
              type="button"
              className="floating-support-close"
              onClick={() => setIsOpen(false)}
              aria-label="Cerrar soporte"
            >
              ×
            </button>

            <h2>Soporte</h2>
            <p>Seleccione un método de contacto</p>

            <button
              type="button"
              className="floating-support-option telegram"
              onClick={() => openExternal(GREENVEST_TELEGRAM_SUPPORT_URL)}
            >
              <span><FaTelegramPlane /></span>
              <strong>Soporte GreenVest</strong>
              <em>Telegram</em>
            </button>

            <button
              type="button"
              className="floating-support-option whatsapp"
              onClick={() => openExternal(GREENVEST_WHATSAPP_CHANNEL_URL)}
            >
              <span><FaWhatsapp /></span>
              <strong>Canal GreenVest</strong>
              <em>WhatsApp</em>
            </button>
          </div>
        </div>
      )}
    </>
  );
}

function ProtectedLayout() {
  const location = useLocation();

  if (!isAuthenticated()) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  return (
    <AppShell>
      <FloatingWhatsappSupport />
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
        <Route path="/admin/promo-event" element={<AdminPromoEvent />} />
        <Route path="/admin/security" element={<AdminSecurity />} />
        <Route path="/admin/growth" element={<AdminGrowth />} />
        <Route path="/members/:level" element={<MembersList />} />
        <Route path="/tasks" element={<Tasks />} />
        <Route path="/promo-event" element={<Navigate to="/home" replace />} />
        <Route path="/rewards" element={<HashRewards />} />
        <Route path="/reinvest" element={<Reinvest />} />
        <Route path="/about" element={<About />} />
        
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
