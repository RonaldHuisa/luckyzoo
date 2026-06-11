import React, { useCallback, useEffect, useState } from "react";
import { FiArrowLeft, FiGift, FiRefreshCw, FiUsers, FiCheckCircle, FiClock, FiShoppingBag } from "react-icons/fi";
import { useNavigate } from "react-router-dom";
import { getFreePlantPointsStatus, redeemFreePlantWithPoints } from "../services/authService";
import { useI18n } from "../i18n/I18nContext";

function number(value) {
  return Number(value || 0).toLocaleString("en-US");
}

function money(value) {
  return Number(value || 0).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function getTreeImage(level) {
  return `/tree-icons/tree-${Number(level || 0)}.png`;
}

export default function Points() {
  const navigate = useNavigate();
  const { t } = useI18n();

  const [loading, setLoading] = useState(true);
  const [data, setData] = useState(null);
  const [toast, setToast] = useState("");
  const [processing, setProcessing] = useState("");

  const showToast = useCallback((message) => {
    setToast(message);
    setTimeout(() => setToast(""), 3800);
  }, []);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const result = await getFreePlantPointsStatus();
      setData(result);
    } catch (error) {
      showToast(error.message || "No se pudo cargar puntos.");
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const summary = data?.summary || {};
  const packages = data?.packages || [];

  const handleRedeem = async (pkg) => {
    if (!pkg?.id) return;

    const ok = window.confirm(`¿Solicitar ${pkg.name} por ${pkg.pointsCost} puntos?`);
    if (!ok) return;

    try {
      setProcessing(pkg.id);
      const result = await redeemFreePlantWithPoints(pkg.id);
      showToast(result.message || "Solicitud enviada.");
      await loadData();
    } catch (error) {
      showToast(error.message || "No se pudo enviar la solicitud.");
    } finally {
      setProcessing("");
    }
  };

  return (
    <div className="page points-page points-page-pro">
      {loading && (
        <div className="garden-loading-overlay app-loading-overlay">
          <div className="garden-loading-popup app-loading-popup">
            <span className="garden-loading-spinner" />
            <strong>{t("Cargando...")}</strong>
          </div>
        </div>
      )}

      {toast && (
        <div className="success-toast">
          <strong>{toast}</strong>
        </div>
      )}

      <div className="points-pro-header">
        <button className="icon-btn" type="button" onClick={() => navigate("/home")}>
          <FiArrowLeft />
        </button>

        <div>
          <span>Evento permanente</span>
          <h2>Puntos GreenVest</h2>
        </div>

        <button className="icon-btn ghost-icon" type="button" onClick={loadData}>
          <FiRefreshCw />
        </button>
      </div>

      <section className="points-pro-summary points-pro-summary-compact">
        <div className="points-pro-summary-title">
          <span className="points-pro-badge"><FiGift /> Planta gratis</span>
          <p>Puntos disponibles</p>
          <small>Invita amigos con tu enlace y acumula puntos para solicitar plantas.</small>
        </div>

        <strong className="points-pro-total">{number(summary.availablePoints)}</strong>
      </section>

      <section className="points-pro-metrics">
        <div>
          <FiUsers />
          <span>Invitados</span>
          <strong>{number(summary.validInvites)}</strong>
        </div>
        <div>
          <FiShoppingBag />
          <span>Compras</span>
          <strong>{number(summary.investmentEvents)}</strong>
        </div>
        <div>
          <FiCheckCircle />
          <span>Ganados</span>
          <strong>{number(summary.totalPoints)}</strong>
        </div>
        <div>
          <FiClock />
          <span>Reservados</span>
          <strong>{number(summary.usedPoints)}</strong>
        </div>
      </section>

      <section className="points-pro-card points-pro-how">
        <div className="points-pro-section-title">
          <h3>Cómo sumar puntos</h3>
          <p>Comparte tu enlace y crece con tu equipo.</p>
        </div>

        <div className="points-pro-steps">
          <div>
            <strong>+1</strong>
            <span>Invitado directo registrado con tu enlace.</span>
          </div>
          <div>
            <strong>+2</strong>
            <span>Si tu invitado invierte en cualquier planta.</span>
          </div>

        </div>
      </section>

      <section className="points-pro-card points-pro-plants">
        <div className="points-pro-section-title">
          <h3>Canjear plantas</h3>
          <p>Solicita una planta cuando alcances los puntos requeridos.</p>
        </div>

        <div className="points-pro-plant-list">
          {packages.map((pkg) => {
            const enough = Number(summary.availablePoints || 0) >= Number(pkg.pointsCost || 0);
            const redemption = pkg.redemption;
            const disabled = !enough || processing === pkg.id || Boolean(redemption);

            return (
              <article className={`points-pro-plant ${redemption ? "requested" : ""}`} key={pkg.id}>
                <div className="points-pro-plant-img">
                  <img src={getTreeImage(pkg.level)} alt={pkg.name} onError={(event) => { event.currentTarget.src = "/GreenVest_ico.png"; }} />
                </div>

                <div className="points-pro-plant-info">
                  <span>Nivel {pkg.level}</span>
                  <strong>{pkg.name}</strong>
                  <small>Valor {money(pkg.priceUsdt)} USDT</small>
                </div>

                <div className="points-pro-plant-action">
                  <b>{number(pkg.pointsCost)} pts</b>
                  {redemption && (
                    <em className={`points-request-status ${redemption.status}`}>
                      {redemption.status === "pending" ? "En revisión" : "Aprobado"}
                    </em>
                  )}
                  <button type="button" disabled={disabled} onClick={() => handleRedeem(pkg)}>
                    {redemption
                      ? redemption.status === "pending" ? "En revisión" : "Aprobado"
                      : enough
                        ? processing === pkg.id ? "Enviando..." : "Solicitar"
                        : "Faltan"}
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      </section>

      <section className="points-pro-card points-pro-rules">
        <div className="points-pro-section-title">
          <h3>Reglas del evento</h3>
          <p>Condiciones principales para participar.</p>
        </div>

        <div className="points-pro-rule-list">
          <p>Solo cuentan usuarios nuevos registrados con tu enlace.</p>
          <p>No se contabilizan multicuentas.</p>
          <p>Cada planta puede canjearse una sola vez.</p>
          <p>El canje aprobado entrega 15 días VIP.</p>
          <p>Si ya tienes esa planta activa, se añaden 15 días más.</p>
          <p>El administrador revisará y aprobará la solicitud.</p>
          <p>La revisión puede demorar hasta 24 horas.</p>
        </div>
      </section>
    </div>
  );
}
