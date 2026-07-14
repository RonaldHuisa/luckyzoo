import React, { useEffect, useMemo, useState } from "react";
import { FiCreditCard, FiLock } from "react-icons/fi";
import api from "../services/api";
import pollitoBanner from "../assets/roulette/banners/pollito-banner.jpg";
import conejoBanner from "../assets/roulette/banners/conejo-banner.jpg";
import ovejaBanner from "../assets/roulette/banners/oveja-banner.jpg";
import toroBanner from "../assets/roulette/banners/toro-banner.jpg";
import leonBanner from "../assets/roulette/banners/leon-banner.jpg";
import tigreBanner from "../assets/roulette/banners/tigre-banner.jpg";
import plansBalanceBanner from "../assets/plans/plans-balance-banner.png";

const bannerByAnimal = {
  pollito: pollitoBanner,
  conejo: conejoBanner,
  oveja: ovejaBanner,
  toro: toroBanner,
  leon: leonBanner,
  tigre: tigreBanner,
};

const planMeta = {
  0: { shortLabel: "Pasantía", title: "Pasantía Pollito", luck: "🍀 x1.0", spins: 1, commission: "5%", priceLabel: "Gratis" },
  1: { shortLabel: "VIP 1", title: "VIP 1 Conejo", luck: "🍀 x1.5", spins: 5, commission: "10%" },
  2: { shortLabel: "VIP 2", title: "VIP 2 Oveja", luck: "🍀 x2.0", spins: 15, commission: "20%" },
  3: { shortLabel: "VIP 3", title: "VIP 3 Toro", luck: "🍀 x3.0", spins: 35, commission: "30%" },
  4: { shortLabel: "VIP 4", title: "VIP 4 León", luck: "🍀 x5.0", spins: 55, commission: "40%" },
  5: { shortLabel: "VIP 5", title: "VIP 5 Tigre", luck: "🍀 x8.0", spins: 80, commission: "50%" },
};

const fallbackPackages = [
  { level: 0, name: "Pasantía Pollito", animalKey: "pollito", priceUsdt: 0, isPurchasable: false, canBuy: false, isIncluded: true, isActive: true, isTrial: true },
  { level: 1, name: "VIP 1 Conejo", animalKey: "conejo", priceUsdt: 5, isPurchasable: true, canBuy: true },
  { level: 2, name: "VIP 2 Oveja", animalKey: "oveja", priceUsdt: 50, isPurchasable: true, canBuy: true },
  { level: 3, name: "VIP 3 Toro", animalKey: "toro", priceUsdt: 200, isPurchasable: true, canBuy: true },
  { level: 4, name: "VIP 4 León", animalKey: "leon", priceUsdt: 500, isPurchasable: true, canBuy: true },
  { level: 5, name: "VIP 5 Tigre", animalKey: "tigre", priceUsdt: 1200, isPurchasable: true, canBuy: true },
];

function money(value) {
  return `${Number(value || 0).toFixed(2)} USDT`;
}

export default function Levels() {
  const [data, setData] = useState(null);
  const [buying, setBuying] = useState(null);
  const [loading, setLoading] = useState(true);
  const [popup, setPopup] = useState("");

  const showPopup = (text) => {
    setPopup(text);
    window.clearTimeout(window.__luckyZooPlanPopup);
    window.__luckyZooPlanPopup = window.setTimeout(() => setPopup(""), 3200);
  };

  const load = async () => {
    setLoading(true);
    try {
      const response = await api.get("/vip/status");
      setData(response.data);
    } catch (error) {
      showPopup(error.message || "No se pudo cargar los planes");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const packages = useMemo(() => {
    const apiPackages = Array.isArray(data?.packages) && data.packages.length ? data.packages : fallbackPackages;
    return [...apiPackages].sort((a, b) => Number(a.level || 0) - Number(b.level || 0));
  }, [data]);

  const activeLevel = Number(data?.activePurchase?.level || 0);
  const activePrice = Number(data?.activePurchase?.priceUsdt || 0);
  const rechargeBalance = Number(data?.user?.balance_usdt || 0);

  const buy = async (pkg) => {
    const level = Number(pkg.level || 0);
    if (level <= 0 || buying) return;

    setBuying(level);
    try {
      const response = await api.post("/vip/buy", { level });
      showPopup(response.data?.message || "Plan activado");
      await load();
    } catch (error) {
      showPopup(error?.response?.data?.message || error.message || "No se pudo activar el plan");
    } finally {
      setBuying(null);
    }
  };

  if (loading) {
    return (
      <div className="page-stack lucky-plans-v15 lucky-plans-v35">
        <section className="lucky-plans-v35-hero">
          <img src={plansBalanceBanner} alt="Planes Lucky Zoo" className="lucky-plans-v35-hero-image" />
          <div className="lucky-plans-v35-balance-overlay">
            <span>Saldo recarga</span>
            <strong><b>0.00</b><small>USDT</small></strong>
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className="page-stack lucky-plans-v15 lucky-plans-v35">
      {popup ? <div className="simple-black-popup">{popup}</div> : null}

      <section className="lucky-plans-v35-hero">
        <img src={plansBalanceBanner} alt="Planes Lucky Zoo" className="lucky-plans-v35-hero-image" />
        <div className="lucky-plans-v35-balance-overlay">
          <span>Saldo recarga</span>
          <strong><b>{Number(rechargeBalance || 0).toFixed(2)}</b><small>USDT</small></strong>
        </div>
      </section>

      <section className="lucky-plans-v15-list">
        {packages.map((pkg) => {
          const level = Number(pkg.level || 0);
          const meta = planMeta[level] || planMeta[0];
          const price = Number(pkg.priceUsdt || 0);
          const isTrial = level === 0 || Boolean(pkg.isTrial);
          const active = Boolean(pkg.isActive);
          const isUpgrade = Boolean(pkg.isUpgrade) || (!isTrial && activeLevel > 0 && level > activeLevel);
          const isDowngrade = Boolean(pkg.isDowngrade) || (!isTrial && activeLevel > 0 && level < activeLevel);
          const upgradeCost = Number(pkg.upgradeCostUsdt ?? Math.max(price - activePrice, 0));
          const actionCost = isUpgrade ? upgradeCost : price;
          const canBuy = !isTrial && !active && !isDowngrade && Boolean(pkg.canBuy ?? pkg.isPurchasable);
          const banner = bannerByAnimal[pkg.animalKey] || pollitoBanner;
          const shownPrice = isTrial ? (meta.priceLabel || 'Gratis') : money(actionCost);

          return (
            <article className={`lucky-plan-v15-card ${active ? 'active' : ''}`} key={level}>
              <div className="lucky-plan-v15-banner">
                <img src={banner} alt={pkg.name} />
              </div>

              <div className="lucky-plan-v15-body">
                <div className="lucky-plan-v15-title-row">
                  <div>
                    <span className="lucky-plan-v15-tag">{meta.shortLabel}</span>
                    <h2>{meta.title || pkg.name}</h2>
                  </div>
                  <div className="lucky-plan-v15-price-badge">
                    <small>💰 Precio</small>
                    <strong>{shownPrice}</strong>
                  </div>
                </div>

                <div className="lucky-plan-v15-features">
                  <div className="feature-chip">
                    <span>🎯 Giros</span>
                    <strong>{meta.spins}</strong>
                  </div>
                  <div className="feature-chip">
                    <span>🍀 Suerte</span>
                    <strong>{meta.luck}</strong>
                  </div>
                  <div className="feature-chip">
                    <span>🤝 Bono referido</span>
                    <strong>{meta.commission}</strong>
                  </div>
                </div>
              </div>

              {active ? (
                <button className="lucky-plan-v15-btn active" type="button">Activo</button>
              ) : isTrial ? (
                <button className="lucky-plan-v15-btn included" type="button">Incluido</button>
              ) : canBuy ? (
                <button className="lucky-plan-v15-btn shine" type="button" onClick={() => buy(pkg)} disabled={buying === level}>
                  <FiCreditCard /> {buying === level ? 'Procesando...' : isUpgrade ? `Upgrade por ${money(actionCost)}` : 'Comprar plan'}
                </button>
              ) : (
                <button className="lucky-plan-v15-btn locked" type="button" disabled>
                  <FiLock /> {isDowngrade ? 'Plan inferior' : rechargeBalance < actionCost ? 'Saldo insuficiente' : 'No disponible'}
                </button>
              )}
            </article>
          );
        })}

        <article className="lucky-plan-help-card">
          <h3>¿Qué significa cada beneficio?</h3>
          <div className="lucky-plan-help-list">
            <div>
              <strong>🎯 Giros</strong>
              <p>Son las oportunidades que tendrás para jugar en la ruleta. Se recargan nuevamente cada hora.</p>
            </div>
            <div>
              <strong>🍀 Suerte</strong>
              <p>Mientras mayor sea tu suerte, tendrás mejores probabilidades de obtener premios más altos.</p>
            </div>
            <div>
              <strong>🤝 Bono por referido</strong>
              <p>Es el porcentaje de bono que podrás ganar cuando tus referidos participen dentro de la plataforma.</p>
            </div>
          </div>
        </article>
      </section>
    </div>
  );
}
