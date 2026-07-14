import React, { useEffect, useMemo, useState } from "react";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import { FiCreditCard, FiHome, FiTrendingUp, FiUser } from "react-icons/fi";
import { GiRollingDices } from "react-icons/gi";
import api from "../services/api";
import pollito from "../assets/roulette/pollito.png";
import conejo from "../assets/roulette/conejo.png";
import oveja from "../assets/roulette/oveja.png";
import toro from "../assets/roulette/toro.png";
import leon from "../assets/roulette/leon.png";
import tigre from "../assets/roulette/tigre.png";

const nav = [
  { to: "/home", label: "Inicio", icon: <FiHome /> },
  { to: "/recharge", label: "Recarga", icon: <FiCreditCard /> },
  { to: "/roulette", label: "Ruleta", icon: <GiRollingDices />, center: true },
  { to: "/levels", label: "Planes", icon: <FiTrendingUp /> },
  { to: "/profile", label: "Perfil", icon: <FiUser /> },
];

const animalIconByKey = { pollito, conejo, oveja, toro, leon, tigre };

export default function AppShell({ children }) {
  const navigate = useNavigate();
  const location = useLocation();
  const user = useMemo(() => {
    try { return JSON.parse(localStorage.getItem("user") || "{}"); }
    catch { return {}; }
  }, []);

  const [topbarUser, setTopbarUser] = useState(user);
  const [activeLevel, setActiveLevel] = useState({
    level: 0,
    animalKey: "pollito",
    planName: "Pasantía Pollito",
  });

  useEffect(() => {
    let alive = true;

    Promise.all([
      api.get("/auth/me").catch(() => null),
      api.get("/auth/roulette/status").catch(() => null),
    ]).then(([profileRes, rouletteRes]) => {
      if (!alive) return;

      const profile = profileRes?.data?.profile || {};
      const rouletteLevel = rouletteRes?.data?.level || null;

      setTopbarUser((prev) => ({
        ...(prev || {}),
        ...profile,
      }));

      if (rouletteLevel) {
        setActiveLevel({
          level: Number(rouletteLevel.level || 0),
          animalKey: rouletteLevel.animalKey || "pollito",
          planName: rouletteLevel.planName || rouletteLevel.displayName || "Pasantía Pollito",
        });
      }
    });

    return () => { alive = false; };
  }, []);

  const logout = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    navigate("/login", { replace: true });
  };

  if (location.pathname.startsWith("/admin")) {
    return (
      <div className="admin-shell-v55">
        <header className="admin-shell-v55-topbar">
          <div>
            <strong>Lucky Zoo Admin</strong>
            <span>{topbarUser?.email || user?.email || "Administrador"}</span>
          </div>
          <nav>
            <NavLink to="/admin">Panel</NavLink>
            <NavLink to="/admin/support">Tickets</NavLink>
            <NavLink to="/profile">Perfil</NavLink>
            <button type="button" onClick={logout}>Cerrar sesión</button>
          </nav>
        </header>
        <main className="admin-shell-v55-content">{children}</main>
      </div>
    );
  }

  const topbarIcon = animalIconByKey[activeLevel.animalKey] || pollito;
  const userId = topbarUser?.referralCode || topbarUser?.referral_code || user?.referralCode || user?.referral_code || topbarUser?.id || user?.id || "—";

  return (
    <div className="casino-root mobile-only-root">
      <main className="casino-phone royal-mobile-frame">
        <header className="app-topbar royal-mobile-topbar topbar-v58">
          <div className="topbar-brand">
            <div className="topbar-v58-icon" aria-hidden="true">
              <img src={topbarIcon} alt="" />
            </div>
            <div>
              <span>Lucky Zoo</span>
              <strong>ID {userId}</strong>
            </div>
          </div>
        </header>

        <div className="app-content royal-mobile-content">{children}</div>

        <nav className="bottom-nav royal-bottom-nav" aria-label="Navegación principal">
          {nav.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) => `${isActive ? "active" : ""} ${item.center ? "center" : ""}`}
            >
              {item.icon}
              <span>{item.label}</span>
            </NavLink>
          ))}
        </nav>
      </main>
    </div>
  );
}
