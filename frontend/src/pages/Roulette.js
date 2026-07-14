import React, { useEffect, useMemo, useState } from "react";
import { FiRefreshCw } from "react-icons/fi";
import api from "../services/api";
import pollitoBanner from "../assets/roulette/banners/pollito-banner.jpg";
import conejoBanner from "../assets/roulette/banners/conejo-banner.jpg";
import ovejaBanner from "../assets/roulette/banners/oveja-banner.jpg";
import toroBanner from "../assets/roulette/banners/toro-banner.jpg";
import leonBanner from "../assets/roulette/banners/leon-banner.jpg";
import tigreBanner from "../assets/roulette/banners/tigre-banner.jpg";
import casinoStageBg from "../assets/roulette/casino-coin-rain-stage.jpg";

const bannerByAnimal = {
  pollito: pollitoBanner,
  conejo: conejoBanner,
  oveja: ovejaBanner,
  toro: toroBanner,
  leon: leonBanner,
  tigre: tigreBanner,
};

const fallbackLevel = {
  level: 0,
  animalKey: "pollito",
  planName: "Pasantía Pollito",
  displayName: "Ruleta Pollito",
  theme: "#f2b705",
  dailySpins: 1,
  rewards: [10, 15, 20, 30, 40, 60, 80, 100],
  exchange: { coins: 1000, usdt: 0.1 },
};

const colors = ["#fff4bf", "#fffdf4", "#ffd45b", "#fff3c7", "#f3c536", "#fff8dc", "#f8b400", "#fffdf4"];

function formatCoins(value) {
  return Number(value || 0).toLocaleString("es-PE", { maximumFractionDigits: 0 });
}

function formatUsdt(value) {
  return Number(value || 0).toFixed(4).replace(/0+$/, "").replace(/\.$/, "");
}

function polar(cx, cy, r, angle) {
  const rad = ((angle - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

function slicePath(cx, cy, r, a1, a2) {
  const s = polar(cx, cy, r, a2);
  const e = polar(cx, cy, r, a1);
  const large = a2 - a1 <= 180 ? 0 : 1;
  return `M ${cx} ${cy} L ${s.x} ${s.y} A ${r} ${r} 0 ${large} 0 ${e.x} ${e.y} Z`;
}

function useRollingNumber(value, duration = 650) {
  const [display, setDisplay] = useState(Number(value || 0));

  useEffect(() => {
    const start = Number(display || 0);
    const end = Number(value || 0);
    if (start === end) return;

    let frameId;
    const startTime = performance.now();

    const tick = (now) => {
      const progress = Math.min((now - startTime) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplay(start + (end - start) * eased);

      if (progress < 1) {
        frameId = requestAnimationFrame(tick);
      } else {
        setDisplay(end);
      }
    };

    frameId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frameId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  return display;
}

function Wheel({ rewards, selected }) {
  const deg = 360 / rewards.length;
  return (
    <svg viewBox="0 0 320 320" className="wheel-svg" aria-label="Ruleta de monedas">
      {rewards.map((reward, index) => {
        const start = index * deg;
        const end = start + deg;
        const mid = start + deg / 2;
        const p = polar(160, 160, 102, mid);
        return (
          <g key={`${reward}-${index}`} className={selected === index ? "wheel-slice selected" : "wheel-slice"}>
            <path d={slicePath(160, 160, 152, start, end)} fill={colors[index % colors.length]} />
            <line x1="160" y1="160" x2={polar(160, 160, 152, start).x} y2={polar(160, 160, 152, start).y} />
            <text x={p.x} y={p.y} transform={`rotate(${mid}, ${p.x}, ${p.y})`}>{reward}</text>
          </g>
        );
      })}
      <circle cx="160" cy="160" r="156" className="wheel-border" />
    </svg>
  );
}

export default function Roulette() {
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [spinning, setSpinning] = useState(false);
  const [, setError] = useState("");
  const [rotation, setRotation] = useState(0);
  const [selected, setSelected] = useState(null);
  const [popup, setPopup] = useState("");

  const level = status?.level || fallbackLevel;
  const rewards = level.rewards || fallbackLevel.rewards;
  const exchange = status?.exchange || { coinsPerBlock: 1000, usdtPerBlock: 0.1, coinsConvertible: 0, usdtPreview: 0 };
  const banner = bannerByAnimal[level.animalKey] || pollitoBanner;
  const animatedCoins = useRollingNumber(status?.coins || 0);
  const animatedUsdt = useRollingNumber(status?.usdt || 0);

  const themeStyle = useMemo(() => ({
    "--level-theme": level.theme || "#f2b705",
    "--level-dark": level.level >= 5 ? "#3b0e08" : "#3d2a00",
  }), [level.theme, level.level]);

  const showPopup = (text) => {
    setPopup(text);
    window.clearTimeout(window.__royalRoulettePopup);
    window.__royalRoulettePopup = window.setTimeout(() => setPopup(""), 3500);
  };

  const load = async () => {
    setError("");
    try {
      const { data } = await api.get("/auth/roulette/status");
      setStatus(data);
    } catch (err) {
      setError(err.message);
      showPopup("No se pudo cargar la ruleta");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const spin = async () => {
    if (spinning) return;
    setSpinning(true);
    setError("");
    try {
      const { data } = await api.post("/auth/roulette/spin", { idempotencyKey: crypto.randomUUID() });
      const rewardIndex = Number(data?.reward?.index || 0);
      const deg = 360 / rewards.length;
      const targetCenter = rewardIndex * deg + deg / 2;
      const desired = 360 - targetCenter;
      const current = ((rotation % 360) + 360) % 360;
      let delta = desired - current;
      if (delta < 0) delta += 360;
      const finalRotation = rotation + 1800 + delta;

      setSelected(null);
      setRotation(finalRotation);

      window.setTimeout(() => {
        setStatus(data.status);
        setSelected(rewardIndex);
        showPopup(data.message || "Giro completado");
        setSpinning(false);
      }, 3300);
    } catch (err) {
      setError(err.message);
      showPopup(err.message || "No se pudo girar");
      setSpinning(false);
    }
  };

  const exchangeCoins = async () => {
    if (spinning) return;
    setError("");
    try {
      const { data } = await api.post("/auth/roulette/exchange");
      setStatus(data.status);
      showPopup(data.message || "Cambio realizado");
    } catch (err) {
      setError(err.message);
      showPopup(err.message || "No se pudo cambiar");
    }
  };

  if (loading) {
    return (
      <div className="page-stack roulette-page" style={themeStyle}>
        <section className="roulette-loading-card">
          <FiRefreshCw />
          <strong>Cargando ruleta...</strong>
        </section>
      </div>
    );
  }

  return (
    <div className="page-stack roulette-page animal-roulette-page v4-roulette-page" style={themeStyle}>
      {popup && <div className="simple-black-popup">{popup}</div>}

      <section className="roulette-banner-hero">
        <img src={banner} alt={level.displayName} />
      </section>

      <section className="jackpot-pot-card compact-pot-card">
        <div className="pot-top-block">
          <span className="pot-title">Pot de monedas</span>
          <div className="pot-number-row">
            <strong><span className="pot-coin-emoji">🪙</span>{formatCoins(animatedCoins)}</strong>
            <div className="spins-pill">{status?.spins?.left ?? 0}/{level?.shotsPerHour ?? level?.dailySpins ?? 1} tiros</div>
          </div>
        </div>

        <div className="pot-info-grid pot-info-grid-clean">
          <div className="usdt-info-block clean-usdt-block">
            <span>USDT retirable</span>
            <b>{formatUsdt(animatedUsdt)} USDT</b>
          </div>

          <button type="button" className="convert-btn" onClick={exchangeCoins}>Convertir</button>
        </div>

        <small>{formatCoins(exchange.coinsPerBlock)} monedas = {exchange.usdtPerBlock} USDT</small>
      </section>

      <section className="wheel-card roulette-stage-card casino-coin-stage" style={{ "--roulette-stage-bg": `url(${casinoStageBg})` }}>
        <div className="wheel-frame strong-wheel-frame">
          <div className="wheel-pointer" />
          <div className="wheel-disc" style={{ transform: `rotate(${rotation}deg)` }}>
            <Wheel rewards={rewards} selected={selected} />
          </div>
          <div className="wheel-center">🪙</div>
        </div>

        <button className="primary-btn wide spin-action-btn" onClick={spin} disabled={spinning}>
          {spinning ? "Girando..." : "Girar ruleta"}
        </button>
      </section>

      <section className="history-card casino-last-spins">
        <div className="section-title">
          <h2>Últimos 5 tiros</h2>
          <span>Ganancias recientes</span>
        </div>

        {(status?.history || []).slice(0, 5).length ? (
          <div className="last-spins-list">
            {status.history.slice(0, 5).map((item) => (
              <article key={item.id}>
                <div>
                  <strong>{new Date(item.createdAt).toLocaleTimeString("es-PE", { hour: "2-digit", minute: "2-digit" })}</strong>
                  <span>Ruleta {item.animalKey}</span>
                </div>
                <b>+{formatCoins(item.coinAmount)} monedas</b>
              </article>
            ))}
          </div>
        ) : <p className="muted">Aún no hay tiros registrados.</p>}
      </section>
    </div>
  );
}
