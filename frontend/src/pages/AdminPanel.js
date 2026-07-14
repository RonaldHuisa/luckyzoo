import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { FiExternalLink, FiKey, FiMessageCircle, FiPlusCircle, FiRefreshCw, FiSave } from "react-icons/fi";
import api from "../services/api";

const money = (value) => `${Number(value || 0).toFixed(2)} USDT`;
const coins = (value) => `${Number(value || 0).toLocaleString("es-PE")} monedas`;

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

function shortText(value = "", left = 8, right = 8) {
  const text = String(value || "");
  if (!text) return "—";
  if (text.length <= left + right + 3) return text;
  return `${text.slice(0, left)}...${text.slice(-right)}`;
}

function explorerBase(network = "") {
  const text = String(network || "").toUpperCase();
  if (text.includes("POLYGON")) return "https://polygonscan.com";
  if (text.includes("BEP") || text.includes("BSC") || text.includes("BNB")) return "https://bscscan.com";
  return "";
}

function txUrl(network, txHash) {
  const base = explorerBase(network);
  const hash = String(txHash || "").trim();
  return base && hash ? `${base}/tx/${hash}` : "";
}

function addressUrl(network, address) {
  const base = explorerBase(network);
  const wallet = String(address || "").trim();
  return base && wallet ? `${base}/address/${wallet}` : "";
}

function safeWallets(value) {
  if (Array.isArray(value)) return value;
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function vipLabel(level) {
  const numeric = Number(level || 0);
  return numeric > 0 ? `VIP ${numeric}` : "Gratis";
}

function adminAdjustmentAmount(item) {
  const direction = item?.direction === "debit" ? "-" : "+";
  if (item?.balance_type === "roulette_coins") {
    const meta = item?.metadata || {};
    const amount = Number(meta.amount || meta.amountCoins || meta.amount_coins || 0);
    return `${direction}${amount.toLocaleString("es-PE")} monedas`;
  }
  return `${direction}${money(item?.amount_usdt)}`;
}

function normalizeBalanceType(value = "") {
  const raw = String(value || "").trim().toLowerCase();
  if (["recarga", "recharge", "saldo recarga"].includes(raw)) return "recharge";
  if (["retirable", "withdrawable", "saldo retirable"].includes(raw)) return "withdrawable";
  if (["monedas", "coins", "ruleta"].includes(raw)) return "coins";
  return "";
}

function normalizeDirection(value = "") {
  const raw = String(value || "").trim().toLowerCase();
  if (["añadir", "agregar", "sumar", "credit", "credito", "crédito", "+"].includes(raw)) return "credit";
  if (["quitar", "restar", "descontar", "debit", "debito", "débito", "-"].includes(raw)) return "debit";
  return "";
}

function ExplorerLink({ href, children }) {
  if (!href) return <span>—</span>;
  return (
    <a className="admin-v68-scan-link" href={href} target="_blank" rel="noreferrer">
      {children} <FiExternalLink />
    </a>
  );
}

const TOP_OPTIONS = {
  topCoins: {
    key: "topCoins",
    label: "Más monedas ganadas",
    helper: "Ordenado por monedas actuales",
    valueLabel: "Monedas",
    valueRender: (user) => coins(user.roulette_coins),
    metaRender: (user) => `${money(user.withdrawable_usdt)} retirable · ${Number(user.direct_referrals || 0)} invitados`,
  },
  topWithdrawable: {
    key: "topWithdrawable",
    label: "Mayor saldo retirable",
    helper: "Usuarios con más saldo disponible para retiro",
    valueLabel: "Saldo retirable",
    valueRender: (user) => money(user.withdrawable_usdt),
    metaRender: (user) => `${coins(user.roulette_coins)} · ${Number(user.withdrawals_count || 0)} retiros`,
  },
  topWithdrawals: {
    key: "topWithdrawals",
    label: "Más USDT retirado",
    helper: "Ordenado por total retirado en USDT",
    valueLabel: "Total retirado",
    valueRender: (user) => money(user.total_withdrawn),
    metaRender: (user) => `${Number(user.withdrawals_count || 0)} solicitud(es) de retiro`,
  },
  topReferrals: {
    key: "topReferrals",
    label: "Mayor cantidad de invitados",
    helper: "Ordenado por referidos directos",
    valueLabel: "Invitados",
    valueRender: (user) => `${Number(user.direct_referrals || 0)} invitados`,
    metaRender: (user) => `${coins(user.roulette_coins)} · ${money(user.withdrawable_usdt)} retirable`,
  },
};

function TopList({ option, rows }) {
  return (
    <section className="admin-v69-top-list-card">
      <div className="admin-v69-top-list-head">
        <div>
          <h3>{option.label}</h3>
          <span>{option.helper}</span>
        </div>
        <strong>{option.valueLabel}</strong>
      </div>

      <div className="admin-v69-top-list">
        {(rows || []).map((user, index) => (
          <article key={`${option.key}-${user.id}`} className="admin-v69-top-row">
            <div className="admin-v69-rank">#{index + 1}</div>
            <div className="admin-v69-user">
              <strong>{user.email}</strong>
              <span>ID #{user.id} · Código {user.referral_code || "—"}</span>
            </div>
            <div className="admin-v69-vip">{vipLabel(user.active_vip_level)}</div>
            <div className="admin-v69-value">
              <strong>{option.valueRender(user)}</strong>
              <span>{option.metaRender(user)}</span>
            </div>
          </article>
        ))}

        {!(rows || []).length && (
          <p className="admin-v69-empty">Sin datos para este filtro.</p>
        )}
      </div>
    </section>
  );
}

export default function AdminPanel() {
  const [dashboard, setDashboard] = useState(null);
  const [users, setUsers] = useState([]);
  const [withdrawals, setWithdrawals] = useState([]);
  const [investments, setInvestments] = useState([]);
  const [recharges, setRecharges] = useState({ normalRecharges: [], adminRecharges: [] });
  const [topUsers, setTopUsers] = useState({ topCoins: [], topWithdrawable: [], topWithdrawals: [], topReferrals: [] });
  const [topVipFilter, setTopVipFilter] = useState("all");
  const [topMetricFilter, setTopMetricFilter] = useState("topCoins");
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

  const loadTops = async (vip = topVipFilter) => {
    const { data } = await api.get(`/admin/panel/tops?vip=${encodeURIComponent(vip)}`);
    setTopUsers(data || { topCoins: [], topWithdrawable: [], topWithdrawals: [], topReferrals: [] });
  };

  const load = async () => {
    setLoading(true);
    try {
      const [dashboardRes, usersRes, withdrawalsRes, investmentsRes, rechargesRes, topsRes] = await Promise.all([
        api.get("/admin/panel/dashboard"),
        api.get("/admin/panel/users"),
        api.get("/admin/panel/withdrawals"),
        api.get("/admin/panel/investments"),
        api.get("/admin/panel/recharges"),
        api.get(`/admin/panel/tops?vip=${encodeURIComponent(topVipFilter)}`),
      ]);
      setDashboard(dashboardRes.data);
      setUsers(usersRes.data.users || []);
      setWithdrawals(withdrawalsRes.data.withdrawals || []);
      setInvestments(investmentsRes.data.investments || []);
      setRecharges(rechargesRes.data || { normalRecharges: [], adminRecharges: [] });
      setTopUsers(topsRes.data || { topCoins: [], topWithdrawable: [], topWithdrawals: [], topReferrals: [] });
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

  const adjustBalance = async (user) => {
    const typeRaw = window.prompt("¿Qué saldo quieres ajustar? Escribe: recarga, retirable o monedas", "recarga");
    if (!typeRaw) return;
    const balanceType = normalizeBalanceType(typeRaw);
    if (!balanceType) {
      showMessage("Tipo inválido. Usa recarga, retirable o monedas.");
      return;
    }

    const directionRaw = window.prompt("¿Quieres añadir o quitar?", "añadir");
    if (!directionRaw) return;
    const direction = normalizeDirection(directionRaw);
    if (!direction) {
      showMessage("Operación inválida. Escribe añadir o quitar.");
      return;
    }

    const amountRaw = window.prompt(balanceType === "coins" ? "Cantidad de monedas" : "Cantidad en USDT", "1");
    if (!amountRaw) return;
    const amount = Number(amountRaw);
    if (!Number.isFinite(amount) || amount <= 0) {
      showMessage("Monto inválido.");
      return;
    }

    const reason = window.prompt("Motivo del ajuste", "Ajuste manual admin") || "Ajuste manual admin";

    try {
      await api.patch(`/admin/panel/users/${user.id}/balance`, { balanceType, direction, amount, reason });
      showMessage(direction === "credit" ? "Saldo añadido." : "Saldo descontado.");
      await Promise.all([searchUsers(), loadTops(topVipFilter), api.get("/admin/panel/dashboard").then((res) => setDashboard(res.data))]);
    } catch (err) {
      showMessage(err.message || "No se pudo ajustar saldo.");
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const selectedTopOption = TOP_OPTIONS[topMetricFilter] || TOP_OPTIONS.topCoins;
  const selectedTopRows = topUsers[selectedTopOption.key] || [];

  return (
    <div className="admin-v55 admin-v68">
      {message && <div className="admin-v55-toast">{message}</div>}

      <header className="admin-v55-head">
        <div>
          <span>Lucky Zoo Admin</span>
          <h1>Panel de administración</h1>
          <p>Usuarios, tickets, retiros, inversiones, recargas, tops, wallets y límites.</p>
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
          ["tops", "TOP"],
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
              <p>Revisa fecha de creación, referidos, saldos, wallets, scans y ajustes.</p>
            </div>
            <div className="admin-v55-search">
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar email, código o ID" />
              <button onClick={searchUsers}>Buscar</button>
            </div>
          </div>

          <div className="admin-v55-table-wrap">
            <table className="admin-v55-table admin-v68-users-table">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Usuario</th>
                  <th>Creado</th>
                  <th>VIP</th>
                  <th>Referidor</th>
                  <th>Invitados</th>
                  <th>Saldos</th>
                  <th>Inversión / retiro</th>
                  <th>Wallet recarga</th>
                  <th>Wallet retiro</th>
                  <th>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {users.map((user) => {
                  const missing = Math.max(Number(user.withdraw_required_referrals || 0) - Number(user.direct_referrals || 0), 0);
                  const depositWallets = safeWallets(user.deposit_wallets);
                  return (
                    <tr key={user.id}>
                      <td>#{user.id}</td>
                      <td>
                        <strong>{user.email}</strong>
                        <small>{user.is_admin ? "Admin" : "Usuario"} · Código {user.referral_code || "—"}</small>
                      </td>
                      <td>{formatDate(user.created_at)}</td>
                      <td>{vipLabel(user.active_vip_level)}</td>
                      <td>
                        <strong>{user.referrer_email || "—"}</strong>
                        <small>{user.referrer_code || ""}</small>
                      </td>
                      <td>
                        <strong>{user.direct_referrals || 0}</strong>
                        <small>Límite retiro {user.withdraw_required_referrals || 0} · {missing > 0 ? `Faltan ${missing}` : "OK"}</small>
                      </td>
                      <td>
                        <div className="admin-v68-balance-stack">
                          <small>Recarga: <b>{money(user.balance_usdt)}</b></small>
                          <small>Retirable: <b>{money(user.withdrawable_usdt)}</b></small>
                          <small>Monedas: <b>{coins(user.roulette_coins)}</b></small>
                        </div>
                      </td>
                      <td>
                        <strong>{money(user.total_invested)}</strong>
                        <small>Retirado {money(user.total_withdrawn)} · {user.withdrawals_count || 0} retiros</small>
                        <small>Recargado {money(user.total_recharged)}</small>
                      </td>
                      <td>
                        <div className="admin-v68-wallet-links">
                          {depositWallets.length ? depositWallets.map((wallet, index) => (
                            <ExplorerLink key={`${user.id}-${wallet.network}-${index}`} href={addressUrl(wallet.network, wallet.address)}>
                              {wallet.network}: {shortText(wallet.address, 6, 6)}
                            </ExplorerLink>
                          )) : <span>—</span>}
                        </div>
                      </td>
                      <td>
                        <strong>{user.withdrawal_network || "—"}</strong>
                        <small>{shortText(user.withdrawal_address)}</small>
                        {user.withdrawal_address ? (
                          <ExplorerLink href={addressUrl(user.withdrawal_network, user.withdrawal_address)}>Ver scan</ExplorerLink>
                        ) : null}
                      </td>
                      <td>
                        <div className="admin-v55-actions admin-v68-actions">
                          <button onClick={() => adjustBalance(user)}><FiPlusCircle /> Saldo +/-</button>
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
                  <th>TX</th>
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
                    <td>
                      <span>{shortText(item.withdrawal_address)}</span>
                      <ExplorerLink href={addressUrl(item.network, item.withdrawal_address)}>Wallet</ExplorerLink>
                    </td>
                    <td><ExplorerLink href={txUrl(item.network, item.tx_hash)}>{shortText(item.tx_hash)}</ExplorerLink></td>
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
          <p className="admin-v68-section-note">Cada recarga muestra su transacción y wallet en BscScan o PolygonScan según la red.</p>
          <div className="admin-v55-table-wrap">
            <table className="admin-v55-table">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Usuario</th>
                  <th>Red</th>
                  <th>Monto</th>
                  <th>TX</th>
                  <th>Wallet destino</th>
                  <th>Estado</th>
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
                    <td><ExplorerLink href={txUrl(item.network, item.tx_hash)}>{shortText(item.tx_hash)}</ExplorerLink></td>
                    <td><ExplorerLink href={addressUrl(item.network, item.deposit_wallet_address)}>{shortText(item.deposit_wallet_address)}</ExplorerLink></td>
                    <td>{item.status}</td>
                    <td>{formatDate(item.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <h2>Recargas y ajustes hechos por admin</h2>
          <div className="admin-v55-table-wrap">
            <table className="admin-v55-table">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Usuario</th>
                  <th>Tipo</th>
                  <th>Saldo</th>
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
                    <td>{item.balance_type} · {item.direction}</td>
                    <td>{item.title}</td>
                    <td>{adminAdjustmentAmount(item)}</td>
                    <td>{formatDate(item.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {activeSection === "tops" && (
        <section className="admin-v55-section admin-v68-tops-section admin-v69-tops-section">
          <div className="admin-v69-top-header">
            <div>
              <h2>TOP usuarios</h2>
              <p>Elige el ranking y luego filtra por VIP. Todo se muestra en una sola lista compacta.</p>
            </div>

            <div className="admin-v69-top-controls">
              <label>
                <span>Ranking</span>
                <select value={topMetricFilter} onChange={(e) => setTopMetricFilter(e.target.value)}>
                  <option value="topCoins">Más monedas ganadas</option>
                  <option value="topWithdrawable">Mayor saldo retirable</option>
                  <option value="topWithdrawals">Más USDT retirado</option>
                  <option value="topReferrals">Mayor cantidad de invitados</option>
                </select>
              </label>

              <label>
                <span>VIP</span>
                <select
                  value={topVipFilter}
                  onChange={async (e) => {
                    const value = e.target.value;
                    setTopVipFilter(value);
                    try {
                      await loadTops(value);
                    } catch (err) {
                      showMessage(err.message || "No se pudo filtrar TOP.");
                    }
                  }}
                >
                  <option value="all">Todos los VIP</option>
                  <option value="0">Gratis / Pasantía</option>
                  <option value="1">VIP 1</option>
                  <option value="2">VIP 2</option>
                  <option value="3">VIP 3</option>
                  <option value="4">VIP 4</option>
                  <option value="5">VIP 5</option>
                </select>
              </label>

              <button onClick={() => loadTops(topVipFilter)}>Actualizar</button>
            </div>
          </div>

          <TopList option={selectedTopOption} rows={selectedTopRows} />
        </section>
      )}
    </div>
  );
}
