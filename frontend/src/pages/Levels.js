import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { FiAlertTriangle, FiCheck, FiCreditCard, FiLock, FiRefreshCw, FiXCircle } from "react-icons/fi";
import api from "../services/api";

const money = (value) => `${Number(value || 0).toFixed(2)} USDT`;
const planLabel = (pkg) => `Plan ${pkg?.name || "Royal"}`;

export default function Levels() {
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loadingLevel, setLoadingLevel] = useState(null);
  const [cancelLoading, setCancelLoading] = useState(false);
  const [insufficient, setInsufficient] = useState(null);
  const [cancelConfirm, setCancelConfirm] = useState(false);

  const load = async () => {
    try {
      const res = await api.get("/vip/status");
      setData(res.data);
    } catch (err) { setError(err.message); }
  };

  useEffect(() => { load(); }, []);

  useEffect(() => {
    if (!insufficient) return undefined;
    const timer = setTimeout(() => navigate("/recharge"), 1900);
    return () => clearTimeout(timer);
  }, [insufficient, navigate]);

  const goRecharge = () => {
    setInsufficient(null);
    navigate("/recharge");
  };

  const showInsufficient = (pkg) => {
    setError("");
    setMessage("");
    setInsufficient({
      level: pkg.level,
      name: pkg.name,
      price: pkg.priceUsdt,
      balance: data?.user?.balance_usdt || 0,
    });
  };

  const buy = async (pkg) => {
    const level = Number(pkg.level);
    const balance = Number(data?.user?.balance_usdt || 0);
    const price = Number(pkg.priceUsdt || 0);

    if (!pkg.isPurchasable || pkg.isLockedByProgress || data?.activePurchase) return;
    if (level > 0 && balance < price) {
      showInsufficient(pkg);
      return;
    }

    setLoadingLevel(level);
    setError("");
    setMessage("");
    try {
      const res = await api.post("/vip/buy", { level });
      setMessage(res.data.message || "Plan activado correctamente.");
      await load();
    } catch (err) {
      const msg = err.message || "";
      if (msg.toLowerCase().includes("saldo insuficiente")) showInsufficient(pkg);
      else setError(msg);
    }
    finally { setLoadingLevel(null); }
  };

  const cancelActivePlan = async () => {
    setCancelLoading(true);
    setError("");
    setMessage("");
    try {
      const res = await api.post("/vip/cancel");
      setCancelConfirm(false);
      setMessage(res.data.message || "Plan cancelado correctamente.");
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setCancelLoading(false);
    }
  };

  const userBalance = Number(data?.user?.balance_usdt || 0);
  const activePurchase = data?.activePurchase;

  return (
    <div className="page-stack levels-page">
      <section className="page-header-card levels-header-card levels-compact-hero">
        <div className="levels-hero-copy">
          <span className="eyebrow">Niveles Royal</span>
          <h2>Activa tu plan</h2>
          <p>Más plan, más tareas diarias y mayor recompensa por participación.</p>
        </div>
        <div className="header-stats levels-balance-box compact-balance-box">
          <span>Saldo disponible</span>
          <strong>{money(data?.user?.balance_usdt)}</strong>
          <button className="recharge-inline-btn" type="button" onClick={goRecharge}><FiCreditCard /> Recargar</button>
        </div>
      </section>

      {activePurchase && (
        <section className="active-plan-strip">
          <div>
            <span>Plan activo</span>
            <strong>Plan {(data?.packages || []).find((p) => Number(p.level) === Number(activePurchase.level))?.name || activePurchase.level}</strong>
          </div>
          <small>Vigente hasta {activePurchase.expiresAt ? new Date(activePurchase.expiresAt).toLocaleDateString() : "—"}</small>
          <button type="button" onClick={() => setCancelConfirm(true)}><FiXCircle /> Cancelar</button>
        </section>
      )}

      {error && <div className="alert error">{error}</div>}
      {message && <div className="alert success">{message}</div>}

      <section className="levels-grid levels-plan-grid">
        {(data?.packages || []).map((pkg) => {
          const price = Number(pkg.priceUsdt || 0);
          const isLevelZero = Number(pkg.level) === 0;
          const isComingSoon = !isLevelZero && !pkg.isPurchasable && !pkg.isActive;
          const isLocked = Boolean(pkg.isLockedByProgress);
          const needsRecharge = !isLevelZero && userBalance < price && !pkg.isActive && pkg.isPurchasable && !isLocked && !activePurchase;
          const blockedByActive = !isLevelZero && !pkg.isActive && Boolean(activePurchase);
          return (
            <article className={`${pkg.isActive ? "level-card active" : "level-card"} ${isComingSoon ? "coming-soon" : ""} ${isLocked ? "progress-locked" : ""}`} key={pkg.id}>
              <div className="level-plan-head">
                <img src="/royal-icon.svg" alt="Royal" />
                <div>
                  <span>Plan</span>
                  <h3>{pkg.name}</h3>
                </div>
                {pkg.isActive && !isLevelZero ? <b className="level-state active">Activo</b> : isLocked ? <b className="level-state locked">No disponible</b> : isComingSoon ? <b className="level-state locked">Próximamente</b> : isLevelZero ? <b className="level-state">Incluido</b> : <b className="level-state">Disponible</b>}
              </div>
              <strong className="level-price">{money(pkg.priceUsdt)}</strong>
              <ul className="level-benefits">
                <li><FiCheck /> {pkg.dailyTasks} tareas diarias</li>
                <li><FiCheck /> {pkg.cooldownLabel} entre tareas</li>
                <li><FiCheck /> {money(pkg.taskRewardUsdt)} por pregunta</li>
                <li><FiCheck /> {pkg.validDays} días</li>
              </ul>
              {isLevelZero ? (
                <button className="secondary-btn full compact-level-action" disabled><FiCheck /> Incluido</button>
              ) : pkg.isActive ? (
                <button className="danger-soft-btn full compact-level-action" type="button" onClick={() => setCancelConfirm(true)}><FiXCircle /> Cancelar plan</button>
              ) : isLocked ? (
                <button className="secondary-btn full compact-level-action" disabled><FiLock /> No disponible</button>
              ) : isComingSoon ? (
                <button className="secondary-btn full compact-level-action" disabled><FiLock /> Próximamente</button>
              ) : blockedByActive ? (
                <button className="secondary-btn full compact-level-action" disabled><FiLock /> Cancela actual</button>
              ) : needsRecharge ? (
                <button className="recharge-level-btn full compact-level-action" type="button" onClick={() => showInsufficient(pkg)}><FiCreditCard /> Recargar saldo</button>
              ) : (
                <button className="primary-btn full compact-level-action" onClick={() => buy(pkg)} disabled={loadingLevel === pkg.level}>
                  {loadingLevel === pkg.level ? <FiRefreshCw /> : <FiLock />} Activar plan
                </button>
              )}
            </article>
          );
        })}
      </section>

      {insufficient && (
        <div className="action-popup-backdrop" role="dialog" aria-modal="true">
          <div className="action-popup-card insufficient-popup">
            <div className="popup-icon-wrap"><FiCreditCard /></div>
            <h3>No tienes saldo suficiente</h3>
            <p>
              Para activar <strong>{planLabel(insufficient)}</strong> necesitas {money(insufficient.price)}.
              Tu saldo actual es {money(insufficient.balance)}.
            </p>
            <small>Te enviaremos automáticamente a Recargar.</small>
            <button className="recharge-popup-btn" type="button" onClick={goRecharge}>Recargar ahora</button>
          </div>
        </div>
      )}

      {cancelConfirm && activePurchase && (
        <div className="action-popup-backdrop" role="dialog" aria-modal="true">
          <div className="action-popup-card cancel-plan-popup">
            <div className="popup-icon-wrap warn"><FiAlertTriangle /></div>
            <h3>Confirmar cancelación</h3>
            <p>Se acreditará {money(activePurchase.cancelRefundUsdt)} a tu saldo de garantía.</p>
            <small>Se aplica una comisión del {activePurchase.cancelFeePercent || 10}%.</small>
            <div className="popup-actions-row">
              <button type="button" className="secondary-btn" onClick={() => setCancelConfirm(false)} disabled={cancelLoading}>Volver</button>
              <button type="button" className="danger-soft-btn" onClick={cancelActivePlan} disabled={cancelLoading}>{cancelLoading ? "Procesando..." : "Confirmar"}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
