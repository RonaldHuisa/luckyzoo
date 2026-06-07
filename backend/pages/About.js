import React from "react";
import { useNavigate } from "react-router-dom";
import { FiArrowLeft, FiCpu } from "react-icons/fi";
import { useI18n } from "../i18n/I18nContext";

const PLAN_ROWS = [
  { level: "GreenVest-1", deposit: "5.00 - 150.00", income: "3.00%", validity: "120 días" },
  { level: "GreenVest-2", deposit: "150.00 - 350.00", income: "3.25%", validity: "120 días" },
  { level: "GreenVest-3", deposit: "350.00 - 800.00", income: "3.50%", validity: "120 días" },
  { level: "GreenVest-4", deposit: "800.00 - 1,500.00", income: "3.75%", validity: "120 días" },
  { level: "GreenVest-5", deposit: "1,500.00 - 4,000.00", income: "4.00%", validity: "120 días" },
];

export default function About() {
  const navigate = useNavigate();
  const { t } = useI18n();

  return (
    <div className="page about-greenvest-page">
      <header className="about-greenvest-topbar">
        <button type="button" onClick={() => navigate(-1)}>
          <FiArrowLeft />
        </button>
        <h1>{t("Acerca de")}</h1>
        <span />
      </header>

      <section className="about-greenvest-hero">
        <div className="about-greenvest-logo">
          <FiCpu />
        </div>
        <strong>GreenVest</strong>
        <span>{t("Versión: V1.0")}</span>
      </section>

      <section className="about-greenvest-content">
        <p>
          💰💰 {t("¡La poderosa plataforma global de inversión minera \"GreenVest\", una plataforma global de minería y comercio de IA en 2026!")} 💰💰
        </p>
        <p>
          {t("GreenVest brindará un fuerte respaldo para su valor financiero.")} 💰
        </p>
        <p>
          {t("GreenVest se lanzará globalmente el 15 de mayo de 2026.")}
        </p>

        <ol>
          <li>{t("Todos los montos de inversión son acumulativos y el aumento de la potencia informática puede aumentar las ganancias.")}</li>
          <li>{t("El ciclo de minería dura 120 días.")}</li>
          <li>{t("Tiempo de recolección de minería: puedes recolectarlo dentro de las 24 horas posteriores a encender la máquina minera.")}</li>
        </ol>

        <p>
          {t("Después de que un nuevo usuario deposita dinero por primera vez, puede recibir ganancias mineras 24 horas después.")}
        </p>
        <p>
          {t("Inversión mínima en máquina minera: 5 USDT, monto mínimo de retiro: 1 USDT.")}
        </p>
        <p>
          {t("El plan de inversión está abierto a usuarios individuales en todo el mundo. ¡Los agentes pueden unirse!")}
        </p>
        <p>
          {t("Proyecto a largo plazo, adecuado para que las personas ganen dinero fácilmente en casa.")}
        </p>

        <div className="about-greenvest-income-card">
          <h2>{t("1: Ingresos por invitar a amigos")}</h2>
          <p>{t("Forma un equipo e invita a amigos, puedes obtener Nivel A: 5%, Nivel B: 2% y Nivel C: 1% de comisión.")}</p>
        </div>

        <div className="about-greenvest-income-card">
          <h2>{t("2: Ingresos por inversión minera")}</h2>
          <p>{t("Ingresos mineros de 3% a 5%, y puede extenderse hasta 10% luego de completar la misión de invitar amigos.")}</p>
        </div>
      </section>

      <section className="about-greenvest-table-card">
        <div className="about-table-title">
          <strong>{t("Plan de inversión minera")}</strong>
          <span>{t("Validez de 120 días")}</span>
        </div>

        <div className="about-plan-table" data-no-translate="true">
          <div className="about-plan-head">
            <span>Nivel</span>
            <span>Depósito</span>
            <span>Ingreso</span>
            <span>Validez</span>
          </div>

          {PLAN_ROWS.map((plan) => (
            <div className="about-plan-row" key={plan.level}>
              <span>{plan.level}</span>
              <span>{plan.deposit}</span>
              <span>{plan.income}</span>
              <span>{plan.validity}</span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
