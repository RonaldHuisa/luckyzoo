import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  FiCalendar,
  FiCheck,
  FiChevronRight,
  FiCopy,
  FiHeadphones,
  FiSend,
  FiShield,
  FiUsers,
  FiVideo,
} from "react-icons/fi";
import api from "../services/api";

const money = (value) => `${Number(value || 0).toFixed(2)} USDT`;

function StatusPill({ children, tone = "neutral" }) {
  return <span className={`prelaunch-pill ${tone}`}>{children}</span>;
}

export default function PreLaunch() {
  const [data, setData] = useState(null);
  const [tiktokUrl, setTiktokUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState("");
  const [error, setError] = useState("");

  const user = useMemo(() => {
    try { return JSON.parse(localStorage.getItem("user") || "{}"); }
    catch { return {}; }
  }, []);

  const load = async () => {
    try {
      const res = await api.get("/prelaunch/status");
      setData(res.data);
      if (res.data?.tiktok?.url) setTiktokUrl(res.data.tiktok.url);
    } catch (err) {
      setError(err.message);
    }
  };

  useEffect(() => { load(); }, []);

  useEffect(() => {
    if (!toast) return undefined;
    const timer = setTimeout(() => setToast(""), 1700);
    return () => clearTimeout(timer);
  }, [toast]);

  const referralCode = data?.user?.referralCode || user.referral_code || user.referralCode || user.id || "--";
  const checkin = data?.checkin || {};
  const invite = data?.invite || {};
  const tiktok = data?.tiktok || {};
  const bonus = data?.bonus || {};
  const referralLink = `${window.location.origin}/register?ref=${referralCode}`;
  const checkinTotalReward = Number(checkin.maxDays || 5) * Number(checkin.rewardUsdt || 1);
  const inviteReward = Number(invite.rewardUsdt || 1);
  const tiktokReward = Number(tiktok.rewardUsdt || 3);
  const maxBonus = Number(bonus.maxUsdt || (checkinTotalReward + inviteReward + tiktokReward));
  const progressPercent = Math.min(100, (Number(bonus.totalEarnedUsdt || 0) / Math.max(1, maxBonus)) * 100);

  const copyReferral = async () => {
    try {
      await navigator.clipboard.writeText(referralLink);
      setToast("Enlace copiado");
    } catch {
      setToast("Copia tu enlace manualmente");
    }
  };

  const doCheckin = async () => {
    if (!checkin.canCheckin) {
      setToast(checkin.todayDone ? "Check-in completado hoy" : "Check-in no disponible");
      return;
    }

    setLoading(true);
    setError("");
    try {
      const res = await api.post("/prelaunch/checkin");
      setToast(res.data.message || "Check-in completado");
      setData(res.data.status);
    } catch (err) {
      setError(err.message);
      setToast(err.message);
    } finally {
      setLoading(false);
    }
  };

  const submitTikTok = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const res = await api.post("/prelaunch/tiktok", { url: tiktokUrl });
      setToast(res.data.message || "TikTok enviado");
      setData(res.data.status);
    } catch (err) {
      setError(err.message);
      setToast(err.message);
    } finally {
      setLoading(false);
    }
  };

  const tiktokTone = tiktok.status === "approved" ? "success" : tiktok.status === "pending" ? "warning" : tiktok.status === "rejected" ? "danger" : "neutral";
  const tiktokText = tiktok.status === "approved" ? "Aprobado" : tiktok.status === "pending" ? "En revisión" : tiktok.status === "rejected" ? "Rechazado" : "Pendiente";
  const inviteTone = invite.credited ? "success" : invite.validInvites > 0 ? "warning" : "neutral";
  const inviteText = invite.credited ? "Acreditado" : invite.validInvites > 0 ? "Validando" : "Pendiente";

  return (
    <div className="page-stack prelaunch-page prelaunch-v69">
      {toast && (
        <div className="prelaunch-toast" role="status">
          <strong>{toast}</strong>
        </div>
      )}

      <section className="prelaunch-hero prelaunch-hero-tech">
        <div className="prelaunch-tech-orbit" aria-hidden="true">
          <span />
          <i />
        </div>

        <div className="prelaunch-hero-copy">
          <div className="prelaunch-kicker">
            <span>Acceso fundador</span>
            <strong>ID {referralCode}</strong>
          </div>
          <h2>Pre-lanzamiento</h2>
          <p>Gana saldo de garantía hasta el martes 7 de julio.</p>
        </div>

        <div className="prelaunch-hero-badge">
          <img src="/prelaunch-rocket.png" alt="" aria-hidden="true" />
          <strong>{money(bonus.totalEarnedUsdt)}</strong>
          <span>Bono</span>
        </div>
      </section>

      {error && <div className="alert error">{error}</div>}

      {!data ? (
        <div className="panel-card"><p>Cargando pre-lanzamiento...</p></div>
      ) : (
        <>
          {!data.canParticipate && (
            <div className="prelaunch-notice">
              <FiShield />
              <div>
                <strong>Beneficio no disponible</strong>
                <span>Esta campaña aplica para usuarios registrados antes del 7 de julio.</span>
              </div>
            </div>
          )}

          <section className="prelaunch-progress-card compact prelaunch-bonus-card prelaunch-bonus-tech">
            <div className="prelaunch-bonus-head">
              <span>Progreso fundador</span>
              <strong>{money(bonus.totalEarnedUsdt)} / {money(maxBonus)}</strong>
            </div>
            <div className="prelaunch-progress-bar">
              <i style={{ width: `${progressPercent}%` }} />
            </div>
            <div className="prelaunch-mini-steps">
              <span>Check-in {checkin.completed || 0}/{checkin.maxDays || 5}</span>
              <span>{invite.credited ? "Invitado listo" : "Invitado pendiente"}</span>
              <span>{tiktokText}</span>
            </div>
            <div className="prelaunch-bonus-grid">
              <span><b>5 USDT</b><small>check-in</small></span>
              <span><b>5 USDT</b><small>invitado</small></span>
              <span><b>5 USDT</b><small>TikTok</small></span>
            </div>
          </section>

          <section className="prelaunch-actions">
            <article className="prelaunch-action-card checkin">
              <div className="prelaunch-action-icon"><FiCalendar /></div>
              <div className="prelaunch-action-body">
                <div className="prelaunch-row-head">
                  <strong>Check-in diario</strong>
                  <StatusPill tone={checkin.todayDone ? "success" : checkin.canCheckin ? "warning" : "neutral"}>
                    +1 USDT
                  </StatusPill>
                </div>
                <p>1 USDT por check-in · máximo 5 veces hasta el 7 de julio.</p>
                <div className="prelaunch-days">
                  {(checkin.days || []).map((day) => (
                    <span key={day.day} className={`${day.done ? "done" : ""} ${day.isToday ? "today" : ""}`}>
                      {day.done ? <FiCheck /> : day.day}
                    </span>
                  ))}
                </div>
                <button className="primary-btn" type="button" onClick={doCheckin} disabled={loading || !checkin.canCheckin}>
                  <FiCalendar /> {checkin.todayDone ? "Hecho hoy" : "Hacer check-in"}
                </button>
              </div>
            </article>

            <article className="prelaunch-action-card invite">
              <div className="prelaunch-action-icon"><FiUsers /></div>
              <div className="prelaunch-action-body">
                <div className="prelaunch-row-head">
                  <strong>Invita 1 usuario real</strong>
                  <StatusPill tone={inviteTone}>{inviteText}</StatusPill>
                </div>
                <p>+1 USDT al validar un usuario real.</p>
                <div className="prelaunch-referral-box">
                  <span>{referralLink}</span>
                  <button type="button" onClick={copyReferral}><FiCopy /> Copiar</button>
                </div>
              </div>
            </article>

            <article className="prelaunch-action-card tiktok">
              <div className="prelaunch-action-icon"><FiVideo /></div>
              <div className="prelaunch-action-body">
                <div className="prelaunch-row-head">
                  <strong>Publica un TikTok</strong>
                  <StatusPill tone={tiktokTone}>{tiktokText}</StatusPill>
                </div>
                <p>+3 USDT si tu video promocional es aprobado.</p>
                <form className="prelaunch-tiktok-form" onSubmit={submitTikTok}>
                  <input
                    value={tiktokUrl}
                    onChange={(e) => setTiktokUrl(e.target.value)}
                    placeholder="https://www.tiktok.com/..."
                    disabled={tiktok.status === "approved"}
                  />
                  <button type="submit" disabled={loading || tiktok.status === "approved"}>
                    <FiSend /> Enviar
                  </button>
                </form>
              </div>
            </article>
          </section>

          <section className="prelaunch-rules-card">
            <div className="section-title">
              <span>Reglas</span>
              <h3>Condiciones</h3>
            </div>
            <ul>
              <li><FiCheck /> Usuarios registrados antes del 7 de julio.</li>
              <li><FiCheck /> Recargas, retiros y compra de planes estarán disponibles en el lanzamiento oficial.</li>
              <li><FiCheck /> La pasantía y las tareas IA se pueden usar durante el pre-lanzamiento.</li>
              <li><FiCheck /> Los invitados deben validar su registro con un gerente.</li>
              <li><FiCheck /> Los bonos se acreditan como saldo de garantía.</li>
            </ul>
          </section>

          <Link className="prelaunch-support-card" to="/support">
            <FiHeadphones />
            <div>
              <strong>Contactar gerente</strong>
              <span>Canales oficiales y validación de registro.</span>
            </div>
            <FiChevronRight />
          </Link>
        </>
      )}
    </div>
  );
}
