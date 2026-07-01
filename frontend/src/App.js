import React from "react";
import { BrowserRouter, Navigate, Route, Routes, useLocation } from "react-router-dom";
import AppShell from "./components/AppShell";
import Login from "./pages/Login";
import Register from "./pages/Register";
import Home from "./pages/Home";
import Tasks from "./pages/Tasks";
import Levels from "./pages/Levels";
import InviteFriends from "./pages/InviteFriends";
import Recharge from "./pages/Recharge";
import Withdraw from "./pages/Withdraw";
import History from "./pages/History";
import Profile from "./pages/Profile";
import AdminPanel from "./pages/AdminPanel";
import Support from "./pages/Support";
import News from "./pages/News";
import ArticleDetail from "./pages/ArticleDetail";
import PreLaunch from "./pages/PreLaunch";
import GlobalLoading from "./components/GlobalLoading";
import "./App.css";

function isAuthenticated() { return Boolean(localStorage.getItem("token")); }
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
  return <Protected><AppShell><Routes><Route path="/home" element={<Home />} /><Route path="/tasks" element={<Tasks />} /><Route path="/levels" element={<Levels />} /><Route path="/vip" element={<Navigate to="/levels" replace />} /><Route path="/invite" element={<InviteFriends />} /><Route path="/recharge" element={<Recharge />} /><Route path="/withdraw" element={<Withdraw />} /><Route path="/history" element={<History />} /><Route path="/transactions" element={<History />} /><Route path="/profile" element={<Profile />} /><Route path="/support" element={<Support />} /><Route path="/news" element={<News />} /><Route path="/prelaunch" element={<PreLaunch />} /><Route path="/news/:slug" element={<ArticleDetail />} /><Route path="/admin" element={<AdminPanel />} /><Route path="/admin/:section" element={<AdminPanel />} /><Route path="*" element={<Navigate to="/home" replace />} /></Routes></AppShell></Protected>;
}
export default function App() {
  return <><GlobalLoading /><BrowserRouter><Routes><Route path="/" element={<Navigate to={isAuthenticated() ? "/home" : "/register"} replace />} /><Route path="/login" element={<PublicOnly><Login /></PublicOnly>} /><Route path="/register" element={<PublicOnly><Register /></PublicOnly>} /><Route path="/*" element={<ProtectedRoutes />} /></Routes></BrowserRouter></>;
}
