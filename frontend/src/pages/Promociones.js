import React from "react";
import { FiArrowLeft, FiCalendar, FiCheckCircle, FiDollarSign, FiHeadphones, FiShoppingBag } from "react-icons/fi";
import { useNavigate } from "react-router-dom";

const SUPPORT_URL = "https://t.me/GreenVestSoporte";

const promoExamples = [
  {
    plant: "Planta Rubí",
    price: "80 USDT",
    bonus: "4.00 USDT",
  },
  {
    plant: "Planta Amatista",
    price: "150 USDT",
    bonus: "7.50 USDT",
  },
  {
    plant: "Planta Topacio",
    price: "350 USDT",
    bonus: "17.50 USDT",
  },
];

export default function Promociones() {
  const navigate = useNavigate();

  return (
    <div className="page promociones-page promo-bono-page">
      <header className="promo-bono-header">
        <button className="icon-btn" type="button" onClick={() => navigate("/home")} aria-label="Volver al inicio">
          <FiArrowLeft />
        </button>
        <div>
          <span>Promoción GreenVest</span>
          <h2>Bono de recarga</h2>
        </div>
        <span className="promo-bono-header-icon"><FiDollarSign /></span>
      </header>

      <section className="promo-bono-banner-card">
        <img src="/greenvest_bono_5_junio_21_24.png" alt="Bono de 5% GreenVest del 21 al 24 de junio" />
      </section>

      <section className="promo-bono-card promo-bono-main-copy">
        <div className="promo-bono-pill"><FiCalendar /> Del 21 al 24 de junio</div>
        <h3>Bono especial de 5% en saldo retirable</h3>
        <p>
          La compra es válida para plantas desde <strong>Planta Zafiro en adelante</strong>.
          Al adquirir una planta válida dentro de las fechas de la promoción, recibirás un
          bono equivalente al <strong>5% del valor de la planta</strong> directamente como saldo retirable.
        </p>
      </section>

      <section className="promo-bono-card">
        <div className="promo-bono-section-title">
          <FiShoppingBag />
          <div>
            <h3>Ejemplos de bono</h3>
            <p>Estos son ejemplos para que el cálculo quede claro.</p>
          </div>
        </div>

        <div className="promo-bono-example-list">
          {promoExamples.map((item) => (
            <article key={item.plant} className="promo-bono-example-card">
              <div>
                <span>{item.plant}</span>
                <strong>{item.price}</strong>
              </div>
              <em>recibes</em>
              <b>{item.bonus}</b>
              <small>en saldo retirable</small>
            </article>
          ))}
        </div>
      </section>

      <section className="promo-bono-card promo-bono-rules-card">
        <div className="promo-bono-section-title">
          <FiCheckCircle />
          <div>
            <h3>Condiciones principales</h3>
            <p>Revisa las reglas antes de participar.</p>
          </div>
        </div>

        <div className="promo-bono-rules-list">
          <p>Aplica solo para compras realizadas entre el <strong>21 y el 24 de junio</strong>.</p>
          <p>Aplica desde <strong>Planta Zafiro o superior</strong>; no aplica para plantas inferiores.</p>
          <p>El bono se entrega como <strong>saldo retirable</strong>, no como saldo de recarga.</p>
          <p>Después de comprar, debes contactar a soporte para validar la promoción.</p>
        </div>
      </section>

      <section className="promo-bono-support-card">
        <span><FiHeadphones /></span>
        <div>
          <h3>¿Ya compraste tu planta?</h3>
          <p>
            Contacta a soporte GreenVest con tu usuario y la planta adquirida para que revisen
            tu compra y acrediten el bono correspondiente.
          </p>
          <a href={SUPPORT_URL} target="_blank" rel="noopener noreferrer">
            Contactar soporte
          </a>
        </div>
      </section>
    </div>
  );
}
