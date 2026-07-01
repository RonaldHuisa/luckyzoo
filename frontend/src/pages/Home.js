import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  FiArrowRight,
  FiBookOpen,
  FiCpu,
  FiCreditCard,
  FiHeadphones,
  FiLock,
  FiMessageCircle,
  FiRefreshCw,
  FiShield,
  FiTarget,
  FiTrendingUp,
  FiZap,
} from "react-icons/fi";
import api from "../services/api";
import usdtIcon from "../assets/networks/usdt-bep20.png";

const money = (value) => `${Number(value || 0).toFixed(2)} USDT`;

function imageUrl(src) {
  if (!src) return "";
  if (src.startsWith("http") || src.startsWith("data:")) return src;
  if (src.startsWith("/")) return src;
  return `/${src}`;
}

export default function Home() {
  const [vip, setVip] = useState(null);
  const [tasks, setTasks] = useState(null);
  const [latestArticle, setLatestArticle] = useState(null);
  const [error, setError] = useState("");
  const user = useMemo(() => {
    try { return JSON.parse(localStorage.getItem("user") || "{}"); } catch { return {}; }
  }, []);

  const load = async () => {
    try {
      const [vipRes, taskRes, newsRes] = await Promise.all([
        api.get("/vip/status"),
        api.get("/tasks/dashboard"),
        api.get("/news").catch(() => ({ data: { articles: [] } })),
      ]);
      setVip(vipRes.data);
      setTasks(taskRes.data);
      setLatestArticle((newsRes.data.articles || [])[0] || null);
    } catch (err) {
      setError(err.message);
    }
  };

  useEffect(() => { load(); }, []);

  const referralId = user.referral_code || user.referralCode || user.id || "--";
  const guarantee = Number(vip?.user?.balance_usdt || 0);
  const withdrawable = Number(vip?.user?.withdrawable_usdt || 0);
  const completed = Number(tasks?.today?.completed || 0);
  const taskLimit = Number(tasks?.today?.limit || 0);
  const remaining = Math.max(0, Number(tasks?.today?.remaining ?? Math.max(0, taskLimit - completed)));
  const precision = Number(tasks?.accuracy?.weeklyPercent || 0).toFixed(0);
  const progressPct = taskLimit > 0 ? Math.min(100, Math.max(0, (completed / taskLimit) * 100)) : 0;
  const activePurchase = vip?.activePurchase;
  const activePlanPackage = (vip?.packages || []).find((item) => Number(item.level) === Number(activePurchase?.level));
  const planName = activePurchase ? `Plan ${activePlanPackage?.name || activePurchase.level}` : "Pasantía";
  const activityLabel = completed > 0 ? "Activa" : "Pendiente";

  return (
    <div className="page-stack home-impact-v48">
      {error && <div className="alert error">{error}</div>}

      <section className="impact-ai-welcome-card">
        <div className="impact-ai-welcome-copy">
          <span>Bienvenido ID {referralId}</span>
          <h2>Entrena la IA financiera</h2>
          <p>Completa tus tareas diarias y contribuye al crecimiento de nuestra IA financiera.</p>
        </div>
        <img src="/ai-brain-banner.webp" alt="" aria-hidden="true" />
      </section>

      <section className="home-impact-hero">
        <div className="impact-hero-copy">
          <span className="impact-eyebrow">Saldo retirable</span>
          <div className="impact-amount">
            <strong>{withdrawable.toFixed(2)}</strong>
            <span>USDT</span>
          </div>
        </div>

        <div className="impact-coin-scene" aria-hidden="true">
          <span className="impact-spark one" />
          <span className="impact-spark two" />
          <span className="impact-spark three" />
          <div className="impact-coin-ring">
            <div className="impact-usdt-coin">
              <img src={usdtIcon} alt="" />
            </div>
          </div>
          <div className="impact-podium"><span /></div>
        </div>
      </section>

      <section className="impact-action-grid" aria-label="Accesos principales">
        <Link className="impact-action-card recharge" to="/recharge">
          <span className="impact-action-icon"><FiCreditCard /></span>
          <div>
            <strong>Recargar</strong>
            <small>Activar garantía</small>
          </div>
          <FiArrowRight className="impact-go" />
        </Link>

        <Link className="impact-action-card withdraw" to="/withdraw">
          <span className="impact-action-icon"><FiRefreshCw /></span>
          <div>
            <strong>Retirar</strong>
            <small>Cobrar recompensa</small>
          </div>
          <FiArrowRight className="impact-go" />
        </Link>
      </section>

      <section className="impact-metric-grid" aria-label="Resumen principal">
        <article className="impact-metric-card">
          <span className="impact-metric-icon shield"><FiShield /></span>
          <h3>Garantía activa</h3>
          <strong>{guarantee.toFixed(2)} USDT</strong>
          <small>Total disponible para niveles</small>
          <FiLock className="impact-watermark" />
        </article>

        <article className="impact-metric-card">
          <span className="impact-metric-icon tasks"><FiCpu /></span>
          <h3>Misiones IA de hoy</h3>
          <strong>{completed} / {taskLimit}</strong>
          <small>{remaining} pendiente{remaining === 1 ? "" : "s"}</small>
          <div className="impact-progress"><span style={{ width: `${progressPct}%` }} /></div>
        </article>

        <article className="impact-metric-card">
          <span className="impact-metric-icon target"><FiTarget /></span>
          <h3>Rendimiento IA</h3>
          <strong>{precision}%</strong>
          <small>Precisión semanal</small>
          <FiTrendingUp className="impact-line-art" />
        </article>

        <article className="impact-metric-card">
          <span className="impact-metric-icon activity"><FiZap /></span>
          <h3>Actividad diaria</h3>
          <strong>{activityLabel}</strong>
          <small>{completed > 0 ? "Sigue completando tareas" : "Inicia tus tareas IA"}</small>
          <FiZap className="impact-watermark flame" />
        </article>
      </section>

      <section className="impact-links-panel" aria-label="Accesos secundarios">
        <Link to="/levels" className="impact-plan-link">
          <span><FiTrendingUp /></span>
          <div>
            <strong>Planes</strong>
            <small>Activa o mejora tu nivel</small>
          </div>
          <FiArrowRight />
        </Link>

        <Link to="/history">
          <span><FiBookOpen /></span>
          <div>
            <strong>Movimientos</strong>
            <small>Historial de recargas, retiros y tareas</small>
          </div>
          <FiArrowRight />
        </Link>

        <Link to="/support">
          <span><FiHeadphones /></span>
          <div>
            <strong>Centro de ayuda</strong>
            <small>Soporte oficial verificado</small>
          </div>
          <em>5 - 15 min</em>
          <FiArrowRight />
        </Link>

      </section>

      <section className="impact-news-preview">
        <div className="impact-news-head">
          <div>
            <span>Novedades</span>
            <h3>Noticias Royal</h3>
          </div>
          <Link to="/news">Ver más <FiArrowRight /></Link>
        </div>

        <Link className="impact-news-card" to={latestArticle ? `/news/${latestArticle.slug}` : "/news"}>
          <span className="impact-news-thumb">
            {latestArticle?.coverImageUrl ? (
              <img src={imageUrl(latestArticle.coverImageUrl)} alt="" />
            ) : (
              <FiMessageCircle />
            )}
          </span>
          <div>
            <strong>{latestArticle?.title || "Sin noticias publicadas"}</strong>
            <small>{latestArticle?.summary || "Cuando haya novedades aparecerán en esta sección."}</small>
          </div>
          <FiArrowRight />
        </Link>
      </section>
    </div>
  );
}
