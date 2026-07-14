import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { FiCreditCard, FiDollarSign, FiTrendingUp, FiUsers } from "react-icons/fi";
import api from "../services/api";
import pollito from "../assets/roulette/pollito.png";
import conejo from "../assets/roulette/conejo.png";
import oveja from "../assets/roulette/oveja.png";
import toro from "../assets/roulette/toro.png";
import leon from "../assets/roulette/leon.png";
import tigre from "../assets/roulette/tigre.png";

const assetByAnimal = { pollito, conejo, oveja, toro, leon, tigre };

const money = (value) => `${Number(value || 0).toFixed(2)} USDT`;

const vipIconByLevel = { 0: pollito, 1: conejo, 2: oveja, 3: toro, 4: leon, 5: tigre };

const withdrawRangesByLevel = {
  1: [1, 5],
  2: [3, 10],
  3: [5, 20],
  4: [20, 50],
  5: [50, 100],
};

const rechargeAmountByVip = {
  1: 5,
  2: 50,
  3: 200,
  4: 500,
  5: 1200,
};

const jackpotRewards = [500, 1000, 2000, 5000];

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomUserId() {
  return randomInt(100000, 999999);
}

function weightedVipLevel({ includeFree = false } = {}) {
  const pool = includeFree
    ? [0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 3, 3, 4, 5]
    : [1, 1, 1, 1, 1, 2, 2, 2, 3, 3, 4, 5];

  return pool[randomInt(0, pool.length - 1)];
}

function vipLabelShort(level) {
  const numeric = Number(level || 0);
  return numeric > 0 ? `VIP ${numeric}` : "Pasantía";
}

function randomWithdrawItem() {
  const vip = weightedVipLevel();
  const [min, max] = withdrawRangesByLevel[vip] || [1, 5];
  return {
    key: `w-${Date.now()}-${Math.random()}`,
    id: randomUserId(),
    vip,
    amount: randomInt(min, max),
    icon: vipIconByLevel[vip] || conejo,
  };
}

function randomJackpotItem() {
  const vip = weightedVipLevel({ includeFree: true });
  return {
    key: `j-${Date.now()}-${Math.random()}`,
    id: randomUserId(),
    vip,
    coins: jackpotRewards[randomInt(0, jackpotRewards.length - 1)],
    icon: vipIconByLevel[vip] || pollito,
  };
}

function randomRechargeItem() {
  const vip = weightedVipLevel();
  return {
    key: `r-${Date.now()}-${Math.random()}`,
    id: randomUserId(),
    vip,
    amount: rechargeAmountByVip[vip] || 5,
    icon: vipIconByLevel[vip] || conejo,
  };
}

function buildActivityList(factory) {
  return Array.from({ length: 4 }, () => factory());
}


export default function Home() {
  const [vip, setVip] = useState(null);
  const [roulette, setRoulette] = useState(null);
  const [lastWithdrawals, setLastWithdrawals] = useState(() => buildActivityList(randomWithdrawItem));
  const [lastJackpots, setLastJackpots] = useState(() => buildActivityList(randomJackpotItem));
  const [lastRecharges, setLastRecharges] = useState(() => buildActivityList(randomRechargeItem));

  useEffect(() => {
    api.get("/vip/status").then((res) => setVip(res.data)).catch(() => setVip(null));
    api.get("/auth/roulette/status").then((res) => setRoulette(res.data)).catch(() => setRoulette(null));
  }, []);

  useEffect(() => {
    const refresh = () => {
      setLastWithdrawals(buildActivityList(randomWithdrawItem));
      setLastJackpots(buildActivityList(randomJackpotItem));
      setLastRecharges(buildActivityList(randomRechargeItem));
    };

    const ticker = window.setInterval(refresh, 30000);
    return () => window.clearInterval(ticker);
  }, []);

  const rechargeBalance = Number(vip?.user?.balance_usdt || 0);
  const withdrawable = Number(vip?.user?.withdrawable_usdt || roulette?.usdt || 0);
  const coins = Number(roulette?.coins || 0);
  const spinsLeft = roulette?.spins?.left ?? 0;
  const level = roulette?.level || {
    level: 0,
    animalKey: "pollito",
    displayName: "Ruleta Pollito",
    planName: "Pasantía Pollito",
    shotsPerHour: 1,
    dailySpins: 1,
  };
  const spinsBaseHourly = Number(level?.shotsPerHour || level?.dailySpins || 1);
  const animal = assetByAnimal[level.animalKey] || pollito;

  return (
    <div className="page-stack home-page casino-home home-v41">
      <section className="home-v41-hero">
        <div className="home-v41-hero-copy">
          <span>Ruleta activa</span>
          <h1>{level.planName}</h1>
          <p>Gira, gana y crece con tu equipo. Invita más amigos para aumentar tus bonos y avanzar más rápido.</p>
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
          <strong>{spinsLeft}/{spinsBaseHourly}</strong>
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
            <small>Gana monedas y giros extra.</small>
          </span>
        </Link>
      </section>


      <section className="home-v73-activity-board">
        <div className="home-v73-activity-section">
          <div className="home-v73-activity-head">
            <strong>Últimos retiros</strong>
            <span>💵 Actividad reciente</span>
          </div>

          <div className="home-v73-activity-list">
            {lastWithdrawals.map((item) => (
              <article key={item.key}>
                <img src={item.icon} alt="" />
                <div>
                  <strong>ID {item.id}</strong>
                  <span>{vipLabelShort(item.vip)}</span>
                </div>
                <b>💵 Retiró {item.amount} USDT</b>
              </article>
            ))}
          </div>
        </div>

        <div className="home-v73-activity-section">
          <div className="home-v73-activity-head">
            <strong>Últimos JackPot</strong>
            <span>🪙 Premios recientes</span>
          </div>

          <div className="home-v73-activity-list">
            {lastJackpots.map((item) => (
              <article key={item.key}>
                <img src={item.icon} alt="" />
                <div>
                  <strong>ID {item.id}</strong>
                  <span>{vipLabelShort(item.vip)}</span>
                </div>
                <b>🪙 +{item.coins.toLocaleString("es-PE")} monedas</b>
              </article>
            ))}
          </div>
        </div>

        <div className="home-v73-activity-section">
          <div className="home-v73-activity-head">
            <strong>Recargas</strong>
            <span>💳 Activaciones recientes</span>
          </div>

          <div className="home-v73-activity-list">
            {lastRecharges.map((item) => (
              <article key={item.key}>
                <img src={item.icon} alt="" />
                <div>
                  <strong>ID {item.id}</strong>
                  <span>{vipLabelShort(item.vip)}</span>
                </div>
                <b>💳 Recargó {item.amount} USDT</b>
              </article>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
