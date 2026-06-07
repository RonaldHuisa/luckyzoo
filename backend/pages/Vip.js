import React, { useCallback, useEffect, useState } from "react";
import { FiAward, FiCheckCircle, FiLock, FiStar, FiZap, FiShoppingBag, FiX } from "react-icons/fi";
import { getVipStatus, buyVipPackage } from "../services/authService";
import { useNavigate } from "react-router-dom";
import { useI18n } from "../i18n/I18nContext";

const vipMeta = {
  0: { label: "Base", tone: "tier-muted", icon: <FiLock /> },
  1: { label: "Inicio", tone: "tier-blue", icon: <FiStar /> },
  2: { label: "Impulso", tone: "tier-mint", icon: <FiZap /> },
  3: { label: "Elite", tone: "tier-lavender", icon: <FiAward /> },
  4: { label: "Prime", tone: "tier-peach", icon: <FiAward /> },
  5: { label: "Máster", tone: "tier-success", icon: <FiCheckCircle /> },
};

function getVipMeta(level) {
  return vipMeta[level] || {
    label: "Premium",
    tone: "tier-blue",
    icon: <FiAward />,
  };
}

function formatCooldown(minutes) {
  const value = Number(minutes || 0);

  if (!value) return "-";

  if (value % 60 === 0) {
    const hours = value / 60;
    return `${hours} ${hours === 1 ? "hora" : "horas"}`;
  }

  return `${value} minutos`;
}

export default function Vip() {
  const navigate = useNavigate();
  const { t } = useI18n();

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [buyingLevel, setBuyingLevel] = useState(null);
  const [toast, setToast] = useState("");
  const [confirmPackage, setConfirmPackage] = useState(null);

  const showToast = useCallback((message) => {
    setToast(message);

    setTimeout(() => {
      setToast("");
    }, 3000);
  }, []);

  const loadVip = useCallback(async () => {
    try {
      setLoading(true);

      const result = await getVipStatus();
      setData(result);
    } catch (error) {
      showToast(error.message || t("Error al cargar VIP"));
    } finally {
      setLoading(false);
    }
  }, [showToast, t]);

  useEffect(() => {
    loadVip();
  }, [loadVip]);

  const handleBuy = async (pkg) => {
    if (!pkg.isPurchasable) {
      showToast(t("Este paquete todavía no está disponible."));
      return;
    }

    if (pkg.isActive) {
      showToast(t("Ya tienes activo este paquete VIP."));
      return;
    }

    const balance = Number(data?.rechargeBalanceUsdt || 0);
    const price = Number(pkg.priceUsdt || 0);

    if (balance < price) {
      showToast(t("Saldo insuficiente. Por favor recarga primero."));
      setTimeout(() => {
        navigate("/recharge");
      }, 1200);
      return;
    }

    setConfirmPackage(pkg);
  };

  const confirmBuyPackage = async () => {
    if (!confirmPackage) return;

    try {
      setBuyingLevel(confirmPackage.level);

      const result = await buyVipPackage(confirmPackage.level);

      setConfirmPackage(null);
      showToast(result.message || t("Compra VIP realizada."));
      await loadVip();
    } catch (error) {
      showToast(error.message || t("Error al comprar VIP."));
    } finally {
      setBuyingLevel(null);
    }
  };

  const closeBuyModal = () => {
    if (buyingLevel) return;
    setConfirmPackage(null);
  };

  if (loading) {
    return (
      <div className="page vip-page">
        <div className="panel">{t("Cargando VIP...")}</div>
      </div>
    );
  }

  const packages = data?.packages || [];

  return (
    <div className="page vip-page">
      {toast && (
        <div className="success-toast">
          <strong>{toast}</strong>
        </div>
      )}

      {confirmPackage && (
        <div className="vip-confirm-overlay" role="dialog" aria-modal="true">
          <div className="vip-confirm-modal">
            <button
              type="button"
              className="vip-confirm-close"
              onClick={closeBuyModal}
              disabled={Boolean(buyingLevel)}
              aria-label={t("Cerrar")}
            >
              <FiX />
            </button>

            <div className="vip-confirm-icon">
              <FiShoppingBag />
            </div>

            <div className="vip-confirm-content">
              <span>{t("Confirmar compra")}</span>
              <h3>{confirmPackage.name}</h3>
              <p>
                {t("Se descontarán")}{" "}
                <strong>{Number(confirmPackage.priceUsdt).toFixed(2)} USDT</strong>{" "}
                {t("de tu saldo de recarga.")}
              </p>
            </div>

            <div className="vip-confirm-summary">
              <div>
                <span>{t("Duración")}</span>
                <strong>{confirmPackage.validDays} {t("Días").toLowerCase()}</strong>
              </div>

              <div>
                <span>{t("Por misión")}</span>
                <strong>
                  {Number(confirmPackage.taskRewardUsdt || confirmPackage.dailyIncomeUsdt).toFixed(2)} USDT
                </strong>
              </div>
            </div>

            <div className="vip-confirm-actions">
              <button
                type="button"
                className="vip-confirm-cancel"
                onClick={closeBuyModal}
                disabled={Boolean(buyingLevel)}
              >
                {t("Cancelar")}
              </button>

              <button
                type="button"
                className="vip-confirm-accept"
                onClick={confirmBuyPackage}
                disabled={Boolean(buyingLevel)}
              >
                {buyingLevel ? t("Procesando...") : t("Confirmar")}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="vip-main-header">
        <div>
          <div className="eyebrow">{t("Centro de miembros")}</div>
          <h2 className="page-title">{t("Planes VIP")}</h2>
        </div>
        <span className="soft-pill">{t("90 días")}</span>
      </div>

      <div className="vip-summary">
        <div className="vip-summary-item">
          <strong>{Number(data?.todayIncomeUsdt || 0).toFixed(2)}</strong>
          <span>{t("Ganancias hoy ( USDT )")}</span>
        </div>

        <div className="vip-summary-divider" />

        <div className="vip-summary-item">
          <strong>{Number(data?.earningsBalanceUsdt || 0).toFixed(2)}</strong>
          <span>{t("Acumulado ( USDT )")}</span>
        </div>
      </div>

      <div className="vip-countdown">
        <strong>{t("Tiempo válido según paquete comprado")}</strong>
        <span>{t("Elige el plan que mejor se adapte a tu saldo de recarga.")}</span>
      </div>

      <div className="vip-package-list">
        {packages.map((pkg) => {
          const meta = getVipMeta(Number(pkg.level));

          return (
            <div
              className={`vip-card ${meta.tone} ${
                pkg.isActive ? "vip-tier-active" : "vip-tier-inactive"
              }`}
              key={pkg.id}
            >
              <div className="vip-card-header">
                <div className="vip-title-wrap">
                  <span className="vip-level-icon">{meta.icon}</span>
                  <div>
                    <h3>{pkg.name}</h3>
                    <p>{t(meta.label)}</p>
                  </div>
                </div>

                {pkg.isActive ? (
                  <span className="vip-status active">{t("Activo")}</span>
                ) : pkg.isPurchasable ? (
                  <span className="vip-status available">{t("Disponible")}</span>
                ) : (
                  <span className="vip-status soon">{t("Próximamente")}</span>
                )}
              </div>

              <div className="vip-stats">
                <div>
                  <strong>{Number(pkg.taskRewardUsdt || pkg.dailyIncomeUsdt).toFixed(2)}</strong>
                  <span>{t("USDT/misión")}</span>
                </div>

                <div>
                  <strong>{formatCooldown(pkg.taskCooldownMinutes)}</strong>
                  <span>{t("Cooldown")}</span>
                </div>

                <div>
                  <strong>{pkg.validDays} {t("Días").toLowerCase()}</strong>
                  <span>{t("Duración")}</span>
                </div>
              </div>

              <div className="vip-price-row">
                <span>{t("Costo del plan")}</span>
                <strong>{Number(pkg.priceUsdt).toFixed(2)} USDT</strong>
              </div>

              {pkg.isActive ? (
                <button className="vip-btn disabled" disabled>
                  {t("Activo hasta")} {new Date(pkg.expiresAt).toLocaleDateString()}
                </button>
              ) : pkg.isPurchasable ? (
                <button
                  className="vip-btn"
                  onClick={() => handleBuy(pkg)}
                  disabled={buyingLevel === pkg.level}
                >
                  {buyingLevel === pkg.level
                    ? t("Procesando...")
                    : `${t("Comprar")} · ${Number(pkg.priceUsdt).toFixed(2)} USDT`}
                </button>
              ) : (
                <button className="vip-btn disabled" disabled>
                  {t("Abierto pronto")}
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
