import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { FiCreditCard, FiDollarSign, FiTrendingUp, FiUsers } from "react-icons/fi";
import { GiRollingDices } from "react-icons/gi";
import api from "../services/api";
import pollito from "../assets/roulette/pollito.png";
import conejo from "../assets/roulette/conejo.png";
import oveja from "../assets/roulette/oveja.png";
import toro from "../assets/roulette/toro.png";
import leon from "../assets/roulette/leon.png";
import tigre from "../assets/roulette/tigre.png";

const assetByAnimal = { pollito, conejo, oveja, toro, leon, tigre };

const money = (value) => `${Number(value || 0).toFixed(2)} USDT`;

export default function Home() {
  const [vip, setVip] = useState(null);
  const [roulette, setRoulette] = useState(null);

  useEffect(() => {
    api.get("/vip/status").then((res) => setVip(res.data)).catch(() => setVip(null));
    api.get("/auth/roulette/status").then((res) => setRoulette(res.data)).catch(() => setRoulette(null));
  }, []);

  const rechargeBalance = Number(vip?.user?.balance_usdt || 0);
  const withdrawable = Number(vip?.user?.withdrawable_usdt || roulette?.usdt || 0);
  const coins = Number(roulette?.coins || 0);
  const spinsLeft = roulette?.spins?.left ?? 0;
  const spinsHourly = roulette?.spins?.hourly ?? 1;
  const level = roulette?.level || {
    level: 0,
    animalKey: "pollito",
    displayName: "Ruleta Pollito",
    planName: "Pasantía Pollito",
  };
  const animal = assetByAnimal[level.animalKey] || pollito;

  return (
    <div className="page-stack home-page casino-home home-v41">
      <section className="home-v41-hero">
        <div className="home-v41-hero-copy">
          <span>Ruleta activa</span>
          <h1>{level.planName}</h1>
          <p>Juega, acumula monedas y convierte tus ganancias cuando tengas saldo disponible.</p>

          <div className="home-v41-cta-row">
            <Link className="home-v41-btn primary" to="/roulette">
              <GiRollingDices /> Girar ruleta
            </Link>
          </div>
        </div>

        <div className="home-v41-animal">
          <img src={animal} alt={level.displayName} />
          <strong>VIP {Number(level.level || 0) || "Pasantía"}</strong>
        </div>
      </section>

      <section className="home-v41-wallet-panel">
        <div>
          <span>Ganancia retirable</span>
          <strong>{money(withdrawable)}</strong>
        </div>
        <Link to="/withdraw">
          <FiDollarSign /> Retirar ganancia
        </Link>
      </section>

      <section className="home-v41-stats">
        <article>
          <span>Saldo recarga</span>
          <strong>{money(rechargeBalance)}</strong>
        </article>
        <article>
          <span>Monedas ruleta</span>
          <strong>{coins.toLocaleString("es-PE")}</strong>
        </article>
        <article>
          <span>Tiros disponibles</span>
          <strong>{spinsLeft}/{spinsHourly}</strong>
        </article>
        <article>
          <span>Nivel actual</span>
          <strong>{Number(level.level || 0) ? `VIP ${level.level}` : "Pasantía"}</strong>
        </article>
      </section>

      <section className="home-v41-actions">
        <Link to="/recharge">
          <FiCreditCard />
          <span>
            <strong>Recargar saldo</strong>
            <small>Activa o mejora tu plan.</small>
          </span>
        </Link>

        <Link to="/levels">
          <FiTrendingUp />
          <span>
            <strong>Ver planes VIP</strong>
            <small>Sube tu nivel de juego.</small>
          </span>
        </Link>

        <Link to="/invite">
          <FiUsers />
          <span>
            <strong>Equipo referido</strong>
            <small>Invita y revisa tus bonos.</small>
          </span>
        </Link>
      </section>
    </div>
  );
}
