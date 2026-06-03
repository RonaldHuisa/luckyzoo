import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  FiArrowRight,
  FiCreditCard,
  FiHelpCircle,
  FiInfo,
  FiLock,
  FiLogOut,
  FiRefreshCw,
  FiTrendingUp,
  FiUsers,
} from "react-icons/fi";
import { FaTelegramPlane, FaWhatsapp } from "react-icons/fa";
import { getUser, logout, changePassword, getVipStatus } from "../services/authService";
import { useI18n } from "../i18n/I18nContext";

const TELEGRAM_SUPPORT_URL = "https://t.me/GreenVestSoporte";
const WHATSAPP_CHANNEL_URL = "https://whatsapp.com/channel/0029VbDLIiKF1YlShBn1GR0u";
const DEFAULT_TREE_IMAGE = "/GreenVest_ico.png";

function getTreeImage(level) {
  const safeLevel = Number.isFinite(Number(level)) ? Number(level) : 0;
  return `/tree-icons/tree-${safeLevel}.png`;
}

function handleTreeImageError(event) {
  if (event.currentTarget.src.includes(DEFAULT_TREE_IMAGE)) return;
  event.currentTarget.src = DEFAULT_TREE_IMAGE;
}

export default function Profile() {
  const navigate = useNavigate();
  const { t } = useI18n();
  const [user] = useState(() => getUser());
  const [vipData, setVipData] = useState(null);
  const [toast, setToast] = useState("");
  const [showPasswordPanel, setShowPasswordPanel] = useState(false);
  const [showSupportPanel, setShowSupportPanel] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);
  const [passwordForm, setPasswordForm] = useState({
    currentPassword: "",
    newPassword: "",
    confirmPassword: "",
  });

  const showToast = useCallback((message) => {
    setToast(message);
    setTimeout(() => setToast(""), 2600);
  }, []);

  useEffect(() => {
    let mounted = true;

    async function loadVipStatus() {
      try {
        const result = await getVipStatus();
        if (mounted) setVipData(result);
      } catch (error) {
        if (mounted) setVipData(null);
      }
    }

    loadVipStatus();
    return () => {
      mounted = false;
    };
  }, []);

  const highestTree = useMemo(() => {
    const packages = Array.isArray(vipData?.packages) ? vipData.packages : [];
    const activePackages = packages
      .filter((plan) => plan.isActive)
      .sort((a, b) => Number(b.level || 0) - Number(a.level || 0));

    return activePackages[0] || {
      level: 0,
      name: t("Brote de Pasantía"),
    };
  }, [vipData, t]);

  const openExternal = (url) => {
    window.open(url, "_blank", "noopener,noreferrer");
  };

  const handleLogout = () => {
    logout();
    navigate("/login");
  };

  const updatePasswordField = (field, value) => {
    setPasswordForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleChangePassword = async (event) => {
    event.preventDefault();

    const currentPassword = passwordForm.currentPassword.trim();
    const newPassword = passwordForm.newPassword.trim();
    const confirmPassword = passwordForm.confirmPassword.trim();

    if (!currentPassword || !newPassword || !confirmPassword) {
      showToast(t("Completa todos los campos."));
      return;
    }

    if (newPassword.length < 6) {
      showToast(t("La nueva contraseña debe tener mínimo 6 caracteres."));
      return;
    }

    if (newPassword !== confirmPassword) {
      showToast(t("Las nuevas contraseñas no coinciden."));
      return;
    }

    try {
      setSavingPassword(true);
      await changePassword({ currentPassword, newPassword });
      showToast(t("Contraseña actualizada correctamente."));
      setPasswordForm({ currentPassword: "", newPassword: "", confirmPassword: "" });
      setShowPasswordPanel(false);
    } catch (error) {
      showToast(error.message || t("No se pudo actualizar la contraseña."));
    } finally {
      setSavingPassword(false);
    }
  };

  const quickItems = [
    {
      label: t("Recargar"),
      icon: <FiCreditCard />,
      action: () => navigate("/recharge"),
      className: "recharge",
    },
    {
      label: t("Retirar"),
      icon: <FiTrendingUp />,
      action: () => navigate("/withdraw"),
      className: "withdraw",
    },
  ];

  const menuItems = [
    { label: t("Re-Invertir"), icon: <FiRefreshCw />, action: () => navigate("/reinvest") },
    { label: t("Equipo"), icon: <FiUsers />, action: () => navigate("/promotion") },
    { label: t("Cambiar contraseña"), icon: <FiLock />, action: () => setShowPasswordPanel(true) },
    { label: t("Acerca de"), icon: <FiInfo />, action: () => navigate("/about") },
    { label: t("Soporte"), icon: <FiHelpCircle />, action: () => setShowSupportPanel(true) },
  ];

  return (
    <div className="page profile-clean-page profile-garden-page">
      {toast && (
        <div className="center-simple-toast center-simple-toast-info">
          <span>{toast}</span>
        </div>
      )}

      <section className="profile-garden-hero">
        <div className="profile-garden-brand">
          <div>
            <strong>GreenVest</strong>
            <span>{t("Mi cuenta")}</span>
          </div>
          <b>{t("Nivel")} {Number(highestTree?.level || 0)}</b>
        </div>

        <div className="profile-garden-user">
          <div className="profile-garden-tree">
            <img src={getTreeImage(highestTree?.level)} onError={handleTreeImageError} alt={highestTree?.name || "GreenVest"} />
          </div>

          <div className="profile-garden-user-info">
            <strong data-no-translate="true">{user?.email || "Usuario"}</strong>
            <span data-no-translate="true">ID: {user?.referral_code || user?.referralCode || "------"}</span>
            <em data-no-translate="true">{highestTree?.name || t("Sin planta activa")}</em>
          </div>
        </div>
      </section>

      <section className="profile-garden-quick-actions">
        {quickItems.map((item) => (
          <button key={item.label} className={item.className} type="button" onClick={item.action}>
            <span>{item.icon}</span>
            <div>
              <strong>{item.label}</strong>
            </div>
          </button>
        ))}
      </section>

      <section className="profile-garden-menu">
        {menuItems.map((item) => (
          <button key={item.label} type="button" onClick={item.action}>
            <span>{item.icon}</span>
            <b>{item.label}</b>
            <FiArrowRight className="profile-garden-arrow" />
          </button>
        ))}
      </section>

      <button className="profile-garden-logout" type="button" onClick={handleLogout}>
        <FiLogOut />
        {t("Cerrar sesión")}
      </button>

      {showPasswordPanel && (
        <div className="profile-modal-backdrop" onClick={() => setShowPasswordPanel(false)}>
          <form className="profile-password-modal" onSubmit={handleChangePassword} onClick={(e) => e.stopPropagation()}>
            <h2>{t("Cambiar contraseña")}</h2>
            <p>{t("Ingresa tu contraseña actual y confirma la nueva contraseña.")}</p>

            <label>
              <span>{t("Contraseña actual")}</span>
              <input
                type="password"
                value={passwordForm.currentPassword}
                onChange={(e) => updatePasswordField("currentPassword", e.target.value)}
                autoComplete="current-password"
              />
            </label>

            <label>
              <span>{t("Nueva contraseña")}</span>
              <input
                type="password"
                value={passwordForm.newPassword}
                onChange={(e) => updatePasswordField("newPassword", e.target.value)}
                autoComplete="new-password"
              />
            </label>

            <label>
              <span>{t("Repetir nueva contraseña")}</span>
              <input
                type="password"
                value={passwordForm.confirmPassword}
                onChange={(e) => updatePasswordField("confirmPassword", e.target.value)}
                autoComplete="new-password"
              />
            </label>

            <div className="profile-password-actions">
              <button type="button" onClick={() => setShowPasswordPanel(false)}>
                {t("Cancelar")}
              </button>
              <button type="submit" disabled={savingPassword}>
                {savingPassword ? t("Guardando...") : t("Guardar")}
              </button>
            </div>
          </form>
        </div>
      )}

      {showSupportPanel && (
        <div className="profile-modal-backdrop" onClick={() => setShowSupportPanel(false)}>
          <div className="profile-support-sheet" onClick={(e) => e.stopPropagation()}>
            <h2>{t("Soporte")}</h2>
            <p>{t("Seleccione un método de contacto")}</p>

            <button className="support-telegram-option" type="button" onClick={() => openExternal(TELEGRAM_SUPPORT_URL)}>
              <span className="profile-support-icon telegram"><FaTelegramPlane /></span>
              <strong>Soporte GreenVest</strong>
              <FiArrowRight />
            </button>

            <button className="support-whatsapp-option" type="button" onClick={() => openExternal(WHATSAPP_CHANNEL_URL)}>
              <span className="profile-support-icon whatsapp"><FaWhatsapp /></span>
              <strong>Canal GreenVest</strong>
              <FiArrowRight />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
