import React, { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { FiClock } from "react-icons/fi";
import BottomNav from "../components/BottomNav";
import { getTasksDashboard, completeVipTask } from "../services/authService";
import { useI18n } from "../i18n/I18nContext";

function formatCountdown(ms) {
  if (ms <= 0) return "00:00:00";

  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(
    2,
    "0"
  )}:${String(seconds).padStart(2, "0")}`;
}

function formatAmount(value) {
  return Number(value || 0).toFixed(2);
}

function getTaskRemainingMs(task, now) {
  if (!task?.nextAvailableAt) return 0;
  return new Date(task.nextAvailableAt).getTime() - now;
}

export default function Tasks() {
  const navigate = useNavigate();
  const { t } = useI18n();
  const messageTimerRef = useRef(null);

  const [data, setData] = useState(null);
  const [activeTab, setActiveTab] = useState("available");
  const [loading, setLoading] = useState(true);
  const [processingTaskId, setProcessingTaskId] = useState(null);
  const [message, setMessage] = useState("");
  const [now, setNow] = useState(Date.now());

  const loadTasks = useCallback(async () => {
    try {
      setLoading(true);
      const result = await getTasksDashboard();
      setData(result);
    } catch (error) {
      setMessage(error.message || t("Error al cargar misiones."));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    loadTasks();
  }, [loadTasks]);

  useEffect(() => {
    const interval = setInterval(() => {
      setNow(Date.now());
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!data?.tasks?.length) return undefined;

    const hasFinishedCooldown = data.tasks.some((task) => {
      if (task.status !== "cooldown") return false;
      return getTaskRemainingMs(task, Date.now()) <= 0;
    });

    if (hasFinishedCooldown) {
      const timeout = setTimeout(loadTasks, 800);
      return () => clearTimeout(timeout);
    }

    return undefined;
  }, [now, data?.tasks, loadTasks]);

  useEffect(() => {
    if (!message) return undefined;

    if (messageTimerRef.current) {
      clearTimeout(messageTimerRef.current);
    }

    messageTimerRef.current = setTimeout(() => {
      setMessage("");
    }, 3200);

    return () => {
      if (messageTimerRef.current) {
        clearTimeout(messageTimerRef.current);
      }
    };
  }, [message]);

  const tasks = data?.tasks ?? [];
  const availableTasks = tasks.filter((task) => task.status === "available");
  const cooldownTasks = tasks.filter((task) => task.status === "cooldown");
  const currentList = activeTab === "available" ? availableTasks : cooldownTasks;

  const handleCompleteTask = async (taskId) => {
    if (!taskId) {
      setMessage(t("Error: esta misión no tiene ID válido."));
      return;
    }

    try {
      setProcessingTaskId(taskId);
      setMessage("");

      const result = await completeVipTask(taskId);

      setMessage(result.message || t("Misión completada correctamente."));
      await loadTasks();
      setActiveTab("cooldown");
    } catch (error) {
      setMessage(error.message || t("Error al completar misión."));
      await loadTasks();
    } finally {
      setProcessingTaskId(null);
    }
  };

  const renderTaskTitle = (task) => {
    const rawTitle = task.title || task.packageName || `GreenVest AI ${task.vipLevel || ""}`;
    return t(String(rawTitle || "Misión GreenVest AI"));
  };

  const balance = formatAmount(data?.withdrawableBalanceUsdt ?? 0);
  const available = Number(data?.availableTasks ?? availableTasks.length);
  const total = Number(data?.totalTasks ?? tasks.length);
  const cooldown = Number(data?.cooldownTasks ?? cooldownTasks.length);

  const nearestCooldown = cooldownTasks
    .map((task) => getTaskRemainingMs(task, now))
    .filter((ms) => ms > 0)
    .sort((a, b) => a - b)[0];

  const globalCountdown = nearestCooldown ? formatCountdown(nearestCooldown) : "00:00:00";

  return (
    <div className="page tasks-clean-page">
      <div className="tasks-clean-header">
        <div className="tasks-clean-logo">
          <img src="/luven_favicon.ico" alt="GreenVest" />
        </div>

        <h1 className="tasks-clean-title">{t("Misiones")}</h1>
      </div>

      <section className="panel tasks-clean-card">
        <div className="tasks-clean-top">
          <div className="tasks-clean-balance">
            <span>{t("Balance retirable")}</span>
            <strong>{balance}</strong>
          </div>

          <button
            type="button"
            className="tasks-clean-recharge"
            onClick={() => navigate("/recharge")}
          >
            {t("Recargar")}
          </button>
        </div>

        <div className="tasks-clean-stats">
          <div>
            <strong>{available}</strong>
            <span>{t("Disponibles")}</span>
          </div>

          <div>
            <strong>{total}</strong>
            <span>{t("Activas")}</span>
          </div>

          <div>
            <strong>{cooldown}</strong>
            <span>{t("En espera")}</span>
          </div>
        </div>

        <div className="tasks-clean-countdown">
          <strong>{globalCountdown}</strong>
          <span>
            <FiClock />
            {t("Próxima misión disponible")}
          </span>
        </div>

        <div className="tasks-clean-tabs">
          <button
            type="button"
            className={`tasks-clean-tab ${
              activeTab === "available" ? "active" : ""
            }`}
            onClick={() => setActiveTab("available")}
          >
            {t("Disponibles")}
          </button>

          <button
            type="button"
            className={`tasks-clean-tab ${
              activeTab === "cooldown" ? "active" : ""
            }`}
            onClick={() => setActiveTab("cooldown")}
          >
            {t("En espera")}
          </button>
        </div>

        <div className="tasks-clean-list">
          {loading && <div className="tasks-clean-empty">{t("Cargando misiones...")}</div>}

          {!loading && currentList.length === 0 && (
            <div className="tasks-clean-empty">
              {activeTab === "available"
                ? t("No tienes misiones disponibles. Compra un GreenVest AI activo o espera que termine el contador.")
                : t("No tienes misiones en espera por ahora.")}
            </div>
          )}

          {!loading &&
            currentList.map((task) => {
              const taskId = task.id || task.vipPurchaseId || task.vip_purchase_id;
              const remainingMs = getTaskRemainingMs(task, now);
              const taskCountdown = formatCountdown(remainingMs);
              const isAvailable = task.status === "available" || remainingMs <= 0;

              return (
                <article
                  className="tasks-clean-item"
                  key={taskId || `${task.vipLevel}-${task.rewardUsdt}`}
                >
                  <div>
                    <h3>{renderTaskTitle(task)}</h3>

                    <p>
                      {t("Ganancia por misión:")} {" "}
                      <strong>
                        {formatAmount(task.taskRewardUsdt || task.rewardUsdt || task.reward_usdt)} USDT
                      </strong>
                    </p>

                    <p>
                      {t("Tiempo de espera:")} {" "}
                      <strong>{task.cooldownLabel || `${task.cooldownMinutes} min`}</strong>
                    </p>

                    {!isAvailable && (
                      <p>
                        {t("Disponible en:")} <strong>{taskCountdown}</strong>
                      </p>
                    )}
                  </div>

                  {isAvailable ? (
                    <button
                      type="button"
                      className="tasks-clean-complete-btn"
                      disabled={!taskId || processingTaskId === taskId}
                      onClick={() => handleCompleteTask(taskId)}
                    >
                      {processingTaskId === taskId ? t("Procesando...") : t("Completar")}
                    </button>
                  ) : (
                    <span className="tasks-clean-completed">{taskCountdown}</span>
                  )}
                </article>
              );
            })}
        </div>
      </section>

      {message && <div className="tasks-clean-toast">{message}</div>}

      <BottomNav />
    </div>
  );
}
