import React from "react";
import { FiArrowLeft, FiAward, FiCalendar, FiCheckCircle, FiGift, FiHeadphones, FiUsers } from "react-icons/fi";
import { useNavigate } from "react-router-dom";

const SUPPORT_URL = "https://t.me/GreenVestSoporte";

const prizes = [
  {
    rank: "TOP 1",
    prize: "300 USDT",
    note: "Mayor cantidad de puntos válidos",
  },
  {
    rank: "TOP 2",
    prize: "150 USDT",
    note: "Segundo mejor ranking del concurso",
  },
  {
    rank: "TOP 3",
    prize: "50 USDT",
    note: "Tercer mejor ranking del concurso",
  },
];

const pointsExamples = [
  { plant: "Planta Esmeralda", points: "1 punto" },
  { plant: "Planta Zafiro", points: "2 puntos" },
  { plant: "Planta Rubí", points: "3 puntos" },
  { plant: "Planta Amatista", points: "4 puntos" },
  { plant: "Planta Topacio", points: "5 puntos" },
];

export default function Promociones() {
  const navigate = useNavigate();

  return (
    <div className="page promociones-page promo-bono-page promo-referral-page">
      <header className="promo-bono-header">
        <button className="icon-btn" type="button" onClick={() => navigate("/home")} aria-label="Volver al inicio">
          <FiArrowLeft />
        </button>
        <div>
          <span>Evento GreenVest</span>
          <h2>Concurso de referidos</h2>
        </div>
        <span className="promo-bono-header-icon"><FiAward /></span>
      </header>

      <section className="promo-bono-banner-card promo-referral-banner-card">
        <img src="/greenvest_concurso_referidos_julio5.png" alt="Concurso de referidos GreenVest hasta el 5 de julio" />
      </section>

      <section className="promo-bono-card promo-bono-main-copy">
        <div className="promo-bono-pill"><FiCalendar /> Hasta el 5 de julio</div>
        <h3>Invita usuarios y sube al ranking GreenVest</h3>
        <p>
          Participa invitando nuevos usuarios a tu equipo. Para que un referido sea válido,
          debe registrarse con tu enlace e ingresar una recarga/compra de planta durante el
          periodo del evento, desde ahora hasta el <strong>5 de julio</strong>.
        </p>
      </section>

      <section className="promo-bono-card">
        <div className="promo-bono-section-title">
          <FiGift />
          <div>
            <h3>Premios del ranking</h3>
            <p>Los usuarios con más puntos válidos ganan los premios principales.</p>
          </div>
        </div>

        <div className="promo-bono-example-list">
          {prizes.map((item) => (
            <article key={item.rank} className="promo-bono-example-card promo-referral-prize-card">
              <div>
                <span>{item.rank}</span>
                <strong>{item.prize}</strong>
              </div>
              <em>premio</em>
              <b>{item.prize}</b>
              <small>{item.note}</small>
            </article>
          ))}
        </div>
      </section>

      <section className="promo-bono-card">
        <div className="promo-bono-section-title">
          <FiUsers />
          <div>
            <h3>Cómo se calculan los puntos</h3>
            <p>Mientras mayor sea la planta recargada por tu referido válido, más puntos suma.</p>
          </div>
        </div>

        <div className="promo-bono-example-list">
          {pointsExamples.map((item) => (
            <article key={item.plant} className="promo-bono-example-card">
              <div>
                <span>{item.plant}</span>
                <strong>{item.points}</strong>
              </div>
              <em>suma</em>
              <b>{item.points}</b>
              <small>Cuenta solo si el referido compra/recarga una planta válida dentro del evento.</small>
            </article>
          ))}
        </div>
      </section>

      <section className="promo-bono-card promo-bono-rules-card">
        <div className="promo-bono-section-title">
          <FiCheckCircle />
          <div>
            <h3>Reglas principales</h3>
            <p>Revisa las condiciones para que tus invitados cuenten en el concurso.</p>
          </div>
        </div>

        <div className="promo-bono-rules-list">
          <p>Solo cuentan referidos directos que se registren con tu enlace o código de invitación.</p>
          <p>El referido debe recargar/comprar una planta desde ahora hasta el <strong>5 de julio</strong>.</p>
          <p>Cada referido válido suma puntos según la planta que compre: Nivel 1 suma 1 punto, Nivel 2 suma 2 puntos, y así consecutivamente.</p>
          <p>El ranking se ordena por la mayor cantidad de puntos válidos acumulados durante el evento.</p>
          <p>GreenVest podrá revisar actividad duplicada, sospechosa o inválida antes de entregar premios.</p>
        </div>
      </section>

      <section className="promo-bono-support-card">
        <span><FiHeadphones /></span>
        <div>
          <h3>¿Necesitas validar tus puntos?</h3>
          <p>
            Contacta a soporte GreenVest con tu usuario para consultar el estado de tus referidos
            válidos y recibir ayuda durante el concurso.
          </p>
          <a href={SUPPORT_URL} target="_blank" rel="noopener noreferrer">
            Contactar soporte
          </a>
        </div>
      </section>
    </div>
  );
}
