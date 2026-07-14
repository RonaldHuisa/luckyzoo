import React, { useEffect, useMemo, useRef, useState } from "react";
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

const vipNameByLevel = {
  0: "VIP Pasantía",
  1: "VIP 1",
  2: "VIP 2",
  3: "VIP 3",
  4: "VIP 4",
  5: "VIP 5",
};

const vipColorByLevel = {
  0: "#f2b705",
  1: "#8d6cff",
  2: "#28a66f",
  3: "#b86a28",
  4: "#d18a00",
  5: "#e13b21",
};

const activityIconByLevel = {
  0: pollito,
  1: conejo,
  2: oveja,
  3: toro,
  4: leon,
  5: tigre,
};

function formatActivityAmount(value) {
  const amount = Number(value || 0);
  return Number.isInteger(amount) ? String(amount) : amount.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
}

function formatActivityCoins(value) {
  return Number(value || 0).toLocaleString("es-PE");
}

function activityAgo() {
  return Math.random() < 0.5 ? "Hace 30 seg." : "Hace 1 min";
}

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomIdCode() {
  return String(randomInt(100000, 999999));
}

function weightedVipLevel({ includeFree = false } = {}) {
  const pool = includeFree
    ? [0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 3, 3, 4, 5]
    : [1, 1, 1, 1, 1, 2, 2, 2, 3, 3, 4, 5];

  return pool[randomInt(0, pool.length - 1)];
}

const withdrawalRangesByLevel = {
  1: [1, 5],
  2: [3, 10],
  3: [5, 20],
  4: [20, 50],
  5: [50, 100],
};

const jackpotRewards = [500, 1000, 2000, 5000];

function createRandomActivity(typeHint) {
  const type = typeHint || (Math.random() < 0.52 ? "withdrawal" : "jackpot");

  if (type === "withdrawal") {
    const vipLevel = weightedVipLevel();
    const [min, max] = withdrawalRangesByLevel[vipLevel] || [1, 5];

    return {
      type: "withdrawal",
      userCode: randomIdCode(),
      vipLevel,
      amount: randomInt(min, max),
      createdAt: null,
    };
  }

  return {
    type: "jackpot",
    userCode: randomIdCode(),
    vipLevel: weightedVipLevel({ includeFree: true }),
    coins: jackpotRewards[randomInt(0, jackpotRewards.length - 1)],
    createdAt: null,
  };
}

function SocialActivityToast({ activity, exiting }) {
  if (!activity) return null;
  const level = Number(activity.vipLevel || 0);
  const isWithdrawal = activity.type === "withdrawal";
  const icon = activityIconByLevel[level] || pollito;
  const vipName = vipNameByLevel[level] || "VIP Pasantía";
  const color = vipColorByLevel[level] || "#f2b705";

  return (
    <aside
      className={`social-activity-toast ${isWithdrawal ? "withdrawal" : "jackpot"} ${exiting ? "exit" : ""}`}
      style={{ "--activity-color": color }}
      aria-live="polite"
    >
      <div className="social-activity-icon">
        <img src={icon} alt="" />
      </div>
      <div className="social-activity-copy">
        <strong>ID {activity.userCode || activity.userId} - {vipName}</strong>
        <span>
          {activityAgo()} {isWithdrawal
            ? <>Retiró <b>{formatActivityAmount(activity.amount)} USDT</b> 💵</>
            : <>Obtuvo <b>+{formatActivityCoins(activity.coins)} monedas</b> 🪙</>}
        </span>
      </div>
    </aside>
  );
}


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
  const [currentActivity, setCurrentActivity] = useState(null);
  const [activityExiting, setActivityExiting] = useState(false);
  const nextActivityTypeRef = useRef("withdrawal");

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


  useEffect(() => {
    let showTimer;
    let exitTimer;
    let clearTimer;
    let active = true;

    const scheduleNext = (delay = 2500) => {
      showTimer = window.setTimeout(() => {
        if (!active) return;

        const type = nextActivityTypeRef.current;
        nextActivityTypeRef.current = type === "withdrawal" ? "jackpot" : "withdrawal";

        setActivityExiting(false);
        setCurrentActivity(createRandomActivity(type));

        clearTimer = window.setTimeout(() => {
          if (!active) return;
          setActivityExiting(true);

          exitTimer = window.setTimeout(() => {
            if (!active) return;
            setCurrentActivity(null);
            setActivityExiting(false);
            scheduleNext(20000);
          }, 420);
        }, 5000);
      }, delay);
    };

    scheduleNext();

    return () => {
      active = false;
      window.clearTimeout(showTimer);
      window.clearTimeout(exitTimer);
      window.clearTimeout(clearTimer);
    };
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
        <SocialActivityToast activity={currentActivity} exiting={activityExiting} />

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
