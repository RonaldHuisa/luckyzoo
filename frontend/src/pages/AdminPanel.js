import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { FiKey, FiMessageCircle, FiRefreshCw, FiSave, FiUsers } from "react-icons/fi";
import api from "../services/api";

const money = (value) => `${Number(value || 0).toFixed(2)} USDT`;

function formatDate(value) {
  if (!value) return "—";
  try {
    return new Intl.DateTimeFormat("es-PE", {
      day: "2-digit",
      month: "2-digit",
      year: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(value));
  } catch {
    return "—";
  }
}

function shortWallet(value = "") {
  const text = String(value || "");
  if (!text) return "—";
  if (text.length <= 18) return text;
  return `${text.slice(0, 8)}...${text.slice(-8)}`;
}

export default function AdminPanel() {
  const [dashboard, setDashboard] = useState(null);
  const [users, setUsers] = useState([]);
  const [withdrawals, setWithdrawals] = useState([]);
  const [investments, setInvestments] = useState([]);
  const [recharges, setRecharges] = useState({ normalRecharges: [], adminRecharges: [] });
  const [search, setSearch] = useState("");
  const [activeSection, setActiveSection] = useState("usuarios");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  const kpis = useMemo(() => [
    { label: "Usuarios registrados", value: dashboard?.totalUsers ?? 0 },
    { label: "Total invertido usuarios", value: money(dashboard?.totalInvested) },
    { label: "Total retirado pagado", value: money(dashboard?.totalWithdrawn) },
    { label: "Recargas normales", value: money(dashboard?.normalRecharges) },
    { label: "Recargas admin", value: money(dashboard?.adminRecharges) },
    { label: "Tickets abiertos", value: dashboard?.openTickets ?? 0 },
  ], [dashboard]);

  const showMessage = (text) => {
    setMessage(text);
    window.clearTimeout(window.__adminPanelMessage);
    window.__adminPanelMessage = window.setTimeout(() => setMessage(""), 3200);
  };

  const load = async () => {
    setLoading(true);
    try {
      const [dashboardRes, usersRes, withdrawalsRes, investmentsRes, rechargesRes] = await Promise.all([
        api.get("/admin/panel/dashboard"),
        api.get("/admin/panel/users"),
        api.get("/admin/panel/withdrawals"),
        api.get("/admin/panel/investments"),
        api.get("/admin/panel/recharges"),
      ]);
      setDashboard(dashboardRes.data);
      setUsers(usersRes.data.users || []);
      setWithdrawals(withdrawalsRes.data.withdrawals || []);
      setInvestments(investmentsRes.data.investments || []);
      setRecharges(rechargesRes.data || { normalRecharges: [], adminRecharges: [] });
    } catch (err) {
      showMessage(err.message || "No se pudo cargar el panel admin.");
    } finally {
      setLoading(false);
    }
  };

  const searchUsers = async () => {
    try {
      const { data } = await api.get(`/admin/panel/users${search ? `?search=${encodeURIComponent(search)}` : ""}`);
      setUsers(data.users || []);
    } catch (err) {
      showMessage(err.message || "No se pudo buscar usuarios.");
    }
  };

  const updateLimit = async (user) => {
    const value = window.prompt(`Límite de referidos para ${user.email}`, String(user.withdraw_required_referrals || 0));
    if (value === null) return;

    try {
      await api.patch(`/admin/panel/users/${user.id}/referral-limit`, { requiredReferrals: Number(value || 0) });
      showMessage("Límite actualizado.");
      await searchUsers();
    } catch (err) {
      showMessage(err.message || "No se pudo actualizar límite.");
    }
  };

  const changePassword = async (user) => {
    const value = window.prompt(`Nueva contraseña para ${user.email}`);
    if (!value) return;

    try {
      await api.patch(`/admin/panel/users/${user.id}/password`, { newPassword: value });
      showMessage("Contraseña actualizada.");
    } catch (err) {
      showMessage(err.message || "No se pudo cambiar contraseña.");
    }
  };

  const changeWallet = async (user) => {
    const network = window.prompt("Red de retiro: BEP20-USDT o POLYGON-USDT", user.withdrawal_network || "BEP20-USDT");
    if (!network) return;
    const wallet = window.prompt(`Nueva wallet para ${user.email}`, user.withdrawal_address || "0x");
    if (!wallet) return;

    try {
      await api.patch(`/admin/panel/users/${user.id}/wallet`, {
        network,
        withdrawalAddress: wallet,
      });
      showMessage("Wallet actualizada.");
      await searchUsers();
    } catch (err) {
      showMessage(err.message || "No se pudo cambiar wallet.");
    }
  };

  useEffect(() => {
    load();
  }, []);

  return (
    <div className="admin-v55">
      {message && <div className="admin-v55-toast">{message}</div>}

      <header className="admin-v55-head">
        <div>
          <span>Lucky Zoo Admin</span>
          <h1>Panel de administración</h1>
          <p>Usuarios, tickets, retiros, inversiones, recargas y límites.</p>
        </div>
        <div className="admin-v55-head-actions">
          <Link to="/admin/support"><FiMessageCircle /> Tickets</Link>
          <button onClick={load} disabled={loading}><FiRefreshCw /> Actualizar</button>
        </div>
      </header>

      <section className="admin-v55-kpis">
        {kpis.map((item) => (
          <article key={item.label}>
            <span>{item.label}</span>
            <strong>{item.value}</strong>
          </article>
        ))}
      </section>

      <nav className="admin-v55-tabs">
        {[
          ["usuarios", "Usuarios"],
          ["retiros", "Retiros"],
          ["inversiones", "Inversiones"],
          ["recargas", "Recargas"],
        ].map(([key, label]) => (
          <button key={key} onClick={() => setActiveSection(key)} className={activeSection === key ? "active" : ""}>
            {label}
          </button>
        ))}
      </nav>

      {activeSection === "usuarios" && (
        <section className="admin-v55-section">
          <div className="admin-v55-section-head">
            <div>
              <h2>Usuarios</h2>
              <p>Revisa referidos, referidor, inversión, retiro, límites y wallet.</p>
            </div>
            <div className="admin-v55-search">
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar email, código o ID" />
              <button onClick={searchUsers}>Buscar</button>
            </div>
          </div>

          <div className="admin-v55-table-wrap">
            <table className="admin-v55-table">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Usuario</th>
                  <th>VIP</th>
                  <th>Referidor</th>
                  <th>Invitados</th>
                  <th>Límite retiro</th>
                  <th>Invertido</th>
                  <th>Retirado</th>
                  <th>Wallet</th>
                  <th>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {users.map((user) => {
                  const missing = Math.max(Number(user.withdraw_required_referrals || 0) - Number(user.direct_referrals || 0), 0);
                  return (
                    <tr key={user.id}>
                      <td>#{user.id}</td>
                      <td>
                        <strong>{user.email}</strong>
                        <small>{user.is_admin ? "Admin" : "Usuario"} · Código {user.referral_code || "—"}</small>
                      </td>
                      <td>VIP {user.active_vip_level || 0}</td>
                      <td>
                        <strong>{user.referrer_email || "—"}</strong>
                        <small>{user.referrer_code || ""}</small>
                      </td>
                      <td>{user.direct_referrals || 0}</td>
                      <td>
                        <strong>{user.withdraw_required_referrals || 0}</strong>
                        <small>{missing > 0 ? `Faltan ${missing}` : "OK"}</small>
                      </td>
                      <td>{money(user.total_invested)}</td>
                      <td>{money(user.total_withdrawn)}</td>
                      <td>
                        <strong>{user.withdrawal_network || "—"}</strong>
                        <small>{shortWallet(user.withdrawal_address)}</small>
                      </td>
                      <td>
                        <div className="admin-v55-actions">
                          <button onClick={() => updateLimit(user)}><FiSave /> Límite</button>
                          <button onClick={() => changePassword(user)}><FiKey /> Password</button>
                          <button onClick={() => changeWallet(user)}>Wallet</button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {activeSection === "retiros" && (
        <section className="admin-v55-section">
          <h2>Historial de retiros</h2>
          <div className="admin-v55-table-wrap">
            <table className="admin-v55-table">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Usuario</th>
                  <th>Monto</th>
                  <th>Recibe</th>
                  <th>Red</th>
                  <th>Wallet</th>
                  <th>Estado</th>
                  <th>Fecha</th>
                </tr>
              </thead>
              <tbody>
                {withdrawals.map((item) => (
                  <tr key={item.id}>
                    <td>#{item.id}</td>
                    <td>{item.email}</td>
                    <td>{money(item.amount_requested)}</td>
                    <td>{money(item.amount_to_receive)}</td>
                    <td>{item.network}</td>
                    <td>{shortWallet(item.withdrawal_address)}</td>
                    <td>{item.status}</td>
                    <td>{formatDate(item.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {activeSection === "inversiones" && (
        <section className="admin-v55-section">
          <h2>Usuarios que invirtieron</h2>
          <div className="admin-v55-table-wrap">
            <table className="admin-v55-table">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Usuario</th>
                  <th>Plan</th>
                  <th>Monto</th>
                  <th>Estado</th>
                  <th>Fecha</th>
                </tr>
              </thead>
              <tbody>
                {investments.map((item) => (
                  <tr key={item.id}>
                    <td>#{item.id}</td>
                    <td>{item.email}</td>
                    <td>VIP {item.level} · {item.package_name || ""}</td>
                    <td>{money(item.price_usdt)}</td>
                    <td>{item.status}</td>
                    <td>{formatDate(item.purchased_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {activeSection === "recargas" && (
        <section className="admin-v55-section">
          <h2>Recargas normales</h2>
          <div className="admin-v55-table-wrap">
            <table className="admin-v55-table">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Usuario</th>
                  <th>Red</th>
                  <th>Monto</th>
                  <th>TX</th>
                  <th>Fecha</th>
                </tr>
              </thead>
              <tbody>
                {(recharges.normalRecharges || []).map((item) => (
                  <tr key={`n-${item.id}`}>
                    <td>#{item.id}</td>
                    <td>{item.email}</td>
                    <td>{item.network}</td>
                    <td>{money(item.amount_usdt)}</td>
                    <td>{shortWallet(item.tx_hash)}</td>
                    <td>{formatDate(item.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <h2>Recargas hechas por admin</h2>
          <div className="admin-v55-table-wrap">
            <table className="admin-v55-table">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Usuario</th>
                  <th>Tipo</th>
                  <th>Título</th>
                  <th>Monto</th>
                  <th>Fecha</th>
                </tr>
              </thead>
              <tbody>
                {(recharges.adminRecharges || []).map((item) => (
                  <tr key={`a-${item.id}`}>
                    <td>#{item.id}</td>
                    <td>{item.email}</td>
                    <td>{item.type}</td>
                    <td>{item.title}</td>
                    <td>{money(item.amount_usdt)}</td>
                    <td>{formatDate(item.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}
