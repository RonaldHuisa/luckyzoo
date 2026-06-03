import React, { useEffect, useState } from "react";
import {
  FiArrowLeft,
  FiRefreshCw,
  FiDollarSign,
  FiUsers,
  FiClock,
  FiCheckCircle,
  FiAlertCircle,
  FiTrendingUp,
  FiShield,
  FiDownloadCloud,
  FiPlusCircle,
} from "react-icons/fi";
import { useNavigate } from "react-router-dom";
import { getAdminStatus } from "../services/authService";

function money(value) {
  return Number(value || 0).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function number(value) {
  return Number(value || 0).toLocaleString("en-US");
}

export default function AdminStatus() {
  const navigate = useNavigate();

  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");

  const loadStatus = async () => {
    try {
      setLoading(true);
      setMessage("");
      const data = await getAdminStatus();
      setStatus(data);
    } catch (error) {
      setMessage(error.message || "No se pudo cargar el estado.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadStatus();
  }, []);

  const totals = status?.totals || {};
  const counts = status?.counts || {};
  const sweep = status?.sweep || {};

  return (
    <div className="page admin-status-page">
      <div className="admin-status-header">
        <button className="icon-btn" type="button" onClick={() => navigate("/home")}>
          <FiArrowLeft />
        </button>

        <div>
          <div className="eyebrow">Panel Admin</div>
          <h2>Estado financiero</h2>
        </div>

        <button className="icon-btn ghost-icon" type="button" onClick={loadStatus}>
          <FiRefreshCw />
        </button>
      </div>

      {message && <div className="admin-status-alert">{message}</div>}

      {loading ? (
        <div className="panel admin-status-loading">Cargando resumen...</div>
      ) : (
        <>
          <section className="panel admin-status-main-card">
            <div className="admin-status-main-title">
              <span className="admin-status-icon mint">
                <FiDollarSign />
              </span>

              <div>
                <span>Inversión recargada</span>
                <strong>{money(totals.totalDepositedUsdt)} USDT</strong>
              </div>
            </div>

            <div className="admin-status-main-grid">
              <div>
                <span>Hoy</span>
                <strong>{money(totals.depositsTodayUsdt)}</strong>
              </div>

              <div>
                <span>Recargars</span>
                <strong>{number(totals.totalDepositCount)}</strong>
              </div>
            </div>
          </section>

          <section className="admin-status-grid">
            <article className="admin-status-card success">
              <span className="admin-status-icon">
                <FiCheckCircle />
              </span>
              <p>Retiros pagados</p>
              <strong>{money(totals.paidWithdrawalsUsdt)} USDT</strong>
              <small>{number(counts.paidWithdrawals)} operaciones</small>
            </article>

            <article className="admin-status-card warning">
              <span className="admin-status-icon">
                <FiClock />
              </span>
              <p>Pendiente por pagar</p>
              <strong>{money(totals.pendingWithdrawalsUsdt)} USDT</strong>
              <small>{number(counts.pendingWithdrawals)} solicitudes</small>
            </article>

            <article className="admin-status-card blue">
              <span className="admin-status-icon">
                <FiTrendingUp />
              </span>
              <p>Vendido en VIP</p>
              <strong>{money(totals.totalVipSoldUsdt)} USDT</strong>
              <small>{number(counts.activeVipPurchases)} VIP activos</small>
            </article>

            <article className="admin-status-card purple">
              <span className="admin-status-icon">
                <FiUsers />
              </span>
              <p>Usuarios</p>
              <strong>{number(counts.totalUsers)}</strong>
              <small>{number(counts.newUsersToday)} nuevos hoy</small>
            </article>
          </section>


          <section className="panel admin-status-section">
            <div className="admin-status-section-title admin-status-section-title-action">
              <FiShield />
              <div>
                <h3>Seguridad / Antifraude</h3>
                <p>Revisa IPs repetidas, usuarios sospechosos y cuentas restringidas.</p>
              </div>
              <button className="admin-status-small-action" type="button" onClick={() => navigate("/admin/security")}>
                <FiShield />
                Abrir
              </button>
            </div>
          </section>

          <section className="panel admin-status-section">
            <div className="admin-status-section-title admin-status-section-title-action">
              <FiPlusCircle />
              <div>
                <h3>Promotores y ajustes</h3>
                <p>Ranking de invitados directos con inversión y recargas manuales administrativas.</p>
              </div>
              <button className="admin-status-small-action" type="button" onClick={() => navigate("/admin/growth")}>
                <FiPlusCircle />
                Abrir
              </button>
            </div>
          </section>

          <section className="panel admin-status-section">
            <div className="admin-status-section-title">
              <FiShield />
              <div>
                <h3>Balance operativo</h3>
                <p>Referencia rápida para saber cuánto falta cubrir.</p>
              </div>
            </div>

            <div className="admin-status-list">
              <div>
                <span>Disponible luego de retiros pagados</span>
                <strong>{money(totals.netAfterPaidWithdrawalsUsdt)} USDT</strong>
              </div>

              <div>
                <span>Obligación estimada</span>
                <strong>{money(totals.estimatedObligationUsdt)} USDT</strong>
              </div>

              <div>
                <span>Saldo recarga usuarios</span>
                <strong>{money(totals.usersRechargeBalanceUsdt)} USDT</strong>
              </div>

              <div>
                <span>Saldo retirable usuarios</span>
                <strong>{money(totals.usersWithdrawableBalanceUsdt)} USDT</strong>
              </div>

              <div>
                <span>Restante después de pendientes</span>
                <strong>{money(totals.remainingAfterPendingUsdt)} USDT</strong>
              </div>
            </div>
          </section>


          <section className="panel admin-status-section">
            <div className="admin-status-section-title admin-status-section-title-action">
              <FiPlusCircle />
              <div>
                <h3>Evento de promoción</h3>
                <p>Consulta recompensas reclamadas y registros contabilizados.</p>
              </div>
              <button className="admin-status-small-action" type="button" onClick={() => navigate("/admin/promo-event")}>
                <FiPlusCircle />
                Gestionar
              </button>
            </div>

            <div className="admin-status-list compact">
              <div>
                <span>Evento activo</span>
                <strong>22/05/2026 - 30/05/2026</strong>
              </div>

              <div>
                <span>Recompensa máxima</span>
                <strong>50.00 USDT total</strong>
              </div>
            </div>
          </section>

          <section className="panel admin-status-section">
            <div className="admin-status-section-title admin-status-section-title-action">
              <FiAlertCircle />
              <div>
                <h3>Movimientos pendientes</h3>
                <p>Recargars que aún deben moverse a la wallet central.</p>
              </div>
              <button className="admin-status-small-action" type="button" onClick={() => navigate("/admin/deposits")}>
                <FiDownloadCloud />
                Gestionar
              </button>
            </div>

            <div className="admin-status-list compact">
              <div>
                <span>Sweep pendiente</span>
                <strong>{money(sweep.pendingSweepUsdt)} USDT</strong>
              </div>

              <div>
                <span>Sweep fallido</span>
                <strong>{money(sweep.failedSweepUsdt)} USDT</strong>
              </div>

              <div>
                <span>Total por mover</span>
                <strong>{money(sweep.sweepRemainingUsdt)} USDT</strong>
              </div>

              <div>
                <span>Registros por revisar</span>
                <strong>{number(counts.sweepRemainingCount)}</strong>
              </div>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
