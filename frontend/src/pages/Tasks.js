import React, { useEffect, useMemo, useState } from "react";
import { FiAward, FiCheckCircle, FiClock, FiDollarSign, FiRefreshCw, FiTarget, FiZap } from "react-icons/fi";
import api from "../services/api";
import MiniChart from "../components/MiniChart";

const money = (value) => `${Number(value || 0).toFixed(3)} USDT`;

function useCountdown(target) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  if (!target) return 0;
  return Math.max(0, Math.ceil((new Date(target).getTime() - now) / 1000));
}

function formatSeconds(seconds) {
  const safe = Math.max(0, Number(seconds || 0));
  const h = Math.floor(safe / 3600);
  const m = Math.floor((safe % 3600) / 60);
  const s = safe % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export default function Tasks() {
  const [dashboard, setDashboard] = useState(null);
  const [selected, setSelected] = useState("");
  const [toast, setToast] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const remainingSeconds = useCountdown(dashboard?.nextAvailableAt);
  const resetSeconds = useCountdown(dashboard?.today?.nextResetAt);

  const question = dashboard?.currentQuestion;
  const hasTaskAccess = dashboard?.levelConfig !== null && dashboard?.levelConfig !== undefined;
  const canAnswer = Boolean(question && !remainingSeconds && !loading && (dashboard?.today?.remaining || 0) > 0);

  const load = async () => {
    setError("");
    try {
      const { data } = await api.get("/tasks/dashboard");
      setDashboard(data);
      setSelected("");
    } catch (err) {
      setError(err.message);
    }
  };

  useEffect(() => { load(); }, []);
  useEffect(() => {
    if (dashboard?.nextAvailableAt && remainingSeconds === 0) load();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [remainingSeconds]);
  useEffect(() => {
    if (dashboard?.today?.nextResetAt && resetSeconds === 0) {
      const id = setTimeout(load, 1200);
      return () => clearTimeout(id);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetSeconds, dashboard?.today?.nextResetAt]);
  useEffect(() => {
    if (!toast) return undefined;
    const id = setTimeout(() => setToast(""), 1800);
    return () => clearTimeout(id);
  }, [toast]);

  const submit = async () => {
    if (!selected || !question) return;
    setLoading(true);
    setError("");
    setToast("");
    try {
      const { data } = await api.post("/tasks/complete", { questionId: question.id, selectedOption: selected });
      setToast(data.message || "Tarea registrada correctamente.");
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const accuracy = Number(dashboard?.accuracy?.weeklyPercent || 0).toFixed(0);
  const rewardPerQuestion = Number(dashboard?.levelConfig?.rewardUsdt || 0);
  const dailyLimit = Number(dashboard?.today?.limit || 0);
  const completedToday = Number(dashboard?.today?.completed || 0);
  const remainingToday = Number(dashboard?.today?.remaining || 0);
  const earnedToday = Number(dashboard?.today?.rewardUsdt || 0);
  const dailyPotential = rewardPerQuestion * dailyLimit;
  const levelName = dashboard?.levelConfig?.name || "Pasantía";
  const levelNumber = dashboard?.activeLevel ?? 0;
  const displayQuestionTitle = question?.chartType ? `Escenario ${question?.asset || "MARKET"}` : question?.title;

  const options = useMemo(() => {
    if (!question) return [];
    return [
      ["A", question.optionA],
      ["B", question.optionB],
      ["C", question.optionC],
    ];
  }, [question]);

  return (
    <div className="page-stack tasks-page-v2">
      {toast && (
        <div className="task-toast-backdrop" role="status" aria-live="polite">
          <div className="task-toast-box">
            <FiCheckCircle />
            <strong>{remainingToday <= 0 ? "Tareas completadas" : toast}</strong>
          </div>
        </div>
      )}

      <section className="tasks-v2-hero tasks-impact-hero">
        <div className="tasks-v2-title">
          <span className="eyebrow">Tareas IA</span>
          <h2>Validación financiera</h2>
          <p>Responde con precisión y contribuye al entrenamiento de nuestra IA financiera.</p>
        </div>
        <img className="tasks-impact-hero-brain" src="/ai-brain-banner.webp" alt="" aria-hidden="true" />
        <div className="tasks-v2-plan">
          <span>Plan actual</span>
          <strong>Nivel {levelNumber} · {levelName}</strong>
          <small>{dailyLimit} tareas disponibles</small>
        </div>
        <div className="reset-chip">
          <FiClock />
          <span>Reset de preguntas en</span>
          <strong>{formatSeconds(resetSeconds)}</strong>
        </div>
      </section>

      {error && <div className="alert error">{error}</div>}

      <section className="task-layout task-layout-v2">
        <article className={`task-panel task-current-card ${(dashboard?.today?.remaining || 0) <= 0 ? "task-current-card-done" : ""}`}>
          {!hasTaskAccess ? (
            <div className="empty-state">
              <img src="/royal-icon.svg" alt="Royal Imperial" />
              <h3>Tareas no disponibles</h3>
              <p>Contacta soporte si no puedes ver tu nivel de pasantía.</p>
            </div>
          ) : (dashboard?.today?.remaining || 0) <= 0 ? (
            <div className="task-complete-mini">
              <FiCheckCircle />
              <div>
                <h3>Tareas completadas</h3>
                <p>Tu avance de hoy quedó registrado.</p>
              </div>
            </div>
          ) : remainingSeconds > 0 ? (
            <div className="validation-state task-wait-state">
              <FiClock />
              <h3>Preparando siguiente tarea</h3>
              <p>Actualizando tu progreso y dejando lista la próxima validación.</p>
              <strong>{formatSeconds(remainingSeconds)}</strong>
              <button className="secondary-btn" type="button" onClick={load}>Actualizar</button>
            </div>
          ) : question ? (
            <>
              <div className="task-question-head">
                <div>
                  <span>{question.categoryLabel}</span>
                  <h3>{displayQuestionTitle}</h3>
                </div>
                <strong>Tarea {completedToday + 1} de {dailyLimit}</strong>
              </div>
              {question.chartType && <MiniChart type={question.chartType} asset={question.asset} level={levelNumber} />}
              <div className="task-question-box">
                <p className="question-text">{question.question}</p>
              </div>
              <div className="answer-grid answer-grid-v2">
                {options.map(([key, value]) => (
                  <button key={key} type="button" className={selected === key ? "selected" : ""} onClick={() => setSelected(key)}>
                    <b>{key}</b><span>{value}</span>
                  </button>
                ))}
              </div>
              <button className="primary-btn full" type="button" disabled={!canAnswer || !selected} onClick={submit}>
                {loading ? "Registrando..." : "Enviar respuesta"}
              </button>
            </>
          ) : (
            <div className="empty-state"><FiRefreshCw /><h3>Cargando tarea</h3><button className="secondary-btn" onClick={load}>Actualizar</button></div>
          )}
        </article>

        <aside className="task-side task-side-v2">
          <div className="panel-card compact-panel task-stat-card">
            <FiTarget />
            <span>Precisión semanal</span>
            <strong>{accuracy}%</strong>
            <small>{dashboard?.accuracy?.status || "Sin datos"}</small>
          </div>
          <div className="panel-card compact-panel task-stat-card">
            <FiZap />
            <span>Tareas de hoy</span>
            <strong>{completedToday}/{dailyLimit}</strong>
            <small>{remainingToday} pendientes</small>
          </div>
          <div className="panel-card compact-panel task-stat-card">
            <FiAward />
            <span>Por pregunta</span>
            <strong>{money(rewardPerQuestion)}</strong>
            <small>Al responder.</small>
          </div>
          <div className="panel-card compact-panel task-stat-card">
            <FiDollarSign />
            <span>Potencial diario</span>
            <strong>{money(dailyPotential)}</strong>
            <small>Hoy: {money(earnedToday)}</small>
          </div>
        </aside>
      </section>

      <section className="panel-card task-history-card">
        <div className="section-title"><span>Historial reciente</span><h3>Últimas 15 respuestas</h3></div>
        <div className="history-list history-list-v2 history-list-compact-v2">
          {(dashboard?.history || []).length === 0 && <p>No hay tareas completadas todavía.</p>}
          {(dashboard?.history || []).slice(0, 15).map((item) => (
            <div key={item.id}>
              <span>{item.asset} · {item.categoryLabel}</span>
              <strong>{item.selectedOption} · {item.isCorrect ? "Correcta" : "Registrada"}</strong>
              <small>{money(item.rewardUsdt)} · {new Date(item.completedAt).toLocaleString()}</small>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
