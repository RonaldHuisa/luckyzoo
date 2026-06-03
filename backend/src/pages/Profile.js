import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  FiChevronRight,
  FiCopy,
  FiCreditCard,
  FiDollarSign,
  FiGift,
  FiMessageCircle,
  FiSend,
  FiUser,
  FiUsers,
} from "react-icons/fi";
import {
  getUser,
  getWithdrawInfo,
  getPromotionDashboard,
  getVipStatus,
  logout,
} from "../services/authService";
import { useI18n } from "../i18n/I18nContext";

const TELEGRAM_CHANNEL_URL = "https://t.me/LuvenVIP";
const TELEGRAM_SUPPORT_URL = "https://t.me/LuvenSupport";

function toNumber(value) {
  const numberValue = Number(value ?? 0);
  return Number.isFinite(numberValue) ? numberValue : 0;
}

function formatUsdt(value) {
  return toNumber(value).toFixed(2);
}

async function copyText(text) {
  if (navigator.clipboard && window.isSecureContext) {
    await navigator.clipboard.writeText(text);
    return;
  }

  const input = document.createElement("textarea");
  input.value = text;
  input.style.position = "fixed";
  input.style.opacity = "0";
  document.body.appendChild(input);
  input.focus();
  input.select();
  document.execCommand("copy");
  document.body.removeChild(input);
}

export default function Profile() {
  const navigate = useNavigate();
  const { t } = useI18n();

  const [user] = useState(() => getUser());
  const [withdrawInfo, setWithdrawInfo] = useState(null);
  const [promotionData, setPromotionData] = useState(null);
  const [vipData, setVipData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState("");

  const showToast = useCallback((message) => {
    setToast(message);
    setTimeout(() => setToast(""), 2600);
  }, []);

  const loadProfile = useCallback(async () => {
    try {
      setLoading(true);

      const [withdrawResult, promotionResult, vipResult] =
        await Promise.allSettled([
          getWithdrawInfo(),
          getPromotionDashboard(),
          getVipStatus(),
        ]);

      if (withdrawResult.status === "fulfilled") {
        setWithdrawInfo(withdrawResult.value);
      }

      if (promotionResult.status === "fulfilled") {
        setPromotionData(promotionResult.value);
      }

      if (vipResult.status === "fulfilled") {
        setVipData(vipResult.value);
      }

      const hasError = [withdrawResult, promotionResult, vipResult].some(
        (result) => result.status === "rejected"
      );

      if (hasError) {
        showToast(t("Algunos datos no se pudieron cargar."));
      }
    } catch (error) {
      showToast(error.message || t("Error al cargar perfil."));
    } finally {
      setLoading(false);
    }
  }, [showToast, t]);

  useEffect(() => {
    loadProfile();

    const handleFocus = () => {
      loadProfile();
    };

    window.addEventListener("focus", handleFocus);

    return () => {
      window.removeEventListener("focus", handleFocus);
    };
  }, [loadProfile]);

  const profile = useMemo(() => {
    const email = user?.email || vipData?.user?.email || "Usuario";

    const referralCode =
      promotionData?.referralCode ||
      user?.referral_code ||
      user?.referralCode ||
      "------";

    const referralLink =
      promotionData?.referralLink ||
      `${window.location.origin}/register?ref=${referralCode}`;

    const withdrawableBalance = toNumber(
      withdrawInfo?.available ?? vipData?.earningsBalanceUsdt ?? 0
    );

    const rechargeBalance = toNumber(vipData?.rechargeBalanceUsdt ?? 0);

    const taskTodayIncome = toNumber(vipData?.todayIncomeUsdt ?? 0);
    const referralTodayIncome = toNumber(promotionData?.todayIncome ?? 0);
    const todayTotalIncome = taskTodayIncome + referralTodayIncome;

    const totalReferralIncome = toNumber(promotionData?.totalIncome ?? 0);
    const totalMembers = Number(promotionData?.totalMembers ?? 0);
    const totalTeamRecharge = toNumber(promotionData?.totalTeamRecharge ?? 0);

    return {
      email,
      referralCode,
      referralLink,
      withdrawableBalance,
      rechargeBalance,
      taskTodayIncome,
      referralTodayIncome,
      todayTotalIncome,
      totalReferralIncome,
      totalMembers,
      totalTeamRecharge,
    };
  }, [user, withdrawInfo, promotionData, vipData]);

  const handleCopyReferral = async () => {
    try {
      await copyText(profile.referralLink);
      showToast(t("Enlace copiado."));
    } catch (error) {
      showToast(t("No se pudo copiar el enlace."));
    }
  };

  const openTelegram = (url) => {
    window.open(url, "_blank", "noopener,noreferrer");
  };

  const handleLogout = () => {
    logout();
    navigate("/login");
  };

  return (
    <div className="page profile-page">
      {toast && (
        <div className="success-toast">
          <strong>{toast}</strong>
        </div>
      )}

      <div className="profile-hero profile-hero-horizontal">
        <div className="profile-avatar profile-avatar-large">
          <FiUser />
        </div>

        <div className="profile-info profile-info-right">
          <span className="eyebrow">{t("Mi cuenta")}</span>
          <h2>{profile.email}</h2>
          <p>{t("código de invitación")}: {profile.referralCode}</p>
        </div>
      </div>

      {loading && <div className="panel">{t("Cargando datos del perfil...")}</div>}

      <section className="wallet-panel profile-section-card">
        <div className="profile-section-title">
          <span className="icon-badge sm tone-blue">
            <FiCreditCard />
          </span>
          <div>
            <h3>{t("Balance principal")}</h3>
            <p>{t("Saldo retirable e inversión")}</p>
          </div>
        </div>

        <div className="profile-metric-card tone-card-success profile-today-earnings profile-today-inside-balance">
          <span>{t("Ganancias hoy")}</span>
          <strong>{formatUsdt(profile.todayTotalIncome)}</strong>
        </div>

        <div className="wallet-grid profile-balance-grid profile-balance-grid-two">
          <div
            className="profile-metric-card tone-card-mint no-metric-icon"
            onClick={() => navigate("/withdraw")}
            style={{ cursor: "pointer" }}
          >
            <span>{t("Retirable")}</span>
            <strong>{formatUsdt(profile.withdrawableBalance)} ›</strong>
          </div>

          <div
            className="profile-metric-card tone-card-blue no-metric-icon"
            onClick={() => navigate("/recharge")}
            style={{ cursor: "pointer" }}
          >
            <span>{t("Inversión")}</span>
            <strong>{formatUsdt(profile.rechargeBalance)} ›</strong>
          </div>
        </div>
      </section>

      <section className="panel summary-panel profile-section-card">
        <div className="profile-section-title">
          <span className="icon-badge sm tone-success">
            <FiGift />
          </span>
          <div>
            <h3>{t("Rendimiento de referidos")}</h3>
            <p>{t("Resumen de equipo")}</p>
          </div>
        </div>

        <div className="summary-bottom profile-team-grid">
          <div
            className="profile-metric-card tone-card-blue"
            onClick={() => navigate("/promotion")}
            style={{ cursor: "pointer" }}
          >
            <span className="metric-icon"><FiUsers /></span>
            <b>{profile.totalMembers}</b>
            <span>{t("Equipo")}</span>
          </div>

          <div className="profile-metric-card tone-card-lavender">
            <span className="metric-icon"><FiCreditCard /></span>
            <b>{formatUsdt(profile.totalTeamRecharge)}</b>
            <span>{t("Recarga equipo")}</span>
          </div>

          <div className="profile-metric-card tone-card-mint">
            <span className="metric-icon"><FiDollarSign /></span>
            <b>{formatUsdt(profile.totalReferralIncome)}</b>
            <span>{t("Ingresos ref.")}</span>
          </div>
        </div>
      </section>

      <div className="menu-panel">
        <div
          className="menu-row"
          onClick={handleCopyReferral}
          style={{ cursor: "pointer" }}
        >
          <span>{t("Copiar referido")}</span>
          <FiCopy />
        </div>

        <div
          className="menu-row"
          onClick={() => openTelegram(TELEGRAM_CHANNEL_URL)}
          style={{ cursor: "pointer" }}
        >
          <span>{t("Canal oficial")}</span>

          <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <FiSend />
            <FiChevronRight />
          </span>
        </div>

        <div
          className="menu-row"
          onClick={() => openTelegram(TELEGRAM_SUPPORT_URL)}
          style={{ cursor: "pointer" }}
        >
          <span>{t("Soporte Telegram")}</span>

          <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <FiMessageCircle />
            <FiChevronRight />
          </span>
        </div>
      </div>

      <button className="logout-btn" onClick={handleLogout}>
        {t("Cerrar sesión")}
      </button>
    </div>
  );
}
