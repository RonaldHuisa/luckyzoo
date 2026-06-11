import React, { useCallback, useEffect, useState } from "react";
import { FiArrowLeft, FiRefreshCw, FiGift, FiCheckCircle, FiXCircle } from "react-icons/fi";
import { useNavigate } from "react-router-dom";
import {
  getAdminFreePlantRequests,
  approveAdminFreePlantRequest,
  rejectAdminFreePlantRequest,
} from "../services/authService";

function dateText(value) {
  if (!value) return "-";
  return new Date(value).toLocaleString();
}

function number(value) {
  return Number(value || 0).toLocaleString("en-US");
}

export default function AdminFreePlants() {
  const navigate = useNavigate();

  const [status, setStatus] = useState("pending");
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState("");
  const [processing, setProcessing] = useState("");

  const showToast = useCallback((message) => {
    setToast(message);
    setTimeout(() => setToast(""), 3800);
  }, []);

  const loadRequests = useCallback(async (value = status) => {
    try {
      setLoading(true);
      const result = await getAdminFreePlantRequests(value);
      setRequests(result.requests || []);
    } catch (error) {
      showToast(error.message || "No se pudo cargar solicitudes.");
    } finally {
      setLoading(false);
    }
  }, [status, showToast]);

  useEffect(() => {
    loadRequests(status);
  }, [status, loadRequests]);

  const approveRequest = async (item) => {
    const note = window.prompt("Nota de aprobación opcional:", "Aprobado");
    if (note === null) return;

    try {
      setProcessing(`approve-${item.id}`);
      const result = await approveAdminFreePlantRequest(item.id, note);
      showToast(result.message || "Solicitud aprobada.");
      await loadRequests(status);
    } catch (error) {
      showToast(error.message || "No se pudo aprobar.");
    } finally {
      setProcessing("");
    }
  };

  const rejectRequest = async (item) => {
    const note = window.prompt("Motivo del rechazo:", "No cumple las reglas del evento");
    if (note === null) return;

    try {
      setProcessing(`reject-${item.id}`);
      const result = await rejectAdminFreePlantRequest(item.id, note);
      showToast(result.message || "Solicitud rechazada.");
      await loadRequests(status);
    } catch (error) {
      showToast(error.message || "No se pudo rechazar.");
    } finally {
      setProcessing("");
    }
  };

  return (
    <div className="page admin-free-plants-page">
      {loading && (
        <div className="garden-loading-overlay app-loading-overlay">
          <div className="garden-loading-popup app-loading-popup">
            <span className="garden-loading-spinner" />
            <strong>Cargando...</strong>
          </div>
        </div>
      )}

      {toast && (
        <div className="success-toast">
          <strong>{toast}</strong>
        </div>
      )}

      <div className="admin-status-header">
        <button className="icon-btn" type="button" onClick={() => navigate("/admin/status")}>
          <FiArrowLeft />
        </button>

        <div>
          <div className="eyebrow">Panel Admin</div>
          <h2>Plantas por puntos</h2>
        </div>

        <button className="icon-btn ghost-icon" type="button" onClick={() => loadRequests(status)}>
          <FiRefreshCw />
        </button>
      </div>

      <section className="panel admin-free-plants-card">
        <div className="admin-status-section-title">
          <FiGift />
          <div>
            <h3>Solicitudes de canje</h3>
            <p>Aprueba o rechaza canjes. Al aprobar, se activan o añaden 15 días VIP.</p>
          </div>
        </div>

        <div className="admin-free-tabs">
          {["pending", "approved", "rejected", "all"].map((item) => (
            <button
              key={item}
              type="button"
              className={status === item ? "active" : ""}
              onClick={() => setStatus(item)}
            >
              {item === "pending" ? "Pendientes" : item === "approved" ? "Aprobadas" : item === "rejected" ? "Rechazadas" : "Todas"}
            </button>
          ))}
        </div>
      </section>

      {!loading && requests.length === 0 && (
        <div className="panel admin-empty">No hay solicitudes para mostrar.</div>
      )}

      <div className="admin-free-request-list">
        {requests.map((item) => (
          <article className={`admin-free-request-card ${item.status}`} key={item.id}>
            <div className="admin-free-request-top">
              <div>
                <h3>{item.email}</h3>
                <p>ID {item.user_id} · Código {item.referral_code || "-"}</p>
              </div>
              <span>{item.status === "pending" ? "Pendiente" : item.status === "approved" ? "Aprobado" : "Rechazado"}</span>
            </div>

            <div className="admin-free-request-grid">
              <div><small>Planta</small><strong>{item.package_name}</strong></div>
              <div><small>Nivel</small><strong>{item.level}</strong></div>
              <div><small>Puntos</small><strong>{number(item.points_cost)}</strong></div>
              <div><small>Solicitado</small><strong>{dateText(item.requested_at)}</strong></div>
            </div>

            {item.admin_note && <p className="admin-free-note">Nota: {item.admin_note}</p>}

            {item.status === "pending" && (
              <div className="admin-free-actions">
                <button type="button" className="approve" disabled={processing === `approve-${item.id}`} onClick={() => approveRequest(item)}>
                  <FiCheckCircle />
                  Aprobar
                </button>
                <button type="button" className="reject" disabled={processing === `reject-${item.id}`} onClick={() => rejectRequest(item)}>
                  <FiXCircle />
                  Rechazar
                </button>
              </div>
            )}
          </article>
        ))}
      </div>
    </div>
  );
}
