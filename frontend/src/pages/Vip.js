import React, { useCallback, useEffect, useMemo, useState } from "react";
import { FiArrowDownCircle, FiLock, FiRefreshCw, FiShoppingBag } from "react-icons/fi";
import { useNavigate } from "react-router-dom";
import { buyVipPackage, getVipStatus } from "../services/authService";
import { useI18n } from "../i18n/I18nContext";

function formatUsdt(value, decimals = 2) {
  return Number(value || 0).toLocaleString("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

const DEFAULT_TREE_IMAGE = "/GreenVest_ico.png";

function getTreeImage(level) {
  const safeLevel = Number.isFinite(Number(level)) ? Number(level) : 0;
  return `/tree-icons/tree-${safeLevel}.png`;
}

function handleTreeImageError(event) {
  if (event.currentTarget.src.includes(DEFAULT_TREE_IMAGE)) return;
  event.currentTarget.src = DEFAULT_TREE_IMAGE;
}

export default function Vip() {
  const navigate = useNavigate();
  const { t } = useI18n();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [buyingLevel, setBuyingLevel] = useState(null);
  const [message, setMessage] = useState("");

  const loadPlans = useCallback(async () => {
    try {
      setLoading(true);
      const result = await getVipStatus();
      setData(result);
    } catch (error) {
      setMessage(error.message || t("Error al cargar árboles."));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    loadPlans();
  }, [loadPlans]);

  const activeTrees = useMemo(
    () => (data?.packages || []).filter((plan) => plan.isActive),
    [data]
  );

  const rechargeBalance = Number(data?.rechargeBalanceUsdt || 0);

  const handleBuy = async (level) => {
    if (buyingLevel) return;
    try {
      setBuyingLevel(level);
      const result = await buyVipPackage(level);
      setMessage(result.message || t("Árbol plantado correctamente."));
      await loadPlans();
    } catch (error) {
      setMessage(error.message || t("Error al plantar árbol."));
    } finally {
      setBuyingLevel(null);
    }
  };

  return (
    <div className="page mining-plans-page trees-page">
      <header className="mining-header">
        <div className="mining-brand">
          <div className="mining-logo">🌳</div>
          <div>
            <strong>{t("Bosque GreenVest")}</strong>
            <span>{t("Planta árboles, recoge agua y genera recompensas")}</span>
          </div>
        </div>
        <button className="mining-small-btn" type="button" onClick={loadPlans}><FiRefreshCw /></button>
      </header>

      <section className="mining-invest-card tree-summary-card tree-summary-card-clean">
        <div className="tree-summary-metrics">
          <div className="tree-summary-box balance">
            <span>{t("Saldo de recarga")}</span>
            <strong className="gold-text" data-no-translate="true">$ {formatUsdt(rechargeBalance)}</strong>
          </div>
          <div className="tree-summary-box">
            <span>{t("Plantas activas")}</span>
            <strong data-no-translate="true">{activeTrees.length}</strong>
          </div>
        </div>

        <button type="button" className="mining-primary-btn tree-recharge-main-btn" onClick={() => navigate("/recharge")}>
          <FiArrowDownCircle />
          {t("Recargar para plantar")}
        </button>
      </section>

      {message && <div className="mining-toast">{message}</div>}

      <section className="tree-vip-title-section">
        <span>{t("Zona de cultivo")}</span>
        <h2>{t("Plantas VIP")}</h2>
        <p>{t("Elige una planta, recoge agua cada 6 horas y aumenta tus recompensas.")}</p>
      </section>

      <section className="tree-plan-list">
        {loading && <div className="mining-empty">{t("Cargando árboles...")}</div>}
        {!loading && (data?.packages || []).map((plan) => {
          const level = Number(plan.level);
          const isFree = level === 0;
          const price = Number(plan.priceUsdt || 0);
          const daily = Number(plan.dailyIncomeUsdt || 0);
          const water = Number(plan.waterRewardUsdt || plan.taskRewardUsdt || 0);
          const total = Number(plan.totalRewardUsdt || daily * Number(plan.validDays || 0));
          const canBuy = !isFree && plan.isPurchasable && !plan.isActive;
          const insufficient = canBuy && rechargeBalance < price;

          return (
            <article className={`tree-side-card ${plan.isActive ? "active" : ""} ${isFree ? "free" : ""}`} key={plan.id}>
              <div className="tree-side-figure-wrap">
                <div className="tree-side-figure">
                  <img src={getTreeImage(level)} onError={handleTreeImageError} alt={plan.name || "GreenVest"} />
                </div>
              </div>

              <div className="tree-side-main">
                <div className="tree-side-namebar">
                  <div>
                    <small>{isFree ? t("Nivel gratis") : `${t("Nivel")} ${level}`}</small>
                    <h3 data-no-translate="true">{plan.name}</h3>
                  </div>
                  {plan.isActive && <b className="tree-active-pill">{t("Activo")}</b>}
                </div>

                <div className={`tree-price-badge ${isFree ? "free" : ""} ${plan.isActive && !isFree ? "acquired" : ""}`}>
                  <span>
                    {isFree
                      ? t("Acceso gratuito")
                      : plan.isActive
                      ? t("Estado")
                      : t("Precio")}
                  </span>
                  <strong data-no-translate="true">
                    {isFree
                      ? t("Gratis")
                      : plan.isActive
                      ? t("Adquirida")
                      : `${formatUsdt(price)} USDT`}
                  </strong>
                </div>

                <div className="tree-side-specs">
                  <div><span>{t("Agua cada 6h")}</span><strong data-no-translate="true"><img className="water-ui-icon water-ui-icon-inline" src="/water-icon.png" alt="Agua" /> {formatUsdt(water, 3)} USDT</strong></div>
                  <div><span>{t("Producción diaria")}</span><strong data-no-translate="true">{formatUsdt(daily)} USDT</strong></div>
                  <div><span>{t("Duración")}</span><strong data-no-translate="true">{plan.validDays} {t("días")}</strong></div>
                  <div><span>{t("Producción máxima")}</span><strong className="gold-text" data-no-translate="true">{formatUsdt(total)} USDT</strong></div>
                </div>

                <div className="tree-side-action">
                  {isFree ? (
                    <button className="tree-disabled-btn" type="button" disabled>
                      <FiLock /> {plan.isActive ? t("Pasantía activa") : t("Pasantía finalizada")}
                    </button>
                  ) : plan.isActive ? (
                    <button className="tree-secondary-btn" type="button" onClick={() => navigate("/tasks")}>
                      <img className="water-ui-icon water-ui-icon-btn tree-water-btn-icon" src="/water-icon.png" alt="Agua" /> {t("Ir a regar")}
                    </button>
                  ) : (
                    <button
                      className="tree-buy-btn"
                      type="button"
                      disabled={Boolean(buyingLevel) || insufficient}
                      onClick={() => handleBuy(level)}
                    >
                      <FiShoppingBag />
                      {buyingLevel === level
                        ? t("Plantando...")
                        : insufficient
                        ? t("Saldo insuficiente")
                        : t("Plantar ahora")}
                    </button>
                  )}
                </div>
              </div>
            </article>
          );
        })}
      </section>
    </div>
  );
}
