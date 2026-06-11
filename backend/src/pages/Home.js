import React, { useCallback, useEffect, useState } from "react";
import {
  FiBell,
  FiCpu,
  FiDownload,
  FiGift,
  FiGlobe,
  FiInfo,
  FiLink,
  FiRefreshCw,
  FiShield,
  FiTrendingUp,
  FiUploadCloud,
  FiUsers,
  FiVolume2,
  FiZap,
} from "react-icons/fi";
import { FaFacebookF, FaTelegramPlane, FaTiktok, FaWhatsapp } from "react-icons/fa";
import { useLocation, useNavigate } from "react-router-dom";
import { LANGUAGES, useI18n } from "../i18n/I18nContext";
import useInstallPrompt from "../pwa/useInstallPrompt";
import { getMiningStatus, getPromotionDashboard } from "../services/authService";
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
  startAtMs: new Date("2026-05-12T00:00:00-05:00").getTime(),
  intervalMs: 2 * 60 * 60 * 1000,
  baseUsers: 3500,
  baseProduction: 125315,
  usersStep: 252,
  productionStep: 25341,
};

function getLiveStats(nowMs = Date.now()) {
  const elapsed = Math.max(0, nowMs - LIVE_STATS_CONFIG.startAtMs);
  const steps = Math.floor(elapsed / LIVE_STATS_CONFIG.intervalMs);

  return {
    users: LIVE_STATS_CONFIG.baseUsers + steps * LIVE_STATS_CONFIG.usersStep,
    production: LIVE_STATS_CONFIG.baseProduction + steps * LIVE_STATS_CONFIG.productionStep,
  };
}

export default function Home() {
  const navigate = useNavigate();
  const location = useLocation();
  const { language, setLanguage, t } = useI18n();
  const { canInstall, isInstalled, promptInstall } = useInstallPrompt();

  const [showLanguageMenu, setShowLanguageMenu] = useState(false);
  const [installToast, setInstallToast] = useState("");
  const [heroIndex, setHeroIndex] = useState(0);
  const [totalAssets, setTotalAssets] = useState(0);
  const [investmentWallet, setInvestmentWallet] = useState(0);
  const [earningsWallet, setEarningsWallet] = useState(0);
  const [currentLevel, setCurrentLevel] = useState("");
  const [loadError, setLoadError] = useState("");
  const [referralLink, setReferralLink] = useState(`${window.location.origin}/register`);
  const [pointLogs, setPointLogs] = useState(() => getRandomPointsLog());
  const [pointStartIndex, setPointStartIndex] = useState(0);
  const [pointAnimating, setPointAnimating] = useState(false);
  const [pointResetting, setPointResetting] = useState(false);
  const [liveStatsTick, setLiveStatsTick] = useState(Date.now());

  const loadHome = useCallback(async () => {
    try {
      const result = await getMiningStatus();

      const balances = result?.balances || {};
      const mining = result?.mining || {};
      const user = result?.user || {};

      const investmentValue = getMaxNumber(
        balances?.investmentWalletUsdt,
        balances?.investment_wallet_usdt,
        mining?.investedAmount,
        mining?.invested_amount,
        user?.balance_usdt,
        user?.recharge_balance_usdt
      );

      const earningsValue = getMaxNumber(
        balances?.earningsWalletUsdt,
        balances?.earnings_wallet_usdt,
        user?.withdrawable_usdt
      );

      const totalValueFromApi = getMaxNumber(
        balances?.totalAssetsUsdt,
        balances?.total_assets_usdt
      );

      const totalValue = totalValueFromApi > 0
        ? totalValueFromApi
        : investmentValue + earningsValue;

      const levelValue =
        mining?.plan?.name ||
        mining?.planName ||
        mining?.plan_name ||
        result?.miningLevel ||
        "";

      console.log("MINING STATUS RESPONSE:", result);
      console.log("HOME VALUES TO RENDER:", {
        totalValue,
        investmentValue,
        earningsValue,
        levelValue,
      });

      setTotalAssets(totalValue);
      setInvestmentWallet(investmentValue);
      setEarningsWallet(earningsValue);
      setCurrentLevel(levelValue);
      setLoadError("");
    } catch (error) {
      console.error("MINING STATUS ERROR:", error);
      setLoadError(error.message || "No se pudo cargar la minería");
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
    }, 60000);

    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const interval = setInterval(() => {
      setHeroIndex((prev) => (prev + 1) % 2);
    }, 4500);

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
      eyebrow: t("GREENVEST"),
      title: t("Minería inteligente"),
      description: t("Sube tu tasa de hash y reclama recompensas cada 24 horas."),
      icon: <FiTrendingUp />,
      variant: "slide-mining",
    },
    {
      eyebrow: t("INVITA Y GANA"),
      title: t("Invita a tus amigos"),
      description: t("Invita a tus amigos para ganar más poder de hash y mejores recompensas."),
      icon: <FiUsers />,
      variant: "slide-invite",
    },
  ];

  const activeHero = heroSlides[heroIndex] || heroSlides[0];

  const tickerMessages = {
    es: "💰 La excelente plataforma de largo plazo de simulación minera está activa, ideal para personas interesadas en generar ingresos adicionales desde la comodidad de su casa e inversores serios que quieran ganar mucho más.",
    en: "💰 The excellent long-term mining simulation platform is active, ideal for people interested in generating additional income from home and serious investors who want to earn much more.",
  };

  const tickerMessage = tickerMessages[language] || tickerMessages.es;

  const shareText = language === "en"
    ? `Join GreenVest and earn with smart mining simulation. ${referralLink}`
    : `¡Únete y gana con GreenVest! Simulación minera inteligente para aumentar tu poder de hash. ${referralLink}`;

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
      {showFreePlantPopup && (
        <div className="home-free-plant-popup-overlay" onClick={() => setShowFreePlantPopup(false)}>
          <div className="home-free-plant-popup" onClick={(event) => event.stopPropagation()}>
            <button
              type="button"
              className="home-free-plant-popup-close"
              onClick={() => setShowFreePlantPopup(false)}
              aria-label={t("Cerrar")}
            >
              ×
            </button>

            <button
              type="button"
              className="home-free-plant-popup-image"
              onClick={() => {
                setShowFreePlantPopup(false);
                navigate("/points");
              }}
              aria-label={t("Gánate una planta gratis")}
            >
              <img src="/greenvest_banner_planta_gratis.png" alt="Gánate una planta gratis - Evento permanente GreenVest" />
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
            <FiCpu />
          </div>
          <strong>GreenVest</strong>
        </div>

        <div className="runpod-actions">
          <div className="language-switcher">
            <button
              className="runpod-lang compact-language-button"
              type="button"
              onClick={() => setShowLanguageMenu((value) => !value)}
              aria-label={t("Idioma")}
            >
              <span className="compact-language-globe">🌐</span>
              <strong>{LANGUAGES[language]?.short || "ES"}</strong>
            </button>

            {showLanguageMenu && (
              <div className="language-menu compact-language-menu">
                <div className="language-menu-title">{t("Idioma")}</div>

                {Object.values(LANGUAGES).filter((item) => ["es", "en"].includes(item.code)).map((item) => (
                  <button
                    key={item.code}
                    className={language === item.code ? "active" : ""}
                    type="button"
                    onClick={() => {
                      setLanguage(item.code);
                      setShowLanguageMenu(false);
                    }}
                  >
                    <span className="language-option-main">
                      <i>{item.flag}</i>
                      <em>{item.label}</em>
                    </span>
                    <strong>{item.short}</strong>
                  </button>
                ))}
              </div>
            )}
          </div>

          <button className="runpod-bell" type="button">
            <FiBell />
            <i />
          </button>
        </div>
      </header>

      <section className={`runpod-hero-carousel ${activeHero.variant}`}>
        <div key={activeHero.variant} className="runpod-hero">
          <div>
            <span>{activeHero.eyebrow}</span>
            <h1>{activeHero.title}</h1>
            <p>{activeHero.description}</p>
          </div>
          {activeHero.icon}
        </div>

        <div className="runpod-hero-dots" aria-label="Hero carousel navigation">
          {heroSlides.map((slide, index) => (
            <button
              key={slide.variant}
              type="button"
              className={`runpod-hero-dot ${heroIndex === index ? "is-active" : ""}`}
              onClick={() => setHeroIndex(index)}
              aria-label={`${slide.title} ${index + 1}`}
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

      <section className="runpod-assets-card">
        <div className="runpod-assets-top">
          <h2>{t("Activos totales")}</h2>
          <strong data-no-translate="true">{formatUsdt(totalAssets)} USDT</strong>
        </div>

        <div className="runpod-assets-line">
          <span>{t("Cartera de inversión")}</span>
          <b data-no-translate="true">$ {formatUsdt(investmentWallet)}</b>
        </div>

        <div className="runpod-assets-line">
          <span>{t("Monedero de comisiones")}</span>
          <b data-no-translate="true">$ {formatUsdt(earningsWallet)}</b>
        </div>

        <div className="runpod-assets-line">
          <span>{t("Nivel actual")}</span>
          <b className="gold-text" data-no-translate="true">
            {currentLevel || t("Sin minería")}
          </b>
        </div>
      </section>

      <div className="runpod-ticker">
        <FiVolume2 />
        <div className="runpod-ticker-marquee" aria-label="Anuncio principal">
          <div className="runpod-ticker-track">
            <span>{tickerMessage}</span>
            <span>{tickerMessage}</span>
          </div>
        </div>
      </div>

      <section className="runpod-grid-actions">
        <button type="button" onClick={() => navigate("/recharge")}>
          <FiUploadCloud />
          <span>{t("Depósito")}</span>
        </button>

        <button type="button" onClick={() => navigate("/withdraw")}>
          <FiDownload />
          <span>{t("Retirar")}</span>
        </button>

        <button type="button" onClick={() => navigate("/vip")}>
          <FiCpu />
          <span>{t("personaje")}</span>
        </button>

        <button type="button" onClick={() => navigate("/tasks")}>
          <FiShield />
          <span>{t("Eventos")}</span>
        </button>

        <button type="button" onClick={() => navigate("/rewards")}>
          <FiGift />
          <span>{t("Premios")}</span>
        </button>

        <button type="button" onClick={() => navigate("/promotion")}>
          <FiLink />
          <span>{t("Invitar")}</span>
        </button>

        <button type="button" onClick={() => navigate("/about")}>
          <FiInfo />
          <span>{t("Acerca de")}</span>
        </button>

        <button type="button" onClick={handleInstall}>
          <FiRefreshCw />
          <span>{t("Aplicación")}</span>
        </button>
      </section>

      <section className="home-points-log-card">
        <div className="home-points-log-head">
          <FiGift />
          <h3>{t("Registro de retiros")}</h3>
        </div>

        <div className="home-points-log-viewport">
          <div className={`home-points-log-track ${pointAnimating ? "is-animating" : ""} ${pointResetting ? "is-resetting" : ""}`}>
            {pointRowsToRender.map((item) => (
              <div className="home-points-log-row" key={item.renderKey}>
                <span data-no-translate="true">{item.email}</span>
                <b data-no-translate="true">se retiró <strong>$ {formatPointPrize(item.amount)}</strong></b>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="home-live-stats-grid">
        <article className="home-live-stat-card">
          <div className="home-live-stat-icon users">
            <FiUsers />
          </div>
          <strong data-no-translate="true">{liveStats.users.toLocaleString("en-US")}</strong>
          <span>{t("Usuarios totales")}</span>
        </article>

        <article className="home-live-stat-card">
          <div className="home-live-stat-icon production">
            <FiZap />
          </div>
          <strong data-no-translate="true">{liveStats.production.toLocaleString("en-US")}</strong>
          <span>{t("Producción total")}</span>
        </article>
      </section>

      <section className="home-share-card">
        <div className="home-share-head">
          <h2>{t("Compartir en")}</h2>
        </div>

        <div className="home-share-buttons">
          {shareOptions.map((option) => (
            <button
              key={option.key}
              type="button"
              className={`home-share-btn ${option.key}`}
              onClick={() => handleShareClick(option)}
              aria-label={option.label}
            >
              <span data-no-translate="true">{option.icon}</span>
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}
