import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FiRefreshCw } from "react-icons/fi";
import { useNavigate } from "react-router-dom";
import { completeVipTask, getTasksDashboard } from "../services/authService";
import { useI18n } from "../i18n/I18nContext";

function formatUsdt(value, decimals = 3) {
  return Number(value || 0).toLocaleString("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

function formatCountdown(ms) {
  const safeMs = Math.max(Number(ms || 0), 0);
  const totalSeconds = Math.floor(safeMs / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return [hours, minutes, seconds].map((item) => String(item).padStart(2, "0")).join(":");
}

function getRemaining(task, now) {
  if (!task?.nextAvailableAt) return 0;
  return Math.max(new Date(task.nextAvailableAt).getTime() - now, 0);
}

function getProgress(task, now) {
  if (!task?.nextAvailableAt) return task?.isAvailable ? 100 : 0;
  const cooldownMs = Number(task.cooldownMinutes || 360) * 60 * 1000;
  const end = new Date(task.nextAvailableAt).getTime();
  const start = end - cooldownMs;
  const elapsed = Math.max(now - start, 0);
  return Math.min(100, Math.max(0, (elapsed / Math.max(cooldownMs, 1)) * 100));
}

const GARDEN_WEEK_DAYS = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];
const TEST_BLOCK_TUESDAY = false;

function getGardenClock(now) {
  const date = new Date(now);
  const utcDay = date.getUTCDay();
  const isWeekend = utcDay === 0 || utcDay === 6;
  const isTestBlocked = TEST_BLOCK_TUESDAY && utcDay === 2;
  const blocked = isWeekend || isTestBlocked;

  return {
    dayName: GARDEN_WEEK_DAYS[utcDay],
    hour: date.toLocaleTimeString("es-ES", {
      timeZone: "UTC",
      hour12: false,
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    }),
    blocked,
    isWeekend,
    isTestBlocked,
  };
}

const DEFAULT_TREE_IMAGE = "/GreenVest_ico.png";

function getTreeImage(level) {
  const safeLevel = Number.isFinite(Number(level)) ? Number(level) : 0;
  return `/tree-icons/tree-${safeLevel}.png`;
}

function handleTreeImageError(event) {
  if (event.currentTarget.src.includes(DEFAULT_TREE_IMAGE)) return;
  event.currentTarget.src = DEFAULT_TREE_IMAGE;
}

export default function Tasks() {
  const navigate = useNavigate();
  const { t } = useI18n();
  const popupTimer = useRef(null);

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [claimingId, setClaimingId] = useState(null);
  const [activeTab, setActiveTab] = useState("water");
  const [waterPopup, setWaterPopup] = useState(null);
  const [now, setNow] = useState(Date.now());

  const gardenClock = useMemo(() => getGardenClock(now), [now]);

  const loadTasks = useCallback(async () => {
    try {
      setLoading(true);
      const result = await getTasksDashboard();
      setData(result);
    } catch (error) {
      setWaterPopup({ type: "error", title: t("No se pudo cargar"), description: error.message || t("Error al cargar agua.") });
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    loadTasks();
  }, [loadTasks]);

  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!waterPopup) return undefined;
    if (popupTimer.current) clearTimeout(popupTimer.current);
    popupTimer.current = setTimeout(() => setWaterPopup(null), 2600);
    return () => {
      if (popupTimer.current) clearTimeout(popupTimer.current);
    };
  }, [waterPopup]);

  const tasks = data?.tasks || [];
  const activeTasks = useMemo(() => tasks.filter((task) => task.status !== "expired"), [tasks]);
  const availableTasks = useMemo(() => activeTasks.filter((task) => task.status === "available"), [activeTasks]);
  const cooldownTasks = useMemo(() => activeTasks.filter((task) => task.status === "cooldown"), [activeTasks]);
  const nextTask = availableTasks[0] || cooldownTasks[0] || activeTasks[0];

  const orderedTasks = useMemo(() => {
    const sortable = [...activeTasks];
    sortable.sort((a, b) => {
      const score = (task) => (task.status === "available" ? 0 : task.status === "cooldown" ? 1 : 2);
      const byState = score(a) - score(b);
      if (byState !== 0) return byState;
      return getRemaining(a, now) - getRemaining(b, now);
    });
    return sortable;
  }, [activeTasks, now]);

  useEffect(() => {
    const shouldRefresh = cooldownTasks.some((task) => getRemaining(task, now) <= 0);
    if (shouldRefresh) {
      const timeout = setTimeout(loadTasks, 800);
      return () => clearTimeout(timeout);
    }
    return undefined;
  }, [now, cooldownTasks, loadTasks]);

  const handleWater = async (task) => {
    if (gardenClock.blocked) {
      setWaterPopup({
        type: "error",
        title: t("Jardín en descanso"),
        description: t("Los fines de semana el jardín descansa."),
      });
      return;
    }

    if (!task || task.status !== "available" || claimingId) return;
    try {
      setClaimingId(task.vipPurchaseId);
      await completeVipTask(task.vipPurchaseId);
      setWaterPopup({
        type: "success",
        treeName: task.packageName || t("tu planta"),
        rewardUsdt: Number(task.waterRewardUsdt || 0),
      });
      await loadTasks();
      setActiveTab("history");
    } catch (error) {
      setWaterPopup({
        type: "error",
        title: t("No se pudo regar"),
        description: error.message || t("Error al regar árbol."),
      });
      await loadTasks();
    } finally {
      setClaimingId(null);
    }
  };

  return (
    <div className="page mining-page trees-task-page">
      {waterPopup && (
        <div className={`tree-water-result-popup ${waterPopup.type === "error" ? "error" : "success"}`}>
          <div className="tree-water-result-popup-card">
            <img className="tree-water-result-popup-icon" src="/watering-active.png" alt="Regadera" />
            {waterPopup.type === "success" ? (
              <>
                <strong>{t("¡Riego completado!")}</strong>
                <span data-no-translate="true">{t("Obtuviste")} +{formatUsdt(waterPopup.rewardUsdt, 3)} USDT</span>
                <small>{t("por regar")} <b data-no-translate="true">{waterPopup.treeName}</b></small>
              </>
            ) : (
              <>
                <strong>{waterPopup.title}</strong>
                <span>{waterPopup.description}</span>
              </>
            )}
          </div>
        </div>
      )}
      {loading && (
        <div className="garden-loading-overlay">
          <div className="garden-loading-popup">
            <span className="garden-loading-spinner" />
            <strong>{t("Cargando...")}</strong>
          </div>
        </div>
      )}
      <header className="mining-header">
        <div className="mining-brand">
          <div className="mining-logo mining-logo-image"><img className="water-ui-icon water-ui-icon-header" src="/water-icon.png" alt="Agua" /></div>
          <div>
            <strong>{t("Jardín GreenVest")}</strong>
            <span>{t("Riega tus plantas cada 6 horas y recoge recompensas")}</span>
          </div>
        </div>
        <button className="mining-small-btn" type="button" onClick={loadTasks}>
          <FiRefreshCw />
        </button>
      </header>

      <section className="mining-main-card tree-water-dashboard">
        {loading ? null : (
          <>
            <div className="tree-water-summary-top tree-water-summary-top-simple">
              <div>
                <strong data-no-translate="true">{nextTask?.packageName || t("Sin árboles activos")}</strong>
              </div>
            </div>

            <div className="tree-water-summary-grid centered compact-top-grid">
              <div className="tree-summary-metric">
                <span>{t("Árboles activos")}</span>
                <strong data-no-translate="true">{activeTasks.length}</strong>
              </div>
              <div className="tree-summary-metric ready">
                <span>{t("Regadera lista")}</span>
                <strong data-no-translate="true">{availableTasks.length}</strong>
              </div>
              <div className="tree-summary-metric tree-summary-balance-highlight">
                <span>{t("Saldo retirable")}</span>
                <strong data-no-translate="true">{formatUsdt(data?.withdrawableBalanceUsdt || 0, 2)} USDT</strong>
              </div>
            </div>

            <button className="mining-primary-btn tree-buy-bottom-btn" type="button" onClick={() => navigate("/vip")}>
              {t("Comprar árboles")}
            </button>
          </>
        )}
      </section>

      <section className={`garden-clock-card ${gardenClock.blocked ? "blocked" : "active"}`}>
        <div>
          <span>{t("Hora Jardín")}</span>
          <strong data-no-translate="true">{gardenClock.dayName} · {gardenClock.hour} UTC</strong>
        </div>
      </section>

      <section className="mining-register-section">
        <h2>{t("Mis plantas")}</h2>
        <div className="mining-tabs mining-tabs-two">
          <button className={activeTab === "water" ? "active" : ""} type="button" onClick={() => setActiveTab("water")}>{t("En curso")}</button>
          <button className={activeTab === "history" ? "active" : ""} type="button" onClick={() => setActiveTab("history")}>{t("Historial")}</button>
        </div>

        {activeTab === "water" && (
          <div className="tree-water-ordered-list">
            {!loading && orderedTasks.length === 0 && (
              <div className="mining-empty">
                {t("No tienes árboles activos. Planta uno para generar agua.")}
              </div>
            )}

            {orderedTasks.map((task) => {
              const remainingMs = getRemaining(task, now);
              const isAvailable = task.status === "available" || remainingMs <= 0;
              const canWater = isAvailable && !gardenClock.blocked;
              const progress = getProgress(task, now);

              return (
                <article key={task.vipPurchaseId} className={`tree-water-ordered-card ${isAvailable ? "available" : ""} ${task.isFree ? "free" : ""}`}>
                  <div className="tree-water-ordered-left">
                    <div className="tree-water-ordered-thumb">
                      <img src={getTreeImage(task.treeLevel)} onError={handleTreeImageError} alt={task.packageName || "GreenVest"} />
                    </div>
                    <div className="tree-water-mini-progress tree-water-mini-progress-below-image">
                      <div className="mining-progress-bar"><span style={{ width: `${progress}%` }} /></div>
                      <div className="tree-water-percent-row">
                        <img className="water-ui-icon tree-water-percent-icon" src="/water-percent-icon.png" alt="Agua" />
                        <strong data-no-translate="true">{progress.toFixed(1)}%</strong>
                      </div>
                    </div>
                  </div>

                  <div className="tree-water-ordered-main">
                    {gardenClock.blocked && isAvailable && (
                      <div className="tree-water-rest-note">
                        {t("Jardín en descanso.")}
                      </div>
                    )}
                    <div className="tree-water-ordered-head">
                      <div>
                        <small>{task.isFree ? t("Nivel gratis") : `${t("Nivel")} ${task.treeLevel}`}</small>
                        <strong data-no-translate="true">{task.packageName}</strong>
                        <span data-no-translate="true">{task.waterName}</span>
                      </div>
                      <b className={isAvailable ? "tree-ready-pill" : "tree-wait-pill"}>
                        {isAvailable ? t("Regadera lista") : t("Esperando")}
                      </b>
                    </div>

                    <div className="tree-water-ordered-specs">
                      <div><span>{t("Recompensa")}</span><strong data-no-translate="true">+{formatUsdt(task.waterRewardUsdt, 3)} USDT</strong></div>
                      <div><span>{t("Producción diaria")}</span><strong data-no-translate="true">{formatUsdt(task.dailyIncomeUsdt, 2)} USDT</strong></div>
                      <div><span>{t("Vence")}</span><strong data-no-translate="true">{new Date(task.expiresAt).toLocaleDateString()}</strong></div>
                      <div><span>{t("Contador")}</span><strong>{isAvailable ? t("Pendiente") : formatCountdown(remainingMs)}</strong></div>
                    </div>

                    <div className="tree-water-ordered-foot">
                      <button type="button" disabled={!canWater || claimingId === task.vipPurchaseId} onClick={() => handleWater(task)}>
                        {isAvailable ? <img className="water-ui-icon water-ui-icon-btn tree-water-btn-icon" src="/water-icon.png" alt="Agua" /> : <img className="water-ui-icon water-ui-icon-btn tree-water-btn-icon" src="/water-icon.png" alt="Agua" />}
                        {gardenClock.blocked && isAvailable
                          ? t("Jardín en descanso")
                          : claimingId === task.vipPurchaseId
                            ? t("Regando...")
                            : isAvailable
                              ? t("Regar planta")
                              : t("Llenando regadera")}
                      </button>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}

        {activeTab === "history" && (
          <div className="mining-history-list">
            {(data?.history || []).length === 0 && <div className="mining-empty">{t("Todavía no tienes plantas regadas.")}</div>}
            {(data?.history || []).slice(0, 10).map((item) => (
              <article key={item.id} className="mining-history-item tree-history-water-item">
                <div className="tree-history-main">
                  <div className="tree-history-water-icon-wrap">
                    <img className="tree-history-water-icon" src="/watering-active.png" alt="Regadera" />
                  </div>
                  <div className="tree-history-copy">
                    <strong>{t("Regaste")} <span data-no-translate="true">{item.treeName}</span></strong>
                    <span data-no-translate="true">{new Date(item.completedAt).toLocaleString()}</span>
                  </div>
                </div>
                <div className="tree-history-reward">
                  <small>{t("Obtuviste")}</small>
                  <b data-no-translate="true">+{formatUsdt(item.rewardUsdt, 3)} USDT</b>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

    </div>
  );
}
