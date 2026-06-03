import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  FiArrowLeft,
  FiCheckCircle,
  FiCopy,
  FiGift,
  FiLock,
  FiRefreshCw,
  FiSend,
  FiTrendingUp,
  FiUsers,
  FiZap,
} from "react-icons/fi";
import { useNavigate } from "react-router-dom";
import {
  claimPromoEventTask,
  getPromoEventStatus,
} from "../services/authService";

const PROMO_EVENT_END_MS = new Date("2026-05-30T23:59:59Z").getTime();

function resolveEventEndMs(event) {
  const rawEnd = event?.endsAt || event?.ends_at || event?.endAt || event?.end_at;
  const parsed = rawEnd ? new Date(rawEnd).getTime() : NaN;
  return Number.isFinite(parsed) ? parsed : PROMO_EVENT_END_MS;
}

function formatCountdownMs(endMs, nowMs = Date.now()) {
  const target = Number.isFinite(endMs) ? endMs : PROMO_EVENT_END_MS;
  const diff = Math.max(target - nowMs, 0);
  const days = Math.floor(diff / 86400000);
  const hours = Math.floor((diff % 86400000) / 3600000);
  const minutes = Math.floor((diff % 3600000) / 60000);
  const seconds = Math.floor((diff % 60000) / 1000);
  return `${days} días ${hours} h ${minutes} min ${seconds} seg`;
}

function taskIcon(task) {
  if (task.metricType === "active_deposits") return <FiZap />;
  if (task.progressOffset > 0) return <FiTrendingUp />;
  return <FiUsers />;
}

function statusText(task) {
  if (task.isClaimed) return "Reclamado";
  if (task.isLockedBySequence) return "Bloqueado";
  if (task.isCompleted) return "Listo";
  return "En progreso";
}

function progressLabel(task) {
  return task.metricType === "active_deposits" ? "Recargas válidas" : "Registros válidos";
}

export default function PromoEvent() {
  const navigate = useNavigate();

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [processingTask, setProcessingTask] = useState("");
  const [message, setMessage] = useState("");
  const [countdownText, setCountdownText] = useState(() => formatCountdownMs(PROMO_EVENT_END_MS, Date.now()));

  const loadEvent = useCallback(async () => {
    try {
      setLoading(true);
      const result = await getPromoEventStatus();
      setData(result);
      setMessage("");
    } catch (error) {
      setMessage(error.message || "No se pudo cargar el evento.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadEvent();
  }, [loadEvent]);

  useEffect(() => {
    const endMs = resolveEventEndMs(data?.event);

    const updateCountdown = () => {
      setCountdownText(formatCountdownMs(endMs, Date.now()));
    };

    updateCountdown();
    const interval = setInterval(updateCountdown, 1000);
    return () => clearInterval(interval);
  }, [data?.event]);

  const totalReward = useMemo(() => "50", []);

  const buildInviteMessage = (lang = "es") => {
    const link = data?.referralLink || "";

    if (lang === "en") {
      return `⛏️ GreenVest | Fixed Daily Plans

GreenVest is a digital platform designed to activate fixed daily reward plans according to each user's investment level.

Registration link:
${link}

💎 GreenVest Plans

GreenVest-1: 10 - 30 USDT → 0.40 USDT daily
GreenVest-2: 30 - 80 USDT → 1.50 USDT daily
GreenVest-3: 80 - 150 USDT → 4.20 USDT daily
GreenVest-4: 150 - 350 USDT → 8.50 USDT daily
GreenVest-5: 350 - 800 USDT → 22.00 USDT daily
GreenVest-6: 800 - 1,500 USDT → 55.00 USDT daily
GreenVest-7: 1,500 - 4,000 USDT → 110.00 USDT daily
GreenVest-8: 4,000+ USDT → 320.00 USDT daily

⚡ Team Growth

Invite more active friends and build your team to obtain referral commissions within the platform.

🤝 Referral Commissions

Level A: 5%
Level B: 2%
Level C: 1%

Activate your plan, complete your daily task and receive fixed daily income according to your level. 💰`;
    }

    return `⛏️ GreenVest | Planes de ganancia fija

GreenVest es una plataforma digital diseñada para activar planes de ganancia fija diaria según el nivel de inversión del usuario.

Enlace de registro:
${link}

💎 Planes GreenVest

GreenVest-1: 10 - 30 USDT → 0.40 USDT diario
GreenVest-2: 30 - 80 USDT → 1.50 USDT diario
GreenVest-3: 80 - 150 USDT → 4.20 USDT diario
GreenVest-4: 150 - 350 USDT → 8.50 USDT diario
GreenVest-5: 350 - 800 USDT → 22.00 USDT diario
GreenVest-6: 800 - 1,500 USDT → 55.00 USDT diario
GreenVest-7: 1,500 - 4,000 USDT → 110.00 USDT diario
GreenVest-8: 4,000+ USDT → 320.00 USDT diario

⚡ Crecimiento de equipo

Invita más amigos activos y construye tu equipo para obtener comisiones por referidos dentro de la plataforma.

🤝 Comisiones por invitación

Nivel A: 5%
Nivel B: 2%
Nivel C: 1%

Activa tu plan, realiza tu minería con inteligencia artificial y recibe ingresos mineros diarios de acuerdo a tu nivel. 💰`;
  };

  const handleCopy = async (lang = "es") => {
    try {
      await navigator.clipboard.writeText(buildInviteMessage(lang));
      setMessage(lang === "en" ? "English invitation message copied." : "Mensaje de invitación copiado correctamente.");
    } catch {
      setMessage("No se pudo copiar. Puedes copiar el enlace manualmente.");
    }
  };


  const getDisplayRewardAmount = (task) => {
    if (task.code === "promo_6_invest_50_more") return 35;
    return Number(task.rewardAmount || 0);
  };

  const getDisplayRewardType = (task) => {
    if (task.code === "promo_6_invest_50_more") return "withdrawable_usdt";
    return task.rewardType;
  };

  const handleClaim = async (task) => {
    if (!data?.event?.isActive || !task.canClaim || processingTask) return;

    try {
      setProcessingTask(task.code);
      const result = await claimPromoEventTask(task.code);
      setMessage(result.message || "Recompensa aplicada correctamente.");
      await loadEvent();
      window.dispatchEvent(new Event("greenvest:balance-refresh"));
    } catch (error) {
      setMessage(error.message || "No se pudo reclamar la recompensa.");
    } finally {
      setProcessingTask("");
    }
  };

  return (
    <div className="page promo-event-page">
      <header className="promo-event-header">
        <button type="button" onClick={() => navigate(-1)}>
          <FiArrowLeft />
        </button>
        <div>
          <span>Evento GreenVest</span>
          <h2>Promoción activa</h2>
        </div>
        <button type="button" onClick={loadEvent}>
          <FiRefreshCw />
        </button>
      </header>

      {message && <div className="promo-event-message">{message}</div>}

      {loading ? (
        <section className="panel promo-event-loading">Cargando evento...</section>
      ) : (
        <>
          <section className="promo-event-hero">
            <div className="promo-event-hero-icon">
              <FiGift />
            </div>
            <div>
              <span>Evento de crecimiento</span>
              <h1 className="promo-event-big-total">{totalReward} USDT</h1>
              <p>
                Gánate recompensas completando las tareas en orden e invitando nuevos usuarios a GreenVest.
              </p>
            </div>
          </section>

          <section className="promo-event-countdown-strip">
            <span>El evento finaliza en:</span>
            <strong>{countdownText}</strong>
          </section>

          <section className="promo-event-copy-card promo-copy-buttons-card">
            <div>
              <span>Mensaje oficial para invitar</span>
              <p>Copia el mensaje en español o inglés. Tu enlace de referido ya va incluido automáticamente.</p>
            </div>
            <div className="promo-copy-actions">
              <button type="button" onClick={() => handleCopy("es")}>
                <FiCopy />
                Copiar mensaje ES
              </button>
              <button type="button" onClick={() => handleCopy("en")}>
                <FiCopy />
                Copy message EN
              </button>
            </div>
          </section>

          <section className="promo-event-metrics">
            <article>
              <FiUsers />
              <span>Registros del evento</span>
              <strong>{data?.metrics?.registrationCount || 0}</strong>
            </article>
            <article>
              <FiZap />
              <span>Invitados con recarga</span>
              <strong>{data?.metrics?.activeInvestorCount || 0}</strong>
            </article>
          </section>

          <section className="promo-event-task-list">
            {(data?.tasks || []).map((task) => {
              const busy = processingTask === task.code;
              const canClaim = data?.event?.isActive && task.canClaim && !busy;
              const progressPercent = Math.min(100, (Number(task.progress || 0) / Math.max(Number(task.requiredCount || 1), 1)) * 100);

              return (
                <article className={`promo-task-card ${task.status}`} key={task.code}>
                  <div className="promo-task-top">
                    <div className="promo-task-title-row">
                      <span className="promo-task-icon">{taskIcon(task)}</span>
                      <div>
                        <span>{task.title}</span>
                        <h3>
                          +{getDisplayRewardAmount(task).toFixed(2)} {getDisplayRewardType(task) === "withdrawable_usdt" ? "USDT retirable" : "USDT de inversión"}
                        </h3>
                      </div>
                    </div>
                    <em>{statusText(task)}</em>
                  </div>

                  <p>{task.description}</p>

                  <div className="promo-task-progress">
                    <div>
                      <span>{progressLabel(task)}</span>
                      <strong>{task.progress}/{task.requiredCount}</strong>
                    </div>
                    <div className="promo-task-bar">
                      <i style={{ width: `${progressPercent}%` }} />
                    </div>
                    {task.progressOffset > 0 && task.metricType === "registrations" && (
                      <small>Esta promo cuenta registros adicionales después de los primeros {task.progressOffset} registros válidos.</small>
                    )}
                    {task.progressOffset > 0 && task.metricType === "active_deposits" && (
                      <small>Esta promo cuenta recargas adicionales después de {task.progressOffset} invitados válidos con mínimo 5 USDT.</small>
                    )}
                    {task.progressOffset === 0 && task.metricType === "active_deposits" && (
                      <small>Cuenta invitados directos que recarguen mínimo 5 USDT dentro de la fecha del evento.</small>
                    )}
                    {task.isLockedBySequence && (
                      <small>Primero debes reclamar la promoción anterior para desbloquear esta.</small>
                    )}
                  </div>

                  <button
                    className="promo-submit-btn"
                    type="button"
                    disabled={!canClaim}
                    onClick={() => handleClaim(task)}
                  >
                    {busy ? (
                      <>
                        <FiRefreshCw />
                        Procesando...
                      </>
                    ) : task.isClaimed ? (
                      <>
                        <FiCheckCircle />
                        Reclamado
                      </>
                    ) : task.canClaim ? (
                      <>
                        <FiSend />
                        Reclamar recompensa
                      </>
                    ) : task.isLockedBySequence ? (
                      <>
                        <FiLock />
                        Completa la promo anterior
                      </>
                    ) : (
                      <>
                        <FiGift />
                        Completa el requisito
                      </>
                    )}
                  </button>
                </article>
              );
            })}
          </section>
        </>
      )}
    </div>
  );
}
