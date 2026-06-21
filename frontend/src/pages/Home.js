import React, { useCallback, useEffect, useState } from "react";
import {
  FiDownload,
} from "react-icons/fi";
import { FaFacebookF, FaTelegramPlane, FaTiktok, FaWhatsapp } from "react-icons/fa";
import { useLocation, useNavigate } from "react-router-dom";
import { useI18n } from "../i18n/I18nContext";
import useInstallPrompt from "../pwa/useInstallPrompt";
import { getVipStatus, getPromotionDashboard } from "../services/authService";
import pointsLogData from "../data/pointsLog.json";

function toNumber(value) {
  if (value === null || value === undefined || value === "") return 0;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatUsdt(value) {
  return toNumber(value).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function formatPointPrize(value) {
  return Number(value || 0).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function getRandomPointsLog() {
  const shuffled = [...pointsLogData].sort(() => Math.random() - 0.5);

  return shuffled.slice(0, 8).map((item, index) => ({
    id: `${Date.now()}-${index}-${Math.random()}`,
    email: item.email,
    amount: Math.random() * (1245 - 45) + 45,
  }));
}

function getMaxNumber(...values) {
  return Math.max(0, ...values.map(toNumber));
}

const LIVE_STATS_CONFIG = {
  startAtMs: new Date("2026-06-01T00:00:00-05:00").getTime(),
  intervalMs: 60 * 60 * 1000,
  productionIntervalMs: 5 * 1000,
  baseUsers: 204,
  baseProduction: 204,
  usersStepMin: 5,
  usersStepMax: 30,
};

function getDeterministicStep(stepIndex, min, max, salt) {
  const seed = Math.sin((stepIndex + 1) * (salt + 1) * 12.9898) * 43758.5453;
  const fraction = seed - Math.floor(seed);
  return min + Math.floor(fraction * (max - min + 1));
}

function getAccumulatedValue(base, steps, min, max, salt) {
  let total = base;
  for (let index = 0; index < steps; index += 1) {
    total += getDeterministicStep(index, min, max, salt);
  }
  return total;
}

function getLiveStats(nowMs = Date.now()) {
  const elapsed = Math.max(0, nowMs - LIVE_STATS_CONFIG.startAtMs);
  const hourlySteps = Math.floor(elapsed / LIVE_STATS_CONFIG.intervalMs);
  const productionSteps = Math.floor(elapsed / LIVE_STATS_CONFIG.productionIntervalMs);

  return {
    users: getAccumulatedValue(
      LIVE_STATS_CONFIG.baseUsers,
      hourlySteps,
      LIVE_STATS_CONFIG.usersStepMin,
      LIVE_STATS_CONFIG.usersStepMax,
      17,
    ),
    production: LIVE_STATS_CONFIG.baseProduction + productionSteps,
  };
}

const PLANT_FEED = [
  { plant: "Planta Pasantía", amount: "0.075" },
  { plant: "Planta Esmeralda", amount: "0.170" },
  { plant: "Planta Zafiro", amount: "0.500" },
  { plant: "Planta Rubí", amount: "1.340" },
  { plant: "Planta Amatista", amount: "2.500" },
  { plant: "Planta Topacio", amount: "5.850" },
  { plant: "Planta Aguamarina", amount: "13.350" },
  { plant: "Planta Citrino", amount: "25.000" },
  { plant: "Planta Cuarzo Rosa", amount: "66.700" },
];

function getPlantFeedRows(count = 24) {
  return Array.from({ length: count }, (_, index) => {
    const plant = PLANT_FEED[(index * 7 + 3) % PLANT_FEED.length];
    const id = 100000 + ((index * 7919 + 274463) % 899999);

    return {
      id,
      plant: plant.plant,
      amount: plant.amount,
      key: `${id}-${plant.plant}-${index}`,
    };
  });
}


export default function Home() {
  const navigate = useNavigate();
  const location = useLocation();
  const { language, t } = useI18n();
  const { canInstall, isInstalled, promptInstall } = useInstallPrompt();

  const [installToast, setInstallToast] = useState("");
  const [heroIndex, setHeroIndex] = useState(0);
  const [totalAssets, setTotalAssets] = useState(0);
  const [investmentWallet, setInvestmentWallet] = useState(0);
  const [earningsWallet, setEarningsWallet] = useState(0);
  const [currentLevel, setCurrentLevel] = useState("");
  const [loadError, setLoadError] = useState("");
  const [loading, setLoading] = useState(true);
  const [referralLink, setReferralLink] = useState(`${window.location.origin}/register`);
  const [pointLogs, setPointLogs] = useState(() => getRandomPointsLog());
  const [pointStartIndex, setPointStartIndex] = useState(0);
  const [pointAnimating, setPointAnimating] = useState(false);
  const [pointResetting, setPointResetting] = useState(false);
  const [liveStatsTick, setLiveStatsTick] = useState(Date.now());
  const [feedIndex, setFeedIndex] = useState(0);
  const [showPromoBonusPopup, setShowPromoBonusPopup] = useState(true);
  const plantFeedRows = getPlantFeedRows(24);

  const loadHome = useCallback(async () => {
    try {
      const result = await getVipStatus();
      const user = result?.user || {};
      const packages = result?.packages || [];
      const activePaidTrees = packages
        .filter((item) => item.isActive && Number(item.level) >= 1)
        .sort((a, b) => Number(b.level) - Number(a.level));

      const investmentValue = getMaxNumber(result?.rechargeBalanceUsdt, user?.balance_usdt, user?.recharge_balance_usdt);
      const earningsValue = getMaxNumber(result?.earningsBalanceUsdt, user?.withdrawable_usdt);
      const totalValue = investmentValue + earningsValue;
      const levelValue = activePaidTrees[0]?.name || packages.find((item) => item.isActive)?.name || "Pasantía";

      setTotalAssets(totalValue);
      setInvestmentWallet(investmentValue);
      setEarningsWallet(earningsValue);
      setCurrentLevel(levelValue);
      setLoadError("");
    } catch (error) {
      console.error("GREENVEST HOME ERROR:", error);
      setLoadError(error.message || "No se pudo cargar GreenVest");
    } finally {
      setLoading(false);
    }
  }, []);

  const loadReferralLink = useCallback(async () => {
    try {
      const result = await getPromotionDashboard();
      const code = result?.referralCode || result?.user?.referral_code || result?.user?.referralCode || "";
      const link = result?.referralLink || `${window.location.origin}/register?ref=${code}`;
      setReferralLink(link);
    } catch (error) {
      console.warn("REFERRAL LINK ERROR:", error);
    }
  }, []);

  useEffect(() => {
    loadHome();
    const interval = setInterval(loadHome, 15000);

    const refreshNow = () => loadHome();
    const onVisibility = () => {
      if (!document.hidden) loadHome();
    };

    window.addEventListener("focus", refreshNow);
    window.addEventListener("greenvest:balance-refresh", refreshNow);
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      clearInterval(interval);
      window.removeEventListener("focus", refreshNow);
      window.removeEventListener("greenvest:balance-refresh", refreshNow);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [loadHome, location.search]);


  useEffect(() => {
    loadReferralLink();
  }, [loadReferralLink]);

  useEffect(() => {
    const interval = setInterval(() => {
      setPointLogs(getRandomPointsLog());
    }, 18000);

    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    setPointStartIndex(0);
    setPointAnimating(false);
    setPointResetting(false);
  }, [pointLogs]);

  useEffect(() => {
    if (pointLogs.length <= 3) return undefined;

    let timeoutId = null;
    let rafId = null;

    const interval = setInterval(() => {
      setPointAnimating(true);

      timeoutId = setTimeout(() => {
        setPointStartIndex((prev) => (prev + 1) % pointLogs.length);
        setPointResetting(true);
        setPointAnimating(false);

        rafId = requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            setPointResetting(false);
          });
        });
      }, 420);
    }, 2000);

    return () => {
      clearInterval(interval);
      if (timeoutId) clearTimeout(timeoutId);
      if (rafId) cancelAnimationFrame(rafId);
    };
  }, [pointLogs]);

  useEffect(() => {
    const interval = setInterval(() => {
      setLiveStatsTick(Date.now());
    }, 5000);

    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const interval = setInterval(() => {
      setFeedIndex((prev) => (prev + 1) % plantFeedRows.length);
    }, 5000);

    return () => clearInterval(interval);
  }, [plantFeedRows.length]);


  useEffect(() => {
    const interval = setInterval(() => {
      setHeroIndex((prev) => (prev + 1) % 3);
    }, 5000);

    return () => clearInterval(interval);
  }, []);


  const handleInstall = async () => {
    if (isInstalled) {
      setInstallToast("La aplicación ya está instalada.");
      setTimeout(() => setInstallToast(""), 2600);
      return;
    }

    if (canInstall) {
      const installed = await promptInstall();
      setInstallToast(installed ? "Instalando acceso directo..." : "Instalación cancelada.");
      setTimeout(() => setInstallToast(""), 2600);
      return;
    }

    const isiPhoneOrIpad = /iphone|ipad|ipod/i.test(window.navigator.userAgent || "");
    const message = isiPhoneOrIpad
      ? "En iPhone: toca Compartir y luego Agregar a pantalla de inicio."
      : "Abre el menú del navegador y elige Instalar aplicación o Agregar a pantalla de inicio.";

    setInstallToast(message);
    setTimeout(() => setInstallToast(""), 5200);
  };

  const liveStats = getLiveStats(liveStatsTick);

  const pointRowsToRender = pointLogs.length
    ? Array.from({ length: Math.min(4, pointLogs.length) }, (_, offset) => {
        const item = pointLogs[(pointStartIndex + offset) % pointLogs.length];
        return {
          ...item,
          renderKey: `${item.id}-${pointStartIndex}-${offset}`,
        };
      })
    : [];

  const heroSlides = [
    {
      key: "tech-agri-v34",
      image: "/greenvest_home_banner_01_tech_v34.png",
      alt: "GreenVest tecnología y agricultura",
    },
    {
      key: "commissions-v34",
      image: "/greenvest_home_banner_02_commissions_v34.png",
      alt: "GreenVest hasta 10 por ciento en comisiones",
    },
    {
      key: "gains-v34",
      image: "/greenvest_home_banner_03_gains_v34.png",
      alt: "GreenVest hasta 200 por ciento en ganancias",
    },
  ];

  const tickerMessages = {
    es: "💰 La excelente plataforma de largo plazo de planes GreenVest está activa, ideal para personas interesadas en generar ingresos adicionales desde la comodidad de su casa e inversores serios que quieran ganar mucho más.",
    en: "💰 The excellent long-term mining simulation platform is active, ideal for people interested in generating additional income from home and serious investors who want to earn much more.",
  };

  const tickerMessage = tickerMessages[language] || tickerMessages.es;

  const shareText = language === "en"
    ? `Join GreenVest and earn with smart mining simulation. ${referralLink}`
    : `¡Únete y gana con GreenVest! Simulación de planes inteligentes para aumentar tu equipo GreenVest. ${referralLink}`;

  const encodedShareText = encodeURIComponent(shareText);
  const encodedReferralLink = encodeURIComponent(referralLink);

  const shareOptions = [
    {
      key: "whatsapp",
      label: "WhatsApp",
      icon: <FaWhatsapp />,
      url: `https://wa.me/?text=${encodedShareText}`,
    },
    {
      key: "facebook",
      label: "Facebook",
      icon: <FaFacebookF />,
      url: `https://www.facebook.com/sharer/sharer.php?u=${encodedReferralLink}`,
    },
    {
      key: "telegram",
      label: "Telegram",
      icon: <FaTelegramPlane />,
      url: `https://t.me/share/url?url=${encodedReferralLink}&text=${encodedShareText}`,
    },
    {
      key: "x",
      label: "X.com",
      icon: <span className="home-share-x-icon">X</span>,
      url: `https://x.com/intent/tweet?text=${encodedShareText}`,
    },
    {
      key: "tiktok",
      label: "TikTok",
      icon: <FaTiktok />,
      url: "https://www.tiktok.com/",
    },
  ];

  const handleShareClick = async (option) => {
    try {
      await navigator.clipboard.writeText(shareText);
    } catch (error) {
      console.warn("SHARE COPY ERROR:", error);
    }

    window.open(option.url, "_blank", "noopener,noreferrer");
  };

  return (
    <div className="page runpod-home-page">
      {loading && (
        <div className="garden-loading-overlay app-loading-overlay">
          <div className="garden-loading-popup app-loading-popup">
            <span className="garden-loading-spinner" />
            <strong>{t("Cargando...")}</strong>
          </div>
        </div>
      )}
      {showPromoBonusPopup && (
        <div className="home-free-plant-popup-overlay" onClick={() => setShowPromoBonusPopup(false)}>
          <div className="home-free-plant-popup" onClick={(event) => event.stopPropagation()}>
            <button
              type="button"
              className="home-free-plant-popup-close"
              onClick={() => setShowPromoBonusPopup(false)}
              aria-label={t("Cerrar")}
            >
              ×
            </button>

            <button
              type="button"
              className="home-free-plant-popup-image"
              onClick={() => {
                setShowPromoBonusPopup(false);
                navigate("/promociones");
              }}
              aria-label="Bono de 5% GreenVest"
            >
              <img src="/greenvest_bono_5_junio_21_24.png" alt="Bono de 5% GreenVest del 21 al 24 de junio" />
            </button>
          </div>
        </div>
      )}

      {installToast && (
        <div className="home-install-toast">
          <span>{installToast}</span>
        </div>
      )}
      <header className="runpod-header">
        <div className="runpod-brand">
          <div className="runpod-logo">
            <img src="/GreenVest_ico.png" alt="GreenVest" className="runpod-logo-img" />
          </div>
          <strong>GreenVest</strong>
        </div>

        <div className="runpod-actions">
          <button
            className="runpod-install-header"
            type="button"
            onClick={handleInstall}
            aria-label={t("Descargar aplicación")}
          >
            <FiDownload />
            <span>{t("Aplicación")}</span>
          </button>
        </div>
      </header>

      <section className="runpod-image-carousel" aria-label="Banners principales GreenVest">
        <div
          className="runpod-image-track"
          style={{ transform: `translateX(-${heroIndex * 100}%)` }}
        >
          {heroSlides.map((slide) => (
            <div key={slide.key} className="runpod-image-slide">
              <img src={slide.image} alt={slide.alt} />
            </div>
          ))}
        </div>

        <div className="runpod-hero-dots" aria-label="Banner carousel navigation">
          {heroSlides.map((slide, index) => (
            <button
              key={slide.key}
              type="button"
              className={`runpod-hero-dot ${heroIndex === index ? "is-active" : ""}`}
              onClick={() => setHeroIndex(index)}
              aria-label={`Banner ${index + 1}`}
            />
          ))}
        </div>
      </section>

      {loadError && (
        <div
          className="runpod-ticker"
          style={{ borderColor: "rgba(255, 138, 31, 0.65)", color: "#ffd36a" }}
        >
          ⚠️ API: {loadError}
        </div>
      )}

      <section className="home-main-actions-clean">
        <button type="button" className="home-main-action recharge" onClick={() => navigate("/recharge")}>
          <span>{t("Recarga")}</span>
        </button>

        <button type="button" className="home-main-action withdraw" onClick={() => navigate("/withdraw")}>
          <span>{t("Retirar")}</span>
        </button>
      </section>

      <section className="home-simple-balances-card">
        <div className="home-simple-balance-row">
          <span>{t("Saldo de recarga")}</span>
          <strong data-no-translate="true">{formatUsdt(investmentWallet)} USDT</strong>
        </div>

        <div className="home-simple-balance-row">
          <span>{t("Saldo retirable")}</span>
          <strong data-no-translate="true">{formatUsdt(earningsWallet)} USDT</strong>
        </div>
      </section>

      <section className="home-compact-stats-card">
        <div className="home-compact-stat">
          <img className="home-compact-stat-img" src="/tree-icons/tree-0.png" alt="Planta Pasantía" />
          <div>
            <strong data-no-translate="true">{liveStats.users.toLocaleString("en-US")}</strong>
            <small>{t("Usuarios")}</small>
          </div>
        </div>

        <div className="home-compact-stat">
          <img className="home-compact-stat-img watering" src="/watering-active.png" alt="Regadera" />
          <div>
            <strong data-no-translate="true">{liveStats.production.toLocaleString("en-US")}</strong>
            <small>{t("Plantas regadas")}</small>
          </div>
        </div>
      </section>

      <section className="home-activity-feed">
        <div className="home-activity-feed-window" key={feedIndex}>
          {[0, 1, 2].map((offset) => {
            const item = plantFeedRows[(feedIndex - offset + plantFeedRows.length) % plantFeedRows.length];

            return (
              <div className="home-activity-feed-row" key={`${item.key}-${offset}`}>
                <img className="home-activity-feed-water" src="/watering-active.png" alt="" />
                <div className="home-activity-feed-text">
                  <strong data-no-translate="true">ID {item.id}</strong>
                  <span data-no-translate="true">Regó {item.plant}</span>
                </div>
                <b data-no-translate="true">Obtuvo {item.amount} USDT</b>
              </div>
            );
          })}
        </div>
      </section>

      <section className="home-lower-banners home-lower-image-banners">
        <button type="button" className="home-lower-image-banner" onClick={() => navigate("/vip")} aria-label={t("Adquiere tus plantas")}>
          <img src="/greenvest_banner_adquiere_plantas.png" alt="Adquiere tus plantas GreenVest" />
        </button>

        <button type="button" className="home-lower-image-banner" onClick={() => navigate("/points")} aria-label={t("Puntos GreenVest")}>
          <img src="/greenvest_banner_puntos.png" alt="Puntos GreenVest" />
        </button>

        <button type="button" className="home-lower-image-banner" onClick={() => navigate("/promotion")} aria-label={t("Invita a tus amigos")}>
          <img src="/greenvest_banner_invita_amigos.png" alt="Invita a tus amigos GreenVest" />
        </button>
      </section>

      <section className="home-about-footer">
        <button type="button" onClick={() => navigate("/about")}>
          {t("Nosotros")}
        </button>
        <p>{t("Conoce más sobre GreenVest, nuestra empresa y el propósito del ecosistema agrícola digital.")}</p>
        <small>© 2026 GreenVest Corporation Inc. Todos los derechos reservados.</small>
      </section>
    </div>
  );
}
