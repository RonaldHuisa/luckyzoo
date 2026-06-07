import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  FiArrowLeft,
  FiRefreshCw,
  FiShield,
  FiAlertTriangle,
  FiSlash,
  FiCheckCircle,
  FiUsers,
  FiWifi,
  FiEye,
} from "react-icons/fi";
import {
  banAdminUser,
  clearAdminUserSuspicious,
  getAdminRepeatedIps,
  getAdminSecurityEvents,
  getAdminSecurityUsers,
  markAdminIpSuspicious,
  markAdminUserSuspicious,
  unbanAdminUser,
} from "../services/authService";

function money(value) {
  return Number(value || 0).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function shortDate(value) {
  if (!value) return "-";
  try {
    return new Date(value).toLocaleString();
  } catch {
    return "-";
  }
}

function riskLabel(status) {
  if (status === "banned") return "Baneado";
  if (status === "suspicious") return "Sospechoso";
  if (status === "review") return "Revisar";
  return "Normal";
}

export default function AdminSecurity() {
  const navigate = useNavigate();
  const [users, setUsers] = useState([]);
  const [ips, setIps] = useState([]);
  const [tab, setTab] = useState("users");
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState("");
  const [toast, setToast] = useState("");
  const [eventsUser, setEventsUser] = useState(null);
  const [events, setEvents] = useState([]);

  const showToast = useCallback((message) => {
    setToast(message);
    setTimeout(() => setToast(""), 4500);
  }, []);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const [usersData, ipsData] = await Promise.all([
        getAdminSecurityUsers(),
        getAdminRepeatedIps(),
      ]);
      setUsers(usersData.users || []);
      setIps(ipsData.ips || []);
    } catch (error) {
      showToast(error.message || "No se pudo cargar seguridad.");
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const counters = useMemo(() => {
    return {
      total: users.length,
      suspicious: users.filter((u) => u.is_suspicious).length,
      banned: users.filter((u) => u.is_banned).length,
      review: users.filter((u) => u.risk_status === "review").length,
      repeatedIps: ips.length,
    };
  }, [users, ips]);

  const askReason = (defaultReason) => {
    const reason = window.prompt("Motivo para registrar en el historial:", defaultReason);
    if (reason === null) return null;
    return reason.trim() || defaultReason;
  };

  const runAction = async (key, action, successMessage) => {
    try {
      setProcessing(key);
      await action();
      showToast(successMessage);
      await loadData();
    } catch (error) {
      showToast(error.message || "No se pudo completar la acción.");
    } finally {
      setProcessing("");
    }
  };

  const handleMarkSuspicious = (user) => {
    const reason = askReason("Múltiples cuentas detectadas o comportamiento sospechoso.");
    if (reason === null) return;
    runAction(
      `suspicious-${user.id}`,
      () => markAdminUserSuspicious(user.id, reason),
      "Usuario marcado como sospechoso."
    );
  };

  const handleClearSuspicious = (user) => {
    const reason = askReason("Revisión manual completada. Usuario liberado.");
    if (reason === null) return;
    runAction(
      `clear-${user.id}`,
      () => clearAdminUserSuspicious(user.id, reason),
      "Sospecha retirada."
    );
  };

  const handleBan = (user) => {
    const reason = askReason("Uso sospechoso de múltiples cuentas para aumentar poder de minería.");
    if (reason === null) return;
    const ok = window.confirm(`¿Confirmas restringir a ${user.email}?`);
    if (!ok) return;
    runAction(`ban-${user.id}`, () => banAdminUser(user.id, reason), "Usuario restringido correctamente.");
  };

  const handleUnban = (user) => {
    const reason = askReason("Usuario desbaneado después de revisión manual.");
    if (reason === null) return;
    runAction(`unban-${user.id}`, () => unbanAdminUser(user.id, reason), "Usuario desbaneado correctamente.");
  };

  const handleMarkIp = (item) => {
    const reason = askReason(`IP repetida con ${item.total_accounts} cuentas: ${item.ip}`);
    if (reason === null) return;
    runAction(`ip-${item.ip}`, () => markAdminIpSuspicious(item.ip, reason), "Cuentas de la IP marcadas como sospechosas.");
  };

  const handleEvents = async (user) => {
    try {
      setProcessing(`events-${user.id}`);
      const data = await getAdminSecurityEvents(user.id);
      setEventsUser(user);
      setEvents(data.events || []);
    } catch (error) {
      showToast(error.message || "No se pudo cargar el historial.");
    } finally {
      setProcessing("");
    }
  };

  const visibleUsers = users.filter((user) => {
    if (tab === "suspicious") return user.is_suspicious && !user.is_banned;
    if (tab === "banned") return user.is_banned;
    return true;
  });

  return (
    <div className="page admin-security-page">
      {toast && <div className="success-toast"><strong>{toast}</strong></div>}

      <div className="admin-security-header">
        <button className="icon-btn" type="button" onClick={() => navigate("/admin/status")}>
          <FiArrowLeft />
        </button>
        <div>
          <div className="eyebrow">Panel Admin</div>
          <h2>Seguridad / Antifraude</h2>
          <p>Controla IPs repetidas, usuarios sospechosos y restricciones manuales.</p>
        </div>
        <button className="icon-btn ghost-icon" type="button" onClick={loadData}>
          <FiRefreshCw />
        </button>
      </div>

      <section className="admin-security-stats">
        <article><FiUsers /><span>Usuarios</span><strong>{counters.total}</strong></article>
        <article className="warning"><FiAlertTriangle /><span>Sospechosos</span><strong>{counters.suspicious}</strong></article>
        <article className="danger"><FiSlash /><span>Baneados</span><strong>{counters.banned}</strong></article>
        <article className="blue"><FiWifi /><span>IPs repetidas</span><strong>{counters.repeatedIps}</strong></article>
      </section>

      <div className="admin-security-tabs">
        <button className={tab === "users" ? "active" : ""} onClick={() => setTab("users")} type="button">Usuarios</button>
        <button className={tab === "suspicious" ? "active" : ""} onClick={() => setTab("suspicious")} type="button">Sospechosos</button>
        <button className={tab === "ips" ? "active" : ""} onClick={() => setTab("ips")} type="button">IPs repetidas</button>
        <button className={tab === "banned" ? "active" : ""} onClick={() => setTab("banned")} type="button">Baneados</button>
      </div>

      {loading ? (
        <div className="panel">Cargando seguridad...</div>
      ) : tab === "ips" ? (
        <div className="admin-security-list">
          {ips.length === 0 && <div className="panel admin-empty">No hay IPs repetidas.</div>}
          {ips.map((item) => (
            <article className={`admin-security-card ${item.risk_status}`} key={item.ip}>
              <div className="admin-security-card-top">
                <div>
                  <h3>{item.ip}</h3>
                  <p>{item.users}</p>
                </div>
                <span className={`risk-pill ${item.risk_status}`}>{riskLabel(item.risk_status)}</span>
              </div>
              <div className="admin-security-grid">
                <div><span>Total cuentas</span><strong>{item.total_accounts}</strong></div>
                <div><span>GreenVest activas</span><strong>{item.active_mining_accounts}</strong></div>
                <div><span>Inversión activa</span><strong>{money(item.active_invested_usdt)} USDT</strong></div>
              </div>
              <div className="admin-security-actions">
                <button type="button" onClick={() => handleMarkIp(item)} disabled={processing === `ip-${item.ip}`}>
                  <FiAlertTriangle /> Marcar cuentas sospechosas
                </button>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <div className="admin-security-list">
          {visibleUsers.length === 0 && <div className="panel admin-empty">No hay registros para esta vista.</div>}
          {visibleUsers.map((user) => (
            <article className={`admin-security-card ${user.risk_status}`} key={user.id}>
              <div className="admin-security-card-top">
                <div>
                  <h3>{user.email}</h3>
                  <p>ID {user.id} · Referido por: {user.sponsor_email || "-"}</p>
                </div>
                <span className={`risk-pill ${user.risk_status}`}>{riskLabel(user.risk_status)}</span>
              </div>

              <div className="admin-security-grid">
                <div><span>Nivel</span><strong>{user.plan_level ? `GreenVest-${user.plan_level}` : "Sin GreenVest"}</strong></div>
                <div><span>Inversión</span><strong>{money(user.invested_amount)} USDT</strong></div>
                <div><span>IP registro</span><strong>{user.register_ip || "-"}</strong></div>
                <div><span>Última IP</span><strong>{user.last_login_ip || "-"}</strong></div>
                <div><span>Cuentas misma IP</span><strong>{user.related_ip_accounts || 0}</strong></div>
                <div><span>Último login</span><strong>{shortDate(user.last_login_at)}</strong></div>
              </div>

              {(user.suspicious_reason || user.banned_reason) && (
                <div className="admin-security-note">
                  <FiShield />
                  <span>{user.banned_reason || user.suspicious_reason}</span>
                </div>
              )}

              <div className="admin-security-actions">
                <button type="button" onClick={() => handleEvents(user)} disabled={processing === `events-${user.id}`}>
                  <FiEye /> Historial
                </button>
                {user.is_suspicious ? (
                  <button type="button" onClick={() => handleClearSuspicious(user)} disabled={processing === `clear-${user.id}`}>
                    <FiCheckCircle /> Quitar sospecha
                  </button>
                ) : (
                  <button type="button" onClick={() => handleMarkSuspicious(user)} disabled={processing === `suspicious-${user.id}`}>
                    <FiAlertTriangle /> Marcar sospechoso
                  </button>
                )}
                {user.is_banned ? (
                  <button className="ok" type="button" onClick={() => handleUnban(user)} disabled={processing === `unban-${user.id}`}>
                    Desbanear
                  </button>
                ) : (
                  <button className="danger" type="button" onClick={() => handleBan(user)} disabled={processing === `ban-${user.id}`}>
                    <FiSlash /> Banear
                  </button>
                )}
              </div>
            </article>
          ))}
        </div>
      )}

      {eventsUser && (
        <div className="admin-security-modal-backdrop" onClick={() => setEventsUser(null)}>
          <div className="admin-security-modal" onClick={(event) => event.stopPropagation()}>
            <div className="admin-security-modal-title">
              <div>
                <h3>Historial de seguridad</h3>
                <p>{eventsUser.email}</p>
              </div>
              <button type="button" onClick={() => setEventsUser(null)}>Cerrar</button>
            </div>
            {events.length === 0 ? (
              <div className="admin-empty">Sin eventos registrados.</div>
            ) : (
              events.map((event) => (
                <div className="security-event-row" key={event.id}>
                  <strong>{event.event_type}</strong>
                  <span>{shortDate(event.created_at)}</span>
                  <p>{event.reason || "-"}</p>
                  {event.ip_address && <small>IP: {event.ip_address}</small>}
                  {event.created_by_email && <small>Admin: {event.created_by_email}</small>}
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
