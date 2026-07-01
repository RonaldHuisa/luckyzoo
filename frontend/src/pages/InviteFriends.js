import React, { useEffect, useState } from "react";
import { FiCheckCircle, FiCopy, FiUsers, FiArrowRight } from "react-icons/fi";
import api from "../services/api";

const moneyParts = (value) => {
  const amount = Number(value || 0).toFixed(2);
  return { amount, unit: "USDT" };
};

function MoneyInline({ value, className = "" }) {
  const { amount, unit } = moneyParts(value);
  return (
    <span className={`money-inline ${className}`.trim()}>
      <span className="money-amount">{amount}</span>
      <span className="money-unit">{unit}</span>
    </span>
  );
}

function TeamMoney({ value, className = "" }) {
  const { amount, unit } = moneyParts(value);
  return (
    <div className={`team-money ${className}`.trim()}>
      <span className="team-money-amount">{amount}</span>
      <span className="team-money-unit">{unit}</span>
    </div>
  );
}

const commissionPercent = (level) => (Number(level) === 1 ? 8 : 1);

export default function InviteFriends() {
  const [data, setData] = useState(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    api.get("/referrals/dashboard").then((res) => setData(res.data)).catch((err) => setError(err.message));
  }, []);

  const copy = async () => {
    await navigator.clipboard.writeText(data?.referralLink || "");
    setCopied(true);
    setTimeout(() => setCopied(false), 1400);
  };

  return (
    <div className="page-stack invite-page">
      {copied && (
        <div className="invite-toast-backdrop" aria-live="polite">
          <div className="invite-toast-box"><FiCheckCircle /><strong>Enlace copiado</strong></div>
        </div>
      )}
      <section className="invite-hero-card">
        <div>
          <span className="eyebrow">Equipo Royal</span>
          <h2>Invitación</h2>
          <p>Comparte tu código y revisa tu equipo por nivel.</p>
        </div>
        <FiUsers className="header-icon" />
      </section>
      {error && <div className="alert error">{error}</div>}

      <section className="invite-code-panel">
        <div className="invite-code-top">
          <div>
            <span>Código personal</span>
            <strong>{data?.referralCode || "Cargando..."}</strong>
          </div>
          <button className="mini-copy-btn" onClick={copy}><FiCopy /> Copiar</button>
        </div>
        <input className="invite-link-input" readOnly value={data?.referralLink || ""} />
      </section>

      <section className="invite-stats-row invite-stats-row-two">
        <article className="invite-stat-card team-income-card">
          <span>Total</span>
          <TeamMoney value={data?.totalIncome} />
          <small>Comisiones</small>
        </article>
        <article className="invite-stat-card team-income-card">
          <span>Hoy</span>
          <TeamMoney value={data?.todayIncome} />
          <small>Diario</small>
        </article>
      </section>

      <section className="invite-level-summary">
        {(data?.levels || []).map((level) => (
          <article className="invite-level-card" key={level.level}>
            <div className="invite-level-main">
              <span>Nivel {level.level} <em>({commissionPercent(level.level)}%)</em></span>
              <strong>{level.activeMembers}/{level.totalMembers}</strong>
              <small>Activos / total</small>
            </div>
            <div className="invite-level-amount">
              <TeamMoney value={level.totalCommission} className="team-money-level" />
              <small>Comisión</small>
            </div>
          </article>
        ))}
      </section>

      <section className="invite-note-card">
        <FiArrowRight />
        <span>De acuerdo a tu plan, podrás recibir más comisiones de tus invitados.</span>
      </section>
    </div>
  );
}
