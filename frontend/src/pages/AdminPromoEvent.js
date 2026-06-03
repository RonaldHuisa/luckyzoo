import React, { useCallback, useEffect, useState } from "react";
import {
  FiArrowLeft,
  FiEye,
  FiGift,
  FiRefreshCw,
  FiUsers,
  FiZap,
} from "react-icons/fi";
import { useNavigate } from "react-router-dom";
import {
  getAdminPromoClaims,
  getAdminPromoUserDetail,
} from "../services/authService";

function money(value) {
  return Number(value || 0).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function formatDate(value) {
  if (!value) return "-";
  return new Date(value).toLocaleString();
}

export default function AdminPromoEvent() {
  const navigate = useNavigate();

  const [claims, setClaims] = useState([]);
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [message, setMessage] = useState("");

  const loadClaims = useCallback(async () => {
    try {
      setLoading(true);
      const result = await getAdminPromoClaims();
      setClaims(result.claims || []);
      setMessage("");
    } catch (error) {
      setMessage(error.message || "No se pudieron cargar los reclamos.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadClaims();
  }, [loadClaims]);

  const openDetail = async (userId) => {
    try {
      setDetailLoading(true);
      const result = await getAdminPromoUserDetail(userId);
      setDetail(result);
    } catch (error) {
      setMessage(error.message || "No se pudo cargar el detalle.");
    } finally {
      setDetailLoading(false);
    }
  };

  const totalReward = claims.reduce((sum, item) => sum + Number(item.reward_amount || 0), 0);
  const uniqueUsers = new Set(claims.map((item) => item.user_id)).size;

  return (
    <div className="page admin-promo-page">
      <header className="admin-promo-header">
        <button className="icon-btn" type="button" onClick={() => navigate("/admin/status")}>
          <FiArrowLeft />
        </button>
        <div>
          <span>Panel Admin</span>
          <h2>Evento promoción</h2>
        </div>
        <button className="icon-btn ghost-icon" type="button" onClick={loadClaims}>
          <FiRefreshCw />
        </button>
      </header>

      {message && <div className="admin-promo-message">{message}</div>}

      <section className="admin-promo-summary">
        <article>
          <FiGift />
          <span>USDT inversión entregado</span>
          <strong>{money(totalReward)}</strong>
        </article>
        <article>
          <FiUsers />
          <span>Usuarios premiados</span>
          <strong>{uniqueUsers}</strong>
        </article>
        <article>
          <FiZap />
          <span>Reclamos</span>
          <strong>{claims.length}</strong>
        </article>
      </section>

      {loading ? (
        <div className="panel admin-status-loading">Cargando evento...</div>
      ) : (
        <section className="admin-promo-list">
          {claims.length === 0 && (
            <div className="panel admin-empty">Aún no hay recompensas reclamadas.</div>
          )}

          {claims.map((item) => (
            <article className="admin-promo-card approved" key={item.id}>
              <div className="admin-promo-card-top">
                <div>
                  <h3>{item.email}</h3>
                  <p>{item.task_title} · {formatDate(item.claimed_at)}</p>
                </div>
                <span>Reclamado</span>
              </div>

              <div className="admin-promo-grid">
                <div>
                  <span>Progreso usado</span>
                  <strong>{item.progress_count}/{item.required_count}</strong>
                </div>
                <div>
                  <span>Total al reclamar</span>
                  <strong>{item.total_count_at_claim}</strong>
                </div>
                <div>
                  <span>Recompensa</span>
                  <strong>{money(item.reward_amount)} USDT</strong>
                </div>
              </div>

              <div className="admin-promo-actions">
                <button type="button" onClick={() => openDetail(item.user_id)}>
                  <FiEye />
                  Ver registros
                </button>
              </div>
            </article>
          ))}
        </section>
      )}

      {detail && (
        <div className="admin-promo-modal-backdrop" onClick={() => setDetail(null)}>
          <div className="admin-promo-modal" onClick={(event) => event.stopPropagation()}>
            <div className="admin-promo-modal-title">
              <div>
                <h3>Detalle del usuario</h3>
                <p>Registros e inversiones contabilizadas dentro del evento.</p>
              </div>
              <button type="button" onClick={() => setDetail(null)}>×</button>
            </div>

            {detailLoading ? (
              <div className="admin-status-loading">Cargando detalle...</div>
            ) : (
              <>
                <div className="admin-promo-registered">
                  <h4>Registros con enlace</h4>
                  {detail.registrations?.length ? detail.registrations.map((user) => (
                    <div key={user.id}>
                      <span>{user.email}</span>
                      <strong>{formatDate(user.created_at)}</strong>
                    </div>
                  )) : <p>No hay registros en el evento.</p>}
                </div>

                <div className="admin-promo-registered">
                  <h4>Invitados con inversión mínima</h4>
                  {detail.activeInvestors?.length ? detail.activeInvestors.map((user) => (
                    <div key={user.id}>
                      <span>{user.email}</span>
                      <strong>{money(user.invested_during_event)} USDT · {formatDate(user.first_deposit_at)}</strong>
                    </div>
                  )) : <p>No hay activaciones en el evento.</p>}
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
